/**
 * CONTRAST, AS ARITHMETIC.
 *
 * A design system that ships colour pairs has to be able to say whether they are
 * legible, and "it looks fine" is not an answer: the light-mode primary once
 * shipped at 3.27:1 as a button fill — a clear AA failure on the most-pressed
 * control in the product — and reading the token file did not catch it.
 * `oklch(0.62 0.14 164)` and `oklch(0.99 0.01 164)` look like a reasonable pair,
 * and lightness in oklch is PERCEPTUAL, not photometric, so "0.62 vs 0.99 is a
 * big gap" is the wrong intuition. It was found by measuring.
 *
 * EXPORTED rather than kept inside a test, because the tokens are no longer all
 * in one place: an app owns its accent colours (Kova: `tokens.accents.css`) and
 * needs the same measurement to hold itself to the same bar. A second copy of
 * the maths would be a second answer to "is this legible".
 *
 * The oklch → sRGB conversion is `theme.ts`'s, reused rather than repeated for
 * exactly the same reason.
 */

import { oklchToRgb, relLuminance } from "./theme.js";

/** WCAG AA for normal text. Note `body-lg` is 17px/500 — under the 18.66px-bold
 *  threshold, so the large-text 3:1 allowance does NOT apply to buttons or rows. */
export const AA = 4.5;

/** WCAG AA for non-text: focus rings, icon strokes, chart marks. */
export const AA_NON_TEXT = 3;

/** Relative luminance of a colour written as `oklch(...)` or as a plain hex. */
export function luminance(css: string): number {
  const okl = /oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/i.exec(css);
  if (okl) {
    const l = okl[1]!.endsWith("%") ? parseFloat(okl[1]!) / 100 : parseFloat(okl[1]!);
    const { r, g, b } = oklchToRgb(l, parseFloat(okl[2]!), parseFloat(okl[3]!));
    return relLuminance(r, g, b);
  }
  const h = css.trim().replace("#", "");
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h)) throw new Error(`not a colour this can measure: ${css}`);
  const [r, g, b] =
    h.length === 3
      ? ([...h].map((c) => parseInt(c + c, 16)) as [number, number, number])
      : ([0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]);
  return relLuminance(r, g, b);
}

/** Contrast ratio between two colours, each `oklch(...)` or a plain hex. */
export function contrastRatio(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Pull one selector's custom properties out of a stylesheet.
 *
 * Here so a test can measure the SHIPPED values rather than a copy of them —
 * the copy is exactly what drifts.
 */
export function cssTokens(css: string, selector: string): Record<string, string> {
  const i = css.indexOf(selector + " {");
  if (i === -1) throw new Error(`no ${selector} block in the stylesheet`);
  const inner = css.slice(i + selector.length + 2, css.indexOf("\n}", i));
  const out: Record<string, string> = {};
  for (const m of inner.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}
