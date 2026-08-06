/**
 * Default catalog seed (see the "Pricing & AI-credit economics" section of the README).
 *
 * Plans, credit packs, and the Workers AI model rate table are all D1 rows the
 * admin edits at runtime — this is only the *initial* catalog inserted on first
 * boot (INSERT OR IGNORE). Neuron rates come straight from the Workers AI
 * pricing page and are admin-tunable, because Cloudflare updates them.
 */

import type { Entitlements } from "./entitlements.js";

/**
 * The platform's ONE onboarded transactional address, with Scena's display name.
 * Kept identical to `apps.json`'s `defaultEmailAddress` — `sender-default.test.mjs`
 * enforces it, because a sending domain is onboarded in Cloudflare per DOMAIN, by
 * hand, once, and anything else bounces in production and looks like any other
 * failure.
 *
 * ⚠️ It lives HERE, not in `mailer.ts`, and the reason is a cycle rather than a
 * preference. `mailer.ts` reads `getConfig` from `billing-store.ts`, which reads
 * `DEFAULT_CONFIG` from this file — so a seed importing the constant from the
 * mailer closes the loop, and at module-init time the import resolves to
 * `undefined`. That is not a type error and not a crash on boot: it surfaces
 * later as `D1_TYPE_ERROR: Type 'undefined' not supported`, from the seed, on a
 * fresh database, which reads as a database problem. This file imports only a
 * TYPE, so it is a leaf and cannot be in a cycle.
 */
export const PLATFORM_FROM_DEFAULT = "Scena <noreply@4dl.app>";

export interface PlanSeed {
  id: string;
  name: string;
  priceCents: number;
  interval: "month" | "year";
  sort: number;
  entitlements: Entitlements;
}

const base = (over: Partial<Entitlements["quotas"]>, feat: Partial<Entitlements["features"]>, grant: number, resync: number): Entitlements => ({
  quotas: {
    pairedDevices: 1,
    seats: 1,
    profiles: 1,
    channelsPerProfile: 1,
    slidesPerPlaylist: 10,
    feeds: 0,
    feedRefreshMinSec: 3600,
    scheduleRules: 0,
    historyVersions: 3,
    liveBoards: 0,
    stations: 0,
    boardsPerStation: 1,
    libraryTracks: 0,
    // Was its own `sync` axis. See entitlements.ts — an unknown top-level axis
    // is not merged by the engine, so leaving it there froze every plan on the
    // free tier's 60 seconds.
    resyncIntervalSec: resync,
    ...over,
  },
  features: {
    ticker: false,
    tickerAdvanced: false,
    clockAnalog: false,
    weather: false,
    widgetStack: false,
    htmlSandbox: false,
    screenSaver: true,
    dayparting: false,
    roomQueueManagement: false,
    proofOfPlay: false,
    alertsWebhook: false,
    alertsEmail: false,
    emergencyOverride: true,
    aiGeneration: false,
    ads: false,
    musicLibrary: false,
    multiScreenSync: false,
    customDomain: false,
    ...feat,
  },
  aiCredits: { monthlyGrant: grant },
  // No plan sells a trial today. The key exists because the engine reads it
  // when opening a Stripe subscription; setting it is a one-line pricing change.
  trialDays: 0,
});

export const DEFAULT_PLANS: PlanSeed[] = [
  {
    id: "free",
    name: "Free",
    priceCents: 0,
    interval: "month",
    sort: 0,
    entitlements: base({}, {}, 0, 60),
  },
  {
    id: "starter",
    name: "Starter",
    priceCents: 1900,
    interval: "month",
    sort: 1,
    entitlements: base(
      { pairedDevices: 3, seats: 3, channelsPerProfile: 3, slidesPerPlaylist: 30, feeds: 2, feedRefreshMinSec: 1800, scheduleRules: 5, historyVersions: 10, libraryTracks: 10 },
      { ticker: true, dayparting: true, htmlSandbox: true, aiGeneration: true, musicLibrary: true },
      250,
      30,
    ),
  },
  {
    id: "pro",
    name: "Pro",
    priceCents: 4900,
    interval: "month",
    sort: 2,
    entitlements: base(
      {
        pairedDevices: 15,
        seats: 10,
        profiles: 3,
        channelsPerProfile: 4,
        slidesPerPlaylist: 60,
        feeds: 8,
        feedRefreshMinSec: 900,
        scheduleRules: 20,
        historyVersions: 15,
        liveBoards: 3,
        stations: 3,
        boardsPerStation: 2,
        libraryTracks: 50,
      },
      {
        ticker: true,
        tickerAdvanced: true,
        clockAnalog: true,
        weather: true,
        widgetStack: true,
        htmlSandbox: true,
        dayparting: true,
        roomQueueManagement: true,
        proofOfPlay: true,
        alertsWebhook: true,
        aiGeneration: true,
        ads: true,
        musicLibrary: true,
        multiScreenSync: true,
      },
      1000,
      15,
    ),
  },
  {
    id: "business",
    name: "Business",
    priceCents: 14900,
    interval: "month",
    sort: 3,
    entitlements: base(
      {
        pairedDevices: 60,
        seats: -1,
        profiles: 10,
        channelsPerProfile: 8,
        slidesPerPlaylist: 120,
        feeds: 25,
        feedRefreshMinSec: 300,
        scheduleRules: 60,
        historyVersions: 20,
        liveBoards: 20,
        stations: 20,
        boardsPerStation: 6,
        libraryTracks: -1,
      },
      {
        ticker: true,
        tickerAdvanced: true,
        clockAnalog: true,
        weather: true,
        widgetStack: true,
        htmlSandbox: true,
        dayparting: true,
        roomQueueManagement: true,
        proofOfPlay: true,
        alertsWebhook: true,
        aiGeneration: true,
        ads: true,
        musicLibrary: true,
        multiScreenSync: true,
        // The top tier, and now an HONEST gate rather than the "unlimited
        // library tracks" proxy Stage 3 had to read for want of a flag.
        customDomain: true,
      },
      5000,
      10,
    ),
  },
];

export interface PackSeed {
  id: string;
  name: string;
  credits: number;
  priceCents: number;
  sort: number;
}

/** One-time credit packs (§25). $1 = 1000 credits, with volume bonuses. */
export const DEFAULT_PACKS: PackSeed[] = [
  { id: "pack_1k", name: "1,000 credits", credits: 1000, priceCents: 100, sort: 0 },
  { id: "pack_5k", name: "5,500 credits", credits: 5500, priceCents: 500, sort: 1 },
  { id: "pack_25k", name: "30,000 credits", credits: 30000, priceCents: 2500, sort: 2 },
  { id: "pack_100k", name: "130,000 credits", credits: 130000, priceCents: 10000, sort: 3 },
];

export interface ModelSeed {
  id: string;
  label: string;
  task: "text" | "tts" | "image" | "music";
  cfModel: string;
  inputRate: number | null;
  outputRate: number | null;
  unitRate: number | null;
  unitKind: string | null;
  markup: number;
  sort: number;
}

/**
 * Workers AI catalog with published neuron rates (July 2026). Text models
 * generate HTML slides/widgets; TTS models render announcements; image models
 * produce poster slides. Rates are neurons per 1M tokens (text) / per 1k chars
 * (tts) / per 512² tile (image). Admin-editable — Cloudflare updates these.
 */
export const DEFAULT_MODELS: ModelSeed[] = [
  // --- Text → HTML slide / widget generation (input,output = neurons per 1M tokens) ---
  { id: "llama-3.3-70b", label: "Llama 3.3 70B (balanced default)", task: "text", cfModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", inputRate: 26668, outputRate: 204805, unitRate: null, unitKind: null, markup: 3, sort: 0 },
  { id: "kimi-k2-code", label: "Kimi K2.7 Code (best design)", task: "text", cfModel: "@cf/moonshotai/kimi-k2.7-code", inputRate: 86364, outputRate: 363636, unitRate: null, unitKind: null, markup: 3, sort: 1 },
  { id: "glm-5.2", label: "GLM 5.2 (flagship)", task: "text", cfModel: "@cf/zai-org/glm-5.2", inputRate: 127273, outputRate: 400000, unitRate: null, unitKind: null, markup: 3, sort: 2 },
  { id: "qwen-2.5-coder-32b", label: "Qwen2.5 Coder 32B (code)", task: "text", cfModel: "@cf/qwen/qwen2.5-coder-32b-instruct", inputRate: 60000, outputRate: 90909, unitRate: null, unitKind: null, markup: 3, sort: 3 },
  { id: "gpt-oss-120b", label: "GPT-OSS 120B", task: "text", cfModel: "@cf/openai/gpt-oss-120b", inputRate: 31818, outputRate: 68182, unitRate: null, unitKind: null, markup: 3, sort: 4 },
  { id: "gpt-oss-20b", label: "GPT-OSS 20B (fast)", task: "text", cfModel: "@cf/openai/gpt-oss-20b", inputRate: 18182, outputRate: 27273, unitRate: null, unitKind: null, markup: 3, sort: 5 },
  { id: "llama-4-scout-17b", label: "Llama 4 Scout 17B", task: "text", cfModel: "@cf/meta/llama-4-scout-17b-16e-instruct", inputRate: 24545, outputRate: 77273, unitRate: null, unitKind: null, markup: 3, sort: 6 },
  { id: "nemotron-3-120b", label: "Nemotron 3 120B", task: "text", cfModel: "@cf/nvidia/nemotron-3-120b-a12b", inputRate: 45455, outputRate: 136364, unitRate: null, unitKind: null, markup: 3, sort: 7 },
  { id: "mistral-small-3.1-24b", label: "Mistral Small 3.1 24B", task: "text", cfModel: "@cf/mistralai/mistral-small-3.1-24b-instruct", inputRate: 31876, outputRate: 50488, unitRate: null, unitKind: null, markup: 3, sort: 8 },
  { id: "gemma-4-26b", label: "Gemma 4 26B (reasoning)", task: "text", cfModel: "@cf/google/gemma-4-26b-a4b-it", inputRate: 9091, outputRate: 27273, unitRate: null, unitKind: null, markup: 3, sort: 10 },
  { id: "qwq-32b", label: "QwQ 32B (reasoning)", task: "text", cfModel: "@cf/qwen/qwq-32b", inputRate: 60000, outputRate: 90909, unitRate: null, unitKind: null, markup: 3, sort: 11 },
  { id: "deepseek-r1-32b", label: "DeepSeek R1 Distill 32B", task: "text", cfModel: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", inputRate: 45170, outputRate: 443756, unitRate: null, unitKind: null, markup: 3, sort: 12 },
  { id: "glm-4.7-flash", label: "GLM 4.7 Flash (fast)", task: "text", cfModel: "@cf/zai-org/glm-4.7-flash", inputRate: 5500, outputRate: 36400, unitRate: null, unitKind: null, markup: 3, sort: 13 },
  { id: "llama-3.1-8b", label: "Llama 3.1 8B (fast)", task: "text", cfModel: "@cf/meta/llama-3.1-8b-instruct-fp8-fast", inputRate: 4119, outputRate: 34868, unitRate: null, unitKind: null, markup: 3, sort: 14 },
  { id: "llama-3.2-3b", label: "Llama 3.2 3B (cheap)", task: "text", cfModel: "@cf/meta/llama-3.2-3b-instruct", inputRate: 4625, outputRate: 30475, unitRate: null, unitKind: null, markup: 3, sort: 15 },
  { id: "llama-3.2-1b", label: "Llama 3.2 1B (cheapest)", task: "text", cfModel: "@cf/meta/llama-3.2-1b-instruct", inputRate: 2457, outputRate: 18252, unitRate: null, unitKind: null, markup: 3, sort: 16 },
  { id: "granite-4-micro", label: "Granite 4.0 Micro", task: "text", cfModel: "@cf/ibm-granite/granite-4.0-h-micro", inputRate: 1542, outputRate: 10158, unitRate: null, unitKind: null, markup: 3, sort: 17 },
  // --- Image → poster slide generation (unit = neurons per 512×512 tile) ---
  { id: "flux-schnell", label: "FLUX.1 Schnell (fast default)", task: "image", cfModel: "@cf/black-forest-labs/flux-1-schnell", inputRate: null, outputRate: null, unitRate: 4.8, unitKind: "tile", markup: 3, sort: 20 },
  { id: "flux-2-dev", label: "FLUX.2 Dev (best quality)", task: "image", cfModel: "@cf/black-forest-labs/flux-2-dev", inputRate: null, outputRate: null, unitRate: 37.5, unitKind: "tile", markup: 3, sort: 21 },
  { id: "flux-2-klein-4b", label: "FLUX.2 Klein 4B", task: "image", cfModel: "@cf/black-forest-labs/flux-2-klein-4b", inputRate: null, outputRate: null, unitRate: 26.05, unitKind: "tile", markup: 3, sort: 22 },
  { id: "flux-2-klein-9b", label: "FLUX.2 Klein 9B", task: "image", cfModel: "@cf/black-forest-labs/flux-2-klein-9b", inputRate: null, outputRate: null, unitRate: 341, unitKind: "tile", markup: 3, sort: 23 },
  { id: "lucid-origin", label: "Leonardo Lucid Origin", task: "image", cfModel: "@cf/leonardo/lucid-origin", inputRate: null, outputRate: null, unitRate: 636, unitKind: "tile", markup: 3, sort: 24 },
  { id: "phoenix-1", label: "Leonardo Phoenix 1.0", task: "image", cfModel: "@cf/leonardo/phoenix-1.0", inputRate: null, outputRate: null, unitRate: 530, unitKind: "tile", markup: 3, sort: 25 },
  // --- TTS → announcement audio (unit = neurons per 1k characters) ---
  { id: "aura-1", label: "Deepgram Aura-1", task: "tts", cfModel: "@cf/deepgram/aura-1", inputRate: null, outputRate: null, unitRate: 1363.64, unitKind: "chars_1k", markup: 3, sort: 30 },
  { id: "aura-2-en", label: "Deepgram Aura-2 (English)", task: "tts", cfModel: "@cf/deepgram/aura-2-en", inputRate: null, outputRate: null, unitRate: 2727.27, unitKind: "chars_1k", markup: 3, sort: 31 },
  { id: "melotts", label: "MeloTTS", task: "tts", cfModel: "@cf/myshell-ai/melotts", inputRate: null, outputRate: null, unitRate: 1000, unitKind: "chars_1k", markup: 3, sort: 32 },
  // --- Music → background bed generation (unit = neurons per second of audio) ---
  { id: "musicgen", label: "MiniMax Music (bed)", task: "music", cfModel: "@cf/minimax/music-01", inputRate: null, outputRate: null, unitRate: 500, unitKind: "audio_sec", markup: 3, sort: 40 },

  // ── Google Gemini (company-provided) ────────────────────────────────────
  // These run against Google's Generative Language API on Scena's *platform*
  // key — there is no BYO key. Each generation is metered at Google's list price
  // expressed as neuron-equivalents (Google USD price ÷ $0.000011) times the
  // markup, exactly like Workers AI: text = neurons per 1M tokens, image = per
  // generated image, tts = per 1k chars, music = per second. Admin-tunable.
  // Text → HTML slide generation ($/1M tokens → neurons/1M: ÷0.000011).
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", task: "text", cfModel: "gemini-2.5-flash-lite", inputRate: 9091, outputRate: 36364, unitRate: null, unitKind: null, markup: 3, sort: 50 },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", task: "text", cfModel: "gemini-2.5-flash", inputRate: 27273, outputRate: 227273, unitRate: null, unitKind: null, markup: 3, sort: 51 },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", task: "text", cfModel: "gemini-2.5-pro", inputRate: 113636, outputRate: 909091, unitRate: null, unitKind: null, markup: 3, sort: 52 },
  // Priced at the 3-series flash tier (≥ 2.5 Flash) so we never underprice a
  // newer/dearer "3 Flash" than we assume — admin-tunable down if it's cheaper.
  { id: "gemini-3-flash", label: "Gemini 3 Flash", task: "text", cfModel: "gemini-3-flash", inputRate: 136364, outputRate: 818182, unitRate: null, unitKind: null, markup: 3, sort: 53 },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", task: "text", cfModel: "gemini-3.5-flash", inputRate: 136364, outputRate: 818182, unitRate: null, unitKind: null, markup: 3, sort: 54 },
  // Voice → expressive, prompt-steerable ad/announcement speech (native Gemini
  // TTS). Google bills audio *output per token* ($10/1M flash, $20/1M pro @ ~25
  // tokens/sec ≈ $0.017/$0.034 per 1k spoken chars). We meter per 1k characters
  // at a rate whose 3× markup ($0.048/$0.090 per 1k chars charged) covers the
  // per-token cost even under slow, expressive delivery. Admin-tunable.
  { id: "gemini-2.5-flash-tts", label: "Gemini 2.5 Flash TTS", task: "tts", cfModel: "gemini-2.5-flash-preview-tts", inputRate: null, outputRate: null, unitRate: 1455, unitKind: "chars_1k", markup: 3, sort: 55 },
  { id: "gemini-2.5-pro-tts", label: "Gemini 2.5 Pro TTS", task: "tts", cfModel: "gemini-2.5-pro-preview-tts", inputRate: null, outputRate: null, unitRate: 2727, unitKind: "chars_1k", markup: 3, sort: 56 },
  // Image → poster slide generation (Nano Banana family). Priced per generated
  // image ($0.039 → 3545 neurons; $0.134 → 12182 neurons).
  { id: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image · Nano Banana", task: "image", cfModel: "gemini-2.5-flash-image", inputRate: null, outputRate: null, unitRate: 3545, unitKind: "image", markup: 3, sort: 60 },
  { id: "gemini-3-pro-image", label: "Gemini 3 Pro Image · Nano Banana Pro", task: "image", cfModel: "gemini-3-pro-image", inputRate: null, outputRate: null, unitRate: 12182, unitKind: "image", markup: 3, sort: 61 },
  // Music → background bed generation (Lyria). Google bills a flat price *per
  // song* ($0.04 per ≤30s clip), NOT per second, so ai.ts meters every Lyria
  // clip as one whole 30s clip (121 neurons/sec × 30s = $0.04 cost basis → 3×
  // markup) — a short bed can never cost us the full-song price yet bill a
  // fraction of it.
  { id: "lyria-3-clip", label: "Lyria 3 Clip", task: "music", cfModel: "lyria-3-clip", inputRate: null, outputRate: null, unitRate: 121, unitKind: "audio_sec", markup: 3, sort: 70 },
];

/** Config defaults (admin-editable in app_config). */
export const CONFIG_DEFAULTS: Record<string, string> = {
  "stripe.mode": "disabled", // disabled | test | live
  "stripe.secret_key": "",
  "stripe.publishable_key": "",
  "stripe.webhook_secret": "",
  "billing.grace_days": "7", // past_due grace before suspend
  "billing.suspend_days": "14", // suspended before scheduled deletion
  "billing.delete_days": "30", // suspension → deletion window
  "ai.default_markup": "3",
  "ai.mock": "auto", // auto | on | off — stub AI when no Workers AI binding
  "ai.default_model.text": "llama-3.3-70b", // per-task default the generators reach for
  "ai.default_model.image": "flux-schnell",
  "ai.default_model.tts": "aura-1",
  "ai.default_model.music": "musicgen",
  "email.provider": "cloudflare", // disabled | mock | resend | cloudflare (env.EMAIL binding)
  "email.api_key": "", // only used by the resend provider
  /*
    ⚠️ THE SEEDED ROW WINS OVER `PLATFORM_FROM_DEFAULT`, so it must be the same
    address. This said `Scena <noreply@fourdegreelabs.com>` — a domain nobody
    onboarded — and because it is a real `app_config` row it beat the constant
    that `sender-default.test.mjs` checks. Every message from a fresh
    deployment would have been refused at the provider.
  */
  "email.from": PLATFORM_FROM_DEFAULT, // sender domain must be onboarded for the cloudflare provider
  "email.admin": "", // billing/system notices go here (falls back to OPERATOR_EMAIL)
  "weather.api_key": "", // Platform OpenWeather One Call key — all weather sources run on this company key (empty ⇒ mock conditions, free)
  "weather.credits_per_call": "3", // Credits charged per real weather fetch (per location, hourly within opening hours)
  "google.gemini_key": "", // Platform Gemini API key — all Gemini/Lyria generation runs on this company key (metered per model rate; no BYO)
  "weather.onecall_base": "https://api.openweathermap.org/data/3.0/onecall",
  "weather.onecall_version": "4.0", // OpenWeather One Call version — "4.0" (current, modular) or "3.0" (legacy). A key is subscribed to one.
  "weather.geo_base": "https://api.openweathermap.org/geo/1.0/direct",
};
