/**
 * Gemini native TTS voices + ad style presets for the Ads voice generator.
 */

/* ------------------------- Gemini native TTS (ads) ------------------------ */

/**
 * Gemini's native TTS is prompt-steerable — you *direct* the read in plain
 * language and pick one of its expressive prebuilt voices. Ad audio uses this
 * (far more natural than a plain engine), billed as a BYO-key service fee.
 */

export interface GeminiVoice {
  id: string; // Gemini prebuilt voice name (options.voice → prebuiltVoiceConfig.voiceName)
  label: string;
  vibe: string;
}

/** A curated subset of Gemini's 30 prebuilt voices, labelled for a signage ad. */
export const GEMINI_VOICES: GeminiVoice[] = [
  { id: "Kore", label: "Warm host", vibe: "Balanced, friendly — the classic radio warmth" },
  { id: "Aoede", label: "Bright & breezy", vibe: "Light, upbeat, easy energy" },
  { id: "Leda", label: "Youthful", vibe: "Fresh, lively female" },
  { id: "Callirrhoe", label: "Easy-going", vibe: "Relaxed, natural female" },
  { id: "Autonoe", label: "Polished", vibe: "Clear, professional female" },
  { id: "Charon", label: "Deep announcer", vibe: "Low, authoritative — big promo energy" },
  { id: "Fenrir", label: "Bold (m)", vibe: "Punchy, excitable male" },
  { id: "Orus", label: "Confident (m)", vibe: "Assured, presentational male" },
  { id: "Puck", label: "Upbeat (m)", vibe: "Bright, characterful male" },
  { id: "Enceladus", label: "Soft-spoken (m)", vibe: "Gentle, breathy male — calm reads" },
  { id: "Iapetus", label: "Natural (m)", vibe: "Conversational, approachable male" },
  { id: "Sulafat", label: "Rich & smooth", vibe: "Warm, rounded female — premium feel" },
];

export const DEFAULT_GEMINI_VOICE = "Kore";

export interface AdStyle {
  id: string;
  label: string;
  hint: string;
  /** The natural-language delivery direction prepended to the copy. Empty = plain. */
  instruction: string;
}

/**
 * "System context" style presets — the radio-spot vibe an ad is read in. Gemini
 * TTS performs the copy in this style, so the same script can sound like a
 * vintage AM radio spot, a hype sale promo, or a calm spa ad.
 */
export const AD_STYLE_PRESETS: AdStyle[] = [
  { id: "natural", label: "Clean & natural", hint: "Straightforward, no styling", instruction: "" },
  { id: "radio_dj", label: "Radio DJ", hint: "Smooth FM broadcast warmth", instruction: "Read this advertisement like a smooth, confident FM radio DJ — warm, upbeat, with broadcast cadence and easy charm" },
  { id: "vintage_am", label: "Vintage AM radio", hint: "1950s mid-century announcer", instruction: "Read this like a bright, punchy 1950s AM radio announcer — mid-century advertising cadence, crisp and enthusiastic, an old-time-radio spot feel" },
  { id: "hype", label: "Hype promo", hint: "High-energy sale voice", instruction: "Read this like a high-energy sale promo announcer — fast, exciting, building to a big enthusiastic finish" },
  { id: "trailer", label: "Movie trailer", hint: "Deep, dramatic voiceover", instruction: "Read this like an epic movie-trailer voiceover — deep, dramatic, slow and weighty, with cinematic gravitas" },
  { id: "luxury", label: "Luxury brand", hint: "Refined and unhurried", instruction: "Read this in a calm, refined, premium tone — unhurried, elegant, and understated, like a high-end luxury brand ad" },
  { id: "spa", label: "Spa & calm", hint: "Soft, soothing wellness", instruction: "Read this softly and slowly, soothing and gentle, with a relaxed wellness-spa warmth" },
  { id: "sports", label: "Sports PA", hint: "Bold stadium announcer", instruction: "Read this like a booming stadium PA announcer — bold, rousing, and energetic" },
  { id: "friendly", label: "Friendly local", hint: "Casual neighbourhood shop", instruction: "Read this like a friendly local shop owner — casual, warm, and genuine, chatting to a neighbour" },
  { id: "news", label: "News brief", hint: "Crisp, neutral anchor", instruction: "Read this like a crisp, professional news anchor — clear, neutral, and authoritative" },
];

export const DEFAULT_AD_STYLE = "radio_dj";

/** Compose the final Gemini-TTS prompt: a style direction, then the copy. */
export function composeAdSpeech(styleId: string, text: string): string {
  const style = AD_STYLE_PRESETS.find((s) => s.id === styleId) ?? AD_STYLE_PRESETS[0]!;
  const copy = text.trim();
  return style.instruction ? `${style.instruction}:\n\n${copy}` : copy;
}
