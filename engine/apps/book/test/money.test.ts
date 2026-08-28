/**
 * MONEY IN SOMEBODY ELSE'S CURRENCY.
 *
 * ⚠️ EVERY FAILURE HERE IS A PLAUSIBLE FIGURE. A conversion that assumed two
 * decimal places is wrong by a hundred for the yen and looks entirely ordinary.
 * A rate held as a float is out by a fraction of a cent per line, differently
 * each time, and surfaces as a trial balance that will not close. A conversion
 * that lost precision past 2^53 rounds itself in the last step of the one
 * calculation written in `BigInt` to avoid exactly that. None of them throws.
 */

import { describe, expect, it } from "vitest";
import {
  RATE_SCALE, inBase, rateFrom, refuseRate, revalueLines, unrated, type Holding,
} from "../src/money.js";

/* ⚠️ The real peg, to six places, which is what a bank publishes. */
const AED_PER_USD = 3.6725 * RATE_SCALE;

describe("what a rate may be", () => {
  it("takes an ordinary quote", () => {
    expect(refuseRate(AED_PER_USD)).toBeNull();
    expect(refuseRate(RATE_SCALE)).toBeNull();
  });

  it("refuses nothing, a fraction and a negative", () => {
    expect(refuseRate(0)).toBe("rate_missing");
    expect(refuseRate(1.5)).toBe("rate_missing");
    expect(refuseRate(-RATE_SCALE)).toBe("rate_backwards");
  });

  /*
    ⚠️ THE BOUNDS ARE FOR TYPOS, NOT ECONOMICS. Real rates span an enormous
    range, so they are wide enough that no real quote meets them — what they
    catch is a rate typed into the amount box, which would post a quarter of a
    million times what anybody meant and would balance.
  */
  it("takes a real rate at either extreme and refuses a typed amount", () => {
    /* ⚠️ About 1,400 Korean won to the dollar, and about a millionth of a
       bitcoin — both real, both allowed. */
    expect(refuseRate(1_400 * RATE_SCALE)).toBeNull();
    expect(refuseRate(1)).toBeNull();
    expect(refuseRate(2_000_000 * RATE_SCALE)).toBe("rate_absurd");
  });
});

describe("converting into the books", () => {
  it("converts an ordinary sum", () => {
    /* ⚠️ $100.00 at 3.6725 is AED 367.25. */
    expect(inBase(10_000, AED_PER_USD, "USD", "AED")).toBe(36_725);
  });

  it("converts a loss the same way", () => {
    expect(inBase(-10_000, AED_PER_USD, "USD", "AED")).toBe(-36_725);
  });

  /*
    ⚠️ THE ONE THAT CANNOT BE GOT WRONG QUIETLY. A hundred yen and a hundred
    cents are the same integer and a hundredfold apart, so a conversion assuming
    two decimal places is right for most of the world and wrong by 100 for Japan
    — in a figure that looks entirely plausible.
  */
  it("gets a zero-decimal currency right in both directions", () => {
    /* ⚠️ ¥10,000 — TEN THOUSAND YEN, stored as 10000 because the yen has no
       minor unit — at 0.0068 dollars is $68.00, which is 6800 cents. */
    expect(inBase(10_000, Math.round(0.0068 * RATE_SCALE), "JPY", "USD")).toBe(6_800);
    /* ⚠️ And back: $68.00 at 147.06 yen is ¥10,000, not ¥1,000,000. */
    expect(inBase(6_800, Math.round(147.0588 * RATE_SCALE), "USD", "JPY")).toBe(10_000);
  });

  it("gets a three-decimal currency right", () => {
    /* ⚠️ The Kuwaiti dinar has three. KWD 1.000 at 3.26 is $3.26. */
    expect(inBase(1_000, Math.round(3.26 * RATE_SCALE), "KWD", "USD")).toBe(326);
  });

  /*
    ⚠️ HALF AWAY FROM ZERO, WHICH IS WHAT A BANK DOES. Rounding toward zero loses
    a cent on every conversion in one direction only, which accumulates in the
    platform's favour and is invisible.
  */
  it("rounds half away from zero on both sides", () => {
    /* ⚠️ 1 unit at exactly 1.5 is 2, and −1 at 1.5 is −2. */
    expect(inBase(1, Math.round(1.5 * RATE_SCALE), "USD", "USD")).toBe(2);
    expect(inBase(-1, Math.round(1.5 * RATE_SCALE), "USD", "USD")).toBe(-2);
    /* ⚠️ And just under stays down. */
    expect(inBase(1, Math.round(1.4 * RATE_SCALE), "USD", "USD")).toBe(1);
  });

  it("is the identity at a rate of one", () => {
    expect(inBase(12_345, RATE_SCALE, "USD", "USD")).toBe(12_345);
  });

  /*
    ⚠️ THE INTERMEDIATE DOES NOT FIT IN A DOUBLE. A billion in cents is 1e11;
    times a rate in millionths is 1e17, past what a double holds exactly. This is
    the case that proves the `BigInt` rather than the comment claiming it.
  */
  it("stays exact where a double would not", () => {
    /*
      ⚠️ THE FIGURES MATTER, AND FINDING ONES THAT PROVE IT TOOK WORK. A product
      like 3e17 is past 2^53 and still exactly representable because its odd part
      is small; and even where the intermediate IS lossy, dividing by the scale
      afterwards usually absorbs the error. The case below is one where it does
      not — the float answer is out by one minor unit — which is the honest
      demonstration that the boundary is not where a reader would guess, and
      therefore not something to leave to an argument nobody re-checks.
    */
    expect(inBase(123_456_789_012_345, 7_654_321, "USD", "USD")).toBe(944_977_892_729_762);
    expect(inBase(-123_456_789_012_345, 7_654_321, "USD", "USD")).toBe(-944_977_892_729_762);
    /* ⚠️ And an ordinary large figure is exact too. */
    expect(inBase(99_999_999_999, 999_999, "USD", "USD")).toBe(99_999_899_999);
    /* ⚠️ And the pair round-trips, which is the stronger claim than either
       figure on its own: the rate derived from a conversion reproduces it. */
    expect(rateFrom(999_999, 99_999_899_999, "USD", "USD")).toBe(99_999_999_999);
    expect(inBase(999_999, 99_999_999_999, "USD", "USD")).toBe(99_999_899_999);
  });

  /* ⚠️ AND A RESULT THAT WOULD STOP BEING EXACT IS REFUSED rather than rounded
     silently in the last step of the calculation written to avoid that. */
  it("refuses a figure past what an integer holds exactly", () => {
    expect(inBase(Number.MAX_SAFE_INTEGER, 1_000 * RATE_SCALE, "USD", "USD"))
      .toBe("amount_too_large");
  });
});

describe("the rate a pair of figures implies", () => {
  /*
    ⚠️ WHAT AN OPERATOR ACTUALLY HAS. Somebody paying a foreign invoice knows
    what left their account and what arrived; the rate is what they would
    otherwise work out on a calculator and type to six places.
  */
  it("derives the rate from what was paid and what it cost", () => {
    expect(rateFrom(10_000, 36_725, "USD", "AED")).toBe(AED_PER_USD);
  });

  it("runs the conversion backwards exactly", () => {
    const rate = rateFrom(10_000, 36_725, "USD", "AED");
    expect(inBase(10_000, rate as number, "USD", "AED")).toBe(36_725);
  });

  /* ⚠️ THE RATE IS PER MAJOR UNIT, WHICH IS THE ONLY READING A PERSON QUOTES.
     ¥10,000 that cost $68.00 makes one yen worth $0.0068 — 6,800 millionths —
     and NOT a figure a hundred times larger, which is what reading it per minor
     unit would give across a currency with no minor unit at all. */
  it("crosses minor units the same way", () => {
    expect(rateFrom(10_000, 6_800, "JPY", "USD")).toBe(Math.round(0.0068 * RATE_SCALE));
    /* ⚠️ And it is the exact inverse of the conversion above. */
    expect(inBase(10_000, rateFrom(10_000, 6_800, "JPY", "USD") as number, "JPY", "USD"))
      .toBe(6_800);
  });

  it("refuses to divide by nothing", () => {
    expect(rateFrom(0, 100, "USD", "AED")).toBe("amount_too_large");
  });
});

/* ------------------------------------------------------------ revaluation --- */

describe("what revaluing the foreign accounts posts", () => {
  const held: readonly Holding[] = [
    /* ⚠️ $10,000 in the dollar account, put there when a dollar was AED 3.60. */
    { account: "usd-bank", currency: "USD", original: 1_000_000, base: 3_600_000 },
  ];
  const rates = new Map([["USD", AED_PER_USD]]);

  /*
    ⚠️ A BALANCE SHEET IS AS AT A DATE. A dollar account filled at 3.60 and
    reported at 3.60 a year later states a number that was true once; the
    difference is a gain that has already happened whether or not anybody
    records it.
  */
  it("moves the account to what it is worth now", () => {
    const lines = revalueLines(held, rates, "AED", "fx");
    expect(lines.find((l) => l.account === "usd-bank")?.amount).toBe(72_500);
    expect(lines.find((l) => l.account === "fx")?.amount).toBe(-72_500);
  });

  it("moves a loss the other way", () => {
    const fallen = new Map([["USD", Math.round(3.5 * RATE_SCALE)]]);
    const lines = revalueLines(held, fallen, "AED", "fx");
    expect(lines.find((l) => l.account === "usd-bank")?.amount).toBe(-100_000);
    expect(lines.find((l) => l.account === "fx")?.amount).toBe(100_000);
  });

  /*
    ⚠️ IT BALANCES BY CONSTRUCTION RATHER THAN BY A CHECK. Each account moves by
    its own difference and the total goes to the exchange account, so the entry
    sums to zero however many accounts there are.
  */
  it("always sums to nothing", () => {
    const many: Holding[] = [
      ...held,
      { account: "eur-bank", currency: "EUR", original: 500_000, base: 1_900_000 },
      { account: "gbp-owed", currency: "GBP", original: -200_000, base: -900_000 },
    ];
    const all = new Map([
      ["USD", AED_PER_USD],
      ["EUR", Math.round(4.0 * RATE_SCALE)],
      ["GBP", Math.round(4.6 * RATE_SCALE)],
    ]);
    const lines = revalueLines(many, all, "AED", "fx");
    expect(lines.reduce((sum, one) => sum + one.amount, 0)).toBe(0);
    expect(lines).toHaveLength(4);
  });

  it("posts nothing where nothing moved", () => {
    const same: Holding[] = [
      { account: "usd-bank", currency: "USD", original: 1_000_000, base: 3_672_500 },
    ];
    expect(revalueLines(same, rates, "AED", "fx")).toEqual([]);
    expect(revalueLines([], rates, "AED", "fx")).toEqual([]);
  });

  /*
    ⚠️ A CURRENCY WITH NO RATE IS LEFT OUT AND SAID SO. Guessing one would invent
    a figure and post it; leaving it out silently would be a report that ran,
    said it succeeded, and left the one account somebody was asking about exactly
    as wrong as it was.
  */
  it("skips an account it has no rate for, and names the currency", () => {
    const some: Holding[] = [
      ...held,
      { account: "eur-bank", currency: "EUR", original: 500_000, base: 1_900_000 },
    ];
    const lines = revalueLines(some, rates, "AED", "fx");
    expect(lines.map((l) => l.account)).toEqual(["usd-bank", "fx"]);
    expect(unrated(some, rates)).toEqual(["EUR"]);
    expect(unrated(held, rates)).toEqual([]);
  });
});
