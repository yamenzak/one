/**
 * THE SHEET AND THE KEYBOARD.
 *
 * ⚠️ NO HEADLESS BROWSER CAN OPEN A SOFT KEYBOARD, which is exactly why the sheet
 * shipped with its action, its message and its field behind one. Every screenshot
 * anybody took was of a desktop that has no keyboard to be covered by. The
 * measurement is a pure function so that the part which can be wrong — a sign, a
 * clamp, a forgotten scroll offset — is the part a test can reach.
 */

import { describe, expect, it } from "vitest";
import { keyboardInset } from "../src/account/editor.js";

describe("what the keyboard is standing on", () => {
  /*
    ⚠️ THE CASE THE DEFECT WAS. iOS and every in-app browser leave the layout
    viewport alone and shrink the VISUAL one, so nothing in CSS knows: `100dvh` is
    still the whole screen and `position: fixed; bottom: 0` is still the bottom of
    a screen the person cannot see the bottom of.
  */
  it("is the gap when the layout viewport does not shrink", () => {
    expect(keyboardInset(844, 508, 0)).toBe(336);
  });

  /*
    ⚠️ AND IT IS ZERO WHERE THE BROWSER ALREADY MOVED THE SHEET. Android Chrome
    shrinks the layout viewport instead, so the sheet is above the keyboard
    already — a correction there would push it up twice.
  */
  it("is nothing when the layout viewport shrank with it", () => {
    expect(keyboardInset(508, 508, 0)).toBe(0);
  });

  /*
    ⚠️ THE PAGE SCROLLS UNDER THE KEYBOARD, and the offset is how far. Dropping it
    makes the correction too large by exactly that much, which puts the sheet's
    top off the screen rather than its bottom.
  */
  it("counts the scroll the keyboard caused", () => {
    expect(keyboardInset(844, 508, 120)).toBe(216);
  });

  /*
    ⚠️ NEVER NEGATIVE. A visual viewport can report taller than the layout during a
    pinch or a rubber-band, and a negative inset drives the sheet down off the
    bottom of the screen — the defect it exists to fix, caused by the fix.
  */
  it("never pulls the sheet downwards", () => {
    expect(keyboardInset(844, 900, 0)).toBe(0);
    expect(keyboardInset(844, 844, -40)).toBe(0);
  });
});
