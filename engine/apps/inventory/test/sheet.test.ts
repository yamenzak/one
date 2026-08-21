/**
 * A SPREADSHEET SOMEBODY ALREADY HAS, AND THE FOUR WAYS AN IMPORT LIES.
 *
 * ⚠️ EVERY FAILURE HERE PRODUCES A CATALOGUE THAT LOOKS COMPLETE. A quoted comma
 * read as a separator shifts every column after it; a European decimal read as a
 * thousands separator turns twelve hundred boxes into one; a duplicate applied
 * twice makes what you imported depend on the order of your own file; and a row
 * silently dropped is discovered months later by somebody looking for the thing
 * that is not there. None of them throws.
 */

import { describe, expect, it } from "vitest";
import {
  IGNORED, MOST_ROWS, columnsFor, columnsIn, mappingIn, numberIn, planIn, readRow,
  readSheet, tallyIn, type Known,
} from "../src/sheet.js";

const NOTHING: Known = { byName: {}, byCode: {} };

/* ------------------------------------------------------------------ reading --- */

describe("reading what somebody pasted", () => {
  /*
    ⚠️ A PRODUCT NAME WITH A COMMA IN IT IS THE ORDINARY CASE. "Gloves, nitrile,
    M" is one field and three if the quoting is ignored — and the three shift
    every column after it, so the brand column becomes "nitrile" for the whole
    file.
  */
  it("keeps a quoted comma inside its field", () => {
    expect(readRow('"Gloves, nitrile, M",Ansell,12', ","))
      .toEqual(["Gloves, nitrile, M", "Ansell", "12"]);
  });

  /* ⚠️ AND A DOUBLED QUOTE IS ONE QUOTE, which is what every spreadsheet
     writes for a name containing a quotation mark. */
  it("reads a doubled quote as one", () => {
    expect(readRow('"6"" pipe",x', ",")).toEqual(['6" pipe', "x"]);
  });

  /*
    ⚠️ TABS AND COMMAS AND SEMICOLONS, DECIDED BY THE HEADER. Pasting out of a
    spreadsheet gives tabs; a download gives commas; a European export gives
    semicolons because its decimals use commas. Asking somebody which they have
    is asking them about their own clipboard.
  */
  it("works out the separator from the heading", () => {
    expect(readSheet("name\tbrand\nGloves\tAnsell").header).toEqual(["name", "brand"]);
    expect(readSheet("name;brand\nGloves;Ansell").rows).toEqual([["Gloves", "Ansell"]]);
    expect(readSheet("name,brand\nGloves,Ansell").rows).toEqual([["Gloves", "Ansell"]]);
  });

  /*
    ⚠️ A BLANK LINE ENDS NOTHING. Spreadsheets are full of them, and a reader
    that stopped at the first would import the top half of a file and report
    success.
  */
  it("reads past a blank line", () => {
    const sheet = readSheet("name\nA\n\nB\n\n");
    expect(sheet.rows.map((r) => r[0])).toEqual(["A", "B"]);
  });

  /* ⚠️ AND IT IS BOUNDED. A hundred thousand rows pasted into a worker is a
     request that times out half way through a write, which is the one outcome
     an import must not have. */
  it("stops at a bound rather than at a timeout", () => {
    const many = ["name", ...Array.from({ length: MOST_ROWS + 500 }, (_, i) => `p${i}`)];
    expect(readSheet(many.join("\n")).rows).toHaveLength(MOST_ROWS);
  });

  it("answers an empty paste with nothing", () => {
    expect(readSheet("")).toEqual({ header: [], rows: [] });
    expect(readSheet("   \n \n")).toEqual({ header: [], rows: [] });
  });
});

/* ----------------------------------------------------------------- matching --- */

describe("which column is which", () => {
  it("matches the headings somebody actually writes", () => {
    const out = columnsIn(["product name", "ean", "qty", "shelf"]);
    expect(out.name).toBe(0);
    expect(out.code).toBe(1);
    expect(out.quantity).toBe(2);
    expect(out.location).toBe(3);
  });

  /*
    ⚠️ A COLUMN IS CLAIMED ONCE. A sheet with both "code" and "barcode" has two
    headings meaning the same thing, and letting both map to `code` would make
    the answer depend on which loop ran last.
  */
  it("gives one column to one field", () => {
    const out = columnsIn(["code", "barcode", "name"]);
    expect(out.code).toBe(0);
    expect(Object.values(out).filter((i) => i === 1)).toEqual([]);
  });

  /* ⚠️ AND AN EXACT MATCH BEATS A PARTIAL ONE. "Supplier brand" contains
     "brand", and a partial pass running first would give `brand` that column
     while a real "Brand" column sat unused. */
  it("prefers an exact heading to one that contains it", () => {
    const out = columnsIn(["supplier brand", "brand"]);
    expect(out.brand).toBe(1);
  });

  /* ⚠️ A SHEET WITH NOTHING RECOGNISABLE MAPS NOTHING, rather than mapping
     column zero to the first field and importing a column of dates as names. */
  it("maps nothing it does not recognise", () => {
    expect(columnsIn(["colonne un", "deux"])).toEqual({});
  });
});

describe("correcting the guess", () => {
  /*
    ⚠️ A MAPPING ARRIVES AS AN OPAQUE BLOB OFF THE WIRE, and it is used to INDEX
    a row. A string where a number belongs reads `undefined` off every line, so
    eight hundred products import with no name and nothing throws.
  */
  it("throws away anything that is not a column number", () => {
    expect(mappingIn({ name: "0", brand: 1.5, code: null, unit: 2 })).toEqual({ unit: 2 });
    expect(mappingIn("name")).toEqual({});
    expect(mappingIn(null)).toEqual({});
    expect(mappingIn(["name"])).toEqual({});
  });

  /* ⚠️ AND A FIELD THIS APP DOES NOT HAVE IS NOT A FIELD. It would claim a
     column for a value nothing will ever write. */
  it("throws away a field nothing declares", () => {
    expect(mappingIn({ name: 0, invented: 1 })).toEqual({ name: 0 });
  });

  it("lets a correction beat the guess", () => {
    expect(columnsFor(["name", "brand"], { name: 1 }).name).toBe(1);
  });

  /*
    ⚠️ TURNING A COLUMN OFF IS THE CORRECTION SOMEBODY MAKES MOST — a "Location"
    column full of a warehouse code that means nothing here. The field has to end
    up ABSENT rather than empty: an absent field overwrites nothing, and an empty
    one blanks what a product already has.
  */
  it("lets a column be turned off entirely", () => {
    const out = columnsFor(["name", "shelf"], { location: IGNORED });
    expect(out.name).toBe(0);
    expect("location" in out).toBe(false);
  });

  /* ⚠️ AND A COLUMN PAST THE END OF THE HEADING IS NOT A COLUMN. It reads
     `undefined` off every row, which is silently an empty sheet. */
  it("drops a column the sheet does not have", () => {
    expect("code" in columnsFor(["name"], { code: 7 })).toBe(false);
  });
});

/* ------------------------------------------------------------------ numbers --- */

describe("a number out of a spreadsheet", () => {
  /*
    ⚠️ THE LAST SEPARATOR IS THE DECIMAL POINT, which is the only rule that reads
    both conventions right. A thousands separator read as a decimal point turns
    twelve hundred boxes into one — silently, in the direction that makes a store
    room look empty.
  */
  it("reads both conventions", () => {
    expect(numberIn("1,234.50")).toBe(1234.5);
    expect(numberIn("1.234,50")).toBe(1234.5);
    expect(numberIn("1 234,50")).toBe(1234.5);
    expect(numberIn("12")).toBe(12);
  });

  /* ⚠️ AND NOTHING IS `null`, WHICH IS NOT ZERO. A par level nobody set and a
     par level of zero are different statements about a shelf. */
  it("tells an absent number from a zero", () => {
    expect(numberIn("")).toBeNull();
    expect(numberIn("   ")).toBeNull();
    expect(numberIn("0")).toBe(0);
    expect(numberIn("n/a")).toBeNull();
  });
});

/* ----------------------------------------------------------------- planning --- */

describe("what an import would do", () => {
  const sheetOf = (text: string) => {
    const sheet = readSheet(text);
    return { sheet, columns: columnsIn(sheet.header) };
  };

  it("calls a thing nobody has new", () => {
    const { sheet, columns } = sheetOf("name,brand\nGloves M,Ansell");
    const out = planIn(sheet, columns, NOTHING);
    expect(out).toHaveLength(1);
    expect(out[0]?.verdict).toBe("new");
    expect(out[0]?.name).toBe("Gloves M");
  });

  /*
    ⚠️ MATCHED ON THE CODE FIRST. A barcode names one thing; a name is what
    somebody typed, and two exports of the same catalogue spell it differently —
    so matching on the name alone makes a second "Gloves, Nitrile M" beside the
    first, for ever.
  */
  it("matches an existing product by its code before its name", () => {
    const { sheet, columns } = sheetOf("name,barcode\nGloves nitrile M,5012345678900");
    const out = planIn(sheet, columns, {
      byName: { "something else": "p-other" },
      byCode: { "5012345678900": "p-glove" },
    });
    expect(out[0]?.verdict).toBe("update");
    expect(out[0]?.product).toBe("p-glove");
  });

  it("falls back to the name where there is no code", () => {
    const { sheet, columns } = sheetOf("name\nGloves M");
    const out = planIn(sheet, columns, { byName: { "gloves m": "p-glove" }, byCode: {} });
    expect(out[0]?.product).toBe("p-glove");
    expect(out[0]?.verdict).toBe("update");
  });

  /*
    ⚠️ A DUPLICATE WITHIN THE SHEET IS REFUSED RATHER THAN APPLIED TWICE. The
    second row would overwrite the first's answer, so what somebody imported
    would depend on the order of their own file.
  */
  it("refuses the same thing twice in one sheet", () => {
    const { sheet, columns } = sheetOf("name,code\nGloves,111\nGloves again,111");
    const out = planIn(sheet, columns, NOTHING);
    expect(out[0]?.verdict).toBe("new");
    expect(out[1]?.verdict).toBe("refused");
    expect(out[1]?.why).toContain("twice");
  });

  /* ⚠️ A ROW NAMING NOTHING IS REFUSED. Imported it would be a product called ""
     that every later import matches. */
  it("refuses a row with no name and no code", () => {
    const { sheet, columns } = sheetOf("name,code,qty\n,,7");
    expect(planIn(sheet, columns, NOTHING)[0]?.verdict).toBe("refused");
  });

  /*
    ⚠️ A QUANTITY WITH NOWHERE TO PUT IT IS A REFUSAL, not a product created
    without its stock. Half an import is worse than none: the catalogue looks
    done and every number is missing.
  */
  it("refuses a quantity with no place", () => {
    const { sheet, columns } = sheetOf("name,qty\nGloves,40");
    const out = planIn(sheet, columns, NOTHING);
    expect(out[0]?.verdict).toBe("refused");
    expect(out[0]?.why).toContain("no place");
  });

  it("refuses a negative quantity", () => {
    const { sheet, columns } = sheetOf("name,qty,shelf\nGloves,-3,A1");
    expect(planIn(sheet, columns, NOTHING)[0]?.why).toContain("negative");
  });

  /*
    ⚠️ A REFUSED ROW IS NAMED WITH ITS LINE NUMBER, never dropped. An import that
    quietly skipped eleven of eight hundred is discovered months later by
    somebody looking for one of them, with no record of what happened.
  */
  it("names the line a refusal is on", () => {
    const { sheet, columns } = sheetOf("name,code\nA,1\n,\nC,3");
    const out = planIn(sheet, columns, NOTHING);
    /* ⚠️ Two, because the heading is line one — which is what somebody's
       spreadsheet shows them. */
    expect(out.map((p) => p.line)).toEqual([2, 3, 4]);
    expect(out[1]?.verdict).toBe("refused");
  });

  /* ⚠️ AND THE THREE COUNTS ARE WHAT A PERSON DECIDES ON. A total tells nobody
     whether pressing the button creates eight hundred products or edits them. */
  it("counts the three outcomes apart", () => {
    const { sheet, columns } = sheetOf("name,code\nA,1\nB,2\n,\nA again,1");
    const out = tallyIn(planIn(sheet, columns, { byName: {}, byCode: { "2": "p-b" } }));
    expect(out).toEqual({ new: 1, update: 1, refused: 2 });
  });

  /* ⚠️ AN ABSENT COLUMN IS AN ABSENT VALUE, not an empty string that overwrites
     what a product already has. */
  it("says nothing about a column the sheet does not have", () => {
    const { sheet, columns } = sheetOf("name\nGloves");
    const out = planIn(sheet, columns, NOTHING);
    expect(out[0]?.par).toBeNull();
    expect(out[0]?.quantity).toBeNull();
    expect(out[0]?.brand).toBe("");
  });
});
