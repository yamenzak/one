/**
 * TYPOGRAPHY AS SEVEN ROLES AND ONE FACE, AND A SCREEN PICKS A ROLE RATHER THAN
 * A SIZE.
 *
 * ⚠️ THE PROBLEM IS NOT THAT `text-2xl` IS WRONG. It is that one screen picks
 * `text-2xl`, the next picks `text-xl`, both are defensible, and a product
 * assembled from thirty such decisions has no typographic system at all —
 * nothing is broken, everything is slightly out of step, and no reviewer can
 * name the fault. Naming the ROLE moves the decision to one place, once.
 *
 * ⚠️ AND THE ROLES ARE ABOUT THE READER, NOT THE PAGE. `display` is the one
 * thing a screen exists to show; `title` is what this screen is; `section` is
 * what this part of it is; `body` is prose; `label` names a control; `note` is
 * secondary; `figure` is a number in a row or a stat. An eighth is a decision
 * somebody makes on purpose, in review.
 *
 * ⚠️ THE SCALE HAD NO TOP, AND THAT WAS THE WHOLE PROBLEM WITH IT. `title` and
 * `figure` were both 24px, so the number a whole screen was built around came
 * out the same size as the heading above it — every hero read as a slightly
 * larger caption. A hero figure is 40px and lands near 48 on a desktop, at 700
 * with the tracking pulled in: at that size the default letter-spacing is
 * visibly loose, and loose tracking on a large figure is most of what separates
 * a considered screen from a scaled-up one.
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
  /**
   * ⚠️ THE ONE THING A SCREEN EXISTS TO SHOW. A balance, a score, a count — never
   * a heading, and never twice on a screen. If two things want this, neither is
   * the answer to what the screen is for.
   */
  display: "text-[2.5rem] md:text-5xl font-bold tabular-nums tracking-[-0.03em] leading-[1.05]",
  /** What this screen is. One per screen, at the top. */
  title: "text-[1.75rem] font-semibold tracking-[-0.02em] leading-tight text-balance",
  /** What this part of the screen is. */
  section: "text-xl font-semibold tracking-[-0.01em] text-balance",
  /** Prose. `text-pretty` is what stops a two-line paragraph orphaning a word. */
  body: "text-base leading-relaxed text-pretty",
  /** Names a control or a value. Not a heading — it labels something beside it. */
  label: "text-base font-medium",
  /** Secondary: a caption, a hint, a timestamp. Quieter, never smaller than 14px. */
  note: "text-sm text-muted",
  /**
   * ⚠️ A NUMBER MEANT TO BE COMPARED, WITH `tabular-nums`. Proportional digits
   * make a column of figures ripple, and the reader's eye does the arithmetic on
   * the ripple rather than on the values. This is the number in a ROW or a stat
   * block; the one a screen is built around is `display`.
   */
  figure: "text-2xl font-bold tabular-nums tracking-[-0.02em]",
  /**
   * ⚠️ THE FRACTIONAL PART OF AN AMOUNT, RELATIVE TO ITS WHOLE. `€1,051.70` at
   * one size is a number; with a smaller `.70` it is a sum of money, because the
   * eye lands on the part that matters. `em` rather than a fixed size, so the
   * ratio holds wherever the figure is used — a fixed one would be right once.
   */
  minor: "text-[0.58em] font-semibold",
  /**
   * ⚠️ AN IDENTIFIER, AND IT IS THE ONLY THING IN THIS SYSTEM THAT IS MONO.
   * `req_8f21c04`, an IBAN, a seal number, an API key: strings nobody reads as
   * words, that get copied, quoted down a phone and compared character by
   * character. That is the one job a monospaced face is actually better at,
   * because it is the one place `0`/`O` and `1`/`l`/`I` have to be told apart —
   * and `CopyRow` was rendering exactly these in the body face.
   *
   * ⚠️ AND NUMBERS ARE DELIBERATELY NOT MONO, WHICH IS THE COMMON MISTAKE. The
   * problem a monospaced face solves for a column of figures is alignment, and
   * `tabular-nums` already solves it — on the brand face, at the brand's own
   * proportions. Setting money in mono buys the same alignment and pays for it
   * with the wrong connotation: a balance starts reading as terminal output, a
   * price as a config value. Every product that handles money well sets it in
   * its own sans with tabular figures, which is what `display` and `figure` do.
   */
  code: "font-mono text-sm tracking-tight",
} as const;

export type Role = keyof typeof TYPE;

export const ROLES = Object.keys(TYPE) as readonly Role[];

/** ⚠️ Placement is the caller's; the role is ours. They compose, they do not fight. */
export const text = (role: Role, layout = ""): string =>
  layout ? `${TYPE[role]} ${layout}` : TYPE[role];

/**
 * ⚠️ THE FACE IS THE FRAMEWORK'S, NOT EACH APP'S, and it is self-hosted.
 *
 * A system stack is a different typeface on every device — so the one thing a
 * design system is FOR, looking like itself, is the one thing it cannot promise.
 * It is also why the scale above could not be tuned: `-0.03em` at 40px is right
 * for a grotesque and wrong for whatever Android happens to serve.
 *
 * ⚠️ SELF-HOSTED, NEVER A FONT CDN. A CDN link is a third party in the critical
 * path of the first paint, a request that fails closed to a fallback face
 * nobody designed against, and a privacy claim to defend. The variable file
 * ships with the bundle.
 *
 * ⚠️ AND THE FALLBACK STACK IS NOT DECORATION. It is what people read for the
 * first few hundred milliseconds of a cold start, so it is a real grotesque
 * rather than `sans-serif` — with `font-display: swap`, a bad fallback is a
 * visible reflow into a different-width face on every first visit.
 */
export const FACE_STACK = [
  '"Geist Variable"',
  '"Geist"',
  "-apple-system",
  "BlinkMacSystemFont",
  '"Segoe UI"',
  "Roboto",
  '"Helvetica Neue"',
  "Arial",
  "sans-serif",
].join(", ");

/**
 * ⚠️ NO `font-feature-settings`, AND THAT IS A DECISION RATHER THAN AN OMISSION.
 * The obvious line to write here is `"cv11", "ss03"` — those are INTER's
 * character variants, they do nothing at all in this face, and a declaration
 * that does nothing is worse than none: it reads as tuned, so nobody revisits
 * it. Add features when a face has them and somebody has looked at the
 * difference.
 *
 * ⚠️ `text-rendering` IS ALSO DELIBERATELY ABSENT. `optimizeLegibility` is the
 * classic thing to add here and it turns on ligatures and kerning at every size,
 * which is slower and, on long pages, occasionally wrong. The browser default is
 * already kerned.
 */
/**
 * ⚠️ THE MONO STACK IS THE SYSTEM'S, NOT A SECOND SELF-HOSTED FILE. It is used
 * by one role, for identifiers, at small sizes — so what it has to be is
 * fixed-width and unambiguous, and every platform already ships a face that is
 * both. Shipping a second variable font for a reference code would be a font
 * file per app for a string most people never see.
 */
export const MONO_STACK = [
  "ui-monospace",
  "SFMono-Regular",
  '"SF Mono"',
  "Menlo",
  "Consolas",
  '"Liberation Mono"',
  "monospace",
].join(", ");

export const FACE_CSS = [
  `:root { --font-sans: ${FACE_STACK}; --font-mono: ${MONO_STACK}; }`,
  `html, body { font-family: var(--font-sans); }`,
  /* ⚠️ A number is read, not spelled — every figure in the product is lining by
     default, so a column of them cannot sit at different heights. */
  `html { font-variant-numeric: lining-nums; }`,
  /* ⚠️ ANTIALIASING IS SET, BECAUSE THE DEFAULT IS THE WRONG ONE FOR LIGHT TEXT
     ON A DARK GROUND. Subpixel rendering fattens a white glyph on dark until a
     500 weight reads as a 600 — which is most of why light-on-dark UI text looks
     heavier than the same face in a design tool. */
  `html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }`,
].join("\n");
