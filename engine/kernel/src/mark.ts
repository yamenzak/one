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

/**
 * Whose mark: the deployment's, OneSpace's, the wallet's, or OneInventory's.
 *
 * ⚠️ EVERY ONE OF THESE IS A SURFACE OF THIS DEPLOYMENT, WHICH IS WHY IT IS
 * ADMISSIBLE HERE. The kernel holds no product vocabulary — a collection called
 * `invoice` or a role called `coach` would be an app's word in shared code — but
 * a MARK is not vocabulary, it is geometry, and it is in the kernel because two
 * packages draw it and neither may import the other. What a member of this list
 * costs is a drawing, and what it buys is that the family cannot drift: a
 * product with its own outline makes a shelf of products read as a folder of
 * logos.
 */
export type MarkOf = "one" | "space" | "wallet" | "inventory";

/**
 * ⚠️ THE WALLET'S INK IS WIDER, BECAUSE ITS BARS LEAVE THE NUMERAL. They cross
 * the stem and stick out both sides — that overhang IS the mark — so cropping to
 * the numeral's box would clip the only part that distinguishes it and leave a
 * plain `1` beside every credit figure.
 */
const WALLET_INK = { x: 28, y: 18, w: 46, h: 64 } as const;

/**
 * WHERE THE INK IS, FOR ONE MARK.
 *
 * ⚠️ ASKED RATHER THAN ASSUMED, and that is what the wallet forced. Every
 * consumer crops to this box to make a declared size mean the height of the ink;
 * a single constant was correct while every mark was the same silhouette, and
 * wrong the moment one was not — silently, by clipping.
 */
export const inkOf = (of: MarkOf): { x: number; y: number; w: number; h: number } =>
  (of === "wallet" ? WALLET_INK : MARK_INK);

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

/**
 * THE BARS — the wallet's, and only the wallet's.
 *
 * ⚠️ THEY ARE ADDED, NOT CUT, AND THEY LEAVE THE STEM. Two slanted bars crossing
 * the numeral and overhanging both sides: cards in a wallet, held at the angle a
 * hand holds them. Every other difference in this family is INSIDE the counters,
 * which is the rule that keeps a shelf of products from reading as a folder of
 * logos — the wallet breaks it deliberately, because it is not a product. It is
 * a currency mark, and it has to be recognisable at twelve pixels next to a
 * number.
 *
 * ⚠️ A PARALLELOGRAM BY ITS TOP EDGE AND A THICKNESS, so the inside test is one
 * interpolation. Given as corners it would be a path, and a path is the one
 * thing this file may not contain.
 */
export interface Bar {
  readonly x1: number;
  readonly x2: number;
  /** The top edge's y at `x1` and at `x2`. */
  readonly y1: number;
  readonly y2: number;
  /** Vertical thickness, constant along the bar. */
  readonly thickness: number;
}

export interface MarkParts {
  readonly slots: readonly Slot[];
  readonly rings: readonly Ring[];
  readonly bars: readonly Bar[];
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
  if (of === "one") {
    return {
      slots: [
        { x: 53, y1: 18, y2: 82, width: 3 },
        { x: 60, y1: 18, y2: 82, width: 2.5 },
      ],
      rings: [],
      bars: [],
    };
  }
  if (of === "space") {
    return {
      slots: [
        { x: 52, y1: 18, y2: 82, width: 2 },
        { x: 60, y1: 18, y2: 82, width: 2 },
      ],
      rings: [
        { x: 52, y: 36, cut: 4.5, keep: 2 },
        { x: 60, y: 62, cut: 4.5, keep: 2 },
      ],
      bars: [],
    };
  }
  /*
    ⚠️ ONEINVENTORY'S COUNTERS ARE A BARCODE, AND THE UNEVENNESS IS THE WHOLE
    DRAWING. Six slots of six widths inside the same stem: a numeral read as a
    code, which is what the product does to everything it is pointed at. Matched
    widths would be a grating; these are the bar pattern a scanner would see.

    ⚠️ AND THEY ARE INSIDE THE STEM, WHICH IS THE RULE THE WALLET BREAKS AND THIS
    DOES NOT. The silhouette stays the family's; only the light through it
    changes.

    ⚠️ THE BEAK IS THE ONE PLACE THIS PRODUCT IS ALLOWED A HUE, and it is not
    here — a colour in this file would be a brand decision made in the package
    that holds none. `AMBER` is the design system's, applied where the mark is
    drawn.
  */
  if (of === "inventory") {
    return {
      slots: [
        { x: 49, y1: 18, y2: 82, width: 1.8 },
        { x: 52, y1: 18, y2: 82, width: 1 },
        { x: 54.5, y1: 18, y2: 82, width: 2.5 },
        { x: 58, y1: 18, y2: 82, width: 1.2 },
        { x: 61, y1: 18, y2: 82, width: 3 },
        { x: 65, y1: 18, y2: 82, width: 1.5 },
      ],
      rings: [],
      bars: [],
    };
  }
  /*
    ⚠️ THE WALLET'S STEM IS SOLID, AND THAT IS THE ONE PLACE IT LEAVES THE
    FAMILY. It is a currency mark: it sits at twelve pixels beside a credit
    figure, where a three-unit counter closes up into a smudge and a two-unit one
    is already gone. What survives at that size is the silhouette, so the wallet
    puts everything into the silhouette and nothing into the counters.
  */
  return {
    slots: [],
    rings: [],
    bars: [
      { x1: 38, x2: 74, y1: 44, y2: 38, thickness: 4.5 },
      { x1: 38, x2: 74, y1: 56, y2: 50, thickness: 4.5 },
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
 * A MARK'S SHAPE, RESOLVED ONCE — everything `inkAt` needs and nothing else.
 *
 * ⚠️ IT EXISTS SO THE RESOLUTION CANNOT HAPPEN INSIDE A LOOP. `inkAt` used to
 * take a `MarkOf` and call `partsOf` itself, which reads correctly and is right
 * for the SVG, where it happens once. The rasteriser asks the same question
 * millions of times for one picture — a 512px tile at the rate it shipped with
 * was 4,194,304 of them — so that convenience was several million array-and-
 * object allocations for a shape that did not change between any two calls.
 * Making the caller hold the shape is what makes the hoist unavoidable rather
 * than remembered.
 */
export interface MarkShape {
  readonly parts: MarkParts;
  readonly beak: number;
}

/** ⚠️ ONE CALL FOR BOTH HALVES, so no caller can sample one mark's parts with
    another's beak — see `MarkShape` for why the pair travels together. */
export const shapeOf = (of: MarkOf): MarkShape =>
  ({ parts: partsOf(of), beak: beakOpacity(of) });

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
export function inkAt(shape: MarkShape, x: number, y: number): number {
  const { slots, rings, bars } = shape.parts;

  /* ⚠️ THE BARS ARE TESTED FIRST BECAUSE THEY ARE ADDED RATHER THAN CUT. Asked
     after the stem, the half of each bar that overhangs would be ink and the half
     crossing the stem would be whatever the stem said — which is the same shape
     only while the stem has no counters, and would silently stop being true the
     day the wallet grew one. */
  for (const bar of bars) {
    if (inBar(bar, x, y)) return 1;
  }

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

  return inBeak(x, y) ? shape.beak : 0;
}

/**
 * ⚠️ ONE INTERPOLATION AND TWO COMPARISONS. The top edge's height at `x` is the
 * line between its two ends; the bar is everything from there down by its
 * thickness. A bounding box would take the two triangles the slant cuts away,
 * which on a bar this shallow is most of what makes it look slanted.
 */
function inBar(bar: Bar, x: number, y: number): boolean {
  if (x < bar.x1 || x > bar.x2) return false;
  const top = bar.y1 + ((bar.y2 - bar.y1) * (x - bar.x1)) / (bar.x2 - bar.x1);
  return y >= top && y <= top + bar.thickness;
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
