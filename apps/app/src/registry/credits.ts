/**
 * WHAT A CREDIT MOVEMENT LOOKS LIKE — one glyph and one colour per kind.
 *
 * The wire already carries the words: `apps/api/src/credit-reasons.ts` turns a
 * stored reason into `{ label, kind }`, because the AI half of the reason set
 * is `ai.<feature>` over a registry only the worker holds and a second copy of
 * those labels here would drift on the first rename. What the server does NOT
 * decide is what the row looks like — that is this file.
 *
 * Kinds are deliberately COARSE. There are twenty-three AI features and they
 * share four verbs (write, read a photo, draw, speak); a ledger where every row
 * showed one glyph would be texture rather than identity (UI-LANGUAGE §7), and
 * one with twenty-three glyphs would be noise. Four is the number that tells
 * you something at a glance.
 *
 * None of them is a sparkle, on purpose — `@4dl/ui` refuses to re-export
 * `Sparkles` precisely because "something happens here" is not a thing. These
 * name the verb: a pencil writes, a scan reads, a frame draws.
 */

import { PencilLine, ScanLine, ImageIcon, AudioLines, Mail, Coins, Gift, SlidersHorizontal, RotateCcw, Zap, type LucideIcon, type Tone } from "@4dl/ui";

/** The closed set the API's `kind` field ranges over. Keep in step with `CreditKind`. */
export type CreditKind =
  | "ai-text" | "ai-vision" | "ai-image" | "ai-speech"
  | "email" | "pack" | "grant" | "adjust" | "refund" | "other";

export interface CreditKindSpec {
  /** Plural heading, for the breakdown. The per-ROW words come from the wire. */
  label: string;
  icon: LucideIcon;
  tone: Tone;
}

export const CREDIT_KINDS: Record<CreditKind, CreditKindSpec> = {
  "ai-text": { label: "Writing & analysis", icon: PencilLine, tone: "primary" },
  "ai-vision": { label: "Reading photos", icon: ScanLine, tone: "lab" },
  "ai-image": { label: "Image generation", icon: ImageIcon, tone: "cardio" },
  "ai-speech": { label: "Voice", icon: AudioLines, tone: "sleep" },
  email: { label: "Email", icon: Mail, tone: "hydration" },
  pack: { label: "Credit packs", icon: Coins, tone: "success" },
  grant: { label: "Plan credits", icon: Gift, tone: "activity" },
  adjust: { label: "Adjustments", icon: SlidersHorizontal, tone: "neutral" },
  refund: { label: "Refunds", icon: RotateCcw, tone: "warning" },
  other: { label: "Other", icon: Zap, tone: "neutral" },
};

/**
 * Resolve a kind off the wire.
 *
 * An unrecognised kind falls back to `other` rather than throwing: the server
 * is free to add one before the app that renders it has shipped, and a new
 * spend category must never be able to blank the screen an owner opened to
 * account for their spend.
 */
export function creditKind(kind: string): CreditKindSpec {
  return CREDIT_KINDS[kind as CreditKind] ?? CREDIT_KINDS.other;
}
