/**
 * THE SKY — the tenant's light, behind everything.
 *
 * ⚠️ THIS IS WHERE THE `ambience` SLOT LIVES. The brand contract has carried a
 * hue and an intensity since it was written, and without this it is spent on a
 * tint at the resolution of a rounding error. Here it is the ground: a slow
 * aurora behind a whole scroll, or a pattern lit by the same colour.
 *
 * ⚠️ IT IS BLOOMS, NEVER A WASH. The colour arrives as three soft radial sources
 * with wide falloff, because a flat tint reads as a screen somebody coloured in
 * and blooms read as light in a room. That is the whole difference between
 * ambience and paint.
 *
 * ⚠️ THE HUE NEVER CYCLES. It is the tenant's, fixed. What moves is where the
 * light falls, never what colour it is — a hue that animates is a screensaver.
 *
 * ⚠️ AND A PAGE DECLARES A SKY, NEVER A COLOUR. `sky` is one of six words in
 * `DECLARABLE`; every value below is derived from `groundFor` and `accentOn`, so
 * a new tenant gets their own weather without anybody choosing a gradient.
 *
 * ⚠️ THE WEATHER'S TIMING IS NOT HERE. Drift and breath are `motion.ts`'s, like
 * every other duration in the product — this file draws the light and the masks,
 * and the choreographer moves them. What is left below is a colour layer and six
 * masks, which is why the only literals in it are the `#000` of a MASK, where
 * black means opaque and is an alpha channel wearing colour syntax.
 */

import type { Brand } from "./brand.js";
import { groundFor } from "./brand.js";
import { accentOn } from "./ground.js";
import type { Theme } from "./ground.js";
import { oklchToRgb, toHex, type Oklch } from "./colour.js";

/** The skies a page may declare. ⚠️ Four of them are one lit layer, masked. */
export const SKIES = ["aurora", "photo", "dots", "waves", "grid", "rings"] as const;
export type Sky = (typeof SKIES)[number];

/** ⚠️ Masked skies keep a fraction of their pixels — see `SKY` for the correction. */
export const MASKED: readonly Sky[] = ["dots", "waves", "grid", "rings"];

/** Every variable the sky sheet reads, so the map can be proved complete. */
export const SKY_VARS = ["--sky-deep", "--sky-1", "--sky-2", "--sky-3", "--sky-bloom"] as const;

const alpha = (hex: string, a: number): string =>
  hex + Math.round(a * 255).toString(16).padStart(2, "0");

/**
 * A brand and a theme become the five colours the sky is drawn from.
 *
 * ⚠️ NOTHING HERE PICKS A COLOUR. The blooms are the ambience hue at chosen
 * LIGHTNESSES, and the middle one is the tenant's accent re-lit against the
 * canvas it sits on — so the light behind a screen is recognisably the same
 * light as the buttons in front of it.
 *
 * ⚠️ THE LIGHTNESSES INVERT WITH THE THEME AND THE CHROMA DOES NOT. A dark sky
 * is light on dark; a light sky is shade on pale. Keeping the chroma constant is
 * what stops the pale theme's sky reading as a different brand.
 */
export function skyVars(brand: Brand, theme: Theme): Readonly<Record<string, string>> {
  const ground = groundFor(brand, theme);
  const bloom = (l: number, c: number): string => toHex(oklchToRgb({ l, c, h: brand.ambience.hue }));
  const lit = accentOn(ground.accent, ground.canvas);
  const accent = (l: number, scale: number): string =>
    toHex(oklchToRgb({ ...lit, l, c: lit.c * scale } as Oklch));

  return theme === "dark"
    ? {
        "--sky-deep": bloom(0.13, 0.03),
        "--sky-1": alpha(bloom(0.3, 0.06), 0.85),
        "--sky-2": alpha(accent(0.34, 0.55), 0.8),
        "--sky-3": alpha(bloom(0.42, 0.05), 0.55),
        "--sky-bloom": bloom(0.62, 0.035),
      }
    : {
        "--sky-deep": bloom(0.9, 0.02),
        "--sky-1": alpha(bloom(0.8, 0.05), 0.9),
        "--sky-2": alpha(accent(0.74, 0.45), 0.85),
        "--sky-3": alpha(bloom(0.86, 0.04), 0.6),
        "--sky-bloom": bloom(0.97, 0.02),
      };
}

/**
 * The sky, as a rule.
 *
 * ⚠️ ONE LIT LAYER, MASKED PER SKY. Four of the six differ only by their mask,
 * which is what makes a pattern impossible to draw in the wrong colour: there is
 * no second gradient to get wrong.
 *
 * ⚠️ `--solid` AND `--reach` ARE THE ARCHETYPE'S, NOT THE SKY'S — how far down
 * the light survives is a fact about the screen's shape. A photograph carries a
 * whole screen; a pattern gives out just past the hero. See §5.4: the backdrop
 * fades, it is never a band.
 */
export const SKY = `
[data-one='sky'] {
  position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden;
  /* ⚠️ THE BACKDROP HAS NO BOTTOM EDGE. A band is the single thing that most
     separates a stack of cards from a designed screen. */
  -webkit-mask-image: linear-gradient(to bottom, #000 var(--solid, 28%), transparent var(--reach, 60%));
  mask-image: linear-gradient(to bottom, #000 var(--solid, 28%), transparent var(--reach, 60%));
}
[data-one='sky']::before {
  content: ""; position: absolute; inset: -14%;
  background:
    radial-gradient(48% 38% at 18% 10%, var(--sky-1), transparent 62%),
    radial-gradient(42% 34% at 84% 22%, var(--sky-2), transparent 64%),
    radial-gradient(58% 44% at 46% 52%, var(--sky-3), transparent 68%);
}

/* ⚠️ A MASKED SKY NEEDS A DIFFERENT AMOUNT OF LIGHT, AND THE CORRECTION FOLLOWS
   THE GROUND. Dots at 9px keep about 2% of their pixels, so at the gradient's
   own brightness the pattern is invisible — and the temptation is to raise the
   tenant's ambience, which washes every unmasked screen to fix one masked one.
   Raising it in BOTH directions is the same defect with the opposite sign: it
   blows a light pattern out to white. A mask is legible by DISTANCE from its
   ground, so brighter on dark and darker on pale. */
[data-one='sky'][data-masked]::before { filter: brightness(2.4) saturate(1.15); }
:root[data-theme='light'] [data-one='sky'][data-masked]::before { filter: brightness(0.62) saturate(1.5); }
@media (prefers-color-scheme: light) {
  :root:not([data-theme='dark']) [data-one='sky'][data-masked]::before { filter: brightness(0.62) saturate(1.5); }
}

[data-one='sky'][data-sky='dots']::before {
  -webkit-mask-image: radial-gradient(circle, #000 1.1px, transparent 1.3px);
  mask-image: radial-gradient(circle, #000 1.1px, transparent 1.3px);
  -webkit-mask-size: 9px 9px; mask-size: 9px 9px;
}
[data-one='sky'][data-sky='waves']::before {
  -webkit-mask-image: repeating-linear-gradient(112deg, #000 0 2px, transparent 2px 13px);
  mask-image: repeating-linear-gradient(112deg, #000 0 2px, transparent 2px 13px);
}
[data-one='sky'][data-sky='grid']::before {
  -webkit-mask-image: repeating-linear-gradient(0deg, #000 0 1px, transparent 1px 22px), repeating-linear-gradient(90deg, #000 0 1px, transparent 1px 22px);
  mask-image: repeating-linear-gradient(0deg, #000 0 1px, transparent 1px 22px), repeating-linear-gradient(90deg, #000 0 1px, transparent 1px 22px);
}
[data-one='sky'][data-sky='rings']::before {
  -webkit-mask-image: repeating-radial-gradient(circle at 50% 8%, #000 0 1px, transparent 1px 26px);
  mask-image: repeating-radial-gradient(circle at 50% 8%, #000 0 1px, transparent 1px 26px);
}

/* ⚠️ A PHOTOGRAPH IS STILL A SKY — the same five colours, reaching further, for
   the one archetype that is about a single number. */
[data-one='sky'][data-sky='photo']::before {
  background:
    radial-gradient(120% 80% at 20% 0%, var(--sky-deep), transparent 60%),
    radial-gradient(90% 60% at 85% 25%, var(--sky-2), transparent 55%),
    radial-gradient(70% 50% at 40% 55%, var(--sky-bloom), transparent 60%),
    linear-gradient(160deg, var(--sky-deep), var(--sky-1) 45%, var(--sky-bloom) 72%, var(--sky-deep));
}
`.trim();

/** The sky's colours for both themes, scoped so an explicit choice wins either way. */
export function skySheet(brand: Brand): string {
  const decl = (t: Theme) =>
    Object.entries(skyVars(brand, t)).map(([k, v]) => `  ${k}: ${v};`).join("\n");
  return [
    `:root {\n${decl("light")}\n}`,
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme='light']) {\n${decl("dark")}\n  }\n}`,
    `:root[data-theme='dark'] {\n${decl("dark")}\n}`,
  ].join("\n\n");
}
