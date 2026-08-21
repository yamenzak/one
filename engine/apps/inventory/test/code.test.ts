/**
 * THE RESOLUTION RULE, ASSERTED — this is the arithmetic the product rests on.
 *
 * ⚠️ EVERY ONE OF THESE IS A WRONG NUMBER RATHER THAN A CRASH. A century read
 * the naive way expires a lot fifty years out; a `00` day read as the first
 * expires a month of stock early; an un-padded GTIN makes one product into two;
 * a swallowed FNC1 makes a lot number with the next field on the end of it. All
 * four render perfectly, and all four are found only by somebody noticing that
 * a number is wrong weeks later.
 */

import { describe, expect, it } from "vitest";
import {
  asGtin, gs1Day, gtinOk, readScan, stillNeeded, unread, type Scanned,
} from "../src/code.js";

/** ⚠️ Fixed, because the century window is relative to it — see `centuryOf`. */
const YEAR = 2026;
/** ⚠️ FNC1, written as an escape. A raw separator in source is a character
    nothing renders, which is a byte nobody reviewing a diff can see. */
const GS = "\u001d";
const read = (raw: string) => readScan(raw, YEAR);
const got = (raw: string): Scanned => {
  const of = read(raw);
  if (unread(of)) throw new Error(`unread: ${of.why}`);
  return of;
};

/* ------------------------------------------------------------------ check --- */

describe("the check digit", () => {
  /* Real, published barcodes — a made-up number that happens to pass proves
     only that the function agrees with itself. */
  it("accepts codes that are actually on shelves", () => {
    expect(gtinOk("5000112637922")).toBe(true);   // EAN-13
    expect(gtinOk("036000291452")).toBe(true);    // UPC-A
    expect(gtinOk("96385074")).toBe(true);        // EAN-8
    expect(gtinOk("05000112637922")).toBe(true);  // the same EAN-13 as a GTIN-14
  });

  it("refuses one digit off", () => {
    expect(gtinOk("5000112637923")).toBe(false);
    expect(gtinOk("5000112637912")).toBe(false);
  });

  /* ⚠️ THE WEIGHTS ARE ASSIGNED FROM THE RIGHT, which is what lets one function
     serve four lengths. Padded and unpadded must agree or a DataMatrix and the
     box it is printed on disagree about the product. */
  it("is unchanged by padding", () => {
    expect(gtinOk("036000291452")).toBe(gtinOk("00036000291452"));
    expect(asGtin("5000112637922")).toBe("05000112637922");
    expect(asGtin("05000112637922")).toBe("05000112637922");
  });
});

/* ------------------------------------------------------------------- date --- */

describe("a six-digit date on a label", () => {
  it("reads an ordinary one", () => {
    expect(gs1Day("270331", YEAR)).toBe("2027-03-31");
  });

  /*
    ⚠️ `00` IS THE END OF THE MONTH, NOT THE FIRST OF IT. Read as the first, a
    whole month of stock expires early — silently, on the one field this product
    exists to get right.
  */
  it("reads a day of 00 as the last day of that month", () => {
    expect(gs1Day("270300", YEAR)).toBe("2027-03-31");
    expect(gs1Day("270200", YEAR)).toBe("2027-02-28");
    expect(gs1Day("280200", YEAR)).toBe("2028-02-29");
    expect(gs1Day("270400", YEAR)).toBe("2027-04-30");
  });

  /*
    ⚠️ THE CENTURY IS A WINDOW OF −49 TO +50, NOT `2000 + yy`. In 2026 a `77` is
    1977 and a `49` is 2049 — and the direction that matters is that a genuinely
    old lot must not read as current.
  */
  it("puts the year in GS1's window rather than in this century", () => {
    expect(gs1Day("490101", YEAR)).toBe("2049-01-01");
    expect(gs1Day("770101", YEAR)).toBe("1977-01-01");
    expect(gs1Day("760101", YEAR)).toBe("2076-01-01");
    /* And the window moves with the year rather than being pinned to one. */
    expect(gs1Day("770101", 2080)).toBe("2077-01-01");
  });

  it("refuses a date that is not one", () => {
    expect(gs1Day("271301", YEAR)).toBeNull();
    expect(gs1Day("270230", YEAR)).toBeNull();
    expect(gs1Day("2703", YEAR)).toBeNull();
  });
});

/* -------------------------------------------------------------------- gs1 --- */

describe("a GS1 DataMatrix", () => {

  /*
    ⚠️ THE COMPLETE CASE, AND IT IS THE PRODUCT'S BEST MOMENT: a box of vials
    arrives carrying its own lot and expiry, so receiving it is zero typing.
  */
  it("carries the product, the lot and the expiry at once", () => {
    const of = got(`010500011263792217270331${GS}10A5B7`);
    expect(of.kind).toBe("gs1");
    expect(of.value).toBe("05000112637922");
    expect(of.expiry).toBe("2027-03-31");
    expect(of.lot).toBe("A5B7");
  });

  /* ⚠️ MANY SCANNERS BRAND THEIR OUTPUT. Left on, the first three characters of
     every code in the workspace are the make of the scanner that read it. */
  it("drops the scanner's own symbology mark", () => {
    expect(got(`]d2010500011263792217270331`).value).toBe("05000112637922");
    expect(got(`]C1010500011263792217270331`).expiry).toBe("2027-03-31");
  });

  /* ⚠️ THE FIXED WIDTHS ARE WHAT MAKE A SEPARATOR OPTIONAL, and plenty of
     scanners swallow it. `(01)` is fourteen and `(17)` is six, always. */
  it("parses fixed-length fields with no separator between them", () => {
    const of = got("172703310105000112637922");
    expect(of.expiry).toBe("2027-03-31");
    expect(of.value).toBe("05000112637922");
  });

  it("reads a serial and a count where the label carries them", () => {
    const of = got(`010500011263792221SER-9${GS}3012`);
    expect(of.serial).toBe("SER-9");
    expect(of.count).toBe(12);
  });

  /*
    ⚠️ HALF A READ IS WORSE THAN NONE, because half a lot number still looks
    like a lot number — so it is what gets recorded, and nothing downstream can
    tell. A damaged label is refused rather than partially believed.
  */
  it("refuses a string that stops making sense half way through", () => {
    const of = read("0105000112637922179999");
    expect(unread(of) && of.why).toBe("gs1");
  });

  it("refuses a DataMatrix whose own product code fails its check digit", () => {
    const of = read("0105000112637923172703312");
    expect(unread(of) && of.why).toBe("gs1");
  });

  /*
    ⚠️ `240` IS AN AI AND `24` IS NOT, which is why the table is read as a
    prefix code. A fixed two-digit read takes `24` and leaves the `0` at the
    head of the value — a part number silently one character longer than the
    one printed on the box.
  */
  it("prefers the three-digit AI over the two-digit prefix of it", () => {
    const of = got(`0105000112637922${GS}240XYZ-1`);
    expect(of.value).toBe("05000112637922");
  });
});

/* ------------------------------------------------------------------- ours --- */

describe("our own labels", () => {
  /*
    ⚠️ THE PREFIX IS WHAT LETS THE CAMERA MOVE THE SESSION INSTEAD OF ADDING
    STOCK. Point at a shelf, scan, scan, scan, point at the next shelf — and
    deciding that from a lookup would put a round trip between the label and the
    behaviour, on a phone, in a basement.
  */
  it("say what they name in the code itself", () => {
    expect(got("ONE-L-4K2P").ours).toBe("location");
    expect(got("ONE-B-9WQX").ours).toBe("batch");
    expect(got("ONE-U-77AA").ours).toBe("unit");
    expect(got("ONE-P-ZZ01").ours).toBe("product");
  });

  it("are read whatever case they arrive in", () => {
    expect(got("one-l-4k2p").value).toBe("ONE-L-4K2P");
  });

  it("does not claim a code that merely starts with the same letters", () => {
    expect(got("ONETIME-4K2P").kind).toBe("other");
    expect(got("ONE-X-4K2P").kind).toBe("other");
  });
});

/* --------------------------------------------------------------- the rest --- */

describe("an ordinary barcode, and everything else", () => {
  it("normalises every numeric code to one key per product", () => {
    expect(got("5000112637922").value).toBe("05000112637922");
    expect(got("036000291452").value).toBe("00036000291452");
    expect(got("96385074").value).toBe("00000096385074");
  });

  /*
    ⚠️ REFUSED RATHER THAN LEARNED. An unknown code is attached to a product for
    ever, so a mis-scan accepted here binds a wrong number permanently — and the
    REAL barcode then resolves to nothing while the mis-scan resolves with
    confidence.
  */
  it("refuses a thirteen-digit code that failed its check digit", () => {
    const of = read("5000112637923");
    expect(unread(of) && of.why).toBe("check");
  });

  /*
    ⚠️ EIGHT DIGITS IS THE ONE AMBIGUOUS LENGTH — an EAN-8 and a German PZN are
    both eight digits with different check rules, so refusing the failures would
    make a whole country's pharmacy codes unscannable.
  */
  it("keeps an eight-digit code that is not an EAN-8", () => {
    const of = got("12345678");
    expect(of.kind).toBe("other");
    expect(of.value).toBe("12345678");
  });

  it("keeps a part number nobody can classify", () => {
    const of = got("SKU-4471/B");
    expect(of.kind).toBe("other");
    expect(of.value).toBe("SKU-4471/B");
  });

  it("refuses nothing at all", () => {
    expect(unread(read("   ")) && (read("   ") as { why: string }).why).toBe("empty");
  });

  /* ⚠️ The code as it was scanned survives, for the row being learned and for
     the audit — normalising is for MATCHING, and a person looking at a
     suspicious line wants the string that was actually read. */
  it("keeps what was actually scanned beside what it normalised to", () => {
    expect(got("5000112637922").raw).toBe("5000112637922");
    expect(got("]d20105000112637922").raw).toBe("]d20105000112637922");
  });
});

/* ------------------------------------------------------------- what to ask --- */

describe("what a scan still needs", () => {
  const plain: Scanned = { kind: "gtin", value: "05000112637922", raw: "x" };

  /*
    ⚠️ THIS IS THE WHOLE INTERFACE RULE. A screen that asked for a lot and an
    expiry every time would make the good label worthless; one that never asked
    would record a batch with no expiry.
  */
  it("asks for nothing when the product is not batched", () => {
    expect(stillNeeded("counted", plain)).toEqual([]);
    expect(stillNeeded("listed", plain)).toEqual([]);
  });

  it("asks for both when a batched product arrives on a plain barcode", () => {
    expect(stillNeeded("batched", plain)).toEqual(["lot", "expiry"]);
  });

  it("asks for nothing when the DataMatrix already carried both", () => {
    const rich = got(`010500011263792217270331${GS}10A5B7`);
    expect(stillNeeded("batched", rich)).toEqual([]);
  });

  it("asks only for what is missing", () => {
    const dated = got("010500011263792217270331");
    expect(stillNeeded("batched", dated)).toEqual(["lot"]);
  });
});
