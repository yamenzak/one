/**
 * THE SENTENCES A PRODUCT IS DESCRIBED IN.
 *
 * ⚠️ THESE ARE THE ONE THING ON THE REGISTER FLOW NOBODY WILL EVER REVIEW BY
 * LOOKING. A sentence is right on the path somebody clicked and reads "1 tablets
 * in a box" on the path nobody did — and a customer meets that path on their
 * first product, decides the app is careless, and is right.
 */

import { describe, expect, it } from "vitest";
import {
  sayCodes, sayCounting, sayGettingMore, sayKeeping, sayNamed, sayPacking, sayPhotos,
  sayTracking,
} from "../src/saying.js";
import type { Level } from "../src/packing.js";

/* ⚠️ `per` IS PER THE RUNG BELOW — a box holds 10 SHEETS, not 100 tablets. */
const AMOXI: readonly Level[] = [
  { name: "sheet", per: 10 },
  { name: "box", per: 10 },
];

describe("how closely it is followed", () => {
  /*
    ⚠️ A CONSEQUENCE, NEVER A DEFINITION. Every one of these has to leave
    somebody able to CHOOSE, which "batched means stock is grouped by batch"
    does not.
  */
  it("says what each rung will change", () => {
    expect(sayTracking("counted")).toContain("how many there are");
    expect(sayTracking("batched")).toContain("delivery");
    expect(sayTracking("itemised")).toContain("serial");
    expect(sayTracking("listed")).toContain("not count it");
  });

  /* ⚠️ THE REGISTER SHEET DOES NOT OFFER IT AND A PRODUCT CAN ALREADY BE ON IT —
     a lookup that returns nothing for a live value draws a blank where a fact
     belongs. */
  it("can describe a kit, which is a rung nothing offers", () => {
    expect(sayTracking("assembled")).toBeTruthy();
  });

  it("says nothing rather than something wrong about a rung it has never heard of", () => {
    expect(sayTracking("teleported")).toBeNull();
  });
});

describe("what it is counted in", () => {
  it("pluralises the unit", () => {
    expect(sayCounting("tablet", true)).toBe("Counted in tablets, whole ones only");
    expect(sayCounting("box", true)).toContain("boxes");
  });

  it("says a half is real where it is", () => {
    expect(sayCounting("kg", false)).toContain("a half is a real amount");
  });

  it("is silent until there is a unit", () => {
    expect(sayCounting("", true)).toBeNull();
    expect(sayCounting("   ", true)).toBeNull();
  });
});

describe("what it comes inside", () => {
  /*
    ⚠️ TOP DOWN, WHICH IS NOT THE ORDER IT IS ENTERED IN. The editor builds from
    the base unit outwards because each rung is defined by the one under it; a
    person holding the box starts from the box.
  */
  it("reads the ladder the way somebody holding the box would say it", () => {
    expect(sayPacking(AMOXI, "tablet"))
      .toBe("A box of 10 sheets of 10 tablets — 100 tablets in all");
  });

  /* ⚠️ THE BOTTOM RUNG IS COUNTED IN THE BASE UNIT, which is the case a loop
     over adjacent PAIRS misses entirely — it would say "10 sheets" twice. */
  it("counts the bottom rung in the base unit", () => {
    expect(sayPacking([{ name: "box", per: 100 }], "tablet")).toBe("A box of 100 tablets");
  });

  /* ⚠️ SAYING THE SAME NUMBER TWICE READS AS A FAULT, NOT AS EMPHASIS. */
  it("does not repeat the total when one rung already is it", () => {
    expect(sayPacking([{ name: "box", per: 100 }], "tablet")).not.toContain("—");
  });

  it("climbs three rungs", () => {
    expect(sayPacking([
      { name: "sheet", per: 10 },
      { name: "box", per: 10 },
      { name: "carton", per: 4 },
    ], "tablet")).toBe("A carton of 4 boxes of 10 sheets of 10 tablets — 400 tablets in all");
  });

  it("says so when it comes as it is", () => {
    expect(sayPacking([], "tablet")).toContain("as it is");
  });

  /* ⚠️ A NAME WITH NO NUMBER IS SOMEBODY MID-TYPING, and drawn it would say
     "a box holds 1 tablets" over a field they have not finished. */
  it("ignores a rung nobody finished", () => {
    expect(sayPacking([{ name: "box", per: 1 }], "tablet")).toContain("as it is");
    expect(sayPacking([{ name: "", per: 10 }], "tablet")).toContain("as it is");
  });

  it("survives having no unit yet", () => {
    expect(sayPacking([{ name: "box", per: 12 }], "")).toBe("A box of 12 units");
  });
});

describe("how long it keeps", () => {
  it("says a shelf life in the units people think in", () => {
    expect(sayKeeping(730, null)).toContain("2 years");
    expect(sayKeeping(365, null)).toContain("1 year");
    expect(sayKeeping(90, null)).toContain("3 months");
  });

  it("does not round a short life away to nothing", () => {
    expect(sayKeeping(10, null)).toContain("10 days");
  });

  it("joins the two clocks", () => {
    expect(sayKeeping(730, 28)).toBe(
      "Keeps about 2 years from the day it was made, and 28 days once opened",
    );
  });

  /* ⚠️ A SHAMPOO PRINTS 12M AND NO EXPIRY AT ALL — an open-jar life with no
     shelf life is a complete answer, not a half-filled one. */
  it("takes an open-jar life on its own", () => {
    expect(sayKeeping(null, 365)).toBe("Good for 365 days once opened");
  });

  it("is silent when nothing was said", () => {
    expect(sayKeeping(null, null)).toBeNull();
    expect(sayKeeping(0, 0)).toBeNull();
  });
});

describe("what is printed on it", () => {
  it("counts them", () => {
    expect(sayCodes([{ value: "5012345678900", pack: 1 }], "tablet")).toBe("One barcode");
    expect(sayCodes([
      { value: "5012345678900", pack: 1 },
      { value: "15012345678907", pack: 24 },
    ], "tablet")).toContain("2 barcodes");
  });

  /* ⚠️ SCANNING A CARTON AND RECORDING ONE ITEM IS THE COMMONEST WRONG NUMBER IN
     INVENTORY WORK, so the largest pack is the one worth saying. */
  it("names the largest pack, because that is the costly one to get wrong", () => {
    expect(sayCodes([
      { value: "a", pack: 1 },
      { value: "b", pack: 24 },
    ], "tablet")).toBe("2 barcodes, the largest a pack of 24 tablets");
  });

  it("says nothing about a pack of one", () => {
    expect(sayCodes([{ value: "a", pack: 1 }], "tablet")).toBe("One barcode");
  });

  it("ignores a row nobody filled in", () => {
    expect(sayCodes([{ value: "   ", pack: 1 }], "tablet")).toBeNull();
    expect(sayCodes([], "tablet")).toBeNull();
  });
});

describe("what it is called", () => {
  it("puts the brand where a person would say it", () => {
    expect(sayNamed("Sandoz", "Amoxicillin 500mg")).toBe("Amoxicillin 500mg, by Sandoz");
  });

  it("drops the brand rather than trailing a comma", () => {
    expect(sayNamed("", "Nitrile gloves")).toBe("Nitrile gloves");
  });

  it("is silent with no name", () => {
    expect(sayNamed("Sandoz", "  ")).toBeNull();
  });
});

describe("the photographs", () => {
  it("counts them and says whether they were read", () => {
    expect(sayPhotos(1, false)).toBe("1 photograph");
    expect(sayPhotos(6, false)).toBe("6 photographs");
    expect(sayPhotos(6, true)).toBe("6 photographs, read by a model");
  });

  it("is silent with none", () => {
    expect(sayPhotos(0, true)).toBeNull();
  });
});

describe("where more comes from", () => {
  it("joins the supplier and the threshold into one clause", () => {
    expect(sayGettingMore("Medline", 20, "box"))
      .toBe("Ordered from Medline, and running low at 20 boxes");
  });

  it("takes either on its own", () => {
    expect(sayGettingMore("Medline", null, "box")).toBe("Ordered from Medline");
    expect(sayGettingMore(null, 20, "box")).toBe("Running low at 20 boxes");
  });

  it("is silent when neither was answered", () => {
    expect(sayGettingMore(null, null, "box")).toBeNull();
    expect(sayGettingMore("  ", 0, "box")).toBeNull();
  });
});

/*
  ⚠️ AND EVERY ONE OF THEM IS A CAPTION, WHICH IS A RULE WITH A SHAPE. They are
  drawn under a control while it is being answered and again in the recap above
  the next question; a full stop on some and not others is the visible edge of a
  product with no house style (`kernel/src/tone.ts`).
*/
describe("every clause is a caption", () => {
  const EVERY = [
    sayTracking("counted"), sayTracking("batched"), sayTracking("itemised"),
    sayTracking("listed"), sayTracking("assembled"),
    sayCounting("tablet", true), sayCounting("kg", false),
    sayPacking(AMOXI, "tablet"), sayPacking([], "tablet"),
    sayKeeping(730, 28), sayKeeping(null, 365),
    sayCodes([{ value: "a", pack: 24 }], "tablet"),
    sayNamed("Sandoz", "Amoxicillin"), sayPhotos(6, true),
    sayGettingMore("Medline", 20, "box"),
  ];

  it("takes no terminal full stop", () => {
    for (const one of EVERY) {
      expect(one, `"${one}"`).toBeTruthy();
      expect(one?.trim().endsWith("."), `"${one}"`).toBe(false);
    }
  });

  /* ⚠️ IT SITS IN A ROW ON A PHONE. Past about fourteen words it wraps to three
     lines and the recap it is supposed to compress becomes the wall of text. */
  it("stays short enough to be read at a glance", () => {
    for (const one of EVERY) {
      expect((one ?? "").split(/\s+/).length, `"${one}"`).toBeLessThanOrEqual(16);
    }
  });
});
