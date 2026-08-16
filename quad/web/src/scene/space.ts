/**
 * SPACE — the first family, and the proof that a world can be declared.
 *
 * ⚠️ THIS FILE DRAWS NOTHING BY HAND. Every mark is a variant with a weight,
 * every colour is a slot, and where anything lands is the sampler's. Compare it
 * with the twenty-four stacks in `ambience.ts`, each of which is one world drawn
 * once — this is the family they should all become.
 *
 * ⚠️ TWO SKIES, AND THAT IS WHAT KILLS THE MADE-UP RULE. A world used to be a
 * dark room in both themes because every attempt at a pale night sky was a wash,
 * and the honest-looking conclusion was "space is dark, so commit". It is not a
 * conclusion, it is a missing variant: from inside an atmosphere in daylight the
 * sky is pale and the stars are simply not out. `night` and `day` are the same
 * family with different grounds and different speck counts — which is what a
 * family is FOR, and it means light mode gets a real sky rather than a rule.
 *
 * ⚠️ THE SLOTS ARE `deep` AND `lit`. A workspace fills them from its own planet;
 * anything else could fill them from a brand. The family does not know or care
 * where a colour came from, which is the whole point of naming them.
 */

import type { Family, Palette } from "./scene.js";

/** ⚠️ A star is white at an opacity, never a colour — see `night`. */
const dot = (r: number, a: number) => (_p: Palette) =>
  `<circle r="${r}" fill="#fff" fill-opacity="${a}"/>`;

/**
 * ⚠️ THE FOUR-POINT PATH IS THE ONE SHAPE THAT READS AS A STAR rather than as a
 * speck, which is why it is the rarest and the fastest to twinkle. Taken from
 * the avatar style these worlds come from, which had already solved it.
 */
const sparkle = (_p: Palette) =>
  `<path transform="translate(-2.1 -2.1) scale(.42)" fill="#fff" fill-opacity=".9"`
  + ` d="M5 1.8Q5.5 4.5 8.2 5 5.5 5.5 5 8.2 4.5 5.5 1.8 5 4.5 4.5 5 1.8"/>`;

/**
 * ⚠️ FIVE MAGNITUDES AT WEIGHTS SOMEBODY TUNED. Most stars barely there, a few
 * not: a field of equal dots is a texture, that ratio is a sky.
 *
 * ⚠️ AND ONLY A SHARE OF THE BRIGHT ONES MOVE. A field where everything twinkles
 * is a field nobody can read over — the movement stops reading as life and
 * starts reading as noise. Roughly one in three of the two brightest, half the
 * sparkles, none of the faint.
 */
const STARS = {
  id: "star",
  /** ⚠️ Per megapixel at density 1 — see `Speck`. */
  per: 190,
  variants: [
    { weight: 2, draw: dot(0.7, 0.5) },
    { weight: 3, draw: dot(0.8, 0.85) },
    { weight: 3, draw: dot(1.1, 0.85), beat: "medium" as const, moving: 0.34 },
    { weight: 1, draw: dot(1.4, 0.9), beat: "large" as const, moving: 0.34 },
    { weight: 1, draw: sparkle, beat: "sparkle" as const, moving: 0.5 },
  ],
} as const;

/**
 * ⚠️ MOTES, NOT STARS, AND THEY ARE WHAT MAKES DAYLIGHT A SKY RATHER THAN A
 * GRADIENT. Nothing is visible in a daytime sky except air — so what a day
 * carries is the faintest possible drift of light, dark against the pale rather
 * than bright against the deep. A white speck on paper is invisible; a dark one
 * is dirt; a very slightly darker one at a very low count is depth.
 */
const HAZE = {
  id: "haze",
  per: 26,
  variants: [
    { weight: 3, draw: (p: Palette) => `<circle r="1.6" fill="${p.deep}" fill-opacity=".07"/>` },
    { weight: 1, draw: (p: Palette) => `<circle r="2.6" fill="${p.lit}" fill-opacity=".08"/>` },
  ],
} as const;

/**
 * ⚠️ A GROUND IS FOUR LAYERS AND THE ORDER IS THE PICTURE, top-down exactly as
 * the eye reads it: the light coming up off the surface underfoot, a far halo of
 * the same light high and off-centre, and the deep behind everything.
 * `background-image` paints its first entry last, so this list reads as seen.
 */
export const NIGHT: Family = {
  id: "space.night",
  slots: ["deep", "lit"],
  tile: { w: 1400, h: 1000 },
  specks: [STARS],
  ground: (p) => [
    `radial-gradient(150% 62% at 50% 112%, color-mix(in oklab, ${p.lit} 30%, transparent) 0%, transparent 66%)`,
    `radial-gradient(95% 48% at 74% -14%, color-mix(in oklab, ${p.lit} 12%, transparent) 0%, transparent 70%)`,
    `linear-gradient(180deg, ${p.deep} 0%, color-mix(in oklab, ${p.deep} 80%, #000) 58%,`
      + ` color-mix(in oklab, ${p.deep} 62%, #000) 100%)`,
  ],
};

/**
 * ⚠️ DAY IS NOT NIGHT LIGHTENED. It is a different set of decisions: the light
 * comes from ABOVE rather than from underfoot, the deep survives only as the
 * high blue a sky keeps at its zenith, and the horizon is the warm end. Trying
 * to reach this by turning a night sky's opacity down is what produced three
 * builds of grey.
 */
export const DAY: Family = {
  id: "space.day",
  slots: ["deep", "lit"],
  tile: { w: 1400, h: 1000 },
  specks: [HAZE],
  ground: (p) => [
    /* The sun's quarter, high and soft — the brightest thing on the page. */
    `radial-gradient(110% 55% at 74% -8%, color-mix(in oklab, ${p.lit} 46%, #fff) 0%, transparent 62%)`,
    /* The horizon takes the world's own colour, warmed most of the way to white. */
    `radial-gradient(160% 46% at 50% 108%, color-mix(in oklab, ${p.lit} 30%, #fff) 0%, transparent 70%)`,
    /* ⚠️ THE ZENITH IS THE ONLY PLACE THE DEEP SURVIVES, and only a fifth of it.
       A sky is darkest overhead and palest at the horizon; the same gradient the
       other way round is a swimming pool. */
    `linear-gradient(180deg, color-mix(in oklab, ${p.deep} 22%, #fff) 0%,`
      + ` color-mix(in oklab, ${p.deep} 10%, #fff) 46%,`
      + ` color-mix(in oklab, ${p.lit} 7%, #fff) 100%)`,
  ],
};

/** ⚠️ One family, two skies. The theme picks — see `worldCss`. */
export const SPACE = { night: NIGHT, day: DAY } as const;
