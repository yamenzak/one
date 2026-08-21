/**
 * THE CLASSIFICATION, AND WHAT A LABEL MAY SAY ABOUT IT.
 *
 * ⚠️ EVERY RULE HERE IS ABOUT A BOTTLE SOMEBODY PICKS UP. A label carrying both
 * "harmful" and "acutely toxic" tells a reader the harm is minor while something
 * else on the same sticker says it is lethal; a signal word with nothing behind
 * it is a shout with no subject; a diamond with no signal word is half a legal
 * declaration. None of them throws and none looks wrong on a screen.
 */

import { describe, expect, it } from "vitest";
import {
  CODES, GHS, SIGNALS, hazardContradictions, hazardOf, hazardsIn, isHazardous, signalIn,
} from "../src/hazard.js";

describe("the nine", () => {
  /*
    ⚠️ ALL NINE, BECAUSE A SUBSET IS A CLASSIFICATION WE MADE. A list missing the
    gas cylinder makes a compressed-gas store impossible to label correctly, and
    nobody would report that — they would write it in the notes, where nothing
    prints it.
  */
  it("carries every GHS class, in the standard's own order", () => {
    expect(CODES).toEqual([
      "GHS01", "GHS02", "GHS03", "GHS04", "GHS05", "GHS06", "GHS07", "GHS08", "GHS09",
    ]);
    expect(GHS).toHaveLength(9);
  });

  /* ⚠️ EACH SAYS WHAT IT IS AND WHAT IT MEANS. The second is for the person on
     the floor, who has never read a safety data sheet and is the one holding the
     bottle. */
  it("says what each one means in words somebody can act on", () => {
    for (const one of GHS) {
      expect(one.says.length, one.code).toBeGreaterThan(2);
      expect(one.means.length, one.code).toBeGreaterThan(10);
    }
    expect(hazardOf("GHS06")?.says).toBe("Acutely toxic");
    expect(hazardOf("GHS99")).toBeUndefined();
  });
});

describe("reading a stored classification", () => {
  /*
    ⚠️ A JSON COLUMN IS WHATEVER WAS LAST WRITTEN TO IT — by a form, by an
    import, or by somebody accepting what a model read off a photograph. Anything
    that is not one of the nine is dropped rather than printed: a diamond reading
    "GHS42" on a bottle is a label nobody can act on.
  */
  it("keeps only the nine, whatever was stored", () => {
    expect(hazardsIn(["GHS02", "nonsense", 7, null])).toEqual(["GHS02"]);
    expect(hazardsIn("GHS02")).toEqual([]);
    expect(hazardsIn(null)).toEqual([]);
    expect(hazardsIn(undefined)).toEqual([]);
  });

  /* ⚠️ AND IN THE APP'S ORDER, NOT THE STORED ONE. A label whose diamonds move
     about between two printings of the same product is one somebody stops
     trusting. */
  it("puts them in one order however they were stored", () => {
    expect(hazardsIn(["GHS08", "GHS02", "GHS05"])).toEqual(["GHS02", "GHS05", "GHS08"]);
  });

  it("reads a signal word or nothing", () => {
    expect(SIGNALS).toEqual(["danger", "warning"]);
    expect(signalIn("danger")).toBe("danger");
    expect(signalIn("DANGER")).toBe("");
    expect(signalIn("severe")).toBe("");
    expect(signalIn(null)).toBe("");
  });
});

describe("a classification that cannot all be true", () => {
  /*
    ⚠️ REAL GHS PRECEDENCE, NOT HOUSE STYLE. The exclamation mark is not used
    alongside the skull for the same hazard — a label carrying both says the harm
    is minor while the diamond next to it says it can kill.
  */
  it("refuses to show harmful beside acutely toxic", () => {
    expect(hazardContradictions(["GHS06", "GHS07"], "danger"))
      .toContain("Harmful is not shown beside Acutely toxic — the stronger one stands alone");
  });

  it("refuses to show harmful beside corrosive", () => {
    expect(hazardContradictions(["GHS05", "GHS07"], "danger"))
      .toContain("Harmful is not shown beside Corrosive for skin and eye harm");
  });

  /* ⚠️ THE SKULL IS ALWAYS `Danger`. Shown over "Warning" it reads as a
     substance somebody has decided is not that bad. */
  it("holds the skull to Danger", () => {
    expect(hazardContradictions(["GHS06"], "warning")).toContain("Acutely toxic is always Danger");
    expect(hazardContradictions(["GHS06"], "danger")).toEqual([]);
  });

  /* ⚠️ THE HALF-FILLED STATE, AND IT IS THE COMMONEST ONE — somebody ticks the
     diamonds and stops. A pictogram with no signal word is an incomplete label,
     and the whole point of catching it here is that the sheet prints anyway. */
  it("names both halves of a half-filled label", () => {
    expect(hazardContradictions(["GHS02"], ""))
      .toContain("A hazard with no signal word is an incomplete label");
    expect(hazardContradictions([], "danger"))
      .toContain('"danger" with no hazard says nothing a reader can act on');
  });

  /* ⚠️ AND AN ORDINARY PRODUCT IS SILENT. A contradiction on every non-chemical
     in a catalogue is a warning nobody reads by the second day. */
  it("says nothing about a thing that is not a substance", () => {
    expect(hazardContradictions([], "")).toEqual([]);
  });
});

describe("whether a thing needs a label of its own", () => {
  /*
    ⚠️ THE QUESTION THE SHEET ASKS, and it is not "is anything filled in". A
    product with storage notes and no classification is an ordinary product; one
    with a diamond is a container that may not be decanted without its own label.
  */
  it("is about the classification and nothing else", () => {
    expect(isHazardous(["GHS02"], "")).toBe(true);
    expect(isHazardous([], "warning")).toBe(true);
    expect(isHazardous([], "")).toBe(false);
  });
});
