/**
 * WHAT AN INVOICE COMES TO, AND WHAT IT POSTS.
 *
 * ⚠️ THE FAILURES HERE ARE ALL A PENNY, AND A PENNY IS WHY SOMEBODY DOES NOT
 * TRUST A SYSTEM. Tax rounded per line and added up disagrees with the tax on the
 * total, so the invoice argues with itself and the customer's own addition is
 * right. A quantity held as a whole number cannot express half an hour. An entry
 * that does not balance is caught downstream; one that balances at the wrong
 * figure is not caught anywhere.
 */

import { describe, expect, it } from "vitest";
import {
  QUANTITY_SCALE, chargeOf, entryFor, netOf, refuseItems, taxOf, type Item,
} from "../src/invoice.js";

const hours = (n: number) => n * QUANTITY_SCALE;

/* ⚠️ Two and a half hours of consulting at ninety, standard-rated at 5%. */
const CONSULTING: Item = {
  account: "income-consulting", said: "Consulting",
  quantity: hours(2.5), price: 9_000, tax: "vat",
};
const RATES = new Map([["vat", 500], ["zero", 0]]);

describe("what one line comes to", () => {
  it("multiplies a fractional quantity by a price", () => {
    /* ⚠️ 2.5 × 90.00 is 225.00. */
    expect(netOf(CONSULTING)).toBe(22_500);
  });

  it("takes a whole quantity", () => {
    expect(netOf({ quantity: hours(3), price: 3_333 })).toBe(9_999);
  });

  /*
    ⚠️ HALF AWAY FROM ZERO, THE SAME AS A CONVERSION. Rounding toward zero loses
    a penny in one direction on every line with a fraction, which accumulates in
    one party's favour and is invisible.
  */
  it("rounds half away from zero on both sides", () => {
    /* ⚠️ A third of an hour at ten pounds is 3.333…, which rounds to 3.33. */
    expect(netOf({ quantity: 333, price: 1_000 })).toBe(333);
    /* ⚠️ And exactly a half rounds up, in both directions. */
    expect(netOf({ quantity: 500, price: 1_001 })).toBe(501);
    expect(netOf({ quantity: -500, price: 1_001 })).toBe(-501);
  });

  it("takes a tax rate in basis points", () => {
    expect(taxOf(22_500, 500)).toBe(1_125);
    /* ⚠️ Seven and a half per cent is 750, not 7.5. */
    expect(taxOf(10_000, 750)).toBe(750);
    expect(taxOf(10_000, 0)).toBe(0);
  });
});

describe("what the whole invoice comes to", () => {
  /*
    ⚠️ TAX ROUNDED ONCE PER CODE, NOT PER LINE. Three lines of 3.33 taxed at 5%
    are 0.1665 each — 0.17 rounded per line, 0.51 added up — against 0.50 on the
    9.99 total. The customer adds up the column and gets the second one.
  */
  it("rounds tax once over the group, not once per line", () => {
    const items: Item[] = [
      { account: "sales", said: "a", quantity: hours(1), price: 333, tax: "vat" },
      { account: "sales", said: "b", quantity: hours(1), price: 333, tax: "vat" },
      { account: "sales", said: "c", quantity: hours(1), price: 333, tax: "vat" },
    ];
    const charge = chargeOf(items, RATES);
    expect(charge.net).toBe(999);
    expect(charge.tax).toBe(50);
    expect(charge.gross).toBe(1_049);
  });

  /*
    ⚠️ ONE FIGURE PER RATE, WHICH IS WHAT A RETURN WANTS. An invoice that only
    knows its total is one whose tax return has to be rebuilt by reading every
    line again.
  */
  it("keeps each rate's net and tax apart", () => {
    const items: Item[] = [
      CONSULTING,
      { account: "sales-books", said: "Books", quantity: hours(2), price: 5_000, tax: "zero" },
    ];
    const charge = chargeOf(items, RATES);
    expect(charge.byTax.get("vat")).toEqual({ net: 22_500, tax: 1_125 });
    expect(charge.byTax.get("zero")).toEqual({ net: 10_000, tax: 0 });
    expect(charge.net).toBe(32_500);
    expect(charge.tax).toBe(1_125);
  });

  /*
    ⚠️ AN UNTAXED LINE IS NOT A ZERO-RATED ONE. The two look the same on a total
    and are different on a return in most of the world — so an untaxed line is in
    no group at all, and a workspace that means zero-rated makes a code for it.
  */
  it("leaves an untaxed line out of every group", () => {
    const charge = chargeOf(
      [{ account: "sales", said: "Postage", quantity: hours(1), price: 500 }], RATES);
    expect(charge.net).toBe(500);
    expect(charge.byTax.size).toBe(0);
    expect(charge.gross).toBe(500);
  });

  it("comes to nothing over nothing", () => {
    const charge = chargeOf([], RATES);
    expect(charge).toMatchObject({ net: 0, tax: 0, gross: 0 });
  });
});

describe("what an invoice cannot be", () => {
  it("passes an ordinary one", () => {
    expect(refuseItems([CONSULTING])).toBeNull();
  });

  it("refuses one with no lines and one with no account", () => {
    expect(refuseItems([])).toBe("no_items");
    expect(refuseItems([{ ...CONSULTING, account: "" }])).toBe("no_account");
  });

  it("refuses a fractional quantity that is not thousandths", () => {
    expect(refuseItems([{ ...CONSULTING, quantity: 2.5 }])).toBe("not_whole");
    expect(refuseItems([{ ...CONSULTING, price: 90.5 }])).toBe("not_whole");
  });

  /*
    ⚠️ THE ONE THAT PASSES EVERY OTHER CHECK. An invoice coming to nothing is a
    numbered document, sent to a customer, recorded against them, asking for no
    money — and every arithmetic rule is satisfied by it.
  */
  it("refuses one that asks for nothing", () => {
    expect(refuseItems([{ ...CONSULTING, price: 0 }])).toBe("nothing_charged");
    expect(refuseItems([{ ...CONSULTING, quantity: 0 }])).toBe("nothing_charged");
  });

  /* ⚠️ AND A NEGATIVE LINE IS ALLOWED. A discount or a returned item on the same
     invoice is one negative line; refusing it makes every real discount a second
     document. */
  it("allows a discount line beside a charge", () => {
    expect(refuseItems([
      CONSULTING,
      { account: "discount", said: "Goodwill", quantity: hours(1), price: -2_000 },
    ])).toBeNull();
  });
});

/* ------------------------------------------------------------- the entry --- */

describe("what a submitted invoice posts", () => {
  const homes = { party: "debtors", taxTo: () => "vat-owed" };

  it("debits the customer and credits income and tax", () => {
    const charge = chargeOf([CONSULTING], RATES);
    const lines = entryFor([CONSULTING], charge, homes, "out", "INV-1");
    expect(lines).toEqual([
      { account: "debtors", amount: 23_625, memo: "INV-1" },
      { account: "income-consulting", amount: -22_500, memo: "INV-1" },
      { account: "vat-owed", amount: -1_125, memo: "INV-1" },
    ]);
  });

  /* ⚠️ ONE ARITHMETIC, MIRRORED BY A SIGN — a purchase credits the supplier and
     debits expense, and every figure is the same one. */
  it("credits the supplier and debits expense and tax the other way", () => {
    const charge = chargeOf([CONSULTING], RATES);
    const lines = entryFor([CONSULTING], charge, { party: "creditors", taxTo: () => "vat-paid" },
      "in", "BILL-1");
    expect(lines[0]).toEqual({ account: "creditors", amount: -23_625, memo: "BILL-1" });
    expect(lines[1]?.amount).toBe(22_500);
    expect(lines[2]?.amount).toBe(1_125);
  });

  /*
    ⚠️ IT BALANCES BY CONSTRUCTION. One side is the gross; the other is every
    line's net plus every tax group. They are the same sum by definition of
    `gross`, so nothing here can produce an entry the ledger would reject.
  */
  it("always sums to nothing", () => {
    const sets: Item[][] = [
      [CONSULTING],
      [CONSULTING, { account: "sales-books", said: "Books", quantity: hours(2), price: 5_000, tax: "zero" }],
      [CONSULTING, { account: "discount", said: "Goodwill", quantity: hours(1), price: -2_000 }],
      [{ account: "sales", said: "Postage", quantity: hours(1), price: 500 }],
    ];
    for (const items of sets) {
      const lines = entryFor(items, chargeOf(items, RATES), homes, "out", "x");
      expect(lines.reduce((sum, one) => sum + one.amount, 0)).toBe(0);
    }
  });

  /*
    ⚠️ GATHERED PER ACCOUNT RATHER THAN ONE POSTING PER LINE. Forty lines against
    one income account is forty postings a report has to add up and a person has
    to scroll past; the document keeps the detail, the ledger keeps the movement.
  */
  it("gathers lines that share an account", () => {
    const items: Item[] = [
      { account: "sales", said: "a", quantity: hours(1), price: 1_000 },
      { account: "sales", said: "b", quantity: hours(1), price: 2_000 },
    ];
    const lines = entryFor(items, chargeOf(items, RATES), homes, "out", "x");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toEqual({ account: "sales", amount: -3_000, memo: "x" });
  });

  /* ⚠️ BUT NOT ACROSS COST CENTRES, because a department's income landing in
     another department's column is the whole thing a centre exists to prevent. */
  it("keeps two centres apart on the same account", () => {
    const items: Item[] = [
      { account: "sales", said: "a", quantity: hours(1), price: 1_000, centre: "north" },
      { account: "sales", said: "b", quantity: hours(1), price: 2_000, centre: "south" },
    ];
    const lines = entryFor(items, chargeOf(items, RATES), homes, "out", "x");
    expect(lines).toHaveLength(3);
    expect(lines.find((l) => l.centre === "north")?.amount).toBe(-1_000);
    expect(lines.find((l) => l.centre === "south")?.amount).toBe(-2_000);
  });

  it("posts no line for a tax group that came to nothing", () => {
    const items: Item[] = [
      { account: "sales-books", said: "Books", quantity: hours(2), price: 5_000, tax: "zero" },
    ];
    const lines = entryFor(items, chargeOf(items, RATES), homes, "out", "x");
    expect(lines.map((l) => l.account)).toEqual(["debtors", "sales-books"]);
  });
});
