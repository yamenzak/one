import { describe, it, expect } from "vitest";
import { buildTimeline, resolveAt, shuffledOrder, type TimelineItem } from "../src/index.js";

/**
 * The core promise of §1: two screens sharing only a clock display the same
 * slide, at the same seek position, at the same moment — with no coordination
 * message. Here "two screens" = two independent timeline instances built from
 * the same manifest data. If they ever disagree at the same `t`, sync is broken.
 */

const items: TimelineItem[] = [
  { id: "a", durationMs: 8000 },
  { id: "b", durationMs: 12000 },
  { id: "c", durationMs: 5000 },
  { id: "d", durationMs: 9000 },
  { id: "e", durationMs: 3000 },
];
const T0 = 1_751_500_000_000;

describe("two screens lock in sync", () => {
  it("sequential playout: identical state at every sampled instant", () => {
    const screenA = buildTimeline(items, T0);
    const screenB = buildTimeline(items, T0); // a different device, same manifest

    for (let t = T0 - 5000; t < T0 + 200000; t += 137) {
      const a = resolveAt(screenA, t);
      const b = resolveAt(screenB, t);
      expect(b.item.id).toBe(a.item.id);
      expect(b.offsetMs).toBe(a.offsetMs);
      expect(b.cycleIndex).toBe(a.cycleIndex);
    }
  });

  it("shuffled playout: identical state despite per-cycle reshuffle", () => {
    const seed = "pl_news";
    const screenA = buildTimeline(items, T0, { shuffle: true, seed });
    const screenB = buildTimeline(items, T0, { shuffle: true, seed });

    for (let t = T0; t < T0 + 300000; t += 211) {
      const a = resolveAt(screenA, t);
      const b = resolveAt(screenB, t);
      expect(b.item.id).toBe(a.item.id);
      expect(b.offsetMs).toBe(a.offsetMs);
    }
  });
});

describe("shuffledOrder", () => {
  it("is a permutation — every item appears exactly once", () => {
    for (let cycle = 0; cycle < 50; cycle++) {
      const order = shuffledOrder(items.length, "seed", cycle);
      expect(order).toHaveLength(items.length);
      expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    }
  });

  it("is deterministic for the same (count, seed, cycle)", () => {
    expect(shuffledOrder(10, "x", 7)).toEqual(shuffledOrder(10, "x", 7));
  });

  it("varies by cycle and by seed", () => {
    const c0 = shuffledOrder(8, "x", 0);
    const c1 = shuffledOrder(8, "x", 1);
    const other = shuffledOrder(8, "y", 0);
    // Not a hard guarantee for tiny N, but with 8 items collisions are unlikely.
    expect(c0).not.toEqual(c1);
    expect(c0).not.toEqual(other);
  });

  it("handles trivial sizes", () => {
    expect(shuffledOrder(0, "x", 0)).toEqual([]);
    expect(shuffledOrder(1, "x", 0)).toEqual([0]);
  });

  it("covers the full cycle exactly once when shuffled", () => {
    // Across one cycle, each item's total on-screen time equals its duration.
    const seed = "cover";
    const tl = buildTimeline(items, T0, { shuffle: true, seed });
    const seen = new Set<string>();
    let t = T0;
    const cycleEnd = T0 + tl.cycleMs;
    let guard = 0;
    while (t < cycleEnd && guard++ < 100) {
      const s = resolveAt(tl, t);
      seen.add(s.item.id);
      t += s.remainingMs; // jump exactly to the next boundary
    }
    expect(seen).toEqual(new Set(["a", "b", "c", "d", "e"]));
  });
});
