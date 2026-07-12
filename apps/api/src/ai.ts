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
 */

import { creditsForUsage, type ModelRate, type Usage } from "@mossa/domain";
import type { TenantAiConfig, AiTone } from "@mossa/protocol";
import type { Env } from "./env.js";
import { newId, nowMs } from "./ids.js";
import { getConfig } from "./billing-store.js";
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
  {
    id: "@cf/meta/llama-3.1-8b-instruct-fast",
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
    input_rate: 12_000,
    output_rate: 80_000,
    unit_rate: null,
    unit_kind: null,
    markup: 3,
  },
  {
    id: "@cf/meta/llama-4-scout-17b-16e-instruct",
    task: "text",
    label: "Llama 4 Scout 17B",
    provider: "workers-ai",
    input_rate: 14_000,
    output_rate: 100_000,
    unit_rate: null,
    unit_kind: null,
    markup: 3,
  },
  {
    id: "@cf/mistralai/mistral-small-3.1-24b-instruct",
    task: "text",
    label: "Mistral Small 3.1 24B",
    provider: "workers-ai",
    input_rate: 16_000,
    output_rate: 120_000,
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
];

/** Idempotent catalog seed (INSERT OR IGNORE by id). Runs on demand — no
 *  module-level guard, so it stays correct across isolated-storage test runs
 *  and picks up newly-added catalog entries without wiping admin edits. */
export async function seedAiModels(db: D1Database): Promise<void> {
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
  /** Deterministic mock output builder for dev / `ai.mock = on`. */
  mock: () => string;
}

export type GenerateResult =
  | { ok: true; output: string; credits: number; mocked: boolean }
  | { ok: false; error: "insufficient_credits"; available: number; needed: number }
  | { ok: false; error: "unavailable"; detail?: string };

const RUN_TIMEOUT_MS = 120_000;

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), RUN_TIMEOUT_MS))]);
}

interface GeminiPart { text?: string }
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/** Google AI Studio (Gemini) generateContent — text + optional inline image. */
async function runGemini(
  key: string,
  modelId: string,
  input: GenerateInput,
): Promise<{ output: string; usage: Usage }> {
  const parts: Record<string, unknown>[] = [{ text: input.prompt }];
  if (input.image) parts.push({ inline_data: { mime_type: input.image.mimeType, data: input.image.data } });
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: "user", parts }],
        generationConfig: { maxOutputTokens: input.maxOutputTokens ?? 1024 },
      }),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 300)}`);
  const json = (await res.json()) as GeminiResponse;
  if (!json.candidates?.[0]) throw new Error(`no candidates ${JSON.stringify(json).slice(0, 200)}`);
  const output = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
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

  // Model: a tenant's per-feature override (task-compatible) wins, else the
  // task default. Vision stays vision; text/text-small are interchangeable.
  const compatible = (m: AiModelRow) => (input.task === "vision" ? m.task === "vision" : m.task !== "vision");
  let model: AiModelRow | null = null;
  if (fcfg.model) { const m = await modelById(env.DB, fcfg.model); if (m && compatible(m)) model = m; }
  if (!model) model = await modelForTask(env.DB, input.task);
  if (!model) return { ok: false, error: "unavailable", detail: `no enabled model for task "${input.task}" — sync the model catalog in admin` };
  const rate = rateOf(model);

  // System prompt: a tenant override replaces the built-in default; a house or
  // per-feature tone is appended for tonable (creative) features only.
  const def = featureDef(input.feature);
  let system = (fcfg.system && fcfg.system.trim()) || input.system;
  if (def?.tonable) {
    const tone = (fcfg.tone ?? config.tone) as AiTone | null | undefined;
    if (tone && TONE_GUIDE[tone]) system = `${system}\n\n${TONE_GUIDE[tone]}`;
  }
  const runInput: GenerateInput = { ...input, system };

  const cfg = await getConfig(env.DB);
  const mockMode = cfg["ai.mock"] ?? "auto";
  const isGoogle = model.provider === "google";
  const geminiKey = cfg["google.gemini_key"];
  // Real run needs the matching credential: Workers AI binding, or a Gemini key.
  const canRunReal = isGoogle ? !!geminiKey : !!env.AI;
  const useMock = mockMode === "on" || (mockMode !== "off" && !canRunReal);

  // Worst-case estimate for the hold: prompt tokens (~chars/4) in, cap out.
  const estUsage: Usage = {
    inputTokens: Math.ceil((system.length + input.prompt.length) / 4),
    outputTokens: input.maxOutputTokens ?? 1024,
  };
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
      const run = env.AI!.run(model.id as Parameters<Ai["run"]>[0], {
        messages: [
          { role: "system", content: system },
          { role: "user", content: input.prompt },
        ],
        max_tokens: input.maxOutputTokens ?? 1024,
      }) as Promise<{ response?: string; usage?: { prompt_tokens?: number; completion_tokens?: number } }>;
      const result = await withTimeout(run);
      output = result.response ?? "";
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
  await dobj.settle(hold.hold, credits, `ai.${input.feature}`, model.id);
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
}
export type GenerateImageResult =
  | { ok: true; key: string; credits: number; mocked: boolean }
  | { ok: false; error: "insufficient_credits"; available: number; needed: number }
  | { ok: false; error: "unavailable" };

/** A 1×1 transparent PNG — the deterministic dev/mock image. */
const MOCK_PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const b64ToBytes = (b64: string): Uint8Array => { const bin = atob(b64); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };

interface GeminiImageResponse { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[]; usageMetadata?: { promptTokenCount?: number } }

async function runGeminiImage(key: string, modelId: string, prompt: string): Promise<{ bytes: Uint8Array; mimeType: string; inputTokens: number }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(key)}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE"] } }) },
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
  if ((fcfg.enabled ?? toggles[input.feature] ?? true) === false) return { ok: false, error: "unavailable" };

  let model: AiModelRow | null = null;
  if (fcfg.model) { const m = await modelById(env.DB, fcfg.model); if (m && m.task === "image") model = m; }
  if (!model) model = await modelForTask(env.DB, "image");
  if (!model || model.provider !== "google") return { ok: false, error: "unavailable" };
  const rate = rateOf(model);

  const cfg = await getConfig(env.DB);
  const geminiKey = cfg["google.gemini_key"];
  const mockMode = cfg["ai.mock"] ?? "auto";
  const useMock = mockMode === "on" || (mockMode !== "off" && !geminiKey);

  const estUsage: Usage = { inputTokens: Math.ceil(input.prompt.length / 4), images: 1 };
  const estimate = creditsForUsage(estUsage, rate);
  const dobj = env.BILLING.get(env.BILLING.idFromName(input.tenantId));
  await dobj.bind(input.tenantId);
  const hold = await dobj.reserve(estimate);
  if (!hold.ok) return { ok: false, error: "insufficient_credits", available: hold.available, needed: hold.needed };

  let bytes: Uint8Array, mimeType: string, usage: Usage, mocked = false;
  try {
    if (useMock) { bytes = b64ToBytes(MOCK_PNG_B64); mimeType = "image/png"; usage = estUsage; mocked = true; }
    else { const r = await withTimeout(runGeminiImage(geminiKey!, model.id, input.prompt)); bytes = r.bytes; mimeType = r.mimeType; usage = { inputTokens: r.inputTokens, images: 1 }; }
  } catch (err) {
    await dobj.release(hold.hold);
    await audit(env, { ...imageAuditInput(input), task: "image" } as GenerateInput, model.id, 0, 0, false, String(err));
    return { ok: false, error: "unavailable" };
  }

  const ext = mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";
  const mediaKey = `t/${input.tenantId}/ai/${newId("img")}.${ext}`;
  await env.MEDIA.put(mediaKey, bytes, { httpMetadata: { contentType: mimeType } });
  const credits = creditsForUsage(usage, rate);
  await dobj.settle(hold.hold, credits, `ai.${input.feature}`, model.id);
  await audit(env, { ...imageAuditInput(input), task: "image" } as GenerateInput, model.id, credits, 0, true, null);
  return { ok: true, key: mediaKey, credits, mocked };
}

const imageAuditInput = (i: GenerateImageInput) => ({ tenantId: i.tenantId, actorUserId: i.actorUserId, clientId: i.clientId, feature: i.feature });

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

/** Pull the first JSON object/array out of a model response (fenced or bare). */
export function extractJson<T>(raw: string): T | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? raw;
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  for (let end = candidate.length; end > start; end--) {
    try {
      return JSON.parse(candidate.slice(start, end)) as T;
    } catch {
      /* trim trailing junk and retry */
    }
  }
  return null;
}
