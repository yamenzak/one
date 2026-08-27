/**
 * WHAT A JOB USED, SAID.
 *
 * ⚠️ THE FAULT EVERY RULE HERE IS AGAINST IS A RECALL NOBODY CAN ACT ON. A trace
 * that reports "in doubt" without saying WHY leaves whoever is holding the
 * notice unable to tell a lot somebody froze this morning from one a run refused
 * to release — two different phone calls, one word.
 */

import { describe, expect, it } from "vitest";
import { DOUBTS, saysDoubt, saysUsed, type Doubt } from "../src/tracing.js";

const used = (quantity: number, lot: string, doubt: Doubt = "") =>
  ({ quantity, lot, doubt });

describe("what a line of a trace says", () => {
  it("says how many were taken", () => {
    expect(saysUsed(used(3, ""))).toBe("3 taken");
  });

  /* ⚠️ NAMED WHERE THERE IS ONE, OMITTED WHERE THERE IS NOT — a blank under a
     heading reading "Lot" reads as a product that failed to record one. */
  it("names the lot where there is one", () => {
    expect(saysUsed(used(3, "A-88"))).toBe("3 taken · lot A-88");
  });

  it("says nothing about a lot where the product carries none", () => {
    expect(saysUsed(used(12, ""))).not.toMatch(/lot/);
  });

  /*
    ⚠️ THE TWO DOUBTS ARE TWO SENTENCES, and that is the point of the pair. Held
    is a decision somebody took and can undo; never released is a batch that was
    not fit to use and went out anyway.
  */
  it("says why a line is in question, and which kind", () => {
    expect(saysUsed(used(1, "A-88", "held"))).toBe("1 taken · lot A-88 — the lot is held");
    expect(saysUsed(used(1, "A-88", "not released")))
      .toBe("1 taken · lot A-88 — the lot was never released");
  });

  /* ⚠️ LAST, AFTER A DASH. A sentence opening with the alarm makes every
     ordinary line read as urgent for the length of two words. */
  it("puts the doubt after what was taken, never before it", () => {
    const said = saysUsed(used(2, "B-1", "held"));
    expect(said.indexOf("2 taken")).toBeLessThan(said.indexOf("held"));
  });

  it("says nothing extra when there is no doubt", () => {
    expect(saysUsed(used(2, "B-1"))).toBe("2 taken · lot B-1");
    expect(saysDoubt("")).toBe("");
  });

  /*
    ⚠️ EVERY DOUBT HAS WORDS, WHICH IS WHAT MAKES THE SET SAFE TO GROW. A third
    reason added to `DOUBTS` and not to `saysDoubt` would render as an empty
    clause after a dash — an alarm that says nothing, on the line that has one.
  */
  it("has a sentence for every doubt it declares", () => {
    for (const doubt of DOUBTS) expect(saysDoubt(doubt).length).toBeGreaterThan(0);
  });
});
