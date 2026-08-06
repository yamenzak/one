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
 * any other generation, and route here purely off the model id prefix.
 */
import type { Env } from "./env.js";
import { getConfigValue, getModel, upsertModel } from "./billing-store.js";

const GLA_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** A Gemini text/image model id (the value stored in ai_models.cf_model). */
export function isGeminiModel(cfModel: string): boolean {
  return cfModel.startsWith("gemini-");
}

/** A Lyria music model id. */
export function isLyriaModel(cfModel: string): boolean {
  return cfModel.startsWith("lyria-");
}

/** Any Google Generative Language model (Gemini or Lyria) — company-provided. */
export function isGoogleGenModel(cfModel: string): boolean {
  return isGeminiModel(cfModel) || isLyriaModel(cfModel);
}

/** Resolve the API key — always Scena's platform key (no per-tenant BYO). */
async function resolveKey(env: Env, _tenantId: string): Promise<string> {
  return (await getConfigValue(env.DB, "google.gemini_key")) || "";
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

/* ---------------------------- live model list ---------------------------- */

export interface GeminiCatalogEntry {
  id: string; // bare model id, e.g. "gemini-2.5-flash"
  displayName: string;
  description: string;
  methods: string[]; // supportedGenerationMethods
}

/**
 * Fetch the live model list the key can access (the admin "sync" button). Only
 * models that actually generate content are returned (chat/image/music); embed &
 * legacy models are filtered out so the catalog stays relevant.
 */
export async function fetchGeminiModels(env: Env, tenantId = ""): Promise<GeminiCatalogEntry[]> {
  const key = await resolveKey(env, tenantId);
  if (!key) throw new Error("gemini_key_missing");
  const out: GeminiCatalogEntry[] = [];
  let pageToken = "";
  // Paginate defensively (the list can span a couple of pages).
  for (let i = 0; i < 5; i++) {
    const url = `${GLA_BASE}/models?pageSize=200&key=${encodeURIComponent(key)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`gemini_list_${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    const json = (await res.json()) as {
      models?: Array<{ name?: string; displayName?: string; description?: string; supportedGenerationMethods?: string[] }>;
      nextPageToken?: string;
    };
    for (const m of json.models ?? []) {
      const id = (m.name ?? "").replace(/^models\//, "");
      if (!id) continue;
      const methods = m.supportedGenerationMethods ?? [];
      const usable = methods.includes("generateContent") || methods.includes("predict");
      if (!usable) continue;
      out.push({ id, displayName: m.displayName ?? id, description: m.description ?? "", methods });
    }
    pageToken = json.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return out;
}

/**
 * Classify a live Gemini model id into a Scena generation task (or null to skip
 * non-generative models like embeddings, live-streaming, AQA, TTS, Imagen/Veo).
 */
function classifyGemini(id: string): "text" | "image" | "music" | "tts" | null {
  if (id.startsWith("lyria-")) return "music";
  if (!id.startsWith("gemini-")) return null;
  if (/embedding|aqa|-live|imagen|veo|learnlm/.test(id)) return null;
  if (id.includes("-tts")) return "tts";
  if (id.includes("-image")) return "image";
  return "text";
}

/** Task → default neuron-equivalent rates (Google list price ÷ $0.000011),
 *  applied to any newly-synced live model whose exact price we don't seed. Flash
 *  tier for text, Nano-Banana for image, native-TTS per-char, Lyria per-second. */
function defaultGeminiRate(task: "text" | "image" | "music" | "tts"): {
  input_rate: number | null;
  output_rate: number | null;
  unit_rate: number | null;
  unit_kind: "chars_1k" | "image" | "audio_sec" | null;
} {
  if (task === "text") return { input_rate: 27273, output_rate: 227273, unit_rate: null, unit_kind: null };
  if (task === "image") return { input_rate: null, output_rate: null, unit_rate: 3545, unit_kind: "image" };
  if (task === "tts") return { input_rate: null, output_rate: null, unit_rate: 1455, unit_kind: "chars_1k" };
  return { input_rate: null, output_rate: null, unit_rate: 121, unit_kind: "audio_sec" }; // music (Lyria)
}

/**
 * The admin "sync" button (models registry): fetch the live model list the
 * platform Gemini key can access, and upsert every generative model into
 * ai_models metered at Google's list price (neuron-equivalents) under the
 * standard markup. Existing rows keep their tuned rates + enabled flag (never
 * clobber an admin's edits); new rows come in enabled with the task's default
 * rate. Returns counts + a soft error if no key / the fetch failed (the caller
 * still reports the curated-catalog resync).
 */
export async function syncGeminiFromGoogle(env: Env): Promise<{ added: number; updated: number; error?: string }> {
  let live: GeminiCatalogEntry[];
  try {
    live = await fetchGeminiModels(env);
  } catch (e) {
    return { added: 0, updated: 0, error: e instanceof Error ? e.message : String(e) };
  }
  let added = 0;
  let updated = 0;
  for (const m of live) {
    const task = classifyGemini(m.id);
    if (!task) continue;
    const existing = await getModel(env.DB, m.id);
    const def = defaultGeminiRate(task);
    await upsertModel(env.DB, {
      id: m.id,
      label: m.displayName || m.id,
      task,
      cf_model: m.id,
      input_rate: existing?.input_rate ?? def.input_rate,
      output_rate: existing?.output_rate ?? def.output_rate,
      unit_rate: existing?.unit_rate ?? def.unit_rate,
      unit_kind: existing?.unit_kind ?? def.unit_kind,
      markup: existing?.markup ?? 3,
      // new models arrive enabled + sorted just after the curated Gemini block
      ...(existing ? {} : { enabled: 1, sort: 80 }),
    });
    existing ? updated++ : added++;
  }
  return { added, updated };
}

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
