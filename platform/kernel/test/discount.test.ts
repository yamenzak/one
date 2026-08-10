/**
 * A WORKSPACE'S OWN CODE, AGAINST ITS OWN PRICES.
 *
 * ⚠️ THE HONEST BOUND IS WHO OWNS THE CHECKOUT PAGE. A workspace is paid on ITS
 * OWN provider — this platform opens an intent and hands over an address — so a
 * code here changes what the customer is QUOTED, what the purchase row carries
 * and what the workspace is asked to confirm. It cannot change what a page we do
 * not control asks for, and a design that pretended otherwise would be a
 * discount that exists only on our screen.
 */

import { describe, expect, it } from "vitest";
import {
  MAX_DISCOUNT_PERCENT, discountUsable, discounted, refuseDiscount,
} from "../src/customer.js";

/* ------------------------------------------------------------- the price --- */

describe("what a code takes off", () => {
  it("takes the percentage off", () => {
    expect(discounted(10_000, 25)).toBe(7_500);
    expect(discounted(6_000, 10)).toBe(5_400);
  });

  /*
    ⚠️ ROUNDED IN THE CUSTOMER'S FAVOUR. Half a penny is not a number any payment
    page can take, and rounding a discount DOWN is a business quietly charging
    more than its own poster said — by one unit, on every sale, forever.
  */
  it("rounds the discount up rather than the price", () => {
    /* 33% of 999 is 329.67. Taking 329 would charge 670; taking 330 charges 669. */
    expect(discounted(999, 33)).toBe(669);
  });

  it("never goes below nothing", () => {
    expect(discounted(100, MAX_DISCOUNT_PERCENT)).toBeGreaterThanOrEqual(0);
    expect(discounted(1, 90)).toBe(0);
  });
});

/* -------------------------------------------------------------- the code --- */

describe("what may be issued", () => {
  const ok = { code: "SUMMER", percent: 20, uses: 50 };

  it("takes an ordinary code", () => {
    expect(refuseDiscount(ok)).toBeNull();
  });

  /*
    ⚠️ LETTERS, DIGITS AND HYPHENS. A code is typed by a person off a poster or a
    story, so anything else is a character somebody has to be told how to enter —
    and a space in one is a code half the people who try it get wrong.
  */
  it("refuses a code nobody could type back", () => {
    for (const code of ["SUM MER", "SUMMER!", "ab", "-LEADING", ""]) {
      expect(refuseDiscount({ ...ok, code }), code).toBe("code");
    }
  });

  /*
    ⚠️ NOTHING FREE AND NOTHING TOKEN. A hundred per cent is a giveaway wearing a
    discount's clothes — it settles a purchase for zero on a page nobody visited
    — and zero is a code that looks like it worked and does nothing.
  */
  it("refuses a percentage that is not a discount", () => {
    for (const percent of [0, 100, 91, -10, 12.5]) {
      expect(refuseDiscount({ ...ok, percent }), String(percent)).toBe("percent");
    }
  });

  it("refuses a code with no uses in it", () => {
    expect(refuseDiscount({ ...ok, uses: 0 })).toBe("uses");
  });
});

/* ------------------------------------------------------------ usable now --- */

describe("whether a code still works", () => {
  const live = { code: "SUMMER", percent: 20, usesLeft: 3, expiresAt: null };
  const now = "2026-08-10T00:00:00.000Z";

  it("works while it has uses and has not expired", () => {
    expect(discountUsable(live, now)).toBe(true);
    expect(discountUsable({ ...live, expiresAt: "2026-09-01T00:00:00.000Z" }, now)).toBe(true);
  });

  it("stops when the uses run out", () => {
    expect(discountUsable({ ...live, usesLeft: 0 }, now)).toBe(false);
  });

  /*
    ⚠️ EXPIRY IS A TEXT COMPARISON THAT ONLY WORKS BECAUSE BOTH SIDES ARE ISO.
    A shipping product stored epoch milliseconds in a TEXT column and compared it
    against ISO text: nothing threw, and the comparison was lexicographic — so
    every code was either permanently live or permanently dead.
  */
  it("stops on the moment it expires, not after it", () => {
    expect(discountUsable({ ...live, expiresAt: "2026-08-09T23:59:59.000Z" }, now)).toBe(false);
    expect(discountUsable({ ...live, expiresAt: now }, now)).toBe(false);
  });

  it("treats a code that does not exist as unusable rather than free", () => {
    expect(discountUsable(null, now)).toBe(false);
  });
});
