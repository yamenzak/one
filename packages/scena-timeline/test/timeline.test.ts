import { describe, it, expect } from "vitest";
import {
  buildTimeline,
  resolveAt,
  cycleIndexAt,
  cyclePositionAt,
  nextBoundaryAt,
  EmptyTimelineError,
  type TimelineItem,
} from "../src/index.js";

const items: TimelineItem[] = [
  { id: "a", durationMs: 8000 },
  { id: "b", durationMs: 12000 },
  { id: "c", durationMs: 5000 },
];
const T0 = 1_751_500_000_000;
const CYCLE = 25000; // 8+12+5

describe("buildTimeline", () => {
  it("sums durations into cycleMs", () => {
    const tl = buildTimeline(items, T0);
    expect(tl.cycleMs).toBe(CYCLE);
  });

  it("rejects empty item lists", () => {
    expect(() => buildTimeline([], T0)).toThrow(EmptyTimelineError);
  });

  it("rejects non-positive or invalid durations", () => {
    expect(() => buildTimeline([{ id: "x", durationMs: 0 }], T0)).toThrow(RangeError);
    expect(() => buildTimeline([{ id: "x", durationMs: -5 }], T0)).toThrow(RangeError);
    expect(() => buildTimeline([{ id: "x", durationMs: NaN }], T0)).toThrow(RangeError);
    expect(() => buildTimeline([{ id: "x", durationMs: Infinity }], T0)).toThrow(RangeError);
  });

  it("requires a seed when shuffling", () => {
    expect(() => buildTimeline(items, T0, { shuffle: true })).toThrow();
    expect(() => buildTimeline(items, T0, { shuffle: true, seed: "pl" })).not.toThrow();
  });
});

describe("cycle math", () => {
  const tl = buildTimeline(items, T0);

  it("position is 0 exactly at t0", () => {
    expect(cyclePositionAt(tl, T0)).toBe(0);
    expect(cycleIndexAt(tl, T0)).toBe(0);
  });

  it("wraps at the cycle boundary", () => {
    expect(cyclePositionAt(tl, T0 + CYCLE)).toBe(0);
    expect(cycleIndexAt(tl, T0 + CYCLE)).toBe(1);
    expect(cyclePositionAt(tl, T0 + CYCLE + 3000)).toBe(3000);
    expect(cycleIndexAt(tl, T0 + 2 * CYCLE + 1)).toBe(2);
  });

  it("stays non-negative for times before t0", () => {
    expect(cyclePositionAt(tl, T0 - 1000)).toBe(CYCLE - 1000);
    expect(cycleIndexAt(tl, T0 - 1)).toBe(-1);
    expect(cyclePositionAt(tl, T0 - CYCLE)).toBe(0);
    expect(cycleIndexAt(tl, T0 - CYCLE)).toBe(-1);
  });
});

describe("resolveAt", () => {
  const tl = buildTimeline(items, T0);

  it("resolves the first item at cycle start", () => {
    const s = resolveAt(tl, T0);
    expect(s.item.id).toBe("a");
    expect(s.index).toBe(0);
    expect(s.offsetMs).toBe(0);
    expect(s.remainingMs).toBe(8000);
  });

  it("seeks into an item", () => {
    const s = resolveAt(tl, T0 + 3000);
    expect(s.item.id).toBe("a");
    expect(s.offsetMs).toBe(3000);
    expect(s.remainingMs).toBe(5000);
  });

  it("advances across boundaries", () => {
    const s = resolveAt(tl, T0 + 8000); // exactly at a→b boundary
    expect(s.item.id).toBe("b");
    expect(s.offsetMs).toBe(0);

    const s2 = resolveAt(tl, T0 + 8000 + 12000); // at b→c boundary
    expect(s2.item.id).toBe("c");
    expect(s2.offsetMs).toBe(0);
  });

  it("resolves the last item near end of cycle", () => {
    const s = resolveAt(tl, T0 + CYCLE - 1);
    expect(s.item.id).toBe("c");
    expect(s.offsetMs).toBe(4999);
    expect(s.remainingMs).toBe(1);
  });

  it("is periodic — same phase in later cycles", () => {
    const a = resolveAt(tl, T0 + 3000);
    const b = resolveAt(tl, T0 + 3000 + 5 * CYCLE);
    expect(b.item.id).toBe(a.item.id);
    expect(b.offsetMs).toBe(a.offsetMs);
    expect(b.cycleIndex).toBe(5);
  });

  it("works identically before t0", () => {
    // 1s before t0 == 1s before the cycle boundary == 1s into item c's tail
    const s = resolveAt(tl, T0 - 1000);
    expect(s.item.id).toBe("c");
    expect(s.offsetMs).toBe(4000);
  });
});

describe("nextBoundaryAt", () => {
  const tl = buildTimeline(items, T0);
  it("returns the wall-clock time of the next item edge", () => {
    expect(nextBoundaryAt(tl, T0 + 3000)).toBe(T0 + 8000);
    expect(nextBoundaryAt(tl, T0 + 8000)).toBe(T0 + 20000);
  });
});

describe("single-item timeline", () => {
  const tl = buildTimeline([{ id: "solo", durationMs: 10000 }], T0);
  it("loops one item forever", () => {
    expect(resolveAt(tl, T0).item.id).toBe("solo");
    expect(resolveAt(tl, T0 + 9999).offsetMs).toBe(9999);
    expect(resolveAt(tl, T0 + 10000).offsetMs).toBe(0);
    expect(cycleIndexAt(tl, T0 + 10000)).toBe(1);
  });
});
