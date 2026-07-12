/**
 * AI feature endpoints (SPEC §6) — v1: natural-language food parsing and the
 * workout Plan Draft. Both are entitlement-gated (`aiSuite`), flag-gated for
 * clients (`canUseAi`), and fully metered through generate().
 */

import { Hono } from "hono";
import { z } from "zod";
import { WorkoutBody } from "@mossa/protocol";
import { resolveUnits } from "@mossa/domain";
import { type AppEnv, requireTenant, isPlatformAdmin } from "./auth-context.js";
import { requireClientAccess } from "./clients.js";
import { tenantEntitlements, getConfig, setConfig } from "./billing-store.js";
import { generate, extractJson } from "./ai.js";
import { buildClientContext } from "./ai-context.js";
import { featureDef } from "./ai-features.js";
import { parseJson } from "./db.js";

const SURFACE_FOCUS: Record<string, string> = {
  home: "Give an overall snapshot and the single most useful nudge for right now.",
  train: "Focus on their training — today's workout, recent PRs, load and momentum.",
  eat: "Focus on their nutrition — calories/protein vs target, meals, and today's intake so far.",
  wellness: "Focus on recovery — sleep, hydration, mood, supplements and check-in consistency.",
};

/** Deterministic dev/mock coach note (no AI binding / ai.mock = on). */
function coachNoteMock(surface: string, name: string): string {
  const first = name.split(" ")[0] || "there";
  return ({
    home: `Solid momentum, ${first} — you're showing up. Knock out today's check-in and you're set.`,
    train: `Your load's trending up nicely, ${first}. Bring the same intent to today's session and chase that next PR.`,
    eat: `Protein's your lever today, ${first} — get a solid hit at your next meal and you'll land right on target.`,
    wellness: `Sleep is trending well, ${first}. Keep the hydration up and stay on your supplements to lock in recovery.`,
  } as Record<string, string>)[surface] ?? `Keep it up, ${first} — consistency is doing the work.`;
}

/** Base64-encode an ArrayBuffer in chunks (avoids arg-count blowups on big images). */
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

const PARSE_FOOD_SYSTEM = `You turn casual food descriptions into structured diary entries.
Reply with ONLY a JSON array. Each item: {"label": string, "mealType": "breakfast"|"lunch"|"dinner"|"snack", "calories": number, "proteinG": number, "carbsG": number, "fatG": number, "quantity": number|null, "unit": string|null}.
Estimate sensible macros for typical portions. No commentary.`;

const LABEL_SYSTEM = `You read a nutrition-facts label from a photo.
Reply with ONLY a JSON object: {"name": string, "brand": string|null, "servingSize": number, "servingUnit": string, "calories": number, "proteinG": number, "carbsG": number, "fatG": number, "fiberG": number, "sugarG": number, "sodiumMg": number, "saturatedFatG": number, "cholesterolMg": number, "potassiumMg": number, "calciumMg": number, "ironMg": number}.
All values are PER SERVING (convert if the panel is per 100g). Grams for macros, mg for sodium/cholesterol/potassium/calcium/iron. Use the product name if visible, else a short descriptive name. No commentary.`;

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

  /**
   * Snap-a-Meal (SPEC §6): a photo (R2 key) → estimated food entries the
   * client confirms. Vision routing (Gemini) lands with the model-catalog
   * expansion; the metered path + mock are here now so the client flow works
   * end-to-end and the credits accounting is real.
   */
  .post("/ai/snap-meal", async (c) => {
    const who = requireTenant(c)!;
    const ent = await tenantEntitlements(c.env.DB, who.tenantId);
    if (!ent.features.aiSuite) return c.json({ error: "aiSuite not in your plan" }, 403);
    const parsed = z.object({ clientId: z.string(), imageKey: z.string().max(300), hint: z.string().max(200).default("") }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    // The image must be a same-tenant R2 object.
    if (!parsed.data.imageKey.startsWith(`t/${who.tenantId}/`)) return c.json({ error: "invalid image" }, 400);
    // Load the photo for the vision model (mock lane ignores it).
    const obj = await c.env.MEDIA.get(parsed.data.imageKey);
    if (!obj) return c.json({ error: "image not found" }, 404);
    const image = { data: toBase64(await obj.arrayBuffer()), mimeType: obj.httpMetadata?.contentType ?? "image/jpeg" };

    const result = await generate(c.env, {
      tenantId: who.tenantId,
      actorUserId: who.userId,
      clientId: access.client.id,
      feature: "snap-meal",
      task: "vision", // Gemini Flash (vision) — real photo → foods + macros
      image,
      system: PARSE_FOOD_SYSTEM,
      prompt: `A photo of a meal${parsed.data.hint ? ` (${parsed.data.hint})` : ""}. Identify the foods and estimate portions + macros as the JSON array.`,
      maxOutputTokens: 512,
      mock: () =>
        JSON.stringify([
          { label: "Grilled chicken breast", mealType: "lunch", calories: 280, proteinG: 52, carbsG: 0, fatG: 6, quantity: 170, unit: "g" },
          { label: "Cooked rice", mealType: "lunch", calories: 260, proteinG: 5, carbsG: 57, fatG: 1, quantity: 200, unit: "g" },
          { label: "Mixed salad", mealType: "lunch", calories: 60, proteinG: 2, carbsG: 8, fatG: 3, quantity: 100, unit: "g" },
        ]),
    });
    if (!result.ok) return result.error === "insufficient_credits" ? c.json({ error: "insufficient_credits" }, 402) : c.json({ error: "ai unavailable" }, 503);
    const entries = extractJson<unknown[]>(result.output);
    if (!entries || !Array.isArray(entries)) return c.json({ error: "could not read the photo" }, 422);
    return c.json({ entries, credits: result.credits, mocked: result.mocked });
  })

  /**
   * Label Reader (SPEC §6): photo of a nutrition-facts panel → per-serving
   * macros → a Food shape the caller confirms + saves. The barcode-miss
   * fallback. Not client-scoped (staff also use it to build the library).
   */
  .post("/ai/label-reader", async (c) => {
    const who = requireTenant(c)!;
    const ent = await tenantEntitlements(c.env.DB, who.tenantId);
    if (!ent.features.aiSuite) return c.json({ error: "aiSuite not in your plan" }, 403);
    const parsed = z.object({ imageKey: z.string().max(300) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    if (!parsed.data.imageKey.startsWith(`t/${who.tenantId}/`)) return c.json({ error: "invalid image" }, 400);
    const obj = await c.env.MEDIA.get(parsed.data.imageKey);
    if (!obj) return c.json({ error: "image not found" }, 404);
    const image = { data: toBase64(await obj.arrayBuffer()), mimeType: obj.httpMetadata?.contentType ?? "image/jpeg" };

    const result = await generate(c.env, {
      tenantId: who.tenantId,
      actorUserId: who.userId,
      feature: "label-reader",
      task: "vision",
      image,
      system: LABEL_SYSTEM,
      prompt: "Read this nutrition-facts label. Return the single JSON food object, values per serving.",
      maxOutputTokens: 400,
      mock: () => JSON.stringify({ name: "Granola bar", brand: "Acme", servingSize: 40, servingUnit: "g", calories: 180, proteinG: 4, carbsG: 27, fatG: 6, fiberG: 3, sugarG: 12, sodiumMg: 95, saturatedFatG: 2, cholesterolMg: 0, potassiumMg: 90, calciumMg: 20, ironMg: 1 }),
    });
    if (!result.ok) return result.error === "insufficient_credits" ? c.json({ error: "insufficient_credits" }, 402) : c.json({ error: "ai unavailable" }, 503);
    const food = extractJson<Record<string, unknown>>(result.output);
    if (!food || typeof food !== "object" || typeof food.name !== "string") return c.json({ error: "could not read the label" }, 422);
    return c.json({ food, credits: result.credits, mocked: result.mocked });
  })

  /** Meal Plan Draft: targets + preferences → meal options (trainer). */
  .post("/ai/draft-meal", async (c) => {
    const who = requireTenant(c)!;
    const role = c.get("role");
    if (role !== "owner" && role !== "trainer") return c.json({ error: "forbidden" }, 403);
    const ent = await tenantEntitlements(c.env.DB, who.tenantId);
    if (!ent.features.aiSuite) return c.json({ error: "aiSuite not in your plan" }, 403);
    const parsed = z.object({ clientId: z.string(), instructions: z.string().max(2000).default("") }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const goal = await c.env.DB.prepare("SELECT targets_json FROM client_goals WHERE client_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").bind(access.client.id).first<{ targets_json: string | null }>();
    const targets = parseJson<Record<string, number>>(goal?.targets_json, {});
    const intake = parseJson<Record<string, unknown>>(access.client.intake_json, {});

    const result = await generate(c.env, {
      tenantId: who.tenantId,
      actorUserId: who.userId,
      clientId: access.client.id,
      feature: "draft-meal",
      task: "text",
      system: `You are a nutrition coach drafting a day of meal options. Reply with ONLY JSON: {"mealOptions":[{"mealType":"breakfast"|"lunch"|"dinner"|"snack","mealName":string,"isFree":false,"foods":[]}]}. Honor the calorie/macro targets and dietary approach. Foods arrays may be empty (the coach fills exact items) — focus on meal names + types that hit the targets. No commentary.`,
      prompt: `TARGETS: ${JSON.stringify(targets)}\nINTAKE: ${JSON.stringify(intake)}\n${parsed.data.instructions}`,
      maxOutputTokens: 1536,
      mock: () => JSON.stringify({ mealOptions: [{ mealType: "breakfast", mealName: "Oats, whey & berries", isFree: false, foods: [] }, { mealType: "lunch", mealName: "Chicken, rice & greens", isFree: false, foods: [] }, { mealType: "dinner", mealName: "Salmon, potato & salad", isFree: false, foods: [] }] }),
    });
    if (!result.ok) return result.error === "insufficient_credits" ? c.json({ error: "insufficient_credits" }, 402) : c.json({ error: "ai unavailable" }, 503);
    const draft = extractJson<{ mealOptions: unknown[] }>(result.output);
    if (!draft?.mealOptions) return c.json({ error: "could not parse" }, 422);
    return c.json({ draft: { customMealTypes: [], ...draft }, credits: result.credits, mocked: result.mocked });
  })

  /** Check-in Summarizer: recent check-ins → digest + suggested reply (trainer). */
  .post("/ai/summarize-checkins", async (c) => {
    const who = requireTenant(c)!;
    const role = c.get("role");
    if (role !== "owner" && role !== "trainer") return c.json({ error: "forbidden" }, 403);
    const ent = await tenantEntitlements(c.env.DB, who.tenantId);
    if (!ent.features.aiSuite) return c.json({ error: "aiSuite not in your plan" }, 403);
    const parsed = z.object({ clientId: z.string() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const rows = await c.env.DB.prepare("SELECT date_local, weight_kg, mood, energy, stress, sleep_hours, notes FROM check_ins WHERE client_id = ? ORDER BY date_local DESC LIMIT 14").bind(access.client.id).all();
    if ((rows.results ?? []).length === 0) return c.json({ error: "no check-ins yet" }, 404);

    const result = await generate(c.env, {
      tenantId: who.tenantId,
      actorUserId: who.userId,
      clientId: access.client.id,
      feature: "summarize-checkins",
      task: "text-small",
      system: `You are a coaching assistant. Summarize a client's recent check-ins for their trainer in 2-3 sentences: adherence, trends, and any red flags. Then draft a short, warm 1-2 sentence reply to the client. Reply as JSON: {"summary":string,"suggestedReply":string}. No medical advice.`,
      prompt: JSON.stringify(rows.results),
      maxOutputTokens: 400,
      mock: () => JSON.stringify({ summary: `${access.client.display_name} checked in ${(rows.results ?? []).length} times recently. Mood and sleep look steady; weight trending as expected.`, suggestedReply: "Great consistency this week — keep the sleep dialed in and let's push the next session." }),
    });
    if (!result.ok) return result.error === "insufficient_credits" ? c.json({ error: "insufficient_credits" }, 402) : c.json({ error: "ai unavailable" }, 503);
    const out = extractJson<{ summary: string; suggestedReply: string }>(result.output);
    if (!out) return c.json({ error: "could not parse" }, 422);
    return c.json({ ...out, credits: result.credits, mocked: result.mocked });
  })

  /** Progress Narrative: aggregates → readable recap (client or trainer). */
  .post("/ai/narrative", async (c) => {
    const who = requireTenant(c)!;
    const ent = await tenantEntitlements(c.env.DB, who.tenantId);
    if (!ent.features.aiSuite) return c.json({ error: "aiSuite not in your plan" }, 403);
    const parsed = z.object({ clientId: z.string(), stats: z.record(z.string(), z.unknown()) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const result = await generate(c.env, {
      tenantId: who.tenantId,
      actorUserId: who.userId,
      clientId: access.client.id,
      feature: "narrative",
      task: "text-small",
      system: `Turn these fitness stats into a warm, motivating 3-4 sentence recap for the client. Concrete, honest, encouraging. Plain text only.`,
      prompt: JSON.stringify(parsed.data.stats),
      maxOutputTokens: 300,
      mock: () => `You've been remarkably consistent this month. Your logging streak and steady weight trend show the habits are sticking — that's the hard part. Keep the momentum, and let's build on this next phase.`,
    });
    if (!result.ok) return result.error === "insufficient_credits" ? c.json({ error: "insufficient_credits" }, 402) : c.json({ error: "ai unavailable" }, 503);
    return c.json({ narrative: result.output.trim(), credits: result.credits, mocked: result.mocked });
  })

  /**
   * Personalized coach note (SPEC §6) — a short, deeply-personal message for
   * the client's home / train / eat / wellness screen. Built from the client's
   * FULL context; content-hashed + cached 1h in KV, so it's regenerated the
   * moment anything material changes and free on repeat loads within the hour.
   */
  .get("/ai/coach-note", async (c) => {
    const who = requireTenant(c)!;
    const ent = await tenantEntitlements(c.env.DB, who.tenantId);
    if (!ent.features.aiSuite) return c.json({ message: null });
    const parsed = z
      .object({ clientId: z.string(), surface: z.enum(["home", "train", "eat", "wellness"]).default("home"), today: z.string().optional(), hour: z.coerce.number().int().min(0).max(23).optional() })
      .safeParse({ clientId: c.req.query("clientId"), surface: c.req.query("surface"), today: c.req.query("today"), hour: c.req.query("hour") });
    if (!parsed.success) return c.json({ error: "invalid query" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const surface = parsed.data.surface;
    const today = parsed.data.today ?? new Date().toISOString().slice(0, 10);
    const hour = parsed.data.hour ?? 12;

    const prefRow = await c.env.DB.prepare("SELECT units_json FROM user_prefs WHERE user_id = ?").bind(c.get("user")!.id).first<{ units_json: string | null }>();
    const units = resolveUnits(parseJson(prefRow?.units_json ?? null, null));
    const ctx = await buildClientContext(c.env, access.client, { today, hour, units });

    // Content-hash cache: material change → new key → fresh; else 1h reuse.
    const cacheKey = `ai:note:v1:${access.client.id}:${surface}:${ctx.signalHash}`;
    const hit = await c.env.CACHE.get(cacheKey, "json").catch(() => null);
    if (hit && typeof (hit as { message?: string }).message === "string") return c.json({ message: (hit as { message: string }).message, cached: true });

    const result = await generate(c.env, {
      tenantId: who.tenantId,
      actorUserId: c.get("user")!.id,
      clientId: access.client.id,
      feature: "coach-note",
      task: "text-small",
      system: featureDef("coach-note")!.defaultSystem,
      prompt: `${ctx.text}\n\nSCREEN: ${surface}. ${SURFACE_FOCUS[surface]}\nWrite the note now — 1-2 sentences, speak directly to them.`,
      maxOutputTokens: 160,
      mock: () => coachNoteMock(surface, access.client.display_name),
    });
    if (!result.ok) return c.json({ message: null });
    const message = result.output.trim().replace(/^["']|["']$/g, "").slice(0, 400);
    await c.env.CACHE.put(cacheKey, JSON.stringify({ message }), { expirationTtl: 3600 }).catch(() => undefined);
    return c.json({ message, cached: false, mocked: result.mocked });
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

// ── Platform admin: AI provider config (Gemini key + mock mode) ──────────────
export const aiAdminRoutes = new Hono<AppEnv>()
  .get("/admin/ai/config", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const cfg = await getConfig(c.env.DB);
    // Never echo the key — only whether it's set.
    return c.json({ geminiKeySet: !!cfg["google.gemini_key"], mockMode: cfg["ai.mock"] ?? "auto" });
  })
  .post("/admin/ai/config", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const d = z
      .object({ geminiKey: z.string().min(1).optional(), mockMode: z.enum(["auto", "on", "off"]).optional() })
      .safeParse(await c.req.json().catch(() => null));
    if (!d.success) return c.json({ error: "invalid body" }, 400);
    if (d.data.geminiKey) await setConfig(c.env.DB, "google.gemini_key", d.data.geminiKey.trim());
    if (d.data.mockMode) await setConfig(c.env.DB, "ai.mock", d.data.mockMode);
    return c.json({ ok: true });
  });
