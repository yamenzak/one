/**
 * AI feature endpoints (SPEC §6) — v1: natural-language food parsing and the
 * workout Plan Draft. Both are entitlement-gated (`aiSuite`), flag-gated for
 * clients (`canUseAi`), and fully metered through generate().
 */

import { Hono, type Context } from "hono";
import { z } from "zod";
import { WorkoutBody, MUSCLE_GROUPS, EQUIPMENT_TYPES, normalizeMuscle, normalizeEquipment } from "@mossa/protocol";
import { resolveUnits } from "@mossa/domain";
import { type AppEnv, requireTenant, isPlatformAdmin } from "./auth-context.js";
import { requireClientAccess } from "./clients.js";
import { tenantEntitlements, getConfig, setConfig } from "./billing-store.js";
import { generate, generateImage, extractJson, listModels } from "./ai.js";
import { buildClientContext } from "./ai-context.js";
import { featureDef } from "./ai-features.js";
import { parseWorkersAiPricing, parseGeminiPricing } from "./ai-pricing.js";
import { tenantIntegrations, type Integrations } from "./integrations.js";
import { resolveFoodId, resolveExerciseId, type ResolveEnv } from "./library-resolve.js";
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

/** The built-in system prompt for a feature (the tenant may override it). */
const sys = (key: string): string => featureDef(key)!.defaultSystem;

/** Surface AI failures with the real reason (so they can be diagnosed) instead
 *  of a generic message. insufficient_credits → 402; everything else → 503 with
 *  the underlying provider/parse detail. */
function aiFail(c: Context<AppEnv>, r: { error: string; detail?: string; available?: number; needed?: number }) {
  if (r.error === "insufficient_credits") return c.json({ error: "Not enough AI credits to run this.", available: r.available, needed: r.needed }, 402);
  return c.json({ error: r.detail ? `AI failed — ${r.detail}` : "AI unavailable.", detail: r.detail }, 503);
}

interface DraftFoodQuery { query?: string; quantity?: number; unit?: string; calories?: number; proteinG?: number; carbsG?: number; fatG?: number }
interface DraftMealOption { mealType: string; mealName: string; isFree?: boolean; foods?: DraftFoodQuery[] }
interface ResolvedMealFood { foodId: string; quantity: number; unit: string }

// Loose shapes for the model's workout draft (exercises named, not id'd).
interface RawSlot { exercise?: string; exerciseName?: string; name?: string; measurementMode?: string; slotNotes?: string | null; sets?: unknown[] }
interface RawBlock { type?: string; rounds?: number | null; restBetweenExercisesSec?: number | null; restBetweenRoundsSec?: number | null; blockNotes?: string | null; slots?: RawSlot[] }
interface RawDay { name?: string; dayNotes?: string | null; isRestDay?: boolean; blocks?: RawBlock[] }

/** Turn the model's food queries into real library food ids: our library →
 *  integrated web providers (imported with photo) → a custom row from the
 *  model's macro estimate. Only truly unresolvable foods drop. */
async function resolveMealFoods(env: ResolveEnv, tenantId: string, userId: string, cfg: Integrations, allowExternal: boolean, options: DraftMealOption[]): Promise<(DraftMealOption & { foods: ResolvedMealFood[] })[]> {
  const cache = new Map<string, string | null>();
  const out: (DraftMealOption & { foods: ResolvedMealFood[] })[] = [];
  for (const opt of options) {
    if (!opt?.mealType || !opt?.mealName) continue;
    const foods: ResolvedMealFood[] = [];
    for (const f of (opt.foods ?? []).slice(0, 5)) {
      const q = String(f?.query ?? "").trim();
      if (!q) continue;
      const qty = Number(f.quantity) > 0 ? Number(f.quantity) : 100;
      const unit = (f.unit || "g").slice(0, 20);
      const estimate = Number(f.calories) > 0
        ? { calories: Number(f.calories), proteinG: Number(f.proteinG) || 0, carbsG: Number(f.carbsG) || 0, fatG: Number(f.fatG) || 0, servingSize: qty, servingUnit: unit }
        : null;
      const id = await resolveFoodId(env, tenantId, userId, q, cfg, allowExternal, estimate, cache);
      if (id) foods.push({ foodId: id, quantity: qty, unit });
    }
    out.push({ mealType: opt.mealType, mealName: opt.mealName, isFree: !!opt.isFree, foods });
  }
  return out;
}

/** Compact style reference from a studio's recent published meal plans. */
async function mealPlanExamples(db: D1Database, tenantId: string): Promise<string> {
  const rows = await db.prepare("SELECT name, body_json FROM meal_plans WHERE tenant_id = ? AND status = 'published' ORDER BY published_at DESC LIMIT 2").bind(tenantId).all<{ name: string; body_json: string | null }>();
  const lines = (rows.results ?? []).map((p) => {
    const opts = parseJson<{ mealOptions?: { mealType: string; mealName: string }[] }>(p.body_json, {}).mealOptions ?? [];
    const meals = opts.slice(0, 8).map((o) => `${o.mealType}: ${o.mealName}`).join("; ");
    return meals ? `- "${p.name}": ${meals}` : null;
  }).filter(Boolean);
  return lines.length ? `STYLE EXAMPLES (match this coach's approach):\n${lines.join("\n")}` : "";
}

/** Compact style reference from a studio's recent published workout plans,
 *  exercise ids resolved to names via the provided library map. */
async function workoutPlanExamples(db: D1Database, tenantId: string, nameOf: Map<string, string>): Promise<string> {
  const rows = await db.prepare("SELECT name, body_json FROM workout_plans WHERE tenant_id = ? AND status = 'published' ORDER BY published_at DESC LIMIT 2").bind(tenantId).all<{ name: string; body_json: string | null }>();
  const lines = (rows.results ?? []).map((p) => {
    const days = parseJson<{ days?: { name?: string; isRestDay?: boolean; blocks?: { slots?: { exerciseId: string }[] }[] }[] }>(p.body_json, {}).days ?? [];
    const daySummaries = days.filter((d) => !d.isRestDay).slice(0, 6).map((d) => {
      const names = (d.blocks ?? []).flatMap((b) => (b.slots ?? []).map((s) => nameOf.get(s.exerciseId))).filter(Boolean).slice(0, 6);
      return `${d.name || "Day"} (${names.join(", ")})`;
    });
    return daySummaries.length ? `- "${p.name}": ${daySummaries.join(" | ")}` : null;
  }).filter(Boolean);
  return lines.length ? `STYLE EXAMPLES (match this coach's split, selection and volume):\n${lines.join("\n")}` : "";
}

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
      expectsJson: true,
      system: sys("parse-food"),
      prompt: parsed.data.text,
      maxOutputTokens: 512,
      mock: () =>
        JSON.stringify([
          { label: parsed.data.text.slice(0, 60), mealType: "snack", calories: 350, proteinG: 18, carbsG: 40, fatG: 12, quantity: null, unit: null },
        ]),
    });
    if (!result.ok) return aiFail(c, result);
    const entries = extractJson<unknown[]>(result.output);
    if (!entries || !Array.isArray(entries)) return c.json({ error: "The AI didn't return valid entries.", raw: result.output.slice(0, 1500), mocked: result.mocked }, 422);
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
    const nameOf = new Map((library.results ?? []).map((e) => [e.id, e.name]));
    // Few-shot: this studio's recent published plans as a style reference.
    const examples = await workoutPlanExamples(c.env.DB, who.tenantId, nameOf);
    const prompt = [
      `CLIENT: ${access.client.display_name}; gender=${access.client.gender ?? "?"}; intake=${JSON.stringify(intake)}`,
      `EXERCISE LIBRARY (id: name [muscles] {equipment}):`,
      ...(library.results ?? []).map(
        (e) => `${e.id}: ${e.name} [${e.muscle_groups ?? ""}] {${e.equipment ?? ""}}`,
      ),
      examples,
      parsed.data.instructions && `COACH INSTRUCTIONS: ${parsed.data.instructions}`,
    ]
      .filter(Boolean)
      .join("\n");

    const result = await generate(c.env, {
      tenantId: who.tenantId,
      actorUserId: who.userId,
      clientId: access.client.id,
      feature: "draft-plan",
      task: "text",
      expectsJson: true,
      system: sys("draft-plan"),
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
                      exercise: library.results?.[0]?.name ?? "Barbell Back Squat",
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
    if (!result.ok) return aiFail(c, result);
    const raw = extractJson<{ days?: RawDay[] }>(result.output);
    if (!raw || !Array.isArray(raw.days)) return c.json({
      error: "The AI didn't return a valid plan.",
      detail: raw == null ? "no JSON found in the model's response" : "expected a top-level \"days\" array",
      raw: result.output.slice(0, 2500),
      mocked: result.mocked,
    }, 422);
    // Resolve each named exercise to a real id: our library → integrated web
    // providers (imported WITH its photo/gif) → a custom row. Only truly empty
    // slots drop; nothing is silently discarded for lacking a library match.
    const appCfg = await getConfig(c.env.DB);
    const allowExternal = ent.features.externalSearch && appCfg["ai.mock"] !== "on";
    const cfg = await tenantIntegrations(c.env.DB, who.tenantId);
    const cache = new Map<string, string | null>();
    const days: unknown[] = [];
    for (const d of raw.days) {
      const blocks: unknown[] = [];
      for (const b of d.blocks ?? []) {
        const slots: unknown[] = [];
        for (const s of b.slots ?? []) {
          const name = String(s.exercise ?? s.exerciseName ?? s.name ?? "").trim();
          if (!name) continue;
          const id = await resolveExerciseId(c.env as ResolveEnv, who.tenantId, who.userId, name, cfg, allowExternal, cache);
          if (id) slots.push({ exerciseId: id, measurementMode: s.measurementMode ?? "reps", slotNotes: s.slotNotes ?? null, sets: Array.isArray(s.sets) ? s.sets : [] });
        }
        if (slots.length) blocks.push({ type: b.type ?? "single", rounds: b.rounds ?? null, restBetweenExercisesSec: b.restBetweenExercisesSec ?? null, restBetweenRoundsSec: b.restBetweenRoundsSec ?? null, blockNotes: b.blockNotes ?? null, slots });
      }
      days.push({ name: d.name ?? "", dayNotes: d.dayNotes ?? null, isRestDay: !!d.isRestDay, blocks });
    }
    const body = WorkoutBody.safeParse({ days });
    if (!body.success) return c.json({
      error: "The AI didn't return a valid plan.",
      detail: body.error.issues.slice(0, 4).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "),
      raw: result.output.slice(0, 2500),
      mocked: result.mocked,
    }, 422);
    const totalSlots = body.data.days.reduce((n, d) => n + d.blocks.reduce((m, b) => m + b.slots.length, 0), 0);
    if (totalSlots === 0) return c.json({
      error: "The AI plan came back empty.",
      detail: `parsed ${body.data.days.length} day(s) but no exercises resolved`,
      raw: result.output.slice(0, 2500),
      mocked: result.mocked,
    }, 422);
    return c.json({ draft: body.data, credits: result.credits, mocked: result.mocked });
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
      expectsJson: true,
      system: sys("snap-meal"),
      prompt: `A photo of a meal${parsed.data.hint ? ` (${parsed.data.hint})` : ""}. Identify the foods, estimate portions + macros, and give one short assessment as the JSON object.`,
      maxOutputTokens: 1024,
      mock: () =>
        JSON.stringify({
          items: [
            { label: "Grilled chicken breast", mealType: "lunch", calories: 280, proteinG: 52, carbsG: 0, fatG: 6, quantity: 170, unit: "g" },
            { label: "Cooked rice", mealType: "lunch", calories: 260, proteinG: 5, carbsG: 57, fatG: 1, quantity: 200, unit: "g" },
            { label: "Mixed salad", mealType: "lunch", calories: 60, proteinG: 2, carbsG: 8, fatG: 3, quantity: 100, unit: "g" },
          ],
          note: "Well-balanced plate with excellent lean protein — add a little olive oil to the salad for satiety.",
        }),
    });
    if (!result.ok) return aiFail(c, result);
    // The model returns {items, note}; tolerate a bare array from older prompts.
    const raw = extractJson<{ items?: unknown[]; note?: unknown } | unknown[]>(result.output);
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : null;
    if (!list) return c.json({ error: "Couldn't read the photo.", raw: result.output.slice(0, 1500), mocked: result.mocked }, 422);
    // Coerce every macro to a finite number — models sometimes omit a field,
    // stringify it ("52g"), or use an alternate key; anything else became NaN.
    const numOf = (...vs: unknown[]) => { for (const v of vs) { const n = typeof v === "string" ? parseFloat(v) : Number(v); if (Number.isFinite(n)) return n; } return 0; };
    const entries = list
      .map((it) => {
        const o = (it ?? {}) as Record<string, unknown>;
        const qty = numOf(o.quantity, o.grams, o.amount);
        return {
          label: String(o.label ?? o.name ?? "Food").slice(0, 120),
          mealType: typeof o.mealType === "string" ? o.mealType : undefined,
          calories: Math.round(numOf(o.calories, o.kcal, o.cal)),
          proteinG: Math.round(numOf(o.proteinG, o.protein, o.protein_g)),
          carbsG: Math.round(numOf(o.carbsG, o.carbs, o.carbs_g)),
          fatG: Math.round(numOf(o.fatG, o.fat, o.fat_g)),
          quantity: qty > 0 ? qty : null,
          unit: typeof o.unit === "string" ? o.unit : null,
        };
      })
      .filter((e) => e.label && (e.calories > 0 || e.proteinG > 0 || e.carbsG > 0 || e.fatG > 0));
    if (!entries.length) return c.json({ error: "Couldn't read the photo.", raw: result.output.slice(0, 1500), mocked: result.mocked }, 422);
    const note = !Array.isArray(raw) && typeof raw?.note === "string" ? raw.note : null;
    return c.json({ entries, note, credits: result.credits, mocked: result.mocked });
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
      expectsJson: true,
      system: sys("label-reader"),
      prompt: "Read this nutrition-facts label. Return the single JSON food object, values per serving.",
      maxOutputTokens: 400,
      mock: () => JSON.stringify({ name: "Granola bar", brand: "Acme", servingSize: 40, servingUnit: "g", calories: 180, proteinG: 4, carbsG: 27, fatG: 6, fiberG: 3, sugarG: 12, sodiumMg: 95, saturatedFatG: 2, cholesterolMg: 0, potassiumMg: 90, calciumMg: 20, ironMg: 1 }),
    });
    if (!result.ok) return aiFail(c, result);
    const parsedFood = extractJson<Record<string, unknown>>(result.output);
    if (!parsedFood || typeof parsedFood !== "object" || typeof parsedFood.name !== "string") return c.json({ error: "Couldn't read the label.", raw: result.output.slice(0, 1500), mocked: result.mocked }, 422);
    // Coerce numeric fields so the editor never shows NaN (models stringify or
    // omit values). Keep name/brand/unit as text; numbers become finite or 0.
    const numField = (v: unknown): number => { const n = typeof v === "string" ? parseFloat(v) : Number(v); return Number.isFinite(n) ? n : 0; };
    const NUMERIC = ["servingSize", "calories", "proteinG", "carbsG", "fatG", "fiberG", "sugarG", "sodiumMg", "saturatedFatG", "cholesterolMg", "potassiumMg", "calciumMg", "ironMg"];
    const food: Record<string, unknown> = { ...parsedFood };
    for (const k of NUMERIC) if (k in food) food[k] = numField(food[k]);
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
    // Few-shot: this studio's recent published meal plans as a style reference.
    const examples = await mealPlanExamples(c.env.DB, who.tenantId);

    const result = await generate(c.env, {
      tenantId: who.tenantId,
      actorUserId: who.userId,
      clientId: access.client.id,
      feature: "draft-meal",
      task: "text",
      expectsJson: true,
      system: sys("draft-meal"),
      prompt: [`TARGETS: ${JSON.stringify(targets)}`, `INTAKE: ${JSON.stringify(intake)}`, examples, parsed.data.instructions].filter(Boolean).join("\n"),
      maxOutputTokens: 1536,
      mock: () => JSON.stringify({ mealOptions: [
        { mealType: "breakfast", mealName: "Oats, whey & berries", isFree: false, foods: [{ query: "rolled oats", quantity: 80, unit: "g", calories: 304, proteinG: 11, carbsG: 54, fatG: 6 }, { query: "whey protein", quantity: 30, unit: "g", calories: 120, proteinG: 24, carbsG: 3, fatG: 2 }, { query: "blueberries", quantity: 100, unit: "g", calories: 57, proteinG: 1, carbsG: 14, fatG: 0 }] },
        { mealType: "lunch", mealName: "Chicken, rice & greens", isFree: false, foods: [{ query: "chicken breast", quantity: 180, unit: "g", calories: 297, proteinG: 56, carbsG: 0, fatG: 6 }, { query: "white rice", quantity: 150, unit: "g", calories: 195, proteinG: 4, carbsG: 42, fatG: 0 }, { query: "broccoli", quantity: 100, unit: "g", calories: 34, proteinG: 3, carbsG: 7, fatG: 0 }] },
        { mealType: "dinner", mealName: "Salmon, potato & salad", isFree: false, foods: [{ query: "salmon", quantity: 170, unit: "g", calories: 354, proteinG: 34, carbsG: 0, fatG: 23 }, { query: "potato", quantity: 200, unit: "g", calories: 154, proteinG: 4, carbsG: 35, fatG: 0 }] },
      ] }),
    });
    if (!result.ok) return aiFail(c, result);
    const draft = extractJson<{ mealOptions: DraftMealOption[] }>(result.output);
    if (!draft?.mealOptions) return c.json({ error: "The AI didn't return valid meals.", raw: result.output.slice(0, 1800), mocked: result.mocked }, 422);
    // Resolve each drafted food query to a real library food id: our library →
    // integrated web providers (imported with photo) → a custom row from the
    // model's estimate — so every option carries real, editable macros.
    const appCfg = await getConfig(c.env.DB);
    const allowExternal = ent.features.externalSearch && appCfg["ai.mock"] !== "on";
    const cfg = await tenantIntegrations(c.env.DB, who.tenantId);
    const resolved = await resolveMealFoods(c.env as ResolveEnv, who.tenantId, who.userId, cfg, allowExternal, draft.mealOptions);
    return c.json({ draft: { customMealTypes: [], mealOptions: resolved }, credits: result.credits, mocked: result.mocked });
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
      feature: "checkin-reply",
      task: "text-small",
      expectsJson: true,
      system: sys("checkin-reply"),
      prompt: JSON.stringify(rows.results),
      maxOutputTokens: 400,
      mock: () => JSON.stringify({ summary: `${access.client.display_name} checked in ${(rows.results ?? []).length} times recently. Mood and sleep look steady; weight trending as expected.`, suggestedReply: "Great consistency this week — keep the sleep dialed in and let's push the next session." }),
    });
    if (!result.ok) return aiFail(c, result);
    const out = extractJson<{ summary: string; suggestedReply: string }>(result.output);
    if (!out) return c.json({ error: "The AI response couldn't be parsed.", raw: result.output.slice(0, 1500), mocked: result.mocked }, 422);
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
      system: sys("narrative"),
      prompt: JSON.stringify(parsed.data.stats),
      maxOutputTokens: 300,
      mock: () => `You've been remarkably consistent this month. Your logging streak and steady weight trend show the habits are sticking — that's the hard part. Keep the momentum, and let's build on this next phase.`,
    });
    if (!result.ok) return aiFail(c, result);
    return c.json({ narrative: result.output.trim(), credits: result.credits, mocked: result.mocked });
  })

  /** Lab Reader: an uploaded report (image/PDF) → extracted marker values that
   *  pre-fill the coach's review (trainer). */
  .post("/ai/lab-extract", async (c) => {
    const who = requireTenant(c)!;
    const role = c.get("role");
    if (role !== "owner" && role !== "trainer") return c.json({ error: "forbidden" }, 403);
    const ent = await tenantEntitlements(c.env.DB, who.tenantId);
    if (!ent.features.aiSuite) return c.json({ error: "aiSuite not in your plan" }, 403);
    const parsed = z.object({ clientId: z.string(), labId: z.string() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const lab = await c.env.DB.prepare("SELECT file_key, display_name FROM lab_tests WHERE id = ? AND client_id = ?").bind(parsed.data.labId, access.client.id).first<{ file_key: string | null; display_name: string }>();
    if (!lab?.file_key) return c.json({ error: "no uploaded file" }, 404);
    if (!lab.file_key.startsWith(`t/${who.tenantId}/`)) return c.json({ error: "invalid file" }, 400);
    const obj = await c.env.MEDIA.get(lab.file_key);
    if (!obj) return c.json({ error: "file not found" }, 404);
    const image = { data: toBase64(await obj.arrayBuffer()), mimeType: obj.httpMetadata?.contentType ?? "image/jpeg" };

    const result = await generate(c.env, {
      tenantId: who.tenantId, actorUserId: who.userId, clientId: access.client.id,
      feature: "lab-extract", task: "vision", image, expectsJson: true, system: sys("lab-extract"),
      prompt: `Extract every marker value from this lab report (${lab.display_name}).`,
      maxOutputTokens: 800,
      mock: () => JSON.stringify({ values: [
        { marker: "Vitamin D, 25-OH", value: "22", unit: "ng/mL", refRange: "30-100", flag: "low" },
        { marker: "Ferritin", value: "85", unit: "ng/mL", refRange: "30-400", flag: "normal" },
        { marker: "Total Testosterone", value: "410", unit: "ng/dL", refRange: "300-1000", flag: "normal" },
      ] }),
    });
    if (!result.ok) return aiFail(c, result);
    const out = extractJson<{ values: unknown[] }>(result.output);
    if (!out?.values || !Array.isArray(out.values)) return c.json({ error: "Couldn't read the lab report.", raw: result.output.slice(0, 1800), mocked: result.mocked }, 422);
    return c.json({ values: out.values, credits: result.credits, mocked: result.mocked });
  })

  /** Supplement Recommender: reviewed labs + goal + current stack → suggested
   *  OTC supplements the coach reviews before prescribing (trainer). */
  .post("/ai/supplement-reco", async (c) => {
    const who = requireTenant(c)!;
    const role = c.get("role");
    if (role !== "owner" && role !== "trainer") return c.json({ error: "forbidden" }, 403);
    const ent = await tenantEntitlements(c.env.DB, who.tenantId);
    if (!ent.features.aiSuite) return c.json({ error: "aiSuite not in your plan" }, 403);
    const parsed = z.object({ clientId: z.string() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const [labs, goal, supps] = await Promise.all([
      c.env.DB.prepare("SELECT display_name, values_json FROM lab_tests WHERE client_id = ? AND status = 'reviewed' ORDER BY created_at DESC LIMIT 5").bind(access.client.id).all<{ display_name: string; values_json: string | null }>(),
      c.env.DB.prepare("SELECT targets_json, derivation_json FROM client_goals WHERE client_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").bind(access.client.id).first<{ targets_json: string | null; derivation_json: string | null }>(),
      c.env.DB.prepare("SELECT name, dose FROM supplements WHERE client_id = ? AND status IN ('active','paused')").bind(access.client.id).all<{ name: string; dose: string | null }>(),
    ]);
    const labText = (labs.results ?? []).map((l) => `${l.display_name}: ${(parseJson<{ marker: string; value: string; unit?: string; flag?: string }[]>(l.values_json, [])).map((v) => `${v.marker} ${v.value}${v.unit ?? ""}${v.flag && v.flag !== "normal" ? ` (${v.flag})` : ""}`).join(", ")}`).join("\n");
    const primaryGoal = parseJson<{ primaryGoal?: string }>(goal?.derivation_json, {}).primaryGoal ?? "general fitness";
    const prompt = `GOAL: ${primaryGoal}\nCURRENT SUPPLEMENTS: ${(supps.results ?? []).map((s) => s.name + (s.dose ? ` ${s.dose}` : "")).join(", ") || "none"}\nREVIEWED LABS:\n${labText || "none on file"}`;

    const result = await generate(c.env, {
      tenantId: who.tenantId, actorUserId: who.userId, clientId: access.client.id,
      feature: "supplement-reco", task: "text", expectsJson: true, system: sys("supplement-reco"), prompt, maxOutputTokens: 700,
      mock: () => JSON.stringify({ recommendations: [
        { name: "Vitamin D3", dose: "2000 IU daily", rationale: "Serum 25-OH vitamin D is below range.", linkedMarker: "Vitamin D, 25-OH" },
        { name: "Creatine monohydrate", dose: "5 g daily", rationale: "Well-supported for strength and lean mass on a muscle-gain goal.", linkedMarker: null },
      ], note: "Recheck vitamin D in 8-12 weeks. Confirm no contraindications before prescribing." }),
    });
    if (!result.ok) return aiFail(c, result);
    const out = extractJson<{ recommendations: unknown[]; note?: string }>(result.output);
    if (!out?.recommendations || !Array.isArray(out.recommendations)) return c.json({ error: "The AI didn't return valid recommendations.", raw: result.output.slice(0, 1800), mocked: result.mocked }, 422);
    return c.json({ recommendations: out.recommendations, note: out.note ?? "", credits: result.credits, mocked: result.mocked });
  })

  /** Article Writer: a topic → a drafted knowledge-base article (trainer). */
  .post("/ai/article", async (c) => {
    const who = requireTenant(c)!;
    const role = c.get("role");
    if (role !== "owner" && role !== "trainer") return c.json({ error: "forbidden" }, 403);
    const ent = await tenantEntitlements(c.env.DB, who.tenantId);
    if (!ent.features.aiSuite) return c.json({ error: "aiSuite not in your plan" }, 403);
    const parsed = z.object({ topic: z.string().min(3).max(200), notes: z.string().max(1000).default("") }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);

    const result = await generate(c.env, {
      tenantId: who.tenantId, actorUserId: who.userId,
      feature: "article-write", task: "text", expectsJson: true, system: sys("article-write"),
      prompt: `TOPIC: ${parsed.data.topic}${parsed.data.notes ? `\nNOTES: ${parsed.data.notes}` : ""}`,
      maxOutputTokens: 2048,
      mock: () => JSON.stringify({ title: parsed.data.topic, summary: `A practical guide to ${parsed.data.topic.toLowerCase()}.`, body: `## Overview\n\nHere's what matters about ${parsed.data.topic.toLowerCase()}, and how to put it to work.\n\n## Key points\n\n- Start simple and stay consistent.\n- Progress gradually and track what changes.\n- Recover well — that's where results are built.\n\n## Takeaway\n\nSmall, repeatable actions compound. Pick one thing and do it this week.` }),
    });
    if (!result.ok) return aiFail(c, result);
    const article = extractJson<{ title: string; summary: string; body: string }>(result.output);
    if (!article?.body) return c.json({ error: "The AI didn't return a valid article.", raw: result.output.slice(0, 1800), mocked: result.mocked }, 422);
    return c.json({ article, credits: result.credits, mocked: result.mocked });
  })

  /** Cover image (Gemini Nano Banana) → an R2 media key for the article/resource. */
  .post("/ai/cover-image", async (c) => {
    const who = requireTenant(c)!;
    const role = c.get("role");
    if (role !== "owner" && role !== "trainer") return c.json({ error: "forbidden" }, 403);
    const ent = await tenantEntitlements(c.env.DB, who.tenantId);
    if (!ent.features.aiSuite) return c.json({ error: "aiSuite not in your plan" }, 403);
    const parsed = z.object({ prompt: z.string().min(2).max(500) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const result = await generateImage(c.env, {
      tenantId: who.tenantId, actorUserId: who.userId, feature: "cover-image",
      prompt: `${sys("cover-image")}\nSubject: ${parsed.data.prompt}`,
    });
    if (!result.ok) return aiFail(c, result);
    return c.json({ key: result.key, url: `/api/media/${result.key}`, credits: result.credits, mocked: result.mocked });
  })

  /**
   * Generate/regenerate an ORIGINAL library image (food or exercise) — a
   * license-free house-style illustration or 3D food render, so provider
   * images (unknown licensing) can be replaced. Prompt is configurable per
   * feature in AI settings. Staff-only (spends tenant credits).
   */
  .post("/ai/generate-image", async (c) => {
    const who = requireTenant(c)!;
    const role = c.get("role");
    if (role !== "owner" && role !== "trainer") return c.json({ error: "forbidden" }, 403);
    const ent = await tenantEntitlements(c.env.DB, who.tenantId);
    if (!ent.features.aiSuite) return c.json({ error: "aiSuite not in your plan" }, 403);
    const parsed = z.object({
      feature: z.enum(["food-image", "exercise-image", "cover-image", "workout-day-image"]),
      subject: z.string().min(1).max(200),
      hint: z.string().max(160).default(""),
      referenceKey: z.string().max(300).optional(),
      /** Exercise diptych: one wide image with start (left) + end (right), split client-side. */
      pair: z.boolean().default(false),
      /** Tenant brand accent (hex) to make the render on-brand (day covers). */
      brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const { feature, subject, hint, referenceKey, pair, brandColor } = parsed.data;
    const brandLine = brandColor ? ` Use the colour ${brandColor} as the dominant accent hue throughout the image.` : "";

    if (pair) {
      // One wide two-panel render → guaranteed-identical style, genuinely
      // different poses, one generation. The client splits it into two frames.
      const prompt = `${sys(feature)}\n\nIMPORTANT COMPOSITION: Output ONE wide 2:1 landscape image that reads as two equal side-by-side panels showing the SAME single figure in the SAME art style, same side-on camera and same background. In the LEFT half, place ONE complete full-body figure CENTERED within that half with generous margin — whole body from head to feet visible, nothing cropped. In the RIGHT half, place the SAME figure CENTERED within that half, also full-body and uncropped. Keep the exact vertical centre of the image EMPTY (no figure straddling the middle) so the image can be split cleanly in half.\n\nTHE TWO HALVES MUST SHOW TWO DIFFERENT MOMENTS OF THE REP — this is the whole point. LEFT = ${subject} at the STARTING / setup position (the beginning of the rep, muscles lengthened, before the movement). RIGHT = ${subject} at the FINISHED / peak-contraction position (the hardest point at the end of the rep, muscles shortened). The joint angles, limb positions and body shape in the two halves MUST be VISIBLY and SUBSTANTIALLY DIFFERENT — e.g. a bicep curl: LEFT arm hanging straight down, RIGHT forearm raised with the weight at the shoulder; a squat: LEFT standing tall, RIGHT deep at the bottom with hips below knees; a bench press: LEFT bar touching the chest, RIGHT arms fully extended. Do NOT draw the same pose twice; the two figures must never be identical or near-identical mirror copies. If both halves look the same, the image is wrong.\n\nNo dividing line, no gap, no frame, no text, no labels, no numbers.`;
      const r = await generateImage(c.env, { tenantId: who.tenantId, actorUserId: who.userId, feature, prompt });
      if (!r.ok) return aiFail(c, r);
      return c.json({ key: r.key, url: `/api/media/${r.key}`, pair: true, credits: r.credits, mocked: r.mocked });
    }

    // Optional reference image (same tenant) → image-to-image, so a generated
    // pair (e.g. exercise start→end) shares one athlete, style and camera angle.
    let reference: { data: string; mimeType: string } | undefined;
    if (referenceKey && referenceKey.startsWith(`t/${who.tenantId}/`)) {
      const obj = await c.env.MEDIA.get(referenceKey);
      if (obj) reference = { data: toBase64(await obj.arrayBuffer()), mimeType: obj.httpMetadata?.contentType ?? "image/png" };
    }
    const matchLine = reference
      ? " Use the reference image ONLY to copy the character's appearance, art style, colours, line-work, camera angle, framing and background. Draw a NEW pose — the limbs and joints MUST be clearly and substantially repositioned into the specified position; do NOT reproduce the reference pose or output a near-identical image."
      : "";
    const base = `${sys(feature)}\nSubject: ${subject}.${hint ? ` Show ${hint}.` : ""}${brandLine}`;
    let result = await generateImage(c.env, {
      tenantId: who.tenantId, actorUserId: who.userId, feature, reference,
      prompt: `${base}${matchLine} Produce a fresh, unique image.`,
    });
    // Image-to-image can be refused by the model — fall back to a plain
    // generation so the second frame still lands (just less style-matched).
    if (!result.ok && reference && result.error !== "insufficient_credits") {
      result = await generateImage(c.env, {
        tenantId: who.tenantId, actorUserId: who.userId, feature,
        prompt: `${base} Produce a fresh, unique image.`,
      });
    }
    if (!result.ok) return aiFail(c, result);
    return c.json({ key: result.key, url: `/api/media/${result.key}`, credits: result.credits, mocked: result.mocked });
  })

  /** Estimate a food's nutrition from its name (fills the food editor). */
  .post("/ai/food-meta", async (c) => {
    const who = requireTenant(c)!;
    const ent = await tenantEntitlements(c.env.DB, who.tenantId);
    if (!ent.features.aiSuite) return c.json({ error: "aiSuite not in your plan" }, 403);
    const parsed = z.object({ name: z.string().min(1).max(160) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const result = await generate(c.env, {
      tenantId: who.tenantId, actorUserId: who.userId, feature: "food-meta", task: "text", expectsJson: true,
      system: sys("food-meta"),
      prompt: `FOOD: ${parsed.data.name}\n\nEstimate its nutrition now.`,
      maxOutputTokens: 300,
      mock: () => JSON.stringify({ servingSize: 100, servingUnit: "g", calories: 165, proteinG: 31, carbsG: 0, fatG: 4, fiberG: 0, sugarG: 0, sodiumMg: 74 }),
    });
    if (!result.ok) return aiFail(c, result);
    const raw = extractJson<Record<string, unknown>>(result.output);
    if (!raw) return c.json({ error: "The AI didn't return valid nutrition.", raw: result.output.slice(0, 600), mocked: result.mocked }, 422);
    const numField = (v: unknown): number => { const n = typeof v === "string" ? parseFloat(v) : Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
    const food = {
      name: parsed.data.name,
      servingSize: numField(raw.servingSize) || 100,
      servingUnit: raw.servingUnit === "ml" ? "ml" : "g",
      calories: numField(raw.calories), proteinG: numField(raw.proteinG), carbsG: numField(raw.carbsG), fatG: numField(raw.fatG),
      fiberG: numField(raw.fiberG), sugarG: numField(raw.sugarG), sodiumMg: numField(raw.sodiumMg),
    };
    return c.json({ food, credits: result.credits, mocked: result.mocked });
  })

  /** Recommend a recipe from a meal option's foods (client-facing). */
  .post("/ai/recipe", async (c) => {
    const who = requireTenant(c)!;
    const ent = await tenantEntitlements(c.env.DB, who.tenantId);
    if (!ent.features.aiSuite) return c.json({ error: "aiSuite not in your plan" }, 403);
    const parsed = z.object({
      clientId: z.string(),
      mealName: z.string().max(120).default(""),
      foods: z.array(z.object({ name: z.string().min(1).max(120), quantity: z.number().nullish(), unit: z.string().max(20).nullish() })).min(1).max(12),
    }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const foodList = parsed.data.foods.map((f) => `- ${f.name}${f.quantity ? ` (${Math.round(f.quantity)}${f.unit ?? "g"})` : ""}`).join("\n");
    const result = await generate(c.env, {
      tenantId: who.tenantId, actorUserId: who.userId, clientId: access.client.id,
      feature: "meal-recipe", task: "text", system: sys("meal-recipe"),
      prompt: `MEAL: ${parsed.data.mealName || "meal"}\nFOODS:\n${foodList}\n\nWrite the recipe now.`,
      maxOutputTokens: 700,
      mock: () => `A quick, balanced plate that comes together fast.\n\n## Ingredients\n${foodList}\n- Olive oil, salt & pepper to taste\n\n## Steps\n1. Season the proteins and cook them through over medium heat.\n2. Prepare the carbs and vegetables alongside.\n3. Combine everything, adjust seasoning, and plate.\n\n**Total time:** 20 min`,
    });
    if (!result.ok) return aiFail(c, result);
    return c.json({ recipe: result.output, credits: result.credits, mocked: result.mocked });
  })

  /** Write step-by-step how-to instructions for an exercise (trainer). */
  .post("/ai/exercise-guide", async (c) => {
    const who = requireTenant(c)!;
    const role = c.get("role");
    if (role !== "owner" && role !== "trainer") return c.json({ error: "forbidden" }, 403);
    const ent = await tenantEntitlements(c.env.DB, who.tenantId);
    if (!ent.features.aiSuite) return c.json({ error: "aiSuite not in your plan" }, 403);
    const parsed = z.object({
      name: z.string().min(1).max(120),
      muscleGroups: z.array(z.string()).default([]),
      equipment: z.array(z.string()).default([]),
    }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const { name, muscleGroups, equipment } = parsed.data;
    const result = await generate(c.env, {
      tenantId: who.tenantId, actorUserId: who.userId, feature: "exercise-guide", task: "text",
      system: sys("exercise-guide"),
      prompt: `EXERCISE: ${name}${muscleGroups.length ? `\nMUSCLES: ${muscleGroups.join(", ")}` : ""}${equipment.length ? `\nEQUIPMENT: ${equipment.join(", ")}` : ""}\n\nWrite the full guide now — complete every section.`,
      maxOutputTokens: 2200,
      mock: () => `## Setup\nSet the bar across your upper back, take a grip just wider than shoulder-width, brace your core and unrack with control.\n\n## Execution\n1. Step back and set your feet shoulder-width, toes turned slightly out.\n2. Take a big breath and brace hard against your belt or midsection.\n3. Break at the hips and knees together, sitting down between your legs.\n4. Descend until your hip crease passes below the top of your knee.\n5. Drive through the whole foot to stand back up, keeping your chest tall.\n6. Lock out the hips at the top and reset your breath.\n\n## Coaching cues\n- Spread the floor with your feet to keep the knees tracking out.\n- Keep the bar over mid-foot the whole way.\n- Stay tall — don't let the chest collapse forward.\n\n## Common mistakes\n- Knees caving in on the way up.\n- Cutting depth short.\n- Losing the brace at the bottom.\n\n## Breathing\nInhale and brace at the top, hold through the descent, exhale as you pass the hardest point on the way up.`,
    });
    if (!result.ok) return aiFail(c, result);
    return c.json({ guide: result.output, credits: result.credits, mocked: result.mocked });
  })

  /** Auto-fill exercise metadata (muscles, equipment, difficulty…) from a name. */
  .post("/ai/exercise-meta", async (c) => {
    const who = requireTenant(c)!;
    const role = c.get("role");
    if (role !== "owner" && role !== "trainer") return c.json({ error: "forbidden" }, 403);
    const ent = await tenantEntitlements(c.env.DB, who.tenantId);
    if (!ent.features.aiSuite) return c.json({ error: "aiSuite not in your plan" }, 403);
    const parsed = z.object({ name: z.string().min(1).max(120) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    // Enum-constrained schema → the model can only return our slugs (Gemini
    // responseSchema + Workers AI json_schema). The normalizer below stays as a
    // backstop for any provider that ignores the enum.
    const muscleEnum = { type: "string", enum: [...MUSCLE_GROUPS] };
    const metaSchema = {
      type: "object",
      properties: {
        primaryMuscles: { type: "array", items: muscleEnum },
        secondaryMuscles: { type: "array", items: muscleEnum },
        equipment: { type: "array", items: { type: "string", enum: [...EQUIPMENT_TYPES] } },
        difficulty: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
        force: { type: "string", enum: ["push", "pull", "static"] },
        mechanic: { type: "string", enum: ["compound", "isolation"] },
      },
      required: ["primaryMuscles", "secondaryMuscles", "equipment", "difficulty", "force", "mechanic"],
    };
    const result = await generate(c.env, {
      tenantId: who.tenantId, actorUserId: who.userId, feature: "exercise-meta", task: "text", expectsJson: true, jsonSchema: metaSchema,
      system: sys("exercise-meta"),
      prompt: `EXERCISE: ${parsed.data.name}\n\nAllowed muscles: ${MUSCLE_GROUPS.join(", ")}\nAllowed equipment: ${EQUIPMENT_TYPES.join(", ")}\n\nClassify it now.`,
      maxOutputTokens: 300,
      mock: () => JSON.stringify({ primaryMuscles: ["quads"], secondaryMuscles: ["glutes", "hamstrings"], equipment: ["barbell"], difficulty: "intermediate", force: "push", mechanic: "compound" }),
    });
    if (!result.ok) return aiFail(c, result);
    const raw = extractJson<Record<string, unknown>>(result.output);
    if (!raw) return c.json({ error: "The AI didn't return valid details.", raw: result.output.slice(0, 800), mocked: result.mocked }, 422);
    // Fold model output onto our slugs tolerantly (anatomical names, plurals,
    // synonyms) so real-model answers actually populate the editor; coerce enums.
    const uniq = <T,>(xs: T[]) => [...new Set(xs)];
    const mapArr = <T,>(v: unknown, fn: (x: string) => T | null): T[] =>
      Array.isArray(v) ? uniq(v.map((x) => fn(String(x))).filter((x): x is T => x != null)) : [];
    const oneOf = (v: unknown, opts: string[]) => (typeof v === "string" && opts.includes(v.toLowerCase().trim()) ? v.toLowerCase().trim() : null);
    const meta = {
      primaryMuscles: mapArr(raw.primaryMuscles, normalizeMuscle),
      secondaryMuscles: mapArr(raw.secondaryMuscles, normalizeMuscle),
      equipment: mapArr(raw.equipment, normalizeEquipment),
      difficulty: oneOf(raw.difficulty, ["beginner", "intermediate", "advanced"]),
      force: oneOf(raw.force, ["push", "pull", "static"]),
      mechanic: oneOf(raw.mechanic, ["compound", "isolation"]),
    };
    return c.json({ meta, credits: result.credits, mocked: result.mocked });
  })

  /** Client Summary: full context → a concise coach-facing status (trainer). */
  .post("/ai/client-summary", async (c) => {
    const who = requireTenant(c)!;
    const role = c.get("role");
    if (role !== "owner" && role !== "trainer") return c.json({ error: "forbidden" }, 403);
    const ent = await tenantEntitlements(c.env.DB, who.tenantId);
    if (!ent.features.aiSuite) return c.json({ error: "aiSuite not in your plan" }, 403);
    const parsed = z.object({ clientId: z.string(), today: z.string().optional(), hour: z.coerce.number().int().min(0).max(23).optional() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const prefRow = await c.env.DB.prepare("SELECT units_json FROM user_prefs WHERE user_id = ?").bind(who.userId).first<{ units_json: string | null }>();
    const units = resolveUnits(parseJson(prefRow?.units_json ?? null, null));
    const ctx = await buildClientContext(c.env, access.client, { today: parsed.data.today ?? new Date().toISOString().slice(0, 10), hour: parsed.data.hour ?? 12, units });

    const result = await generate(c.env, {
      tenantId: who.tenantId, actorUserId: who.userId, clientId: access.client.id,
      feature: "client-summary", task: "text-small", system: sys("client-summary"),
      prompt: `${ctx.text}\n\nWrite the coach summary now.`, maxOutputTokens: 300,
      mock: () => `${access.client.display_name} is training consistently and logging most days. Adherence is solid and the trend is positive; sleep is the main lever. Next: nudge check-in consistency and confirm protein targets are being hit.`,
    });
    if (!result.ok) return aiFail(c, result);
    return c.json({ summary: result.output.trim(), credits: result.credits, mocked: result.mocked });
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
    if (!result.ok) return c.json({ message: null, detail: "detail" in result ? result.detail : undefined });
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

// ── Platform admin: AI provider config, markup + the model catalog ───────────
const DEFAULT_MARKUP = 3;
const globalMarkup = (cfg: Record<string, string>): number => { const n = Number(cfg["ai.markup"]); return n >= 1 && n <= 100 ? n : DEFAULT_MARKUP; };

export const aiAdminRoutes = new Hono<AppEnv>()
  .get("/admin/ai/config", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const cfg = await getConfig(c.env.DB);
    const models = await listModels(c.env.DB);
    // Never echo the key — only whether it's set.
    return c.json({ geminiKeySet: !!cfg["google.gemini_key"], mockMode: cfg["ai.mock"] ?? "auto", markup: globalMarkup(cfg), modelCount: models.length });
  })
  .post("/admin/ai/config", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const d = z
      .object({ geminiKey: z.string().min(1).optional(), mockMode: z.enum(["auto", "on", "off"]).optional(), markup: z.number().min(1).max(100).optional() })
      .safeParse(await c.req.json().catch(() => null));
    if (!d.success) return c.json({ error: "invalid body" }, 400);
    if (d.data.geminiKey) await setConfig(c.env.DB, "google.gemini_key", d.data.geminiKey.trim());
    if (d.data.mockMode) await setConfig(c.env.DB, "ai.mock", d.data.mockMode);
    // Setting the global markup applies it to every model in the catalog so
    // credit charges stay markup × real provider cost across the board.
    if (d.data.markup !== undefined) {
      await setConfig(c.env.DB, "ai.markup", String(d.data.markup));
      await c.env.DB.prepare("UPDATE ai_models SET markup = ?").bind(d.data.markup).run();
    }
    return c.json({ ok: true });
  })

  /** The full model catalog (platform admin) — includes disabled models. */
  .get("/admin/ai/models", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const { seedAiModels } = await import("./ai.js");
    await seedAiModels(c.env.DB);
    const rows = await c.env.DB.prepare("SELECT * FROM ai_models ORDER BY provider, task, label").all();
    return c.json({ models: rows.results ?? [] });
  })

  /** Toggle / default / per-model markup override. */
  .patch("/admin/ai/models/:id", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const d = z.object({ enabled: z.boolean().optional(), isDefault: z.boolean().optional(), markup: z.number().min(1).max(100).optional() }).safeParse(await c.req.json().catch(() => null));
    if (!d.success) return c.json({ error: "invalid body" }, 400);
    const id = c.req.param("id");
    // Making a model the default for its task clears the previous default.
    if (d.data.isDefault) {
      const row = await c.env.DB.prepare("SELECT task FROM ai_models WHERE id = ?").bind(id).first<{ task: string }>();
      if (row) await c.env.DB.prepare("UPDATE ai_models SET is_default = 0 WHERE task = ?").bind(row.task).run();
    }
    const sets: string[] = [], binds: unknown[] = [];
    if (d.data.enabled !== undefined) (sets.push("enabled = ?"), binds.push(d.data.enabled ? 1 : 0));
    if (d.data.isDefault !== undefined) (sets.push("is_default = ?"), binds.push(d.data.isDefault ? 1 : 0));
    if (d.data.markup !== undefined) (sets.push("markup = ?"), binds.push(d.data.markup));
    if (sets.length) await c.env.DB.prepare(`UPDATE ai_models SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id).run();
    return c.json({ ok: true });
  })

  /**
   * Refresh the catalog from the official pricing docs (Cloudflare Workers AI +
   * Google Gemini). Parses neuron-equivalent rates so every model bills through
   * the same credit math; preserves enable/default/markup on existing rows.
   */
  .post("/admin/ai/models/sync", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const cfg = await getConfig(c.env.DB);
    const markup = globalMarkup(cfg);
    const errors: string[] = [];
    const fetchMd = async (url: string): Promise<string | null> => {
      try { const r = await fetch(url, { headers: { accept: "text/markdown" } }); return r.ok ? await r.text() : (errors.push(`${url}: ${r.status}`), null); }
      catch (e) { errors.push(`${url}: ${String(e)}`); return null; }
    };
    const [cfMd, gemMd] = await Promise.all([
      fetchMd("https://developers.cloudflare.com/workers-ai/platform/pricing/index.md"),
      fetchMd("https://ai.google.dev/gemini-api/docs/pricing.md.txt"),
    ]);
    const seeds = [
      ...(cfMd ? parseWorkersAiPricing(cfMd) : []),
      ...(gemMd ? parseGeminiPricing(gemMd) : []),
    ];
    if (seeds.length === 0) return c.json({ error: "no models parsed", errors }, 502);
    // Upsert: refresh rates/label/task/provider; preserve enabled/default/markup
    // on existing rows, new rows inherit the global markup and land enabled.
    await c.env.DB.batch(seeds.map((m) =>
      c.env.DB.prepare(
        `INSERT INTO ai_models (id, task, label, provider, input_rate, output_rate, unit_rate, unit_kind, markup, enabled, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
         ON CONFLICT(id) DO UPDATE SET task = excluded.task, label = excluded.label, provider = excluded.provider,
           input_rate = excluded.input_rate, output_rate = excluded.output_rate, unit_rate = excluded.unit_rate, unit_kind = excluded.unit_kind`,
      ).bind(m.id, m.task, m.label, m.provider, m.inputRate, m.outputRate, m.unitRate, m.unitKind, markup),
    ));
    // Guarantee a default per text/text-small/vision task (cheapest output).
    for (const task of ["text", "text-small", "vision"]) {
      const has = await c.env.DB.prepare("SELECT 1 x FROM ai_models WHERE task = ? AND enabled = 1 AND is_default = 1").bind(task).first();
      if (!has) await c.env.DB.prepare("UPDATE ai_models SET is_default = 1 WHERE id = (SELECT id FROM ai_models WHERE task = ? AND enabled = 1 ORDER BY output_rate ASC LIMIT 1)").bind(task).run();
    }
    const total = (await listModels(c.env.DB)).length;
    return c.json({ ok: true, parsed: seeds.length, total, errors });
  });
