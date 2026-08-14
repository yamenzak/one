/**
 * TYPOGRAPHY AS SIX ROLES, AND A SCREEN PICKS A ROLE RATHER THAN A SIZE.
 *
 * ⚠️ THE PROBLEM IS NOT THAT `text-2xl` IS WRONG. It is that one screen picks
 * `text-2xl`, the next picks `text-xl`, both are defensible, and a product
 * assembled from thirty such decisions has no typographic system at all —
 * nothing is broken, everything is slightly out of step, and no reviewer can
 * name the fault. Naming the ROLE moves the decision to one place, once.
 *
 * ⚠️ AND THE ROLES ARE ABOUT THE READER, NOT THE PAGE. `title` is what this
 * screen is; `section` is what this part of it is; `body` is prose; `label`
 * names a control; `note` is secondary; `figure` is a number meant to be read at
 * a glance. A seventh role is a decision somebody makes on purpose, in review.
 *
 * ⚠️ NOTHING HERE SETS A COLOUR EXCEPT THROUGH A TOKEN. `text-muted` is the
 * library's own; a literal would be a screen a workspace's branding does not
 * reach (D7).
 *
 * ⚠️ AND THESE GO ON OUR OWN ELEMENTS, NEVER ONTO A HEROUI COMPONENT.
 * `Card.Title` already knows what a card title looks like; putting a role class
 * on it is overriding the library, which the restyle guard refuses.
 */

export const TYPE = {
  /** What this screen is. One per screen, at the top. */
  title: "text-2xl font-semibold tracking-tight text-balance",
  /** What this part of the screen is. */
  section: "text-lg font-medium tracking-tight text-balance",
  /** Prose. `text-pretty` is what stops a two-line paragraph orphaning a word. */
  body: "text-base leading-relaxed text-pretty",
  /** Names a control or a value. Not a heading — it labels something beside it. */
  label: "text-sm font-medium",
  /** Secondary: a caption, a hint, a timestamp. Quieter, never smaller than 12px. */
  note: "text-sm text-muted",
  /**
   * ⚠️ A NUMBER MEANT TO BE COMPARED, WITH `tabular-nums`. Proportional digits
   * make a column of figures ripple, and the reader's eye does the arithmetic on
   * the ripple rather than on the values.
   */
  figure: "text-2xl font-semibold tabular-nums tracking-tight",
  /**
   * ⚠️ THE FRACTIONAL PART OF AN AMOUNT, RELATIVE TO ITS WHOLE. `€1,051.70` at
   * one size is a number; with a smaller `.70` it is a sum of money, because the
   * eye lands on the part that matters. `em` rather than a fixed size, so the
   * ratio holds wherever the figure is used — a fixed one would be right once.
   */
  minor: "text-[0.62em]",
} as const;

export type Role = keyof typeof TYPE;

export const ROLES = Object.keys(TYPE) as readonly Role[];

/** ⚠️ Placement is the caller's; the role is ours. They compose, they do not fight. */
export const text = (role: Role, layout = ""): string =>
  layout ? `${TYPE[role]} ${layout}` : TYPE[role];
