/**
 * AI feature endpoints (SPEC §6) — v1: natural-language food parsing and the
 * workout Plan Draft. Both are entitlement-gated (`aiSuite`), flag-gated for
 * clients (`canUseAi`), and fully metered through generate().
 */

import { Hono } from "hono";
import { z } from "zod";
import { WorkoutBody } from "@mossa/protocol";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { requireClientAccess } from "./clients.js";
import { tenantEntitlements } from "./billing-store.js";
import { generate, extractJson } from "./ai.js";
import { parseJson } from "./db.js";

const PARSE_FOOD_SYSTEM = `You turn casual food descriptions into structured diary entries.
Reply with ONLY a JSON array. Each item: {"label": string, "mealType": "breakfast"|"lunch"|"dinner"|"snack", "calories": number, "proteinG": number, "carbsG": number, "fatG": number, "quantity": number|null, "unit": string|null}.
Estimate sensible macros for typical portions. No commentary.`;

const DRAFT_PLAN_SYSTEM = `You are a certified strength coach drafting a workout plan.
Reply with ONLY JSON matching: {"days": [{"name": string, "isRestDay": boolean, "blocks": [{"type": "single"|"superset"|"circuit"|"hiit", "rounds": number|null, "slots": [{"exerciseId": string, "measurementMode": "reps"|"time", "sets": [{"setType": "warmup"|"working", "reps": number|null, "weightMode": "unspecified"|"bodyweight", "restAfterSec": number}]}]}]}]}.
Use ONLY exercise ids from the provided library list. 3-6 sets per exercise, sensible rest. Respect injuries, equipment, experience, and available days. No commentary.`;

export const aiRoutes = new Hono<AppEnv>()
  /** "2 eggs, toast and an apple" → structured entries (client confirms). */
  .post("/ai/parse-food", async (c) => {
    const who = requireTenant(c)!;
    const ent = await tenantEntitlements(c.env.DB, who.tenantId);
    if (!ent.features.aiSuite) return c.json({ error: "aiSuite not in your plan" }, 403);
    const parsed = z
      .object({ clientId: z.string(), text: z.string().min(2).max(500) })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;

    const result = await generate(c.env, {
      tenantId: who.tenantId,
      actorUserId: who.userId,
      clientId: access.client.id,
      feature: "parse-food",
      task: "text-small",
      system: PARSE_FOOD_SYSTEM,
      prompt: parsed.data.text,
      maxOutputTokens: 512,
      mock: () =>
        JSON.stringify([
          { label: parsed.data.text.slice(0, 60), mealType: "snack", calories: 350, proteinG: 18, carbsG: 40, fatG: 12, quantity: null, unit: null },
        ]),
    });
    if (!result.ok) {
      return result.error === "insufficient_credits"
        ? c.json({ error: "insufficient_credits", available: result.available, needed: result.needed }, 402)
        : c.json({ error: "ai unavailable" }, 503);
    }
    const entries = extractJson<unknown[]>(result.output);
    if (!entries || !Array.isArray(entries)) return c.json({ error: "could not parse" }, 422);
    return c.json({ entries, credits: result.credits, mocked: result.mocked });
  })

  /** Plan Draft: intake + library → an editable WorkoutBody draft. */
  .post("/ai/draft-plan", async (c) => {
    const who = requireTenant(c)!;
    const role = c.get("role");
    if (role !== "owner" && role !== "trainer") return c.json({ error: "forbidden" }, 403);
    const ent = await tenantEntitlements(c.env.DB, who.tenantId);
    if (!ent.features.aiSuite) return c.json({ error: "aiSuite not in your plan" }, 403);
    const parsed = z
      .object({ clientId: z.string(), instructions: z.string().max(2000).default("") })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;

    // Ground the model in the real library + the client's intake.
    const { seedExercises } = await import("./exercise-seed.js");
    await seedExercises(c.env.DB);
    const library = await c.env.DB.prepare(
      "SELECT id, name, muscle_groups, equipment FROM exercises WHERE active = 1 AND (tenant_id IS NULL OR tenant_id = ?) LIMIT 120",
    )
      .bind(who.tenantId)
      .all<{ id: string; name: string; muscle_groups: string | null; equipment: string | null }>();
    const intake = parseJson<Record<string, unknown>>(access.client.intake_json, {});
    const prompt = [
      `CLIENT: ${access.client.display_name}; gender=${access.client.gender ?? "?"}; intake=${JSON.stringify(intake)}`,
      `EXERCISE LIBRARY (id: name [muscles] {equipment}):`,
      ...(library.results ?? []).map(
        (e) => `${e.id}: ${e.name} [${e.muscle_groups ?? ""}] {${e.equipment ?? ""}}`,
      ),
      parsed.data.instructions && `COACH INSTRUCTIONS: ${parsed.data.instructions}`,
    ]
      .filter(Boolean)
      .join("\n");

    const firstExercise = library.results?.[0]?.id ?? "exr_none";
    const result = await generate(c.env, {
      tenantId: who.tenantId,
      actorUserId: who.userId,
      clientId: access.client.id,
      feature: "draft-plan",
      task: "text",
      system: DRAFT_PLAN_SYSTEM,
      prompt,
      maxOutputTokens: 3072,
      mock: () =>
        JSON.stringify({
          days: [
            {
              name: "Full Body A",
              isRestDay: false,
              blocks: [
                {
                  type: "single",
                  rounds: null,
                  slots: [
                    {
                      exerciseId: firstExercise,
                      measurementMode: "reps",
                      sets: [
                        { setType: "warmup", reps: 10, weightMode: "unspecified", restAfterSec: 60 },
                        { setType: "working", reps: 8, weightMode: "unspecified", restAfterSec: 90 },
                        { setType: "working", reps: 8, weightMode: "unspecified", restAfterSec: 90 },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        }),
    });
    if (!result.ok) {
      return result.error === "insufficient_credits"
        ? c.json({ error: "insufficient_credits", available: result.available, needed: result.needed }, 402)
        : c.json({ error: "ai unavailable" }, 503);
    }
    const raw = extractJson<unknown>(result.output);
    const body = WorkoutBody.safeParse(raw);
    if (!body.success) return c.json({ error: "draft did not validate", raw }, 422);
    // Drafts must only reference real exercises — drop hallucinated slots.
    const validIds = new Set((library.results ?? []).map((e) => e.id));
    const cleaned = {
      days: body.data.days.map((d) => ({
        ...d,
        blocks: d.blocks
          .map((b) => ({ ...b, slots: b.slots.filter((s) => validIds.has(s.exerciseId)) }))
          .filter((b) => b.slots.length > 0),
      })),
    };
    return c.json({ draft: cleaned, credits: result.credits, mocked: result.mocked });
  })

  /** Insight feedback (SPEC §8.11) — the 👍/👎 eval signal. */
  .post("/ai/feedback", async (c) => {
    const who = requireTenant(c)!;
    const parsed = z
      .object({ insightType: z.string().max(60), insightRef: z.string().max(120).nullish(), vote: z.union([z.literal(1), z.literal(-1)]) })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    await c.env.DB.prepare(
      "INSERT INTO insight_feedback (id, tenant_id, user_id, insight_type, insight_ref, vote, at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(`ifb_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, who.tenantId, who.userId, parsed.data.insightType, parsed.data.insightRef ?? null, parsed.data.vote, Date.now())
      .run();
    return c.json({ ok: true });
  });
