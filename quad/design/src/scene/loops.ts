/**
 * LOOPS — a truchet, and the smallest declaration in this directory.
 *
 * ⚠️ ONE TILE. FOUR ROTATIONS. THAT IS THE ENTIRE FAMILY, and it is the clearest
 * answer this repository has to "can a seed really give endless variation". The
 * tile is two quarter-arcs joining the midpoints of adjacent edges; laid on a
 * grid with each cell independently turned, the arcs run off every edge into
 * their neighbours and the field becomes long continuous curves that loop,
 * branch and close. A 12 × 9 grid has 4^108 arrangements — more than there are
 * atoms — and every one of them is recognisably the same pattern. Nothing here
 * is drawn twice and nothing is tuned per instance.
 *
 * ⚠️ IT IS ALSO WHY `Tiles` HAD TO EXIST. `scatter` jitters on purpose, and a
 * truchet whose tiles are three pixels out is a field of curves ending in
 * mid-air. Adjacency IS the mark here — the pattern lives in the seams.
 *
 * ⚠️ AND THE MOTION IS A TURN RATHER THAN A FADE. A line has no brightness to
 * give; what it has is ORIENTATION. One tile turning by a quarter re-routes
 * every curve running through it — the lines that met now miss, two others join
 * — so the whole field re-draws itself without a single mark appearing or
 * disappearing. It holds for four fifths of the cycle and turns in the rest, so
 * it is never something you catch moving, only something that was different when
 * you looked back.
 *
 * ⚠️ THE INK IS FIXED, WHICH IS WHAT LETS A PRODUCT WEAR THIS. A product has no
 * generated picture to read two colours out of — only the theme — and
 * `var(--brand)` inside an SVG is a string rather than a colour. So the arcs are
 * white or black and the GROUND carries the hue. See `Family.ink`.
 */

import type { Family } from "./scene.js";

/**
 * ⚠️ THE UNIT SQUARE, so the geometry survives every cell size — see `Tiles`.
 * Two arcs: left-middle to top-middle, and bottom-middle to right-middle. Each
 * has radius ½, which is the only radius that meets an edge at a right angle,
 * which is the only way a curve continues smoothly into the next cell rather
 * than arriving at it with a kink.
 */
const ARCS = "M0 .5A.5 .5 0 0 1 .5 0M.5 1A.5 .5 0 0 0 1 .5";

/**
 * ⚠️ ROTATION AS A VARIANT AND NOT AS A RANDOM NUMBER, because a variant is what
 * the engine already weights, picks and beats. Four at equal weight is a fair
 * truchet; unequal weights would bias the field toward one diagonal, which the
 * eye reads as a grain in the paper — occasionally lovely, and a decision rather
 * than an accident.
 */
/**
 * ⚠️ THE STROKE IS A FRACTION OF THE CELL, AND THE FIRST NUMBER WAS THE AVATAR'S.
 * DiceBear draws this at 8 units in a 28-unit tile — a bold graphic, correct
 * inside a 40px disc. The same fraction against a 116px cell is a THIRTY-PIXEL
 * white ribbon, and the first render of it was a flat grey wall with no pattern
 * visible at all. A ground is fine lines at a hundredth of the contrast of
 * anything else on the screen; the same drawing, two orders of weight apart.
 */
const turn = (deg: number, ink: string, alpha: number) => () =>
  `<g${deg ? ` transform="rotate(${deg} .5 .5)"` : ""}>`
  + `<path d="${ARCS}" fill="none" stroke="${ink}" stroke-opacity="${alpha}"`
  + ` stroke-width=".026" stroke-linecap="round"/></g>`;

/**
 * ⚠️ HALF THE TILES TURN, SPLIT ACROSS TWO PERIODS THAT DO NOT DIVIDE INTO EACH
 * OTHER. All of them on one beat is the whole field flipping at once, which
 * reads as a page redraw; none of them is wallpaper. Two beats at 47s and 71s
 * means the field is never in the same arrangement twice within an hour and
 * never changes anywhere you happen to be looking.
 */
/**
 * ⚠️ THE CELL IS SMALL ENOUGH THAT THE MOTIF IS NOT A SHAPE. At 62 the arcs met
 * in four-pointed stars about 80px across — big enough to read as a DRAWING, and
 * a drawing behind a page is decoration competing with it rather than a ground
 * under it. The same tile at 38 is a weave: material at arm's length, a pattern
 * only if you go looking. Nothing about the family changed; a truchet is scale
 * more than it is anything else.
 *
 * ⚠️ AND THE ALPHA IS A PARAMETER NOW, WHICH IT SAID IT WAS AND WAS NOT. `DAY`
 * has carried a paragraph about black arcs at a third the strength since it was
 * written, and both skies shipped at `.2` — so light mode was ink on paper at a
 * white-light's opacity, which is precisely the printed pattern that paragraph
 * describes as the thing to avoid. A comment is not a mechanism.
 */
const weave = (ink: string, alpha: number) => ({
  id: "arc",
  cell: 38,
  variants: [
    { weight: 1, draw: turn(0, ink, alpha), beat: "quarter" as const, moving: 0.28 },
    { weight: 1, draw: turn(90, ink, alpha), beat: "half" as const, moving: 0.28 },
    { weight: 1, draw: turn(180, ink, alpha), beat: "quarter" as const, moving: 0.22 },
    { weight: 1, draw: turn(270, ink, alpha), beat: "half" as const, moving: 0.22 },
  ],
});

/**
 * ⚠️ THE GROUND IS SEEDED, WHICH THE FIRST TWO FAMILIES ARE NOT. `ground`
 * receives its own stream and `space` and `aura` both ignored it — so two
 * workspaces with the same two colours had, to the pixel, the same ground. The
 * pattern varied and the light did not, which is half a world. Here the light
 * moves: where the wash sits, how wide it is, which corner is heaviest.
 */
const NIGHT: Family = {
  id: "loops.night",
  slots: ["deep", "lit"],
  ink: "fixed",
  tile: { w: 1160, h: 900 },
  tiles: [weave("#fff", 0.13)],
  veil: (p) => `color-mix(in oklab, ${p.deep} 88%, #000)`,
  /*
    ⚠️ FAR WEAKER THAN THE FAMILIES THAT READ A PICTURE, AND THE REASON IS THE
    PALETTE. A workspace's `lit` is a planet's own colour — a real hue, which
    carries at a quarter strength. A product's is `var(--brand)`, and this
    product is MONOCHROME, so a quarter of it is a grey wash. The first render
    was a flat mid-grey wall covering the top two thirds of the screen with the
    pattern invisible underneath it. A `fixed`-ink family lives on a theme's
    palette, and a theme's palette may have no chroma at all.
  */
  ground: (p, r) => [
    `radial-gradient(${60 + r() * 26}% ${44 + r() * 18}% at ${18 + r() * 64}% ${8 + r() * 26}%,`
      + ` color-mix(in oklab, ${p.lit} 7%, transparent) 0%, transparent 74%)`,
    `radial-gradient(${88 + r() * 40}% 62% at ${20 + r() * 60}% ${86 + r() * 20}%,`
      + ` color-mix(in oklab, ${p.lit} 4%, transparent) 0%, transparent 76%)`,
    `linear-gradient(180deg, ${p.deep} 0%, color-mix(in oklab, ${p.deep} 84%, #000) 100%)`,
  ],
};

/**
 * ⚠️ BLACK ARCS AT ROUGHLY A THIRD THE STRENGTH, AND NOW ACTUALLY SO. A white
 * line on near-black is light caught on an edge and can be quite present; the
 * same line in black on paper is INK, and ink at the same opacity is a printed
 * pattern somebody has to read through. The pitch is identical and only the
 * weight changes, which is what keeps the two skies one family.
 */
const DAY: Family = {
  id: "loops.day",
  slots: ["deep", "lit"],
  ink: "fixed",
  tile: { w: 1160, h: 900 },
  tiles: [weave("#000", 0.05)],
  veil: (p) => `color-mix(in oklab, ${p.deep} 8%, #fff)`,
  ground: (p, r) => [
    `radial-gradient(${60 + r() * 26}% ${44 + r() * 18}% at ${18 + r() * 64}% ${8 + r() * 26}%,`
      + ` color-mix(in oklab, ${p.lit} 11%, #fff) 0%, transparent 72%)`,
    `radial-gradient(${88 + r() * 40}% 62% at ${20 + r() * 60}% ${86 + r() * 20}%,`
      + ` color-mix(in oklab, ${p.lit} 6%, #fff) 0%, transparent 76%)`,
    `linear-gradient(180deg, color-mix(in oklab, ${p.deep} 3%, #fff) 0%,`
      + ` color-mix(in oklab, ${p.deep} 14%, #fff) 100%)`,
  ],
};

export const LOOPS = { night: NIGHT, day: DAY } as const;
