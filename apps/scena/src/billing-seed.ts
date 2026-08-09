/**
 * Default catalog seed (see the "Pricing & AI-credit economics" section of the README).
 *
 * Plans, credit packs, and the Workers AI model rate table are all D1 rows the
 * admin edits at runtime — this is only the *initial* catalog inserted on first
 * boot (INSERT OR IGNORE). Neuron rates come straight from the Workers AI
 * pricing page and are admin-tunable, because Cloudflare updates them.
 */

import { configureAiFloor, configureAiLanes, type FloorModel } from "@4dl/ai";
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
 * fresh database, which reads as a database problem. This file imports nothing
 * from this app but a TYPE, so it is a leaf and cannot be in a cycle — the
 * `@4dl/ai` import below is a package, which by construction cannot import back.
 */
export const PLATFORM_FROM_DEFAULT = "Scena <noreply@4dl.app>";

/**
 * ⚠️ BUMP THIS WHENEVER `DEFAULT_PLANS` OR `DEFAULT_PACKS` CHANGES IN A WAY AN
 * EXISTING DEPLOYMENT MUST ADOPT — a price, a name, an entitlement, the order, or
 * whether a rung is offered at all.
 *
 * The seed this replaces was `INSERT OR IGNORE` and nothing else, so it did
 * exactly nothing on any database that had booted once. Every catalog edit since
 * has reached a fresh deployment and no live one, silently. `seedBilling` reads
 * this stamp, reconciles the whole catalog to the declared values when it moves,
 * and skips otherwise — so a runtime edit an operator makes in the console still
 * survives every redeploy in between.
 */
export const SCENA_CATALOG_VERSION = "2026-08-09";

export interface PlanSeed {
  id: string;
  name: string;
  priceCents: number;
  interval: "month" | "year";
  sort: number;
  /**
   * Offered for sale. `false` keeps the row — its entitlements still resolve for
   * anyone sitting on it — while taking it out of every picker.
   *
   * ⚠️ The seed used to hardcode `active = 1` for every plan, which is the whole
   * reason `free` was a product rather than a state. See the row itself.
   */
  active?: boolean;
  entitlements: Entitlements;
}

const base = (
  over: Partial<Entitlements["quotas"]>,
  feat: Partial<Entitlements["features"]>,
  grant: number,
  resync: number,
  trialDays = 0,
): Entitlements => ({
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
    // Megabytes of media the workspace may hold. New in Stage 5 — see
    // entitlements.ts. Sized off what each tier's device count implies: a
    // 15-screen Pro workspace runs real video, a free one runs a poster.
    storageMb: 100,
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
  /*
    THE TRIAL IS WHAT REPLACED THE FREE TIER.

    Scena sold a `free` plan — one screen, one channel, indefinitely. It is a
    parking state now (see the row in `DEFAULT_PLANS`), and a workspace tries the
    REAL product for thirty days instead of living on a crippled one forever.
    Thirty is Kova's figure on its entry tiers, and it suits signage for the same
    reason it suits coaching: the thing is judged on a wall over weeks, not in an
    afternoon.

    Read by the engine when it opens a Stripe subscription. A deployment with no
    payment rail never reaches that, and `statusOf` deliberately fails open for
    it — see host-context.ts.
  */
  trialDays,
});

export const DEFAULT_PLANS: PlanSeed[] = [
  /**
   * `free` IS A PARKING STATE, NOT A PLAN — and this is the one row to read
   * carefully.
   *
   * `getSubscription` stamps every brand-new workspace `plan_id = 'free'`, and a
   * deleted Stripe subscription falls back to the same pair. So it is the
   * most-used row in the table, and while it was `active` it was also a genuinely
   * usable free product: a screen on a wall, indefinitely, fully writable, for
   * nothing.
   *
   * ── The fix is the GATE, and only the gate ──────────────────────────────
   *
   * `statusOf` (host-context.ts) reports `incomplete` for a workspace with no
   * paid plan, and the route guard turns that into read-only with billing still
   * writable. These entitlements are deliberately NOT zeroed as a second
   * enforcement of the same rule.
   *
   * Zeroing them would brick the one configuration where the gate correctly
   * stands down. A deployment with no Stripe keys — a self-host, anything before
   * DEPLOY.md's Stripe step, the whole E2E suite — cannot take a payment, so
   * gating "has not paid" there would strand every workspace over OUR
   * misconfiguration; `statusOf` fails open for exactly that reason. Crippled
   * quotas would then brick it anyway, one layer further down.
   *
   * So this row is what a NON-CHARGING deployment serves. On a charging one it is
   * unreachable: the gate fires first, every time.
   */
  {
    id: "free",
    name: "Free",
    priceCents: 0,
    interval: "month",
    sort: 0,
    active: false,
    entitlements: base({}, {}, 0, 60),
  },
  {
    id: "starter",
    name: "Starter",
    priceCents: 1900,
    interval: "month",
    sort: 1,
    entitlements: base(
      { pairedDevices: 3, seats: 3, channelsPerProfile: 3, slidesPerPlaylist: 30, feeds: 2, feedRefreshMinSec: 1800, scheduleRules: 5, historyVersions: 10, libraryTracks: 10, storageMb: 2_000 },
      { ticker: true, dayparting: true, htmlSandbox: true, aiGeneration: true, musicLibrary: true },
      250,
      30,
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
        storageMb: 20_000,
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
      30,
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
        storageMb: 100_000,
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

/**
 * SCENA'S CURATED AI CATALOG — the floor `@4dl/ai` seeds when the table is empty.
 *
 * ── The id IS the provider path now, and that is the whole migration ─────────
 *
 * These rows used to carry a short slug (`llama-3.3-70b`) with the real path in
 * a `cf_model` column of Scena's own `ai_models` table — a shape `@4dl/ai` does
 * not have, and the one structural reason Scena could not adopt the shared
 * catalog. Two tables named `ai_models` keying differently meant Scena also went
 * without everything that catalog has grown since: the live pricing-page sync,
 * the retirement sweep, the shared publication a new app seeds from, and the
 * "apply to every 4DL app" broadcast. It had a hand-written syncer instead,
 * behind a button that for a while reported "17 updated" having fetched nothing.
 *
 * So `id` is the string the provider answers to. One column, no mapping, and a
 * model's identity is the same fact in every app — which is what makes a shared
 * catalog and a broadcast mean anything at all.
 *
 * ── Two lane names for one capability, and both are correct ──────────────────
 *
 * Cloudflare's pricing page yields `tts`; Google's yields `speech` (the id
 * contains "tts"). A catalog with both providers in it therefore holds
 * text-to-speech under BOTH names, so the Google voices below are tagged
 * `speech` — what a sync will call them — and every selection goes through
 * `lanesFor()` so asking for one name cannot silently hide the other half.
 *
 * `markup` is omitted: `DEFAULT_SEED_MARKUP` is the platform's 3×, and repeating
 * it forty times is forty places for it to drift.
 */
export const SCENA_MODEL_FLOOR: FloorModel[] = [
  // --- Text → HTML slide / widget generation (input,output = neurons per 1M tokens) ---
  { id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", label: "Llama 3.3 70B (balanced default)", task: "text", provider: "workers-ai", input_rate: 26668, output_rate: 204805, unit_rate: null, unit_kind: null, sort: 0 },
  { id: "@cf/moonshotai/kimi-k2.7-code", label: "Kimi K2.7 Code (best design)", task: "text", provider: "workers-ai", input_rate: 86364, output_rate: 363636, unit_rate: null, unit_kind: null, sort: 1 },
  { id: "@cf/zai-org/glm-5.2", label: "GLM 5.2 (flagship)", task: "text", provider: "workers-ai", input_rate: 127273, output_rate: 400000, unit_rate: null, unit_kind: null, sort: 2 },
  { id: "@cf/qwen/qwen2.5-coder-32b-instruct", label: "Qwen2.5 Coder 32B (code)", task: "text", provider: "workers-ai", input_rate: 60000, output_rate: 90909, unit_rate: null, unit_kind: null, sort: 3 },
  { id: "@cf/openai/gpt-oss-120b", label: "GPT-OSS 120B", task: "text", provider: "workers-ai", input_rate: 31818, output_rate: 68182, unit_rate: null, unit_kind: null, sort: 4 },
  { id: "@cf/openai/gpt-oss-20b", label: "GPT-OSS 20B (fast)", task: "text", provider: "workers-ai", input_rate: 18182, output_rate: 27273, unit_rate: null, unit_kind: null, sort: 5 },
  { id: "@cf/meta/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout 17B", task: "text", provider: "workers-ai", input_rate: 24545, output_rate: 77273, unit_rate: null, unit_kind: null, sort: 6 },
  { id: "@cf/nvidia/nemotron-3-120b-a12b", label: "Nemotron 3 120B", task: "text", provider: "workers-ai", input_rate: 45455, output_rate: 136364, unit_rate: null, unit_kind: null, sort: 7 },
  { id: "@cf/mistralai/mistral-small-3.1-24b-instruct", label: "Mistral Small 3.1 24B", task: "text", provider: "workers-ai", input_rate: 31876, output_rate: 50488, unit_rate: null, unit_kind: null, sort: 8 },
  { id: "@cf/google/gemma-4-26b-a4b-it", label: "Gemma 4 26B (reasoning)", task: "text", provider: "workers-ai", input_rate: 9091, output_rate: 27273, unit_rate: null, unit_kind: null, sort: 10 },
  { id: "@cf/qwen/qwq-32b", label: "QwQ 32B (reasoning)", task: "text", provider: "workers-ai", input_rate: 60000, output_rate: 90909, unit_rate: null, unit_kind: null, sort: 11 },
  { id: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", label: "DeepSeek R1 Distill 32B", task: "text", provider: "workers-ai", input_rate: 45170, output_rate: 443756, unit_rate: null, unit_kind: null, sort: 12 },
  { id: "@cf/zai-org/glm-4.7-flash", label: "GLM 4.7 Flash (fast)", task: "text", provider: "workers-ai", input_rate: 5500, output_rate: 36400, unit_rate: null, unit_kind: null, sort: 13 },
  { id: "@cf/meta/llama-3.1-8b-instruct-fp8-fast", label: "Llama 3.1 8B (fast)", task: "text", provider: "workers-ai", input_rate: 4119, output_rate: 34868, unit_rate: null, unit_kind: null, sort: 14 },
  { id: "@cf/meta/llama-3.2-3b-instruct", label: "Llama 3.2 3B (cheap)", task: "text", provider: "workers-ai", input_rate: 4625, output_rate: 30475, unit_rate: null, unit_kind: null, sort: 15 },
  { id: "@cf/meta/llama-3.2-1b-instruct", label: "Llama 3.2 1B (cheapest)", task: "text", provider: "workers-ai", input_rate: 2457, output_rate: 18252, unit_rate: null, unit_kind: null, sort: 16 },
  { id: "@cf/ibm-granite/granite-4.0-h-micro", label: "Granite 4.0 Micro", task: "text", provider: "workers-ai", input_rate: 1542, output_rate: 10158, unit_rate: null, unit_kind: null, sort: 17 },
  // --- Image → poster slide generation (unit = neurons per 512×512 tile) ---
  { id: "@cf/black-forest-labs/flux-1-schnell", label: "FLUX.1 Schnell (fast default)", task: "image", provider: "workers-ai", input_rate: null, output_rate: null, unit_rate: 4.8, unit_kind: "tile", sort: 20 },
  { id: "@cf/black-forest-labs/flux-2-dev", label: "FLUX.2 Dev (best quality)", task: "image", provider: "workers-ai", input_rate: null, output_rate: null, unit_rate: 37.5, unit_kind: "tile", sort: 21 },
  { id: "@cf/black-forest-labs/flux-2-klein-4b", label: "FLUX.2 Klein 4B", task: "image", provider: "workers-ai", input_rate: null, output_rate: null, unit_rate: 26.05, unit_kind: "tile", sort: 22 },
  { id: "@cf/black-forest-labs/flux-2-klein-9b", label: "FLUX.2 Klein 9B", task: "image", provider: "workers-ai", input_rate: null, output_rate: null, unit_rate: 341, unit_kind: "tile", sort: 23 },
  { id: "@cf/leonardo/lucid-origin", label: "Leonardo Lucid Origin", task: "image", provider: "workers-ai", input_rate: null, output_rate: null, unit_rate: 636, unit_kind: "tile", sort: 24 },
  { id: "@cf/leonardo/phoenix-1.0", label: "Leonardo Phoenix 1.0", task: "image", provider: "workers-ai", input_rate: null, output_rate: null, unit_rate: 530, unit_kind: "tile", sort: 25 },
  // --- Voice → announcement audio (unit = neurons per 1k characters) ---
  { id: "@cf/deepgram/aura-1", label: "Deepgram Aura-1", task: "tts", provider: "workers-ai", input_rate: null, output_rate: null, unit_rate: 1363.64, unit_kind: "chars_1k", sort: 30 },
  { id: "@cf/deepgram/aura-2-en", label: "Deepgram Aura-2 (English)", task: "tts", provider: "workers-ai", input_rate: null, output_rate: null, unit_rate: 2727.27, unit_kind: "chars_1k", sort: 31 },
  { id: "@cf/myshell-ai/melotts", label: "MeloTTS", task: "tts", provider: "workers-ai", input_rate: null, output_rate: null, unit_rate: 1000, unit_kind: "chars_1k", sort: 32 },
  // --- Music → background bed generation (unit = neurons per second of audio) ---
  { id: "@cf/minimax/music-01", label: "MiniMax Music (bed)", task: "music", provider: "workers-ai", input_rate: null, output_rate: null, unit_rate: 500, unit_kind: "audio_sec", sort: 40 },

  // ── Google Gemini (company-provided) ────────────────────────────────────
  // These run against Google's Generative Language API on Scena's *platform*
  // key — there is no BYO key. Each generation is metered at Google's list price
  // expressed as neuron-equivalents (Google USD price ÷ $0.000011) times the
  // markup, exactly like Workers AI: text = neurons per 1M tokens, image = per
  // generated image, speech = per 1k chars, music = per second. Admin-tunable.
  // Text → HTML slide generation ($/1M tokens → neurons/1M: ÷0.000011).
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", task: "text", provider: "google", input_rate: 9091, output_rate: 36364, unit_rate: null, unit_kind: null, sort: 50 },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", task: "text", provider: "google", input_rate: 27273, output_rate: 227273, unit_rate: null, unit_kind: null, sort: 51 },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", task: "text", provider: "google", input_rate: 113636, output_rate: 909091, unit_rate: null, unit_kind: null, sort: 52 },
  // Priced at the 3-series flash tier (≥ 2.5 Flash) so we never underprice a
  // newer/dearer "3 Flash" than we assume — admin-tunable down if it's cheaper.
  { id: "gemini-3-flash", label: "Gemini 3 Flash", task: "text", provider: "google", input_rate: 136364, output_rate: 818182, unit_rate: null, unit_kind: null, sort: 53 },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", task: "text", provider: "google", input_rate: 136364, output_rate: 818182, unit_rate: null, unit_kind: null, sort: 54 },
  // Voice → expressive, prompt-steerable ad/announcement speech (native Gemini
  // TTS). Google bills audio *output per token* ($10/1M flash, $20/1M pro @ ~25
  // tokens/sec ≈ $0.017/$0.034 per 1k spoken chars). We meter per 1k characters
  // at a rate whose 3× markup ($0.048/$0.090 per 1k chars charged) covers the
  // per-token cost even under slow, expressive delivery. Admin-tunable.
  { id: "gemini-2.5-flash-preview-tts", label: "Gemini 2.5 Flash TTS", task: "speech", provider: "google", input_rate: null, output_rate: null, unit_rate: 1455, unit_kind: "chars_1k", sort: 55 },
  { id: "gemini-2.5-pro-preview-tts", label: "Gemini 2.5 Pro TTS", task: "speech", provider: "google", input_rate: null, output_rate: null, unit_rate: 2727, unit_kind: "chars_1k", sort: 56 },
  // Image → poster slide generation (Nano Banana family). Priced per generated
  // image ($0.039 → 3545 neurons; $0.134 → 12182 neurons).
  { id: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image · Nano Banana", task: "image", provider: "google", input_rate: null, output_rate: null, unit_rate: 3545, unit_kind: "image", sort: 60 },
  { id: "gemini-3-pro-image", label: "Gemini 3 Pro Image · Nano Banana Pro", task: "image", provider: "google", input_rate: null, output_rate: null, unit_rate: 12182, unit_kind: "image", sort: 61 },
  /*
    Music → background bed generation (Lyria).

    ⚠️ THE ID WAS `lyria-3-clip`, WHICH GOOGLE HAS NEVER ANSWERED TO. Scena's
    slug and its `cf_model` were the same invented string, and `cf_model` is what
    `gemini.ts` puts in the URL — so every music generation on this row 404'd at
    the provider and surfaced as "generation failed". It is `lyria-002`, the id
    Google publishes and the one `@4dl/ai`'s own floor carries, so the two apps
    now name the same model the same way.

    Google bills a flat price *per song* ($0.04 per ≤30s clip), NOT per second,
    so `ai.ts` meters every Lyria clip as one whole 30s clip (121 neurons/sec ×
    30s = $0.04 cost basis → 3× markup) — a short bed can never cost us the
    full-song price yet bill a fraction of it.
  */
  { id: "lyria-002", label: "Lyria 2 (music bed)", task: "music", provider: "google", input_rate: null, output_rate: null, unit_rate: 121, unit_kind: "audio_sec", sort: 70 },
];

/**
 * HAND THE CATALOG'S TWO APP-OWNED FACTS TO `@4dl/ai`, AT MODULE LOAD.
 *
 * A module-load side effect rather than a call from an entry point, and the
 * timing is why: `ensureBilling` seeds the catalog on the first request that
 * touches billing, `syncModelCatalog` seeds it again, and both read these two
 * settings. Anything later than "when the module that defines them is loaded"
 * leaves a window in which the first seed of a fresh database uses Kova's five
 * lanes and Kova's eleven rows — and `seedAiModels` only ever runs once, so the
 * window does not close. `billing-store.ts` imports this file to read the floor,
 * which is what guarantees it is loaded before anything can seed.
 *
 *   THE LANES     what Scena has a code path for (`ai.ts`). A lane the app
 *                 cannot execute is catalogued DISABLED — and the default was
 *                 Kova's, which does not include `music` and catalogues
 *                 Cloudflare's `tts` voices off, i.e. every voice Scena sells.
 *                 `speech` comes along with `tts` automatically (`LANE_ALIASES`);
 *                 declaring one name and not the other is the mistake the alias
 *                 table exists to prevent.
 *   THE FLOOR     the forty rows above. `@4dl/ai`'s own floor is eleven chosen
 *                 for Kova, with no Workers AI voice, poster or music model in
 *                 it at all, so seeding Scena from it would leave three of its
 *                 four lanes with nothing pickable on a fresh database.
 */
configureAiLanes(["text", "image", "tts", "music"]);
configureAiFloor(SCENA_MODEL_FLOOR);

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
  /*
    THE PER-LANE DEFAULT THE GENERATORS REACH FOR — a PROVIDER PATH now, because
    that is what `ai_models.id` is since Scena adopted `@4dl/ai`'s catalog.

    These were slugs (`llama-3.3-70b`, `flux-schnell`, `aura-1`, `musicgen`)
    naming rows that no longer exist under those keys. `defaultModelForTask`
    validates the stored value against the catalog and falls back to the lane's
    elected default when it does not match, so a stale slug would not have
    broken generation — it would have silently ignored the platform default and
    used whatever the election picked, which is the kind of wrong that never
    reports itself.
  */
  "ai.default_model.text": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "ai.default_model.image": "@cf/black-forest-labs/flux-1-schnell",
  "ai.default_model.tts": "@cf/deepgram/aura-1",
  "ai.default_model.music": "@cf/minimax/music-01",
  /*
    disabled | mock | cloudflare (env.EMAIL binding).

    `resend` and its `email.api_key` are GONE with Stage 6. The platform sends
    from one address through Cloudflare Email Sending, onboarded per zone by
    hand — which is the whole reason the address is shared rather than per-app —
    so a second provider lane with its own stored key was a path nothing used.
    `mock` now fails CLOSED outside development (@4dl/email): it logs the whole
    message body, sign-in codes included, so a deployment left on it must be
    told rather than humoured.
  */
  "email.provider": "cloudflare",
  /*
    ⚠️ THE SEEDED ROW WINS OVER `PLATFORM_FROM_DEFAULT`, so it must be the same
    address. This said `Scena <noreply@fourdegreelabs.com>` — a domain nobody
    onboarded — and because it is a real `app_config` row it beat the constant
    that `sender-default.test.mjs` checks. Every message from a fresh
    deployment would have been refused at the provider.
  */
  "email.from": PLATFORM_FROM_DEFAULT, // sender domain must be onboarded for the cloudflare provider
  // Where the console's TEST email goes (falls back to OPERATOR_EMAIL). It is
  // no longer where billing notices go — those reach the workspace's own owners
  // through the inbox (`notify.ts`), which is what they always should have done.
  "email.admin": "",
  "weather.api_key": "", // Platform OpenWeather One Call key — all weather sources run on this company key (empty ⇒ mock conditions, free)
  "weather.credits_per_call": "3", // Credits charged per real weather fetch (per location, hourly within opening hours)
  "google.gemini_key": "", // Platform Gemini API key — all Gemini/Lyria generation runs on this company key (metered per model rate; no BYO)
  "weather.onecall_base": "https://api.openweathermap.org/data/3.0/onecall",
  "weather.onecall_version": "4.0", // OpenWeather One Call version — "4.0" (current, modular) or "3.0" (legacy). A key is subscribed to one.
  "weather.geo_base": "https://api.openweathermap.org/geo/1.0/direct",
};
