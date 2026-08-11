/**
 * COLOUR, AS ARITHMETIC.
 *
 * ⚠️ EVERY DECISION HERE IS MEASURED RATHER THAN CHOSEN, and that is the whole
 * of "a tenant's bad palette is not their problem". A design system that picks
 * ink by a lightness threshold works for the palette it was tuned against and
 * for nothing else; the moment a brand derives the surfaces, one accent in the
 * set renders dark-on-dark and nobody notices until a customer does.
 *
 * OKLCH rather than HSL, for one reason that matters: equal steps in OKLCH's
 * lightness look equal to a person, and equal steps in HSL do not. A surface
 * ladder built on HSL is visibly uneven at yellow and invisible at blue.
 */

export interface Rgb { readonly r: number; readonly g: number; readonly b: number }
/** Lightness 0–1, chroma 0–~0.4, hue 0–360. */
export interface Oklch { readonly l: number; readonly c: number; readonly h: number }

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/* ------------------------------------------------------------- transfer --- */

const toLinear = (x: number): number => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
const toGamma = (x: number): number => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);

/* ---------------------------------------------------------------- oklch --- */

export function rgbToOklch({ r, g, b }: Rgb): Oklch {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return { l: L, c: Math.hypot(A, B), h: h < 0 ? h + 360 : h };
}

/** ⚠️ Unclamped: a colour outside sRGB comes back with components out of 0–1. */
function oklchToRgbRaw({ l, c, h }: Oklch): Rgb {
  const rad = (h * Math.PI) / 180;
  const A = c * Math.cos(rad);
  const B = c * Math.sin(rad);

  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;

  return {
    r: toGamma(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    g: toGamma(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    b: toGamma(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  };
}

const inGamut = ({ r, g, b }: Rgb): boolean =>
  r >= -0.0001 && r <= 1.0001 && g >= -0.0001 && g <= 1.0001 && b >= -0.0001 && b <= 1.0001;

/**
 * Bring a colour into sRGB by reducing CHROMA, never lightness.
 *
 * ⚠️ THE CHOICE OF WHAT TO GIVE UP IS THE WHOLE POINT. Clamping the channels
 * instead shifts hue AND lightness unpredictably — so a surface computed to be a
 * measured distance from its parent stops being one, and the contrast the sweep
 * proved is no longer the contrast that renders. Chroma is the only axis whose
 * loss is merely a duller colour.
 */
export function oklchToRgb(colour: Oklch): Rgb {
  const direct = oklchToRgbRaw(colour);
  if (inGamut(direct)) return { r: clamp01(direct.r), g: clamp01(direct.g), b: clamp01(direct.b) };

  let lo = 0;
  let hi = colour.c;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToRgbRaw({ ...colour, c: mid }))) lo = mid;
    else hi = mid;
  }
  const fitted = oklchToRgbRaw({ ...colour, c: lo });
  return { r: clamp01(fitted.r), g: clamp01(fitted.g), b: clamp01(fitted.b) };
}

/* ------------------------------------------------------------- contrast --- */

/** WCAG relative luminance — linear sRGB, which is not the same as OKLCH's L. */
export function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a), luminance(b)];
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
}

export const INK_LIGHT: Oklch = { l: 0.985, c: 0.002, h: 250 };
export const INK_DARK: Oklch = { l: 0.16, c: 0.006, h: 250 };

/**
 * ⚠️ THE ON-COLOUR IS MEASURED, NEVER CHOSEN BY RULE.
 *
 * Compute the contrast of near-white AND near-dark against this exact colour and
 * keep the winner. A lightness threshold mis-calls mid-lightness saturated
 * colours — where both candidates are borderline — and the failure is a filled
 * pill rendering dark ink on a dark fill, for one accent in a set, on one theme.
 */
export function bestForeground(background: Rgb): { readonly ink: Rgb; readonly ratio: number } {
  const light = oklchToRgb(INK_LIGHT);
  const dark = oklchToRgb(INK_DARK);
  const onLight = contrast(background, light);
  const onDark = contrast(background, dark);
  return onLight >= onDark ? { ink: light, ratio: onLight } : { ink: dark, ratio: onDark };
}

/* ------------------------------------------------------------------ css --- */

const hex = (x: number): string => Math.round(clamp01(x) * 255).toString(16).padStart(2, "0");
export const toHex = ({ r, g, b }: Rgb): string => `#${hex(r)}${hex(g)}${hex(b)}`;

export function fromHex(text: string): Rgb {
  const h = text.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  };
}
