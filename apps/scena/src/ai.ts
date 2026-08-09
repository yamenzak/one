/**
 * AI generation (BLUEPRINT §24) — HTML slides/widgets, TTS announcements, and
 * image (poster) slides, across the full Workers AI catalog. Every call is
 * gated through the TenantBillingDO: reserve an estimate → run the model →
 * settle the *exact* credits from the neurons Cloudflare reports. Results are
 * cached by prompt hash so a repeat generation is free.
 *
 * A `mock` path (auto-enabled when no Workers AI binding is present, e.g. local
 * `wrangler dev` with no Cloudflare account) produces deterministic output +
 * synthetic neuron usage, so the reserve/settle/ledger flow is fully
 * exercisable end-to-end without live AI credentials.
 */

import type { Env } from "./env.js";
import { DEMO_TENANT } from "./db.js";
import { contentHash, FONT_FAMILIES } from "@scena/manifest";
import { describeWidgets, SHARED_STYLE_NOTES, WIDGET_REGISTRY } from "@scena/widgets";

/** Bundled font families the slide can use (see @scena/manifest fonts). */
const FONT_LIST = FONT_FAMILIES.join(", ");
import { getModel, getConfigValue, type ModelRow } from "./billing-store.js";
import { getBranding, brandBrief, brandImageHint } from "./branding-store.js";
// The credit meter and the mock-lane decision are the PLATFORM's, not Scena's.
// `credits.ts` used to sit beside this file — the same formula, the same two
// constants, one revision behind `@4dl/billing`'s hardened copy (which is
// Scena's own file, transplanted and then guarded against a non-finite usage
// figure the provider might report). Importing it back deletes the fork and
// picks up the guards.
import { neuronsForUsage, creditsForNeurons, type Usage, type ModelRate } from "@4dl/billing/model";
import { DEFAULT_SEED_MARKUP, estimateUsage as sharedEstimate, lanesFor, MUSIC_CLIP_SECONDS, shouldUseMockLane } from "@4dl/ai";
import { geminiGenerateText, geminiGenerateImage, geminiGenerateMusic, geminiGenerateSpeech } from "./gemini.js";
import { createMedia } from "./media-store.js";
import { storeAsset, StorageQuotaError } from "./storage.js";

export type AiTask = "text" | "tts" | "image" | "music" | "layout";

export interface GenerateRequest {
  task: AiTask;
  modelId: string;
  prompt: string;
  /** Optional slide title / voice / size / music-length hints. */
  options?: {
    maxTokens?: number; temperature?: number; voice?: string; width?: number; height?: number; steps?: number; durationSec?: number;
    /** A friendly name for the generated asset's Media Library entry (else derived). */
    libraryName?: string;
    /** Text task: what the HTML is for — a full-screen "slide" (default) or a
     *  "widget" that fills its own on-canvas box (width/height carry the box size). */
    surface?: "slide" | "widget";
    /** Layout task (§24 · widget designer): the canvas + the current widgets to
     *  read/improve (empty ⇒ design from scratch). */
    designW?: number; designH?: number; currentWidgets?: unknown[];
  };
  tenantId?: string;
  /**
   * WHO asked for this, and the reason the per-actor cap is not decorative.
   *
   * `ai_generations.actor_user_id` was written as a literal NULL on every row,
   * so `@4dl/ai`'s `checkActorDailyBudget` — which sums a rolling 24 hours of an
   * actor's rows — could only ever read zero. Mounting the cap without this
   * would have been a control that passes its own tests and bounds nothing.
   *
   * Optional because not every caller is a person: a board's announcement TTS
   * is triggered by the schedule, and attributing it to whoever last touched the
   * board would spend their allowance on the room's behalf.
   */
  actorUserId?: string | null;
}

export interface GenerateResult {
  ok: true;
  task: AiTask;
  model: string;
  /** For text: self-contained HTML. For tts/image: empty (see assetUrl). */
  html?: string;
  /** For tts/image: content-addressed R2 asset. */
  assetHash?: string;
  assetUrl?: string;
  mime?: string;
  /** For the layout task: the validated widget nodes (flat WNode shape). */
  widgets?: unknown[];
  neurons: number;
  credits: number;
  cached: boolean;
  /** For tts/music: length of the generated audio. */
  durationMs?: number;
}

export interface GenerateError {
  ok: false;
  error: "unknown_model" | "insufficient_credits" | "storage_full" | "generation_failed";
  /** Underlying model/runtime error message, surfaced so failures are traceable. */
  detail?: string;
  available?: number;
  needed?: number;
  /** `storage_full`: the workspace's media ceiling, so the screen can say what
   *  to delete rather than "generation failed". Bytes, both. */
  usedBytes?: number;
  limitBytes?: number;
}

/** A catalog row's markup, with the platform's 3× standing in for a null.
 *  Never null in practice — every seed and every sync writes one — but the
 *  column is nullable and `creditsForNeurons(n, null)` is a free generation. */
const markupOf = (m: ModelRow): number => m.markup ?? DEFAULT_SEED_MARKUP;

const rateOf = (m: ModelRow): ModelRate => ({
  inputRate: m.input_rate ?? undefined,
  outputRate: m.output_rate ?? undefined,
  unitRate: m.unit_rate ?? undefined,
  unitKind: (m.unit_kind as ModelRate["unitKind"]) ?? undefined,
  markup: markupOf(m),
});

/**
 * THE SYSTEM PROMPT AND THE RESERVE IT IMPLIES — one call, so they cannot
 * disagree.
 *
 * ⚠️ **This shape is the fix, and a test would not have been.** The defect was
 * never that the estimate was wrong on its own terms; it was that the estimate
 * and the run were computed in two places from two sets of constants. Unit tests
 * on each half pass while the join is broken — which was demonstrated: a
 * mutation replacing the system prompt with `""` in `generate` passed every
 * assertion about `outputCap` and about `estimateUsage`, because both were
 * called directly with a system prompt the test supplied itself.
 *
 * So the caller does not get to pass a system prompt to the estimator. It asks
 * for a PLAN, uses `system` for the run and `usage` for the reserve, and the two
 * are by construction about the same text.
 */
export function planRun(req: GenerateRequest, provider: string, brief: string, perSongMusic = false): { system: string; usage: Usage } {
  const tokenLane = req.task === "text" || req.task === "layout";
  const system = tokenLane ? systemPrompt(req, brief) : "";
  return { system, usage: estimateUsage(req.task, system, req.prompt, req.options, provider, perSongMusic) };
}

/**
 * THE OUTPUT CAP, IN ONE PLACE — because the reserve and the run were asking for
 * different numbers.
 *
 * ⚠️ This is the sharpest of the reserve defects and it is pure lost margin. The
 * run asked Gemini for `32768` output tokens on a slide (`8192` on a layout)
 * while the estimate reserved `8000` (`4000`) — a FOUR-FOLD under-reserve on the
 * most-used lane in the product. `settle` caps the charge at the reserve, so
 * every generation that used more than a quarter of its allowance was billed for
 * a quarter of it and the platform paid the rest.
 *
 * Nothing could have caught it: two constants in two functions two hundred lines
 * apart, both plausible, neither wrong on its own terms. One function is the
 * fix — a caller that changes the cap now changes what it reserves, necessarily.
 *
 * The caps differ by PROVIDER because the models do: a Gemini slide is one long
 * document and rambles happily to 32k, while an uncapped Workers AI model
 * stalls the request timeout long before that.
 */
export function outputCap(task: AiTask, provider: string, opt: GenerateRequest["options"]): number {
  if (opt?.maxTokens) return opt.maxTokens;
  const layout = task === "layout";
  return provider === "google" ? (layout ? 8192 : 32768) : (layout ? 4096 : 8000);
}

/**
 * Estimate the worst-case usage for the reserve, before we know real usage.
 *
 * ⚠️ **THE TOKEN LANES DELEGATE TO `@4dl/ai`, AND THE REASON IS MONEY.**
 *
 * `settle` caps the charge at the reserve, so every token the estimate fails to
 * count is a token the PLATFORM pays for and the workspace does not. This
 * function's own version under-counted in three compounding ways, all measured:
 *
 *   THE SYSTEM PROMPT WAS NOT COUNTED AT ALL. It padded a flat `+200` tokens
 *   for text and `+1500` for layout. The real prompts are 3,207 chars
 *   (`SLIDE_SYSTEM`) and 6,875 (`layoutSystem()`, which embeds 4,334 chars of
 *   `describeWidgets(WIDGET_REGISTRY)`) — about 1,283 and 2,750 tokens. So every
 *   slide generation under-reserved its system prompt by roughly 1,080 tokens,
 *   on every call, forever.
 *
 *   FOUR CHARS PER TOKEN. That is the ENGLISH AVERAGE, and an average is the
 *   wrong statistic for a bound. Arabic — which this product is sold into —
 *   tokenizes at roughly 2 chars/token, so a wholly-Arabic prompt reserved about
 *   half its real input. `@4dl/ai` uses 2.5, which covers Latin comfortably and
 *   Arabic with room. Over-reserving costs nothing but a slightly larger
 *   transient hold, released moments later.
 *
 *   NO THINKING BUDGET. Gemini 2.5+ thinks by default and bills
 *   `thoughtsTokenCount` at the OUTPUT rate, on top of the answer, from a budget
 *   the request does not cap. `maxTokens` bounds the answer and not the bill, so
 *   reserving only the cap under-reserves every thinking model.
 *
 * The unit-metered lanes below (tts by character, image by tile, music by
 * second) stay here: they are not token estimates at all, `@4dl/ai` has no
 * equivalent, and the shapes do not correspond.
 */
export function estimateUsage(task: AiTask, system: string, prompt: string, opt: GenerateRequest["options"], provider: string, perSongMusic = false): Usage {
  if (task === "text" || task === "layout") {
    /*
      The current canvas rides in the PROMPT for a layout run, so it is counted
      by the shared estimator along with everything else rather than by a second
      hand-rolled term.
    */
    const canvas = task === "layout" ? JSON.stringify(opt?.currentWidgets ?? []) : "";
    return sharedEstimate({
      system,
      prompt: prompt + canvas,
      maxOutputTokens: outputCap(task, provider, opt),
      provider,
    });
  }
  if (task === "tts") return { chars: Math.max(1, prompt.length) };
  // Lyria (Google) bills a flat price per song, so its reserve must cover a whole
  // clip regardless of requested length; Workers AI music is genuine per-second.
  if (task === "music") return { audioSec: perSongMusic ? LYRIA_CLIP_SEC : musicSeconds(opt) };
  const w = opt?.width ?? 1024;
  const h = opt?.height ?? 1024;
  const steps = opt?.steps ?? 4;
  // Tiles meter Workers AI (per 512×512×step); Gemini prices per whole image, so
  // carry `images:1` too — neuronsForUsage picks the field its unitKind matches.
  return { tiles: Math.ceil(w / 512) * Math.ceil(h / 512) * steps, images: 1 };
}

/** Clamp a music request to a sane length (default 15s, 5–30s). */
function musicSeconds(opt: GenerateRequest["options"]): number {
  return Math.min(30, Math.max(5, Math.round(opt?.durationSec ?? 15)));
}

/**
 * Google/Lyria prices music per *song* (a ≤30s clip = one flat charge), not per
 * second. We therefore meter every Gemini/Lyria clip as one whole clip so a
 * short bed can never cost us the full-song price while billing a fraction of
 * it. Workers AI music stays genuinely per-second (Cloudflare's real basis).
 *
 * ⚠️ IT IS `@4dl/ai`'s CONSTANT, not a local 30. The parser DIVIDES Google's
 * per-song price by it to store a per-second `unit_rate`, and this multiplies it
 * back — two halves of one figure, in two packages. A local copy that drifted
 * would not fail anywhere: it would just charge the wrong amount, quietly, for
 * every music generation.
 */
const LYRIA_CLIP_SEC = MUSIC_CLIP_SECONDS;

/** Hard ceiling for a single model call. Under the client's request timeout so a
 *  stalled model returns a clean error before the connection is reset. */
const RUN_TIMEOUT_MS = 180_000;

/** Reject with a timeout error if `p` doesn't settle within `ms`. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/** Bump when the system prompt, token limit, or output handling changes, so old
 * cached generations don't mask the improvement. */
const PROMPT_VERSION = "2";

async function promptHash(req: GenerateRequest): Promise<string> {
  const key = `v${PROMPT_VERSION}|${req.task}|${req.modelId}|${JSON.stringify(req.options ?? {})}|${req.prompt}`;
  return contentHash(new TextEncoder().encode(key).buffer as ArrayBuffer);
}

/**
 * Whether THIS run may use the deterministic mock generator.
 *
 * ⚠️ The environment is the OUTER condition, and that is the whole point.
 *
 * This used to be `mockMode(env)` — a bare read of `app_config["ai.mock"]` with
 * no environment check anywhere in the function or at either of its two call
 * sites. Three separate paths therefore fabricated output in PRODUCTION and
 * charged the workspace credits for it:
 *
 *   1. `ai.mock = "on"`. A platform admin could set it from the console, and the
 *      Admin screen offered it as an ordinary dropdown value. One click and
 *      every slide, poster, voice clip and music bed the product generated was
 *      a stub — billed at the real model's rate, cached under the real prompt
 *      hash, and filed in the Media Library as an ordinary asset.
 *   2. **No `AI` binding.** `!env.AI` mocked unconditionally. `AI` is optional in
 *      `env.ts`, so a deploy that dropped the binding did not fail — it started
 *      answering with stubs and invoicing for them.
 *   3. **A provider failure in `"auto"`.** The catch below swallowed a real
 *      Workers AI error and rendered a mock instead, which is exactly the case
 *      where an operator most needs to see the error.
 *
 * `shouldUseMockLane` (`@4dl/ai`) puts `ENVIRONMENT === "development"` outside
 * all three, so none of them can fire on a deployed worker. Inside development
 * the behaviour is unchanged: `"on"` forces the mock, `"auto"` falls back when
 * the real credential is missing, `"off"` surfaces the error.
 *
 * `canRunReal` is per-provider, not global: Gemini/Lyria run on the platform
 * Google key and have never been mockable, so an external model passes `true`
 * and stays on the real path even in dev.
 */
async function mayMock(env: Env, canRunReal: boolean): Promise<boolean> {
  return shouldUseMockLane({
    mockMode: await getConfigValue(env, "ai.mock"),
    canRunReal,
    isDevelopment: env.ENVIRONMENT === "development",
  });
}

/**
 * Generate content, metered against the tenant's credit balance. The single
 * source of the charge is the neurons the model reports (or the model's
 * published rate applied to real token/char/tile counts).
 */
export async function generate(env: Env, req: GenerateRequest): Promise<GenerateResult | GenerateError> {
  const tenantId = req.tenantId ?? DEMO_TENANT;
  const model = await getModel(env.DB, req.modelId);
  // The layout designer is a text-in/JSON-out task, so it runs on `text` models.
  const modelTask = req.task === "layout" ? "text" : req.task;
  /*
    ⚠️ `lanesFor`, NOT `model.task !== modelTask`.

    A catalog carrying both providers stores text-to-speech under TWO lane names:
    Cloudflare's pricing page yields `tts` (a per-character rate) and Google's
    yields `speech` (an id containing "tts"). So an exact comparison refused
    every Gemini voice for a `tts` request with `unknown_model` — a 400 that
    reads as "you sent a bad model id" about a model the operator console lists,
    has enabled, and may have set as the lane default.
  */
  const lanes = lanesFor(modelTask);
  if (!model || model.enabled !== 1 || !lanes.includes(model.task)) return { ok: false, error: "unknown_model" };
  const rate = rateOf(model);

  // Image prompts: enrich for creativity/quality + fold in the brand palette,
  // *before* hashing so both are part of the cache key (a rebrand → fresh render).
  if (req.task === "image") {
    req.prompt = enhanceImagePrompt(req.prompt, brandImageHint(await getBranding(env.DB, tenantId)));
  }

  // Cache hit → free (already paid once). Serve without touching the balance.
  const hash = await promptHash(req);
  // `@4dl/ai`'s columns: `prompt_hash` / `feature` / `output_json` / `at`, plus
  // the two Scena's cache needs and the shared one gained as alters —
  // `asset_hash` (the generation IS an object in R2) and `neurons` (what the
  // original run cost, so a free re-serve can still report a cost basis).
  const cached = await env.DB.prepare("SELECT * FROM ai_cache WHERE prompt_hash = ?").bind(hash).first<{ output_json: string | null; asset_hash: string | null; neurons: number | null }>();
  if (cached) {
    return finalize(env, req, model, cached.output_json ?? "", cached.asset_hash, cached.neurons ?? 0, 0, true);
  }

  // Gemini/Lyria run on Scena's *platform* Google key (company-provided, no BYO).
  // They're metered exactly like Workers AI: Google's list price is expressed as
  // neuron-equivalents in the model rate, so the same neurons→credits×markup path
  // applies. The only difference is they run against Google, never the mock.
  const gemini = model.provider === "google";

  /*
    ⚠️ THE SYSTEM PROMPT IS BUILT **BEFORE** THE RESERVE, and the order is the
    fix rather than a tidy-up.

    It used to be built after — between the reserve and the run — so the
    estimate could not see it and padded a flat constant instead. The prompts
    are 3,207 chars for a slide and 6,875 for a layout; the pads were 200 and
    1,500 tokens. `settle` caps the charge at the reserve, so the difference was
    margin the platform ate on every single generation.

    The brand brief is part of the system prompt and therefore part of the same
    read, which is why `getBranding` moved up with it.
  */
  const brief = req.task === "text" || req.task === "layout" ? brandBrief(await getBranding(env.DB, tenantId)) : "";
  const { system, usage: worstCase } = planRun(req, model.provider, brief, gemini);

  // Reserve a worst-case estimate so a concurrent burst can't overspend.
  const estimate = creditsForNeurons(neuronsForUsage(worstCase, rate), markupOf(model));
  const billing = env.BILLING.get(env.BILLING.idFromName(tenantId));
  await billing.bind(tenantId);
  const held = await billing.reserve(estimate);
  if (!held.ok) return { ok: false, error: "insufficient_credits", available: held.available, needed: held.needed };

  // Run the model (or mock) and read the *actual* usage. In development, a real
  // call that fails (e.g. no Cloudflare account) falls back to the mock so the
  // meter is still exercised. On a DEPLOYED worker `mock` is false in every
  // mode, so a failure is reported as a failure — see `mayMock`.
  //
  // External providers (Gemini / Lyria) run on the platform Google key
  // regardless of the Workers AI binding, and are never mocked: `canRunReal`
  // is true for them, so "auto" has nothing to fall back from.
  const external = gemini;
  const mock = await mayMock(env, external || Boolean(env.AI));
  let out: RunResult;
  try {
    if (!external && mock) out = await runMock(env, req, model);
    else {
      try {
        // Bound every real model call: a hung/slow model (some reasoning models
        // stall) must fail cleanly with an error the client can show, not hang
        // until the connection drops (which the browser reports as "failed to
        // fetch"). Kept under the client's request timeout so we answer first.
        const run = gemini ? runGemini(env, req, model, system) : runReal(env, req, model, system, worstCase);
        out = await withTimeout(run, RUN_TIMEOUT_MS, `model ${model.id}`);
      } catch (err) {
        console.error(`ai.run failed (model=${model.id}): ${err instanceof Error ? err.message : String(err)}`);
        // A timeout is a genuine failure — surface it rather than masking it with
        // a mock render. Also never silently mock an external provider, and never
        // mock at all outside development (`mock` is false there by construction).
        const timedOut = err instanceof Error && err.message.includes("timed out");
        // A full bucket is not a model failure, and re-running the prompt on the
        // mock would only produce a second asset with nowhere to go.
        if (!mock || external || timedOut || err instanceof StorageQuotaError) throw err;
        out = await runMock(env, req, model);
      }
    }
  } catch (err) {
    // Either way the hold is released FIRST: whatever went wrong, the workspace
    // did not receive the generation and must not be charged for it.
    await billing.release(held.hold);
    if (err instanceof StorageQuotaError) {
      // The model ran and the bytes had nowhere to go. Reported distinctly so
      // the screen can say "you are out of media storage" — a thing the operator
      // can act on — rather than "generation failed", which reads as our fault
      // and invites a retry that will fail identically.
      return { ok: false, error: "storage_full", usedBytes: err.usedBytes, limitBytes: err.limitBytes, detail: "media storage is full" };
    }
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`ai.generate failed (task=${req.task} model=${model.id}): ${detail}`);
    return { ok: false, error: "generation_failed", detail };
  }

  // Settle the exact charge from real usage — Google list-price neurons for
  // Gemini, Cloudflare neurons for Workers AI — both under the model's markup.
  const neurons = neuronsForUsage(out.usage, rate);
  const credits = creditsForNeurons(neurons, markupOf(model));
  await billing.settle(held.hold, credits, `ai.${req.task}`, model.id);

  // Cache + audit.
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO ai_cache (prompt_hash, feature, output_json, asset_hash, neurons, at) VALUES (?, ?, ?, ?, ?, ?)").bind(hash, req.task, out.output ?? "", out.assetHash ?? null, neurons, Date.now()),
    /*
      THE AUDIT ROW NO LONGER KEEPS THE PROMPT.

      Scena's own `ai_generations` had `prompt TEXT` and `output_ref TEXT`, and
      wrote 500 characters of every prompt into both a tenant-scoped table and,
      on this same path, a cache row. Nothing ever read either column — no route,
      no screen, no report — so what they amounted to was a permanent record of
      what every workspace typed, retained for the life of the tenant, in service
      of nothing. `@4dl/ai`'s row is who / which feature / which model / what it
      cost, which is what makes a bill explainable, and that is the whole job.

      `ok` is 1 because a failure returns before reaching here: the hold is
      released and no row is written at all.
    */
    env.DB.prepare("INSERT INTO ai_generations (id, tenant_id, actor_user_id, subject_id, feature, model, neurons, credits, ok, error, at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 1, NULL, ?)").bind(`gen_${rndHex(10)}`, tenantId, req.actorUserId ?? null, req.task, model.id, neurons, credits, Date.now()),
  ]);

  return finalize(env, req, model, out.output ?? "", out.assetHash ?? null, neurons, credits, false, out.mime, out.durationMs);
}

async function finalize(
  env: Env,
  req: GenerateRequest,
  model: ModelRow,
  output: string,
  assetHash: string | null,
  neurons: number,
  credits: number,
  cached: boolean,
  mime?: string,
  durationMs?: number,
): Promise<GenerateResult> {
  const base: GenerateResult = { ok: true, task: req.task, model: model.id, neurons, credits, cached };
  if (req.task === "text") {
    // Generated HTML is a first-class library asset too: register it as an `html`
    // media row (deduped by content hash, so cache hits/re-renders are idempotent).
    if (output) {
      const htmlHash = await contentHash(new TextEncoder().encode(output).buffer as ArrayBuffer);
      await createMedia(env.DB, req.tenantId ?? DEMO_TENANT, {
        kind: "html", name: mediaName(req), htmlBody: output, assetHash: htmlHash, source: "ai",
      }).catch(() => undefined);
    }
    return { ...base, html: output };
  }
  if (req.task === "layout") return { ...base, widgets: parseLayout(output, req) };
  const url = assetHash ? `/api/assets/${assetHash}` : undefined;
  const resolvedMime = mime ?? (req.task === "image" ? "image/svg+xml" : "audio/wav");
  // Every generated asset (voice, music, image) lands in the tenant's Media
  // Library so it's browsable + reusable. createMedia dedups by asset hash, so
  // this is idempotent with any dashboard-side registerMedia and across cache
  // hits. Best-effort — a library hiccup must never fail the generation.
  if (assetHash) {
    await createMedia(env.DB, req.tenantId ?? DEMO_TENANT, {
      kind: req.task === "image" ? "image" : "audio",
      name: mediaName(req),
      assetHash,
      assetUrl: url,
      mime: resolvedMime,
      durationMs,
      source: "ai",
    }).catch(() => undefined);
  }
  return { ...base, assetHash: assetHash ?? undefined, assetUrl: url, mime: resolvedMime, durationMs };
}

/** A friendly Media-Library name for a generated asset: the caller's hint, else
 *  a cleaned prompt (SSML/markup stripped), else a per-task default. */
function mediaName(req: GenerateRequest): string {
  const hint = req.options?.libraryName?.trim();
  const fromPrompt = req.prompt.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const label = req.task === "image" ? "AI image" : req.task === "music" ? "Music bed" : req.task === "text" ? "AI slide" : "Voice clip";
  return (hint || fromPrompt || label).slice(0, 80);
}

/* ------------------------------ real models ------------------------------ */

/** Loose view of the Workers AI binding — the model id is a dynamic string, not a
 *  statically-known model key, so we call through a widened signature. */
type LooseAi = { run(model: string, inputs: Record<string, unknown>): Promise<unknown> };

interface RunResult {
  output: string;
  assetHash?: string;
  assetUrl?: string;
  mime?: string;
  usage: Usage;
  durationMs?: number;
}

/** Drain a Workers AI text stream (SSE): accumulate the generated text and the
 *  final usage. Handles both the native `{response}` shape and the OpenAI-style
 *  `{choices:[{delta:{content}}]}` deltas newer models emit. Ignores keep-alives
 *  and the `[DONE]` sentinel. */
async function consumeAiStream(stream: ReadableStream): Promise<{ text: string; usage?: { prompt_tokens?: number; completion_tokens?: number } }> {
  const reader = (stream as ReadableStream<Uint8Array>).getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const j = JSON.parse(data) as { response?: string; choices?: Array<{ delta?: { content?: string | null } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
        if (typeof j.response === "string") text += j.response;
        const delta = j.choices?.[0]?.delta?.content;
        if (typeof delta === "string") text += delta;
        if (j.usage) usage = j.usage;
      } catch { /* partial/keep-alive chunk — ignore */ }
    }
  }
  return { text, usage };
}

/** Company-provided Google Gemini / Lyria. Runs on Scena's platform key and
 *  returns the real usage Google reports (tokens / images / chars / seconds) so
 *  billing meters it at Google's list price in neuron-equivalents, like any model. */
async function runGemini(env: Env, req: GenerateRequest, model: ModelRow, system: string): Promise<RunResult> {
  const tenantId = req.tenantId ?? DEMO_TENANT;
  if (req.task === "text" || req.task === "layout") {
    const layout = req.task === "layout";
    const r = await geminiGenerateText(env, tenantId, model.id, system, layout ? layoutUserPrompt(req) : req.prompt, {
      // A full animated slide can be long; with thinking disabled the whole
      // budget goes to the HTML, so give it real room (was 8192 → truncation).
      maxTokens: outputCap(req.task, model.provider, req.options),
      temperature: req.options?.temperature ?? (layout ? 0.6 : 0.8),
    });
    if (layout) {
      if (!r.text.trim()) throw new Error("empty response (model returned no layout)");
      return { output: r.text, usage: { inputTokens: r.inputTokens, outputTokens: r.outputTokens } };
    }
    const html = sanitizeHtml(r.text);
    if (!html) throw new Error("empty response (model returned no HTML)");
    return { output: html, usage: { inputTokens: r.inputTokens, outputTokens: r.outputTokens } };
  }
  if (req.task === "tts") {
    // The prompt already carries any style direction (composed by the caller);
    // options.voice is a Gemini prebuilt voice name. Google bills audio output
    // per token, but we meter per character — the rate's 3× markup covers the
    // per-token cost even for slow delivery (see billing-seed Gemini TTS note).
    const r = await geminiGenerateSpeech(env, tenantId, model.id, req.prompt, req.options?.voice ?? "");
    const assetHash = await storeGenerated(env, req, r.bytes, r.mime);
    return { output: "", assetHash, mime: r.mime, usage: { chars: req.prompt.length } };
  }
  if (req.task === "image") {
    const r = await geminiGenerateImage(env, tenantId, model.id, req.prompt);
    const assetHash = await storeGenerated(env, req, r.bytes, r.mime);
    return { output: "", assetHash, mime: r.mime, usage: { images: 1 } };
  }
  if (req.task === "music") {
    const secs = musicSeconds(req.options);
    const r = await geminiGenerateMusic(env, tenantId, model.id, req.prompt, secs);
    const assetHash = await storeGenerated(env, req, r.bytes, r.mime);
    // Lyria bills a flat per-song price, so meter a whole clip (never per-second):
    // a 5s bed and a 30s bed both cost Google the same, so both charge the same.
    // durationMs still reports the real audio length for playback.
    return { output: "", assetHash, mime: r.mime, usage: { audioSec: LYRIA_CLIP_SEC }, durationMs: secs * 1000 };
  }
  throw new Error(`gemini task not supported: ${req.task}`);
}

async function runReal(env: Env, req: GenerateRequest, model: ModelRow, system: string, worstCase: Usage): Promise<RunResult> {
  const ai = env.AI! as unknown as LooseAi;
  if (req.task === "text" || req.task === "layout") {
    const layout = req.task === "layout";
    const userContent = layout ? layoutUserPrompt(req) : req.prompt;
    // Gemma models on Workers AI don't accept a `system` role — fold it into the
    // user turn. Other models use a proper system message.
    const noSystemRole = /gemma/i.test(model.id);
    const messages = noSystemRole
      ? [{ role: "user", content: `${system}\n\n----\n\nRequest:\n${userContent}` }]
      : [{ role: "system", content: system }, { role: "user", content: userContent }];
    // A full animated slide is large — cap generously so the document isn't
    // truncated mid-markup. `max_tokens` is deprecated in Workers AI's
    // OpenAI-compatible schema in favour of `max_completion_tokens`; send both so
    // every model in the catalog actually honours the ceiling (an uncapped big
    // model rambles for minutes and trips the request timeout).
    const budget = outputCap(req.task, model.provider, req.options);
    // Stream the response: Cloudflare recommends streaming for long generations —
    // it keeps the connection alive (tokens flow as SSE) instead of buffering a
    // large response, which is what stalled big models into a dropped request.
    const res = (await ai.run(model.id, {
      messages,
      max_tokens: budget,
      max_completion_tokens: budget,
      temperature: req.options?.temperature ?? (layout ? 0.6 : 0.8),
      stream: true,
    })) as ReadableStream | {
      response?: string;
      // Newer models (Gemma 4, GPT-OSS, GLM, Kimi…) return the OpenAI shape.
      choices?: Array<{ message?: { content?: string | null; reasoning?: string | null } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    let raw: string;
    let reasoned = false;
    let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
    if (res instanceof ReadableStream) {
      const s = await consumeAiStream(res);
      raw = s.text;
      usage = s.usage;
    } else {
      raw = res.response ?? res.choices?.[0]?.message?.content ?? "";
      reasoned = Boolean(res.choices?.[0]?.message?.reasoning);
      usage = res.usage;
    }
    /*
      ⚠️ A MISSING USAGE REPORT FALLS BACK TO THE RESERVE, NOT TO A CHARACTER
      COUNT — and the direction matters.

      Streaming responses do not always report usage, and this used to guess
      `chars / 4` in both directions. `settle` caps the charge at the reserve, so
      a guess can only ever cost the platform: it cannot over-charge (the cap
      catches it) and it under-charges systematically — badly on a reasoning
      model, whose hidden thinking tokens have no relationship at all to the
      visible answer's length, and on any non-Latin script, where 4 chars/token
      is roughly double the real ratio.

      The reserve is the worst case the workspace already had held, so charging
      it can never exceed what they agreed to. Same estimator, same arguments,
      same number — which is the property that makes this safe rather than
      merely larger.
    */
    if (!usage || (usage.prompt_tokens == null && usage.completion_tokens == null)) {
      usage = { prompt_tokens: worstCase.inputTokens, completion_tokens: worstCase.outputTokens };
    }

    if (layout) {
      if (!raw.trim()) throw new Error("empty response (model returned no layout)");
      return { output: raw, usage: { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens } };
    }
    const html = sanitizeHtml(raw || "");
    if (!html) {
      // A reasoning model may have burned the whole budget before writing markup.
      const why = reasoned ? "model spent its budget reasoning without emitting HTML" : "model returned no content";
      throw new Error(`empty response (${why})`);
    }
    return { output: html, usage: { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens } };
  }
  if (req.task === "tts") {
    const res = (await ai.run(model.id, { text: req.prompt, speaker: req.options?.voice })) as ReadableStream | ArrayBuffer | { audio?: string };
    const bytes = await toBytes(res);
    const assetHash = await storeGenerated(env, req, bytes, "audio/mpeg");
    return { output: "", assetHash, mime: "audio/mpeg", usage: { chars: req.prompt.length } };
  }
  if (req.task === "music") {
    const secs = musicSeconds(req.options);
    const res = (await ai.run(model.id, { prompt: req.prompt, duration: secs })) as ReadableStream | ArrayBuffer | { audio?: string };
    const bytes = await toBytes(res);
    const assetHash = await storeGenerated(env, req, bytes, "audio/mpeg");
    return { output: "", assetHash, mime: "audio/mpeg", usage: { audioSec: secs }, durationMs: secs * 1000 };
  }
  // image
  const w = req.options?.width ?? 1024;
  const h = req.options?.height ?? 1024;
  const res = (await ai.run(model.id, { prompt: req.prompt, width: w, height: h, num_steps: req.options?.steps ?? 4 })) as { image?: string } | ReadableStream | ArrayBuffer;
  const bytes = typeof res === "object" && res !== null && "image" in res && res.image ? b64ToBytes(res.image) : await toBytes(res);
  const assetHash = await storeGenerated(env, req, bytes, "image/png");
  const tiles = Math.ceil(w / 512) * Math.ceil(h / 512) * (req.options?.steps ?? 4);
  return { output: "", assetHash, mime: "image/png", usage: { tiles } };
}

/* ------------------------------ mock models ------------------------------ */

async function runMock(env: Env, req: GenerateRequest, _model: ModelRow): Promise<RunResult> {
  if (req.task === "layout") {
    const json = mockLayoutJson(req);
    const inputTokens = Math.ceil(req.prompt.length / 4) + 400;
    const outputTokens = Math.ceil(json.length / 4);
    return { output: json, usage: { inputTokens, outputTokens } };
  }
  if (req.task === "text") {
    const html = mockSlideHtml(req.prompt);
    const inputTokens = Math.ceil(req.prompt.length / 4) + 200;
    const outputTokens = Math.ceil(html.length / 4);
    return { output: html, usage: { inputTokens, outputTokens } };
  }
  if (req.task === "tts") {
    const secs = Math.min(6, Math.max(1, req.prompt.length / 40));
    const bytes = mockWav(secs);
    const assetHash = await storeGenerated(env, req, bytes, "audio/wav");
    return { output: "", assetHash, mime: "audio/wav", usage: { chars: req.prompt.length }, durationMs: Math.round(secs * 1000) };
  }
  if (req.task === "music") {
    const secs = musicSeconds(req.options);
    const bytes = mockMusicWav(secs);
    const assetHash = await storeGenerated(env, req, bytes, "audio/wav");
    return { output: "", assetHash, mime: "audio/wav", usage: { audioSec: secs }, durationMs: secs * 1000 };
  }
  const svg = mockPosterSvg(req.prompt);
  const assetHash = await storeGenerated(env, req, new TextEncoder().encode(svg).buffer as ArrayBuffer, "image/svg+xml");
  const w = req.options?.width ?? 1024;
  const h = req.options?.height ?? 1024;
  return { output: "", assetHash, mime: "image/svg+xml", usage: { tiles: Math.ceil(w / 512) * Math.ceil(h / 512) * (req.options?.steps ?? 4) } };
}

/* ------------------------------- helpers --------------------------------- */

const SLIDE_SYSTEM = [
  "You are an elite art director and creative front-end engineer. You craft ONE stunning full-screen slide for a 1920×1080 digital-signage display, seen from across a room. It renders in a locked-down sandboxed iframe, so you have full creative freedom.",
  "",
  "OUTPUT CONTRACT — obey exactly:",
  "- Output ONE complete, self-contained HTML document (you MAY use <!doctype html>, <html>, <head>, <style>, <body>, and <script>). No markdown fences, no commentary — only the HTML.",
  "- Use anything that ships in the browser: CSS (gradients, filters, blend modes, masks, grid, transforms), CSS @keyframes animation, inline SVG (incl. SVG animation), <canvas>, and JavaScript for motion, counters, typing effects, particle/gradient backdrops, staggered reveals.",
  "- The page MUST fill the frame and never scroll: html,body{margin:0;width:100%;height:100%;overflow:hidden} and box-sizing:border-box everywhere.",
  "- Design at exactly 1920×1080. Size type with vw/vh or clamp() so it scales. Eyebrow/labels ~1.4vw, body ≥2.2vw, headlines 5–10vw. Legible from 3+ metres.",
  "- SELF-CONTAINED for offline screens: NO external resources — no CDNs, and NO @import or <link> for fonts. These font families are ALREADY loaded for you, so just reference them in font-family (never import them): " + FONT_LIST + ". Fall back to system-ui. The ONLY remote resource you may use is a brand logo, and ONLY via an exact logo URL provided in the brand brief below (as an <img src=\"…\">); never invent an image URL.",
  "- COMPLETE the whole document. Never stop midway — close every tag, brace and quote. Keep it self-contained and finished so it renders fully.",
  "",
  "DESIGN LIKE A PREMIUM BRAND, not a template. Make it genuinely beautiful and alive:",
  "- One clear focal point, strong visual hierarchy, generous whitespace, deliberate alignment on an implied grid. Fill the canvas intentionally — no dead space, no cramped corners.",
  "- Rich, tasteful color: multi-stop gradients, animated gradient meshes, layered translucency, soft depth (blurred shadows, glows). Avoid flat single-color backgrounds and default browser blue.",
  "- Motion with restraint: a tasteful entrance animation, a slow ambient background (drifting gradient, floating blurred orbs, subtle particles), maybe a counting stat or shimmer. Smooth and premium, never gaudy or seizure-inducing. Keep it performant (transform/opacity).",
  "- Modern polish: large rounded corners, glassmorphism/soft cards where fitting, a consistent spacing scale, accent lines/dividers, tabular numerals for stats.",
  "- Typographic craft: mix weights (300/600/800/900), letter-spacing on uppercase eyebrows, controlled line-height, a sensible max text width. Pair a display font with a clean text font.",
  "- Inline SVG encouraged for icon marks, illustrations, charts, dividers and shapes.",
  "",
  "Choose a layout that fits the content — hero, split, stat grid, timeline, quote, feature cards, big-number — and compose with flexbox/grid. For non-Latin copy (Arabic, Chinese, etc.) use an appropriate bundled font and set dir=\"rtl\" when the language is right-to-left. Aim for something you'd proudly ship to a high-end client: cohesive, confident, pixel-considered, and delightfully animated. When a brand kit is provided, honour its colors, radius and fonts precisely.",
].join("\n");

/* ------------------------------ layout designer -------------------------- */

/** Build the system prompt for a text/layout run: the layout-designer contract
 *  for layouts, a box-fitting component brief for HTML *widgets*, else the
 *  full-screen SLIDE_SYSTEM — each with the brand brief folded in. */
function systemPrompt(req: GenerateRequest, brief: string): string {
  const base = req.task === "layout" ? layoutSystem()
    : req.options?.surface === "widget" ? widgetSystem(req)
    : SLIDE_SYSTEM;
  return brief ? `${base}\n\n${brief}` : base;
}

/** The HTML-widget contract: a self-contained component that fills its OWN box on
 *  the canvas (any size/aspect) — not a full-screen 1920×1080 poster. Sizing is
 *  relative to the box, since the widget renders in an iframe that is exactly its
 *  own dimensions. */
function widgetSystem(req: GenerateRequest): string {
  const w = Math.max(1, Math.round(req.options?.width ?? 640));
  const h = Math.max(1, Math.round(req.options?.height ?? 360));
  return [
    "You are an elite front-end designer crafting ONE self-contained HTML WIDGET — a single compact on-screen component (a card, stat, callout, message, list, badge, mini-panel), NOT a full-screen slide or poster. It renders in a locked-down sandboxed iframe that is EXACTLY the size of the widget's box on the canvas.",
    "",
    `THE BOX: your component fills a box that is about ${w}×${h} CSS pixels (aspect ${ (w / h).toFixed(2) }:1). Design for THIS shape — it may be wide, tall, or square, and small. Do not assume 1920×1080.`,
    "",
    "OUTPUT CONTRACT — obey exactly:",
    "- Output ONE complete, self-contained HTML document (you MAY use <!doctype html>, <html>, <head>, <style>, <body>, <script>). No markdown fences, no commentary — only the HTML.",
    "- FILL THE BOX and never scroll: html,body{margin:0;width:100%;height:100%;overflow:hidden} and box-sizing:border-box everywhere. The root element should be 100% width and height of the frame.",
    "- Size EVERYTHING relative to the box so it scales with the widget: use %, vw/vh/vmin/vmax (the viewport IS the box) or clamp(). Never hardcode 1920/1080 or fixed pixel layouts that assume a full screen. Keep type readable at the box's real size — a small widget needs proportionally larger, simpler content (one number, one line), a large one can hold more.",
    "- SELF-CONTAINED for offline screens: NO external resources — no CDNs, no @import/<link> for fonts. These font families are ALREADY loaded, reference them directly (never import): " + FONT_LIST + ". Fall back to system-ui. The only remote resource allowed is a brand logo via an exact URL from the brand brief below.",
    "- COMPLETE the whole document — close every tag, brace and quote.",
    "",
    "DESIGN: make it a polished, single-purpose component that reads instantly from across a room. One clear focal element; strong contrast; generous internal padding scaled to the box; tasteful use of the brand tokens (var(--w-accent), var(--w-fg), var(--w-surface)) and radius. A transparent or brand-glass background so it sits cleanly over the scene behind it (avoid an opaque full-bleed background unless the brief asks for one). Subtle, performant motion (transform/opacity) is welcome but restrained — it's one tile among several, not a hero slide.",
  ].join("\n");
}

/** The layout designer's system contract: the full widget catalogue + the JSON
 *  shape it must answer with. Rebuilt per call so a new widget/variant flows in
 *  automatically via describeWidgets(). */
function layoutSystem(): string {
  return [
    "You are a senior digital-signage layout designer. You compose a full-screen 1920×1080 (16:9) canvas out of WIDGETS — positioned tiles, each a real component. You DO NOT write HTML or CSS documents; you output a JSON array of widget nodes that the app renders natively.",
    "",
    "OUTPUT CONTRACT — obey exactly:",
    '- Output ONLY a JSON array (starting with `[`), no prose, no markdown fences. Each element is a widget node: {"type": string, "x": number, "y": number, "w": number, "h": number, "style": object, "config": object}. x/y/w/h are pixels on the 1920×1080 canvas (origin top-left).',
    "- Use ONLY the widget types listed in the catalogue below. Never invent a type. Give every node an explicit x,y,w,h that sits fully within the canvas.",
    "- `config` carries the widget's content/variant; `style` carries its look. Both are described per-widget below. Omit keys you don't set (the app fills sensible defaults).",
    "- Widgets that need a bound source (ticker, weather, queue_caller, room_board, room_status, scoreboard) may only be added when an existing one is already on the canvas or the brief clearly asks for it — otherwise prefer content widgets (text, metric, menu, clock, date, countdown, qr, image, box, line).",
    "",
    "DESIGN PRINCIPLES:",
    "- Compose like a premium brand: one clear focal hierarchy, generous margins (keep ~60px safe padding from every edge), deliberate alignment on an implied grid, balanced negative space. No overlaps unless a widget is an intentional background (box/image behind content).",
    "- Layer backgrounds first (a full-bleed box or image at low z), then content on top. Use z to order (background ~0, content ~10, foreground ~20).",
    "- Lean on the brand tokens so the result follows the tenant automatically: var(--w-accent) for emphasis, var(--w-fg) for text, var(--w-surface) for glass panels. Set a widget's bg to 'transparent' when it should float directly on the background.",
    "- Pick variants that fit the content and vary them for rhythm. Prefer a small number of confident, well-sized widgets over many cramped ones.",
    "",
    "AVAILABLE WIDGETS:",
    describeWidgets(),
    "",
    SHARED_STYLE_NOTES,
  ].join("\n");
}

/** The user turn for a layout run: the canvas size, current widgets (for
 *  improve/extend), and the designer's ask. */
function layoutUserPrompt(req: GenerateRequest): string {
  const w = req.options?.designW ?? 1920;
  const h = req.options?.designH ?? 1080;
  const current = Array.isArray(req.options?.currentWidgets) ? req.options!.currentWidgets! : [];
  const canvas = current.length
    ? `The canvas is ${w}×${h}. It currently holds these widgets (JSON):\n${JSON.stringify(current)}\n\nImprove/extend this layout per the request. Return the COMPLETE new set of nodes (keep the good ones, adjust or add as needed).`
    : `The canvas is ${w}×${h} and currently EMPTY. Design a complete layout from scratch per the request.`;
  return `${canvas}\n\nRequest: ${req.prompt}`;
}

/** Known widget types, for validating model output. */
const WIDGET_TYPES = new Set(WIDGET_REGISTRY.map((w) => w.type as string));

/** Parse + validate a layout model's JSON into safe widget nodes. Tolerant of
 *  fenced/wrapped output; drops any node with an unknown type or non-finite
 *  geometry so a malformed element can't corrupt the canvas. Throws only when
 *  nothing usable survives. */
export function parseLayout(output: string, req: GenerateRequest): unknown[] {
  const w = req.options?.designW ?? 1920;
  const h = req.options?.designH ?? 1080;
  const arr = extractJsonArray(output);
  if (!arr) throw new Error("layout model did not return a JSON array");
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const clean: unknown[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const n = raw as Record<string, unknown>;
    const type = typeof n.type === "string" ? n.type : "";
    if (!WIDGET_TYPES.has(type)) continue;
    const nw = Math.min(Math.max(num(n.w, 400), 16), w);
    const nh = Math.min(Math.max(num(n.h, 200), 16), h);
    const x = Math.min(Math.max(num(n.x, 0), 0), Math.max(0, w - nw));
    const y = Math.min(Math.max(num(n.y, 0), 0), Math.max(0, h - nh));
    clean.push({
      type,
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(nw),
      h: Math.round(nh),
      rot: num(n.rot, 0),
      z: num(n.z, 10),
      style: n.style && typeof n.style === "object" ? n.style : {},
      config: n.config && typeof n.config === "object" ? n.config : {},
    });
  }
  if (!clean.length) throw new Error("layout model returned no valid widgets");
  return clean;
}

/** Pull the first top-level JSON array out of model output (strips fences/prose). */
function extractJsonArray(s: string): unknown[] | null {
  const cleaned = s.replace(/```json?/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** A deterministic mock layout (mock mode / local dev with no AI binding): a
 *  brand-glass panel with a headline + accent divider, so the reserve→settle
 *  and client-apply path is fully exercisable without live credentials. */
function mockLayoutJson(req: GenerateRequest): string {
  const safe = req.prompt.replace(/\s+/g, " ").trim().slice(0, 80) || "Your headline";
  const nodes = [
    { type: "box", x: 160, y: 200, w: 1600, h: 680, rot: 0, z: 0, style: { fill: "var(--w-surface)", radius: 32 }, config: {} },
    { type: "text", x: 240, y: 300, w: 1440, h: 240, rot: 0, z: 10, style: { color: "var(--w-fg)", fontSize: 96, fontWeight: 800, align: "left" }, config: { text: safe } },
    { type: "line", x: 240, y: 560, w: 360, h: 8, rot: 0, z: 10, style: { fill: "var(--w-accent)", thickness: 8, lineStyle: "solid" }, config: {} },
    { type: "text", x: 240, y: 620, w: 1440, h: 160, rot: 0, z: 10, style: { color: "var(--w-fg-muted)", fontSize: 40, align: "left" }, config: { text: "Generated by Scena AI", variant: "plain" } },
  ];
  return JSON.stringify(nodes);
}

/** Clean model output: drop any markdown code fences the model wraps around the
 * HTML. Scripts are intentionally kept — slides run in a locked-down sandboxed
 * iframe (allow-scripts only, opaque origin), so JS/animation is safe and gives
 * the design real creative freedom. */
function sanitizeHtml(html: string): string {
  let s = html
    // reasoning models (QwQ, DeepSeek-R1, …) emit a <think>…</think> preamble
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    // strip any markdown code fences the model wraps around the HTML
    .replace(/```html?/gi, "")
    .replace(/```/g, "")
    .trim();
  // Drop any leading prose ("Here's your slide:") before the first real tag.
  const lt = s.search(/<(!doctype|html|div|section|main|body|style|svg|header)/i);
  if (lt > 0) s = s.slice(lt);
  return s.trim();
}

/** Enrich a poster/image prompt for a bold, gallery-quality result on a big
 * screen — leaving the subject the user asked for fully intact. */
function enhanceImagePrompt(prompt: string, brandHint: string): string {
  return [
    prompt.trim(),
    "Ultra-high quality, striking and imaginative composition, cinematic lighting with depth and atmosphere, rich saturated color, crisp fine detail, masterful art direction — designed to look stunning displayed full-screen on a large signage display.",
    brandHint,
  ].filter(Boolean).join(" ");
}

function mockSlideHtml(prompt: string): string {
  const safe = prompt.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!).slice(0, 200);
  const hue = [...prompt].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;background:linear-gradient(135deg,hsl(${hue} 70% 22%),hsl(${(hue + 40) % 360} 70% 12%));color:#fff;font-family:'Hanken Grotesk',system-ui,sans-serif;text-align:center;padding:8%"><div style="font-size:1.4vw;letter-spacing:.3em;text-transform:uppercase;opacity:.7">Scena AI</div><div style="font-size:5vw;font-weight:800;line-height:1.05;max-width:80%">${safe}</div><div style="width:120px;height:6px;border-radius:3px;background:#fff;opacity:.8"></div></div>`;
}

function mockPosterSvg(prompt: string): string {
  const safe = prompt.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!).slice(0, 60);
  const hue = [...prompt].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 75% 45%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360} 75% 25%)"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#g)"/><text x="512" y="520" font-family="sans-serif" font-size="64" font-weight="800" fill="#fff" text-anchor="middle">${safe}</text><text x="512" y="590" font-family="sans-serif" font-size="28" fill="#fff" opacity="0.7" text-anchor="middle">generated by Scena AI</text></svg>`;
}

/** Minimal valid mono 8kHz WAV of `seconds` of soft tone — a stand-in TTS render. */
function mockWav(seconds: number): ArrayBuffer {
  const rate = 8000;
  const n = Math.floor(rate * seconds);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 12) * 2000 * (1 - i / n), true);
  return buf;
}

/** A mock music bed: a soft major-triad arpeggio WAV of `seconds` (stand-in
 *  for a real music-gen render). Enough to verify the metered generate flow. */
function mockMusicWav(seconds: number): ArrayBuffer {
  const rate = 8000;
  const n = Math.floor(rate * seconds);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, n * 2, true);
  const chord = [261.63, 329.63, 392.0]; // C-E-G
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const note = chord[Math.floor(t * 2) % chord.length]!;
    const env = 0.3 + 0.2 * Math.sin(t * 3); // gentle swell
    v.setInt16(44 + i * 2, Math.sin(2 * Math.PI * note * t) * 6000 * env, true);
  }
  return buf;
}

/**
 * Store a generated asset, content-addressed and ACCOUNTED.
 *
 * This was `env.MEDIA.put(hash, bytes)` — one of three bare bucket writes in the
 * app, none of which left a trace anywhere queryable. A workspace could generate
 * posters, voice clips and music beds until the R2 bill noticed, and nothing
 * could tell you afterwards whose bytes they were.
 *
 * The quota is ENFORCED here rather than pre-checked, because the enforcement
 * point and the failure point should be the same place. A `StorageQuotaError`
 * propagates out of `runReal`/`runGemini`/`runMock` into `generate()`'s catch,
 * which RELEASES the hold before answering — so a workspace that is out of room
 * is not charged for the generation it did not receive, and gets `storage_full`
 * rather than a generic failure it cannot act on.
 */
async function storeGenerated(env: Env, req: GenerateRequest, bytes: ArrayBuffer, mime: string): Promise<string> {
  return storeAsset(env, bytes, mime, { tenantId: req.tenantId ?? DEMO_TENANT, purpose: "ai" });
}

async function toBytes(res: ReadableStream | ArrayBuffer | { audio?: string } | { image?: string }): Promise<ArrayBuffer> {
  if (res instanceof ArrayBuffer) return res;
  if (res instanceof ReadableStream) return new Response(res).arrayBuffer();
  if (res && typeof res === "object" && "audio" in res && res.audio) return b64ToBytes(res.audio);
  if (res && typeof res === "object" && "image" in res && res.image) return b64ToBytes(res.image);
  return new ArrayBuffer(0);
}

function b64ToBytes(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function rndHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}
