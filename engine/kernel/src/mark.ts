/**
 * THE MARK, AS GEOMETRY — one description, drawn twice.
 *
 * ⚠️ IT IS HERE BECAUSE TWO PACKAGES DRAW IT AND NEITHER MAY IMPORT THE OTHER.
 * `@engine/design` draws it as SVG in a browser; `@engine/runtime` rasterises it
 * to a PNG in a Worker, because a phone's home screen and a browser tab cannot
 * take an SVG everywhere and a Worker has no canvas to make one from. Written
 * out in both, they are two logos with one name — and the one nobody looks at is
 * the one on somebody's home screen for a year.
 *
 * ⚠️ SO THIS FILE IS NUMBERS AND NOTHING ELSE. No SVG strings, no colours, no
 * sizes: a renderer that received markup would be a renderer that could not
 * rasterise, and a colour here would be a brand decision made in the package
 * that is meant to hold none.
 *
 * ⚠️ AND IT IS ANALYTIC, NOT A PATH. Every shape is a half-plane, a rectangle or
 * a circle, so "is this point inside" is arithmetic — which is what lets the
 * rasteriser antialias by sampling instead of shipping a path interpreter.
 */

/**
 * WHERE THE INK IS, IN THE 100-UNIT SQUARE THE MARK WAS DRAWN ON.
 *
 * ⚠️ THE DRAWING IS NOT THE CANVAS. The numeral fills neither dimension of the
 * square it came from, so anything that treats the square as the mark renders it
 * 36% short and floats it in a gutter wider than itself. Every consumer crops to
 * this box, which is what makes a declared size the height of the ink.
 */
export const MARK_INK = { x: 28, y: 18, w: 38, h: 64 } as const;

/** Whose mark: the deployment's, or a product's. */
export type MarkOf = "one" | "space";

/* ------------------------------------------------------------------ parts --- */

/**
 * THE BEAK — the one asymmetry, and the thing that makes the stem a numeral
 * rather than a bar.
 *
 * ⚠️ A TRIANGLE BY ITS CORNERS, so a renderer can test a point against it
 * without parsing anything. Clockwise, which the inside test relies on.
 */
export const MARK_BEAK = [
  { x: 28, y: 36 }, { x: 46, y: 18 }, { x: 46, y: 36 },
] as const;

/** THE STEM — the body of the numeral, and what the counters are cut out of. */
export const MARK_STEM = { x: 46, y: 18, w: 20, h: 64 } as const;

/**
 * THE COUNTERS — cut OUT of the stem, never drawn on top of it.
 *
 * ⚠️ THEY ARE STROKES RATHER THAN SHAPES, which is the whole character of the
 * mark: a solid stem with light let through it in two straight slots. Given as a
 * centre line and a width so both renderers cut the same slot — the SVG as a
 * stroked line, the rasteriser as a distance test.
 */
export interface Slot {
  readonly x: number;
  readonly y1: number;
  readonly y2: number;
  readonly width: number;
}

/**
 * THE RINGS — a product's mark, and ONLY a product's.
 *
 * ⚠️ TWO RINGS ON THE STEM, OFFSET UP AND DOWN: a body on an orbit rather than a
 * pair of dots, which is what keeps the counters from reading as a barcode. The
 * hole is drawn back IN, so a ring is a cut disc with a kept centre — the order
 * matters and both renderers apply it the same way.
 */
export interface Ring {
  readonly x: number;
  readonly y: number;
  /** The disc cut out of the stem. */
  readonly cut: number;
  /** The dot kept inside the cut. */
  readonly keep: number;
}

export interface MarkParts {
  readonly slots: readonly Slot[];
  readonly rings: readonly Ring[];
}

/**
 * ⚠️ THE SAME STEM, WITH SOMETHING ADDED — never a different shape. A product
 * that got its own outline would make a shelf of products read as a folder of
 * logos; the family is the point, so the difference is inside the counters.
 *
 * ⚠️ AND THE PLATFORM'S SLOTS ARE UNEVEN ON PURPOSE (3 and 2.5). Matched, the
 * two counters read as a pair of rails; uneven, the mark has a direction.
 */
export function partsOf(of: MarkOf): MarkParts {
  return of === "one"
    ? {
      slots: [
        { x: 53, y1: 18, y2: 82, width: 3 },
        { x: 60, y1: 18, y2: 82, width: 2.5 },
      ],
      rings: [],
    }
    : {
      slots: [
        { x: 52, y1: 18, y2: 82, width: 2 },
        { x: 60, y1: 18, y2: 82, width: 2 },
      ],
      rings: [
        { x: 52, y: 36, cut: 4.5, keep: 2 },
        { x: 60, y: 62, cut: 4.5, keep: 2 },
      ],
    };
}

/**
 * ⚠️ THE BEAK IS DIMMED ON A PRODUCT'S MARK, NOT COLOURED. The drawing this came
 * from tinted it slate blue, which is a hue in a system that decided to be
 * monochrome — the same ink at lower opacity says the same thing on any ground
 * and needs no second token.
 */
export const beakOpacity = (of: MarkOf): number => (of === "space" ? 0.55 : 1);

/* ----------------------------------------------------------------- inside --- */

/**
 * IS THIS POINT IN THE INK — the whole mark, in the drawing's coordinates.
 *
 * ⚠️ ONE ANSWER FOR BOTH RENDERERS TO AGREE WITH. The SVG builds the same shape
 * out of a mask; this is what the rasteriser samples. They are checked against
 * each other rather than trusted, because a mark is only correct in the sense
 * that somebody looked at it.
 *
 * ⚠️ THE ORDER IS CUT-THEN-KEEP. A ring is a disc removed from the stem with a
 * dot put back in the middle of it, so testing the dot first would fill a hole
 * that was never cut and the ring would vanish.
 *
 * Returns the ink's OPACITY at that point — 0 outside, 1 in the stem, and the
 * beak's own value in the beak.
 */
export function inkAt(of: MarkOf, x: number, y: number): number {
  const { slots, rings } = partsOf(of);

  if (inStem(x, y)) {
    for (const ring of rings) {
      const d = Math.hypot(x - ring.x, y - ring.y);
      /* Inside the kept dot: ink again. Inside the cut only: nothing. */
      if (d <= ring.keep) return 1;
      if (d <= ring.cut) return 0;
    }
    for (const slot of slots) {
      if (y >= slot.y1 && y <= slot.y2 && Math.abs(x - slot.x) <= slot.width / 2) return 0;
    }
    return 1;
  }

  return inBeak(x, y) ? beakOpacity(of) : 0;
}

const inStem = (x: number, y: number): boolean =>
  x >= MARK_STEM.x && x <= MARK_STEM.x + MARK_STEM.w
  && y >= MARK_STEM.y && y <= MARK_STEM.y + MARK_STEM.h;

/**
 * ⚠️ THE SIGN OF THE CROSS PRODUCT AGAINST ALL THREE EDGES, which needs the
 * corners to wind consistently — they do, and `MARK_BEAK` says so. A
 * bounding-box test would take the corner the diagonal cuts away, which is the
 * only interesting part of this shape.
 */
function inBeak(x: number, y: number): boolean {
  const side = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
    (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
  const [a, b, c] = MARK_BEAK;
  const s1 = side(a, b);
  const s2 = side(b, c);
  const s3 = side(c, a);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}
