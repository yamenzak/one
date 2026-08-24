/**
 * A CARTON OF THIRTY IS THIRTY, AND FOR A WHILE IT WAS NINE HUNDRED.
 *
 * ⚠️ TWO HALVES OF ONE MULTIPLIER, BOTH REASONABLE, PRODUCT WRONG. `stock.arrive`
 * multiplies the quantity it is sent by the scanned code's `pack` — its own
 * comment says so, and says a caller sending the multiplied number would double
 * it. The Receive screen then seeded its quantity field with the pack. Scanning a
 * carton of thirty and pressing the only button on the screen put nine hundred
 * tablets on the shelf, and the number the person expected was showing the whole
 * time.
 *
 * ⚠️ NOTHING ANYWHERE COULD HAVE CAUGHT IT, WHICH IS WHY THE PAIR IS EXPORTED.
 * Each half is correct read on its own: an operation that multiplies is right,
 * and a field that opens at what the box holds is a reasonable thing to write.
 * The fault is in the COMPOSITION, so the composition is what is asserted —
 * `onShelf(startingQuantity(), pack)` is one scanned thing's worth, for every
 * pack size.
 *
 * ⚠️ AND IT IS THE ARITHMETIC, NOT THE PIXELS. The screen renders a number field
 * and a sentence under it; the bug was neither. A browser test here would prove
 * that a wrong number is legible.
 */

import { describe, expect, it } from "vitest";
import { onShelf, startingQuantity } from "../src/screens/Receive.js";

/** ⚠️ A blister box, a glove carton, a reel of components, a single. */
const PACKS = [1, 10, 24, 30, 100, 1_000];

describe("scanning one thing puts one thing away", () => {
  it.each(PACKS)("a code holding %i lands as exactly that many", (pack) => {
    expect(onShelf(startingQuantity(), pack)).toBe(pack);
  });

  /*
    ⚠️ THE REGRESSION, NAMED. Seeding the field with the pack is the edit that
    caused this, it reads as helpful, and its symptom is a shelf count that is
    wrong by a square rather than by a factor — which is large enough that
    somebody notices and small enough that nobody suspects the screen.
  */
  it("does not apply the pack twice", () => {
    expect(onShelf(30, 30)).toBe(900);
    expect(startingQuantity()).not.toBe(30);
  });
});

describe("what a quantity means", () => {
  it("counts the thing scanned, so two cartons of ten are twenty", () => {
    expect(onShelf(2, 10)).toBe(20);
  });

  /* ⚠️ AN ABSENT PACK IS ONE, NEVER ZERO. A code row written before the column
     existed, or by an importer that did not set it, would otherwise receive a
     delivery as nothing at all — a movement recorded, a shelf unchanged. */
  it("treats a missing or nonsense pack as a single", () => {
    expect(onShelf(4, undefined)).toBe(4);
    expect(onShelf(4, 0)).toBe(4);
  });
});
