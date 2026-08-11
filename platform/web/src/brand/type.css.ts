/**
 * THE TYPE — two faces, and the split between them is what carries hierarchy.
 *
 * ⚠️ THE BRAND FACE IS GEOMETRIC BECAUSE THE MARK IS. `mark.tsx` is a straight
 * stroke, a straight baseline, a circle and a star — constructed shapes, no
 * modulation, no serifs. Set beside a humanist face the mark reads as a picture
 * placed next to some words; set beside a geometric one it reads as the first
 * character of the same alphabet. That is the argument for the choice, and it is
 * why a fashionable face is not a substitute for it.
 *
 * ⚠️ THE BRAND FACE IS FOR NAMES, NEVER FOR READING. The lockup and the section
 * headings — the things a person recognises rather than reads. Set the rows in it
 * too and the hierarchy collapses: a heading and the first row of the card under
 * it become the same object at two sizes, which is exactly the difference the
 * heading exists to draw.
 *
 * ⚠️ AND THE TEXT FACE IS SHIPPED RATHER THAN INHERITED. `system-ui` is a
 * different typeface on every platform — the rows are set in one face on the
 * phone the design was judged on and another everywhere else, and nobody
 * reviewing it ever sees the second. A face we ship is a face we have looked at.
 *
 * ⚠️ THE FILE IS THE SOURCE AND THE URL IS THE CALLER'S. A font served from a URL
 * is cached once and shared by every page; a font inlined as a data URI is
 * re-downloaded with every document that carries it. The preview inlines because
 * a single HTML file has nowhere else to put it — that is a property of the
 * preview, not of the design, so the src is a parameter.
 */

export interface WebFont {
  readonly family: string;
  /** ⚠️ ONE VARIABLE FILE, NOT A STATIC ONE PER WEIGHT. */
  readonly weights: string;
  /** Relative to this package. The licence sits beside it. */
  readonly file: string;
}

/** Names. Geometric, and tight enough at 600 to read as lettering. */
export const BRAND_FONT: WebFont = {
  family: "Outfit",
  weights: "300 700",
  file: "assets/fonts/outfit-latin.woff2",
};

/** Everything a person reads. Drawn for interfaces, at interface sizes. */
export const TEXT_FONT: WebFont = {
  family: "Plus Jakarta Sans",
  weights: "400 800",
  file: "assets/fonts/jakarta-latin.woff2",
};

export const FONTS: readonly WebFont[] = [BRAND_FONT, TEXT_FONT];

/**
 * ⚠️ `swap`, NEVER `block`. Blocking paints the page with holes where its words
 * go; swapping paints them in whatever the device has and replaces them. One of
 * those is a page arriving, the other is a page that looks broken for as long as
 * a network takes.
 */
export const fontFace = (font: WebFont, src: string): string =>
  `@font-face { font-family: '${font.family}'; font-style: normal;` +
  ` font-weight: ${font.weights}; font-display: swap;` +
  ` src: url(${src}) format('woff2'); }`;

/*
  ⚠️ THE FALLBACK IS A STACK, NOT A KEYWORD. Until the file arrives — and forever,
  if it never does — these are what the words are set in, so they are named rather
  than left to `sans-serif`, which on a phone is not the face any other app on
  that phone is set in.
*/
export const TYPE_CSS = `
:root {
  --font-text: '${TEXT_FONT.family}', ui-sans-serif, -apple-system, "SF Pro Text", "Segoe UI", Roboto, system-ui, sans-serif;
  --font-brand: '${BRAND_FONT.family}', var(--font-text);
}
`.trim();
