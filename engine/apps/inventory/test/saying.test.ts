/**
 * THE SENTENCES A THING IS DESCRIBED IN.
 *
 * ⚠️ THESE ARE THE ONE THING ON THE REGISTER FLOW NOBODY WILL EVER REVIEW BY
 * LOOKING. A sentence is right on the path somebody clicked and reads "1 tablets
 * in a box" on the path nobody did — and a customer meets that path on their
 * first product, decides the app is careless, and is right.
 *
 * ⚠️ AND EVERY ONE OF THEM HAS TO WORK FOR A BASEMENT SHELF AND A DISTRIBUTOR,
 * which is why the cases below are screws, litres, cans and laptops rather than
 * six variations on a box of pills.
 */

import { describe, expect, it } from "vitest";
import {
  one, sayCodes, sayDates, sayDetail, sayMore, sayNamed, sayPacks, sayPhotos, sayUnit, some,
} from "../src/saying.js";
import type { Level } from "../src/packing.js";

/* ⚠️ `per` IS PER THE PACK BELOW — a case holds 4 BOXES, not 40 screws. */
const SCREWS: readonly Level[] = [
  { name: "box", per: 10 },
  { name: "case", per: 4 },
];

describe("the unit is said the way a person would say it", () => {
  it("pluralises", () => {
    expect(some("screw")).toBe("screws");
    expect(some("box")).toBe("boxes");
    /* ⚠️ ONE IS SINGULAR, which is what "24 boxes" against "1 box" needs. */
    expect(some("box", 1)).toBe("box");
  });

  /*
    ⚠️ A SOUND RULE, NOT A LETTER RULE, and the naive `/^[aeiou]/` gets four
    common unit names wrong in both directions — including "unit" itself, which
    is what this function falls back to.
  */
  it("picks the article by how the word is said", () => {
    expect(one("box")).toBe("a box");
    expect(one("item")).toBe("an item");
    expect(one("ounce")).toBe("an ounce");
    expect(one("hour")).toBe("an hour");
    expect(one("unit")).toBe("a unit");
    expect(one("uniform")).toBe("a uniform");
  });

  /* ⚠️ NEVER EMPTY, because these land mid-sentence: "Can you have half ?" is
     the screen visibly waiting for something nobody has been asked for yet. */
  it("falls back rather than leaving a hole in a sentence", () => {
    expect(some("")).toBe("units");
    expect(one("   ")).toBe("a unit");
  });
});

describe("how much detail is needed", () => {
  /*
    ⚠️ WHAT YOU WILL BE ABLE TO ANSWER LATER, never what the system calls it.
    Each of these has to leave somebody able to CHOOSE, which "batched means
    stock is grouped by batch" does not.
  */
  it("says what each level will let you answer", () => {
    expect(sayDetail("listed")).toContain("never be asked how many");
    expect(sayDetail("counted")).toContain("how many you have");
    expect(sayDetail("batched")).toContain("which delivery");
    expect(sayDetail("itemised")).toContain("any single one");
  });

  /* ⚠️ NO SYSTEM WORDS ANYWHERE IN THEM — that is the rule the four rungs broke
     for a month, as four bare adjectives with no explanation drawn at all. */
  it("uses none of the words somebody would have to be taught", () => {
    const JARGON = /\b(batch|batched|itemis|lot|SKU|par level|tracking)\b/i;
    for (const rung of ["listed", "counted", "batched", "itemised", "assembled"]) {
      expect(sayDetail(rung), rung).toBeTruthy();
      expect(JARGON.test(sayDetail(rung) as string), `${rung}: ${sayDetail(rung)}`).toBe(false);
    }
  });

  /* ⚠️ THE FLOW DOES NOT OFFER IT AND SOMETHING CAN ALREADY BE ON IT — a lookup
     that returns nothing for a live value draws a blank where a fact belongs. */
  it("can describe a kit, which is a level nothing offers", () => {
    expect(sayDetail("assembled")).toBeTruthy();
  });

  it("says nothing rather than something wrong about a level it has never heard of", () => {
    expect(sayDetail("teleported")).toBeNull();
  });
});

describe("what one of them is", () => {
  it("says the unit back, plural", () => {
    expect(sayUnit("screw", true)).toBe("You count these in screws");
    expect(sayUnit("box", true)).toContain("boxes");
  });

  /* ⚠️ THE SURPRISING HALF IS THE ONE WORTH A CLAUSE. "Whole ones only" is what
     everybody expects, and a sentence spent confirming the default is one nobody
     reads. */
  it("mentions halves only where a half is real", () => {
    expect(sayUnit("litre", false)).toBe("You count these in litres, and half a litre is a real amount");
    expect(sayUnit("screw", true)).not.toContain("half");
  });

  it("is silent until there is a unit", () => {
    expect(sayUnit("", true)).toBeNull();
    expect(sayUnit("   ", true)).toBeNull();
  });
});

describe("how it arrives packed", () => {
  /*
    ⚠️ TOP DOWN, WHICH IS NOT THE ORDER IT IS ENTERED IN. The editor builds from
    the unit outwards because each pack is defined by the one under it; a person
    holding the case starts from the case.
  */
  it("reads the way the trade already says it", () => {
    expect(sayPacks(SCREWS, "screw"))
      .toBe("A case of 4 boxes of 10 screws — 40 screws in all");
  });

  /* ⚠️ THE SMALLEST PACK HOLDS UNITS, which is the case a loop over adjacent
     PAIRS misses entirely — it would name the smallest pack twice. */
  it("counts the smallest pack in the unit itself", () => {
    expect(sayPacks([{ name: "box", per: 100 }], "screw")).toBe("A box of 100 screws");
  });

  /* ⚠️ SAYING THE SAME NUMBER TWICE READS AS A FAULT, NOT AS EMPHASIS. */
  it("does not repeat the total when one pack already is it", () => {
    expect(sayPacks([{ name: "box", per: 100 }], "screw")).not.toContain("—");
  });

  it("climbs three packs", () => {
    expect(sayPacks([
      { name: "tray", per: 24 },
      { name: "case", per: 4 },
      { name: "pallet", per: 20 },
    ], "can")).toBe("A pallet of 20 cases of 4 trays of 24 cans — 1920 cans in all");
  });

  it("takes the article from the pack's own name", () => {
    expect(sayPacks([{ name: "envelope", per: 50 }], "sheet")).toBe("An envelope of 50 sheets");
  });

  it("says so when they come singly", () => {
    expect(sayPacks([], "laptop")).toBe("They arrive as single laptops");
  });

  /* ⚠️ A NAME WITH NO NUMBER IS SOMEBODY MID-TYPING, and drawn it would say
     "a box of 1 screws" over a field they have not finished. */
  it("ignores a pack nobody finished", () => {
    expect(sayPacks([{ name: "box", per: 1 }], "screw")).toContain("single");
    expect(sayPacks([{ name: "", per: 10 }], "screw")).toContain("single");
  });

  it("survives having no unit yet", () => {
    expect(sayPacks([{ name: "box", per: 12 }], "")).toBe("A box of 12 units");
  });
});

describe("whether it goes out of date", () => {
  /* ⚠️ "NO" IS AN ANSWER AND IT IS SAID OUT LOUD. A blank line in the review for
     something that genuinely never expires is indistinguishable from a step
     somebody skipped, and the two want completely different attention. */
  it("says no out loud", () => {
    expect(sayDates(false, null, null)).toBe("It does not go out of date");
    /* ⚠️ AND THE DURATIONS ARE IGNORED WHEN THE ANSWER IS NO — somebody who
       typed a number and then changed their mind meant the change of mind. */
    expect(sayDates(false, 730, 28)).toBe("It does not go out of date");
  });

  it("says a life in the units people think in", () => {
    expect(sayDates(true, 730, null)).toContain("2 years");
    expect(sayDates(true, 365, null)).toContain("1 year");
    expect(sayDates(true, 90, null)).toContain("3 months");
  });

  it("does not round a short life away to nothing", () => {
    expect(sayDates(true, 10, null)).toContain("10 days");
  });

  it("joins the two clocks", () => {
    expect(sayDates(true, 730, 28))
      .toBe("Good for about 2 years from the day it was made, and 28 days once opened");
  });

  /* ⚠️ A SHAMPOO PRINTS 12M AND NO EXPIRY AT ALL — an open-jar life with no
     shelf life is a complete answer, not a half-filled one. */
  it("takes an open-jar life on its own", () => {
    expect(sayDates(true, null, 365)).toBe("Good for 365 days once opened");
  });

  /* ⚠️ AND "IT EXPIRES" WITH NO NUMBER IS ALSO REAL. Plenty of things carry a
     printed date and no fixed life, and the date is read off each delivery. */
  it("handles a printed date with no known life", () => {
    expect(sayDates(true, null, null)).toBe("Each delivery carries its own date");
  });
});

describe("what is printed on it", () => {
  it("counts them", () => {
    expect(sayCodes([{ value: "5012345678900", pack: 1 }], "screw")).toBe("One barcode");
    expect(sayCodes([
      { value: "5012345678900", pack: 1 },
      { value: "15012345678907", pack: 24 },
    ], "screw")).toContain("2 barcodes");
  });

  /* ⚠️ SCANNING AN OUTER CASE AND RECORDING ONE ITEM IS THE COMMONEST WRONG
     NUMBER IN THIS KIND OF WORK, so the biggest is the one worth saying. */
  it("names the biggest, because that is the costly one to get wrong", () => {
    expect(sayCodes([{ value: "a", pack: 1 }, { value: "b", pack: 24 }], "can"))
      .toBe("2 barcodes, the biggest covering 24 cans");
  });

  it("says nothing about a pack of one", () => {
    expect(sayCodes([{ value: "a", pack: 1 }], "can")).toBe("One barcode");
  });

  /* ⚠️ "NO BARCODE" IS AN ANSWER TOO — see `sayDates`. Plenty of real things
     carry none, and a blank line cannot say so. */
  it("says none out loud", () => {
    expect(sayCodes([], "can")).toBe("No barcode");
    expect(sayCodes([{ value: "   ", pack: 1 }], "can")).toBe("No barcode");
  });
});

describe("what it is called", () => {
  it("puts the brand where a person would say it", () => {
    expect(sayNamed("Ansell", "Nitrile gloves, medium")).toBe("Nitrile gloves, medium, by Ansell");
  });

  it("drops the brand rather than trailing a comma", () => {
    expect(sayNamed("", "Nitrile gloves")).toBe("Nitrile gloves");
  });

  it("is silent with no name", () => {
    expect(sayNamed("Ansell", "  ")).toBeNull();
  });
});

describe("the photographs", () => {
  it("counts them and says whether they were read", () => {
    expect(sayPhotos(1, false)).toBe("1 photo");
    expect(sayPhotos(6, false)).toBe("6 photos");
    expect(sayPhotos(6, true)).toBe("6 photos, read by the camera");
  });

  it("says none out loud", () => {
    expect(sayPhotos(0, true)).toBe("No photo");
  });
});

describe("where more comes from", () => {
  it("joins the supplier and the threshold into one clause", () => {
    expect(sayMore("Screwfix", 20, "box"))
      .toBe("Bought from Screwfix, and tell you at 20 boxes left");
  });

  it("takes either on its own, as a sentence either way", () => {
    expect(sayMore("Screwfix", null, "box")).toBe("Bought from Screwfix");
    expect(sayMore(null, 20, "box")).toBe("Tells you at 20 boxes left");
    expect(sayMore(null, 1, "box")).toBe("Tells you at 1 box left");
  });

  it("is silent when neither was answered", () => {
    expect(sayMore(null, null, "box")).toBeNull();
    expect(sayMore("  ", 0, "box")).toBeNull();
  });
});

/*
  ⚠️ AND EVERY ONE OF THEM IS A CAPTION, WHICH IS A RULE WITH A SHAPE. They are
  drawn under a control while it is being answered and again in the review at the
  end; a full stop on some and not others is the visible edge of a product with
  no house style (`kernel/src/tone.ts`).
*/
describe("every clause is a caption", () => {
  const EVERY = [
    sayDetail("counted"), sayDetail("batched"), sayDetail("itemised"),
    sayDetail("listed"), sayDetail("assembled"),
    sayUnit("screw", true), sayUnit("litre", false),
    sayPacks(SCREWS, "screw"), sayPacks([], "laptop"),
    sayDates(true, 730, 28), sayDates(false, null, null), sayDates(true, null, 365),
    sayCodes([{ value: "a", pack: 24 }], "can"), sayCodes([], "can"),
    sayNamed("Ansell", "Nitrile gloves"), sayPhotos(6, true), sayPhotos(0, false),
    sayMore("Screwfix", 20, "box"),
  ];

  it("takes no terminal full stop", () => {
    for (const clause of EVERY) {
      expect(clause, `"${clause}"`).toBeTruthy();
      expect(clause?.trim().endsWith("."), `"${clause}"`).toBe(false);
    }
  });

  /* ⚠️ IT SITS IN A ROW ON A PHONE. Past about sixteen words it wraps to three
     lines, and the review it is supposed to compress becomes the wall of text
     this whole design exists to avoid. */
  it("stays short enough to be read at a glance", () => {
    for (const clause of EVERY) {
      expect((clause ?? "").split(/\s+/).length, `"${clause}"`).toBeLessThanOrEqual(16);
    }
  });

  /* ⚠️ AND NONE OF THEM SAYS A WORD SOMEBODY WOULD HAVE TO BE TAUGHT, which is
     the rule the whole rewrite is for. */
  it("uses no system words", () => {
    const JARGON = /\b(batch|batched|itemis|SKU|par level|base unit|tracking)\b/i;
    for (const clause of EVERY) {
      expect(JARGON.test(clause ?? ""), `"${clause}"`).toBe(false);
    }
  });
});
