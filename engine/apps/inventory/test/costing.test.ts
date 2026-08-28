/**
 * WHAT THE SHELF IS WORTH.
 *
 * ⚠️ THE FAULT EVERY RULE HERE IS AGAINST IS A NUMBER THAT LOOKS LIKE MONEY AND
 * IS NOT. A valuation is believed on sight — nobody re-derives it — so every way
 * of being wrong here is a way of being wrong silently, in a report somebody
 * takes to their accountant.
 */

import { describe, expect, it } from "vitest";
import {
  MILLI, adjusted, moved, received, saysWorth, spread, taken, worth, type Held,
} from "../src/costing.js";

const held = (quantity: number, rate: number | null): Held => ({ quantity, rate });
/** ⚠️ Minor units as a person would read them, so a failing case is legible. */
const money = (minor: number) => `£${(minor / 100).toFixed(2)}`;

describe("what a line is worth", () => {
  it("is the quantity at the rate, in minor units", () => {
    expect(worth(10, 250 * MILLI)).toBe(2500);
  });

  /*
    ⚠️ THE ROUNDING HAPPENS ONCE, AT THE END. A thousand screws at 2.3 milli-pence
    is £23.00 exactly; rounding the rate to a penny first gives £20.00, and
    rounding each unit gives the same. This is the whole reason the rate is
    carried in thousandths.
  */
  it("carries a rate below one minor unit without losing it", () => {
    expect(worth(1000, 2300)).toBe(2300);
  });

  /* ⚠️ UNKNOWN IS NOT NOUGHT, and every function preserves it. */
  it("says nothing about a line nobody has priced", () => {
    expect(worth(400, null)).toBeNull();
  });
});

describe("stock arriving", () => {
  /*
    ⚠️ THE BLEND IS WEIGHTED BY WHAT IS ALREADY THERE. Ten at 500 onto a thousand
    at 100 moves the rate by four — not to 300, which is what an average that
    ignored the quantities would say, and which would reprice a warehouse on one
    small delivery.
  */
  it("blends the new price into the old, weighted by quantity", () => {
    const after = received(held(1000, 100 * MILLI), 10, 500 * MILLI);
    expect(after.rate).toBe(103_960);
    expect(after.moved).toBe(worth(10, 500 * MILLI));
  });

  /* ⚠️ A DELIVERY WITH NO PRICE IS THE ORDINARY CASE, NOT AN ERROR. The shelf
     keeps what it was worth per unit; what is never done is reading "no price
     given" as "it was free", which drags a rate to nothing one delivery at a
     time. */
  it("leaves the rate alone when nobody said what it cost", () => {
    const after = received(held(100, 250 * MILLI), 10, null);
    expect(after.rate).toBe(250 * MILLI);
    expect(after.moved).toBe(2500);
  });

  it("takes the price as the rate when the shelf had none", () => {
    expect(received(held(0, null), 10, 400 * MILLI).rate).toBe(400 * MILLI);
  });

  /*
    ⚠️ A FIRST PRICE REPRICES WHAT WAS ALREADY THERE, and only what was PAID is
    recorded as having moved. The ten nobody costed become worth the new rate —
    an estimate, and a better one than unknown or nought — but that repricing is
    not a movement and must not appear in a history of movements.
  */
  it("reprices unpriced stock, and records only what was paid", () => {
    const after = received(held(10, null), 5, 200 * MILLI);
    expect(after.rate).toBe(200 * MILLI);
    expect(after.moved).toBe(worth(5, 200 * MILLI));
  });
});

describe("stock leaving", () => {
  /* ⚠️ TAKING DOES NOT REPRICE. What is left is worth per unit exactly what it
     was worth a moment ago; a method that moved the rate on the way out would
     make a warehouse's value depend on how often somebody visited it. */
  it("leaves the rate where it was", () => {
    expect(taken(held(100, 250 * MILLI), 10).rate).toBe(250 * MILLI);
  });

  /*
    ⚠️ AND THE VALUE OUT IS THE COST OF WHAT LEFT — the number a sales side will
    ask for, computed at the moment the goods went and from the rate standing
    then. Computed afterwards it would be computed against a rate that has since
    moved, which is the one error in this area nobody notices.
  */
  it("says what the stock that left cost, negative", () => {
    expect(taken(held(100, 250 * MILLI), 10).moved).toBe(-2500);
  });
});

describe("stock moving between places", () => {
  /*
    ⚠️ MOVING A PALLET MUST NOT CHANGE WHAT A WAREHOUSE IS WORTH, and this is the
    test that says so. The source loses what it was worth and the destination
    gains the same money — so the two halves cancel however differently the two
    shelves were priced.
  */
  it("conserves the total across two differently priced shelves", () => {
    const both = moved(held(100, 300 * MILLI), held(50, 100 * MILLI), 20);
    expect(both.out.moved + both.in.moved).toBe(0);
  });

  /* ⚠️ THE SOURCE'S RATE TRAVELS. A destination pricing the arrival at its OWN
     standing rate would create or destroy value on every transfer between two
     shelves holding the same thing at different prices — which is most of them. */
  it("blends the source's rate into the destination, not the destination's own", () => {
    const both = moved(held(100, 300 * MILLI), held(20, 100 * MILLI), 20);
    expect(both.in.rate).toBe(200 * MILLI);
  });

  it("keeps the source's rate where it was", () => {
    expect(moved(held(100, 300 * MILLI), held(0, null), 20).out.rate).toBe(300 * MILLI);
  });

  /* ⚠️ UNKNOWN STAYS UNKNOWN. A destination does not invent a price because it
     happens to have one. */
  it("hands an unknown rate across rather than inventing one", () => {
    expect(moved(held(100, null), held(0, null), 20).in.rate).toBeNull();
  });
});

describe("a correction", () => {
  /* ⚠️ FINDING TWO MORE ON A SHELF IS NOT BUYING TWO MORE. Nothing was paid, so
     nothing reprices; the value follows the count at the standing rate. */
  it("moves value at the standing rate and does not reprice", () => {
    const after = adjusted(held(100, 250 * MILLI), 2);
    expect(after.rate).toBe(250 * MILLI);
    expect(after.moved).toBe(500);
  });

  it("works the same way downwards", () => {
    expect(adjusted(held(100, 250 * MILLI), -2).moved).toBe(-500);
  });

  it("says nothing about a line nobody has priced", () => {
    expect(adjusted(held(100, null), 2).moved).toBe(0);
  });
});

describe("carriage, spread over what arrived", () => {
  const line = (id: string, value: number | null) => ({ id, value });

  /*
    ⚠️ BY VALUE, NOT BY COUNT. A pallet of paper and a box of scalpels on one van
    did not consume the same share of the freight, and splitting per line puts
    most of a delivery's carriage on whatever happened to be cheapest.
  */
  it("gives the expensive line the larger share", () => {
    const share = spread([line("a", 9000), line("b", 1000)], 500);
    expect(share.get("a")).toBe(450);
    expect(share.get("b")).toBe(50);
  });

  /*
    ⚠️ THE SHARES SUM TO THE CARRIAGE EXACTLY, and the last line takes the
    remainder to make that true. Rounding each independently loses or invents a
    penny, and a penny that appears from nowhere on a value report is the whole
    report's credibility.
  */
  it("sums to the carriage exactly, however it divides", () => {
    const share = spread([line("a", 1), line("b", 1), line("c", 1)], 100);
    expect([...share.values()].reduce((n, x) => n + x, 0)).toBe(100);
  });

  /* ⚠️ A LINE WHOSE OWN VALUE IS UNKNOWN TAKES NO SHARE, because a share of an
     unknown is a number nobody can defend. */
  it("skips a line nobody has priced", () => {
    const share = spread([line("a", 1000), line("b", null)], 200);
    expect(share.has("b")).toBe(false);
    expect(share.get("a")).toBe(200);
  });

  it("spreads nothing when there is no carriage, and when nothing is priced", () => {
    expect(spread([line("a", 1000)], 0).size).toBe(0);
    expect(spread([line("a", null)], 500).size).toBe(0);
  });
});

describe("what a line's worth says", () => {
  /* ⚠️ UNKNOWN IS A SENTENCE. "£0.00" over a full warehouse is a confident lie
     and a blank cell reads as a number that failed to load. */
  it("says a shelf nobody has priced is not priced", () => {
    expect(saysWorth(held(400, null), money)).toBe("Not priced yet");
  });

  it("says the value alone for a single thing", () => {
    expect(saysWorth(held(1, 4999 * MILLI), money)).toBe("£49.99");
  });

  it("says the each-rate beside the value where there is more than one", () => {
    expect(saysWorth(held(10, 250 * MILLI), money)).toBe("£25.00 · £2.50 each");
  });

  /*
    ⚠️ AND DROPS THE EACH-RATE WHERE IT CANNOT BE SAID TRUTHFULLY. `money` takes
    minor units, so 2.3 pence would draw as "£0.02" — the 13% error the milli
    rate exists to prevent, arriving on the screen instead of in the database.
    The value stands alone and stays exact.
  */
  it("drops the each-rate rather than rounding a sub-penny one into a lie", () => {
    expect(saysWorth(held(1000, 2300), money)).toBe("£23.00");
  });
});
