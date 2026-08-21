/**
 * THE ARITHMETIC UNDER THE LEDGER — refusals, and the clock that wins.
 *
 * ⚠️ EVERY RULE HERE IS ONE THAT COSTS SOMEBODY REAL STOCK WHEN IT IS WRONG, and
 * every one of them is silent. A clamp instead of a refusal loses the evidence
 * of a mis-scan; a shelf life counted on the wrong calendar day expires a
 * medicine late; a `taken` recorded as a positive number doubles a shelf. None
 * of the three throws, and none shows up in a screenshot.
 */

import { describe, expect, it } from "vitest";
import { dayPlus, type Day } from "@engine/kernel";
import { applyMove, effectiveExpiry, promotes, refuseMove } from "../src/ledger.js";

/* ⚠️ The kernel's day arithmetic, asserted here because this app is the reason
   it exists — a shelf life is the case that made a whole-day error expensive. */
const addDays = (day: string, days: number) => dayPlus(day as Day, days);

describe("what a movement does", () => {
  it("takes away and puts back, whatever sign the caller sent", () => {
    expect(applyMove("received", 5)).toBe(5);
    expect(applyMove("taken", 5)).toBe(-5);
    /* ⚠️ A CALLER SENDING `-5` TO TAKE FIVE IS THE ORDINARY MISTAKE, and it
       would otherwise ADD five — a shelf that grows every time somebody takes
       from it, which nobody reports because nobody expects it. */
    expect(applyMove("taken", -5)).toBe(-5);
    /* ⚠️ A correction is the one that keeps its sign: it is the only move whose
       direction is the caller's to decide. */
    expect(applyMove("adjusted", -3)).toBe(-3);
    expect(applyMove("adjusted", 3)).toBe(3);
  });

  it("refuses rather than landing on zero", () => {
    /* ⚠️ THE WHOLE ARGUMENT FOR REFUSING. Taking twelve from eight is a
       mis-scan, a different shelf, or a count that was already wrong — and
       clamping destroys the only signal that any of them happened. */
    expect(refuseMove("taken", 8, -12)).toContain("only 8");
    expect(refuseMove("taken", 8, -8)).toBeNull();
  });

  it("refuses a correction that would make a shelf negative", () => {
    expect(refuseMove("adjusted", 2, -5)).toBeTruthy();
    expect(refuseMove("adjusted", 2, -2)).toBeNull();
  });

  it("refuses a movement of nothing", () => {
    expect(refuseMove("received", 4, 0)).toBeTruthy();
    expect(refuseMove("received", 4, Number.NaN)).toBeTruthy();
  });

  /* ⚠️ "There is only 1" rather than "there are only 1" — the product speaking
     English rather than printing a template. */
  it("says it in the reader's grammar", () => {
    expect(refuseMove("taken", 1, -2)).toBe("There is only 1");
    expect(refuseMove("taken", 4, -9)).toBe("There are only 4");
  });
});

describe("the tracking ladder", () => {
  it("goes deeper safely and never back by itself", () => {
    expect(promotes("counted", "batched")).toBe(true);
    expect(promotes("listed", "itemised")).toBe(true);
    /* ⚠️ DEMOTION LOSES HISTORY, so it is not a promotion and the screen that
       offers it has to ask twice. Forty gloves become forty gloves in an
       unrecorded batch going up; going down, the batches and their expiries are
       gone and nothing can put them back. */
    expect(promotes("batched", "counted")).toBe(false);
    expect(promotes("counted", "counted")).toBe(false);
  });
});

describe("when a batch ends", () => {
  it("counts a shelf life in local days", () => {
    expect(addDays("2026-08-20", 7)).toBe("2026-08-27");
    /* ⚠️ ACROSS A MONTH AND A YEAR, because a `+ 7 * 86400000` on a local
       midnight is right in one hemisphere and a day out in the other. */
    expect(addDays("2026-08-28", 7)).toBe("2026-09-04");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("takes the earliest clock, and says which it was", () => {
    const found = effectiveExpiry({
      printed: "2026-12-01",
      opened: { on: "2026-08-20", days: 7 },
    });
    /* ⚠️ THE NAME MATTERS AS MUCH AS THE DATE. "Expires Tuesday" with no reason
       is a shelf nobody trusts, and the three reasons want different actions. */
    expect(found).toEqual({ on: "2026-08-27", by: "opened" });
  });

  it("prefers the printed date when two clocks land together", () => {
    const found = effectiveExpiry({
      printed: "2026-08-27",
      opened: { on: "2026-08-20", days: 7 },
    });
    /* ⚠️ Both are true; the one somebody can check against the box in their hand
       is the one to name. */
    expect(found?.by).toBe("printed");
  });

  it("answers nothing when nothing ends", () => {
    /* ⚠️ `null` RATHER THAN A FAR-OFF DATE. A screw has no expiry, and a
       sentinel would put it on an expiry report at the bottom of the list. */
    expect(effectiveExpiry({})).toBeNull();
  });

  it("lets a processed clock end a batch before its printed date", () => {
    const found = effectiveExpiry({
      printed: "2027-01-01",
      processed: { on: "2026-08-20", days: 30 },
    });
    expect(found).toEqual({ on: "2026-09-19", by: "processed" });
  });
});
