/**
 * Google Gemini provider (§24, company-provided).
 *
 * Gemini models run against Google's Generative Language API using Scena's own
 * *platform* API key (app_config `google.gemini_key`). There is no BYO key —
 * every tenant generates on the company key, and each generation is metered at
 * Google's list price expressed as neuron-equivalents (see the model catalog's
 * per-token / per-image / per-char / per-second rates) times the model markup,
 * exactly like Workers AI. So a Gemini call charges credits the same way a
 * Cloudflare call does; only the compute provider differs.
 *
 * Three capabilities are wired: text → HTML slides (generateContent), image →
 * poster slides (generateContent with an IMAGE modality → inlineData), and
 * music → short beds (Lyria :predict). All return content-addressed assets like
 * any other generation, and calls reach here off `ai_models.provider`, not off
 * what the model id happens to look like.
 */
import type { Env } from "./env.js";
import { getConfigValue } from "./billing-store.js";

const GLA_BASE = "https://generativelanguage.googleapis.com/v1beta";

/*
  ── NO id PREFIX TESTS LEFT, and that is the point ──────────────────────────

  `isGeminiModel`, `isLyriaModel` and `isGoogleGenModel` all asked "which
  provider is this?" of a STRING, because before `ai_models` carried a `provider`
  column there was nothing else to ask. Every caller reads the column now:
  `ai.ts` routes on `model.provider === "google"`, `/api/ai/models` hides Google
  rows on the same test, and the ENDPOINT within Google is chosen by the request's
  `task` (music → Lyria's `:predict`, everything else → `:generateContent`) rather
  than by what the id looks like.

  Guessing a provider from an id is right until a provider ships a model whose
  name does not match the pattern — at which point a Google model is dispatched to
  Workers AI and fails with something unrelated to the actual cause. `lyria-002`
  was already an id that did not begin with "gemini-".
*/

/** Resolve the API key — always Scena's platform key (no per-tenant BYO). */
async function resolveKey(env: Env, _tenantId: string): Promise<string> {
  // `env`, not `env.DB`: there is ONE Google account behind every 4DL product,
  // and the key lives in the shared store so a rotation is one paste rather than
  // one per app (with the app somebody forgets keeping the dead key).
  return (await getConfigValue(env, "google.gemini_key")) || "";
}

/** Whether Gemini generation is possible (a platform key is configured). */
export async function hasGeminiKey(env: Env, tenantId: string): Promise<boolean> {
  return !!(await resolveKey(env, tenantId));
}

/* ------------------------------ text (HTML) ------------------------------ */

export interface GeminiTextResult {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
}

/** Generate text (an HTML slide document) via generateContent. */
export async function geminiGenerateText(
  env: Env,
  tenantId: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<GeminiTextResult> {
  const key = await resolveKey(env, tenantId);
  if (!key) throw new Error("gemini_key_missing");
  // Gemini 2.5+/3 enable "thinking" by default, and thinking tokens are charged
  // against maxOutputTokens — so a slide gets truncated (MAX_TOKENS) with the
  // visible HTML cut short. We want direct output, not chain-of-thought: disable
  // thinking where the model allows it (Flash/Flash-Lite; Pro needs a minimum
  // budget, so there we just rely on a large output cap). Either way, give the
  // document plenty of room.
  const canDisableThinking = /flash|lite/i.test(model);
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      maxOutputTokens: opts.maxTokens ?? 32768,
      temperature: opts.temperature ?? 0.8,
      ...(canDisableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  };
  const json = await callGenerateContent(key, model, body);
  const text = extractText(json);
  const finish = json.candidates?.[0]?.finishReason;
  // A truncated document renders broken in the sandbox — surface it clearly
  // instead of saving half a slide, so the operator can retry / pick a model.
  if (finish === "MAX_TOKENS" && !text) throw new Error("gemini_truncated (raise the model's output limit)");
  if (!text) throw new Error("gemini_empty_response");
  return { text, inputTokens: json.usageMetadata?.promptTokenCount, outputTokens: json.usageMetadata?.candidatesTokenCount };
}

/* --------------------------------- image --------------------------------- */

export interface GeminiImageResult {
  bytes: ArrayBuffer;
  mime: string;
  inputTokens?: number;
  outputTokens?: number;
}

/** Generate an image via a native-image Gemini model (Nano Banana family). */
export async function geminiGenerateImage(env: Env, tenantId: string, model: string, prompt: string): Promise<GeminiImageResult> {
  const key = await resolveKey(env, tenantId);
  if (!key) throw new Error("gemini_key_missing");
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["IMAGE"] },
  };
  const json = await callGenerateContent(key, model, body);
  const inline = firstInlineData(json);
  if (!inline) throw new Error("gemini_no_image");
  return {
    bytes: b64ToBytes(inline.data),
    mime: inline.mimeType || "image/png",
    inputTokens: json.usageMetadata?.promptTokenCount,
    outputTokens: json.usageMetadata?.candidatesTokenCount,
  };
}

/* ---------------------------------- tts ---------------------------------- */

/** Gemini's 30 prebuilt TTS voice names (used to validate an incoming voice). */
const GEMINI_VOICE_NAMES = new Set([
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe",
  "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
  "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
]);

export interface GeminiSpeechResult {
  bytes: ArrayBuffer;
  mime: string;
}

/**
 * Generate expressive speech via Gemini's native TTS (generateContent with an
 * AUDIO modality). Unlike a plain TTS engine, the *prompt itself* steers the
 * delivery — a leading style instruction ("Read like a 1950s radio announcer:")
 * makes Gemini perform the copy in that voice. `voiceName` is one of Gemini's
 * prebuilt voices (Kore, Charon, …). The model returns raw 16-bit PCM, which we
 * wrap in a WAV container for the browser.
 */
export async function geminiGenerateSpeech(env: Env, tenantId: string, model: string, text: string, voiceName: string): Promise<GeminiSpeechResult> {
  const key = await resolveKey(env, tenantId);
  if (!key) throw new Error("gemini_key_missing");
  // Coerce an unknown voice (e.g. a non-Gemini persona from a generic caller) to
  // a safe default so the request never fails on a bad voiceName.
  const voice = GEMINI_VOICE_NAMES.has(voiceName) ? voiceName : "Kore";
  const body = {
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  };
  const json = await callGenerateContent(key, model, body);
  const inline = firstInlineData(json);
  if (!inline) throw new Error("gemini_no_audio");
  const pcm = b64ToBytes(inline.data);
  // The mimeType looks like "audio/L16;codec=pcm;rate=24000" — pull the rate.
  const rate = parseInt(/rate=(\d+)/.exec(inline.mimeType ?? "")?.[1] ?? "24000", 10) || 24000;
  return { bytes: pcmToWav(pcm, rate), mime: "audio/wav" };
}

/** Wrap signed-16-bit-LE mono PCM in a minimal WAV header for browser playback. */
function pcmToWav(pcm: ArrayBuffer, sampleRate: number): ArrayBuffer {
  const dataLen = pcm.byteLength;
  const buf = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + dataLen, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, dataLen, true);
  new Uint8Array(buf, 44).set(new Uint8Array(pcm));
  return buf;
}

/* --------------------------------- music --------------------------------- */

export interface GeminiMusicResult {
  bytes: ArrayBuffer;
  mime: string;
}

/**
 * Generate a short music bed via Lyria (`:predict`). Lyria returns raw PCM or a
 * base64 audio payload depending on the model; we normalize to bytes and let the
 * caller store it. Best-effort: throws a clear error if the key/model can't serve
 * music (some Lyria variants are Vertex-only or streaming-only).
 */
export async function geminiGenerateMusic(env: Env, tenantId: string, model: string, prompt: string, seconds: number): Promise<GeminiMusicResult> {
  const key = await resolveKey(env, tenantId);
  if (!key) throw new Error("gemini_key_missing");
  const body = {
    instances: [{ prompt }],
    parameters: { sample_count: 1, negative_prompt: "", seconds: Math.min(30, Math.max(5, Math.round(seconds))) },
  };
  const res = await fetch(`${GLA_BASE}/models/${encodeURIComponent(model)}:predict?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`gemini_music_${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const json = (await res.json()) as { predictions?: Array<{ bytesBase64Encoded?: string; audioContent?: string; mimeType?: string }> };
  const pred = json.predictions?.[0];
  const b64 = pred?.bytesBase64Encoded || pred?.audioContent;
  if (!b64) throw new Error("gemini_music_no_audio");
  return { bytes: b64ToBytes(b64), mime: pred?.mimeType || "audio/wav" };
}

/*
  ── THE LIVE MODEL LIST AND ITS GUESSED RATES ARE GONE ──────────────────────

  `fetchGeminiModels` + `classifyGemini` + `defaultGeminiRate` +
  `syncGeminiFromGoogle` (~110 lines) listed every model the platform key can
  reach and upserted each one at a rate looked up BY LANE: flash-tier prices for
  any text model, Nano-Banana's price for any image model, and so on.

  That is a money bug, not a coverage gap. Discovering `gemini-3-pro` and pricing
  it at 2.5 Flash's $0.30/1M input means the reserve under-estimates by roughly
  4x and the platform eats the difference at settle time — silently, on every
  call, with the console reporting a successful sync. A seed rate must be an
  UPPER bound (AGENTS §5), and a rate guessed from a lane cannot be one.

  `syncModelCatalog` (`@4dl/ai`) reads Google's own pricing page and prices each
  row from the number printed against its name, refusing loudly — into
  `unpriceable` — anything it cannot price exactly. What is lost is the "can this
  key reach it" signal, which the pricing page does not carry; what is gained is
  that no row is ever priced by resemblance.
*/

/* -------------------------------- helpers -------------------------------- */

interface GenContentResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }> }; finishReason?: string }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

async function callGenerateContent(key: string, model: string, body: unknown): Promise<GenContentResponse> {
  const res = await fetch(`${GLA_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`gemini_${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  return (await res.json()) as GenContentResponse;
}

function extractText(json: GenContentResponse): string {
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("").trim();
}

function firstInlineData(json: GenContentResponse): { mimeType?: string; data: string } | null {
  for (const p of json.candidates?.[0]?.content?.parts ?? []) {
    if (p.inlineData?.data) return { mimeType: p.inlineData.mimeType, data: p.inlineData.data };
  }
  return null;
}

function b64ToBytes(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
