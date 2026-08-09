/**
 * THIS APP'S TONE REGISTRY — the accents the product codes information with.
 *
 * `@4dl/ui` owns surfaces, the brand primary and the five status tones. It may
 * not own a product's nouns: `cycle` means nothing to a coaching app and
 * `nutrition` means nothing to a sterile-supply one. That is the same rule that
 * keeps `METRICS` and `MACRO_KEYS` out of the package.
 *
 * ⚠️ **THE CLASS LITERALS BELOW ARE LOAD-BEARING AND MUST STAY LITERAL.**
 *
 * Tailwind emits a utility only if it finds the class name spelled out in a
 * scanned source. `@4dl/ui` builds `text-${tone}` and `bg-${tone}-soft` by
 * CONCATENATION at runtime, which the scanner cannot see. Without this file
 * those utilities are never generated: the component mounts, typechecks, and
 * renders grey. Nothing warns.
 *
 * Replace the two examples with the states the product sorts things into, and
 * keep the shape.
 */

import type { Tone } from "@4dl/ui";

/**
 * What each accent MEANS.
 *
 * Naming them after the product's own vocabulary is the point: a tone called
 * `cardio` in an app with no cardio is a colour with no argument behind it, and
 * the first person to reach for one picks by vibe.
 */
export const DOMAIN_TONES = {
  /** A person this tenant serves, and anything belonging to them. */
  subject: "subject",
  /** A thing the tenant produced, and its lifecycle. */
  record: "record",
} as const satisfies Record<string, Tone>;

export type DomainTone = keyof typeof DOMAIN_TONES;

/**
 * Every class Tailwind must emit, spelled out.
 *
 * `tokens.accents.test.ts` asserts this list covers every registered tone and
 * that each name appears LITERALLY in this file — so adding a tone without its
 * classes is a test failure rather than a grey chip.
 */
export const ACCENT_CLASSES: Record<DomainTone, { text: string; soft: string; fill: string }> = {
  subject: { text: "text-subject", soft: "bg-subject-soft text-subject", fill: "bg-subject text-subject-foreground" },
  record: { text: "text-record", soft: "bg-record-soft text-record", fill: "bg-record text-record-foreground" },
};

/**
 * The tones a surface in this app may use: the design system's five status
 * tones plus the product's own.
 *
 * ⚠️ Keep this list SHORT. Kova has eleven and each one had to earn its place
 * against the others in a CVD separation check; the failure mode of a long list
 * is not ugliness, it is two labels a colour-blind reader reads as one.
 */
export const ALLOWED_TONES: readonly Tone[] = [
  "primary",
  "success",
  "warning",
  "danger",
  "neutral",
  ...(Object.keys(DOMAIN_TONES) as DomainTone[]),
];
