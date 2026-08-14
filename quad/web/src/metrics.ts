/**
 * EVERY MEASUREMENT IN THE SYSTEM, IN ONE FILE.
 *
 * ⚠️ THIS EXISTS BECAUSE THE VOCABULARY DRIFTED THE MOMENT IT HAD MORE THAN
 * THREE COMPONENTS. A `SPACE` scale was written for the layout and then not used
 * INSIDE the rows, so one row padded itself `py-1`, the next `py-2` and the next
 * `py-3` — each defensible, and the result a list with no rhythm at all. Nobody
 * can point at which one is wrong, which is the definition of drift.
 *
 * ⚠️ SO NOTHING OUTSIDE THIS FILE WRITES A SPACING UTILITY, and a guard says so.
 * A component asks for a named metric; if it needs one that is not here, the
 * answer is to add it here — in review, once — rather than to pick a number in
 * the file that needed it.
 *
 * ⚠️ AND THE TOUCH TARGET IS THE NON-NEGOTIABLE ONE. 44px is the floor below
 * which a control is measurably harder to hit, and it is a floor on a MOUSE too:
 * a 32px row is a row people miss on a laptop, not just on a phone. Every
 * pressable thing here is at least `ROW.tap`.
 */

/* ------------------------------------------------------------------- rows --- */

export const ROW = {
  /**
   * ⚠️ 56px, NOT 44. 44 is the accessibility floor; 56 is what a list of them
   * reads as — comfortable rather than merely legal — and it is what leaves room
   * for a two-line row without the second line changing the row's height.
   */
  tap: "min-h-14",
  /** A row that is not pressable: a field, a note, a step. */
  still: "min-h-12",
  /** ⚠️ ONE value, on every row. This is the whole rhythm. */
  pad: "py-3",
  /** Between the lead glyph and the body. */
  gap: "gap-3",
} as const;

/**
 * ⚠️ THE LEAD IS A FIXED BOX, NOT A GLYPH. Icons have different widths; letting
 * each set its own makes the text column ragged down the whole list, which is
 * the single most visible sign of a hand-built list. A box means every label
 * starts at the same x, whatever is in it.
 */
export const LEAD = "flex size-6 shrink-0 items-center justify-center" as const;

/* ------------------------------------------------------------------ stacks --- */

/**
 * ⚠️ FOUR GAPS, AND THEY ARE A RATIO RATHER THAN A LIST. 8 / 12 / 24 / 40 —
 * each step is far enough from the last that "which one is this" is never a
 * question. A scale with 16 and 20 in it is a scale where every choice is
 * arguable.
 */
export const SPACE = {
  tight: "gap-2",
  snug: "gap-3",
  roomy: "gap-6",
  airy: "gap-10",
} as const;

export type Space = keyof typeof SPACE;

/**
 * ⚠️ A BLOCK'S OWN INSET. Absent from the first version of this file, which is
 * precisely why nine components invented one — and one of them chose `gap-4`, a
 * step that is not in the scale at all. A missing metric is not a smaller
 * problem than a wrong one: it guarantees everybody picks separately.
 */
export const PAD = "p-4" as const;

/** Between a section's heading and the card under it. */
export const HEAD_GAP = "gap-2" as const;

/** The page gutter. Wider on a desktop because the column is not the screen. */
export const GUTTER = "px-4 md:px-6" as const;

/** Above and below a band's content. */
export const BAND_PAD = "py-6" as const;

/* -------------------------------------------------------------- the chrome --- */

/**
 * ⚠️ ROOM FOR THE NAV, RESERVED BY THE PAGE. A sticky island floats over
 * whatever precedes it, so the last card on every screen was cropped under the
 * nav — on both specimens, in the first render anybody looked at. The island
 * cannot fix this itself: by the time it is laid out, the content above it has
 * already been sized.
 */
export const NAV_SPACE = "pb-28" as const;

/** The same problem, for a screen whose one action is pinned instead. */
export const ACTION_SPACE = "pb-24" as const;

/**
 * ⚠️ THE SAFE AREA IS NOT OPTIONAL AND NOT A DETAIL. Without it a pinned control
 * sits under the home indicator on every modern phone — reachable, with the
 * gesture bar over it, which reads as a layout nobody tested.
 */
export const SAFE_BOTTOM = "pb-[max(0.75rem,env(safe-area-inset-bottom))]" as const;

/* ------------------------------------------------------------------ widths --- */

/**
 * ⚠️ TWO, NOT FIVE. `read` is prose and forms — near 65 characters, which is
 * where reading speed peaks. `work` is anything with columns. A scale nobody can
 * hold in their head is a scale people opt out of.
 */
export const WIDTH = {
  read: "max-w-2xl",
  work: "max-w-6xl",
} as const;

export type Width = keyof typeof WIDTH;
