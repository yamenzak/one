/**
 * GS1 parsing — tested at the edges, because the edges are where it reads a real
 * box wrongly and says nothing.
 *
 * The failure mode this module has to be defended against is not "throws". It is
 * "returns a confident, wrong expiry date". Every test below is a shape of input
 * that a real scanner in a real stock room produces.
 */

import { describe, expect, it } from "vitest";
import { GS, isSerialised, isValidGtin, parseGs1, parseGs1Date } from "../src/index.js";

/** Fixed clock. Every century-window assertion below is relative to this. */
const NOW = new Date("2026-08-01T00:00:00Z");

describe("GTIN check digit", () => {
  it("accepts a valid GTIN-14", () => {
    // 0761234567890 + computed check digit 0. Do not hand-write these: an
    // invented check digit makes the test assert the implementation is broken.
    expect(isValidGtin("07612345678900")).toBe(true);
  });

  it("rejects one wrong digit", () => {
    // The reason this is checked at all: a smudged read still returns 14 digits,
    // and an unvalidated GTIN silently matches the WRONG product in the catalog.
    expect(isValidGtin("07612345678901")).toBe(false);
  });

  it("rejects a wrong length", () => {
    expect(isValidGtin("123")).toBe(false);
    expect(isValidGtin("076123456789001")).toBe(false);
  });

  it("handles the shorter GTIN forms", () => {
    // Weights alternate from the RIGHT, so a length-agnostic implementation is
    // required — a left-anchored one passes GTIN-14 and fails GTIN-13.
    expect(isValidGtin("4006381333931")).toBe(true); // GTIN-13
    expect(isValidGtin("4006381333932")).toBe(false);
  });
});

describe("YYMMDD dates", () => {
  it("reads an ordinary date", () => {
    expect(parseGs1Date("270131", NOW)).toEqual({ iso: "2027-01-31", endOfMonth: false });
  });

  it("treats day 00 as the last day of the month", () => {
    // A real GS1 convention. Rejecting it loses a valid label; reading it as the
    // 1st understates the expiry by nearly a month.
    expect(parseGs1Date("270100", NOW)).toEqual({ iso: "2027-01-31", endOfMonth: true });
  });

  it("gets February right in a leap year, via day 00", () => {
    expect(parseGs1Date("280200", NOW)).toEqual({ iso: "2028-02-29", endOfMonth: true });
  });

  it("rejects an impossible day rather than rolling it forward", () => {
    // `new Date(2027, 1, 31)` silently becomes 3 March. A parser that returns
    // that has invented an expiry a month late.
    expect(parseGs1Date("270231", NOW)).toBeNull();
  });

  it("rejects a nonsense month", () => {
    expect(parseGs1Date("271301", NOW)).toBeNull();
    expect(parseGs1Date("270001", NOW)).toBeNull();
  });

  it("rejects anything that is not six digits", () => {
    expect(parseGs1Date("2701", NOW)).toBeNull();
    expect(parseGs1Date("27013A", NOW)).toBeNull();
  });

  describe("the century window", () => {
    // Hard-coding 20YY works until it doesn't, and the failure is a date that
    // reads as perfectly valid. GS1 puts a two-digit year in roughly
    // [now-50, now+49].
    it("reads a near-future year as this century", () => {
      expect(parseGs1Date("300101", NOW)?.iso).toBe("2030-01-01");
    });

    it("reads a year far past the window as the PREVIOUS century", () => {
      // 2080 would be 54 years ahead of 2026 — outside the window, so 1980.
      expect(parseGs1Date("800101", NOW)?.iso).toBe("1980-01-01");
    });

    it("holds at the forward edge of the window", () => {
      // +49 stays; +51 wraps back. This is the assertion that would catch an
      // off-by-one in the pivot.
      expect(parseGs1Date("750101", NOW)?.iso).toBe("2075-01-01");
      expect(parseGs1Date("770101", NOW)?.iso).toBe("1977-01-01");
    });
  });
});

describe("element strings", () => {
  it("splits fixed-length AIs with no separator between them", () => {
    // The core difficulty: nothing delimits (01) from (17). Only the length
    // table cuts this correctly, and a wrong table reads a wrong expiry.
    const r = parseGs1("010761234567890017270131", NOW);
    expect(r.gtin).toBe("07612345678900");
    expect(r.expiry?.iso).toBe("2027-01-31");
    expect(r.unparsed).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("terminates a variable-length AI at the separator", () => {
    const r = parseGs1(`010761234567890010LOT-42${GS}17270131`, NOW);
    expect(r.lot).toBe("LOT-42");
    expect(r.expiry?.iso).toBe("2027-01-31");
  });

  it("runs a trailing variable-length AI to the end when the scanner omits FNC1", () => {
    // Plenty of scanners are configured not to transmit GS. Requiring it would
    // make the app appear broken on half the hardware in the building.
    const r = parseGs1("010761234567890017270131" + "10LOT-42", NOW);
    expect(r.lot).toBe("LOT-42");
    expect(r.expiry?.iso).toBe("2027-01-31");
  });

  it("strips a symbology identifier", () => {
    const r = parseGs1("]d2010761234567890017270131", NOW);
    expect(r.gtin).toBe("07612345678900");
  });

  it("reads a full UDI: product, expiry, lot and serial", () => {
    const r = parseGs1(`010761234567890017270131${GS}10LOT-42${GS}21SN00099`, NOW);
    expect(r).toMatchObject({ gtin: "07612345678900", lot: "LOT-42", serial: "SN00099" });
    expect(r.expiry?.iso).toBe("2027-01-31");
    // A serial means the barcode is describing ONE object — a unit, not a lot,
    // and therefore a different lifecycle entirely (TESSA.md §3.1).
    expect(isSerialised(r)).toBe(true);
  });

  it("does not call a lot-only scan serialised", () => {
    const r = parseGs1(`010761234567890010LOT-42`, NOW);
    expect(isSerialised(r)).toBe(false);
  });

  it("reports an unknown AI instead of guessing where its value ends", () => {
    // The single most important behaviour here. An unknown AI has an unknown
    // length, so continuing would mis-split everything after it — and the result
    // would look like a clean parse.
    const r = parseGs1("0107612345678900" + "99SOMETHING", NOW);
    expect(r.gtin).toBe("07612345678900");
    expect(r.unparsed).toEqual(["99SOMETHING"]);
  });

  it("reports a truncated fixed-length value rather than accepting a short date", () => {
    const r = parseGs1("01076123456789001727", NOW);
    expect(r.expiry).toBeUndefined();
    expect(r.warnings.join(" ")).toMatch(/cut short/);
  });

  it("warns on a bad check digit and withholds the GTIN", () => {
    // Withheld, not passed through with a flag: a caller that forgets to check
    // the flag would match the wrong product, so the value simply is not there.
    const r = parseGs1("010761234567890117270131", NOW);
    expect(r.gtin).toBeUndefined();
    expect(r.warnings.join(" ")).toMatch(/check digit/);
    // …and the rest of the scan still parses, because a human can confirm the
    // product by eye while the expiry is the part they cannot recompute.
    expect(r.expiry?.iso).toBe("2027-01-31");
  });

  it("warns on an unreadable date rather than silently omitting it", () => {
    // "No expiry on this label" and "an expiry we could not read" need different
    // things from the person holding the box.
    const r = parseGs1("010761234567890017271331", NOW);
    expect(r.expiry).toBeUndefined();
    expect(r.warnings.join(" ")).toMatch(/readable date/);
  });

  it.each(["", "   ", GS, "notabarcode"])("never throws on junk input: %j", (junk) => {
    expect(() => parseGs1(junk, NOW)).not.toThrow();
  });

  it("distinguishes AI 240 from AI 24 by preferring the longer match", () => {
    // Longest-match-first is required: a shortest-match parser reads "240" as
    // "24" and then mis-splits the remainder.
    const r = parseGs1(`0107612345678900240EXTRA-1`, NOW);
    expect(r.ais["240"]).toBe("EXTRA-1");
  });
});
