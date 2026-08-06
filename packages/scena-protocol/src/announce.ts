/**
 * Queue announcement engine (§boards) — Gemini native TTS.
 *
 * A board's spoken call is a template with `{ticket}` / `{counter}` slots. The
 * whole sentence is spoken as **one natural utterance** — no per-character
 * stitching — via Gemini's native TTS, prompt-steered so a ticket reads
 * correctly ("A42" → "A forty-two"). This module is the pure, shared part: the
 * config shape, the language + prebuilt-voice catalog, and the plain-text
 * composer. The clip is generated + content-cached server-side; the player
 * plays a single MP3.
 */

export type AnnounceMode = "silent" | "chime" | "voice";

export interface AnnounceConfig {
  mode: AnnounceMode;
  /** Template with {ticket} / {counter} slots, in the spoken language. */
  template: string;
  /** BCP-47 language, e.g. "de-DE", "en-US". Sets the spoken language. */
  languageCode: string;
  /** Gemini prebuilt voice name, e.g. "Kore". */
  voice: string;
  /** Speaking rate 0.5–1.5 (1 = normal). */
  rate: number;
  /** Volume trim in dB, -16…16 (0 = normal). */
  volumeDb: number;
  /** How many times to speak the call (1–3). */
  repeat: number;
}

export const DEFAULT_ANNOUNCE: AnnounceConfig = {
  mode: "silent",
  template: "Ticket {ticket}, please proceed to counter {counter}.",
  languageCode: "en-US",
  voice: "Kore",
  rate: 1,
  volumeDb: 0,
  repeat: 1,
};

export const ANNOUNCE_SLOTS = ["ticket", "counter"] as const;
export type AnnounceSlot = (typeof ANNOUNCE_SLOTS)[number];

/* ------------------------------ voice catalog ----------------------------- */

export interface TtsVoice { id: string; label: string; gender: "male" | "female" }
export interface TtsLanguage { code: string; label: string }

/** Supported spoken languages for queue announcements. Gemini's prebuilt voices
 *  are language-agnostic, so the operator picks a language here and a persona
 *  (GEMINI_TTS_VOICES) independently. */
export const TTS_LANGUAGES: TtsLanguage[] = [
  { code: "de-DE", label: "Deutsch" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "es-ES", label: "Español" },
  { code: "fr-FR", label: "Français" },
  { code: "it-IT", label: "Italiano" },
  { code: "nl-NL", label: "Nederlands" },
  { code: "pt-PT", label: "Português" },
  { code: "tr-TR", label: "Türkçe" },
  { code: "ar-XA", label: "العربية" },
];

/**
 * Gemini native TTS prebuilt voices — language-agnostic (each speaks every
 * supported language), so the operator picks a persona and a language
 * independently. These ids are exactly Gemini's prebuiltVoiceConfig voice names.
 */
export const GEMINI_TTS_VOICES: TtsVoice[] = [
  { id: "Kore", label: "Kore — firm", gender: "female" },
  { id: "Aoede", label: "Aoede — breezy", gender: "female" },
  { id: "Leda", label: "Leda — youthful", gender: "female" },
  { id: "Callirrhoe", label: "Callirrhoe — easy-going", gender: "female" },
  { id: "Autonoe", label: "Autonoe — bright", gender: "female" },
  { id: "Charon", label: "Charon — informative", gender: "male" },
  { id: "Puck", label: "Puck — upbeat", gender: "male" },
  { id: "Orus", label: "Orus — firm", gender: "male" },
  { id: "Fenrir", label: "Fenrir — excitable", gender: "male" },
  { id: "Enceladus", label: "Enceladus — soft", gender: "male" },
];

const GEMINI_VOICE_IDS = new Set(GEMINI_TTS_VOICES.map((v) => v.id));

/** True when `voice` is a valid Gemini prebuilt voice (vs. a legacy Cloud name). */
export function isGeminiVoice(voice: string): boolean {
  return GEMINI_VOICE_IDS.has(voice);
}

/** The default announcement voice (a Gemini prebuilt persona). */
export function defaultVoiceFor(_languageCode?: string): string {
  return DEFAULT_ANNOUNCE.voice;
}

/* ------------------------------ SSML compose ------------------------------ */

/**
 * Split a template into carrier `parts` and the `slots` between them, so
 * `parts.length === slots.length + 1`. Unknown `{...}` are literal text.
 */
export function templateSplit(template: string): { parts: string[]; slots: AnnounceSlot[] } {
  const parts: string[] = [];
  const slots: AnnounceSlot[] = [];
  const re = /\{(ticket|counter)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    parts.push(template.slice(last, m.index));
    slots.push(m[1] as AnnounceSlot);
    last = m.index + m[0].length;
  }
  parts.push(template.slice(last));
  return { parts, slots };
}

/** A slot value as plain text with letter/digit runs spaced ("A42" → "A 42"),
 *  so a natural-language TTS (Gemini) reads it as "A forty-two". No SSML. */
export function valuePlain(value: string): string {
  const runs = String(value).match(/[A-Za-z]+|[0-9]+|[^A-Za-z0-9]+/g) ?? [];
  return runs.map((r) => r.trim()).filter(Boolean).join(" ");
}

/** Compose the spoken sentence as plain text (for Gemini TTS, which reads
 *  numbers/letters naturally and takes no SSML). */
export function composePlain(template: string, values: Partial<Record<AnnounceSlot, string>>): string {
  const { parts, slots } = templateSplit(template);
  let body = "";
  for (let i = 0; i < parts.length; i++) {
    body += parts[i]!;
    if (i < slots.length) {
      const raw = values[slots[i]!];
      if (raw != null && raw !== "") body += ` ${valuePlain(raw)} `;
    }
  }
  return body.replace(/\s+/g, " ").trim();
}
