/**
 * AI feature endpoints (SPEC §6) — v1: natural-language food parsing and the
 * workout Plan Draft. Both are entitlement-gated (`aiSuite`), flag-gated for
 * clients (`canUseAi`), and fully metered through generate().
 */

import { Hono, type Context } from "hono";
import { z } from "zod";
import { WorkoutBody, MUSCLE_GROUPS, EQUIPMENT_TYPES, normalizeMuscle, normalizeEquipment } from "@mossa/protocol";
import { resolveUnits, activityByKey, estimateBurnedCalories, mockModeSettable, shouldUseMockLane } from "@mossa/domain";
import { type AppEnv, requireTenant, isPlatformAdmin } from "./auth-context.js";
import type { Env } from "./env.js";
import { requireClientAccess, clientForUser } from "./clients.js";
import { gateFeature, resolveClientFlagsFor } from "./client-flags.js";
import { tenantEntitlements, hasFeature, getConfig, setConfig } from "./billing-store.js";
import {
  generate, generateImage, extractJson, listModels, checkClientDailyBudget,
  estimateRunCredits, modelSupportsTask, preferredModelForTask, modelForTask, modelById, seedAiModels,
  type AiModelRow,
} from "./ai.js";
import { buildClientContext } from "./ai-context.js";
// ONE fence implementation, shared with the renderKnowledge prompt path (which
// carries the same client-authored fields into far more AI surfaces).
import { untrusted } from "./client-knowledge.js";
import { featureDef } from "./ai-features.js";
import { parseWorkersAiCatalog, parseGeminiCatalog, isRunnableTask, type SkippedModel } from "./ai-pricing.js";
import { tenantIntegrations, type Integrations } from "./integrations.js";
import { resolveFoodId, resolveExerciseId, type ResolveEnv } from "./library-resolve.js";
import { parseJson } from "./db.js";

/** The acting user's display units — every AI context reads the client's numbers
 *  in the units the viewer expects. */
async function unitsFor(db: D1Database, userId: string) {
  const row = await db.prepare("SELECT units_json FROM user_prefs WHERE user_id = ?").bind(userId).first<{ units_json: string | null }>();
  return resolveUnits(parseJson(row?.units_json ?? null, null));
}

const SURFACE_FOCUS: Record<string, string> = {
  home: "Give an overall snapshot and the single most useful nudge for right now.",
  train: "Focus on their training — today's workout, recent PRs, load and momentum.",
  eat: "Focus on their nutrition — calories/protein vs target, meals, and today's intake so far.",
  wellness: "Focus on recovery — sleep, hydration, mood, supplements and check-in consistency.",
  progress: "Focus on their trends — weight/body-composition direction, training volume and PRs, consistency and what the trajectory says.",
};

/** Deterministic dev/mock coach note (no AI binding / ai.mock = on). */
function coachNoteMock(surface: string, name: string): string {
  const first = name.split(" ")[0] || "there";
  return ({
    home: `Solid momentum, ${first} — you're showing up. Knock out today's check-in and you're set.`,
    train: `Your load's trending up nicely, ${first}. Bring the same intent to today's session and chase that next PR.`,
    eat: `Protein's your lever today, ${first} — get a solid hit at your next meal and you'll land right on target.`,
    wellness: `Sleep is trending well, ${first}. Keep the hydration up and stay on your supplements to lock in recovery.`,
    progress: `The trend is your friend, ${first} — weight's easing down and your volume's climbing. Keep stacking consistent weeks.`,
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
  if (r.error === "storage_full") return c.json({ error: "Your studio's media storage is full — delete some media or upgrade to generate images." }, 413);
  return c.json({ error: r.detail ? `AI failed — ${r.detail}` : "AI unavailable.", detail: r.detail }, 503);
}

/** Per-client daily AI budget guard (SPEC §6 per-client credit cap + a hard
 *  request-rate backstop). No-op for staff — a client's package only bounds the
 *  CLIENT's own self-service spend, never the coach's. Enforced BEFORE the
 *  metered generate() so a single client can't drain the tenant's balance. */
async function clientBudgetGate(c: Context<AppEnv>, actorUserId: string): Promise<Response | null> {
  if (c.get("role") !== "client") return null;
  const tenantId = c.get("tenantId");
  if (!tenantId) return null;
  const b = await checkClientDailyBudget(c.env, tenantId, actorUserId);
  if (b.ok) return null;
  const error = b.reason === "rate_limited"
    ? "You've hit today's AI limit — try again later."
    : "You've reached your daily AI allowance. Ask your coach if you need more.";
  return c.json({ error, reason: b.reason, used: b.used, limit: b.limit }, 429);
}

/** Clamp a client-supplied local date to ±1 day of the server's date so it can't
 *  mint unlimited distinct cache keys (each distinct `today` = a fresh paid
 *  generation). Falls back to the server date on anything malformed/out of range. */
function safeLocalDate(input: string | undefined): string {
  const server = new Date().toISOString().slice(0, 10);
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return server;
  const t = Date.parse(`${input}T00:00:00Z`);
  const now = Date.parse(`${server}T00:00:00Z`);
  if (!Number.isFinite(t)) return server;
  const diffDays = Math.round((t - now) / 86_400_000);
  return diffDays < -1 || diffDays > 1 ? server : input;
}

/** Per-client media ACL for AI vision keys: a CLIENT persona may only feed its
 *  own media (owned by them, or attached to their client record) into a paid
 *  vision call. Staff may use any same-tenant object. */
async function clientMayUseMedia(c: Context<AppEnv>, r2Key: string, clientId: string | null, actorUserId: string): Promise<boolean> {
  if (c.get("role") !== "client") return true;
  const row = await c.env.DB
    .prepare("SELECT client_id, owner_user_id FROM media_assets WHERE r2_key = ? AND deleted_at IS NULL")
    .bind(r2Key)
    .first<{ client_id: string | null; owner_user_id: string | null }>();
  if (!row) return false;
  return row.owner_user_id === actorUserId || (!!clientId && row.client_id === clientId);
}

interface DraftFoodQuery { foodId?: string; query?: string; name?: string; quantity?: number; unit?: string; calories?: number; proteinG?: number; carbsG?: number; fatG?: number }
interface DraftMealOption { mealType: string; mealName: string; isFree?: boolean; foods?: DraftFoodQuery[] }
interface ResolvedMealFood { foodId: string; quantity: number; unit: string }

// Loose shapes for the model's workout draft (exercise picked by library id, or
// named as a fallback the resolver maps to a real library row).
interface RawSlot { exerciseId?: string; exercise?: string; exerciseName?: string; name?: string; measurementMode?: string; slotNotes?: string | null; sets?: unknown[] }
interface RawBlock { type?: string; rounds?: number | null; restBetweenExercisesSec?: number | null; restBetweenRoundsSec?: number | null; blockNotes?: string | null; slots?: RawSlot[] }
interface RawDay { name?: string; dayNotes?: string | null; isRestDay?: boolean; blocks?: RawBlock[] }

/** Bounded food library (tenant + platform) formatted for the meal-draft prompt,
 *  with the id set used to whitelist what the model may reference. */
async function foodLibraryForPrompt(db: D1Database, tenantId: string, limit = 160): Promise<{ ids: Set<string>; text: string; count: number; sample: { id: string; name: string; serving_size: number; serving_unit: string }[] }> {
  const rows = await db
    .prepare("SELECT id, name, brand, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g FROM foods WHERE active = 1 AND (tenant_id IS NULL OR tenant_id = ?) ORDER BY verified DESC, name LIMIT ?")
    .bind(tenantId, limit)
    .all<{ id: string; name: string; brand: string | null; serving_size: number; serving_unit: string; calories: number; protein_g: number; carbs_g: number; fat_g: number }>();
  const list = rows.results ?? [];
  const ids = new Set(list.map((r) => r.id));
  const text = list
    .map((r) => `${r.id}: ${r.name}${r.brand ? ` (${r.brand})` : ""} — ${Math.round(r.calories)}kcal ${Math.round(r.protein_g)}P/${Math.round(r.carbs_g)}C/${Math.round(r.fat_g)}F per ${r.serving_size}${r.serving_unit}`)
    .join("\n");
  return { ids, text, count: list.length, sample: list.slice(0, 3).map((r) => ({ id: r.id, name: r.name, serving_size: r.serving_size, serving_unit: r.serving_unit })) };
}

/** Turn the model's chosen foods into REAL library food ids. The model picks a
 *  `foodId` from the fed library (validated against `libIds`); a bare name is
 *  resolved against the library (and, if enabled, web providers) but NEVER
 *  fabricated. Anything unresolvable is dropped and reported. */
async function resolveMealFoods(env: ResolveEnv, tenantId: string, userId: string, cfg: Integrations, allowExternal: boolean, options: DraftMealOption[], libIds: Set<string>): Promise<{ options: (DraftMealOption & { foods: ResolvedMealFood[] })[]; dropped: string[] }> {
  const cache = new Map<string, string | null>();
  const out: (DraftMealOption & { foods: ResolvedMealFood[] })[] = [];
  const dropped: string[] = [];
  for (const opt of options) {
    if (!opt?.mealType || !opt?.mealName) continue;
    const foods: ResolvedMealFood[] = [];
    for (const f of (opt.foods ?? []).slice(0, 6)) {
      const qty = Number(f.quantity) > 0 ? Number(f.quantity) : 100;
      const unit = (f.unit || "g").slice(0, 20);
      // 1) an explicit library id the model picked from the fed list.
      let id: string | null = typeof f.foodId === "string" && libIds.has(f.foodId) ? f.foodId : null;
      // 2) fall back to a name → library-only match (invent disabled).
      if (!id) {
        const q = String(f?.query ?? f?.name ?? "").trim();
        if (q) {
          id = await resolveFoodId(env, tenantId, userId, q, cfg, allowExternal, null, cache, false);
          if (!id) dropped.push(q);
        }
      }
      if (id) foods.push({ foodId: id, quantity: qty, unit });
    }
    out.push({ mealType: opt.mealType, mealName: opt.mealName, isFree: !!opt.isFree, foods });
  }
  return { options: out, dropped };
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

// ── exercise-meta: one prompt/schema/validator, two callers ──────────────────
// The route below AND the admin self-test both drive these, so the diagnostic
// exercises the exact contract a coach hits rather than a look-alike.

/** Enum-constrained schema → the model can only return our slugs (Gemini
 *  responseSchema + Workers AI json_schema). `foldExerciseMeta` stays as a
 *  backstop for any provider that ignores the enum. */
const EXERCISE_META_SCHEMA = {
  type: "object",
  properties: {
    primaryMuscles: { type: "array", items: { type: "string", enum: [...MUSCLE_GROUPS] } },
    secondaryMuscles: { type: "array", items: { type: "string", enum: [...MUSCLE_GROUPS] } },
    equipment: { type: "array", items: { type: "string", enum: [...EQUIPMENT_TYPES] } },
    difficulty: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
    force: { type: "string", enum: ["push", "pull", "static"] },
    mechanic: { type: "string", enum: ["compound", "isolation"] },
  },
  required: ["primaryMuscles", "secondaryMuscles", "equipment", "difficulty", "force", "mechanic"],
};

const exerciseMetaPrompt = (name: string) =>
  `EXERCISE: ${name}\n\nAllowed muscles: ${MUSCLE_GROUPS.join(", ")}\nAllowed equipment: ${EQUIPMENT_TYPES.join(", ")}\n\nClassify it now.`;

const EXERCISE_META_MOCK = () =>
  JSON.stringify({ primaryMuscles: ["quads"], secondaryMuscles: ["glutes", "hamstrings"], equipment: ["barbell"], difficulty: "intermediate", force: "push", mechanic: "compound" });

export interface ExerciseMeta {
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  difficulty: string | null;
  force: string | null;
  mechanic: string | null;
}

/** Fold model output onto our slugs tolerantly (anatomical names, plurals,
 *  synonyms) so real-model answers actually populate the editor; coerce enums. */
function foldExerciseMeta(raw: Record<string, unknown>): ExerciseMeta {
  const uniq = <T,>(xs: T[]) => [...new Set(xs)];
  const mapArr = <T,>(v: unknown, fn: (x: string) => T | null): T[] =>
    Array.isArray(v) ? uniq(v.map((x) => fn(String(x))).filter((x): x is T => x != null)) : [];
  const oneOf = (v: unknown, opts: string[]) => (typeof v === "string" && opts.includes(v.toLowerCase().trim()) ? v.toLowerCase().trim() : null);
  return {
    primaryMuscles: mapArr(raw.primaryMuscles, normalizeMuscle),
    secondaryMuscles: mapArr(raw.secondaryMuscles, normalizeMuscle),
    equipment: mapArr(raw.equipment, normalizeEquipment),
    difficulty: oneOf(raw.difficulty, ["beginner", "intermediate", "advanced"]),
    force: oneOf(raw.force, ["push", "pull", "static"]),
    mechanic: oneOf(raw.mechanic, ["compound", "isolation"]),
  };
}

export const aiRoutes = new Hono<AppEnv>()
  /** "2 eggs, toast and an apple" → structured entries (client confirms). */
  .post("/ai/parse-food", async (c) => {
    const who = requireTenant(c)!;
    const parsed = z
      .object({ clientId: z.string(), text: z.string().min(2).max(500) })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    { const g = await gateFeature(c, "aiMealTools", access.client.id); if (g) return g; }
    { const g = await clientBudgetGate(c, who.userId); if (g) return g; }

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
    { const gate = await gateFeature(c, "aiSuite"); if (gate) return gate; }
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
    const libIds = new Set((library.results ?? []).map((e) => e.id));
    const nameOf = new Map((library.results ?? []).map((e) => [e.id, e.name]));
    // Few-shot: this studio's recent published plans as a style reference.
    const examples = await workoutPlanExamples(c.env.DB, who.tenantId, nameOf);
    // Deep client understanding, straight from the combined knowledge base.
    const ctx = await buildClientContext(c.env, access.client, { today: new Date().toISOString().slice(0, 10), hour: 12, units: await unitsFor(c.env.DB, who.userId), sections: ["client", "preferences", "goal", "body", "training", "wellness"] });
    const prompt = [
      ctx.text,
      `EXERCISE LIBRARY — you MUST choose exercises ONLY from this list, by id (format "exerciseId: name [muscles] {equipment}"):`,
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
                      exerciseId: library.results?.[0]?.id ?? "",
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
    // Resolve each slot to a REAL library id. The model picks an `exerciseId`
    // from the fed list (validated against libIds); a bare name falls back to a
    // library match (and, if enabled, a web import WITH its photo/gif) but is
    // NEVER fabricated. Off-library items are dropped and reported to the coach.
    // Never spend a live web-import on mock output. Keyed off THIS generation's
    // `mocked` flag rather than the stored `ai.mock` value: since the mock lane
    // is development-only, a stale `ai.mock = "on"` row in production must not
    // quietly disable a feature the tenant paid for.
    const allowExternal = (await hasFeature(c.env.DB, who.tenantId, "externalSearch")) && !result.mocked;
    const cfg = await tenantIntegrations(c.env.DB, who.tenantId);
    const cache = new Map<string, string | null>();
    const dropped: string[] = [];
    const days: unknown[] = [];
    for (const d of raw.days) {
      const blocks: unknown[] = [];
      for (const b of d.blocks ?? []) {
        const slots: unknown[] = [];
        for (const s of b.slots ?? []) {
          let id: string | null = typeof s.exerciseId === "string" && libIds.has(s.exerciseId) ? s.exerciseId : null;
          if (!id) {
            const name = String(s.exercise ?? s.exerciseName ?? s.name ?? "").trim();
            if (name) {
              id = await resolveExerciseId(c.env as ResolveEnv, who.tenantId, who.userId, name, cfg, allowExternal, cache, false);
              if (!id) dropped.push(name);
            }
          }
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
      error: dropped.length ? "None of the drafted exercises matched your library." : "The AI plan came back empty.",
      detail: dropped.length ? `off-library exercises the AI chose: ${[...new Set(dropped)].slice(0, 12).join(", ")}` : `parsed ${body.data.days.length} day(s) but no exercises resolved`,
      raw: result.output.slice(0, 2500),
      mocked: result.mocked,
    }, 422);
    return c.json({ draft: body.data, dropped: [...new Set(dropped)], credits: result.credits, mocked: result.mocked });
  })

  /**
   * Snap-a-Meal (SPEC §6): a photo (R2 key) → estimated food entries the
   * client confirms. Vision routing (Gemini) lands with the model-catalog
   * expansion; the metered path + mock are here now so the client flow works
   * end-to-end and the credits accounting is real.
   */
  .post("/ai/snap-meal", async (c) => {
    const who = requireTenant(c)!;
    const parsed = z.object({ clientId: z.string(), imageKey: z.string().max(300), hint: z.string().max(200).default("") }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    { const g = await gateFeature(c, "aiMealTools", access.client.id); if (g) return g; }
    { const g = await clientBudgetGate(c, who.userId); if (g) return g; }
    // The image must be a same-tenant R2 object AND (for a client) one the client
    // actually owns — not just any same-tenant key.
    if (!parsed.data.imageKey.startsWith(`t/${who.tenantId}/`)) return c.json({ error: "invalid image" }, 400);
    if (!(await clientMayUseMedia(c, parsed.data.imageKey, access.client.id, who.userId))) return c.json({ error: "invalid image" }, 403);
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
    // Staff bypass the client-flag; a client persona is gated on aiMealTools
    // (Label Reader is a food tool) against their own record + the daily budget.
    const mine = c.get("role") === "client" ? await clientForUser(c.env.DB, who.tenantId, who.userId) : null;
    { const gate = await gateFeature(c, "aiMealTools", mine?.id); if (gate) return gate; }
    { const g = await clientBudgetGate(c, who.userId); if (g) return g; }
    const parsed = z.object({ imageKey: z.string().max(300) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    if (!parsed.data.imageKey.startsWith(`t/${who.tenantId}/`)) return c.json({ error: "invalid image" }, 400);
    if (!(await clientMayUseMedia(c, parsed.data.imageKey, mine?.id ?? null, who.userId))) return c.json({ error: "invalid image" }, 403);
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
    { const gate = await gateFeature(c, "aiSuite"); if (gate) return gate; }
    const parsed = z.object({ clientId: z.string(), instructions: z.string().max(2000).default("") }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    // Deep client understanding + the real food library the model must build from.
    const [ctx, foodLib, examples] = await Promise.all([
      buildClientContext(c.env, access.client, { today: new Date().toISOString().slice(0, 10), hour: 12, units: await unitsFor(c.env.DB, who.userId), sections: ["client", "preferences", "goal", "body", "nutrition"] }),
      foodLibraryForPrompt(c.env.DB, who.tenantId),
      mealPlanExamples(c.env.DB, who.tenantId),
    ]);
    if (foodLib.count === 0) return c.json({ error: "Your food library is empty — add foods first so the AI can build meals from them.", detail: "meal generation only uses foods that exist in your library" }, 409);
    const s = foodLib.sample;
    const prompt = [
      ctx.text,
      `FOOD LIBRARY — you MUST build meals ONLY from these foods, each referenced by its id (format "foodId: name — macros per serving"):`,
      foodLib.text,
      examples,
      parsed.data.instructions && `COACH INSTRUCTIONS: ${parsed.data.instructions}`,
    ].filter(Boolean).join("\n");

    const result = await generate(c.env, {
      tenantId: who.tenantId,
      actorUserId: who.userId,
      clientId: access.client.id,
      feature: "draft-meal",
      task: "text",
      expectsJson: true,
      system: sys("draft-meal"),
      prompt,
      maxOutputTokens: 1536,
      // Mock builds valid options straight from the fed library (real ids).
      mock: () => JSON.stringify({ mealOptions: [
        { mealType: "breakfast", mealName: s[0] ? `${s[0].name} bowl` : "Breakfast", isFree: false, foods: s[0] ? [{ foodId: s[0].id, quantity: s[0].serving_size || 100, unit: s[0].serving_unit || "g" }] : [] },
        { mealType: "lunch", mealName: s[1] ? `${s[1].name} plate` : "Lunch", isFree: false, foods: (s[1] ? [{ foodId: s[1].id, quantity: s[1].serving_size || 100, unit: s[1].serving_unit || "g" }] : []).concat(s[0] ? [{ foodId: s[0].id, quantity: s[0].serving_size || 100, unit: s[0].serving_unit || "g" }] : []) },
        { mealType: "dinner", mealName: s[2] ? `${s[2].name} dinner` : "Dinner", isFree: false, foods: s[2] ? [{ foodId: s[2].id, quantity: s[2].serving_size || 100, unit: s[2].serving_unit || "g" }] : (s[0] ? [{ foodId: s[0].id, quantity: s[0].serving_size || 100, unit: s[0].serving_unit || "g" }] : []) },
      ] }),
    });
    if (!result.ok) return aiFail(c, result);
    const draft = extractJson<{ mealOptions: DraftMealOption[] }>(result.output);
    if (!draft?.mealOptions) return c.json({ error: "The AI didn't return valid meals.", raw: result.output.slice(0, 1800), mocked: result.mocked }, 422);
    // Resolve each drafted food to a REAL library id (fed id → library name match),
    // never a fabricated row. Off-library foods are dropped and reported.
    // Never spend a live web-import on mock output. Keyed off THIS generation's
    // `mocked` flag rather than the stored `ai.mock` value: since the mock lane
    // is development-only, a stale `ai.mock = "on"` row in production must not
    // quietly disable a feature the tenant paid for.
    const allowExternal = (await hasFeature(c.env.DB, who.tenantId, "externalSearch")) && !result.mocked;
    const cfg = await tenantIntegrations(c.env.DB, who.tenantId);
    const { options: resolved, dropped } = await resolveMealFoods(c.env as ResolveEnv, who.tenantId, who.userId, cfg, allowExternal, draft.mealOptions, foodLib.ids);
    return c.json({ draft: { customMealTypes: [], mealOptions: resolved }, dropped: [...new Set(dropped)], credits: result.credits, mocked: result.mocked });
  })

  /** Check-in Summarizer: recent check-ins → digest + suggested reply (trainer). */
  .post("/ai/summarize-checkins", async (c) => {
    const who = requireTenant(c)!;
    const role = c.get("role");
    if (role !== "owner" && role !== "trainer") return c.json({ error: "forbidden" }, 403);
    { const gate = await gateFeature(c, "aiSuite"); if (gate) return gate; }
    const parsed = z.object({ clientId: z.string() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const rows = await c.env.DB.prepare("SELECT date_local, weight_kg, mood, energy, stress, sleep_hours, notes FROM check_ins WHERE client_id = ? ORDER BY date_local DESC LIMIT 14").bind(access.client.id).all();
    if ((rows.results ?? []).length === 0) return c.json({ error: "no check-ins yet" }, 404);
    const ctx = await buildClientContext(c.env, access.client, { today: new Date().toISOString().slice(0, 10), hour: 12, units: await unitsFor(c.env.DB, who.userId) });

    const result = await generate(c.env, {
      tenantId: who.tenantId,
      actorUserId: who.userId,
      clientId: access.client.id,
      feature: "checkin-reply",
      task: "text-small",
      expectsJson: true,
      system: sys("checkin-reply"),
      prompt: [ctx.text, untrusted("RAW CHECK-INS (last 14)", JSON.stringify(rows.results))].join("\n\n"),
      maxOutputTokens: 400,
      mock: () => JSON.stringify({ summary: `${access.client.display_name} checked in ${(rows.results ?? []).length} times recently. Mood and sleep look steady; weight trending as expected.`, suggestedReply: "Great consistency this week — keep the sleep dialed in and let's push the next session." }),
    });
    if (!result.ok) return aiFail(c, result);
    const out = extractJson<{ summary: string; suggestedReply: string }>(result.output);
    if (!out) return c.json({ error: "The AI response couldn't be parsed.", raw: result.output.slice(0, 1500), mocked: result.mocked }, 422);
    return c.json({ ...out, credits: result.credits, mocked: result.mocked });
  })

  /** Progress Narrative: the client's own knowledge base → readable recap
   *  (client or trainer). Built server-side from `buildClientContext` — never
   *  from numbers the client's device supplies (which could be stale or spoofed);
   *  any `stats` still sent are appended only as optional colour. */
  .post("/ai/narrative", async (c) => {
    const who = requireTenant(c)!;
    const parsed = z.object({ clientId: z.string(), stats: z.record(z.string(), z.unknown()).optional() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    { const g = await gateFeature(c, "aiCoachInsights", access.client.id); if (g) return g; }
    { const g = await clientBudgetGate(c, who.userId); if (g) return g; }
    const ctx = await buildClientContext(c.env, access.client, { today: new Date().toISOString().slice(0, 10), hour: 12, units: await unitsFor(c.env.DB, who.userId) });
    const result = await generate(c.env, {
      tenantId: who.tenantId,
      actorUserId: who.userId,
      clientId: access.client.id,
      feature: "narrative",
      task: "text-small",
      system: sys("narrative"),
      prompt: [ctx.text, parsed.data.stats && Object.keys(parsed.data.stats).length ? untrusted("EXTRA STATS FROM APP", JSON.stringify(parsed.data.stats)) : null].filter(Boolean).join("\n\n"),
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
    { const gate = await gateFeature(c, "aiSuite"); if (gate) return gate; }
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
      // The mock markers carry a SIMULATED prefix IN THE MARKER NAME. This is
      // fabricated clinical data that pre-fills an editable review sheet the
      // coach then saves into the client's chart, from where it reaches the
      // `LABS:` prompt block and the supplement recommender. The prefix travels
      // with the value through every one of those surfaces, so simulated output
      // can never be mistaken for a real result — no real model emits it, and
      // the mock lane is development-only (see ai.ts / shouldUseMockLane).
      mock: () => JSON.stringify({ values: [
        { marker: "SIMULATED — not real data (Vitamin D, 25-OH)", value: "22", unit: "ng/mL", refRange: "30-100", flag: "low" },
        { marker: "SIMULATED — not real data (Ferritin)", value: "85", unit: "ng/mL", refRange: "30-400", flag: "normal" },
        { marker: "SIMULATED — not real data (Total Testosterone)", value: "410", unit: "ng/dL", refRange: "300-1000", flag: "normal" },
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
    { const gate = await gateFeature(c, "aiSuite"); if (gate) return gate; }
    const parsed = z.object({ clientId: z.string() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    // Full picture: the client's whole context (goals, targets, nutrition &
    // training adherence, measurements, check-ins, plans, active stack) PLUS the
    // complete reviewed lab panel and any paused supplements — so the reco reads
    // every data source, not just a handful of labs.
    const units = await unitsFor(c.env.DB, who.userId);
    const [ctx, labs, supps] = await Promise.all([
      buildClientContext(c.env, access.client, { today: new Date().toISOString().slice(0, 10), hour: 12, units }),
      c.env.DB.prepare("SELECT display_name, values_json FROM lab_tests WHERE client_id = ? AND status = 'reviewed' ORDER BY created_at DESC LIMIT 30").bind(access.client.id).all<{ display_name: string; values_json: string | null }>(),
      c.env.DB.prepare("SELECT name, dose, status FROM supplements WHERE client_id = ? AND status IN ('active','paused')").bind(access.client.id).all<{ name: string; dose: string | null; status: string }>(),
    ]);
    const labText = (labs.results ?? []).map((l) => `${l.display_name}: ${(parseJson<{ marker: string; value: string; unit?: string; flag?: string }[]>(l.values_json, [])).map((v) => `${v.marker} ${v.value}${v.unit ?? ""}${v.flag && v.flag !== "normal" ? ` (${v.flag})` : ""}`).join(", ")}`).join("\n");
    const stackText = (supps.results ?? []).map((s) => `${s.name}${s.dose ? ` ${s.dose}` : ""}${s.status === "paused" ? " (paused)" : ""}`).join(", ") || "none";
    const prompt = [ctx.text, `CURRENT SUPPLEMENTS (incl paused): ${stackText}`, `FULL REVIEWED LAB PANEL:\n${labText || "none on file"}`, "Recommend supplements now — address any flagged lab markers and the client's goal, and don't re-suggest anything already in their stack."].join("\n\n");

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

  /** Supplement Guide (client-facing): the client's OWN active stack → a warm,
   *  plain-language explainer of what each supports + timing tips. Educational,
   *  never prescriptive (starting/stopping/dosing is the coach's call). Gated by
   *  the client's aiCoachInsights package flag; staff bypass. */
  .post("/ai/supplement-guide", async (c) => {
    const who = requireTenant(c)!;
    { const gate = await gateFeature(c, "aiSuite"); if (gate) return gate; }
    const parsed = z.object({ clientId: z.string() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    if (c.get("role") === "client") {
      const flags = await resolveClientFlagsFor(c.env.DB, who.tenantId, access.client.id);
      if (!flags.aiCoachInsights) return c.json({ error: "not included in your current plan" }, 403);
    }
    { const g = await clientBudgetGate(c, who.userId); if (g) return g; }
    const supps = await c.env.DB.prepare("SELECT name, dose, schedule_json FROM supplements WHERE client_id = ? AND status = 'active'").bind(access.client.id).all<{ name: string; dose: string | null; schedule_json: string | null }>();
    if (!(supps.results ?? []).length) return c.json({ guide: "" });
    // Full client understanding from the knowledge base (goal, diet, body, labs)
    // so the guide connects each supplement to what it supports for THIS client.
    const ctx = await buildClientContext(c.env, access.client, { today: new Date().toISOString().slice(0, 10), hour: 12, units: await unitsFor(c.env.DB, who.userId), sections: ["client", "preferences", "goal", "body", "labs"] });
    const stack = (supps.results ?? []).map((s) => {
      const sched = parseJson<{ slot: string }[]>(s.schedule_json, []).map((x) => x.slot.replace(/_/g, " ")).join(", ");
      return `- ${s.name}${s.dose ? ` (${s.dose})` : ""}${sched ? ` — ${sched}` : ""}`;
    }).join("\n");
    const prompt = [ctx.text, `YOUR SUPPLEMENTS:\n${stack}`].join("\n");
    const result = await generate(c.env, {
      tenantId: who.tenantId, actorUserId: who.userId, clientId: access.client.id,
      feature: "supplement-guide", task: "text-small", system: sys("supplement-guide"), prompt, maxOutputTokens: 500,
      mock: () => (supps.results ?? []).map((s) => `${s.name}: supports your training goal — take it consistently, ideally with a meal.`).join("\n") + "\n\nOverall: keep timing consistent and pair with food where it helps absorption. Ask your coach before changing anything.",
    });
    if (!result.ok) return aiFail(c, result);
    return c.json({ guide: result.output.trim(), credits: result.credits, mocked: result.mocked });
  })

  /** Article Writer: a topic → a drafted knowledge-base article (trainer). */
  .post("/ai/article", async (c) => {
    const who = requireTenant(c)!;
    const role = c.get("role");
    if (role !== "owner" && role !== "trainer") return c.json({ error: "forbidden" }, 403);
    { const gate = await gateFeature(c, "aiSuite"); if (gate) return gate; }
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
    { const gate = await gateFeature(c, "aiSuite"); if (gate) return gate; }
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
    { const gate = await gateFeature(c, "aiSuite"); if (gate) return gate; }
    const parsed = z.object({
      feature: z.enum(["food-image", "exercise-image", "cover-image", "workout-day-image", "meal-image"]),
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
    // Food/meal shots want realistic colour with only a hint of brand (plating);
    // day covers want the accent to dominate.
    const brandLine = brandColor
      ? feature === "meal-image" || feature === "food-image"
        ? ` Style the plating, tableware or garnish with subtle touches of the colour ${brandColor}.`
        : ` Use the colour ${brandColor} as the dominant accent hue throughout the image.`
      : "";

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
    // Client persona gated on aiMealTools (food tool) against their own record;
    // staff bypass the flag. Plus the per-client daily budget.
    const mine = c.get("role") === "client" ? await clientForUser(c.env.DB, who.tenantId, who.userId) : null;
    { const gate = await gateFeature(c, "aiMealTools", mine?.id); if (gate) return gate; }
    { const g = await clientBudgetGate(c, who.userId); if (g) return g; }
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

  /** Activity calorie estimate (client-facing) — for when the user doesn't have
   *  the number from their watch/Whoop/Apple Health. Grounded on the client's
   *  body + training so the estimate fits THEM, not a generic MET table. */
  .post("/ai/activity-estimate", async (c) => {
    const who = requireTenant(c)!;
    const parsed = z
      .object({ clientId: z.string(), activityKey: z.string().max(40).optional(), label: z.string().max(80).optional(), durationMin: z.number().int().positive().nullish(), reps: z.number().int().positive().nullish(), avgHrBpm: z.number().int().positive().nullish(), distanceM: z.number().min(0).nullish() })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const p = parsed.data;
    if (!p.durationMin && !p.reps && !p.distanceM) return c.json({ error: "give a duration, count or distance to estimate from" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    // `clientAi` composes aiSuite ∩ canUseAi from the registry, so the pairing
    // can't drift (it replaces a hand-rolled gateFeature + requireClientFlag pair
    // here). A client excluded from AI can't spend the tenant's credits.
    { const g = await gateFeature(c, "clientAi", access.client.id); if (g) return g; }
    { const g = await clientBudgetGate(c, who.userId); if (g) return g; }
    const activityLabel = p.label?.trim() || activityByKey(p.activityKey ?? "other").label;
    const ctx = await buildClientContext(c.env, access.client, { today: new Date().toISOString().slice(0, 10), hour: 12, units: await unitsFor(c.env.DB, who.userId), sections: ["client", "body", "training"] });
    const detail = `ACTIVITY: ${activityLabel}${p.durationMin ? `, ${p.durationMin} min` : ""}${p.reps ? `, ${p.reps} reps` : ""}${p.distanceM ? `, ${(p.distanceM / 1000).toFixed(2)} km` : ""}${p.avgHrBpm ? `, avg HR ${p.avgHrBpm} bpm` : ""}.`;
    const result = await generate(c.env, {
      tenantId: who.tenantId, actorUserId: who.userId, clientId: access.client.id,
      feature: "activity-estimate", task: "text-small", expectsJson: true, system: sys("activity-estimate"),
      prompt: [ctx.text, detail, "Estimate the calories burned and speak to them directly."].join("\n\n"), maxOutputTokens: 200,
      mock: () => {
        const kg = ctx.knowledge.body.weightKg ?? 75;
        const kcal = p.durationMin
          ? estimateBurnedCalories({ met: activityByKey(p.activityKey ?? "other").met, weightKg: kg, durationMin: p.durationMin, avgHrBpm: p.avgHrBpm })
          : Math.round((p.reps ?? 0) * (kg / 75) * 0.5);
        return JSON.stringify({ calories: kcal || Math.round((p.durationMin ?? 0) * 7) || 30, avgHrBpm: p.avgHrBpm ?? null, rationale: `At your weight, ${activityLabel.toLowerCase()}${p.durationMin ? ` for ${p.durationMin} min` : p.reps ? ` × ${p.reps}` : ""} lands around here.` });
      },
    });
    if (!result.ok) return aiFail(c, result);
    const out = extractJson<{ calories?: number; avgHrBpm?: number | null; rationale?: string }>(result.output);
    if (!out || typeof out.calories !== "number" || !(out.calories >= 0)) return c.json({ error: "Couldn't estimate that activity.", raw: result.output.slice(0, 800), mocked: result.mocked }, 422);
    return c.json({ calories: Math.round(out.calories), avgHrBpm: out.avgHrBpm ?? null, rationale: out.rationale ?? "", credits: result.credits, mocked: result.mocked });
  })

  /** Recommend a recipe from a meal option's foods (client-facing). */
  .post("/ai/recipe", async (c) => {
    const who = requireTenant(c)!;
    const parsed = z.object({
      clientId: z.string(),
      mealName: z.string().max(120).default(""),
      foods: z.array(z.object({ name: z.string().min(1).max(120), quantity: z.number().nullish(), unit: z.string().max(20).nullish() })).min(1).max(12),
    }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    { const g = await gateFeature(c, "aiMealTools", access.client.id); if (g) return g; }
    { const g = await clientBudgetGate(c, who.userId); if (g) return g; }
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
    { const gate = await gateFeature(c, "aiSuite"); if (gate) return gate; }
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
    { const gate = await gateFeature(c, "aiSuite"); if (gate) return gate; }
    const parsed = z.object({ name: z.string().min(1).max(120) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    // Enum-constrained schema → the model can only return our slugs (Gemini
    // responseSchema + Workers AI json_schema). The normalizer below stays as a
    // backstop for any provider that ignores the enum.
    const result = await generate(c.env, {
      tenantId: who.tenantId, actorUserId: who.userId, feature: "exercise-meta", task: "text", expectsJson: true, jsonSchema: EXERCISE_META_SCHEMA,
      system: sys("exercise-meta"),
      prompt: exerciseMetaPrompt(parsed.data.name),
      maxOutputTokens: 300,
      mock: EXERCISE_META_MOCK,
    });
    if (!result.ok) return aiFail(c, result);
    const raw = extractJson<Record<string, unknown>>(result.output);
    if (!raw) return c.json({ error: "The AI didn't return valid details.", raw: result.output.slice(0, 800), mocked: result.mocked }, 422);
    const meta = foldExerciseMeta(raw);
    return c.json({ meta, credits: result.credits, mocked: result.mocked });
  })

  /** Client Summary: full context → a concise coach-facing status (trainer). */
  .post("/ai/client-summary", async (c) => {
    const who = requireTenant(c)!;
    const role = c.get("role");
    if (role !== "owner" && role !== "trainer") return c.json({ error: "forbidden" }, 403);
    { const gate = await gateFeature(c, "aiSuite"); if (gate) return gate; }
    const parsed = z.object({ clientId: z.string(), today: z.string().optional(), hour: z.coerce.number().int().min(0).max(23).optional() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const units = await unitsFor(c.env.DB, who.userId);
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
      .object({ clientId: z.string(), surface: z.enum(["home", "train", "eat", "wellness", "progress"]).default("home"), today: z.string().optional(), hour: z.coerce.number().int().min(0).max(23).optional() })
      .safeParse({ clientId: c.req.query("clientId"), surface: c.req.query("surface"), today: c.req.query("today"), hour: c.req.query("hour") });
    if (!parsed.success) return c.json({ error: "invalid query" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    // AI insights are a per-package client capability — a client whose plan
    // excludes them simply gets no note (graceful, not a 403). Staff bypass.
    if (c.get("role") === "client") {
      const flags = await resolveClientFlagsFor(c.env.DB, who.tenantId, access.client.id);
      if (!flags.aiCoachInsights) return c.json({ message: null });
    }
    const surface = parsed.data.surface;
    // Validate + clamp the client-supplied local date to ±1 day of server time —
    // an arbitrary `today` would otherwise mint a distinct cache key (and a fresh
    // paid generation) per request, defeating the 1h cache.
    const today = safeLocalDate(parsed.data.today);
    const hour = parsed.data.hour ?? 12;

    const units = await unitsFor(c.env.DB, c.get("user")!.id);
    const ctx = await buildClientContext(c.env, access.client, { today, hour, units });

    // Content-hash cache: material change → new key → fresh; else 1h reuse.
    const cacheKey = `ai:note:v1:${access.client.id}:${surface}:${ctx.signalHash}`;
    const hit = await c.env.CACHE.get(cacheKey, "json").catch(() => null);
    if (hit && typeof (hit as { message?: string }).message === "string") return c.json({ message: (hit as { message: string }).message, cached: true });

    // A cache MISS is the only path that spends credits — enforce the client's
    // daily budget here (cache hits above stay free and unthrottled).
    { const g = await clientBudgetGate(c, c.get("user")!.id); if (g) return c.json({ message: null }); }

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
    if (d.data.geminiKey) {
      const prev = await getConfig(c.env.DB);
      await setConfig(c.env.DB, "google.gemini_key", d.data.geminiKey.trim());
      // First real key configured → any cached TTS cues were necessarily voiced
      // by the keyless mock lane (silent WAVs). Drop them so the owner
      // regenerates a real voice pack instead of being stuck with silence.
      if (!prev["google.gemini_key"]) await c.env.DB.prepare("DELETE FROM tts_cues").run().catch(() => undefined);
    }
    // `mockMode: "on"` is a DEVELOPMENT-ONLY override. Persisting it in
    // production used to be a one-click switch that made every AI route return
    // fabricated output — clinical `lab-extract` markers included — and bill the
    // tenant credits for it. Refuse the write here (so the console can't create
    // the state) AND ignore a stored "on" at the read point in ai.ts (so a
    // hand-edited app_config row or a restored backup can't either). Defence in
    // depth: this route is only one of the ways the row can be set.
    if (d.data.mockMode) {
      if (!mockModeSettable(d.data.mockMode, c.env.ENVIRONMENT === "development")) {
        return c.json({ error: "mock mode cannot be turned on outside development — it fabricates output (including lab values) and bills credits for it" }, 400);
      }
      await setConfig(c.env.DB, "ai.mock", d.data.mockMode);
    }
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
   * Google Gemini). See `syncModelCatalog` for exactly what it does.
   */
  .post("/admin/ai/models/sync", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const cfg = await getConfig(c.env.DB);
    const report = await syncModelCatalog(c.env.DB, { markup: globalMarkup(cfg), fetchMd: fetchPricingDoc });
    // 502 only when NEITHER provider produced a usable parse — a one-sided
    // failure still applied real work and must return it, not a bare error.
    return c.json(report, report.ok ? 200 : 502);
  })

  /**
   * AI self-test (platform admin) — the plan. What the suite would run against
   * the chosen scope, and what it will COST, so the operator sees the bill
   * before the button spends it.
   */
  .get("/admin/ai/selftest", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const tenantId = c.get("tenantId");
    if (!tenantId) return c.json({ error: "switch into a studio first — the self-test spends that studio's credits" }, 400);
    const q = SelfTestScope.safeParse({ scope: c.req.query("scope"), provider: c.req.query("provider"), modelId: c.req.query("modelId") });
    if (!q.success) return c.json({ error: "invalid query" }, 400);
    const plan = await planSelfTest(c.env, q.data);
    return c.json(plan);
  })

  /**
   * AI self-test (platform admin) — run it. Every check goes through the real
   * metered `generate()` (reserve → run → settle) and is validated with the
   * product's own parser, so a 200 that returns prose instead of JSON is a
   * FAILURE here exactly as it is for a coach.
   */
  .post("/admin/ai/selftest", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const who = requireTenant(c);
    if (!who) return c.json({ error: "switch into a studio first — the self-test spends that studio's credits" }, 400);
    const body = z
      .object({
        runs: z.array(z.object({ check: z.string().max(40), modelId: z.string().max(200) })).max(MAX_SELFTEST_RUNS).optional(),
        scope: z.enum(["default", "compare", "provider", "model", "all"]).optional(),
        provider: z.enum(["workers-ai", "google"]).optional(),
        modelId: z.string().max(200).optional(),
      })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid body" }, 400);

    let runs = body.data.runs ?? [];
    if (!runs.length) {
      const plan = await planSelfTest(c.env, { scope: body.data.scope ?? "default", provider: body.data.provider, modelId: body.data.modelId });
      runs = plan.runs.map((r) => ({ check: r.check, modelId: r.modelId }));
    }
    if (!runs.length) return c.json({ error: "nothing to run — no enabled model matches that scope" }, 400);

    const started = Date.now();
    const results: SelfTestResult[] = [];
    let stopped: string | null = null;
    for (const run of runs) {
      const check = SELF_TEST_CHECKS.find((x) => x.key === run.check);
      if (!check) continue;
      const r = await runSelfTestCheck(c.env, who.tenantId, who.userId, check, run.modelId);
      results.push(r);
      // Out of credits: every later run would fail identically and each one
      // still costs a round trip. Stop and say so.
      if (r.failure === "insufficient_credits") { stopped = "Stopped early — the studio ran out of AI credits."; break; }
    }
    return c.json({
      results,
      totalCredits: results.reduce((n, r) => n + r.credits, 0),
      passed: results.filter((r) => r.status === "pass").length,
      failed: results.filter((r) => r.status === "fail").length,
      mocked: results.some((r) => r.mocked),
      durationMs: Date.now() - started,
      stopped,
    });
  });

// ── Model-catalog sync ───────────────────────────────────────────────────────

export const PRICING_SOURCES = {
  "workers-ai": "https://developers.cloudflare.com/workers-ai/platform/pricing/index.md",
  google: "https://ai.google.dev/gemini-api/docs/pricing.md.txt",
} as const;

export interface FetchedDoc { md: string | null; error: string | null }

/** Fetch one pricing doc. Separated from the sync so the sync's reconciliation
 *  logic is testable without the network. */
export async function fetchPricingDoc(url: string): Promise<FetchedDoc> {
  try {
    const r = await fetch(url, { headers: { accept: "text/markdown" } });
    if (!r.ok) return { md: null, error: `HTTP ${r.status}` };
    return { md: await r.text(), error: null };
  } catch (e) {
    return { md: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface ProviderSyncReport {
  provider: "workers-ai" | "google";
  source: string;
  /** The doc was fetched AND parsed into at least one model. */
  ok: boolean;
  /** Models priced from the page. */
  parsed: number;
  /** Ids that were not in the catalog before this sync. */
  added: number;
  addedIds: string[];
  /** Existing ids whose rates/label were refreshed. */
  updated: number;
  /** Enabled ids that vanished from the source and were switched off. */
  disabled: number;
  disabledIds: string[];
  /** Rows the page lists but the catalog cannot price, and why. */
  unpriceable: SkippedModel[];
  error: string | null;
}

export interface SyncReport {
  ok: boolean;
  providers: ProviderSyncReport[];
  total: number;
  errors: string[];
}

/**
 * Reconcile the model catalog against the two official pricing docs.
 *
 * Per provider, independently (a Cloudflare failure must never touch a single
 * Gemini row, and vice versa):
 *   • DISCOVER — every priceable row on the page is upserted. New ids land in
 *     the catalog; runnable lanes (text / text-small / vision / image / speech)
 *     arrive ENABLED, the rest (embedding / transcribe / tts / classify) arrive
 *     disabled, because no code path here can execute them.
 *   • REFRESH — an existing row's label + rates are updated. `task`, `enabled`,
 *     `is_default` and `markup` are NOT touched: those are operator/seed
 *     decisions and the page's own lane guess would silently re-route traffic
 *     (it used to retask `gemini-2.5-flash` to text-small, pushing every text
 *     feature onto the ~8× pricier `gemini-2.5-pro`).
 *   • RECONCILE — an ENABLED row of that provider that is absent from a good
 *     parse is switched off (`enabled = 0, is_default = 0`). Never deleted: a
 *     tenant's `ai_config_json` may still name it and `ai_generations` history
 *     must stay readable. Only runs when that provider's fetch AND parse
 *     succeeded, so a 404 on one doc cannot disable the other provider's models.
 *
 * A provider that fetched but parsed ZERO models is treated as a parse failure,
 * not as "the provider has no models" — a doc-format change would otherwise
 * disable the whole catalog in one click.
 */
export async function syncModelCatalog(
  db: D1Database,
  opts: { markup: number; fetchMd: (url: string) => Promise<FetchedDoc> },
): Promise<SyncReport> {
  await seedAiModels(db);
  const existing = await db.prepare("SELECT id, provider, enabled FROM ai_models").all<{ id: string; provider: string; enabled: number }>();
  const known = new Map((existing.results ?? []).map((r) => [r.id, r]));

  const providers: ProviderSyncReport[] = [];
  const errors: string[] = [];

  for (const provider of ["workers-ai", "google"] as const) {
    const source = PRICING_SOURCES[provider];
    const report: ProviderSyncReport = { provider, source, ok: false, parsed: 0, added: 0, addedIds: [], updated: 0, disabled: 0, disabledIds: [], unpriceable: [], error: null };
    providers.push(report);

    const doc = await opts.fetchMd(source);
    if (!doc.md) {
      report.error = `couldn't fetch the pricing page (${doc.error ?? "unknown error"}) — every ${provider} model was left exactly as it was`;
      errors.push(`${provider}: ${report.error}`);
      continue;
    }
    const parsedDoc = provider === "workers-ai" ? parseWorkersAiCatalog(doc.md) : parseGeminiCatalog(doc.md);
    report.unpriceable = parsedDoc.skipped;
    report.parsed = parsedDoc.models.length;
    if (parsedDoc.models.length === 0) {
      report.error = "the page fetched but 0 models parsed — the doc format has probably changed; nothing was written or disabled";
      errors.push(`${provider}: ${report.error}`);
      continue;
    }

    for (const m of parsedDoc.models) {
      if (known.has(m.id)) report.updated++;
      else { report.added++; report.addedIds.push(m.id); }
    }

    await db.batch(parsedDoc.models.map((m) =>
      db.prepare(
        `INSERT INTO ai_models (id, task, label, provider, input_rate, output_rate, unit_rate, unit_kind, markup, enabled, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET label = excluded.label, provider = excluded.provider,
           input_rate = excluded.input_rate, output_rate = excluded.output_rate, unit_rate = excluded.unit_rate, unit_kind = excluded.unit_kind`,
      ).bind(m.id, m.task, m.label, m.provider, m.inputRate, m.outputRate, m.unitRate, m.unitKind, opts.markup, isRunnableTask(m.task) ? 1 : 0),
    ));

    const live = new Set(parsedDoc.models.map((m) => m.id));
    const gone = (existing.results ?? []).filter((r) => r.provider === provider && r.enabled === 1 && !live.has(r.id)).map((r) => r.id);
    if (gone.length) {
      const ph = gone.map(() => "?").join(",");
      await db.prepare(`UPDATE ai_models SET enabled = 0, is_default = 0 WHERE id IN (${ph})`).bind(...gone).run();
      report.disabled = gone.length;
      report.disabledIds = gone;
    }
    report.ok = true;
  }

  // Guarantee a default per generation task (cheapest output among enabled).
  // Runs AFTER reconciliation so a task whose default was just switched off
  // immediately re-elects instead of leaving the lane defaultless.
  for (const task of ["text", "text-small", "vision"]) {
    const has = await db.prepare("SELECT 1 x FROM ai_models WHERE task = ? AND enabled = 1 AND is_default = 1").bind(task).first();
    if (!has) await db.prepare("UPDATE ai_models SET is_default = 1 WHERE id = (SELECT id FROM ai_models WHERE task = ? AND enabled = 1 ORDER BY output_rate ASC LIMIT 1)").bind(task).run();
  }

  return { ok: providers.some((p) => p.ok), providers, total: (await listModels(db)).length, errors };
}

// ── AI self-test (platform admin) ────────────────────────────────────────────
//
// A live diagnostic that runs the PRODUCT'S OWN prompts through the PRODUCT'S
// OWN metered path and validates the answers with the PRODUCT'S OWN parsers.
// Three rules make it worth trusting:
//
//   1. It goes through `generate()` — reserve → run → settle. A diagnostic that
//      bypasses metering does not test the thing that breaks, so this SPENDS
//      REAL CREDITS from whichever studio the admin is switched into. The plan
//      endpoint quotes the upper bound before the button is pressed.
//   2. HTTP 200 is not a pass. A plan draft that comes back as prose, or with
//      invented exercise ids, is a FAILURE with a named reason — that is very
//      often what "the model isn't working" actually means.
//   3. A mocked result says so. In development the mock lane answers with canned
//      output; a green board that proves nothing is worse than a red one.

const MAX_SELFTEST_RUNS = 36;

const SelfTestScope = z.object({
  scope: z.enum(["default", "compare", "provider", "model", "all"]).default("default"),
  provider: z.enum(["workers-ai", "google"]).optional(),
  modelId: z.string().max(200).optional(),
});
type SelfTestScopeInput = z.infer<typeof SelfTestScope>;

/** A 64×64 PNG of a plated meal — three coloured masses on a white plate.
 *  Synthetic, not a photograph: enough to prove the vision transport, the
 *  provider's response shape and the Workers AI refusal, NOT enough to judge
 *  recognition quality. Bundled so every run is byte-identical. */
const TEST_IMAGE = {
  mimeType: "image/png",
  data:
    "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAABZUlEQVR42u3auw0CMQyAYU9EzQzUjMMIzIgoKOiRKFAKCqRrwjl27NiO76QM8H" +
    "8CQR6G2/0x9YIdkB1QymcaQCkf+goEYHWrS8AxXYUB7ulCBgRJ72ZAtHquAQLWswwQMJ3FgMj1FEN2gHrN+/XEF9cAZvXNdJzBBjjWswwWgI76" +
    "vwYGoNl0PR/WllY90cAGIOk1Q1hfG0gAef1iUAfUBgaAVf9bDgDFei0D/nNEAnTXqxi2BBhRLzfgm4vogOYOrwFQqe82ULaocQHEPXZQAP2QYA" +
    "eQnAcCAdSPaWDwEzQCsBgSfQI7gAQ4XY74igtoprMY0QFNg/VeiFvfNMwBQAym54Hu+jWD9YHGHyAxCOvZAF2DvL4GmN4L+QAUb+bUAdZ3o24A" +
    "xdvpofVG1+uDvv2mLzSD6k3fyEbUO7xSCv+2NvlOPP1LfYZZiSTTKhnmhTJMbCWZmUsytZhkbjTP5O4+/N2zvp6EWYW+Ub9eAAAAAElFTkSuQm" +
    "CC",
};

/** A small, fixed client picture so results are comparable run to run. */
const SAMPLE_CONTEXT = [
  "CLIENT: Sam Rivera — 34, male, 82.0 kg, 178 cm, intermediate lifter.",
  "GOAL: build muscle. Targets 2,700 kcal / 175 g protein / 300 g carbs / 80 g fat per day, 4 training days a week.",
  "EQUIPMENT: full commercial gym. TRAINING LOCATION: gym.",
  "LIMITATIONS: mild left-shoulder impingement — avoid heavy overhead pressing.",
  "RECENT: trained 3× last week, logged food 6 of 7 days, weight +0.4 kg over 14 days, sleep averaging 6h50m.",
].join("\n");

/** A fixed exercise library. The ids are deliberately synthetic: the draft-plan
 *  check asserts the model picked from THIS list, which is the same whitelist
 *  rule the real route enforces before a draft ever reaches a coach. */
const SAMPLE_LIBRARY = [
  { id: "exr_st_squat", name: "Barbell Back Squat", muscles: "quads, glutes", equipment: "barbell" },
  { id: "exr_st_rdl", name: "Romanian Deadlift", muscles: "hamstrings, glutes", equipment: "barbell" },
  { id: "exr_st_row", name: "Chest-Supported Row", muscles: "back, biceps", equipment: "dumbbell" },
  { id: "exr_st_press", name: "Incline Dumbbell Press", muscles: "chest, triceps", equipment: "dumbbell" },
  { id: "exr_st_pulldown", name: "Lat Pulldown", muscles: "back, biceps", equipment: "cable" },
  { id: "exr_st_curl", name: "Cable Curl", muscles: "biceps", equipment: "cable" },
  { id: "exr_st_plank", name: "Plank", muscles: "core", equipment: "bodyweight" },
];
const SAMPLE_LIB_IDS = new Set(SAMPLE_LIBRARY.map((e) => e.id));

const SAMPLE_CHECKINS = [
  { date_local: "2026-07-21", weight_kg: 82.0, mood: 4, energy: 3, stress: 3, sleep_hours: 6.5, notes: "Shoulder felt better this week." },
  { date_local: "2026-07-14", weight_kg: 81.6, mood: 3, energy: 3, stress: 4, sleep_hours: 6.9, notes: "Busy at work, missed one session." },
  { date_local: "2026-07-07", weight_kg: 81.4, mood: 4, energy: 4, stress: 2, sleep_hours: 7.4, notes: "Good week, hit all four sessions." },
];

export type SelfTestFailure =
  | "feature_off" | "not_configured" | "not_supported" | "insufficient_credits"
  | "transport" | "provider" | "empty" | "unparseable_json" | "schema";

export type SelfTestStatus = "pass" | "fail" | "unsupported" | "blocked";

export interface SelfTestResult {
  check: string;
  label: string;
  feature: string;
  task: "text" | "text-small" | "vision";
  modelId: string;
  modelLabel: string;
  provider: string;
  status: SelfTestStatus;
  failure: SelfTestFailure | null;
  /** The real reason, verbatim from the provider where there is one. */
  detail: string | null;
  latencyMs: number;
  credits: number;
  mocked: boolean;
  /** What the model actually said (truncated) — the point of the exercise. */
  excerpt: string;
  /** On a pass, what the validator got out of it. */
  summary: string | null;
}

type Validation =
  | { ok: true; summary: string }
  | { ok: false; failure: "unparseable_json" | "schema"; detail: string };

export interface SelfTestCheck {
  key: string;
  label: string;
  /** An AI_FEATURES key — the system prompt, tenant overrides and tone all come
   *  from the registry, exactly as they do for a real call. */
  feature: string;
  task: "text" | "text-small" | "vision";
  prompt: string;
  maxOutputTokens: number;
  expectsJson: boolean;
  jsonSchema?: Record<string, unknown>;
  image?: boolean;
  mock: () => string;
  validate: (output: string) => Validation;
}

const bad = (failure: "unparseable_json" | "schema", detail: string): Validation => ({ ok: false, failure, detail });

/** The six checks. One per shape of thing the product asks a model to do. */
export const SELF_TEST_CHECKS: SelfTestCheck[] = [
  {
    key: "draft-plan",
    label: "Workout plan draft",
    feature: "draft-plan",
    task: "text",
    maxOutputTokens: 3072,
    expectsJson: true,
    prompt: [
      SAMPLE_CONTEXT,
      `EXERCISE LIBRARY — you MUST choose exercises ONLY from this list, by id (format "exerciseId: name [muscles] {equipment}"):`,
      ...SAMPLE_LIBRARY.map((e) => `${e.id}: ${e.name} [${e.muscles}] {${e.equipment}}`),
      "COACH INSTRUCTIONS: a 2-day full-body split.",
    ].join("\n"),
    mock: () => JSON.stringify({
      days: [{
        name: "Full Body A",
        isRestDay: false,
        blocks: [{
          type: "single", rounds: null,
          slots: [{ exerciseId: "exr_st_squat", measurementMode: "reps", sets: [
            { setType: "warmup", reps: 10, weightMode: "unspecified", restAfterSec: 60 },
            { setType: "working", reps: 8, weightMode: "unspecified", restAfterSec: 90 },
          ] }],
        }],
      }],
    }),
    // The real route's contract: extractJson → a `days` array → every slot's
    // exerciseId whitelisted against the fed library → WorkoutBody.
    validate: (out) => {
      const raw = extractJson<{ days?: RawDay[] }>(out);
      if (!raw) return bad("unparseable_json", "no JSON found in the response — the model answered in prose");
      if (!Array.isArray(raw.days)) return bad("schema", 'parsed as JSON but there is no top-level "days" array');
      const invented: string[] = [];
      const days = raw.days.map((d) => ({
        name: d.name ?? "", dayNotes: d.dayNotes ?? null, isRestDay: !!d.isRestDay,
        blocks: (d.blocks ?? []).map((b) => ({
          type: b.type ?? "single", rounds: b.rounds ?? null,
          restBetweenExercisesSec: b.restBetweenExercisesSec ?? null, restBetweenRoundsSec: b.restBetweenRoundsSec ?? null,
          blockNotes: b.blockNotes ?? null,
          slots: (b.slots ?? []).flatMap((s) => {
            const id = typeof s.exerciseId === "string" && SAMPLE_LIB_IDS.has(s.exerciseId) ? s.exerciseId : null;
            if (!id) { invented.push(String(s.exerciseId ?? s.exercise ?? s.exerciseName ?? s.name ?? "?").slice(0, 40)); return []; }
            return [{ exerciseId: id, measurementMode: s.measurementMode ?? "reps", slotNotes: s.slotNotes ?? null, sets: Array.isArray(s.sets) ? s.sets : [] }];
          }),
        })).filter((b) => b.slots.length),
      }));
      const body = WorkoutBody.safeParse({ days });
      if (!body.success) return bad("schema", body.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "));
      const slots = body.data.days.reduce((n, d) => n + d.blocks.reduce((m, b) => m + b.slots.length, 0), 0);
      if (slots === 0) {
        return bad("schema", invented.length
          ? `every exercise was invented, none matched the library it was given: ${[...new Set(invented)].slice(0, 6).join(", ")}`
          : "parsed, but the plan contains no exercises");
      }
      return { ok: true, summary: `${body.data.days.length} day(s), ${slots} exercise slot(s)${invented.length ? `, ${new Set(invented).size} invented id(s) dropped` : ""}` };
    },
  },
  {
    key: "parse-food",
    label: "Natural-language food log",
    feature: "parse-food",
    task: "text-small",
    maxOutputTokens: 512,
    expectsJson: true,
    prompt: "two scrambled eggs, a slice of wholemeal toast with butter and a medium banana",
    mock: () => JSON.stringify([
      { label: "Scrambled eggs", mealType: "breakfast", calories: 180, proteinG: 13, carbsG: 2, fatG: 13, quantity: 2, unit: "egg" },
      { label: "Wholemeal toast with butter", mealType: "breakfast", calories: 150, proteinG: 4, carbsG: 18, fatG: 7, quantity: 1, unit: "slice" },
    ]),
    validate: (out) => {
      const entries = extractJson<unknown[]>(out);
      if (!entries) return bad("unparseable_json", "no JSON found in the response");
      if (!Array.isArray(entries)) return bad("schema", "parsed as JSON but it is not the array of entries the diary expects");
      const good = entries.filter((e) => {
        const o = (e ?? {}) as Record<string, unknown>;
        return typeof o.label === "string" && o.label.length > 0 && Number.isFinite(Number(o.calories));
      });
      if (!good.length) return bad("schema", `${entries.length} item(s), none with both a label and a numeric calorie value`);
      return { ok: true, summary: `${good.length} of ${entries.length} entries usable` };
    },
  },
  {
    key: "checkin-reply",
    label: "Check-in summary + reply",
    feature: "checkin-reply",
    task: "text-small",
    maxOutputTokens: 400,
    expectsJson: true,
    prompt: [SAMPLE_CONTEXT, untrusted("RAW CHECK-INS (last 14)", JSON.stringify(SAMPLE_CHECKINS))].join("\n\n"),
    mock: () => JSON.stringify({ summary: "Sam has checked in three weeks running with steady mood and a small upward weight trend. Sleep is the weak link at under 7h. No red flags.", suggestedReply: "Great consistency, Sam — three weeks straight. Let's get sleep closer to 7.5h and keep the same intent in the gym." }),
    validate: (out) => {
      const o = extractJson<{ summary?: unknown; suggestedReply?: unknown }>(out);
      if (!o) return bad("unparseable_json", "no JSON found in the response");
      const missing = ["summary", "suggestedReply"].filter((k) => typeof (o as Record<string, unknown>)[k] !== "string" || !String((o as Record<string, unknown>)[k]).trim());
      if (missing.length) return bad("schema", `missing or non-string field(s): ${missing.join(", ")}`);
      return { ok: true, summary: `summary ${String(o.summary).length} chars, reply ${String(o.suggestedReply).length} chars` };
    },
  },
  {
    key: "exercise-meta",
    label: "Exercise detail auto-fill",
    feature: "exercise-meta",
    task: "text",
    maxOutputTokens: 300,
    expectsJson: true,
    jsonSchema: EXERCISE_META_SCHEMA,
    prompt: exerciseMetaPrompt("Barbell Back Squat"),
    mock: EXERCISE_META_MOCK,
    validate: (out) => {
      const raw = extractJson<Record<string, unknown>>(out);
      if (!raw) return bad("unparseable_json", "no JSON found in the response");
      const meta = foldExerciseMeta(raw);
      if (!meta.primaryMuscles.length) return bad("schema", `no primary muscle survived the allowed-slug fold (model said: ${JSON.stringify(raw.primaryMuscles ?? null).slice(0, 80)})`);
      if (!meta.difficulty) return bad("schema", `difficulty was not one of beginner/intermediate/advanced (model said: ${JSON.stringify(raw.difficulty ?? null).slice(0, 40)})`);
      return { ok: true, summary: `${meta.primaryMuscles.join(", ")} · ${meta.equipment.join(", ") || "no equipment"} · ${meta.difficulty}` };
    },
  },
  {
    key: "food-meta",
    label: "Food nutrition estimate",
    feature: "food-meta",
    task: "text",
    maxOutputTokens: 300,
    expectsJson: true,
    prompt: "FOOD: grilled chicken breast\n\nEstimate its nutrition now.",
    mock: () => JSON.stringify({ servingSize: 100, servingUnit: "g", calories: 165, proteinG: 31, carbsG: 0, fatG: 4, fiberG: 0, sugarG: 0, sodiumMg: 74 }),
    validate: (out) => {
      const raw = extractJson<Record<string, unknown>>(out);
      if (!raw) return bad("unparseable_json", "no JSON found in the response");
      const n = (v: unknown) => { const x = typeof v === "string" ? parseFloat(v) : Number(v); return Number.isFinite(x) ? x : NaN; };
      const kcal = n(raw.calories);
      if (!(kcal > 0)) return bad("schema", `calories is not a positive number (model said: ${JSON.stringify(raw.calories ?? null).slice(0, 40)})`);
      if (!Number.isFinite(n(raw.proteinG))) return bad("schema", "proteinG is missing or not numeric");
      return { ok: true, summary: `${Math.round(kcal)} kcal / ${Math.round(n(raw.proteinG))} g protein per ${n(raw.servingSize) || 100}${raw.servingUnit === "ml" ? "ml" : "g"}` };
    },
  },
  {
    key: "snap-meal",
    label: "Snap-a-Meal (vision)",
    feature: "snap-meal",
    task: "vision",
    maxOutputTokens: 1024,
    expectsJson: true,
    image: true,
    prompt: "A photo of a meal. Identify the foods, estimate portions + macros, and give one short assessment as the JSON object.",
    mock: () => JSON.stringify({
      items: [{ label: "Grilled chicken breast", mealType: "lunch", calories: 280, proteinG: 52, carbsG: 0, fatG: 6, quantity: 170, unit: "g" }],
      note: "Solid protein anchor — add a carb source alongside it.",
    }),
    validate: (out) => {
      const raw = extractJson<{ items?: unknown[] } | unknown[]>(out);
      if (!raw) return bad("unparseable_json", "no JSON found in the response");
      const list = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : null;
      if (!list) return bad("schema", 'parsed as JSON but there is no "items" array');
      const good = list.filter((it) => {
        const o = (it ?? {}) as Record<string, unknown>;
        const num = (v: unknown) => { const x = typeof v === "string" ? parseFloat(v) : Number(v); return Number.isFinite(x) ? x : 0; };
        return typeof (o.label ?? o.name) === "string" && (num(o.calories) > 0 || num(o.proteinG) > 0 || num(o.carbsG) > 0 || num(o.fatG) > 0);
      });
      if (!good.length) return bad("schema", `${list.length} item(s), none with a label and at least one macro above zero`);
      return { ok: true, summary: `${good.length} food item(s) read from the image` };
    },
  },
];

export const selfTestCheck = (key: string): SelfTestCheck | undefined => SELF_TEST_CHECKS.find((c) => c.key === key);

/**
 * Grade one model answer exactly as the endpoint reports it. Split out so the
 * verdict can be exercised on hand-written model output: in the mock lane a
 * check can never fail validation (a feature's `mock` is contractually required
 * to return output that passes its own parser — AGENTS §6.3), so this is the
 * only way to prove that a 200 carrying prose, or JSON of the wrong shape, is
 * reported as a FAILURE with a named reason instead of a pass.
 */
export function evaluateSelfTestOutput(check: SelfTestCheck, output: string): {
  status: SelfTestStatus; failure: SelfTestFailure | null; detail: string | null; summary: string | null;
} {
  if (!output.trim()) return { status: "fail", failure: "empty", detail: "the call succeeded but the response body was empty", summary: null };
  const v = check.validate(output);
  if (!v.ok) return { status: "fail", failure: v.failure, detail: v.detail, summary: null };
  return { status: "pass", failure: null, detail: null, summary: v.summary };
}

/** Map a `generate()` refusal onto a named cause. The Workers AI vision refusal
 *  is by design (the image used to be silently dropped and billed anyway), so it
 *  reports as "not supported on this provider", never as a crash. */
function classifyUnavailable(detail: string): { failure: SelfTestFailure; status: SelfTestStatus } {
  const d = detail.toLowerCase();
  if (d.includes("cannot read images")) return { failure: "not_supported", status: "unsupported" };
  if (d.includes("cannot serve a") || d.includes("not in the catalog")) return { failure: "not_supported", status: "unsupported" };
  if (d.includes("is turned off in ai settings")) return { failure: "feature_off", status: "blocked" };
  if (d.includes("provider not configured") || d.includes("no enabled model")) return { failure: "not_configured", status: "blocked" };
  if (d.includes("timeout")) return { failure: "transport", status: "fail" };
  // `generate()` now throws on an empty body instead of settling credits for
  // nothing, so this arrives as a refusal. Keep the precise operator-facing
  // cause rather than flattening it into the generic "provider error".
  if (d.includes("empty model response")) return { failure: "empty", status: "fail" };
  return { failure: "provider", status: "fail" };
}

/** Run ONE check against ONE pinned model, through the real metered path. */
async function runSelfTestCheck(
  env: Env,
  tenantId: string,
  actorUserId: string,
  check: SelfTestCheck,
  modelId: string,
): Promise<SelfTestResult> {
  const model = await modelById(env.DB, modelId);
  const base = {
    check: check.key, label: check.label, feature: check.feature, task: check.task,
    modelId, modelLabel: model?.label ?? modelId, provider: model?.provider ?? "unknown",
  };
  const t0 = Date.now();
  const result = await generate(env, {
    tenantId,
    actorUserId,
    feature: check.feature,
    task: check.task,
    modelId,
    system: sys(check.feature),
    prompt: check.prompt,
    maxOutputTokens: check.maxOutputTokens,
    expectsJson: check.expectsJson,
    jsonSchema: check.jsonSchema,
    image: check.image ? TEST_IMAGE : undefined,
    mock: check.mock,
  });
  const latencyMs = Date.now() - t0;

  if (!result.ok) {
    if (result.error === "insufficient_credits") {
      return { ...base, status: "blocked", failure: "insufficient_credits", detail: `needs ${result.needed} credits, ${result.available} available`, latencyMs, credits: 0, mocked: false, excerpt: "", summary: null };
    }
    const detail = result.detail ?? "the provider gave no reason";
    const { failure, status } = classifyUnavailable(detail);
    return { ...base, status, failure, detail, latencyMs, credits: 0, mocked: false, excerpt: "", summary: null };
  }

  const verdict = evaluateSelfTestOutput(check, result.output);
  return { ...base, ...verdict, latencyMs, credits: result.credits, mocked: result.mocked, excerpt: result.output.trim().slice(0, 400) };
}

export interface SelfTestPlanRun {
  check: string;
  label: string;
  feature: string;
  task: string;
  modelId: string;
  modelLabel: string;
  provider: string;
  estimatedCredits: number;
}

/** What the chosen scope would run, and the upper bound it would spend. */
async function planSelfTest(env: Env, s: SelfTestScopeInput) {
  const enabled = await listModels(env.DB);
  const cfg = await getConfig(env.DB);
  const geminiKeySet = !!cfg["google.gemini_key"];
  const mockMode = cfg["ai.mock"] ?? "auto";
  const isDevelopment = env.ENVIRONMENT === "development";

  const runs: SelfTestPlanRun[] = [];
  let truncated = 0;
  for (const check of SELF_TEST_CHECKS) {
    let models: AiModelRow[] = [];
    if (s.scope === "model") {
      const m = s.modelId ? enabled.find((x) => x.id === s.modelId) : undefined;
      if (m && modelSupportsTask(m, check.task)) models = [m];
    } else if (s.scope === "all") {
      models = enabled.filter((m) => modelSupportsTask(m, check.task));
    } else if (s.scope === "provider") {
      const m = s.provider ? await preferredModelForTask(env.DB, check.task, s.provider) : null;
      if (m) models = [m];
    } else if (s.scope === "compare") {
      // Adjacent by design: the same prompt on Workers AI then on Gemini, so the
      // two rows sit next to each other in the results table.
      for (const p of ["workers-ai", "google"] as const) {
        const m = await preferredModelForTask(env.DB, check.task, p);
        if (m && !models.some((x) => x.id === m.id)) models.push(m);
      }
    } else {
      // "default" — whatever generate() would pick right now, for this task.
      let m: AiModelRow | null = geminiKeySet ? await preferredModelForTask(env.DB, check.task, "google") : null;
      if (!m) m = await modelForTask(env.DB, check.task);
      if (m) models = [m];
    }
    for (const m of models) {
      if (runs.length >= MAX_SELFTEST_RUNS) { truncated++; continue; }
      runs.push({
        check: check.key, label: check.label, feature: check.feature, task: check.task,
        modelId: m.id, modelLabel: m.label, provider: m.provider,
        estimatedCredits: estimateRunCredits(m, { system: sys(check.feature), prompt: check.prompt, maxOutputTokens: check.maxOutputTokens, hasImage: !!check.image }),
      });
    }
  }
  return {
    scope: s.scope,
    runs,
    truncated,
    maxRuns: MAX_SELFTEST_RUNS,
    totalEstimatedCredits: runs.reduce((n, r) => n + r.estimatedCredits, 0),
    geminiKeySet,
    mockMode,
    /** Per provider: would this run hit the canned mock instead of a real model? */
    willMock: {
      "workers-ai": shouldUseMockLane({ mockMode, canRunReal: !!env.AI, isDevelopment }),
      google: shouldUseMockLane({ mockMode, canRunReal: geminiKeySet, isDevelopment }),
    },
  };
}
