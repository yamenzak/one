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
import type { Env } from "./env.js";
import { newId, nowMs } from "./ids.js";
import { getConfig } from "./billing-store.js";

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
];

let modelsSeeded = false;

export async function seedAiModels(db: D1Database): Promise<void> {
  if (modelsSeeded) return;
  modelsSeeded = true;
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
    .catch(() => {
      modelsSeeded = false;
    });
}

export async function modelForTask(db: D1Database, task: string): Promise<AiModelRow | null> {
  await seedAiModels(db);
  return db
    .prepare("SELECT * FROM ai_models WHERE task = ? AND enabled = 1 ORDER BY is_default DESC LIMIT 1")
    .bind(task)
    .first<AiModelRow>();
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
  task: "text" | "text-small";
  system: string;
  prompt: string;
  maxOutputTokens?: number;
  /** Deterministic mock output builder for dev / `ai.mock = on`. */
  mock: () => string;
}

export type GenerateResult =
  | { ok: true; output: string; credits: number; mocked: boolean }
  | { ok: false; error: "insufficient_credits"; available: number; needed: number }
  | { ok: false; error: "unavailable" };

const RUN_TIMEOUT_MS = 120_000;

export async function generate(env: Env, input: GenerateInput): Promise<GenerateResult> {
  // Owner AI feature toggles — a feature explicitly switched off is refused
  // before any credit hold. Absent/true = allowed (opt-out, not opt-in).
  const settings = await env.DB.prepare("SELECT ai_toggles_json FROM tenant_settings WHERE tenant_id = ?")
    .bind(input.tenantId)
    .first<{ ai_toggles_json: string | null }>();
  if (settings?.ai_toggles_json) {
    try {
      const toggles = JSON.parse(settings.ai_toggles_json) as Record<string, boolean>;
      if (toggles[input.feature] === false) return { ok: false, error: "unavailable" };
    } catch { /* malformed toggles → allow */ }
  }

  const model = await modelForTask(env.DB, input.task);
  if (!model) return { ok: false, error: "unavailable" };
  const rate = rateOf(model);

  const cfg = await getConfig(env.DB);
  const mockMode = cfg["ai.mock"] ?? "auto";
  const useMock = mockMode === "on" || (mockMode !== "off" && !env.AI);

  // Worst-case estimate for the hold: prompt tokens (~chars/4) in, cap out.
  const estUsage: Usage = {
    inputTokens: Math.ceil((input.system.length + input.prompt.length) / 4),
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
    } else {
      const run = env.AI!.run(model.id as Parameters<Ai["run"]>[0], {
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.prompt },
        ],
        max_tokens: input.maxOutputTokens ?? 1024,
      }) as Promise<{ response?: string; usage?: { prompt_tokens?: number; completion_tokens?: number } }>;
      const result = await Promise.race([
        run,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), RUN_TIMEOUT_MS)),
      ]);
      output = result.response ?? "";
      usage = {
        inputTokens: result.usage?.prompt_tokens ?? estUsage.inputTokens,
        outputTokens: result.usage?.completion_tokens ?? Math.ceil(output.length / 4),
      };
    }
  } catch (err) {
    await dobj.release(hold.hold);
    await audit(env, input, model.id, 0, 0, false, String(err));
    return { ok: false, error: "unavailable" };
  }

  const credits = creditsForUsage(usage, rate);
  await dobj.settle(hold.hold, credits, `ai.${input.feature}`, model.id);
  await audit(env, input, model.id, credits, usage.outputTokens ?? 0, true, null);
  return { ok: true, output, credits, mocked };
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
