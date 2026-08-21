/**
 * WHAT THE HISTORY ADDS UP TO, AND THE THREE WAYS A REPORT LIES.
 *
 * ⚠️ EVERY FAILURE HERE IS A NUMBER SOMEBODY BELIEVES. Consumption summed with
 * corrections reports theft as usage; a shrinkage report netting the two
 * directions off shows a shelf that is wildly wrong as a shelf that is fine;
 * a reorder list ordered by "how little is left" puts the thing that takes a
 * month to arrive below the thing the supplier delivers tomorrow. None of them
 * throws, and every one of them looks like a report.
 */

import { describe, expect, it } from "vitest";
import {
  dailyIn, lossesIn, reorder, toldIn, usageIn, type Entry,
} from "../src/report.js";

const took = (product: string, quantity: number, day = "2026-08-10"): Entry =>
  ({ move: "taken", product, delta: -quantity, day, against: "" });

const counted = (product: string, delta: number, day = "2026-08-10"): Entry =>
  ({ move: "adjusted", product, delta, day, against: "cnt_2026-08-10T09:00:00.000Z_loc" });

const corrected = (product: string, delta: number, day = "2026-08-10"): Entry =>
  ({ move: "adjusted", product, delta, day, against: "" });

const got = (product: string, quantity: number, day = "2026-08-01"): Entry =>
  ({ move: "received", product, delta: quantity, day, against: "" });

/* ---------------------------------------------------------------- how known --- */

describe("how much of what left was actually recorded", () => {
  /*
    ⚠️ THE SHARPEST NUMBER IN THE PRODUCT, and the one an inventory app is never
    willing to show — because it is the one that makes the app look bad. Hiding
    it does not make the stock come back; it makes every other figure on the
    screen unfalsifiable.
  */
  it("splits what somebody scanned from what a count found gone", () => {
    const out = toldIn([took("p", 6), counted("p", -4), got("p", 20)]);
    expect(out.recorded).toBe(6);
    expect(out.inferred).toBe(4);
    expect(out.share).toBeCloseTo(0.6);
  });

  /*
    ⚠️ A COUNT THAT FOUND STOCK IS NOT CONSUMPTION. Adding it would report a good
    day's tidying as usage — and it is the direction nobody checks, because a
    number going up looks like the system working.
  */
  it("does not count found stock as something that left", () => {
    const out = toldIn([took("p", 6), counted("p", 3)]);
    expect(out.recorded).toBe(6);
    expect(out.inferred).toBe(0);
    expect(out.share).toBe(1);
  });

  /*
    ⚠️ A CORRECTION MADE BY HAND IS NOT INFERRED CONSUMPTION. A keeper deciding a
    number was wrong is a different event from a count discovering stock is gone,
    and `against` is the only thing that tells them apart — one carries a count
    session's id and the other carries nothing.
  */
  it("does not treat a hand correction as consumption", () => {
    const out = toldIn([took("p", 6), corrected("p", -10)]);
    expect(out.inferred).toBe(0);
    expect(out.recorded).toBe(6);
  });

  /* ⚠️ NOTHING LEFT IS A SHARE OF ZERO, NEVER A DIVISION BY ZERO. A quiet
     fortnight is the ordinary case in a small workspace. */
  it("answers zero for a period where nothing left", () => {
    expect(toldIn([]).share).toBe(0);
    expect(toldIn([got("p", 20)]).share).toBe(0);
  });
});

/* ----------------------------------------------------------------- what left --- */

describe("what left the shelf", () => {
  /* ⚠️ RECORDED AND INFERRED TOGETHER, because this report is about the STOCK.
     How well people scan is `told`'s question and it already has a number. */
  it("counts what nobody logged as well as what somebody did", () => {
    expect(usageIn([took("gloves", 8), counted("gloves", -4)]))
      .toEqual([{ product: "gloves", quantity: 12 }]);
  });

  /* ⚠️ BIGGEST FIRST, WHICH IS THE ONLY ORDER THIS LIST HAS. Alphabetical makes
     somebody read every row to find the one that matters. */
  it("puts the biggest first", () => {
    const out = usageIn([took("a", 2), took("b", 30), took("c", 9)]);
    expect(out.map((one) => one.product)).toEqual(["b", "c", "a"]);
  });

  /* ⚠️ A DELIVERY IS NOT CONSUMPTION, and this is the sign error that would make
     every number on the screen wrong in the friendly direction. */
  it("ignores what arrived", () => {
    expect(usageIn([got("gloves", 100)])).toEqual([]);
  });
});

/* ----------------------------------------------------------------- shrinkage --- */

describe("what the numbers were wrong by", () => {
  /*
    ⚠️ BOTH DIRECTIONS, BECAUSE NETTING THEM OFF LOSES THE ONE THING THIS REPORT
    IS FOR. A shelf that is 40 short and 38 over is a shelf somebody is counting
    badly, or two products being confused with each other; netted, it is a shelf
    that is two out and looks fine.
  */
  it("keeps short and over apart", () => {
    const out = lossesIn([corrected("p", -40), counted("p", 38)]);
    expect(out).toEqual([{ product: "p", lost: 40, found: 38 }]);
  });

  /* ⚠️ EVERY CORRECTION, NOT ONLY THE ONES A COUNT CAUSED. A keeper adjusting by
     hand is exactly as much a discrepancy as one a count found. */
  it("covers a hand correction and a counted one alike", () => {
    const out = lossesIn([corrected("p", -3), counted("p", -2)]);
    expect(out[0]?.lost).toBe(5);
  });

  /* ⚠️ AND CONSUMPTION IS NOT A DISCREPANCY. Somebody taking something is the
     system working. */
  it("says nothing about what was taken properly", () => {
    expect(lossesIn([took("p", 50)])).toEqual([]);
  });
});

/* ------------------------------------------------------------------- reorder --- */

describe("what to buy", () => {
  /*
    ⚠️ THE QUESTION IS "WILL IT LAST UNTIL A DELIVERY ARRIVES", NOT "IS IT LOW".
    A product with two weeks of stock and a three-week lead time is out before
    the order lands; one with two days and a next-day supplier is fine. A list
    ordered by how little is left puts those in the wrong order, which is how a
    store room runs out of the one thing that takes a month to get.
  */
  it("orders what runs out first, not what is smallest", () => {
    const out = reorder([
      /* ⚠️ Ten a day, thirty on the shelf: three days of cover. */
      { product: "fast", onHand: 30, par: 0, used: 300 },
      /* ⚠️ One a day, four on the shelf: four days — LESS stock and MORE time,
         which is exactly the pair a list ordered by quantity gets backwards. */
      { product: "slow", onHand: 4, par: 0, used: 30 },
    ], 30, 7);
    expect(out.map((one) => one.product)).toEqual(["fast", "slow"]);
    expect(out[0]?.cover).toBeCloseTo(3);
    expect(out[1]?.cover).toBeCloseTo(4);
  });

  /*
    ⚠️ AND ENOUGH COVER IS ENOUGH COVER. Thirty days of stock against a seven-day
    lead time is not a thing to buy, however small the number on the shelf looks
    — a reorder list padded with lines that are fine is one nobody reads.
  */
  it("leaves alone what will still be there when a delivery lands", () => {
    expect(reorder([{ product: "slow", onHand: 4, par: 0, used: 4 }], 30, 7)).toEqual([]);
  });

  /*
    ⚠️ THE PAR LEVEL IS A FLOOR RATHER THAN A TRIGGER. It is what the workspace
    wants left on the shelf when the delivery ARRIVES, so it is added to what
    will be consumed by then — never compared against what is there now.
  */
  it("orders enough to cover the wait and still leave the floor", () => {
    /* Ten a day over thirty days, seven days' lead, twenty to be left over. */
    const out = reorder([{ product: "p", onHand: 30, par: 20, used: 300 }], 30, 7);
    expect(out[0]?.order).toBe(60);
  });

  /* ⚠️ ROUNDED UP, BECAUSE HALF A BOX IS A BOX. An order of 0.4 that rounds to
     nothing is a product that quietly never gets ordered. */
  it("rounds an order up", () => {
    const out = reorder([{ product: "p", onHand: 0, par: 0, used: 1 }], 30, 7);
    expect(out[0]?.order).toBe(1);
  });

  /*
    ⚠️ A PRODUCT THAT NEVER MOVES IS NOT ORDERED. Infinite cover is the honest
    answer — whatever is on the shelf will still be there — and a reorder list
    padded with every dormant line is one nobody reads.
  */
  it("leaves a thing that never moves alone", () => {
    expect(reorder([{ product: "p", onHand: 5, par: 0, used: 0 }], 30, 7)).toEqual([]);
  });

  /* ⚠️ UNLESS SOMEBODY SET A LINE UNDER IT. A par level is a deliberate
     statement that this must always be on the shelf, whether or not it moves —
     a fire extinguisher, a spare fuse, a first-aid kit. */
  it("orders a dormant thing that is under its line", () => {
    const out = reorder([{ product: "p", onHand: 1, par: 4, used: 0 }], 30, 7);
    expect(out[0]?.order).toBe(3);
    expect(out[0]?.why).toBe("below the line");
    expect(out[0]?.cover).toBe(Infinity);
  });

  /* ⚠️ AND THE REASON IS THE SHARPER OF THE TWO. "Runs out first" is a fact
     about the lead time and is acted on today; "below the line" is a standing
     preference and can wait for the next order. */
  it("says which of the two reasons put it on the list", () => {
    const out = reorder([{ product: "p", onHand: 30, par: 0, used: 300 }], 30, 7);
    expect(out[0]?.why).toBe("runs out first");
  });

  /* ⚠️ A ZERO-DAY PERIOD IS A DIVISION BY ZERO, and a caller can send one. */
  it("survives a period of no days", () => {
    expect(() => reorder([{ product: "p", onHand: 1, par: 0, used: 5 }], 0, 7)).not.toThrow();
  });
});

/* --------------------------------------------------------------------- days --- */

describe("a day at a time", () => {
  /*
    ⚠️ THE EMPTY DAYS ARE THE SHAPE. A line drawn from only the days something
    happened compresses a quiet fortnight into one step, and a flat month reads
    as a busy one — which is the opposite of what the chart is for.
  */
  it("gives every day a bucket, including the quiet ones", () => {
    const out = dailyIn([took("p", 5, "2026-08-03")], "2026-08-01", "2026-08-05");
    expect(out.map((one) => one.day))
      .toEqual(["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05"]);
    expect(out.map((one) => one.quantity)).toEqual([0, 0, 5, 0, 0]);
  });

  /* ⚠️ A MONTH BOUNDARY IS NOT A STRING OPERATION, which is why the walk is over
     dates. Incrementing the last two characters gives "2026-08-32". */
  it("walks across the end of a month", () => {
    const out = dailyIn([], "2026-08-30", "2026-09-02");
    expect(out.map((one) => one.day))
      .toEqual(["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02"]);
  });

  /* ⚠️ AND A RANGE A CALLER GOT WRONG IS EMPTY RATHER THAN ENDLESS. A backwards
     range, or one spanning a decade, must not be a hundred thousand buckets
     rendered into a chart. */
  it("refuses a backwards range and bounds a huge one", () => {
    expect(dailyIn([], "2026-09-02", "2026-08-30")).toEqual([]);
    expect(dailyIn([], "2020-01-01", "2030-01-01").length).toBeLessThanOrEqual(400);
    expect(dailyIn([], "nonsense", "2026-08-30")).toEqual([]);
  });
});
