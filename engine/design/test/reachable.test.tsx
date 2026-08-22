/**
 * THE NAVIGATION IS THE BAR, AND THE BAR IS THE NAVIGATION.
 *
 * ⚠️ THERE USED TO BE A SECOND TIER AND IT WAS A MEGA MENU. `Shell` drew
 * `nav: "secondary"` in the desktop rail; the phone's bar spent its fifth slot
 * on an item that opened a sheet of the rest. So a product with twelve screens
 * had twelve places to look, the bar could not answer "where am I" from seven of
 * them, and the same product read differently either side of the breakpoint.
 *
 * ⚠️ THE CEILING WAS NEVER THE PROBLEM; THE OVERFLOW WAS. A second tier is what
 * an app reaches for instead of deciding, so the tier is gone from the kernel —
 * a screen is a destination or it belongs to a subject and is reached from
 * there. This file is what stops the overflow coming back: there is one list,
 * everything in the navigation is in it, and it fits.
 */

import { describe, expect, it } from "vitest";
import type { ScreenSpec } from "@engine/kernel";
import { PRIMARY_MAX } from "@engine/kernel";
import { phoneNav } from "../src/index.js";

const screen = (id: string, nav: ScreenSpec["nav"]): ScreenSpec =>
  ({ id, route: `/${id}`, label: id, nav, permission: "any:read" });

/** ⚠️ OneInventory's own shape: five destinations and the rest under subjects. */
const AN_APP: readonly ScreenSpec[] = [
  ...["stock", "scan", "count", "work", "reports"].map((id) => screen(id, "primary")),
  /* ⚠️ NOT UNREACHABLE — REACHED FROM WHAT THEY ARE ABOUT. Receive from Stock,
     Labels from a location, Suppliers from the catalogue. They are here so the
     assertions below cannot pass by counting an empty list. */
  ...["receive", "due", "labels", "ask", "import", "suppliers", "start", "thing"]
    .map((id) => screen(id, "none")),
];

describe("what the navigation holds", () => {
  it("holds every destination and nothing else", () => {
    expect(phoneNav(AN_APP).map((s) => s.id))
      .toEqual(["stock", "scan", "count", "work", "reports"]);
  });

  /*
    ⚠️ AND THE CEILING IS ENFORCED HERE AS WELL AS AT COMPOSITION. A deployment
    reading a manifest it did not compose must not draw a sixth — which is not a
    hypothetical: the surface is composed from a declaration that travels.
  */
  it("never draws more than the bar can hold", () => {
    const seven = ["a", "b", "c", "d", "e", "f", "g"].map((id) => screen(id, "primary"));
    expect(phoneNav(seven)).toHaveLength(PRIMARY_MAX);
  });

  it("leaves an app that fits entirely alone", () => {
    const four = ["a", "b", "c", "d"].map((id) => screen(id, "primary"));
    expect(phoneNav(four).map((s) => s.id)).toEqual(["a", "b", "c", "d"]);
  });

  /* ⚠️ A SCREEN NOBODY MAY SEE IS ALREADY GONE. `phoneNav` is handed what the
     gate allowed, so this is about the FILTER being upstream rather than
     duplicated — a second opinion here is how a nav comes to advertise a
     destination the server refuses. */
  it("takes what it is given and filters nothing itself", () => {
    expect(phoneNav([screen("only", "primary")]).map((s) => s.id)).toEqual(["only"]);
  });
});
