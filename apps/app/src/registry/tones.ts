/**
 * KOVA'S ACCENT TONES — the eleven colours this product codes information with.
 *
 * `@4dl/ui` owns the five status tones (success / warning / danger / primary /
 * neutral) and resolves anything else by convention: tone `foo` becomes
 * `text-foo`, `bg-foo-soft text-foo`, `var(--foo)`. A warehouse app has no
 * `nutrition` tone and no `protein`, so these are ours.
 *
 * ⚠️ **The class literals below are load-bearing and must stay literal.**
 * Tailwind generates a utility only if it SEES the class name in scanned
 * source. `@4dl/ui` builds `text-${tone}` by concatenation at runtime, which a
 * scanner cannot follow — so without this file `toneText.nutrition` would
 * resolve to a class that Tailwind never emitted, and the colour would silently
 * be missing. Do not "simplify" this into a loop or a template string.
 *
 * The token VALUES live in `../tokens.accents.css`; the derivation that tints
 * them toward a studio's brand is `MACRO_SPEC` at the bottom.
 */

import type { Tone } from "@4dl/ui";

/** The macro tones, in the order they are always presented. */
export const MACRO_TONES = ["calories", "protein", "carbs", "fat"] as const;

/** The domain tones — one per surface a client's data belongs to. */
export const DOMAIN_TONES = ["activity", "nutrition", "sleep", "cardio", "hydration", "supplement", "lab"] as const;

export type MacroTone = (typeof MACRO_TONES)[number];
export type DomainTone = (typeof DOMAIN_TONES)[number];
export type KovaTone = MacroTone | DomainTone;

/**
 * Every accent class, spelled out so Tailwind emits them.
 *
 * Referenced by `tones.conformance.test.ts`, which fails if a tone is added to
 * the lists above without its classes appearing here — the exact mistake that
 * would otherwise ship as "the new chip is grey".
 */
export const ACCENT_CLASSES: Record<KovaTone, { text: string; soft: string }> = {
  calories: { text: "text-calories", soft: "bg-calories-soft text-calories" },
  protein: { text: "text-protein", soft: "bg-protein-soft text-protein" },
  carbs: { text: "text-carbs", soft: "bg-carbs-soft text-carbs" },
  fat: { text: "text-fat", soft: "bg-fat-soft text-fat" },
  activity: { text: "text-activity", soft: "bg-activity-soft text-activity" },
  nutrition: { text: "text-nutrition", soft: "bg-nutrition-soft text-nutrition" },
  sleep: { text: "text-sleep", soft: "bg-sleep-soft text-sleep" },
  cardio: { text: "text-cardio", soft: "bg-cardio-soft text-cardio" },
  hydration: { text: "text-hydration", soft: "bg-hydration-soft text-hydration" },
  supplement: { text: "text-supplement", soft: "bg-supplement-soft text-supplement" },
  lab: { text: "text-lab", soft: "bg-lab-soft text-lab" },
};

/** The accent groups the advanced theme editor shows, appended to the base
 *  groups `@4dl/ui` ships (surfaces, brand & UI, status). */
export const KOVA_TOKEN_GROUPS: { label: string; tokens: string[] }[] = [
  { label: "Macros", tokens: MACRO_TONES.flatMap((t) => [t, `${t}-soft`]) },
  { label: "Domain accents", tokens: DOMAIN_TONES.flatMap((t) => [t, `${t}-soft`]) },
];

/**
 * Canonical macro hues, nudged toward the studio's brand so they read as one
 * palette while staying distinct from each other.
 *
 * `lL` (light-mode lightness) is kept dark enough that macro-coloured text and
 * icons clear WCAG AA on their pale `-soft` tint; `dL` (dark mode) stays bright.
 */
export const MACRO_SPEC: { name: string; hue: number; c: number; dL: number; lL: number }[] = [
  { name: "calories", hue: 45, c: 0.16, dL: 0.78, lL: 0.53 },
  { name: "protein", hue: 350, c: 0.16, dL: 0.72, lL: 0.535 },
  { name: "carbs", hue: 90, c: 0.15, dL: 0.82, lL: 0.53 },
  { name: "fat", hue: 275, c: 0.14, dL: 0.7, lL: 0.53 },
];


/**
 * The shipped VALUES for the accents above — editor placeholders and swatch
 * defaults, merged onto `@4dl/ui`'s `DEFAULT_TOKENS`.
 *
 * A mirror of `../tokens.accents.css`. Two copies of the same numbers, and the
 * duplication is deliberate: the CSS is what the browser PAINTS, this is what
 * the editor shows in an empty field. Deriving one from the other would mean
 * parsing a stylesheet at runtime to render a colour picker.
 *
 * ⚠️ Which is why `tokens.accents.test.ts` asserts they are identical. When
 * these were `DEFAULT_TOKENS` inside `@4dl/ui`, nothing did — and every
 * light-mode accent had drifted: the stylesheet was darkened so tone-coloured
 * text clears WCAG AA on its own pale tint, and this list was not. The editor
 * showed a lighter swatch than the app painted, and a studio "restoring the
 * default" by typing the value it displayed would have set a colour that fails
 * AA. Values below are generated FROM the stylesheet.
 */
export const DEFAULT_ACCENT_TOKENS: { dark: Record<string, string>; light: Record<string, string> } = {
  dark: {
    "--calories": "oklch(0.78 0.16 45)", "--calories-soft": "oklch(0.35 0.07 45)",
    "--protein": "oklch(0.72 0.16 350)", "--protein-soft": "oklch(0.34 0.07 350)",
    "--carbs": "oklch(0.82 0.15 90)", "--carbs-soft": "oklch(0.36 0.06 90)",
    "--fat": "oklch(0.715 0.14 275)", "--fat-soft": "oklch(0.34 0.06 275)",
    "--activity": "oklch(0.78 0.13 164)", "--activity-soft": "oklch(0.34 0.06 164)",
    "--nutrition": "oklch(0.8 0.13 68)", "--nutrition-soft": "oklch(0.36 0.06 68)",
    "--sleep": "oklch(0.74 0.12 300)", "--sleep-soft": "oklch(0.34 0.06 300)",
    "--cardio": "oklch(0.74 0.13 250)", "--cardio-soft": "oklch(0.34 0.06 250)",
    "--hydration": "oklch(0.78 0.1 214)", "--hydration-soft": "oklch(0.34 0.05 214)",
    "--supplement": "oklch(0.77 0.11 190)", "--supplement-soft": "oklch(0.34 0.05 190)",
    "--lab": "oklch(0.74 0.14 322)", "--lab-soft": "oklch(0.34 0.06 322)",
  },
  light: {
    "--calories": "oklch(0.525 0.16 45)", "--calories-soft": "oklch(0.94 0.06 45)",
    "--protein": "oklch(0.535 0.17 350)", "--protein-soft": "oklch(0.94 0.05 350)",
    "--carbs": "oklch(0.53 0.15 90)", "--carbs-soft": "oklch(0.95 0.07 90)",
    "--fat": "oklch(0.53 0.17 275)", "--fat-soft": "oklch(0.94 0.05 275)",
    "--activity": "oklch(0.49 0.14 164)", "--activity-soft": "oklch(0.93 0.05 164)",
    "--nutrition": "oklch(0.525 0.15 62)", "--nutrition-soft": "oklch(0.94 0.06 68)",
    "--sleep": "oklch(0.535 0.16 300)", "--sleep-soft": "oklch(0.94 0.05 300)",
    "--cardio": "oklch(0.52 0.17 250)", "--cardio-soft": "oklch(0.94 0.05 250)",
    "--hydration": "oklch(0.5 0.13 214)", "--hydration-soft": "oklch(0.94 0.05 214)",
    "--supplement": "oklch(0.5 0.11 190)", "--supplement-soft": "oklch(0.93 0.05 190)",
    "--lab": "oklch(0.535 0.16 322)", "--lab-soft": "oklch(0.94 0.05 322)",
  },
};

/** Narrowing helper for anywhere a `Tone` is stored as free text. */
export const isKovaTone = (t: Tone): t is KovaTone => t in ACCENT_CLASSES;
