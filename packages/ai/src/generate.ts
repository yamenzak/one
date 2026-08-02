/**
 * AI suite core (SPEC §6) — the metered generation path:
 *
 *   resolve model → reserve (worst-case hold on TenantBillingDO) → run
 *   (Workers AI | mock) → settle (exact credits from real usage) → audit
 *   (ai_generations, with actor + feature attribution).
 *
 * Mock mode (`ai.mock` app_config: auto | on | off): with no AI binding (or
 * "on"), a deterministic mock answers and reports synthetic usage, so the
 * whole reserve/settle/ledger loop runs in local dev. Gemini routing joins
 * with the model-catalog phase; the credit math is provider-agnostic already.
 *
 * The mock lane is DEVELOPMENT-ONLY, in every mode. `shouldUseMockLane`
 * (`@kova/domain`) puts `env.ENVIRONMENT === "development"` on the outside, so
 * a stored `ai.mock = "on"` — from the admin console, a hand-edited app_config
 * row, or a restored backup — cannot fabricate output in production. Fabricated
 * `lab-extract` markers would otherwise pre-fill a real client's chart, flow
 * into their `LABS:` prompt block and the supplement recommender, and bill the
 * tenant credits for the privilege. See AGENTS §6.
 */

import { type BalanceView, creditsForUsage, creditsPerMillionTokens, creditsPerUnit, referenceCredits, REFERENCE_USAGE, type ModelRate, type Usage } from "@4dl/billing/model";
import type { HasAi, HasDb, HasEnvironment, HasPlatformConfig } from "@4dl/core";
import { getConfig, newId, nowMs } from "@4dl/core";
import { shouldUseMockLane } from "./mock-lane.js";
import { aiRegistry, type AiTone, type TenantAiConfig } from "./registry.js";
import { putMedia, storageUsage } from "./media.js";

/** Bindings the generation path reads. `AI` is optional — absent means the mock
 *  lane on the dev lane, and a hard refusal anywhere else. */
/**
 * The slice of the credit DO this package calls.
 *
 * Declared as a branded RPC interface rather than as `CreditLedgerDO<Bindings>`
 * because the base class is GENERIC in its environment, and that parameter sits
 * in a contravariant position (`this.env`) — so an app's
 * `CreditLedgerDO<AppEnv>` is not assignable to `CreditLedgerDO<HasDb>`. Naming
 * only the four methods keeps every subclass compatible.
 */
export interface CreditAuthorityStub {
  bind(tenantId: string): Promise<void>;
  reserve(estimate: number): Promise<
    { ok: true; hold: string; available: number } | { ok: false; available: number; needed: number }
  >;
  settle(hold: string, actual: number, reason?: string, ref?: string): Promise<BalanceView>;
  release(hold: string): Promise<BalanceView>;
}

/**
 * Just enough of the namespace to reach the four methods above.
 *
 * NOT `DurableObjectNamespace<CreditLedgerDO>`: that type is INVARIANT in its
 * parameter, so an app's subclass — which has strictly MORE methods — is not
 * assignable to it. Describing only the two calls this package makes lets any
 * subclass satisfy it structurally, which is the whole point of the bindings
 * contract.
 */
export interface CreditAuthorityNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): CreditAuthorityStub;
}

export type AiBindings = HasDb & HasEnvironment & HasAi & HasPlatformConfig & {
  /**
   * The per-tenant credit authority.
   *
   * Typed as the base class rather than a structural shape: a
   * `DurableObjectNamespace<T>` requires `T` to carry the runtime's DO brand,
   * which a hand-written interface cannot. The app's subclass satisfies it.
   */
  BILLING: CreditAuthorityNamespace;
};

export interface AiModelRow {
  id: string;
  task: string;
  label: string;
  provider: string;
  input_rate: number | null;
  output_rate: number | null;
  unit_rate: number | null;
  unit_kind: string | null;
  markup: number | null;
  enabled: number;
  is_default: number;
}

/** Seed text models (Workers AI rates in neurons per 1M tokens, markup 3). */
const DEFAULT_MODELS: Omit<AiModelRow, "enabled" | "is_default">[] = [
  {
    id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    task: "text",
    label: "Llama 3.3 70B (fast)",
    provider: "workers-ai",
    input_rate: 26_668,
    output_rate: 204_805,
    unit_rate: null,
    unit_kind: null,
    markup: 3,
  },
  {
    id: "@cf/meta/llama-3.2-3b-instruct",
    task: "text-small",
    label: "Llama 3.2 3B (cheap)",
    provider: "workers-ai",
    input_rate: 4_625,
    output_rate: 30_475,
    unit_rate: null,
    unit_kind: null,
    markup: 3,
  },
  // Additional Workers AI text models the tenant can pick per feature. Rates are
  // neuron-equivalents by size class (admin-tunable in ai_models); the credit
  // math applies markup on neurons so margins hold across the catalog.
  // NOTE: every rate below is the published Workers AI neuron rate, verbatim.
  // They used to be "neuron-equivalents by size class" — i.e. guesses — and
  // three of them UNDER-charged the real cost (gemma-3-12b input 12k vs 31,371;
  // llama-4-scout input 14k vs 24,545; mistral-small output 120k vs 50,488), so
  // a studio on those models was billed less than the platform paid until
  // someone ran the catalog sync. A seed rate is a reserve estimate, and an
  // estimate that is not an upper bound is a money bug (AGENTS §5).
  {
    // Cloudflare publishes `-fp8-fast`; the seed used to read `-instruct-fast`,
    // which is not a real model id, so picking this row in AI settings failed at
    // the provider. `syncModelCatalog` would now retire it on the first sync, but
    // a seed that is wrong until someone presses a button is still wrong — a
    // fresh deploy offers it immediately.
    id: "@cf/meta/llama-3.1-8b-instruct-fp8-fast",
    task: "text-small",
    label: "Llama 3.1 8B (fast)",
    provider: "workers-ai",
    input_rate: 9_000,
    output_rate: 61_000,
    unit_rate: null,
    unit_kind: null,
    markup: 3,
  },
  {
    id: "@cf/google/gemma-3-12b-it",
    task: "text-small",
    label: "Gemma 3 12B",
    provider: "workers-ai",
    input_rate: 31_371,
    output_rate: 50_560,
    unit_rate: null,
    unit_kind: null,
    markup: 3,
  },
  {
    id: "@cf/meta/llama-4-scout-17b-16e-instruct",
    task: "text",
    label: "Llama 4 Scout 17B",
    provider: "workers-ai",
    input_rate: 24_545,
    output_rate: 77_273,
    unit_rate: null,
    unit_kind: null,
    markup: 3,
  },
  {
    id: "@cf/mistralai/mistral-small-3.1-24b-instruct",
    task: "text",
    label: "Mistral Small 3.1 24B",
    provider: "workers-ai",
    input_rate: 31_876,
    output_rate: 50_488,
    unit_rate: null,
    unit_kind: null,
    markup: 3,
  },
  {
    // Gemini Flash — vision lane (Snap-a-Meal, Label Reader, Menu Scout). Rates
    // are Google list prices expressed as neuron-equivalents (~$0.011/1k) so
    // both providers meter identically (SPEC §6). ~$0.10/$0.40 per 1M tok.
    id: "gemini-2.0-flash",
    task: "vision",
    label: "Gemini Flash (vision)",
    provider: "google",
    input_rate: 9_000,
    output_rate: 36_000,
    unit_rate: null,
    unit_kind: null,
    markup: 3,
  },
  {
    // Gemini 2.5 Flash — a strong text model a tenant can pick for any text
    // feature (native JSON mode → clean structured output). Gemini models are
    // multimodal, so this also serves as a vision fallback. ~$0.30/$2.50 /1M.
    id: "gemini-2.5-flash",
    task: "text",
    label: "Gemini 2.5 Flash",
    provider: "google",
    input_rate: 27_273,
    output_rate: 227_273,
    unit_rate: null,
    unit_kind: null,
    markup: 3,
  },
  {
    // Gemini 2.5 Flash-Lite — a cheaper Gemini option for the text-small lane.
    id: "gemini-2.5-flash-lite",
    task: "text-small",
    label: "Gemini 2.5 Flash-Lite",
    provider: "google",
    input_rate: 9_091,
    output_rate: 36_364,
    unit_rate: null,
    unit_kind: null,
    markup: 3,
  },
  {
    // Gemini 2.5 Flash Image — "Nano Banana" image generation. Priced per image
    // ($0.039), stored as neuron-equivalents so it bills through the same math.
    id: "gemini-2.5-flash-image",
    task: "image",
    label: "Gemini 2.5 Flash Image (Nano Banana)",
    provider: "google",
    input_rate: 27_273, // $0.30 / 1M input tokens
    output_rate: null,
    unit_rate: 3_545, // $0.039 per generated image
    unit_kind: "image",
    markup: 3,
  },
  {
    // Gemini 2.5 Flash TTS — the body-scan voice cues. Google list price is
    // $0.50/1M text-in and $10/1M audio-out; expressed as neuron-equivalents
    // ($0.011/1k) so it meters through the same markup math as every other model
    // (admin-tunable via ai.markup). Cues are generated once and cached, so a
    // tenant pays for the set once, not per scan.
    id: "gemini-2.5-flash-preview-tts",
    task: "speech",
    label: "Gemini 2.5 Flash TTS (voice)",
    provider: "google",
    input_rate: 45_455, // $0.50 / 1M text tokens
    output_rate: 909_091, // $10.00 / 1M audio tokens
    unit_rate: null,
    unit_kind: null,
    markup: 3,
  },
];

/** Idempotent catalog seed (INSERT OR IGNORE by id). No module-level guard (so
 *  it re-seeds into fresh per-test storage); a cheap storage-scoped existence
 *  check skips the ~11-write batch once populated, so a single generate() (which
 *  resolves models 2-3×) doesn't re-attempt the whole seed each time. New
 *  catalog entries are picked up by an explicit admin re-sync. */
export async function seedAiModels(db: D1Database): Promise<void> {
  const already = await db.prepare("SELECT 1 AS x FROM ai_models LIMIT 1").first<{ x: number }>().catch(() => null);
  if (already) return;
  await db
    .batch(
      DEFAULT_MODELS.map((m, i) =>
        db
          .prepare(
            "INSERT OR IGNORE INTO ai_models (id, task, label, provider, input_rate, output_rate, unit_rate, unit_kind, markup, enabled, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
          )
          .bind(m.id, m.task, m.label, m.provider, m.input_rate, m.output_rate, m.unit_rate, m.unit_kind, m.markup, i === 0 ? 1 : 0),
      ),
    )
    .catch(() => undefined);
}

export async function modelForTask(db: D1Database, task: string): Promise<AiModelRow | null> {
  await seedAiModels(db);
  return db
    .prepare("SELECT * FROM ai_models WHERE task = ? AND enabled = 1 ORDER BY is_default DESC LIMIT 1")
    .bind(task)
    .first<AiModelRow>();
}

/** The default model for a task, preferring a given provider when one is
 *  enabled for that task (used to favor Gemini when a key is configured). */
export async function preferredModelForTask(db: D1Database, task: string, provider: string): Promise<AiModelRow | null> {
  await seedAiModels(db);
  const forTask = task === "vision" ? ["vision", "text", "text-small"] : [task];
  const placeholders = forTask.map(() => "?").join(",");
  return db
    .prepare(`SELECT * FROM ai_models WHERE provider = ? AND task IN (${placeholders}) AND enabled = 1 ORDER BY task = ? DESC, is_default DESC LIMIT 1`)
    .bind(provider, ...forTask, task)
    .first<AiModelRow>();
}

/** Any enabled multimodal model for vision when no vision-tagged one exists —
 *  Gemini text models accept images, so a Google model is a valid fallback. */
export async function visionFallbackModel(db: D1Database): Promise<AiModelRow | null> {
  await seedAiModels(db);
  return db
    .prepare("SELECT * FROM ai_models WHERE provider = 'google' AND task IN ('vision','text','text-small') AND enabled = 1 ORDER BY task = 'vision' DESC, is_default DESC LIMIT 1")
    .bind()
    .first<AiModelRow>();
}

/**
 * Can this catalog row serve `task`?
 *
 * The catalog also carries lanes nothing here can execute (embedding /
 * transcribe / tts / classify — discovered and priced by the admin sync so the
 * catalog is honest about what the providers sell, but inert), so this is a
 * WHITELIST of the generation lanes rather than a blacklist of the ones we
 * happened to know about: a blacklist quietly let a Gemini embedding model
 * satisfy a vision request.
 *
 * ── READING an image and MAKING one are not the same capability ─────────────
 *
 * This conflated them, and the Gemini docs are unambiguous that they differ:
 *
 *   image INPUT   "All Gemini model versions are multimodal and can be utilized
 *                 in a wide range of image processing and computer vision
 *                 tasks." (ai.google.dev/gemini-api/docs/image-understanding)
 *                 So any Gemini text model reads a meal photo. That half was
 *                 right, and it is why Snap-a-Meal works without a
 *                 `vision`-tagged row in the catalog.
 *   image OUTPUT  four models, all of them the "Nano Banana" family
 *                 (ai.google.dev/gemini-api/docs/image-generation). A Gemini
 *                 TEXT model cannot return an image at all: `runGeminiImage`
 *                 asks for `responseModalities: ["IMAGE"]` and the API rejects
 *                 it on a model that has no image modality.
 *
 * The old rule allowed `text` for BOTH, so a studio could pick "Gemini 2.5
 * Flash Lite" as its cover-image model and every generation failed. The hold was
 * released so nothing was overbilled, but the feature was configured broken and
 * the picker had offered the configuration.
 *
 * The image test is `unit_kind === "image"` rather than an id pattern, because
 * that is what the SYNC already derives from Google's own pricing page: a model
 * only gets `task: "image"` when the page prices its output "$X per image"
 * (`parseGeminiCatalog`). Deriving the capability from the same document that
 * prices it means a new model in the family works the day it is synced, and a
 * rename cannot silently reclassify anything.
 */
export function modelSupportsTask(m: AiModelRow, task: "text" | "text-small" | "vision" | "image"): boolean {
  const text = m.task === "text" || m.task === "text-small";
  // Vision and image generation are GOOGLE-ONLY here, and that is a property of
  // this codebase, not of the models. The Workers AI branch of `generate()`
  // never attaches `input.image` and the guard above it refuses the call
  // outright, so a Workers-AI row is unusable for vision however its id reads —
  // trusting the tag made `@cf/meta/llama-3.2-11b-vision-instruct` a pickable
  // Snap-a-Meal model that failed every call with "model cannot read images".
  if (task === "image") return m.provider === "google" && m.task === "image" && m.unit_kind === "image";
  if (task === "vision") return m.provider === "google" && (m.task === "vision" || text || m.task === "image");
  return text;
}

/** Every generation lane this row can serve — `modelSupportsTask` inverted, so a
 *  client can be told a model's capabilities instead of re-deriving them from
 *  `task` and getting the image/vision distinction wrong. */
export const GENERATION_TASKS = ["text", "text-small", "vision", "image"] as const;
export function modelTasks(m: AiModelRow): string[] {
  return GENERATION_TASKS.filter((t) => modelSupportsTask(m, t));
}

/** An enabled model by id — for a tenant's per-feature model override. */
export async function modelById(db: D1Database, id: string): Promise<AiModelRow | null> {
  await seedAiModels(db);
  return db.prepare("SELECT * FROM ai_models WHERE id = ? AND enabled = 1").bind(id).first<AiModelRow>();
}

/** All models offered in the catalog (for the settings picker). */
export async function listModels(db: D1Database): Promise<AiModelRow[]> {
  await seedAiModels(db);
  const rows = await db.prepare("SELECT * FROM ai_models WHERE enabled = 1 ORDER BY task, label").all<AiModelRow>();
  return rows.results ?? [];
}

/** The tenant's AI config + legacy on/off toggle map. */
async function loadTenantAi(db: D1Database, tenantId: string): Promise<{ config: TenantAiConfig; toggles: Record<string, boolean> }> {
  const row = await db
    .prepare("SELECT ai_config_json, ai_toggles_json FROM tenant_settings WHERE tenant_id = ?")
    .bind(tenantId)
    .first<{ ai_config_json: string | null; ai_toggles_json: string | null }>();
  let config: TenantAiConfig = {};
  let toggles: Record<string, boolean> = {};
  try { if (row?.ai_config_json) config = JSON.parse(row.ai_config_json) as TenantAiConfig; } catch { /* malformed → defaults */ }
  try { if (row?.ai_toggles_json) toggles = JSON.parse(row.ai_toggles_json) as Record<string, boolean>; } catch { /* malformed → allow */ }
  return { config, toggles };
}

const rateOf = (m: AiModelRow): ModelRate => ({
  inputRate: m.input_rate ?? undefined,
  outputRate: m.output_rate ?? undefined,
  unitRate: m.unit_rate ?? undefined,
  unitKind: (m.unit_kind as ModelRate["unitKind"]) ?? undefined,
  markup: m.markup ?? undefined,
});

/** What a typical request on `m` costs, in credits, for every lane it could be
 *  picked for. This is the ONLY cost shape a tenant is given: the neuron rate
 *  card and the platform markup are the inputs, and they stay on the server. */
export function modelCostPerRequest(m: AiModelRow): Record<string, number> {
  const rate = rateOf(m);
  return Object.fromEntries(Object.keys(REFERENCE_USAGE).map((lane) => [lane, referenceCredits(lane, rate)]));
}

/** The same model priced for an operator: credits per typical request in each
 *  lane, plus the exact credit rate card. Admin-only — it still says nothing
 *  about markup, which the admin reads from its own field. */
export function modelPricing(m: AiModelRow): {
  costPerRequest: Record<string, number>;
  perMillion: { input: number | null; output: number | null };
  perUnit: { credits: number; kind: string } | null;
} {
  const rate = rateOf(m);
  return { costPerRequest: modelCostPerRequest(m), perMillion: creditsPerMillionTokens(rate), perUnit: creditsPerUnit(rate) };
}

export interface GenerateInput {
  tenantId: string;
  actorUserId: string;
  subjectId?: string | null;
  feature: string;
  task: "text" | "text-small" | "vision" | "image";
  system: string;
  prompt: string;
  maxOutputTokens?: number;
  /** Inline image for vision tasks (base64 + mime), routed to a vision model. */
  image?: { data: string; mimeType: string };
  /** Pin an exact catalog model, overriding the tenant's per-feature config and
   *  the task default. Used by the admin AI self-test to run the SAME prompt
   *  across providers. Still fully metered — this pins the model, nothing else.
   *  A missing / disabled / task-incompatible id fails the call rather than
   *  silently falling back to a different model than the caller asked about. */
  modelId?: string;
  /** Ask the provider for JSON natively (Gemini responseMimeType / Workers AI
   *  response_format) — belt-and-suspenders with the response normalizer. */
  expectsJson?: boolean;
  /** Optional JSON Schema for Workers AI JSON Mode (response_format
   *  json_schema). When omitted, the JSON directive + normalizer carry it. */
  jsonSchema?: Record<string, unknown>;
  /** Deterministic mock output builder for dev / `ai.mock = on`. */
  mock: () => string;
}

export type GenerateResult =
  | { ok: true; output: string; credits: number; mocked: boolean }
  | { ok: false; error: "insufficient_credits"; available: number; needed: number }
  | { ok: false; error: "unavailable"; detail?: string };

const RUN_TIMEOUT_MS = 120_000;

// Worst-case input tokens an inline image contributes to a vision call. The
// char-count estimate can't see the image, but the provider bills it (Gemini
// tiles a photo into ~258-token blocks), so the reserve must budget for it or
// the hold under-reserves and the settle cap (billing-do) silently eats the
// overrun. 2048 covers a high-resolution photo with margin.
const IMAGE_TOKEN_EST = 2048;

/**
 * Characters per input token, for sizing the reserve.
 *
 * NOT 4. Four chars/token is the English average, and an average is the wrong
 * statistic for a bound: `settle` caps the charge at the reserve, so a reserve
 * that lands under the real usage is money the platform pays and the studio does
 * not. Arabic — which this product is squarely aimed at — tokenizes at roughly
 * 2 chars/token, so chars/4 reserved about HALF the real input on an Arabic
 * prompt and the shortfall was silently absorbed. 2.5 covers Latin comfortably
 * and Arabic with a little room; over-reserving costs nothing but a slightly
 * larger transient hold, released moments later.
 */
const CHARS_PER_INPUT_TOKEN = 2.5;

/**
 * Multiplier on the output cap when reserving against a Gemini model.
 *
 * `maxOutputTokens` bounds the ANSWER, not the billing. Gemini 2.5+ thinks by
 * default and bills `thoughtsTokenCount` at the output rate on top of the
 * answer, from a budget the request does not cap. Reserving only the answer cap
 * therefore under-reserves every thinking model, and the settle cap turns that
 * straight into lost margin. 3x is a working upper bound for a thinking budget
 * against a capped answer.
 */
const THINKING_RESERVE_MULTIPLIER = 3;

/** The worst-case usage a run reserves against: a conservative character→token
 *  ratio in (plus an image allowance), and the output cap out — widened for a
 *  provider that bills hidden reasoning tokens. Exported so the admin self-test
 *  quotes the same number it is about to spend, not a second, drifting estimate. */
export function estimateUsage(args: { system: string; prompt: string; maxOutputTokens?: number; hasImage?: boolean; provider?: string }): Usage {
  const outCap = args.maxOutputTokens ?? 1024;
  return {
    inputTokens: Math.ceil((args.system.length + args.prompt.length) / CHARS_PER_INPUT_TOKEN) + (args.hasImage ? IMAGE_TOKEN_EST : 0),
    outputTokens: args.provider === "google" ? outCap * THINKING_RESERVE_MULTIPLIER : outCap,
  };
}

/** Upper-bound credits a `generate()` call on `model` would reserve. */
export function estimateRunCredits(model: AiModelRow, args: { system: string; prompt: string; maxOutputTokens?: number; hasImage?: boolean }): number {
  // `provider` comes from the model, so a quote can never disagree with the
  // reserve the same run would actually take.
  return creditsForUsage(estimateUsage({ ...args, provider: model.provider }), rateOf(model));
}

/**
 * What to BILL for a completed run, given whatever the provider chose to report.
 *
 * `settle` caps the charge at the reserve (`Math.min(held.credits, actual)`), so
 * every token we fail to count is a token the platform pays for and the studio
 * does not. Two rules follow:
 *
 *  - A reported count is used as-is. It is the truth and it is what the provider
 *    invoices us for.
 *  - A MISSING count falls back to the RESERVE, not to a character estimate.
 *    This is deliberate and it is the conservative direction: the reserve is the
 *    worst case the tenant already had held, so charging it can never exceed
 *    what they agreed to, and it cannot silently lose money. A chars/4 guess
 *    would systematically under-bill — badly on a reasoning model, whose hidden
 *    thinking tokens have no relationship at all to the visible answer's length,
 *    and on any non-Latin script, where 4 chars/token is roughly double the real
 *    ratio (Arabic runs ~2).
 *
 * The visible-output estimate is kept only as a FLOOR when the reserve somehow
 * came out smaller, so the charge is never below what the text alone implies.
 * A provider that reports nothing is also an anomaly worth seeing, so it is
 * logged rather than absorbed quietly.
 */
function billedUsage(
  reported: { inputTokens?: number; outputTokens?: number },
  reserved: Usage,
  output: string,
  model: AiModelRow,
): Usage {
  const missing: string[] = [];
  let inputTokens = reported.inputTokens;
  if (typeof inputTokens !== "number") { missing.push("input"); inputTokens = reserved.inputTokens ?? 0; }
  let outputTokens = reported.outputTokens;
  if (typeof outputTokens !== "number") {
    missing.push("output");
    outputTokens = Math.max(reserved.outputTokens ?? 0, Math.ceil(output.length / 4));
  }
  if (missing.length) {
    console.warn(`[ai] ${model.provider}/${model.id} reported no ${missing.join("/")} token count — billing the reserve (${inputTokens} in / ${outputTokens} out)`);
  }
  return { inputTokens, outputTokens };
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), RUN_TIMEOUT_MS))]);
}

/**
 * TRANSIENT PROVIDER FAILURES, RETRIED — and the ones that must not be.
 *
 * Both providers fail in ways that succeed on the next call a second later: an
 * overloaded pool answers 503, a rate limiter answers 429, and Gemini in
 * particular returns a well-formed response with an EMPTY candidate under load.
 * That last one is why "AI failed — google/gemini-2.5-pro: empty model response"
 * reached users: it is not a bad prompt, it is the model shrugging, and the only
 * correct answer is to ask again.
 *
 * ── What is NOT retried, and why each would be worse ────────────────────────
 *
 * **A timeout.** `RUN_TIMEOUT_MS` is two minutes. Retrying means the person has
 * now waited four, then six. A slow failure is the one case where trying again
 * costs more than it can possibly win — so elapsed time, not just the error
 * text, decides. `RETRY_WINDOW_MS` also refuses to *start* a retry late: a first
 * attempt that burned 50 seconds before failing gets no second chance.
 *
 * **A refusal.** A safety block (`finishReason=SAFETY`), a 400, a 401/403 — the
 * model will answer identically every time. Retrying burns the user's wait and
 * the worker's CPU to arrive at the same place.
 *
 * ── Credits ─────────────────────────────────────────────────────────────────
 *
 * Retries sit INSIDE the caller's existing `try`, which means inside one
 * reserve→settle cycle. The hold is taken once and covers the whole sequence;
 * only a successful attempt settles, and any escape lands in the same `catch`
 * that releases it. A retry therefore cannot double-charge — verified by the
 * metering tests, which count settlements rather than attempts.
 */
const RETRY_ATTEMPTS = 3;
/** Never START a retry after this much has already elapsed. */
const RETRY_WINDOW_MS = 45_000;
const RETRY_BACKOFF_MS = [500, 1500];

/** Worth asking again. Deliberately a allow-list of KNOWN-transient shapes: an
 *  unrecognised error is treated as permanent, because retrying an unknown
 *  failure is how a broken prompt becomes three broken prompts. */
const TRANSIENT =
  /empty model response|no candidates|HTTP (429|500|502|503|504)|overload|unavailable|capacity|rate.?limit|too many requests|internal error|ECONNRESET|network|fetch failed/i;

export function isTransientAiError(message: string): boolean {
  return !/timeout/i.test(message) && TRANSIENT.test(message);
}

async function withRetry<T>(run: () => Promise<T>, onRetry?: (attempt: number, detail: string) => void): Promise<T> {
  const started = Date.now();
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const spent = Date.now() - started;
      if (attempt >= RETRY_ATTEMPTS || !isTransientAiError(detail) || spent > RETRY_WINDOW_MS) throw err;
      onRetry?.(attempt, detail);
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt - 1] ?? 1500));
    }
  }
}

interface GeminiPart { text?: string }
interface GeminiUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  /** Reasoning tokens. Google BILLS these at the output rate and they are NOT
   *  included in candidatesTokenCount. Thinking is on by default on 2.5+. */
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
}
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  usageMetadata?: GeminiUsage;
}

/**
 * Output tokens Google will BILL for — not the same as the tokens it showed us.
 * `candidatesTokenCount` counts only the visible answer; `thoughtsTokenCount`
 * (reasoning, default-on for Gemini 2.5 and 3.x) is billed at the same output
 * rate and is routinely several times larger. Reading only the visible count
 * under-billed every thinking model badly enough to invert the margin: 800
 * visible + 2,000 thinking tokens costs the platform 2,800 output tokens while
 * the studio is charged for 800 — ~29% of cost recovered against a 3x markup,
 * i.e. a loss on every call.
 *
 * `totalTokenCount - promptTokenCount` is the robust form: it sweeps up thoughts,
 * the answer, and any future billed-output category Google adds without this
 * needing to know its name. The named fields are the fallback.
 *
 * Returns undefined when the response carried no usage at all, so the caller
 * falls back to its own estimate. Returning 0 — which is what this used to do —
 * made the generation FREE: 0 is not nullish, so the caller's `?? estimate`
 * never fired and `creditsForUsage` charged nothing.
 */
export function geminiBilledTokens(u: GeminiUsage | undefined): { inputTokens?: number; outputTokens?: number } {
  if (!u) return {};
  const inputTokens = typeof u.promptTokenCount === "number" ? u.promptTokenCount : undefined;
  let outputTokens: number | undefined;
  if (typeof u.totalTokenCount === "number" && typeof inputTokens === "number" && u.totalTokenCount - inputTokens >= 0) {
    outputTokens = u.totalTokenCount - inputTokens;
  } else if (typeof u.candidatesTokenCount === "number" || typeof u.thoughtsTokenCount === "number") {
    outputTokens = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
  }
  return { inputTokens, outputTokens };
}

/** Convert a standard JSON Schema to Gemini's responseSchema dialect (uppercase
 *  TYPE names; enum/items/properties preserved). Lets one enum schema drive both
 *  Workers AI json_schema and Gemini responseSchema so the model is constrained
 *  to the allowed vocab, not just "some JSON". */
function toGeminiSchema(s: unknown): unknown {
  if (!s || typeof s !== "object") return s;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
    if (k === "type" && typeof v === "string") out.type = v.toUpperCase();
    else if (k === "properties" && v && typeof v === "object") {
      out.properties = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [pk, toGeminiSchema(pv)]));
    } else if (k === "items") out.items = toGeminiSchema(v);
    else out[k] = v;
  }
  return out;
}

/** Google AI Studio (Gemini) generateContent — text + optional inline image. */
async function runGemini(
  key: string,
  modelId: string,
  input: GenerateInput,
): Promise<{ output: string; usage: Usage }> {
  const parts: Record<string, unknown>[] = [{ text: input.prompt }];
  if (input.image) parts.push({ inline_data: { mime_type: input.image.mimeType, data: input.image.data } });
  const generationConfig: Record<string, unknown> = { maxOutputTokens: input.maxOutputTokens ?? 1024 };
  // Native JSON mode — Gemini returns a clean, unwrapped JSON document. With a
  // schema it's constrained to the enum vocab (not just well-formed JSON).
  if (input.expectsJson) {
    generationConfig.responseMimeType = "application/json";
    if (input.jsonSchema) generationConfig.responseSchema = toGeminiSchema(input.jsonSchema);
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: "user", parts }],
        generationConfig,
      }),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 300)}`);
  const json = (await res.json()) as GeminiResponse;
  const cand = json.candidates?.[0];
  if (!cand) throw new Error(`no candidates ${JSON.stringify(json).slice(0, 200)}`);
  const output = (cand.content?.parts ?? []).map((p) => p.text ?? "").join("");
  // An output-side block (finishReason SAFETY/RECITATION/OTHER/…) or an empty
  // candidate is NOT a success — the model returned nothing usable. Treat it as
  // an error so generate()'s catch releases the hold, nothing settles, and no
  // empty message is cached. STOP (normal) and MAX_TOKENS (truncated but has
  // content, which the normalizer repairs) are the only acceptable reasons.
  const finish = cand.finishReason;
  if (finish && finish !== "STOP" && finish !== "MAX_TOKENS") throw new Error(`response stopped (finishReason=${finish})`);
  if (!output.trim()) throw new Error("empty model response");
  return { output, usage: geminiBilledTokens(json.usageMetadata) };
}

// ── Workers AI response envelopes ────────────────────────────────────────────
//
// The classic text-generation binding answers `{ response: "…" }`, and for
// years that was the only shape we read. It is no longer the only shape the
// catalog emits: newer entries (the gemma-4 and gpt-oss families) answer in the
// OpenAI-compatible `{ choices: [{ message: { content } }] }` envelope, and
// `content` may itself be an array of typed parts rather than a string.
// Reading only `response` turned a perfectly good 24-second generation into an
// empty string — which `generate()` then billed as a success. Read every shape
// the platform documents, and treat "still nothing" as an error (below).

interface WorkersAiContentPart { type?: string; text?: string }
interface WorkersAiChoice {
  message?: { content?: string | WorkersAiContentPart[] | null; reasoning_content?: string | null } | null;
  text?: string | null;
}
interface WorkersAiResult {
  response?: unknown;
  choices?: WorkersAiChoice[] | null;
  output_text?: string | null;
  output?: { content?: WorkersAiContentPart[] | null }[] | null;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function partsToText(parts: WorkersAiContentPart[] | null | undefined): string {
  return (parts ?? []).map((p) => (typeof p?.text === "string" ? p.text : "")).join("").trim();
}

/** Pull the assistant's text out of whichever envelope the model used.
 *  Exported for unit tests — the live provider is not reachable from CI, so the
 *  documented shapes are the contract this is held to. */
export function readWorkersAiOutput(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (!raw || typeof raw !== "object") return "";
  const r = raw as WorkersAiResult;

  // 1. Classic text-generation. Under JSON mode some models hand back the
  //    already-parsed value here, so re-serialize it for the normalizer.
  if (typeof r.response === "string" && r.response.trim()) return r.response;
  if (r.response && typeof r.response === "object") return JSON.stringify(r.response);

  // 2. OpenAI-compatible chat completions.
  for (const choice of r.choices ?? []) {
    const content = choice?.message?.content;
    if (typeof content === "string" && content.trim()) return content;
    if (Array.isArray(content)) {
      const text = partsToText(content);
      if (text) return text;
    }
    if (typeof choice?.text === "string" && choice.text.trim()) return choice.text;
  }

  // 3. Responses-API style.
  if (typeof r.output_text === "string" && r.output_text.trim()) return r.output_text;
  for (const item of r.output ?? []) {
    const text = partsToText(item?.content);
    if (text) return text;
  }

  // 4. Last resort: a reasoning model that spent its whole token budget
  //    thinking and left `content` empty. If an answer exists at all it is in
  //    there. This is not a free pass — `extractJson` still has to find a valid
  //    document, so raw chain-of-thought fails validation downstream rather
  //    than being billed as a good answer.
  for (const choice of r.choices ?? []) {
    const reasoning = choice?.message?.reasoning_content;
    if (typeof reasoning === "string" && reasoning.trim()) return reasoning;
  }
  return "";
}

/**
 * Assemble the system prompt actually sent to the model. Extracted so the three
 * promises the AI settings screen makes to a studio owner are checkable rather
 * than asserted:
 *
 *   1. EVERY feature's prompt is extendible. `extra` is the tenant's own
 *      instructions and they are APPENDED, never substituted — the built-in
 *      prompt carries the output contract each route parses against, so
 *      replacing it would let a studio break its own features. The model is told
 *      the studio asked, and told the house rules lose to the built-in ones.
 *   2. Tone applies where tone means something. Only a `tonable` feature gets it:
 *      a strict extractor (lab markers, food macros) must not be talked into a
 *      "motivating" voice, and a per-feature tone overrides the house tone.
 *   3. A JSON feature says so in words as well as in the provider's JSON mode.
 *      Gemini has native JSON mode; Workers AI models obey a firm instruction
 *      far better than a bare schema hint, and it costs nothing when both apply.
 *
 * Order matters and is fixed: built-in rules, then studio additions, then tone,
 * then the output contract — so the format directive is the last thing the model
 * reads and a chatty tone cannot bury it.
 */
export function composeSystem(args: {
  base: string;
  feature: string;
  extra?: string | null;
  tone?: AiTone | null;
  expectsJson?: boolean;
}): string {
  let system = args.base;
  if (args.extra && args.extra.trim()) {
    // Deliberately says "the operator of this workspace", not the app's word for
    // a tenant: this string is sent to the MODEL, so an inaccurate noun here is
    // an instruction the model may repeat back to an end user.
    system = `${system}\n\nThe operator of this workspace has also asked you to follow these additional instructions, as long as they don't conflict with the rules above:\n${args.extra.trim()}`;
  }
  if (aiRegistry.featureDef(args.feature)?.tonable && args.tone && aiRegistry.toneGuide[args.tone]) {
    system = `${system}\n\n${aiRegistry.toneGuide[args.tone]}`;
  }
  if (args.expectsJson) {
    system = `${system}\n\nOutput format: respond with ONLY a single valid JSON value — no prose, no explanation, no markdown code fences. Do not wrap the JSON in \`\`\`.`;
  }
  return system;
}

export async function generate(env: AiBindings, input: GenerateInput): Promise<GenerateResult> {
  // Resolve the tenant's per-feature AI config (enable, model, prompt, tone).
  const { config, toggles } = await loadTenantAi(env.DB, input.tenantId);
  const fcfg = config.features?.[input.feature] ?? {};

  // Enabled: per-feature config wins, then the legacy toggle map, else on.
  // A feature explicitly switched off is refused before any credit hold.
  const enabled = fcfg.enabled ?? toggles[input.feature] ?? true;
  if (enabled === false) return { ok: false, error: "unavailable", detail: `feature "${input.feature}" is turned off in AI settings` };

  const cfg = await getConfig(env);
  const geminiKey = cfg["google.gemini_key"];

  // Model: a tenant's per-feature override (task-compatible) wins, else the
  // task default. Vision needs a multimodal model — a vision-tagged one, or
  // ANY Gemini model (Gemini models are all multimodal). Text/text-small are
  // interchangeable and never route to a vision-only or image model.
  // Gemini models are multimodal — they read images (vision) and generate them,
  // so a Google model is valid on any lane, not just its tagged task.
  // The catalog now also carries lanes nothing here can execute (embedding,
  // transcribe, tts, classify — discovered and priced by the sync so the
  // catalog is honest, but inert). Compatibility is therefore a WHITELIST of
  // the generation lanes, not a blacklist of the ones we knew about: a
  // blacklist silently let a Gemini embedding model serve a vision request.
  const compatible = (m: AiModelRow) => modelSupportsTask(m, input.task);
  let model: AiModelRow | null = null;
  // An explicitly pinned model (the admin self-test) wins over everything and
  // never falls back — the whole point is to learn what THAT model does.
  if (input.modelId) {
    const pinned = await modelById(env.DB, input.modelId);
    if (!pinned) return { ok: false, error: "unavailable", detail: `model "${input.modelId}" is not in the catalog, or is disabled` };
    if (!compatible(pinned)) return { ok: false, error: "unavailable", detail: `model "${pinned.id}" is a "${pinned.task}" model and cannot serve a "${input.task}" request` };
    model = pinned;
  }
  if (!model && fcfg.model) { const m = await modelById(env.DB, fcfg.model); if (m && compatible(m)) model = m; }
  // No explicit override: when a Gemini key is configured, prefer Gemini — it's
  // the stronger model and honors native JSON mode, so structured features are
  // far more reliable. Falls back to the Workers AI default otherwise.
  if (!model && geminiKey) model = await preferredModelForTask(env.DB, input.task, "google");
  // `modelForTask` matches on the stored `task` column alone, so it can hand
  // back a row this codebase cannot actually run on that lane — a Workers-AI
  // row tagged `vision` being the case that bit. Re-check compatibility rather
  // than trusting the tag; falling through to the vision fallback (or to an
  // honest refusal) beats a model that errors on every call.
  if (!model) { const m = await modelForTask(env.DB, input.task); if (m && compatible(m)) model = m; }
  // Vision fallback: no vision-tagged model → pick any enabled Gemini model.
  if (!model && input.task === "vision") model = await visionFallbackModel(env.DB);
  if (!model) return { ok: false, error: "unavailable", detail: `no enabled model for task "${input.task}" — sync the model catalog in admin` };
  const rate = rateOf(model);

  // System prompt: the built-in default is authoritative and always kept; a
  // tenant's custom instructions are APPENDED (framed as an extra request), so
  // they refine rather than clobber the engine's output contract. A house or
  // per-feature tone is appended for tonable (creative) features only.
  const system = composeSystem({
    base: input.system,
    feature: input.feature,
    extra: fcfg.system,
    tone: (fcfg.tone ?? config.tone) as AiTone | null | undefined,
    expectsJson: input.expectsJson,
  });
  const runInput: GenerateInput = { ...input, system };

  const mockMode = cfg["ai.mock"] ?? "auto";
  const isGoogle = model.provider === "google";
  // Real run needs the matching credential: Workers AI binding, or a Gemini key.
  const canRunReal = isGoogle ? !!geminiKey : !!env.AI;
  // Mock is dev-only in EVERY mode, including an explicit `ai.mock = "on"`:
  // outside development a missing credential must fail closed, never silently
  // bill for fabricated output (the same hardening the mailer got).
  const useMock = shouldUseMockLane({ mockMode, canRunReal, isDevelopment: env.ENVIRONMENT === "development" });
  if (!useMock && !canRunReal) return { ok: false, error: "unavailable", detail: "AI provider not configured" };
  // Vision safety: the Workers AI branch below never attaches input.image, so a
  // non-Google model asked to read a photo would fabricate output that parses as
  // valid JSON and gets billed. Refuse before reserving — never bill hallucinated
  // vision output as real. `useMock` can only be true in development, so a
  // stored "on" no longer buys a production bypass of this refusal.
  if (input.image && !isGoogle && !useMock) return { ok: false, error: "unavailable", detail: "model cannot read images" };

  // Worst-case estimate for the hold: prompt tokens (~chars/4) in, cap out, plus
  // a worst-case image allowance so a vision call reserves for the image tokens
  // the char count can't see (keeps the reserve a true upper bound).
  const estUsage = estimateUsage({ system, prompt: input.prompt, maxOutputTokens: input.maxOutputTokens, hasImage: !!input.image, provider: model.provider });
  const estimate = creditsForUsage(estUsage, rate);

  const dobj = env.BILLING.get(env.BILLING.idFromName(input.tenantId));
  await dobj.bind(input.tenantId);
  const hold = await dobj.reserve(estimate);
  if (!hold.ok) {
    return { ok: false, error: "insufficient_credits", available: hold.available, needed: hold.needed };
  }

  let output: string;
  let usage: Usage;
  let mocked = false;
  /** Transient attempts that failed before one succeeded. Recorded in the audit
   *  so an operator can SEE provider flakiness instead of inferring it from a
   *  latency graph — a feature that quietly needs two tries every time is a
   *  model worth changing, and nothing else would show that. */
  const retries: string[] = [];
  try {
    if (useMock) {
      output = input.mock();
      usage = { inputTokens: estUsage.inputTokens, outputTokens: Math.ceil(output.length / 4) };
      mocked = true;
    } else if (isGoogle) {
      // `runGemini` already throws on an empty candidate and on a non-STOP
      // finishReason, so wrapping the whole call is what makes "empty model
      // response" retryable — it is the single most common transient failure.
      const g = await withRetry(
        () => withTimeout(runGemini(geminiKey!, model.id, runInput)),
        (n, why) => { retries.push(`${n}:${why.slice(0, 60)}`); },
      );
      output = g.output;
      usage = billedUsage(g.usage, estUsage, output, model);
    } else {
      const args: Record<string, unknown> = {
        messages: [
          { role: "system", content: system },
          { role: "user", content: input.prompt },
        ],
        max_tokens: input.maxOutputTokens ?? 1024,
      };
      // Workers AI JSON Mode is response_format:{type:"json_schema", json_schema}
      // (per the docs) — a bare {type:"json_object"} isn't the supported shape.
      // Use it only when the caller supplies a schema; otherwise the system
      // directive + response normalizer carry it (works across the whole catalog).
      if (input.expectsJson && input.jsonSchema) {
        args.response_format = { type: "json_schema", json_schema: input.jsonSchema };
      }
      // The binding call is built INSIDE the closure: a promise can only be
      // awaited once, so retrying a hoisted `run` would re-await the same
      // settled rejection forever.
      const attempt = async () => {
        const result = await withTimeout(
          env.AI!.run(model.id as Parameters<Ai["run"]>[0], args as Parameters<Ai["run"]>[1]) as Promise<WorkersAiResult>,
        );
        const text = readWorkersAiOutput(result);
        // Checked in here, not after, so an empty body is a RETRYABLE failure
        // rather than a permanent one — same treatment Gemini already got.
        if (!text.trim()) throw new Error("empty model response");
        return { result, text };
      };
      const { result, text } = await withRetry(attempt, (n, why) => { retries.push(`${n}:${why.slice(0, 60)}`); });
      // An empty body is a FAILURE, not a free success — checked inside
      // `attempt` above so it is retried first, and if every attempt comes back
      // empty the throw escapes to the catch below, which releases the hold.
      // Workers AI used to return `ok: true` with "" for a model answering in an
      // envelope we did not read, and still settled credits because the estimate
      // covers the input tokens: the self-test caught three checks "succeeding"
      // against gemma-4-26b for 1-3 credits each with nothing to show.
      output = text;
      usage = billedUsage({ inputTokens: result.usage?.prompt_tokens, outputTokens: result.usage?.completion_tokens }, estUsage, output, model);
    }
  } catch (err) {
    await dobj.release(hold.hold);
    const tried = retries.length ? ` (after ${retries.length} retr${retries.length === 1 ? "y" : "ies"}: ${retries.join("; ")})` : "";
    const detail = `${model.provider}/${model.id}: ${err instanceof Error ? err.message : String(err)}${tried}`;
    await audit(env, input, model.id, 0, 0, false, detail);
    return { ok: false, error: "unavailable", detail };
  }

  const credits = creditsForUsage(usage, rate);
  // The generation already succeeded — never let a transient settle failure
  // discard the output. A leaked hold self-reaps via HOLD_TTL_MS.
  try {
    await dobj.settle(hold.hold, credits, `ai.${input.feature}`, model.id);
  } catch { /* DO transient — hold reaps on TTL; return the successful output */ }
  await audit(env, input, model.id, credits, usage.outputTokens ?? 0, true, retries.length ? `recovered after ${retries.length} transient failure(s): ${retries.join("; ")}` : null);
  return { ok: true, output, credits, mocked };
}

// ── Image generation (Gemini "Nano Banana") ─────────────────────────────────

export interface GenerateImageInput {
  tenantId: string;
  actorUserId: string;
  subjectId?: string | null;
  feature: string;
  prompt: string;
  /** Optional reference image (base64) for image-to-image generation. */
  reference?: { data: string; mimeType: string };
}
export type GenerateImageResult =
  | { ok: true; key: string; credits: number; mocked: boolean }
  | { ok: false; error: "insufficient_credits"; available: number; needed: number }
  | { ok: false; error: "storage_full"; usedBytes: number; limitBytes: number }
  | { ok: false; error: "unavailable"; detail?: string };

/** A 1×1 transparent PNG — the deterministic dev/mock image. */
const MOCK_PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const b64ToBytes = (b64: string): Uint8Array => { const bin = atob(b64); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };

interface GeminiImageResponse { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[]; usageMetadata?: { promptTokenCount?: number } }

async function runGeminiImage(key: string, modelId: string, prompt: string, reference?: { data: string; mimeType: string }): Promise<{ bytes: Uint8Array; mimeType: string; inputTokens: number }> {
  const parts: Record<string, unknown>[] = [{ text: prompt }];
  // Image-to-image: seed with a reference so the output keeps its character,
  // style and camera angle (used for a coherent exercise start→end pair).
  if (reference) parts.push({ inline_data: { mime_type: reference.mimeType, data: reference.data } });
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(key)}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["IMAGE"] } }) },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 300)}`);
  const json = (await res.json()) as GeminiImageResponse;
  const part = (json.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new Error("no image");
  return { bytes: b64ToBytes(part.inlineData.data), mimeType: part.inlineData.mimeType ?? "image/png", inputTokens: json.usageMetadata?.promptTokenCount ?? Math.ceil(prompt.length / CHARS_PER_INPUT_TOKEN) };
}

/**
 * Generate an image (Gemini image models). Mirrors generate()'s metered loop —
 * reserve → run → settle — but the output is stored to R2 and a media key is
 * returned. Billed per image at the model's rate × markup; fails when the
 * tenant can't cover the reserve.
 */
export async function generateImage(env: AiBindings, input: GenerateImageInput): Promise<GenerateImageResult> {
  const { config, toggles } = await loadTenantAi(env.DB, input.tenantId);
  const fcfg = config.features?.[input.feature] ?? {};
  if ((fcfg.enabled ?? toggles[input.feature] ?? true) === false) return { ok: false, error: "unavailable", detail: `feature "${input.feature}" is turned off in AI settings` };

  // Only a model that actually GENERATES images. There is no fallback to a
  // Gemini text model, and there was: `visionFallbackModel` returns one, which
  // reads images and cannot make them, so the fallback guaranteed a failed call
  // dressed up as a working configuration. Refusing here says the true thing —
  // no image model is switched on — instead of surfacing whatever the provider
  // replies when asked for a modality the model does not have.
  let model: AiModelRow | null = null;
  // One shared compatibility rule, so the per-feature override here cannot
  // accept a model `generate()`/`modelSupportsTask` would reject.
  if (fcfg.model) { const m = await modelById(env.DB, fcfg.model); if (m && modelSupportsTask(m, "image")) model = m; }
  if (!model) { const m = await modelForTask(env.DB, "image"); if (m && modelSupportsTask(m, "image")) model = m; }
  if (!model) {
    return {
      ok: false,
      error: "unavailable",
      detail: "no image-generating model is switched on — sync the catalog and enable one of Google's image models (the Nano Banana family; ordinary Gemini text models read images but cannot make them)",
    };
  }
  const rate = rateOf(model);

  // The studio's custom style instructions append to the built-in image prompt
  // (kept, not replaced) — same additive rule as the text features.
  const prompt = fcfg.system && fcfg.system.trim() ? `${input.prompt}\n\nAdditional instruction: ${fcfg.system.trim()}` : input.prompt;

  const cfg = await getConfig(env);
  const geminiKey = cfg["google.gemini_key"];
  const mockMode = cfg["ai.mock"] ?? "auto";
  // Dev-only in every mode (incl. an explicit `ai.mock = "on"`); production
  // fails closed on a missing key and never bills for a fabricated image.
  const useMock = shouldUseMockLane({ mockMode, canRunReal: !!geminiKey, isDevelopment: env.ENVIRONMENT === "development" });
  if (!useMock && !geminiKey) return { ok: false, error: "unavailable", detail: "AI provider not configured" };

  // Storage gate up front — refuse to spend credits generating an image the
  // studio has no room to keep. (The per-image size isn't known yet, so this
  // blocks only when already at/over quota; putMedia records the exact bytes.)
  {
    const { usedBytes, limitBytes } = await storageUsage(env, input.tenantId);
    if (limitBytes >= 0 && usedBytes >= limitBytes) return { ok: false, error: "storage_full", usedBytes, limitBytes };
  }

  const estUsage: Usage = { inputTokens: Math.ceil(prompt.length / CHARS_PER_INPUT_TOKEN), images: 1 };
  const estimate = creditsForUsage(estUsage, rate);
  const dobj = env.BILLING.get(env.BILLING.idFromName(input.tenantId));
  await dobj.bind(input.tenantId);
  const hold = await dobj.reserve(estimate);
  if (!hold.ok) return { ok: false, error: "insufficient_credits", available: hold.available, needed: hold.needed };

  let bytes: Uint8Array, mimeType: string, usage: Usage, mocked = false;
  try {
    if (useMock) { bytes = b64ToBytes(MOCK_PNG_B64); mimeType = "image/png"; usage = estUsage; mocked = true; }
    else { const r = await withTimeout(runGeminiImage(geminiKey!, model.id, prompt, input.reference)); bytes = r.bytes; mimeType = r.mimeType; usage = { inputTokens: r.inputTokens, images: 1 }; }
  } catch (err) {
    await dobj.release(hold.hold);
    const detail = `${model.id}: ${err instanceof Error ? err.message : String(err)}`;
    await audit(env, { ...imageAuditInput(input), task: "image" } as GenerateInput, model.id, 0, 0, false, detail);
    return { ok: false, error: "unavailable", detail };
  }

  const ext = mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";
  const mediaKey = `t/${input.tenantId}/ai/${newId("img")}.${ext}`;
  // enforce:false — we pre-gated above and the credits are already committed, so
  // this records the ledger row + stores without failing (a single image can't
  // meaningfully overshoot; the pre-check kept us under budget).
  await putMedia(env, { tenantId: input.tenantId, key: mediaKey, bytes, contentType: mimeType, purpose: "ai", subjectId: input.subjectId ?? null, ownerUserId: input.actorUserId ?? null, enforce: false });
  const credits = creditsForUsage(usage, rate);
  // Image is stored and returned regardless — a settle failure must not orphan
  // the R2 object or lose the result; the hold self-reaps via HOLD_TTL_MS.
  try {
    await dobj.settle(hold.hold, credits, `ai.${input.feature}`, model.id);
  } catch { /* DO transient — hold reaps on TTL; return the stored image */ }
  await audit(env, { ...imageAuditInput(input), task: "image" } as GenerateInput, model.id, credits, 0, true, null);
  return { ok: true, key: mediaKey, credits, mocked };
}

const imageAuditInput = (i: GenerateImageInput) => ({ tenantId: i.tenantId, actorUserId: i.actorUserId, subjectId: i.subjectId, feature: i.feature });

// ── Text-to-speech (Gemini TTS) ──────────────────────────────────────────────
// Used for the body-scan voice cues. Generated ONCE per (tenant, voice, lang,
// phrase) and cached in R2 (see body-scan-routes), so runtime cost is a stored-
// file read. Gemini only ever receives the cue TEXT — never a camera frame.

export const DEFAULT_TTS_VOICE = "Kore";
export const TTS_MODEL = "gemini-2.5-flash-preview-tts";

export type GenerateSpeechResult =
  | { ok: true; bytes: Uint8Array; mimeType: "audio/wav"; credits: number; mocked: boolean }
  | { ok: false; error: "insufficient_credits"; available: number; needed: number }
  | { ok: false; error: "unavailable"; detail?: string };

/** Wrap raw 16-bit-LE mono PCM in a minimal WAV container so browsers can play
 *  it directly from an <audio>/Audio() element. */
function pcmToWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const bytesPerSample = 2, channels = 1;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const out = new Uint8Array(44 + pcm.length);
  const dv = new DataView(out.buffer);
  const ascii = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  ascii(0, "RIFF"); dv.setUint32(4, 36 + pcm.length, true); ascii(8, "WAVE");
  ascii(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, channels, true); dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, byteRate, true); dv.setUint16(32, blockAlign, true); dv.setUint16(34, 16, true);
  ascii(36, "data"); dv.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

/** A ~0.35s silent WAV — the deterministic dev/mock cue. */
function silentWav(): Uint8Array {
  return pcmToWav(new Uint8Array(24_000 * 2 * 0.35 | 0), 24_000);
}

interface GeminiTtsResponse {
  candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

async function runGeminiTts(key: string, modelId: string, text: string, voice: string): Promise<{ pcm: Uint8Array; sampleRate: number; inputTokens?: number; outputTokens?: number }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      }),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const json = (await res.json()) as GeminiTtsResponse;
  const part = (json.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new Error("no audio");
  const sampleRate = Number(part.inlineData.mimeType?.match(/rate=(\d+)/)?.[1] ?? 24_000);
  return {
    pcm: b64ToBytes(part.inlineData.data),
    sampleRate,
    // Audio output is the dearest rate in the catalog (~$10/1M tokens). `?? 0`
    // here made a voice pack FREE whenever Google omitted usageMetadata, so an
    // absent count falls back to the reserve via `billedUsage` at the call site.
    ...geminiBilledTokens(json.usageMetadata),
  };
}

/** Fallback TTS rate if the catalog model isn't resolvable (Flash TTS list price). */
const TTS_FALLBACK_RATE: ModelRate = { inputRate: 45_455, outputRate: 909_091, markup: DEFAULT_MODELS.find((m) => m.task === "speech")?.markup ?? 3 };

/**
 * Generate spoken audio (WAV) for a short cue phrase, metered through the model
 * catalog exactly like text/image generation: reserve a worst-case hold →
 * run → settle the exact credits from real token usage (input text + output
 * audio tokens × the model's neuron rate × the admin markup). Refunds via the
 * hold on failure. Caller stores + reuses the bytes; mock lane returns silence.
 */
export async function generateSpeech(env: AiBindings, input: { tenantId: string; feature: string; text: string; voice?: string }): Promise<GenerateSpeechResult> {
  const cfg = await getConfig(env);
  const geminiKey = cfg["google.gemini_key"];
  const mockMode = cfg["ai.mock"] ?? "auto";
  // Mock (silent WAV) is dev-only in every mode; production fails closed on a
  // missing key so a client's scan never bills the owner for silent cues that
  // then cache permanently.
  const useMock = shouldUseMockLane({ mockMode, canRunReal: !!geminiKey, isDevelopment: env.ENVIRONMENT === "development" });
  if (!useMock && !geminiKey) return { ok: false, error: "unavailable", detail: "AI provider not configured" };

  const model = await modelForTask(env.DB, "speech");
  const rate = model ? rateOf(model) : TTS_FALLBACK_RATE;
  const modelId = model?.id ?? TTS_MODEL;

  // Worst-case reserve: text tokens in + a generous audio-token cap out (a short
  // cue is a few seconds of audio); the settle uses the provider's real counts.
  const estUsage: Usage = { inputTokens: Math.ceil(input.text.length / CHARS_PER_INPUT_TOKEN), outputTokens: Math.max(200, input.text.length * 12) };
  const dobj = env.BILLING.get(env.BILLING.idFromName(input.tenantId));
  await dobj.bind(input.tenantId);
  const hold = await dobj.reserve(creditsForUsage(estUsage, rate));
  if (!hold.ok) return { ok: false, error: "insufficient_credits", available: hold.available, needed: hold.needed };

  let bytes: Uint8Array, usage: Usage, mocked = false;
  try {
    if (useMock) { bytes = silentWav(); usage = estUsage; mocked = true; }
    else {
      const r = await withTimeout(runGeminiTts(geminiKey!, modelId, input.text, input.voice ?? DEFAULT_TTS_VOICE));
      bytes = pcmToWav(r.pcm, r.sampleRate);
      usage = billedUsage(r, estUsage, "", { ...(model ?? ({} as AiModelRow)), id: modelId, provider: "google" });
    }
  } catch (err) {
    await dobj.release(hold.hold);
    return { ok: false, error: "unavailable", detail: err instanceof Error ? err.message : String(err) };
  }
  const credits = creditsForUsage(usage, rate);
  try { await dobj.settle(hold.hold, credits, `tts.${input.feature}`, modelId); }
  catch { /* DO transient — hold self-reaps; still return the audio */ }
  return { ok: true, bytes, mimeType: "audio/wav", credits, mocked };
}

async function audit(
  env: AiBindings,
  input: GenerateInput,
  model: string,
  credits: number,
  outTokens: number,
  ok: boolean,
  error: string | null,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO ai_generations (id, tenant_id, actor_user_id, subject_id, feature, model, neurons, credits, ok, error, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      newId("gen"), input.tenantId, input.actorUserId, input.subjectId ?? null, input.feature,
      model, outTokens, credits, ok ? 1 : 0, error, nowMs(),
    )
    .run()
    .catch(() => undefined);
}

// ── Per-client AI spend cap + rate limit (SPEC §6) ───────────────────────────
// Bounds how much of the tenant's shared balance ONE client persona can consume,
// so a hostile/compromised/enthusiastic client can't drain the monthly grant and
// the owner's purchased credits. Two guards, both enforced BEFORE the reserve:
//   (1) an owner-configurable per-client DAILY CREDIT cap (tenant_settings
//       ai_config_json.perActorDailyCreditCap; 0/unset = off), and
//   (2) an always-on per-client DAILY REQUEST ceiling as a backstop.
// Usage is summed from the actor's ai_generations rows over a rolling 24h window
// (server clock — never a client-supplied date, so it can't be gamed).

/** Hard per-client daily request ceiling (backstop when no owner cap is set). */
export const ACTOR_DAILY_REQUEST_LIMIT = 120;

/** The owner's per-client daily AI credit cap (SPEC §6), read from the tenant's
 *  ai_config_json. Returns 0 when unset/invalid (cap disabled). */
export async function perActorDailyCreditCap(db: D1Database, tenantId: string): Promise<number> {
  const row = await db.prepare("SELECT ai_config_json FROM tenant_settings WHERE tenant_id = ?").bind(tenantId).first<{ ai_config_json: string | null }>();
  try {
    const cfg = row?.ai_config_json ? (JSON.parse(row.ai_config_json) as { perActorDailyCreditCap?: unknown }) : {};
    const v = Number(cfg.perActorDailyCreditCap);
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch { return 0; }
}

export type ActorBudgetResult =
  | { ok: true }
  | { ok: false; reason: "rate_limited" | "daily_cap"; used: number; limit: number };

/** Enforce the per-client daily AI budget for a client persona. Sums today's
 *  successful generations for the actor and refuses when either the hard request
 *  ceiling or the owner-set credit cap is hit. Call BEFORE generate()/reserve. */
export async function checkActorDailyBudget(env: AiBindings, tenantId: string, actorUserId: string): Promise<ActorBudgetResult> {
  const since = nowMs() - 86_400_000;
  const agg = await env.DB
    .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(credits), 0) AS c FROM ai_generations WHERE tenant_id = ? AND actor_user_id = ? AND ok = 1 AND at >= ?")
    .bind(tenantId, actorUserId, since)
    .first<{ n: number; c: number }>()
    .catch(() => null);
  const count = agg?.n ?? 0;
  const spent = agg?.c ?? 0;
  if (count >= ACTOR_DAILY_REQUEST_LIMIT) return { ok: false, reason: "rate_limited", used: count, limit: ACTOR_DAILY_REQUEST_LIMIT };
  const cap = await perActorDailyCreditCap(env.DB, tenantId);
  if (cap > 0 && spent >= cap) return { ok: false, reason: "daily_cap", used: Math.round(spent), limit: cap };
  return { ok: true };
}

// ── Response normalizer ──────────────────────────────────────────────────────
// Provider-agnostic: works identically on Gemini and Workers AI output. Real
// models wrap JSON in prose, fence it, add trailing commas / comments / smart
// quotes, or get truncated by the token cap mid-object. This coerces all of
// that back to parseable JSON so a well-formed answer is never lost to
// formatting noise.

/** Replace curly quotes, strip comments + trailing commas, drop a BOM. */
function cleanJsonText(s: string): string {
  return s
    .replace(/^﻿/, "")
    .replace(/[“”„‟″]/g, '"') // “ ” „ ‟ ″ → "
    .replace(/[‘’‚‛′]/g, "'") // ‘ ’ ‚ ‛ ′ → '
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/(^|[^:"'\\])\/\/[^\n\r]*/g, "$1") // line comments (not URLs in strings)
    .replace(/,(\s*[}\]])/g, "$1"); // trailing commas
}

/** Strip a leading ```json fence (or any fence) and return the inner body. */
function stripFence(s: string): string {
  const m = s.match(/```(?:json|json5|javascript|js)?\s*([\s\S]*?)```/i);
  return m ? m[1]! : s;
}

/**
 * Slice from the first `{`/`[` to its balanced close, respecting strings and
 * escapes. If the source is truncated (close never reached), the returned
 * slice is repaired: any open string is terminated and missing brackets are
 * appended in the right order, so a cut-off object still parses.
 */
function balancedSlice(s: string): string | null {
  const start = s.search(/[[{]/);
  if (start === -1) return null;
  const stack: string[] = [];
  let inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") {
      stack.pop();
      if (stack.length === 0) return s.slice(start, i + 1); // clean close
    }
  }
  // Truncated: repair the tail. Close an open string, drop a dangling
  // comma / partial key, then append the missing closers.
  let out = s.slice(start);
  if (inStr) out += '"';
  out = out.replace(/,\s*$/, "").replace(/:\s*$/, ": null").replace(/,\s*"[^"]*"\s*:?\s*$/, "");
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i];
  return out;
}

/**
 * Pull structured JSON out of any model response. Tries progressively harder
 * candidates — raw, de-fenced, balanced-sliced, cleaned, and truncation-
 * repaired — and returns the first that parses. Null only when there is no
 * recoverable JSON at all.
 */
export function extractJson<T>(raw: string): T | null {
  if (!raw) return null;
  const seen = new Set<string>();
  const bodies = [raw, stripFence(raw)];
  const candidates: string[] = [];
  for (const b of bodies) {
    candidates.push(b.trim());
    const sliced = balancedSlice(b);
    if (sliced) {
      candidates.push(sliced);
      candidates.push(cleanJsonText(sliced));
    }
    candidates.push(cleanJsonText(b));
  }
  for (const c of candidates) {
    const t = c.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    try {
      return JSON.parse(t) as T;
    } catch {
      /* try the next, harder candidate */
    }
  }
  return null;
}
