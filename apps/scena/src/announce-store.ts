/**
 * Queue announcement config + clip generation (§boards).
 *
 * A board's announce settings live in its `config_json` (no new table). A call
 * is spoken as ONE natural utterance: the template + slot values compose a plain
 * sentence, generated once by Gemini native TTS and content-cached (so a repeat
 * number is instant + free), and the player plays a single MP3 — no stitching,
 * no per-character gaps. The old per-character voice-pack dictionary is retired.
 */

import type { Env } from "./env.js";
import { getBoard } from "./board-store.js";
import { generate } from "./ai.js";
import { ensureBilling, getConfigValue } from "./billing-store.js";
import {
  composePlain,
  defaultVoiceFor,
  isGeminiVoice,
  DEFAULT_ANNOUNCE,
  TTS_LANGUAGES,
  type AnnounceConfig,
  type AnnounceSlot,
} from "@scena/protocol";

/** Announcements run on Gemini native TTS (one platform Gemini key). An admin
 *  can override `announce.model` to another Gemini TTS model via app_config. */
const DEFAULT_ANNOUNCE_MODEL = "gemini-2.5-flash-tts";

const str = (v: unknown, f = ""): string => (typeof v === "string" ? v : v == null ? f : String(v));
const num = (v: unknown, f: number): number => (typeof v === "number" && Number.isFinite(v) ? v : f);

/** Map a legacy 2-letter language to a BCP-47 code (old config → new). */
function legacyLang(lang: string): string {
  const map: Record<string, string> = { en: "en-US", de: "de-DE", es: "es-ES", fr: "fr-FR", it: "it-IT", nl: "nl-NL", pt: "pt-PT", tr: "tr-TR", ar: "ar-XA" };
  return map[lang] ?? "";
}

interface StoredAnnounce { config?: Partial<AnnounceConfig> & { language?: string } }

function parseConfig(board: { config_json: string }): AnnounceConfig {
  let raw: { announce?: StoredAnnounce } = {};
  try {
    raw = JSON.parse(board.config_json) as { announce?: StoredAnnounce };
  } catch {
    /* default */
  }
  const a = raw.announce?.config ?? {};
  const languageCode = str(a.languageCode) || legacyLang(str(a.language)) || DEFAULT_ANNOUNCE.languageCode;
  // Announcements now run on Gemini TTS (language-agnostic prebuilt voices), so
  // any legacy Cloud/Aura voice name migrates to the default Gemini persona.
  let voice = str(a.voice);
  if (!isGeminiVoice(voice)) voice = defaultVoiceFor(languageCode);
  return {
    mode: a.mode === "chime" || a.mode === "voice" ? a.mode : "silent",
    template: str(a.template) || DEFAULT_ANNOUNCE.template,
    languageCode,
    voice,
    rate: Math.min(1.5, Math.max(0.5, num(a.rate, 1))),
    volumeDb: Math.min(16, Math.max(-16, num(a.volumeDb, 0))),
    repeat: Math.min(3, Math.max(1, Math.round(num(a.repeat, 1)))),
  };
}

export async function readAnnounce(db: D1Database, boardId: string): Promise<{ config: AnnounceConfig; languages: typeof TTS_LANGUAGES } | null> {
  const board = await getBoard(db, boardId);
  if (!board) return null;
  return { config: parseConfig(board), languages: TTS_LANGUAGES };
}

export async function setAnnounceConfig(db: D1Database, boardId: string, patch: Partial<AnnounceConfig>): Promise<void> {
  const board = await getBoard(db, boardId);
  if (!board) return;
  let cfg: Record<string, unknown> = {};
  try {
    cfg = JSON.parse(board.config_json) as Record<string, unknown>;
  } catch {
    /* start fresh */
  }
  const prev = parseConfig(board);
  // If the language changed but the voice wasn't explicitly set, move the voice
  // to that language's default so they never mismatch.
  const next: AnnounceConfig = { ...prev, ...patch };
  if (patch.languageCode && !patch.voice && !next.voice.startsWith(patch.languageCode)) {
    next.voice = defaultVoiceFor(patch.languageCode);
  }
  cfg.announce = { config: next };
  await db.prepare("UPDATE boards SET config_json = ? WHERE id = ?").bind(JSON.stringify(cfg), boardId).run();
}

/** Generate (or serve cached) the spoken clip for a concrete call. Returns the
 *  asset URL. `values` are the resolved ticket/counter strings. */
export async function announceClip(
  env: Env,
  board: { id: string; tenant_id: string; config_json: string },
  values: Partial<Record<AnnounceSlot, string>>,
): Promise<{ ok: boolean; url?: string; credits?: number; cached?: boolean; error?: string; detail?: string }> {
  const config = parseConfig(board);
  await ensureBilling(env.DB); // guarantees the seeded model rows exist
  const spoken = [values.ticket, values.counter].filter(Boolean).join(" → ");
  const libraryName = `Queue call${spoken ? ` — ${spoken}` : ""}`;
  const model = (await getConfigValue(env.DB, "announce.model")) || DEFAULT_ANNOUNCE_MODEL;

  // Gemini native TTS: plain text, prompt-steered delivery, a Gemini prebuilt
  // voice — runs on the platform Gemini key.
  const langLabel = TTS_LANGUAGES.find((l) => l.code === config.languageCode)?.label ?? config.languageCode;
  const pace = config.rate <= 0.9 ? ", a little slowly" : config.rate >= 1.15 ? ", briskly" : "";
  const plain = composePlain(config.template, values);
  // A leading instruction steers Gemini's delivery without being spoken (same
  // technique as the ad voice); only the sentence after it is read.
  const prompt = `Read this aloud as a clear, calm public queue announcement${pace}, in ${langLabel}. Pronounce every letter and number distinctly. Say exactly this and nothing else:\n${plain}`;

  const r = await generate(env, { task: "tts", modelId: model, prompt, options: { voice: config.voice, libraryName }, tenantId: board.tenant_id });
  if (!r.ok) return { ok: false, error: r.error, detail: r.detail };
  return { ok: true, url: r.assetUrl, credits: r.credits, cached: r.cached };
}
