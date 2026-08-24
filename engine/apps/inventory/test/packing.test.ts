/**
 * THE LADDER BETWEEN A CARTON AND A TABLET, ASSERTED.
 *
 * ⚠️ EVERY FAULT THIS KIND OF CODE HAS IS A WRONG NUMBER RATHER THAN A CRASH,
 * which is why it is pure and why it is tested here. `per` read as base units
 * instead of per-parent is wrong by a factor of the rung below and renders
 * perfectly. An unknown level treated as `1` receives a carton as one tablet. A
 * `"10"` out of a JSON column multiplies into `NaN` and lands on a shelf. None
 * of the three throws, and none is visible in a screenshot.
 *
 * ⚠️ THE BOX FROM THE REPORT IS THE FIXTURE. Amoxicillin: a carton of 20 boxes,
 * a box of 3 sheets, a sheet of 10 tablets — 600 tablets in a carton, and the
 * sheet is the rung that has no barcode and therefore could not exist before.
 */

import { describe, expect, it } from "vitest";
import {
  LEAST_PER, MOST_LEVELS, factorOf, factors, perOf, readLevels, refuseLevels, spell,
  type Level,
} from "../src/packing.js";

/** ⚠️ Shallowest first, `per` counted in the rung below. */
const AMOXI: readonly Level[] = [
  { name: "sheet", per: 10 },
  { name: "box", per: 3 },
  { name: "carton", per: 20 },
];

describe("what one of a level holds", () => {
  /*
    ⚠️ THE ONE THAT IS SILENTLY WRONG IF `per` IS READ AS BASE UNITS. A box would
    come out as 3 tablets instead of 30 — a tenth of the delivery, recorded
    without complaint, discovered at the next count.
  */
  it("multiplies each rung by the ones below it", () => {
    expect(factorOf(AMOXI, "sheet")).toBe(10);
    expect(factorOf(AMOXI, "box")).toBe(30);
    expect(factorOf(AMOXI, "carton")).toBe(600);
  });

  it("does not care how the level was capitalised or spaced", () => {
    expect(factorOf(AMOXI, "  BOX ")).toBe(30);
  });

  /*
    ⚠️ `null`, NEVER `1`, AND THIS IS THE SHARPEST ASSERTION IN THE FILE. The
    name arrives from a client. A rung the product does not declare is a stale
    screen or a mistake, and answering `1` puts one tablet on the shelf where a
    carton of six hundred was meant — a wrong number nothing downstream can
    detect, because one is a number a real entry produces.
  */
  it("refuses a level the ladder does not have", () => {
    expect(factorOf(AMOXI, "pallet")).toBeNull();
    expect(factorOf(AMOXI, "")).toBeNull();
    expect(factorOf([], "box")).toBeNull();
  });

  it("lists every rung with what it stands for", () => {
    expect(factors(AMOXI)).toEqual([
      { name: "sheet", per: 10 }, { name: "box", per: 30 }, { name: "carton", per: 600 },
    ]);
  });
});

describe("the multiplier one entry means", () => {
  /*
    ⚠️ EXACTLY ONE MULTIPLICATION, WHICH IS WHAT THIS FUNCTION IS FOR. A level
    and a code's `pack` are the same kind of number, and a path that applied both
    put nine hundred tablets on a shelf once already — see
    `packing.screens.test.tsx`.
  */
  it("prefers the named level over the code's pack", () => {
    expect(perOf(AMOXI, "box", 999)).toBe(30);
  });

  it("falls back to the code's pack when no level is named", () => {
    expect(perOf(AMOXI, null, 24)).toBe(24);
    expect(perOf(AMOXI, "  ", 24)).toBe(24);
  });

  /* ⚠️ AND THE FLOOR IS ONE. A code row written before the column existed, or by
     an importer that did not set it, would otherwise receive a delivery as
     nothing at all — a movement recorded, a shelf unchanged. */
  it("treats a missing or nonsense pack as a single", () => {
    expect(perOf(AMOXI, null, null)).toBe(1);
    expect(perOf(AMOXI, null, 0)).toBe(1);
    expect(perOf(AMOXI, null, -4)).toBe(1);
  });

  it("passes the unknown rung straight through as a refusal", () => {
    expect(perOf(AMOXI, "pallet", 30)).toBeNull();
  });
});

describe("a ladder out of a JSON column", () => {
  /*
    ⚠️ THE COLUMN HOLDS WHATEVER IS IN THE COLUMN. An import, an older version of
    this app, or a hand-edited row reaches the arithmetic exactly like a good
    one — and `per: "10"` multiplies into a string, which arrives on the shelf as
    `NaN` and is refused by nothing.
  */
  it("reads a stored string", () => {
    expect(readLevels(JSON.stringify(AMOXI))).toEqual(AMOXI);
  });

  it("coerces a numeric string and drops what it cannot use", () => {
    expect(readLevels([
      { name: "sheet", per: "10" },
      { name: "", per: 4 },
      { name: "box", per: 1 },
      { name: "carton", per: 20 },
      "nonsense",
      null,
    ])).toEqual([{ name: "sheet", per: 10 }, { name: "carton", per: 20 }]);
  });

  it("answers nothing for nothing", () => {
    expect(readLevels(null)).toEqual([]);
    expect(readLevels("{ not json")).toEqual([]);
    expect(readLevels({ name: "box", per: 3 })).toEqual([]);
  });

  it("stops at the cap rather than walking whatever was pasted", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ name: `l${i}`, per: 2 }));
    expect(readLevels(many)).toHaveLength(MOST_LEVELS);
  });
});

describe("why a ladder cannot be saved", () => {
  /*
    ⚠️ REFUSED AT THE DOOR RATHER THAN CLEANED UP ON READ. `readLevels` DROPS
    what it cannot use, which is right for a column that may hold anything and
    wrong for somebody typing into a form — a rung silently discarded on save is
    a picker missing an entry, found by whoever receives the next delivery.
  */
  it("accepts a good one", () => {
    expect(refuseLevels(AMOXI, "tablet")).toBeNull();
    expect(refuseLevels([], "tablet")).toBeNull();
  });

  it("refuses a rung named after the base unit", () => {
    expect(refuseLevels([{ name: "Tablet", per: 10 }], "tablet")).toContain("already");
  });

  it("refuses the same name twice", () => {
    expect(refuseLevels(
      [{ name: "box", per: 3 }, { name: "Box", per: 4 }], "tablet",
    )).toContain("twice");
  });

  /* ⚠️ A RUNG HOLDING ONE OF THE THING BELOW IT IS A SECOND NAME FOR THE SAME
     QUANTITY — two picker entries that put an identical number on the shelf,
     with nothing afterwards able to say which was chosen. */
  it("refuses a level that holds one", () => {
    expect(refuseLevels([{ name: "box", per: 1 }], "tablet"))
      .toContain(`at least ${LEAST_PER}`);
  });

  it("refuses a name nobody typed and a count nobody gave", () => {
    expect(refuseLevels([{ name: "  ", per: 3 }], "tablet")).toContain("name");
    expect(refuseLevels([{ name: "box", per: 2.5 }], "tablet")).toContain("how many");
  });
});

describe("spelling a quantity in the words somebody thinks in", () => {
  it("breaks a number down largest rung first", () => {
    expect(spell(97, AMOXI, "tablet")).toBe("3 boxes, 7 tablets");
    expect(spell(600, AMOXI, "tablet")).toBe("1 carton");
    expect(spell(641, AMOXI, "tablet")).toBe("1 carton, 1 box, 1 sheet, 1 tablet");
  });

  /* ⚠️ A RUNG WITH NOTHING IN IT IS ABSENT, NOT ZERO. "1 carton, 0 boxes, 1
     sheet" is three facts where one of them is that nothing is there, and a
     reader counting rows sees a deeper ladder than the number contains. */
  it("leaves out a rung the number does not reach", () => {
    expect(spell(617, AMOXI, "tablet")).toBe("1 carton, 1 sheet, 7 tablets");
  });

  /*
    ⚠️ NOTHING TO SAY IS SAID AS NOTHING. A caller rendering "7" under "7
    tablets" has drawn a second line that repeats the first, which is how a
    screen teaches somebody to stop reading it.
  */
  it("says nothing where the breakdown would repeat the number", () => {
    expect(spell(7, AMOXI, "tablet")).toBeNull();
    expect(spell(0, AMOXI, "tablet")).toBeNull();
    expect(spell(97, [], "tablet")).toBeNull();
  });

  it("plurals the workspace's own words without inventing a language", () => {
    expect(spell(20, [{ name: "box", per: 10 }], "piece")).toBe("2 boxes");
    expect(spell(10, [{ name: "box", per: 10 }], "piece")).toBe("1 box");
    expect(spell(30, [{ name: "tray", per: 10 }], "piece")).toBe("3 trays");
  });

  /* ⚠️ A CASE OF 24 IS THE ORDINARY NON-MEDICAL LADDER, and it is the same
     arithmetic — this file is not about pharmacy. */
  it("reads a case-and-inner ladder the same way", () => {
    const drinks: readonly Level[] = [{ name: "pack", per: 6 }, { name: "case", per: 4 }];
    expect(factorOf(drinks, "case")).toBe(24);
    expect(spell(100, drinks, "can")).toBe("4 cases, 4 cans");
  });
});
