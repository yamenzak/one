/**
 * A CATEGORY LABEL IS CUT TO ITS BAND, NEVER DRAWN OVER ITS NEIGHBOUR.
 *
 * ⚠️ AN OVERFLOWING SVG LABEL IS NOT A LEGIBILITY PROBLEM, IT IS A CHART SAYING
 * SOMETHING FALSE. `<text>` neither wraps nor ellipsises, so two product names
 * wider than their columns are painted on top of each other and read as one
 * word that belongs to neither bar. It shipped that way on a reports screen at
 * 390: four product names in a four-column chart, drawn as an unbroken smear.
 *
 * ⚠️ AND THE FIX HAS TO BE THE PURE HALF. Whether a label fits is arithmetic;
 * whether it LOOKS cut is a browser's business. The deciding is here so it can
 * be asserted without one.
 */

import { describe, expect, it } from "vitest";
import { clipTo } from "../src/chart/scale.js";

describe("a label cut to its band", () => {
  it("leaves a name that fits exactly as it was written", () => {
    /* ⚠️ UNTOUCHED, NOT MERELY SHORTER. A clip that appended an ellipsis to
       everything would pass a length check and lie on every chart. */
    expect(clipTo("Mar", 80)).toBe("Mar");
  });

  it("cuts a name that does not, and says it was cut", () => {
    const said = clipTo("Fire extinguisher, CO₂ 5 kg", 40);
    expect(said.endsWith("…")).toBe(true);
    expect(said.length).toBeLessThan("Fire extinguisher, CO₂ 5 kg".length);
  });

  it("never returns more than the band can hold", () => {
    /* ⚠️ THE WHOLE POINT, AND THE ONE THING A LENGTH-ONLY CHECK MISSES: the
       ellipsis is a character too, so cutting to `fits` and then appending one
       is a label that still overflows by exactly one. */
    for (const width of [20, 40, 60, 120]) {
      const fits = Math.floor(width / 4.6);
      expect(clipTo("Isopropanol 99%, five litre bottle".repeat(2), width).length)
        .toBeLessThanOrEqual(fits);
    }
  });

  it("shows nothing rather than one letter in a band too narrow to say anything", () => {
    /* ⚠️ A SINGLE CHARACTER UNDER A BAR IS WORSE THAN AN EMPTY AXIS — it reads
       as a label rather than as the absence of one, so somebody takes "N" for
       the category name. */
    expect(clipTo("Nitrile gloves, M", 6)).toBe("");
  });

  it("does not leave the space before the ellipsis", () => {
    /* ⚠️ "Masking …" is a cut that looks like a rendering fault; "Masking…" is
       a cut that looks like a decision. */
    expect(clipTo("Masking tape, 50 mm", 42)).toBe("Masking…");
  });
});
