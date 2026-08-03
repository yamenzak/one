/**
 * AI model pricing sync (SPEC §6) — parse the official Cloudflare Workers AI
 * and Google Gemini pricing docs (their .md versions) into a single catalog of
 * neuron-equivalent rates, so every model — whichever provider — bills through
 * the SAME credit math and stays profitable at the configured markup.
 *
 * Unified unit: NEURONS. Cloudflare already prices in neurons. Gemini prices in
 * USD, which we convert to neuron-equivalents via Cloudflare's neuron price
 * ($0.011 / 1000 neurons) — so a credit charge always equals markup × the real
 * provider cost, no matter the provider.
 *
 * ── What these parsers do and do NOT discover ────────────────────────────────
 * `parse*Catalog` returns two lists: the models it could price exactly, and the
 * ones it deliberately refused to price, each with a reason. Refusing loudly
 * matters more than coverage here: `ai_models` carries exactly ONE `unit_rate` /
 * `unit_kind` per row, so a model billed on two additive dimensions (Workers AI
 * images: per-tile PLUS per-step) cannot be represented without understating the
 * cost — and an understated rate makes the platform eat the overrun at settle
 * time (AGENTS §5). The `skipped` list is surfaced in the admin sync response so
 * an operator sees the gap instead of a silently short catalog.
 */

import { NEURON_COST_USD } from "@4dl/billing/model";

/**
 * A catalog lane. The first five are lanes the product can actually execute
 * (`ai.ts` generate / generateImage / generateSpeech); the rest are priced,
 * discovered, and inert — nothing in Kova runs an embedding, a transcription,
 * a Workers AI TTS voice or a classifier, so they land in the catalog disabled
 * rather than offered to a tenant as a pickable model that fails at call time.
 */
export type SeedTask = "text" | "text-small" | "vision" | "image" | "speech" | "embedding" | "transcribe" | "tts" | "classify";

/** Lanes `ai.ts` has a code path for. Everything else is catalog-only. */
const RUNNABLE_TASKS = new Set<SeedTask>(["text", "text-small", "vision", "image", "speech"]);
export const isRunnableTask = (t: SeedTask): boolean => RUNNABLE_TASKS.has(t);

export interface ModelSeed {
  id: string;
  label: string;
  provider: "workers-ai" | "google";
  task: SeedTask;
  inputRate: number | null; // neurons per 1M input tokens
  outputRate: number | null; // neurons per 1M output tokens
  unitRate: number | null; // neurons per unit (e.g. per generated image)
  unitKind: "image" | "chars_1k" | "audio_min" | null;
  /**
   * The day the provider says this model stops answering (`YYYY-MM-DD`), when
   * the page announces one that has not arrived yet. Null for a model with no
   * announced end — which is every Workers AI row, because Cloudflare's pricing
   * page carries no deprecation notices at all.
   *
   * A date already in the past is not represented here: such a model is not a
   * seed, it is `ParsedCatalog.retired`.
   */
  retiresAt?: string | null;
}

/** A row the parser saw on the page but refused to price, and why. */
export interface SkippedModel {
  id: string;
  reason: string;
}

export interface ParsedCatalog {
  models: ModelSeed[];
  skipped: SkippedModel[];
  /**
   * Ids the page still PRICES but the provider has already SHUT DOWN.
   *
   * A pricing page is a billing document, not an availability one. Google keeps
   * a retired model's rate tables in place under a deprecation banner —
   * `gemini-2.0-flash` and `gemini-2.0-flash-lite` are still fully priced months
   * after their 1 June 2026 shutdown — so "present on the page" cannot mean
   * "callable", which is exactly what the sync used to assume.
   *
   * The consequence was not cosmetic. Both arrive in runnable lanes, both are
   * the CHEAPEST rows in theirs, and the sync elects the cheapest enabled model
   * as a lane's default: a sync run today would have crowned two dead models the
   * text and text-small defaults and broken every text feature in the product.
   *
   * These are reported separately from `skipped` because they need an ACTION —
   * a row already in the catalog has to be switched off — where a skipped row
   * only ever needed an explanation.
   */
  retired: SkippedModel[];
}

/** USD → neuron-equivalents (so Gemini meters identically to Workers AI). */
export const usdPerMToNeurons = (usdPerM: number): number => Math.round(usdPerM / 1_000_000 / NEURON_COST_USD * 1_000_000);
export const usdToNeurons = (usd: number): number => Math.round(usd / NEURON_COST_USD);

const prettyId = (id: string): string =>
  id.split("/").pop()!.replace(/[-_]/g, " ").replace(/\bfp8\b|\bawq\b|\bit\b|\binstruct\b/gi, "").replace(/\s+/g, " ").trim().replace(/\b\w/g, (m) => m.toUpperCase());

/** `1,363.64` → 1363.64. Neuron figures on the CF page are comma-grouped. */
const num = (s: string): number => Number(s.replace(/,/g, ""));

/** Small/cheap text models get task "text-small" so there's always a cheap
 *  default; larger ones "text". Vision by name. */
/**
 * The lane a Workers AI text-generation model lands in.
 *
 * Deliberately never returns `vision`, even for an id that says so
 * (`@cf/meta/llama-3.2-11b-vision-instruct`, Moondream). `generate()` refuses to
 * attach an image to any non-Google provider by construction — the Workers AI
 * branch has no image path at all — so a Workers-AI row tagged `vision` is a
 * model a studio can SELECT for Snap-a-Meal and that then fails every call with
 * "model cannot read images". Worse, the sync's default-election picks the
 * cheapest enabled model per lane, so it could crown that row the vision
 * default and break the whole lane unprompted.
 *
 * These are perfectly good TEXT models, so they land in a text lane where they
 * work. If Workers AI vision is ever wired up, tag it here and in
 * `modelSupportsTask` together — the two must agree.
 */
function workersTask(id: string): SeedTask {
  if (/-(1b|2b|3b|micro)\b|flash|lite|mini|small|7b|8b/i.test(id)) return "text-small";
  return "text";
}

// ── Cloudflare Workers AI ────────────────────────────────────────────────────

/**
 * Parse the whole Workers AI pricing markdown — every table, not just the LLM
 * one. Each row is classified by the SHAPE of its neuron column, which is more
 * robust than the section heading (the heading is absent in some renderings):
 *
 *   in + out tokens        → a token-priced generation model (runnable lane)
 *   in tokens only         → embedding / reranker / classifier (catalog-only)
 *   per audio minute       → speech-to-text (catalog-only)
 *   per 1k characters      → text-to-speech (catalog-only)
 *   per tile / per MP / …  → REFUSED, see the module header
 */
export function parseWorkersAiCatalog(md: string): ParsedCatalog {
  const models: ModelSeed[] = [];
  const skipped: SkippedModel[] = [];
  const seen = new Set<string>();
  let heading = "";
  for (const line of md.split("\n")) {
    if (line.startsWith("#")) { heading = line.toLowerCase(); continue; }
    if (!line.startsWith("| @cf/")) continue;
    const cols = line.split("|").map((c) => c.trim());
    const id = cols[1];
    if (!id || seen.has(id)) continue;
    // "@cf/deepgram/nova-3 (WebSocket)" is a pricing variant, not a model id —
    // binding it would 400 at call time. Anything with whitespace is not an id.
    if (/\s/.test(id)) { seen.add(id); skipped.push({ id, reason: "the Model cell is a pricing variant, not a callable model id" }); continue; }
    const n = cols[3] ?? "";
    const N = "(\\d[\\d,]*(?:\\.\\d+)?)";
    const inp = new RegExp(`${N}\\s*neurons per M input tokens`, "i").exec(n);
    const outp = new RegExp(`${N}\\s*neurons per M output tokens`, "i").exec(n);
    const audioMin = new RegExp(`${N}\\s*neurons per audio minute`, "i").exec(n);
    const chars1k = new RegExp(`${N}\\s*neurons per 1k characters`, "i").exec(n);

    if (inp && outp) {
      const inputRate = num(inp[1]!);
      const outputRate = num(outp[1]!);
      if (!(inputRate > 0) || !(outputRate > 0)) { seen.add(id); skipped.push({ id, reason: "token rates parsed as zero" }); continue; }
      seen.add(id);
      models.push({ id, label: prettyId(id), provider: "workers-ai", task: workersTask(id), inputRate, outputRate, unitRate: null, unitKind: null });
      continue;
    }
    if (inp && !outp) {
      // Input-token-only: an embedding model, a reranker or a classifier. Exact
      // to price, but no Kova lane calls one, so it is catalog-only.
      const inputRate = num(inp[1]!);
      if (!(inputRate > 0)) { seen.add(id); skipped.push({ id, reason: "input rate parsed as zero" }); continue; }
      seen.add(id);
      const task: SeedTask = /embedding/.test(heading) || /embedding|bge-m3|bge-(small|base|large)/i.test(id) ? "embedding" : "classify";
      models.push({ id, label: prettyId(id), provider: "workers-ai", task, inputRate, outputRate: null, unitRate: null, unitKind: null });
      continue;
    }
    if (audioMin) {
      const unitRate = num(audioMin[1]!);
      if (!(unitRate > 0)) { seen.add(id); skipped.push({ id, reason: "audio-minute rate parsed as zero" }); continue; }
      seen.add(id);
      models.push({ id, label: prettyId(id), provider: "workers-ai", task: "transcribe", inputRate: null, outputRate: null, unitRate, unitKind: "audio_min" });
      continue;
    }
    if (chars1k) {
      const unitRate = num(chars1k[1]!);
      if (!(unitRate > 0)) { seen.add(id); skipped.push({ id, reason: "character rate parsed as zero" }); continue; }
      seen.add(id);
      models.push({ id, label: prettyId(id), provider: "workers-ai", task: "tts", inputRate: null, outputRate: null, unitRate, unitKind: "chars_1k" });
      continue;
    }
    seen.add(id);
    skipped.push({ id, reason: workersSkipReason(n) });
  }
  // Empty, and not an oversight: Cloudflare's pricing page carries no
  // deprecation notices at all — a model it drops simply vanishes, which the
  // sync's existing "gone from the page" reconcile already handles correctly.
  return { models, skipped, retired: [] };
}

function workersSkipReason(neuronCol: string): string {
  if (/per\s+(input\s+|output\s+)?\d+x\d+\s+tile/i.test(neuronCol)) {
    return "priced per 512x512 tile AND per step (two additive dimensions); ai_models holds one unit rate, so any single figure would undercharge";
  }
  if (/per\s+(first\s+|subsequent\s+|input\s+image\s+)?MP\b/i.test(neuronCol)) {
    return "priced per megapixel across first / subsequent / input tiers; ai_models holds one unit rate";
  }
  if (/per\s+M\s+images/i.test(neuronCol)) {
    return "priced per million images (image classification); no lane here runs it";
  }
  return `unrecognised neuron unit: ${neuronCol.slice(0, 120) || "(empty)"}`;
}

/**
 * The narrow, historical view: the Workers AI text-generation lane only
 * (text / text-small / vision). Kept as the parser's stable public contract —
 * `parseWorkersAiCatalog` is what the admin sync uses.
 */
export function parseWorkersAiPricing(md: string): ModelSeed[] {
  return parseWorkersAiCatalog(md).models.filter((m) => m.task === "text" || m.task === "text-small" || m.task === "vision");
}

// ── Google Gemini ────────────────────────────────────────────────────────────

const firstUsd = (s: string): number | null => { const m = /\$([0-9]+(?:\.[0-9]+)?)/.exec(s); return m ? Number(m[1]) : null; };

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/**
 * The shutdown date a model's block announces, as `YYYY-MM-DD`, or null.
 *
 * Google puts it in a blockquote above the rate tables, in one of two tenses:
 *
 *   > **Warning:** Gemini 2.0 Flash is deprecated and has been shut down June 1, 2026.
 *   > **Warning:** Imagen 4 models (…) are deprecated and will be shut down on August 17, 2026;
 *
 * Only the DATE is extracted, and the tense is deliberately ignored — "has been"
 * versus "will be" is the page's wording at the moment it was written, while the
 * date compared against today is a fact that stays true as the page goes stale.
 * A block that announces a deprecation with no parseable date returns null and
 * the model is left alone: refusing to price a model over a sentence we could
 * not read would be a doc-format change silently emptying the catalog, which is
 * the failure this file's other guards exist to prevent.
 */
function shutdownDate(block: string): string | null {
  const warn = /^>[^\n]*\bshut down\b[^\n]*$/im.exec(block)?.[0];
  if (!warn) return null;
  const m = /\bshut down(?:\s+on)?\s+([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/i.exec(warn);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]!.toLowerCase());
  if (month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
}

/** Which Kova lane a Gemini id belongs to, or a refusal reason. */
function geminiLane(id: string): { task: SeedTask } | { skip: string } {
  if (/^(imagen|veo|lyria)/i.test(id)) return { skip: "a different Google API surface (predict / long-running ops); the app's generateContent path cannot drive it" };
  if (/\blive\b|native-audio/i.test(id)) return { skip: "Live API (bidirectional audio streaming); no lane here speaks that protocol" };
  if (/tts/i.test(id)) return { task: "speech" };
  if (/embedding/i.test(id)) return { task: "embedding" };
  if (/image/i.test(id)) return { task: "image" };
  if (/lite/i.test(id)) return { task: "text-small" };
  return { task: "text" };
}

/**
 * Parse the Gemini pricing markdown. Each model block is a `## Heading` followed
 * by an italic line of one or more backticked ids, then a Standard table with
 * `Input price` / `Output price` rows in paid-tier USD per 1M tokens (image
 * models price output per image). The FIRST such table in a block is the
 * Standard tier — Batch / Flex / Priority tables that follow are ignored.
 */
export function parseGeminiCatalog(md: string, now: number = Date.now()): ParsedCatalog {
  const models: ModelSeed[] = [];
  const skipped: SkippedModel[] = [];
  const retired: SkippedModel[] = [];
  const seen = new Set<string>();
  // Compared as a date STRING, not a Date: both sides are `YYYY-MM-DD`, which
  // sorts lexicographically, and that sidesteps the timezone question entirely.
  // A model retiring "today" is treated as still alive — the provider's own
  // cutover happens at some hour we do not know, and switching a working model
  // off a few hours early is the worse error of the two.
  const today = new Date(now).toISOString().slice(0, 10);
  // A block header line is `*`id`*` or `*`id-a`, `id-b` and `id-c`*` — several
  // ids can share one pricing table (the Imagen and Veo families do).
  const lineRe = /^\*((?:`[a-z0-9.\-]+`(?:\s*(?:,|and)\s*)*)+)\*\s*$/gim;
  const marks: { ids: string[]; start: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(md))) {
    const ids = [...m[1]!.matchAll(/`([a-z0-9.\-]+)`/g)].map((x) => x[1]!);
    if (ids.length) marks.push({ ids, start: m.index });
  }
  for (let i = 0; i < marks.length; i++) {
    const { ids, start } = marks[i]!;
    const block = md.slice(start, marks[i + 1]?.start ?? md.length);
    // `Input price (text, image, video)` is as common as a bare `Input price` —
    // allowing the parenthetical is why gemini-2.5-flash-lite is discoverable.
    const inputLine = /\|\s*Input price[^\n|]*\|[^\n]*/i.exec(block)?.[0] ?? "";
    const outputLine = /\|\s*Output price[^\n|]*\|[^\n]*/i.exec(block)?.[0] ?? "";
    const inUsd = firstUsd(inputLine);
    const outUsd = firstUsd(outputLine);
    // One banner covers the whole block, so a family sharing a pricing table
    // (Imagen, Veo) retires together — which is how the page announces it.
    const ends = shutdownDate(block);
    const dead = ends !== null && ends < today;
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const lane = geminiLane(id);
      if ("skip" in lane) { skipped.push({ id, reason: lane.skip }); continue; }
      // Checked before pricing, not after: a shut-down model must not reach the
      // catalog whether or not its rates are still parseable, and they are —
      // that is the entire trap.
      if (dead) { retired.push({ id, reason: `Google shut this model down on ${ends}; it is still priced on the page but no longer answers` }); continue; }
      if (lane.task === "image") {
        // Output priced per whole image. A tiered "per 0.5K / 1K / 2K image"
        // block has no single per-image figure — refuse rather than guess.
        const perImage = /\$([0-9.]+)\s*per image/i.exec(outputLine)?.[1];
        if (!perImage) { skipped.push({ id, reason: "image output is priced per resolution tier (0.5K / 1K / 2K / 4K), not a single per-image rate" }); continue; }
        models.push({ id, label: prettyId(id), provider: "google", task: "image", inputRate: inUsd != null ? usdPerMToNeurons(inUsd) : null, outputRate: null, unitRate: usdToNeurons(Number(perImage)), unitKind: "image", retiresAt: ends });
        continue;
      }
      if (lane.task === "embedding") {
        if (inUsd == null) { skipped.push({ id, reason: "no paid-tier input price on the page" }); continue; }
        models.push({ id, label: prettyId(id), provider: "google", task: "embedding", inputRate: usdPerMToNeurons(inUsd), outputRate: null, unitRate: null, unitKind: null, retiresAt: ends });
        continue;
      }
      if (inUsd == null || outUsd == null) { skipped.push({ id, reason: "no paid-tier input/output price on the page" }); continue; }
      models.push({ id, label: prettyId(id), provider: "google", task: lane.task, inputRate: usdPerMToNeurons(inUsd), outputRate: usdPerMToNeurons(outUsd), unitRate: null, unitKind: null, retiresAt: ends });
    }
  }
  return { models, skipped, retired };
}

/**
 * The narrow, historical view: the Gemini text + image lanes only. Kept as the
 * parser's stable public contract — `parseGeminiCatalog` is what the admin sync
 * uses (and it also discovers the TTS model the body-scan voice cues run on).
 */
export function parseGeminiPricing(md: string): ModelSeed[] {
  return parseGeminiCatalog(md).models.filter((m) => m.task === "text" || m.task === "text-small" || m.task === "image");
}
