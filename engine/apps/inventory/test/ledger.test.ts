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
import {
  applyMove, daysLeft, effectiveExpiry, promotes, refuseMove, standingOf,
} from "../src/ledger.js";

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

/**
 * WHERE A BATCH STANDS TODAY.
 *
 * ⚠️ EVERY ONE OF THESE IS A DAY OUT RATHER THAN A CRASH, and a day is the whole
 * question: a box that expired this morning shown as "expires tomorrow" is a box
 * somebody uses. The arithmetic is on the CALENDAR — both ends are midnight UTC
 * — because subtracting two instants across a clock change is 23 or 25 hours and
 * `Math.floor` of that is off by one, twice a year, in the direction nobody
 * checks.
 */
describe("where a batch stands", () => {
  const TODAY = "2026-08-21";

  it("counts the days either way round", () => {
    expect(daysLeft("2026-08-25", TODAY)).toBe(4);
    expect(daysLeft("2026-08-17", TODAY)).toBe(-4);
    expect(daysLeft(TODAY, TODAY)).toBe(0);
  });

  /* ⚠️ ACROSS A MONTH, A YEAR AND A LEAP DAY, because those are the three places
     a naive subtraction and a calendar disagree. */
  it("counts across a month, a year and a leap day", () => {
    expect(daysLeft("2026-09-01", "2026-08-21")).toBe(11);
    expect(daysLeft("2027-01-01", "2026-12-25")).toBe(7);
    expect(daysLeft("2028-03-01", "2028-02-28")).toBe(2);
  });

  /*
    ⚠️ A BOX THAT EXPIRES TODAY HAS NOT EXPIRED. Every regime that governs one
    says the date on the label is the last good day — and telling somebody it has
    gone while the box in their hand says otherwise is how an app stops being
    believed about the ones that really have.
  */
  it("calls today soon rather than gone", () => {
    expect(standingOf(TODAY, TODAY, 30)).toBe("soon");
    expect(standingOf("2026-08-20", TODAY, 30)).toBe("gone");
  });

  /* ⚠️ THE THRESHOLD IS THE WORKSPACE'S — three days for a kitchen, ninety for a
     pharmacy. Fixed at thirty, two of those read a useless list. */
  it("takes the workspace's own idea of soon", () => {
    expect(standingOf("2026-09-15", TODAY, 30)).toBe("soon");
    expect(standingOf("2026-09-15", TODAY, 7)).toBe("fine");
    expect(standingOf("2026-08-23", TODAY, 3)).toBe("soon");
  });

  /*
    ⚠️ AND THE OPENED CLOCK IS THE ONE THAT SURPRISES PEOPLE. A box printed 2028
    that somebody opened last month is out next week, and a product that only
    read the printed date would say it was fine for two more years.
  */
  it("lets an opened box beat a printed date two years out", () => {
    const found = effectiveExpiry({
      printed: "2028-06-30",
      opened: { on: "2026-07-24", days: 28 },
    });
    expect(found?.on).toBe("2026-08-21");
    expect(found?.by).toBe("opened");
    expect(standingOf(found?.on ?? "", TODAY, 30)).toBe("soon");
  });
});
