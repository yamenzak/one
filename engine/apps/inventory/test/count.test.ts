/**
 * COUNTING A SHELF — the arithmetic that decides what a stocktake destroys.
 *
 * ⚠️ CLOSING A COUNT IS THE ONE OPERATION IN THIS PRODUCT THAT TAKES NUMBERS
 * AWAY. Everything the session did not find goes to zero, which is correct and
 * is also how an abandoned session empties a rack — so every rule below is
 * asserted rather than described.
 */

import { describe, expect, it } from "vitest";
import { coverage, settleCount, stuttering, type Line } from "../src/count.js";

const line = (product: string, quantity: number, batch = ""): Line =>
  ({ product, batch, quantity });

/* ----------------------------------------------------------------- settle --- */

describe("what closing a count would change", () => {
  /*
    ⚠️ ONLY THE DIFFERENCES. A shelf of two hundred lines where four are wrong is
    a screen with four rows on it; listing the rest as "correct" buries the only
    thing anybody has to decide about.
  */
  it("says nothing about the lines that agree", () => {
    const out = settleCount(
      [line("glove", 40), line("resin", 4)],
      [line("glove", 40), line("resin", 4)],
    );
    expect(out).toEqual([]);
  });

  /*
    ⚠️ THE SAME CODE THIRTY TIMES IS THIRTY ITEMS. Double counting is prevented
    by SCOPE — one session, one shelf — not by telling one generic barcode from
    another, which cannot be done. A tally that took the last value would count
    one of them.
  */
  it("adds up every scan of the same thing", () => {
    const out = settleCount(
      [line("glove", 1), line("glove", 1), line("glove", 1)],
      [line("glove", 1)],
    );
    expect(out).toEqual([
      { product: "glove", batch: "", was: 1, found: 3, delta: 2 },
    ]);
  });

  /*
    ⚠️ EVERYTHING THE COUNT DID NOT FIND GOES TO ZERO. This is the point of
    counting and the reason a close is explicit: a session somebody abandoned
    half way through empties the rest of the rack.
  */
  it("takes to zero what the shelf did not have", () => {
    const out = settleCount([line("glove", 40)], [line("glove", 40), line("paper", 5)]);
    expect(out).toEqual([
      { product: "paper", batch: "", was: 5, found: 0, delta: -5 },
    ]);
  });

  /* ⚠️ AND SOMETHING FOUND THAT NOTHING SAID WAS THERE IS A CHANGE TOO —
     somebody put it on the wrong shelf, or it was never received, and the count
     is the more recent evidence. */
  it("reports what was found and never recorded", () => {
    const out = settleCount([line("screw", 12)], []);
    expect(out).toEqual([
      { product: "screw", batch: "", was: 0, found: 12, delta: 12 },
    ]);
  });

  /*
    ⚠️ TWO LOTS OF ONE PRODUCT ARE TWO LINES. They expire on different days and
    the older one goes first, so a count that merged them would produce one
    correct total and two wrong dates.
  */
  it("keeps two deliveries of one product apart", () => {
    const out = settleCount(
      [line("vial", 6, "A5B7"), line("vial", 2, "C0921")],
      [line("vial", 6, "A5B7"), line("vial", 5, "C0921")],
    );
    expect(out).toEqual([
      { product: "vial", batch: "C0921", was: 5, found: 2, delta: -3 },
    ]);
  });

  /* ⚠️ THE BIGGEST DISAGREEMENT FIRST — that is the one worth looking at
     hardest, and a list ordered by product id is ordered by nothing. */
  it("puts the largest disagreement at the top", () => {
    const out = settleCount(
      [line("a", 1), line("b", 100)],
      [line("a", 3), line("b", 40)],
    );
    expect(out.map((c) => c.product)).toEqual(["b", "a"]);
  });
});

/* ---------------------------------------------------------------- stutter --- */

describe("a jumpy finger", () => {
  /*
    ⚠️ FLAGGED, NEVER BLOCKED. A trigger held against a pallet of identical boxes
    is also three reads in two seconds and it is three boxes — so refusing the
    third would undercount every bulk delivery, silently, in the direction nobody
    checks.
  */
  it("notices three reads of one code inside two seconds", () => {
    expect(stuttering([1_000, 1_400], 1_800)).toBe(true);
  });

  it("says nothing about a steady hand", () => {
    expect(stuttering([1_000, 4_000], 8_000)).toBe(false);
    expect(stuttering([1_000], 1_200)).toBe(false);
    expect(stuttering([], 1_000)).toBe(false);
  });

  /* ⚠️ THE WINDOW MOVES WITH THE READS. Two from ten minutes ago and one now is
     not a stutter, however many there are altogether. */
  it("only counts the reads inside the window", () => {
    expect(stuttering([1_000, 2_000, 600_000], 600_100)).toBe(false);
  });
});

/* --------------------------------------------------------------- coverage --- */

describe("which shelves nobody has counted", () => {
  const PLACES = [
    { id: "a1", name: "A1" },
    { id: "a2", name: "A2" },
    { id: "b1", name: "B1" },
  ];

  /*
    ⚠️ NEVER-COUNTED IS NOT "A LONG TIME AGO", and it sorts first. A shelf nobody
    has ever visited and one counted two years ago are different problems: the
    second has a number somebody once checked. Folding them together by treating
    never as a very large number puts the more dangerous one in the middle.
  */
  it("puts what has never been counted above what is merely stale", () => {
    const out = coverage(PLACES, { a1: "2024-01-01", b1: "2026-08-01" }, "2026-08-21");
    expect(out.map((c) => c.location)).toEqual(["a2", "a1", "b1"]);
    expect(out[0]?.days).toBeNull();
    expect(out[1]?.days).toBe(963);
    expect(out[2]?.days).toBe(20);
  });

  it("counts a shelf done today as no days ago", () => {
    const out = coverage([{ id: "a1", name: "A1" }], { a1: "2026-08-21" }, "2026-08-21");
    expect(out[0]?.days).toBe(0);
  });
});
