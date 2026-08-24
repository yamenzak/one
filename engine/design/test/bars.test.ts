/**
 * A BARCODE THAT SCANS AS THE WRONG NUMBER LOOKS EXACTLY LIKE ONE THAT DOES NOT.
 *
 * ⚠️ THAT SENTENCE IS THE WHOLE REASON THIS FILE EXISTS. Every other thing this
 * package draws can be judged by looking at it; a symbol cannot. An EAN-13 whose
 * left half is encoded with the wrong parity table is a picture of bars that a
 * reader decodes cleanly, into a different product — and the only way to know is
 * to check the modules against the standard.
 *
 * ⚠️ AND THE FIRST DIGIT IS THE ONE TO PIN. It is not drawn at all: it is carried
 * in WHICH of two alphabets each of the left six digits uses. An implementation
 * that draws twelve digits and forgets the parity produces a symbol that is
 * perfectly readable and always announces a product beginning with zero.
 */

import { describe, expect, it } from "vitest";
import { barsFor, checksIn, kindOf } from "../src/parts/bars.js";

/* ⚠️ Real codes, so a fixture cannot drift away from what a scanner would see. */
const KITKAT = "7613034626844";      // EAN-13
const COKE_US = "049000042566";      // UPC-A
const SHORT = "96385074";            // EAN-8

describe("what kind of code this is", () => {
  it("reads the three retail lengths off the digits", () => {
    expect(kindOf(KITKAT)).toBe("ean_13");
    expect(kindOf(COKE_US)).toBe("upc_a");
    expect(kindOf(SHORT)).toBe("ean_8");
  });

  /*
    ⚠️ A LENGTH ALONE IS NOT AN ANSWER, which is the difference between reading
    and guessing. Thirteen digits somebody typed is a number; thirteen digits
    whose last one is the weighted sum of the other twelve is a product.
  */
  it("refuses a right-length number whose check digit is wrong", () => {
    expect(checksIn("7613034626845")).toBe(false);
    expect(kindOf("7613034626845")).toBe("other");
    expect(kindOf("1234567890123")).toBe("other");
  });

  it("calls anything that is not digits other", () => {
    expect(kindOf("ABC-123")).toBe("other");
    expect(kindOf("https://example.com/x")).toBe("other");
    expect(kindOf("")).toBe("other");
  });
});

describe("the symbol", () => {
  /* ⚠️ 95 MODULES IS THE STANDARD'S OWN NUMBER: 3 + 42 + 5 + 42 + 3. A symbol of
     any other width is wrong before anything else is looked at. */
  it("is 95 modules wide, and the quiet zone is outside that", () => {
    const drawn = barsFor(KITKAT)!;
    expect(drawn.span).toBe(95 + 18);
    expect(drawn.kind).toBe("ean_13");
  });

  /* ⚠️ EAN-8 IS 67: 3 + 28 + 5 + 28 + 3. */
  it("is 67 modules for an EAN-8", () => {
    expect(barsFor(SHORT)!.span).toBe(67 + 18);
  });

  /*
    ⚠️ THE PARITY IS THE PART THAT IS INVISIBLE AND WRONG. `7613034626844` leads
    with a 7, whose pattern is LGLGLG — so the first drawn digit (6) uses `L` and
    the second (1) uses `G`. Encoded all-`L` the symbol still scans, as a product
    beginning with 0. This asserts the actual modules of those two digits.
  */
  it("carries the first digit in the left half's parity", () => {
    const drawn = barsFor(KITKAT)!;
    /* Module positions of the first two drawn digits, after the 3-module guard
       and the 9-module quiet zone. */
    const at = (n: number) => {
      const from = 9 + 3 + n * 7;
      return [...Array(7)].map((_, i) =>
        (drawn.path.includes(`M${from + i} 0h1v`) ? "1" : "0")).join("");
    };
    /* 6 in `L` is 0101111; 1 in `G` is 0110011. Both are the standard's. */
    expect(at(0)).toBe("0101111");
    expect(at(1)).toBe("0110011");
  });

  /* ⚠️ A UPC-A IS AN EAN-13 WITH A LEADING NOUGHT, so it must come out at the
     SAME width — a narrower symbol would mean a second encoder was used. */
  it("draws a UPC-A as the EAN-13 it is", () => {
    expect(barsFor(COKE_US)!.span).toBe(95 + 18);
  });

  /*
    ⚠️ NOTHING RATHER THAN SOMETHING, which is the whole design of the `null`. A
    Code-128, a QR's payload or a number somebody made up would all be drawn as a
    convincing picture of a different symbology — one scans as the wrong product,
    the other scans as nothing, and both look correct.
  */
  it("draws nothing for what it cannot encode", () => {
    expect(barsFor("ABC-123")).toBeNull();
    expect(barsFor("https://example.com/x")).toBeNull();
    expect(barsFor("1234567890123")).toBeNull();
  });

  /* ⚠️ THE GUARDS RUN LONGER, and it is how a reader finds the ends of the
     symbol rather than a flourish. */
  it("runs the guard bars past the digits", () => {
    const drawn = barsFor(KITKAT)!;
    expect(drawn.path).toContain(`M${9} 0h1v74`);
    expect(drawn.path).toContain("v68");
  });
});
