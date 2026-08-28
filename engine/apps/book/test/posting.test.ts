/**
 * THE ONE INVARIANT, AND EVERY WAY AN ENTRY CAN FAIL IT.
 *
 * ⚠️ THE CASES THAT MATTER MOST ARE THE ONES THAT BALANCE AND ARE STILL WRONG:
 * a single line of zero, an entry of all zeroes, a rule with two debits. Each
 * passes the obvious check and each is a row somebody has to explain later.
 */

import { describe, expect, it } from "vitest";
import {
  balanceOf, balanced, credits, debits, fire, refuseEntry, refuseRule,
  type Line, type Rule,
} from "../src/posting.js";

const line = (account: string, amount: number): Line => ({ account, amount });

describe("whether an entry balances", () => {
  it("says yes to a debit and its credit", () => {
    expect(balanced([line("stock", 5_000), line("owed", -5_000)])).toBe(true);
  });

  it("says no when the two sides differ by a penny", () => {
    expect(balanced([line("stock", 5_000), line("owed", -4_999)])).toBe(false);
  });

  /* ⚠️ THREE LINES AND FOUR ARE ORDINARY — a receipt with tax on it is three. */
  it("balances across more than two lines", () => {
    expect(balanced([
      line("stock", 5_000), line("tax", 250), line("owed", -5_250),
    ])).toBe(true);
  });

  it("reads the two sides as figures a person would recognise", () => {
    const entry = [line("stock", 5_000), line("tax", 250), line("owed", -5_250)];
    expect(debits(entry)).toBe(5_250);
    expect(credits(entry)).toBe(5_250);
  });
});

describe("what an entry can get wrong", () => {
  it("passes an entry that is right", () => {
    expect(refuseEntry([line("a", 100), line("b", -100)])).toBeNull();
  });

  it("refuses an empty entry", () => {
    expect(refuseEntry([])).toBe("no_lines");
  });

  /*
    ⚠️ A SINGLE LINE IS ITS OWN REFUSAL, NOT AN UNBALANCED ONE. Somebody who has
    typed one side and not the other has not made a mistake, they have not
    finished — and "it does not balance" is true and useless to them.
  */
  it("tells somebody who has only typed one side", () => {
    expect(refuseEntry([line("a", 100)])).toBe("one_line");
    expect(refuseEntry([line("a", 0)])).toBe("one_line");
  });

  /* ⚠️ MINOR UNITS ARE WHOLE. A fraction means the figure was not money. */
  it("refuses a fraction of a penny", () => {
    expect(refuseEntry([line("a", 100.5), line("b", -100.5)])).toBe("not_whole");
  });

  /*
    ⚠️ ALL ZEROES BALANCES PERFECTLY, and it is a row in a ledger that will be
    read, dated, filed and reconciled by somebody and says nothing at all.
  */
  it("refuses an entry where nothing moves", () => {
    expect(refuseEntry([line("a", 0), line("b", 0)])).toBe("nothing_moves");
  });

  it("refuses one that does not balance", () => {
    expect(refuseEntry([line("a", 100), line("b", -99)])).toBe("unbalanced");
  });
});

/* ------------------------------------------------------------------ rules --- */

const rule = (over: Partial<Rule> = {}): Rule => ({
  event: "buying.received",
  sides: [
    { role: "stock", as: "debit", of: "landed" },
    { role: "stock_pending", as: "credit", of: "landed" },
  ],
  ...over,
});

describe("what a posting rule can get wrong", () => {
  it("passes a rule with a side each way", () => {
    expect(refuseRule(rule())).toBeNull();
  });

  /*
    ⚠️ TWO DEBITS AND NO CREDIT IS THE ONE WORTH CATCHING HERE. It produces an
    entry that cannot balance, every time it fires, and the write refuses into a
    consequence nobody is watching — so nothing goes red and the books are
    quietly missing every purchase.
  */
  it("refuses a rule that only moves one way", () => {
    expect(refuseRule(rule({ sides: [
      { role: "stock", as: "debit", of: "landed" },
      { role: "cogs", as: "debit", of: "landed" },
    ] }))).toBe("one_direction");
  });

  it("refuses a rule with nothing in it, and one with a single side", () => {
    expect(refuseRule(rule({ sides: [] }))).toBe("no_sides");
    expect(refuseRule(rule({ sides: [{ role: "stock", as: "debit", of: "landed" }] })))
      .toBe("one_side");
  });

  it("refuses a role no posting can name", () => {
    expect(refuseRule(rule({ sides: [
      { role: "invented" as never, as: "debit", of: "landed" },
      { role: "stock_pending", as: "credit", of: "landed" },
    ] }))).toBe("unknown_role");
  });

  /* ⚠️ AN EVENT ANSWERS WITH SEVERAL NUMBERS AND ONLY ONE OF THEM IS MONEY. */
  it("refuses a side that does not say which figure to take", () => {
    expect(refuseRule(rule({ sides: [
      { role: "stock", as: "debit", of: "  " },
      { role: "stock_pending", as: "credit", of: "landed" },
    ] }))).toBe("no_field");
  });
});

/* ----------------------------------------------------------------- firing --- */

const chart: Record<string, string> = {
  stock: "acc_stock", stock_pending: "acc_grni", suspense: "acc_suspense",
};
const at = (answer: Record<string, unknown>, held = chart) => ({
  answer, accountFor: (role: string) => held[role] ?? null,
});

describe("a rule and an event, turned into lines", () => {
  it("posts B2's own example", () => {
    const out = fire(rule(), at({ landed: 5_000, had: 3, left: 0 }));
    expect(out).toEqual({ ok: true, lines: [
      { account: "acc_stock", amount: 5_000 },
      { account: "acc_grni", amount: -5_000 },
    ] });
  });

  it("produces lines that balance", () => {
    const out = fire(rule(), at({ landed: 12_345 }));
    expect(out.ok && balanced(out.lines)).toBe(true);
  });

  /*
    ⚠️ THE FIGURE IS NAMED, AND THIS IS WHY. `buying.received` answers with how
    many arrived, how many are still to come, and what it was valued at — and
    posting `had` would be a ledger of quantities in a money column that balances
    perfectly.
  */
  it("takes the field the rule names and not another number in the answer", () => {
    const out = fire(rule(), at({ landed: 5_000, had: 3 }));
    expect(out.ok && out.lines[0]?.amount).toBe(5_000);
  });

  /*
    ⚠️ A RECEIPT WITH NO PRICE HAS NOTHING TO POST, AND THAT IS NOT A FAILURE.
    `landed` is `money | null` on the operation that raises this — somebody
    receiving stock without saying what it cost is ordinary.
  */
  it("says nothing moves when the event carried no figure", () => {
    expect(fire(rule(), at({ landed: null })).ok).toBe(false);
    expect(fire(rule(), at({ landed: null }))).toEqual({ ok: false, why: "no_amount" });
    expect(fire(rule(), at({}))).toEqual({ ok: false, why: "no_amount" });
  });

  it("refuses a figure that is not a whole number of minor units", () => {
    expect(fire(rule(), at({ landed: 10.5 }))).toEqual({ ok: false, why: "no_amount" });
  });

  it("posts nothing for a zero, rather than filing a row that says nothing", () => {
    expect(fire(rule(), at({ landed: 0 }))).toEqual({ ok: false, why: "nothing_moves" });
  });

  /*
    ⚠️ SUSPENSE IS WHAT KEEPS THE ENTRY BALANCED WHEN A ROLE HAS NO HOME —
    see `roles.ts`. Dropping the side would produce a one-sided entry, which is
    the failure this whole file exists to make impossible.
  */
  it("lands a homeless role in suspense rather than losing the side", () => {
    const out = fire(rule(), at({ landed: 5_000 }, { stock: "acc_stock", suspense: "acc_suspense" }));
    expect(out).toEqual({ ok: true, lines: [
      { account: "acc_stock", amount: 5_000 },
      { account: "acc_suspense", amount: -5_000 },
    ] });
    expect(out.ok && balanced(out.lines)).toBe(true);
  });

  it("refuses when even suspense has been deleted", () => {
    expect(fire(rule(), at({ landed: 5_000 }, {}))).toEqual({ ok: false, why: "no_suspense" });
  });

  it("never fires a rule it would have refused", () => {
    expect(fire(rule({ sides: [] }), at({ landed: 5_000 }))).toEqual({ ok: false, why: "no_sides" });
  });
});

describe("what an account holds", () => {
  const ledger = [
    line("acc_stock", 5_000), line("acc_grni", -5_000),
    line("acc_stock", 2_000), line("acc_grni", -2_000),
    line("acc_stock", -1_000), line("acc_cash", 1_000),
  ];

  /* ⚠️ A BALANCE IS A SUM AND IS NEVER STORED (B2). */
  it("adds the lines up rather than reading a total", () => {
    expect(balanceOf(ledger, "acc_stock")).toBe(6_000);
    expect(balanceOf(ledger, "acc_grni")).toBe(-7_000);
  });

  it("says zero for an account nothing has touched", () => {
    expect(balanceOf(ledger, "acc_nothing")).toBe(0);
  });

  /* ⚠️ AND THE WHOLE LEDGER SUMS TO ZERO, WHICH IS THE TRIAL BALANCE. */
  it("sums the whole ledger to nothing", () => {
    expect(balanced(ledger)).toBe(true);
  });
});
