/**
 * THE CHART ARITHMETIC, TESTED — because a bar at the correct pixel for the wrong
 * number looks exactly like a bar at the correct pixel for the right one.
 *
 * ⚠️ EVERY CASE BELOW IS A WAY A CHART LIES RATHER THAN BREAKS. None of them
 * throws, none of them renders oddly, and each produces a picture somebody would
 * act on. That is the whole reason the deciding is pure functions and this file
 * exists beside them.
 */

import { describe, expect, it } from "vitest";
import {
  arcPath, arcs, areaPath, band, compact, extent, linePath, norm, place, polar, stack,
  stackSpan, ticks,
} from "./scale.js";

describe("the domain", () => {
  it("includes zero by default, because a bar's length is the value", () => {
    /* Without this, bars of 90 and 100 differ by a factor of ten on screen. */
    expect(extent([90, 100])).toEqual({ min: 0, max: 100 });
  });

  it("leaves zero out when asked, because a line's slope is the value", () => {
    expect(extent([90, 100], false)).toEqual({ min: 90, max: 100 });
  });

  it("gives a flat series a band to sit in rather than a division by zero", () => {
    expect(extent([7, 7], false)).toEqual({ min: 6, max: 8 });
  });

  it("ignores gaps rather than reading them as zero", () => {
    expect(extent([5, null, 9], false)).toEqual({ min: 5, max: 9 });
  });

  it("survives having nothing at all", () => {
    expect(extent([])).toEqual({ min: 0, max: 1 });
  });
});

describe("ticks", () => {
  it("lands on numbers a person can read off the axis", () => {
    /* ⚠️ 200, NOT 500. Rounding the interval UP to the first nice step gave two
       intervals where four were asked for — the axis was legal and useless. */
    expect(ticks({ min: 0, max: 1000 }, 4)).toEqual([0, 200, 400, 600, 800, 1000]);
  });

  it("does not emit floating-point dust", () => {
    /* Three steps of 0.1 is 0.30000000000000004 without the rounding. */
    expect(ticks({ min: 0, max: 0.5 }, 5)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  it("refuses to loop forever on a degenerate span", () => {
    expect(ticks({ min: 3, max: 3 })).toEqual([3]);
  });
});

describe("bands", () => {
  it("caps the mark and leaves the rest as air", () => {
    /* A slot of 100px does not produce a 100px bar — six of those is a block. */
    expect(band(600, 6).thick).toBe(24);
  });

  it("lets a crowded axis win over the cap", () => {
    const { thick } = band(60, 6);
    expect(thick).toBeLessThan(24);
    expect(thick).toBeGreaterThan(0);
  });

  it("centres the mark in its slot", () => {
    const { step, thick, offset } = band(600, 6);
    expect(offset * 2 + thick).toBeCloseTo(step);
  });
});

describe("paths", () => {
  const y = { min: 0, max: 10 };
  const x = { min: 0, max: 2 };

  it("flips y exactly once, so the maximum is at the top", () => {
    const [low, high] = place([{ x: 0, y: 0 }, { x: 2, y: 10 }], x, y, 100, 50);
    expect(low!.y).toBe(50);
    expect(high!.y).toBe(0);
  });

  it("breaks the line at a gap instead of interpolating across it", () => {
    const placed = place([{ x: 0, y: 1 }, { x: 1, y: null }, { x: 2, y: 3 }], x, y, 100, 50);
    /* Two `M` commands: the days with no reading are not a straight descent. */
    expect(linePath(placed).match(/M/g)).toHaveLength(2);
  });

  it("closes an area per run, so a gap is a hole rather than a valley", () => {
    const placed = place([{ x: 0, y: 1 }, { x: 1, y: null }, { x: 2, y: 3 }], x, y, 100, 50);
    expect(areaPath(placed, 50).match(/Z/g)).toHaveLength(2);
  });

  it("emits nothing for a series that is entirely missing", () => {
    expect(linePath([null, null])).toBe("");
  });
});

describe("stacking", () => {
  it("is a running total", () => {
    expect(stack([2, 3])).toEqual([{ from: 0, to: 2 }, { from: 2, to: 5 }]);
  });

  it("stacks each sign on its own side of the baseline", () => {
    /* The naive running total draws the -4 back over the +3 and shows a total of
       -1 as though it were the height of the bar. */
    expect(stack([3, -4])).toEqual([{ from: 0, to: 3 }, { from: -4, to: 0 }]);
  });

  it("measures a whole set of stacks, not just the tallest single value", () => {
    expect(stackSpan([[2, 3], [4, 4]])).toEqual({ min: 0, max: 8 });
  });
});

describe("formatting", () => {
  it("compacts a headline and keeps one decimal where it carries information", () => {
    expect(compact(12914)).toBe("12.9K");
    expect(compact(4_200_000)).toBe("4.2M");
  });

  it("drops the decimal once it stops meaning anything", () => {
    expect(compact(121_000)).toBe("121K");
  });

  it("groups four figures rather than compacting them — same width, less said", () => {
    expect(compact(1284)).toBe("1,284");
  });

  it("leaves a small integer alone", () => {
    expect(compact(42)).toBe("42");
  });

  it("compacts a negative the same way, sign kept", () => {
    expect(compact(-25_400)).toBe("-25.4K");
  });

  it("drops a trailing zero decimal, which carries nothing", () => {
    expect(compact(25_000)).toBe("25K");
  });
});

describe("arcs", () => {
  it("starts at twelve o'clock and runs clockwise", () => {
    /* SVG's own angles start at three and run the other way; a circular chart
       that forgets is a quarter turn out and mirrored, which reads as a design
       decision rather than as a bug. */
    const top = polar(50, 50, 40, 0);
    expect(top.x).toBeCloseTo(50);
    expect(top.y).toBeCloseTo(10);
    const quarter = polar(50, 50, 40, 0.25);
    expect(quarter.x).toBeCloseTo(90);
    expect(quarter.y).toBeCloseTo(50);
  });

  it("draws something for a segment that is the whole circle", () => {
    /* ⚠️ An `A` between two identical points renders NOTHING, so a category
       holding 100% — the likeliest single value in any composition — vanished
       and the chart read as empty. */
    expect(arcPath(50, 50, 40, 0, 1)).not.toBe("");
    expect(arcPath(50, 50, 40, 0, 1)).toContain("A40 40");
  });

  it("emits nothing for a segment of no size", () => {
    expect(arcPath(50, 50, 40, 0.3, 0.3)).toBe("");
  });

  it("takes the gap OUT of the segments rather than adding it between", () => {
    /* Adding pushes the total past a full turn, so the last slice laps the first
       and the biggest category eats the smallest — silently, and only for some
       orderings of the same data. */
    const out = arcs([1, 1, 1, 1]);
    expect(out[3]!.to).toBeLessThanOrEqual(1);
    expect(out[0]!.from).toBe(0);
  });

  it("leaves no gap at all around a lone segment", () => {
    expect(arcs([5])).toEqual([{ from: 0, to: 1 }]);
  });

  it("keeps a tiny slice visible instead of rounding it away", () => {
    const [big, tiny] = arcs([1000, 1]);
    expect(tiny!.to - tiny!.from).toBeGreaterThan(0);
    expect(big!.to - big!.from).toBeGreaterThan(tiny!.to - tiny!.from);
  });

  it("survives a set that sums to nothing", () => {
    expect(arcs([0, 0])).toEqual([{ from: 0, to: 0 }, { from: 0, to: 0 }]);
  });
});

describe("norm", () => {
  it("does not divide by zero on a collapsed span", () => {
    expect(norm(5, { min: 5, max: 5 })).toBe(0);
  });
});
