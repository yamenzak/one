/**
 * THE FORM A DECLARED ACT DRAWS, AND WHAT IT DOES NOT ASK FOR.
 *
 * ⚠️ THE SHARP CASE IS THE ONE THAT IS NOT DRAWN. Every write in a real product
 * takes the thing it acts on and the day it happened — `unit.issue` takes an
 * item and a date, `batch.open` takes a batch and a date — and both are facts
 * the screen is standing on. Drawn from `input` alone, the first button on the
 * first declared screen asks somebody to type a row id they would have to copy
 * out of a URL.
 *
 * ⚠️ AND AN ACT WHOSE EVERY INPUT IS FILLED RUNS ON THE PRESS. A sheet holding
 * one button to confirm a press somebody has already made is a second press for
 * nothing, so `asks` has to answer about what is LEFT rather than about what the
 * operation declares.
 *
 * ⚠️ IT ASSERTS THE DECISION RATHER THAN THE MARKUP, and that is not a shortcut.
 * The sheet is an overlay and renders through a portal, so a static render
 * answers with an empty string and every assertion about what was drawn would
 * pass over nothing — measured, by writing them. `unasked` is exported for
 * exactly this: a rule this consequential should be checkable without a browser.
 */

import { describe, expect, it } from "vitest";
import { field } from "@engine/kernel";
import { asks, unasked } from "../src/rendered/doing.js";

const TAKES = {
  unit: field.text({ label: "Item", required: true, holds: "none" }),
  holder: field.text({ label: "With", required: true, holds: "contact", max: 120 }),
  day: field.day({ label: "On", required: true, holds: "none" }),
};

describe("a form asks only for what the screen does not know", () => {
  it("asks for every input when the screen fills in nothing", () => {
    expect(unasked(TAKES)).toEqual(["unit", "holder", "day"]);
  });

  it("leaves out a field the screen supplies", () => {
    expect(unasked(TAKES, { unit: "u_1", day: "2026-08-26" })).toEqual(["holder"]);
  });

  /* ⚠️ THE DECLARED ORDER SURVIVES, because a form is read top to bottom and the
     order the operation states its input in is the order somebody wrote it in. */
  it("keeps the order the operation declared", () => {
    expect(unasked(TAKES, { holder: "Ana" })).toEqual(["unit", "day"]);
  });
});

describe("whether there is anything left to ask", () => {
  it("says yes for an operation with an unfilled input", () => {
    expect(asks(TAKES)).toBe(true);
    expect(asks(TAKES, { unit: "u_1" })).toBe(true);
  });

  /* ⚠️ THE ONE THAT DECIDES WHETHER A SHEET OPENS AT ALL. Every input filled
     means the act runs on the press — see `Fill`. */
  it("says no when the screen supplies all of them", () => {
    expect(asks(TAKES, { unit: "u_1", holder: "Ana", day: "2026-08-26" })).toBe(false);
  });

  it("says no for an operation that takes nothing", () => {
    expect(asks({})).toBe(false);
    expect(asks(undefined)).toBe(false);
  });
});
