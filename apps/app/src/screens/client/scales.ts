/**
 * The 1–5 wellness scales, in one place.
 *
 * Three surfaces render these — the check-in form (LogSheet), the check-in
 * detail sheet, and the Wellness history rows — and before this file they each
 * had their own idea of what a 4 meant. Two of them just printed "4/5", which
 * is only readable if you already know which end is the good one.
 *
 * `stress` is the one that runs the other way: the domain scores 5 as the WORST
 * (`wellness.ts` uses `6 - avgStress`, `progress.ts` subtracts `stress - 3`).
 * Any surface that renders it with an ascending glyph set, an ascending bar, or
 * a positive tone is telling the opposite of the truth — so the direction lives
 * here, beside the words, rather than being re-guessed at each call site.
 */

export type ScaleKey = "mood" | "energy" | "sleepQ" | "stress";

export interface Scale {
  /** What each step means, index 0 = value 1. */
  readonly words: readonly [string, string, string, string, string];
  /** The endpoint captions printed under the control. */
  readonly low: string;
  readonly high: string;
  /** True when 5 is the bad end — stress, and nothing else today. */
  readonly inverted?: boolean;
}

export const SCALES: Record<ScaleKey, Scale> = {
  mood: { words: ["Awful", "Low", "OK", "Good", "Great"], low: "Awful", high: "Great" },
  energy: { words: ["Drained", "Flat", "OK", "Good", "Buzzing"], low: "Drained", high: "Buzzing" },
  sleepQ: { words: ["Terrible", "Poor", "OK", "Good", "Great"], low: "Terrible", high: "Great" },
  stress: { words: ["Calm", "Fine", "Some", "Tense", "Overwhelmed"], low: "Calm", high: "Overwhelmed", inverted: true },
};

/** The word for a stored 1–5, or a plain fallback if it is out of range. */
export function scaleWord(key: ScaleKey, value: number): string {
  return SCALES[key].words[value - 1] ?? `${value}/5`;
}
