/**
 * Credit economics (SPEC §6 — transplanted verbatim from Scena) — pure, no I/O.
 *
 * The whole billing meter turns on two constants and one formula:
 *
 *   $1            = 1000 credits            → 1 credit = $0.001
 *   Workers AI    = $0.011 / 1000 neurons  → 1 neuron = $0.000011
 *
 *   credits_charged = ceil( neurons × 0.011 × markup )
 *
 * We meter on **neurons** (Cloudflare's model-agnostic GPU unit), so the gross
 * margin is identical for every model: a 10× pricier model burns 10× the
 * neurons and charges 10× the credits. `markup` (M) is the only lever — M=3 is
 * a 66.7% margin, M=4 is 75%. Keep this module pure; it runs in the DO, the
 * routes, and the tests byte-identically.
 */

/** $1 buys this many credits (the headline price). */
export const CREDITS_PER_DOLLAR = 1000;

/** Cloudflare list price: dollars per single neuron ($0.011 / 1000). */
export const NEURON_COST_USD = 0.011 / 1000;

/** Default safety-and-profit markup multiple if a model has none configured. */
export const DEFAULT_MARKUP = 3;

/**
 * Credits to charge for `neurons` of Workers AI compute at markup `m`.
 * `ceil` so a sub-credit call still costs at least 1 credit (never free).
 */
export function creditsForNeurons(neurons: number, markup = DEFAULT_MARKUP): number {
  // Guard non-finite too: a NaN/Infinity slipping in from provider usage must
  // not become 0 (undercharge) or Infinity credits.
  if (!Number.isFinite(neurons) || neurons <= 0) return 0;
  const m = markup > 0 ? markup : DEFAULT_MARKUP;
  return Math.max(1, Math.ceil(neurons * NEURON_COST_USD * m * CREDITS_PER_DOLLAR));
}

/** Neurons per credit at markup `m` (break-even is 90.9 neurons/credit). */
export function neuronsPerCredit(markup = DEFAULT_MARKUP): number {
  const m = markup > 0 ? markup : DEFAULT_MARKUP;
  return (CREDITS_PER_DOLLAR * NEURON_COST_USD * m) ** -1;
}

/** Gross margin fraction at markup `m` (M=3 → 0.667). */
export function marginAt(markup = DEFAULT_MARKUP): number {
  const m = markup > 0 ? markup : DEFAULT_MARKUP;
  return 1 - 1 / m;
}

/** How Cloudflare bills a given model, in neurons per unit of work. */
export interface ModelRate {
  /** Neurons per 1,000,000 input tokens (text models). */
  inputRate?: number;
  /** Neurons per 1,000,000 output tokens (text models). */
  outputRate?: number;
  /** Neurons per `unitKind` (TTS: per 1k chars; image: per tile; STT: per
   *  audio-min; music: per audio-second). */
  unitRate?: number;
  /** Neurons per unit. `image` is per generated image (Gemini prices per image,
   *  not per tile like Workers AI). */
  unitKind?: "chars_1k" | "tile" | "image" | "audio_min" | "audio_sec";
  /** Per-model markup override; falls back to DEFAULT_MARKUP. */
  markup?: number;
}

/** Usage as reported by Workers AI (or estimated pre-call for the reserve). */
export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  /** For TTS: character count. */
  chars?: number;
  /** For image gen: number of 512×512 tiles (≈ ceil(w/512)·ceil(h/512)·steps). */
  tiles?: number;
  /** For image gen priced per whole image (Gemini): count of images produced. */
  images?: number;
  /** For STT: audio minutes. */
  audioMin?: number;
  /** For music generation: seconds of audio produced. */
  audioSec?: number;
}

/** Clamp a provider-reported usage field to a non-negative finite number so a
 *  negative (undercharge) or NaN/Infinity (poison) value can't corrupt the cost. */
const pos = (v: number | undefined): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** Neurons consumed for `usage` under `rate` — the exact Cloudflare cost basis. */
export function neuronsForUsage(usage: Usage, rate: ModelRate): number {
  let n = 0;
  if (rate.inputRate) n += (pos(usage.inputTokens) / 1_000_000) * rate.inputRate;
  if (rate.outputRate) n += (pos(usage.outputTokens) / 1_000_000) * rate.outputRate;
  if (rate.unitRate) {
    if (rate.unitKind === "chars_1k") n += (pos(usage.chars) / 1000) * rate.unitRate;
    if (rate.unitKind === "tile") n += pos(usage.tiles) * rate.unitRate;
    if (rate.unitKind === "image") n += pos(usage.images) * rate.unitRate;
    if (rate.unitKind === "audio_min") n += pos(usage.audioMin) * rate.unitRate;
    if (rate.unitKind === "audio_sec") n += pos(usage.audioSec) * rate.unitRate;
  }
  return n;
}

/** Convenience: usage → credits in one step (neurons rounded up at the end). */
export function creditsForUsage(usage: Usage, rate: ModelRate): number {
  return creditsForNeurons(neuronsForUsage(usage, rate), rate.markup);
}
