/**
 * THE ORDER RAIL — what was asked for, what came, and what may still change.
 *
 * ⚠️ THE FAULT EVERY RULE HERE IS AGAINST IS A RECEIPT THAT RECONCILES AGAINST A
 * PROMISE NOBODY MADE. Raise a placed line from 10 to 12 after 12 turn up and
 * every number agrees, the order closes clean, and the record of what was
 * actually ordered is gone. Nothing throws and no screen looks wrong.
 */

import { describe, expect, it } from "vitest";
import {
  ORDERS, ORDER_ACTS, afterArrival, groupBySupplier, outstanding, refuseArrival,
  refuseOrder, saysLine, settled, type Line, type Order, type OrderAct,
} from "../src/ordering.js";

/* ----------------------------------------------------------------- states --- */

describe("what may happen to an order", () => {
  it("writes and places a draft", () => {
    expect(refuseOrder("draft", "add")).toBeNull();
    expect(refuseOrder("draft", "drop")).toBeNull();
    expect(refuseOrder("draft", "place")).toBeNull();
  });

  /*
    ⚠️ THE ONE TO READ TWICE — see the file header. The whole value of the record
    is that it says what was asked for.
  */
  it("refuses to change what a placed order asked for", () => {
    expect(refuseOrder("placed", "add")).toMatch(/cannot change/);
    expect(refuseOrder("part", "drop")).toMatch(/cannot change/);
    expect(refuseOrder("closed", "add")).toMatch(/cannot change/);
  });

  it("takes a delivery against one that is out and not against one that is not", () => {
    expect(refuseOrder("placed", "receive")).toBeNull();
    expect(refuseOrder("part", "receive")).toBeNull();
    expect(refuseOrder("draft", "receive")).toMatch(/not been placed/);
    expect(refuseOrder("closed", "receive")).toMatch(/nothing more/);
    expect(refuseOrder("cancelled", "receive")).toMatch(/cancelled/);
  });

  /*
    ⚠️ CANCELLING A PART-RECEIVED ORDER WOULD ERASE WHY THE STOCK IS THERE, which
    is the one thing an order is kept for after it is finished. The way out is a
    short close, and the refusal says so rather than only saying no.
  */
  it("refuses to cancel an order some of which has arrived, and says what to do", () => {
    expect(refuseOrder("part", "cancel")).toMatch(/close it short/);
    expect(refuseOrder("draft", "cancel")).toBeNull();
    expect(refuseOrder("placed", "cancel")).toBeNull();
  });

  it("closes one that is out, short or complete", () => {
    expect(refuseOrder("placed", "close")).toBeNull();
    expect(refuseOrder("part", "close")).toBeNull();
    expect(refuseOrder("draft", "close")).toMatch(/not been placed/);
  });

  /*
    ⚠️ EVERY PAIR ANSWERED, WHICH IS WHAT MAKES THE SCREEN'S `when` GATES SAFE TO
    MIRROR. A standing and an act with no rule between them is a control that is
    offered and then falls through a switch to `undefined` — allowed, silently,
    by the absence of a branch.
  */
  it("has an answer for every standing and every act", () => {
    for (const state of ORDERS) {
      for (const act of ORDER_ACTS) {
        const said = refuseOrder(state as Order, act as OrderAct);
        expect(said === null || said.length > 0, `${state} + ${act}`).toBe(true);
      }
    }
  });
});

/* ------------------------------------------------------------------ lines --- */

describe("what is still outstanding", () => {
  const line = (asked: number, had: number): Line => ({ product: "p", asked, had });

  it("is what was asked for less what has come", () => {
    expect(outstanding(line(10, 4))).toBe(6);
    expect(outstanding(line(10, 0))).toBe(10);
  });

  /*
    ⚠️ CLAMPED, BECAUSE OVER-DELIVERY IS ALLOWED. Without it a case of 12 against
    an order for 10 reports minus two, and an order's total then reads as less
    than the sum of what it is still waiting for — a number that is wrong in the
    direction nobody checks, on the screen that exists to be checked.
  */
  it("is never negative when more arrived than was ordered", () => {
    expect(outstanding(line(10, 12))).toBe(0);
  });

  it("settles when every line has arrived", () => {
    expect(settled([line(10, 10), line(4, 4)])).toBe(true);
    expect(settled([line(10, 10), line(4, 3)])).toBe(false);
    /* ⚠️ AND AN OVER-DELIVERED LINE SETTLES, which the clamp is what makes true.
       An order closing only on exact equality would stay open for ever on the
       ordinary Tuesday the header describes. */
    expect(settled([line(10, 12)])).toBe(true);
  });

  /*
    ⚠️ AN ORDER WITH NO LINES SETTLES, and that is why placing one is refused
    without them elsewhere. Said here so the arithmetic is honest on its own
    terms rather than relying on a caller nobody can see from this file.
  */
  it("settles vacuously with no lines at all", () => {
    expect(settled([])).toBe(true);
  });

  it("closes itself when the last line lands, and not before", () => {
    expect(afterArrival([line(10, 10), line(4, 4)])).toBe("closed");
    expect(afterArrival([line(10, 10), line(4, 1)])).toBe("part");
  });
});

describe("what may be received", () => {
  it("takes a whole positive number", () => {
    expect(refuseArrival(1)).toBeNull();
    expect(refuseArrival(240)).toBeNull();
  });

  /* ⚠️ A RECEIPT OF NONE IS A PRESS THAT DID NOTHING WEARING THE CLOTHES OF A
     DELIVERY, and a negative one is a return, which is a different verb and a
     different sentence. */
  it("refuses nothing, and refuses a return wearing a delivery's clothes", () => {
    expect(refuseArrival(0)).toMatch(/how many/i);
    expect(refuseArrival(-3)).toMatch(/how many/i);
  });

  it("refuses a fraction of a delivery", () => {
    expect(refuseArrival(2.5)).toMatch(/whole number/);
    expect(refuseArrival(Number.NaN)).toMatch(/whole number/);
  });
});

/* ----------------------------------------------------------- what to order --- */

describe("what to buy, grouped for ordering", () => {
  const row = (product: string, supplier: string | null) => ({ product, supplier });

  it("puts a supplier's products together", () => {
    const by = new Map(groupBySupplier([
      row("gloves", "s1"), row("resin", "s2"), row("swabs", "s1"),
    ]));
    expect(by.get("s1")?.map((r) => r.product)).toEqual(["gloves", "swabs"]);
    expect(by.get("s2")?.map((r) => r.product)).toEqual(["resin"]);
  });

  /*
    ⚠️ A PRODUCT WITH NO SUPPLIER IS ITS OWN GROUP AND IS NEVER DROPPED. Silently
    omitting it makes the shortest list the one a workspace that has never filled
    in a supplier sees — which is every workspace, on the day they most need to
    know what to buy.
  */
  it("keeps what nobody supplies, under its own empty key", () => {
    const by = new Map(groupBySupplier([row("gloves", "s1"), row("tape", null)]));
    expect(by.get("")?.map((r) => r.product)).toEqual(["tape"]);
  });

  /* ⚠️ IN THE ORDER THEY ARRIVED, because the report is already sorted by how
     urgent each line is and re-sorting here would silently overrule it. */
  it("keeps the order the report put them in", () => {
    expect(groupBySupplier([row("a", "s2"), row("b", "s1")]).map(([k]) => k))
      .toEqual(["s2", "s1"]);
  });
});

/* ------------------------------------------------------------ the sentence --- */

describe("what a line says", () => {
  const line = (asked: number, had: number): Line => ({ product: "p", asked, had });

  it("says nothing has come yet", () => {
    expect(saysLine(line(20, 0))).toBe("20 ordered, none yet");
  });

  it("says the gap, which is what somebody opens an order to read", () => {
    expect(saysLine(line(12, 4))).toBe("4 of 12 arrived, 8 to come");
  });

  it("says it is all here", () => {
    expect(saysLine(line(8, 8))).toBe("All 8 arrived");
  });

  /* ⚠️ OVER-DELIVERY IS SAID RATHER THAN ROUNDED AWAY. "All 10 arrived" over a
     shelf holding 12 is the sentence agreeing with the promise instead of with
     the stock, which is the one direction this rail must never lean. */
  it("says how much more than was asked for arrived", () => {
    expect(saysLine(line(10, 12))).toBe("10 ordered, 12 arrived — 2 more than asked");
  });
});
