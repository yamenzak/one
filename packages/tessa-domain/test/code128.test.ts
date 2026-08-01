/**
 * The barcode a centre prints for its own trays.
 *
 * One of these tests matters far more than the rest. Every mistake in an encoder
 * except the checksum produces a symbol no reader decodes — obvious the first
 * time somebody scans it. A wrong CHECKSUM produces a structurally valid symbol
 * that simply never reads, which at a glance is indistinguishable from a smudged
 * label, a dirty lens, or a bad angle. So it is pinned against a published
 * vector rather than against this implementation's own output.
 */

import { describe, expect, it } from "vitest";
import { CODE128_PATTERNS, code128Bars, encodeCode128B, isEncodable } from "../src/index.js";

describe("the pattern table", () => {
  // A lookup table is transcribed, not derived, so its SHAPE is the only thing
  // that can catch a paste error before a printer does.
  it("has 107 symbols", () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
  });

  it("is six elements per symbol, except the seven-element stop", () => {
    CODE128_PATTERNS.forEach((p, i) => {
      expect(p.length, `symbol ${i}`).toBe(i === 106 ? 7 : 6);
    });
  });

  it("uses only widths 1–4, and every symbol is 11 modules (13 for the stop)", () => {
    CODE128_PATTERNS.forEach((p, i) => {
      const widths = [...p].map(Number);
      expect(widths.every((w) => w >= 1 && w <= 4), `symbol ${i} widths`).toBe(true);
      expect(widths.reduce((a, b) => a + b, 0), `symbol ${i} modules`).toBe(i === 106 ? 13 : 11);
    });
  });
});

describe("encoding", () => {
  it("computes the published checksum for 'Wikipedia'", () => {
    /**
     * The external vector. Code 128 B, start value 104, each data value weighted
     * by its 1-BASED position:
     *
     *   104 + 1·55 + 2·73 + 3·75 + 4·73 + 5·80 + 6·69 + 7·68 + 8·73 + 9·65
     *     = 3281,  3281 mod 103 = 88
     *
     * Getting the weighting off by one — starting at 0, or including the start
     * code in the weighted sum — still produces a number, still produces a
     * barcode, and still fails to scan.
     */
    expect(encodeCode128B("Wikipedia").checksum).toBe(88);
  });

  it("lays out start + data + check + stop, in modules", () => {
    // 11 each for start, the 9 characters and the check, plus 13 for the stop.
    expect(encodeCode128B("Wikipedia").modules).toBe(11 + 9 * 11 + 11 + 13);
  });

  it("starts and ends with a bar", () => {
    // The pattern table always begins on a bar; a renderer that assumed
    // otherwise would invert the symbol into something unreadable.
    const { widths } = encodeCode128B("TRAY-1");
    expect(widths[0]).toBe(2); // start B = "211214" → first element is a bar
    expect(widths.length % 2).toBe(1); // stop's 7 elements leave an odd count
  });

  it("encodes the label codes this app actually prints", () => {
    for (const code of ["TRAY-0041", "INS-113", "L-9", "Bin A"]) {
      expect(() => encodeCode128B(code)).not.toThrow();
      expect(encodeCode128B(code).modules).toBeGreaterThan(0);
    }
  });

  it("REFUSES what it cannot encode rather than dropping it", () => {
    // A label that silently lost a character would scan cleanly and identify the
    // wrong tray — worse in every direction than a printer that refuses.
    expect(isEncodable("Tablett Ä")).toBe(false);
    expect(() => encodeCode128B("Tablett Ä")).toThrow();
    expect(isEncodable("")).toBe(false);
    expect(() => encodeCode128B("")).toThrow();
  });
});

describe("bars", () => {
  it("emits only the bars, positioned, with the same total width", () => {
    const { bars, modules } = code128Bars("TRAY-1");
    const { widths, modules: m2 } = encodeCode128B("TRAY-1");
    expect(modules).toBe(m2);
    expect(bars).toHaveLength(Math.ceil(widths.length / 2));
    // Every bar sits where the running width says it should.
    expect(bars[0]).toEqual({ x: 0, width: widths[0] });
    expect(bars[1]).toEqual({ x: widths[0]! + widths[1]!, width: widths[2] });
    // Nothing runs past the end.
    const last = bars.at(-1)!;
    expect(last.x + last.width).toBeLessThanOrEqual(modules);
  });
});
