/**
 * EVERY DESTINATION AN APP DECLARES IS REACHABLE ON A PHONE.
 *
 * ⚠️ THIS IS THE FAILURE THE TEST EXISTS FOR, AND IT SHIPPED. `Shell` drew
 * `nav: "secondary"` in the desktop rail and nowhere else, so an app declaring
 * five primaries and seven secondaries offered five of its twelve screens to
 * anybody holding a phone — and the other seven had no gesture at all. Every
 * suite was green, because nothing had ever asked the question in one place: the
 * rail was correct, the bar was correct, and between them a third of the product
 * was unreachable on the half of the breakpoint it is used on.
 *
 * ⚠️ SO THE INVARIANT IS THE WHOLE THING, NOT EITHER HALF. Every screen with a
 * nav tier is in exactly one of the two lists — the bar, or what the bar's fifth
 * item opens. Checking that the bar has five, or that the sheet has seven, is
 * what was already being checked implicitly; what was never checked is that the
 * two ADD UP.
 */

import { describe, expect, it } from "vitest";
import type { ScreenSpec } from "@engine/kernel";
import { PRIMARY_MAX } from "@engine/kernel";
import { phoneNav } from "../src/index.js";

const screen = (id: string, nav: ScreenSpec["nav"]): ScreenSpec =>
  ({ id, route: `/${id}`, label: id, nav, permission: "any:read" });

/** ⚠️ OneInventory's own shape, which is what found this. */
const TWELVE: readonly ScreenSpec[] = [
  ...["stock", "scan", "receive", "count", "work"].map((id) => screen(id, "primary")),
  ...["due", "labels", "reports", "ask", "import", "suppliers", "start"]
    .map((id) => screen(id, "secondary")),
  /* ⚠️ A DETAIL SCREEN IS IN NEITHER, and that is correct — it is reached from a
     row rather than from the chrome. It is here so the count below cannot pass
     by accident. */
  screen("thing", "none"),
];

describe("what a phone can reach", () => {
  it("puts every declared destination in exactly one of the two", () => {
    const { bar, rest } = phoneNav(TWELVE);
    const reached = [...bar, ...rest].map((s) => s.id);
    expect(new Set(reached).size).toBe(reached.length);
    expect([...reached].sort()).toEqual(
      TWELVE.filter((s) => s.nav !== "none").map((s) => s.id).sort(),
    );
  });

  /* ⚠️ THE BAR STILL FITS, which is the constraint the sheet exists to serve.
     Five is what a phone holds; the fifth is the way to the rest. */
  it("never asks the bar to hold more than it can", () => {
    expect(phoneNav(TWELVE).bar.length).toBe(PRIMARY_MAX - 1);
  });

  /*
    ⚠️ AND AN APP WITH NOTHING TO HOLD KEEPS ALL FIVE. The slot is spent on the
    way to everywhere else only when there IS an everywhere else — otherwise
    this change would have cost every small app a destination to solve a problem
    it does not have.
  */
  it("leaves an app that fits entirely alone", () => {
    const four = ["a", "b", "c", "d"].map((id) => screen(id, "primary"));
    const { bar, rest } = phoneNav(four);
    expect(bar.map((s) => s.id)).toEqual(["a", "b", "c", "d"]);
    expect(rest).toEqual([]);
  });

  it("holds all five where there are five and no second tier", () => {
    const five = ["a", "b", "c", "d", "e"].map((id) => screen(id, "primary"));
    expect(phoneNav(five).bar.length).toBe(PRIMARY_MAX);
    expect(phoneNav(five).rest).toEqual([]);
  });

  /*
    ⚠️ THE ONE THE RAIL DROPS IS IN THE SHEET, NOT GONE. An app may declare more
    primaries than the bar holds; the sixth was already sliced away at the top of
    this walk, so what the fifth slot gives up is the FIFTH primary and it has to
    land somewhere. Ordered before the second tier, because that is the rail's
    order and one product must not read as two.
  */
  it("puts the primary it displaced at the head of the rest", () => {
    expect(phoneNav(TWELVE).rest.map((s) => s.id)).toEqual([
      "work", "due", "labels", "reports", "ask", "import", "suppliers", "start",
    ]);
  });

  /* ⚠️ AND A SCREEN NOBODY MAY SEE IS IN NEITHER. `phoneNav` is handed what the
     gate already allowed, so this is about the FILTER being upstream rather than
     duplicated — a second opinion here is how a nav comes to advertise a
     destination the server refuses. */
  it("takes what it is given and filters nothing itself", () => {
    const { bar, rest } = phoneNav([screen("only", "primary")]);
    expect([...bar, ...rest].map((s) => s.id)).toEqual(["only"]);
  });
});
