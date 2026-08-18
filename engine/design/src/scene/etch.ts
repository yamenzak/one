/**
 * ETCH — ruled geometry, which is the third thing a ground can be.
 *
 * ⚠️ SIX MORE HAND-WRITTEN AMBIENCES END HERE. `dots`, `grid`, `arc`, `prism`,
 * `terrace` and `rays` were six ways of saying "drawn lines at a regular pitch,
 * reading as technical rather than as woven", each with its own repeating
 * gradient and its own two numbers. They are one family: a lattice whose tile
 * draws some subset of its own edges and diagonals, seeded.
 *
 * ⚠️ A LATTICE, NOT A REPEATING GRADIENT, AND THAT IS WHAT MAKES IT A FAMILY. A
 * `repeating-linear-gradient` can only be one pitch at one angle; a tile can be
 * anything, and the seed picks WHICH — so the same declaration yields ruled
 * paper, a square grid, a brick course, a herringbone and a diagonal hatch. Six
 * names became one file because the difference between them was always a choice
 * inside one cell.
 *
 * ⚠️ ETCHED IS NOT FIBROUS, AND THE DIFFERENCE IS PITCH. A field of marks finer
 * than the eye separates is micro-texture, and on paper a dense dark field of it
 * is grime — which is why the old file killed its threads in light mode outright.
 * An etched line is MACRO: sparse enough that each one reads as a printed line,
 * the way a ruled notebook is not a dirty page. This family stays visible in
 * both themes because its pitch is on the right side of that boundary.
 */

import type { Family } from "./scene.js";

/*
  ⚠️ THE UNIT SQUARE, so the geometry survives every cell size — see `Tiles`.
  Every path here starts and ends on an EDGE MIDPOINT or a CORNER, which is what
  lets adjacent cells continue each other's lines instead of stopping at the
  seam.
*/
const RULE = "M0 .5H1";
const POST = "M.5 0V1";
const CROSS = `${RULE}${POST}`;
const SLASH = "M0 1L1 0";
const BACK = "M0 0L1 1";
const CHEVRON = "M0 1L.5 .5L1 1";
const STEP = "M0 .5H.5V1H1";
const CORNER = "M0 .5A.5 .5 0 0 1 .5 0";

/**
 * ⚠️ NINE MARKS AT WEIGHTS SOMEBODY TUNED, AND THE HEAVY ONES ARE RARE. A field
 * where every cell is drawn is a grid; a field where most cells are a single
 * rule and a few are something else is a MEASURE — the eye reads regularity with
 * incident, which is what technical drawing looks like and what wallpaper does
 * not. The blank is the highest weight for exactly that reason.
 */
const marks = (ink: string, alpha: number) => {
  const line = (d: string) => () =>
    `<path d="${d}" fill="none" stroke="${ink}" stroke-opacity="${alpha}"`
    + ` stroke-width=".016" stroke-linecap="square"/>`;
  return {
    id: "rule",
    cell: 74,
    variants: [
      /* ⚠️ Nothing at all, and it is the commonest cell. */
      { weight: 5, draw: () => "" },
      { weight: 4, draw: line(RULE) },
      { weight: 3, draw: line(POST) },
      { weight: 2, draw: line(CROSS), beat: "quarter" as const, moving: 0.16 },
      { weight: 2, draw: line(SLASH) },
      { weight: 2, draw: line(BACK) },
      { weight: 1, draw: line(CHEVRON), beat: "half" as const, moving: 0.2 },
      { weight: 1, draw: line(STEP), beat: "half" as const, moving: 0.14 },
      { weight: 1, draw: line(CORNER), beat: "quarter" as const, moving: 0.2 },
    ],
  };
};

/**
 * ⚠️ AND A SHARE OF THE CELLS TURN, WHICH IS WHAT KEEPS IT FROM BEING A PRINT.
 * A quarter turn on a rule makes it a post and on a diagonal swaps which way it
 * leans, so the drawing rearranges without anything arriving or leaving — the
 * same argument `loops` makes, at a much lower share because a straight line
 * snapping is more noticeable than an arc re-routing.
 */
const NIGHT: Family = {
  id: "etch.night",
  slots: ["deep", "lit"],
  ink: "fixed",
  tile: { w: 1184, h: 888 },
  tiles: [marks("#fff", 0.16)],
  veil: (p) => `color-mix(in oklab, ${p.deep} 88%, #000)`,
  ground: (p, r) => [
    `radial-gradient(${100 + r() * 40}% ${56 + r() * 24}% at ${20 + r() * 60}% ${-16 + r() * 30}%,`
      + ` color-mix(in oklab, ${p.lit} 8%, transparent) 0%, transparent 74%)`,
    `linear-gradient(180deg, ${p.deep} 0%, color-mix(in oklab, ${p.deep} 84%, #000) 100%)`,
  ],
};

const DAY: Family = {
  id: "etch.day",
  slots: ["deep", "lit"],
  ink: "fixed",
  tile: { w: 1184, h: 888 },
  /*
    ⚠️ HALVED RATHER THAN KILLED — see the header — AND THEN HALVED AGAIN. Black
    at eight percent on paper is a ruled page you read THROUGH; the same pattern
    on near-black at sixteen is light catching an edge. Ink and light are not one
    number at two strengths, which is the whole reason a family declares a `day`.
  */
  tiles: [marks("#000", 0.045)],
  veil: (p) => `color-mix(in oklab, ${p.deep} 8%, #fff)`,
  ground: (p, r) => [
    `radial-gradient(${100 + r() * 40}% ${56 + r() * 24}% at ${20 + r() * 60}% ${-16 + r() * 30}%,`
      + ` color-mix(in oklab, ${p.lit} 12%, #fff) 0%, transparent 72%)`,
    `linear-gradient(180deg, color-mix(in oklab, ${p.deep} 3%, #fff) 0%,`
      + ` color-mix(in oklab, ${p.deep} 13%, #fff) 100%)`,
  ],
};

export const ETCH = { night: NIGHT, day: DAY } as const;
