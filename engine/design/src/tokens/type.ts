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
  display: "font-mark text-[2.5rem] md:text-5xl font-bold tabular-nums tracking-[-0.035em] leading-[1.05]",
  /**
   * ⚠️ A NAME THAT IS ACTING AS A MARK, AND THE TRACKING IS THE WHOLE ROLE. A
   * workspace's name over its own planet is not a heading somebody reads on the
   * way to the content — it IS the content of that moment, and at that job the
   * difference between a title and a wordmark is almost entirely letter-fit.
   * `display`'s `-0.03em` is tuned for a NUMBER, where the digits are already
   * even; a word set that loosely at 48px reads as a heading scaled up. Pulled
   * to `-0.055em` at 800 the letters lock into one shape, which is what a mark
   * is.
   *
   * ⚠️ AND `text-balance`, BECAUSE A TWO-WORD NAME MUST NOT ORPHAN ITS SECOND.
   * "Northwind Strength" breaking to leave "Strength" alone under a nine-letter
   * line is the single thing that makes a large name look unset.
   */
  wordmark: "font-mark text-[2.75rem] md:text-6xl font-extrabold tracking-[-0.05em] leading-[0.95] text-balance",
  /**
   * THE TWO HALVES OF A LOCKUP, AND THE WEIGHT SPLIT IS THE WHOLE WORDMARK.
   *
   * ⚠️ `One` LIGHT AND THE PRODUCT BOLD says the two things a lockup has to say
   * at a glance: which family this belongs to, and which member it is. Set at
   * one weight, every product name becomes a slightly different long word.
   *
   * ⚠️ NO SIZE IN EITHER, DELIBERATELY. `wordmark` above bakes one in because it
   * is always the same thing at the same scale; a lockup is drawn at four sizes
   * from a nav row to a door, so the caller sets the scale and these set the fit.
   */
  lockupFamily: "font-mark font-light tracking-[-0.04em]",
  lockupMember: "font-mark font-bold tracking-[-0.04em]",
  /**
   * THE NAME ON THE CURTAIN, WHICH IS THE ONE PLACE IT IS ALONE ON THE SCREEN.
   *
   * ⚠️ LIGHT, NOT BOLD, AND THAT IS THE WHOLE DIFFERENCE FROM `wordmark`. A
   * workspace's name over its own planet is competing with a picture and has to
   * hold; the opening has nothing else on it at all, and weight there reads as
   * volume rather than as presence. `One` is the FAMILY half of the lockup, and
   * the family half has been light since the lockup was drawn — setting it bold
   * here would make the first thing anybody sees the one place the wordmark
   * disagrees with itself.
   *
   * ⚠️ AND IT IS THE LARGEST TYPE IN THE PRODUCT, WHICH IS THE POINT. Every other
   * role here is sized to be read on the way to something; this one is the thing.
   * At the size it started — just over two rem on a phone — the name read as a
   * label on a dark page rather than as a title card, which is what "bigger
   * logo" meant. Half the width of a 390 leaves the ring, the word and the line
   * reading as one object with air around them.
   */
  opening: "font-mark text-[3.5rem] md:text-[5.5rem] font-light tracking-[-0.045em] leading-none",
  /** What this screen is. One per screen, at the top. */
  title: "font-mark text-[1.75rem] font-semibold tracking-[-0.025em] leading-tight text-balance",
  /** What this part of the screen is. */
  section: "font-mark text-xl font-semibold tracking-[-0.015em] text-balance",
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
  figure: "font-mark text-2xl font-bold tabular-nums tracking-[-0.025em]",
  /**
   * ⚠️ THE NUMERALS WITHOUT THE SIZE — for a figure that lands INSIDE a row, a
   * heading or a sentence, and takes whatever size it lands in. `figure` is a
   * size AND a weight AND a face, so a date or a price wearing it inside a row
   * came out at 24px bold; the only part of it a value in flow needs is the
   * tabular digits, and that is the whole of this.
   */
  figures: "tabular-nums",
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

/**
 * ⚠️ A SECOND FACE, FOR HEADINGS ONLY, AND THE SPLIT IS THE OLDEST ONE IN
 * TYPOGRAPHY. A text face is drawn to disappear at 16px over many lines; a
 * display face is drawn to be LOOKED at, once, large. One face doing both is
 * the compromise every design system starts with and every distinctive one
 * leaves — a heading in the body face is legible and anonymous, which is
 * exactly what a workspace's name over its own planet must not be.
 *
 * ⚠️ ONEST, AND THE REASON IS THE COUNTERS. Squared bowls, tight apertures and
 * a high x-height mean a word at 44px locks into ONE shape rather than reading
 * as a row of letters — which is the whole difference between a heading and a
 * mark. It also rhymes with the interface's own geometry, where every plate and
 * card is a squircle.
 *
 * ⚠️ THE FALLBACK IS THE TEXT FACE, NOT A SYSTEM ONE. If the display file has
 * not arrived, a heading set in Geist is the product looking like itself at a
 * slightly different weight; a heading in whatever Android serves is a heading
 * in a face nobody chose, at the largest size on the screen.
 */
export const MARK_STACK = [
  '"Onest Variable"',
  '"Onest"',
  FACE_STACK,
].join(", ");

export const FACE_CSS = [
  `:root { --font-sans: ${FACE_STACK}; --font-mono: ${MONO_STACK}; --font-mark: ${MARK_STACK}; }`,
  `html, body { font-family: var(--font-sans); }`,
  /*
    ⚠️ A PLAIN CLASS, NOT A TAILWIND THEME ENTRY, AND THE REASON IS ONE SOURCE.
    `@theme { --font-mark: … }` would generate the utility, but the stack would
    then be written in a CSS file as well as here — two lists that agree until
    somebody edits one. A rule beside the stack it uses cannot disagree with it.

    ⚠️ AND IT BEATS INHERITANCE WHATEVER THE ORDER. `font-family` set on the
    element always wins over the `html, body` rule above, so this does not depend
    on where the injected sheet lands relative to Tailwind's.
  */
  `.font-mark { font-family: var(--font-mark); }`,
  /* ⚠️ A number is read, not spelled — every figure in the product is lining by
     default, so a column of them cannot sit at different heights. */
  `html { font-variant-numeric: lining-nums; }`,
  /* ⚠️ ANTIALIASING IS SET, BECAUSE THE DEFAULT IS THE WRONG ONE FOR LIGHT TEXT
     ON A DARK GROUND. Subpixel rendering fattens a white glyph on dark until a
     500 weight reads as a 600 — which is most of why light-on-dark UI text looks
     heavier than the same face in a design tool. */
  `html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }`,
].join("\n");

/* ------------------------------------------------------------------ words --- */

/**
 * AN ID, SAID THE WAY A PERSON READS IT.
 *
 * ⚠️ A WIRE VALUE IS NOT COPY, AND RENDERING ONE VERBATIM IS THE TELL. `metric`,
 * `comfortable`, `not_started` and `past_due` are keys — chosen so a machine can
 * compare them — and a settings row showing "comfortable" in the middle of a
 * screen where every other word is capitalised reads as something unfinished.
 *
 * ⚠️ IT IS A FALLBACK, NEVER A TRANSLATION. `kg` becomes "Kg" and `RGB` would
 * become "Rgb", which is why every declaration that has a real name for its
 * options should say so — this is what happens when it does not, and it is right
 * far more often than the raw id.
 */
export const sentence = (id: string): string => {
  const words = id.replace(/[_-]+/g, " ").replace(/([a-z\d])([A-Z])/g, "$1 $2").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1).toLowerCase() : id;
};
