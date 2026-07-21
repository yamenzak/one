import { describe, it, expect } from "vitest";
import { aggregateSiteWidths, type SiteWidths } from "./measure.js";

/** A SiteWidths with sensible defaults; override per case. */
function sw(p: Partial<SiteWidths>): SiteWidths {
  return { pxPerCm: 5, neckCm: 38, chestCm: 100, waistCm: 82, hipsCm: 98, contour: [], ...p };
}

describe("aggregateSiteWidths — burst → robust median", () => {
  it("takes the median per site, ignoring a single wild frame", () => {
    // Four good frames near 82 + one blown-out frame (150) that a lone bad mask
    // would produce. The median must land in the cluster, not get dragged up.
    const burst = [sw({ waistCm: 80 }), sw({ waistCm: 82 }), sw({ waistCm: 83 }), sw({ waistCm: 81 }), sw({ waistCm: 150 })];
    const agg = aggregateSiteWidths(burst);
    expect(agg.waistCm).toBe(82);
  });

  it("drops frames that couldn't locate a site (nulls) before medianing", () => {
    const burst = [sw({ neckCm: null }), sw({ neckCm: 40 }), sw({ neckCm: 42 })];
    const agg = aggregateSiteWidths(burst);
    expect(agg.neckCm).toBe(41); // median of [40, 42], nulls ignored
  });

  it("returns null for a site no frame could measure", () => {
    const burst = [sw({ hipsCm: null }), sw({ hipsCm: null })];
    expect(aggregateSiteWidths(burst).hipsCm).toBeNull();
  });

  it("keeps the outline from the frame whose waist is nearest the median", () => {
    const near: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const far: [number, number][] = [[0, 0], [2, 0], [2, 2], [0, 2]];
    const burst = [
      sw({ waistCm: 82, contour: near }), // median waist → its contour should win
      sw({ waistCm: 60, contour: far }),
      sw({ waistCm: 104, contour: far }),
    ];
    expect(aggregateSiteWidths(burst).contour).toBe(near);
  });
});
