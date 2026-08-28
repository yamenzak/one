/**
 * WHICH PART OF THE BUSINESS A FIGURE BELONGS TO.
 *
 * ⚠️ THE FAILURES HERE DO NOT THROW AND DO NOT LOOK WRONG. A report narrowed to
 * a parent returns the parent's own postings, which in a business that posts to
 * its shops is nothing — empty, correct, and indistinguishable from broken. A
 * cost centre required on a bank account is a payment nobody can record.
 */

import { describe, expect, it } from "vitest";
import {
  earns, refusePlacing, rollUp, within, type Centre,
} from "../src/dimensions.js";

const centre = (over: Partial<Centre> & { id: string }): Centre =>
  ({ name: over.id, parent: null, closed: false, ...over });

/* ⚠️ Retail has two shops under it; the workshop stands alone. This is the
   shape every question below is asked of. */
const TREE: readonly Centre[] = [
  centre({ id: "retail" }),
  centre({ id: "shop-a", parent: "retail" }),
  centre({ id: "shop-b", parent: "retail" }),
  centre({ id: "workshop" }),
];

/* ------------------------------------------------------------ the walks --- */

describe("a centre and everything under it", () => {
  /*
    ⚠️ THIS IS WHAT "NARROW TO RETAIL" MEANS. Filtering the ledger to the one row
    called Retail answers with whatever was posted directly to it, which in a
    business that posts to its shops is nothing at all.
  */
  it("includes the descendants, not just the row", () => {
    expect([...within(TREE, "retail")].sort())
      .toEqual(["retail", "shop-a", "shop-b"]);
  });

  it("is just the one where there is nothing under it", () => {
    expect(within(TREE, "workshop")).toEqual(["workshop"]);
    expect(within(TREE, "shop-a")).toEqual(["shop-a"]);
  });

  it("does not reach sideways", () => {
    expect(within(TREE, "retail")).not.toContain("workshop");
  });

  /* ⚠️ THE ENGINE REFUSES A RING ON THE WAY IN — see `treeFieldsOf` — and this
     is the read path, which also runs over rows written before that rule. A
     report that never answers is the worst way to find out. */
  it("stops on a cycle instead of walking for ever", () => {
    const bent = [
      centre({ id: "x", parent: "y" }),
      centre({ id: "y", parent: "x" }),
    ];
    expect([...within(bent, "x")].sort()).toEqual(["x", "y"]);
  });
});

describe("what each centre comes to", () => {
  const own = new Map([["shop-a", 300], ["shop-b", 200], ["workshop", 50]]);

  /* ⚠️ A PARENT USUALLY HAS NOTHING POSTED TO IT, and its figure is the only one
     anybody wanted. */
  it("adds the children into the parent", () => {
    const whole = rollUp(own, TREE);
    expect(whole.get("retail")).toBe(500);
    expect(whole.get("shop-a")).toBe(300);
    expect(whole.get("workshop")).toBe(50);
  });

  it("gives a centre with nothing in it a zero rather than nothing", () => {
    const whole = rollUp(new Map(), TREE);
    expect(whole.get("retail")).toBe(0);
    expect([...whole.keys()].sort())
      .toEqual(["retail", "shop-a", "shop-b", "workshop"]);
  });

  it("carries a figure the whole way up a chain", () => {
    const chain = [
      centre({ id: "a" }), centre({ id: "b", parent: "a" }),
      centre({ id: "c", parent: "b" }),
    ];
    const whole = rollUp(new Map([["c", 90]]), chain);
    expect(whole.get("a")).toBe(90);
    expect(whole.get("b")).toBe(90);
    expect(whole.get("c")).toBe(90);
  });

  it("adds a loss the same way", () => {
    const whole = rollUp(new Map([["shop-a", -400], ["shop-b", 100]]), TREE);
    expect(whole.get("retail")).toBe(-300);
  });

  it("stops on a cycle instead of adding for ever", () => {
    const bent = [
      centre({ id: "x", parent: "y" }),
      centre({ id: "y", parent: "x" }),
    ];
    const whole = rollUp(new Map([["x", 10]]), bent);
    expect(whole.get("x")).toBe(10);
    expect(whole.get("y")).toBe(10);
  });
});

/* ------------------------------------------------------ posting to one --- */

describe("whether a line may name this centre", () => {
  it("lets an open centre through", () => {
    expect(refusePlacing({ centre: "shop-a", root: "expense" }, TREE, true)).toBeNull();
  });

  it("refuses one that is not there", () => {
    expect(refusePlacing({ centre: "gone", root: "expense" }, TREE, false))
      .toBe("centre_unknown");
  });

  /* ⚠️ CLOSING ONE MEANS THE BRANCH SHUT; a line still landing there is a figure
     in a report nobody reads any more. */
  it("refuses a closed one", () => {
    const shut = [...TREE, centre({ id: "old", closed: true })];
    expect(refusePlacing({ centre: "old", root: "expense" }, shut, false))
      .toBe("centre_closed");
  });

  it("lets a line go without one where none is required", () => {
    expect(refusePlacing({ centre: null, root: "expense" }, TREE, false)).toBeNull();
  });

  it("asks for one on the profit and loss where the workspace said to", () => {
    expect(refusePlacing({ centre: null, root: "expense" }, TREE, true))
      .toBe("centre_missing");
    expect(refusePlacing({ centre: null, root: "income" }, TREE, true))
      .toBe("centre_missing");
  });

  /*
    ⚠️ AND NEVER ON THE BALANCE SHEET, WHICH IS THE INDUSTRY'S RULE RATHER THAN A
    CONVENIENCE. Cash is not the shop's cash — it is the company's, sitting in one
    account — and neither is a debt owed to a supplier. A workspace that switched
    the requirement on would otherwise be unable to record a payment.
  */
  it("never asks for one on the balance sheet", () => {
    for (const root of ["asset", "liability", "equity"] as const) {
      expect(refusePlacing({ centre: null, root }, TREE, true)).toBeNull();
    }
    expect(earns("asset")).toBe(false);
    expect(earns("income")).toBe(true);
  });
});
