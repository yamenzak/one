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
 * (`@mossa/domain`) puts `env.ENVIRONMENT === "development"` on the outside, so
 * a stored `ai.mock = "on"` — from the admin console, a hand-edited app_config
 * row, or a restored backup — cannot fabricate output in production. Fabricated
 * `lab-extract` markers would otherwise pre-fill a real client's chart, flow
 * into their `LABS:` prompt block and the supplement recommender, and bill the
 * tenant credits for the privilege. See AGENTS §6.
 */

import { creditsForUsage, shouldUseMockLane, type ModelRate, type Usage } from "@mossa/domain";
import type { TenantAiConfig, AiTone } from "@mossa/protocol";
import type { Env } from "./env.js";
import { newId, nowMs } from "./ids.js";
import { getConfig } from "./billing-store.js";
import { putMedia, storageUsage } from "./storage.js";
import { featureDef, TONE_GUIDE } from "./ai-features.js";

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
 * Can this catalog row serve `task`? The catalog now also carries lanes nothing
 * here can execute (embedding / transcribe / tts / classify — discovered and
 * priced by the admin sync so the catalog is honest about what the providers
 * sell, but inert), so this is a WHITELIST of the generation lanes rather than
 * a blacklist of the ones we happened to know about: a blacklist quietly let a
 * Gemini embedding model satisfy a vision request. Gemini models are multimodal,
 * so any Google text model also reads images and can generate them.
 */
export function modelSupportsTask(m: AiModelRow, task: "text" | "text-small" | "vision" | "image"): boolean {
  const text = m.task === "text" || m.task === "text-small";
  if (task === "image") return m.task === "image" || (m.provider === "google" && text);
  if (task === "vision") return m.task === "vision" || (m.provider === "google" && (text || m.task === "image"));
  return text;
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

export interface GenerateInput {
  tenantId: string;
  actorUserId: string;
  clientId?: string | null;
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

/** The worst-case usage `generate()` reserves against — chars/4 in (plus an
 *  image allowance) and the full output cap out. Exported so the admin
 *  self-test can quote the same number it is about to spend, rather than a
 *  second, drifting estimate. */
export function estimateUsage(args: { system: string; prompt: string; maxOutputTokens?: number; hasImage?: boolean }): Usage {
  return {
    inputTokens: Math.ceil((args.system.length + args.prompt.length) / 4) + (args.hasImage ? IMAGE_TOKEN_EST : 0),
    outputTokens: args.maxOutputTokens ?? 1024,
  };
}

/** Upper-bound credits a `generate()` call on `model` would reserve. */
export function estimateRunCredits(model: AiModelRow, args: { system: string; prompt: string; maxOutputTokens?: number; hasImage?: boolean }): number {
  return creditsForUsage(estimateUsage(args), rateOf(model));
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), RUN_TIMEOUT_MS))]);
}

interface GeminiPart { text?: string }
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
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
  return {
    output,
    usage: { inputTokens: json.usageMetadata?.promptTokenCount ?? 0, outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0 },
  };
}

export async function generate(env: Env, input: GenerateInput): Promise<GenerateResult> {
  // Resolve the tenant's per-feature AI config (enable, model, prompt, tone).
  const { config, toggles } = await loadTenantAi(env.DB, input.tenantId);
  const fcfg = config.features?.[input.feature] ?? {};

  // Enabled: per-feature config wins, then the legacy toggle map, else on.
  // A feature explicitly switched off is refused before any credit hold.
  const enabled = fcfg.enabled ?? toggles[input.feature] ?? true;
  if (enabled === false) return { ok: false, error: "unavailable", detail: `feature "${input.feature}" is turned off in AI settings` };

  const cfg = await getConfig(env.DB);
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
  if (!model) model = await modelForTask(env.DB, input.task);
  // Vision fallback: no vision-tagged model → pick any enabled Gemini model.
  if (!model && input.task === "vision") model = await visionFallbackModel(env.DB);
  if (!model) return { ok: false, error: "unavailable", detail: `no enabled model for task "${input.task}" — sync the model catalog in admin` };
  const rate = rateOf(model);

  // System prompt: the built-in default is authoritative and always kept; a
  // tenant's custom instructions are APPENDED (framed as an extra request), so
  // they refine rather than clobber the engine's output contract. A house or
  // per-feature tone is appended for tonable (creative) features only.
  const def = featureDef(input.feature);
  let system = input.system;
  if (fcfg.system && fcfg.system.trim()) {
    system = `${system}\n\nThe studio has also asked you to follow these additional instructions, as long as they don't conflict with the rules above:\n${fcfg.system.trim()}`;
  }
  if (def?.tonable) {
    const tone = (fcfg.tone ?? config.tone) as AiTone | null | undefined;
    if (tone && TONE_GUIDE[tone]) system = `${system}\n\n${TONE_GUIDE[tone]}`;
  }
  // JSON features: nail the output contract in the system prompt too. Gemini
  // has native JSON mode, but Workers AI models obey a firm instruction far
  // better than a bare schema hint — and it costs nothing when JSON mode is on.
  if (input.expectsJson) {
    system = `${system}\n\nOutput format: respond with ONLY a single valid JSON value — no prose, no explanation, no markdown code fences. Do not wrap the JSON in \`\`\`.`;
  }
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
  const estUsage = estimateUsage({ system, prompt: input.prompt, maxOutputTokens: input.maxOutputTokens, hasImage: !!input.image });
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
  try {
    if (useMock) {
      output = input.mock();
      usage = { inputTokens: estUsage.inputTokens, outputTokens: Math.ceil(output.length / 4) };
      mocked = true;
    } else if (isGoogle) {
      const g = await withTimeout(runGemini(geminiKey!, model.id, runInput));
      output = g.output;
      usage = { inputTokens: g.usage.inputTokens ?? estUsage.inputTokens, outputTokens: g.usage.outputTokens ?? Math.ceil(output.length / 4) };
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
      const run = env.AI!.run(model.id as Parameters<Ai["run"]>[0], args as Parameters<Ai["run"]>[1]) as Promise<{ response?: string | object; usage?: { prompt_tokens?: number; completion_tokens?: number } }>;
      const result = await withTimeout(run);
      // json_object mode can hand back an already-parsed object — re-serialize
      // so the normalizer + callers always see a JSON string.
      output = typeof result.response === "string" ? result.response : result.response ? JSON.stringify(result.response) : "";
      usage = {
        inputTokens: result.usage?.prompt_tokens ?? estUsage.inputTokens,
        outputTokens: result.usage?.completion_tokens ?? Math.ceil(output.length / 4),
      };
    }
  } catch (err) {
    await dobj.release(hold.hold);
    const detail = `${model.provider}/${model.id}: ${err instanceof Error ? err.message : String(err)}`;
    await audit(env, input, model.id, 0, 0, false, detail);
    return { ok: false, error: "unavailable", detail };
  }

  const credits = creditsForUsage(usage, rate);
  // The generation already succeeded — never let a transient settle failure
  // discard the output. A leaked hold self-reaps via HOLD_TTL_MS.
  try {
    await dobj.settle(hold.hold, credits, `ai.${input.feature}`, model.id);
  } catch { /* DO transient — hold reaps on TTL; return the successful output */ }
  await audit(env, input, model.id, credits, usage.outputTokens ?? 0, true, null);
  return { ok: true, output, credits, mocked };
}

// ── Image generation (Gemini "Nano Banana") ─────────────────────────────────

export interface GenerateImageInput {
  tenantId: string;
  actorUserId: string;
  clientId?: string | null;
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
  return { bytes: b64ToBytes(part.inlineData.data), mimeType: part.inlineData.mimeType ?? "image/png", inputTokens: json.usageMetadata?.promptTokenCount ?? Math.ceil(prompt.length / 4) };
}

/**
 * Generate an image (Gemini image models). Mirrors generate()'s metered loop —
 * reserve → run → settle — but the output is stored to R2 and a media key is
 * returned. Billed per image at the model's rate × markup; fails when the
 * tenant can't cover the reserve.
 */
export async function generateImage(env: Env, input: GenerateImageInput): Promise<GenerateImageResult> {
  const { config, toggles } = await loadTenantAi(env.DB, input.tenantId);
  const fcfg = config.features?.[input.feature] ?? {};
  if ((fcfg.enabled ?? toggles[input.feature] ?? true) === false) return { ok: false, error: "unavailable", detail: `feature "${input.feature}" is turned off in AI settings` };

  // Any Gemini model can generate images; prefer a dedicated image-priced model
  // (per-image billing), else fall back to any enabled Gemini model.
  let model: AiModelRow | null = null;
  if (fcfg.model) { const m = await modelById(env.DB, fcfg.model); if (m && (m.task === "image" || m.provider === "google")) model = m; }
  if (!model) model = await modelForTask(env.DB, "image");
  if (!model) model = await visionFallbackModel(env.DB);
  if (!model || model.provider !== "google") return { ok: false, error: "unavailable", detail: "no enabled Gemini image model — add a Gemini key and sync the catalog" };
  const rate = rateOf(model);

  // The studio's custom style instructions append to the built-in image prompt
  // (kept, not replaced) — same additive rule as the text features.
  const prompt = fcfg.system && fcfg.system.trim() ? `${input.prompt}\n\nThe studio also asks: ${fcfg.system.trim()}` : input.prompt;

  const cfg = await getConfig(env.DB);
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

  const estUsage: Usage = { inputTokens: Math.ceil(prompt.length / 4), images: 1 };
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
  await putMedia(env, { tenantId: input.tenantId, key: mediaKey, bytes, contentType: mimeType, purpose: "ai", clientId: input.clientId ?? null, ownerUserId: input.actorUserId ?? null, enforce: false });
  const credits = creditsForUsage(usage, rate);
  // Image is stored and returned regardless — a settle failure must not orphan
  // the R2 object or lose the result; the hold self-reaps via HOLD_TTL_MS.
  try {
    await dobj.settle(hold.hold, credits, `ai.${input.feature}`, model.id);
  } catch { /* DO transient — hold reaps on TTL; return the stored image */ }
  await audit(env, { ...imageAuditInput(input), task: "image" } as GenerateInput, model.id, credits, 0, true, null);
  return { ok: true, key: mediaKey, credits, mocked };
}

const imageAuditInput = (i: GenerateImageInput) => ({ tenantId: i.tenantId, actorUserId: i.actorUserId, clientId: i.clientId, feature: i.feature });

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

async function runGeminiTts(key: string, modelId: string, text: string, voice: string): Promise<{ pcm: Uint8Array; sampleRate: number; inputTokens: number; outputTokens: number }> {
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
    inputTokens: json.usageMetadata?.promptTokenCount ?? Math.ceil(text.length / 4),
    outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
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
export async function generateSpeech(env: Env, input: { tenantId: string; feature: string; text: string; voice?: string }): Promise<GenerateSpeechResult> {
  const cfg = await getConfig(env.DB);
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
  const estUsage: Usage = { inputTokens: Math.ceil(input.text.length / 4), outputTokens: Math.max(200, input.text.length * 12) };
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
      usage = { inputTokens: r.inputTokens, outputTokens: r.outputTokens };
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
  env: Env,
  input: GenerateInput,
  model: string,
  credits: number,
  outTokens: number,
  ok: boolean,
  error: string | null,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO ai_generations (id, tenant_id, actor_user_id, client_id, feature, model, neurons, credits, ok, error, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      newId("gen"), input.tenantId, input.actorUserId, input.clientId ?? null, input.feature,
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
//       ai_config_json.perClientDailyCreditCap; 0/unset = off), and
//   (2) an always-on per-client DAILY REQUEST ceiling as a backstop.
// Usage is summed from the actor's ai_generations rows over a rolling 24h window
// (server clock — never a client-supplied date, so it can't be gamed).

/** Hard per-client daily request ceiling (backstop when no owner cap is set). */
export const CLIENT_DAILY_REQUEST_LIMIT = 120;

/** The owner's per-client daily AI credit cap (SPEC §6), read from the tenant's
 *  ai_config_json. Returns 0 when unset/invalid (cap disabled). */
export async function perClientDailyCreditCap(db: D1Database, tenantId: string): Promise<number> {
  const row = await db.prepare("SELECT ai_config_json FROM tenant_settings WHERE tenant_id = ?").bind(tenantId).first<{ ai_config_json: string | null }>();
  try {
    const cfg = row?.ai_config_json ? (JSON.parse(row.ai_config_json) as { perClientDailyCreditCap?: unknown }) : {};
    const v = Number(cfg.perClientDailyCreditCap);
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch { return 0; }
}

export type ClientBudgetResult =
  | { ok: true }
  | { ok: false; reason: "rate_limited" | "daily_cap"; used: number; limit: number };

/** Enforce the per-client daily AI budget for a client persona. Sums today's
 *  successful generations for the actor and refuses when either the hard request
 *  ceiling or the owner-set credit cap is hit. Call BEFORE generate()/reserve. */
export async function checkClientDailyBudget(env: Env, tenantId: string, actorUserId: string): Promise<ClientBudgetResult> {
  const since = nowMs() - 86_400_000;
  const agg = await env.DB
    .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(credits), 0) AS c FROM ai_generations WHERE tenant_id = ? AND actor_user_id = ? AND ok = 1 AND at >= ?")
    .bind(tenantId, actorUserId, since)
    .first<{ n: number; c: number }>()
    .catch(() => null);
  const count = agg?.n ?? 0;
  const spent = agg?.c ?? 0;
  if (count >= CLIENT_DAILY_REQUEST_LIMIT) return { ok: false, reason: "rate_limited", used: count, limit: CLIENT_DAILY_REQUEST_LIMIT };
  const cap = await perClientDailyCreditCap(env.DB, tenantId);
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
