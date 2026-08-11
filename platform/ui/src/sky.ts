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

/**
 * The skies a page may declare.
 *
 * ⚠️ SEVEN OF THE TEN ARE ONE LIT LAYER UNDER A DIFFERENT MASK, and the other
 * three are that same layer with the blooms placed differently. There is no
 * second gradient anywhere in this file, which is what makes a pattern
 * impossible to draw in the wrong colour.
 *
 * ⚠️ THE SET IS CLOSED, like every other list in this package. A screen picks a
 * word; it does not describe a background.
 */
export const SKIES = ["aurora", "mesh", "photo", "dots", "grain", "waves", "grid", "rings", "beams", "halo"] as const;
export type Sky = (typeof SKIES)[number];

/**
 * ⚠️ HOW MUCH LIGHT A MASK LETS THROUGH, IN TWO WORDS. It is not decoration:
 * the correction in `SKY` is applied by this weight, because a hairline grid
 * keeping ~4% of its pixels and a shaft keeping ~25% cannot take the same
 * brightness — one is invisible under the other's correction and the other is
 * blown out under this one's.
 */
export const MASK_WEIGHT = {
  dots: "fine", grain: "fine", waves: "fine", grid: "fine", rings: "fine",
  beams: "broad", halo: "broad",
} as const satisfies Partial<Record<Sky, "fine" | "broad">>;

/** ⚠️ Masked skies keep a fraction of their pixels — see `SKY` for the correction. */
export const MASKED: readonly Sky[] = Object.keys(MASK_WEIGHT) as Sky[];

/** The weight a sky is corrected at, or null where the whole layer survives. */
export const maskWeight = (sky: Sky): "fine" | "broad" | null =>
  (MASK_WEIGHT as Record<string, "fine" | "broad">)[sky] ?? null;

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
  -webkit-mask-image: linear-gradient(to bottom, #000 var(--solid, 12rem), transparent var(--reach, 30rem));
  mask-image: linear-gradient(to bottom, #000 var(--solid, 12rem), transparent var(--reach, 30rem));
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
   ground, so brighter on dark and darker on pale.

   ⚠️ AND IT FOLLOWS THE MASK'S WEIGHT AS WELL AS THE GROUND. A hairline pattern
   and a light shaft do not survive the same correction: one is invisible under
   the other's and the other is a white bar under this one's. The mask weight is
   the two-word answer, and it is a declaration rather than a number per sky. */
[data-one='sky'][data-masked='fine']::before { filter: brightness(2.4) saturate(1.15); }
[data-one='sky'][data-masked='broad']::before { filter: brightness(1.35) saturate(1.1); }
:root[data-theme='light'] [data-one='sky'][data-masked='fine']::before { filter: brightness(0.62) saturate(1.5); }
:root[data-theme='light'] [data-one='sky'][data-masked='broad']::before { filter: brightness(0.86) saturate(1.25); }
@media (prefers-color-scheme: light) {
  :root:not([data-theme='dark']) [data-one='sky'][data-masked='fine']::before { filter: brightness(0.62) saturate(1.5); }
  :root:not([data-theme='dark']) [data-one='sky'][data-masked='broad']::before { filter: brightness(0.86) saturate(1.25); }
}

/* ⚠️ THE BREATH IS A FACTOR INSIDE EACH PATTERN'S OWN GEOMETRY, NOT A MASK-SIZE.
   Sizing the mask box tiles a repeating gradient into that box, so waves at a
   13px period rendered inside a 9px tile is a pattern with a seam every 9px —
   which reads as a rendering artefact rather than as a wrong number. Scaling one
   registered custom property lets one keyframe breathe seven different geometries
   correctly, and it stays a composited property because it resolves at
   computed-value time. The keyframe that drives it is the choreographer's. */
@property --breath { syntax: "<number>"; inherits: true; initial-value: 1; }

[data-one='sky'][data-sky='dots']::before {
  -webkit-mask-image: radial-gradient(circle, #000 1.1px, transparent 1.3px);
  mask-image: radial-gradient(circle, #000 1.1px, transparent 1.3px);
  -webkit-mask-size: calc(9px * var(--breath)) calc(9px * var(--breath));
  mask-size: calc(9px * var(--breath)) calc(9px * var(--breath));
}
/* ⚠️ TWO FIELDS AT COPRIME PERIODS, WHICH IS WHAT MAKES IT GRAIN. One tiled dot
   field at any size is a grid somebody made small; two that never line up read
   as texture, and mask layers UNION by default so no compositing mode is needed. */
[data-one='sky'][data-sky='grain']::before {
  -webkit-mask-image: radial-gradient(circle, #000 0.8px, transparent 0.95px), radial-gradient(circle, #000 0.65px, transparent 0.8px);
  mask-image: radial-gradient(circle, #000 0.8px, transparent 0.95px), radial-gradient(circle, #000 0.65px, transparent 0.8px);
  -webkit-mask-size: calc(4px * var(--breath)) calc(7px * var(--breath)), calc(6px * var(--breath)) calc(5px * var(--breath));
  mask-size: calc(4px * var(--breath)) calc(7px * var(--breath)), calc(6px * var(--breath)) calc(5px * var(--breath));
  -webkit-mask-position: 0 0, 2px 3px; mask-position: 0 0, 2px 3px;
}
[data-one='sky'][data-sky='waves']::before {
  -webkit-mask-image: repeating-linear-gradient(112deg, #000 0 2px, transparent 2px calc(13px * var(--breath)));
  mask-image: repeating-linear-gradient(112deg, #000 0 2px, transparent 2px calc(13px * var(--breath)));
}
[data-one='sky'][data-sky='grid']::before {
  -webkit-mask-image: repeating-linear-gradient(0deg, #000 0 1px, transparent 1px calc(22px * var(--breath))), repeating-linear-gradient(90deg, #000 0 1px, transparent 1px calc(22px * var(--breath)));
  mask-image: repeating-linear-gradient(0deg, #000 0 1px, transparent 1px calc(22px * var(--breath))), repeating-linear-gradient(90deg, #000 0 1px, transparent 1px calc(22px * var(--breath)));
}
[data-one='sky'][data-sky='rings']::before {
  -webkit-mask-image: repeating-radial-gradient(circle at 50% 8%, #000 0 1px, transparent 1px calc(26px * var(--breath)));
  mask-image: repeating-radial-gradient(circle at 50% 8%, #000 0 1px, transparent 1px calc(26px * var(--breath)));
}
/* ⚠️ SHAFTS ARE SOFT-EDGED, which is the whole difference between light through
   a window and a set of bars. The stops ramp rather than switching. */
[data-one='sky'][data-sky='beams']::before {
  -webkit-mask-image: repeating-linear-gradient(101deg, transparent 0, #000 calc(11px * var(--breath)), #000 calc(19px * var(--breath)), transparent calc(31px * var(--breath)), transparent calc(78px * var(--breath)));
  mask-image: repeating-linear-gradient(101deg, transparent 0, #000 calc(11px * var(--breath)), #000 calc(19px * var(--breath)), transparent calc(31px * var(--breath)), transparent calc(78px * var(--breath)));
}
/* ⚠️ ONE CORONA, ANCHORED ABOVE THE SCREEN. It is the sky for a screen that has
   a single subject, and it breathes wide rather than fast. */
[data-one='sky'][data-sky='halo']::before {
  -webkit-mask-image: radial-gradient(circle at 50% -22%, transparent calc(42% * var(--breath)), #000 calc(53% * var(--breath)), #000 calc(58% * var(--breath)), transparent calc(70% * var(--breath)));
  mask-image: radial-gradient(circle at 50% -22%, transparent calc(42% * var(--breath)), #000 calc(53% * var(--breath)), #000 calc(58% * var(--breath)), transparent calc(70% * var(--breath)));
}

/* ⚠️ A MESH IS THE SAME LIGHT, SPREAD. Five sources across the whole field
   rather than three at the top — so it survives further down a long screen,
   which is what a feed needs and what the three-bloom aurora gives out on. */
[data-one='sky'][data-sky='mesh']::before {
  background:
    radial-gradient(38% 30% at 8% 12%, var(--sky-1), transparent 62%),
    radial-gradient(34% 28% at 62% 4%, var(--sky-2), transparent 60%),
    radial-gradient(40% 32% at 97% 30%, var(--sky-3), transparent 64%),
    radial-gradient(44% 34% at 28% 58%, var(--sky-2), transparent 66%),
    radial-gradient(36% 30% at 80% 78%, var(--sky-1), transparent 62%);
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
