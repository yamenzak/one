/**
 * TESSA'S TONE REGISTRY — the accents this product codes information with.
 *
 * `@4dl/ui` owns surfaces, the brand primary and the four status tones. It may
 * not own `cycle` or `soiled`, because a coaching app has neither — the same
 * rule that moved Kova's eleven accents out of the package.
 *
 * ⚠️ **The class literals below are load-bearing and must stay literal.**
 *
 * Tailwind emits a utility only if it finds the class name spelled out in a
 * scanned source. `@4dl/ui` builds `text-${tone}` and `bg-${tone}-soft` by
 * CONCATENATION at runtime, which the scanner cannot see. Without this file
 * those utilities are never generated: the component mounts, typechecks, and
 * renders grey. Nothing warns.
 *
 * That is not hypothetical here — it is what Tessa was already doing with
 * `cardio`, `nutrition`, `activity` and `sleep`, which it borrowed from Kova and
 * never defined.
 */

import type { Tone } from "@4dl/ui";

/**
 * What each accent MEANS. Naming them after the centre's own stages is the
 * point: a tone called `cardio` in a sterile-supply app is a colour with no
 * argument behind it, and the first person to reach for one picks by vibe.
 */
export const DOMAIN_TONES = {
  /**
   * A load in the machine, and everything downstream of it — a cycle, a pack
   * awaiting release, the Freigabe itself.
   */
  cycle: "cycle",
  /** A procedure: a case, and what it consumed. */
  case: "case",
  /** The dirty side — used instruments, the return pool, anything awaiting reprocessing. */
  soiled: "soiled",
} as const satisfies Record<string, Tone>;

export type DomainTone = keyof typeof DOMAIN_TONES;

/**
 * Every class Tailwind must emit, spelled out.
 *
 * `tokens.accents.test.ts` asserts this list covers every registered tone and
 * that each name appears literally in this file — so adding a tone without its
 * classes is a test failure rather than a grey chip.
 */
export const ACCENT_CLASSES: Record<DomainTone, { text: string; soft: string }> = {
  cycle: { text: "text-cycle", soft: "bg-cycle-soft text-cycle" },
  case: { text: "text-case", soft: "bg-case-soft text-case" },
  soiled: { text: "text-soiled", soft: "bg-soiled-soft text-soiled" },
};

/**
 * The tones a Tessa surface may use: the design system's four status tones plus
 * this app's three.
 *
 * `sterile` is deliberately absent — sterile supply is what the product IS, so
 * it wears the brand `primary` rather than a fourth accent nobody would be able
 * to tell from it.
 */
export const ALLOWED_TONES: readonly Tone[] = [
  "primary",
  "success",
  "warning",
  "danger",
  "neutral",
  ...(Object.keys(DOMAIN_TONES) as DomainTone[]),
];
