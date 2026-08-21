/**
 * THE SYMBOL IS READ BACK, BY SOMETHING THAT SHARES NO CODE WITH THE ENCODER.
 *
 * ⚠️ A LABEL THAT DOES NOT SCAN IS A SILENT FAILURE, and it is discovered by
 * somebody standing at a shelf with a broken workflow rather than by a red test.
 * Nothing about a wrong symbol looks wrong: it is a square of black and white
 * squares, it has finders, it prints, and a phone simply does not see it. So a
 * hand-written encoder is only worth having if something independent can read
 * what it produced.
 *
 * ⚠️ THE DECODER BELOW IS WRITTEN AGAINST THE SPEC, NOT AGAINST THE ENCODER. It
 * finds the size, reads the format bits back out of the corner, undoes the mask,
 * walks the message columns, de-interleaves the blocks, and parses mode, length
 * and bytes. Every one of those is a place the encoder could be wrong, and each
 * would produce a symbol that is perfectly well-formed and says something else.
 *
 * ⚠️ AND REED-SOLOMON IS CHECKED THE WAY A RECEIVER CHECKS IT — every syndrome
 * of the finished codeword evaluates to zero — rather than against a transcribed
 * expected output, because comparing against a transcription only proves the
 * transcription.
 */

import { describe, expect, it } from "vitest";
import {
  QUIET_MODULES, VERSIONS, checkBytes, codewordsFor, formatBits, qrMatrix, qrPath, sizeOf,
  versionBits, type Cell,
} from "../src/parts/qr.js";

/* ------------------------------------------------------------ the decoder --- */

/** ⚠️ Its own field arithmetic, built here, so a fault in the encoder's tables
    cannot cancel out against a fault in the reader's. */
const gf = (() => {
  const exp: number[] = [];
  const log: number[] = new Array(256).fill(0);
  let x = 1;
  for (let i = 0; i < 255; i++) { exp.push(x); log[x] = i; x = (x << 1) ^ (x & 0x80 ? 0x11d : 0); }
  return {
    mul: (a: number, b: number) => (a && b ? exp[(log[a]! + log[b]!) % 255]! : 0),
    pow: (n: number) => exp[n % 255]!,
  };
})();

const MASKS: readonly ((i: number, j: number) => boolean)[] = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (_i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

/** ⚠️ WHICH MODULES ARE THE FRAME, worked out from the version's own geometry —
    the reader has to know this without being told, exactly as a scanner does. */
const frameOf = (v: number): boolean[][] => {
  const size = sizeOf(v);
  const taken = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const block = (x: number, y: number, w: number, h: number) => {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (y + dy >= 0 && x + dx >= 0 && y + dy < size && x + dx < size) {
          taken[y + dy]![x + dx] = true;
        }
      }
    }
  };
  block(0, 0, 9, 9);
  block(size - 8, 0, 8, 9);
  block(0, size - 8, 9, 8);
  for (let i = 0; i < size; i++) { taken[6]![i] = true; taken[i]![6] = true; }

  const centres = VERSIONS.find((one) => one.v === v)!.align;
  for (const y of centres) {
    for (const x of centres) {
      const corner = (x === 6 && y === 6)
        || (x === 6 && y === size - 7) || (x === size - 7 && y === 6);
      if (!corner) block(x - 2, y - 2, 5, 5);
    }
  }
  if (v >= 7) {
    block(size - 11, 0, 3, 6);
    block(0, size - 11, 6, 3);
  }
  return taken;
};

interface Read { readonly text: string; readonly mask: number; readonly version: number }

function decode(grid: readonly Cell[][]): Read {
  const size = grid.length;
  const version = (size - 17) / 4;
  const of = VERSIONS.find((one) => one.v === version)!;

  /* ⚠️ THE MASK COMES OUT OF THE FORMAT BITS, exactly as a scanner takes it —
     read from the copy beside the top-left finder, un-XORed, and matched against
     what the spec says each mask's string is. Guessing the mask by trying all
     eight would be the reader colluding with the writer. */
  let said = 0;
  for (let i = 0; i <= 5; i++) said |= grid[8]![i]! << i;
  said |= grid[8]![7]! << 6;
  said |= grid[8]![8]! << 7;
  said |= grid[7]![8]! << 8;
  for (let i = 9; i <= 14; i++) said |= grid[14 - i]![8]! << i;
  const mask = [0, 1, 2, 3, 4, 5, 6, 7].find((m) => formatBits(m) === said);
  if (mask === undefined) throw new Error(`no mask matches the format bits ${said.toString(2)}`);

  const taken = frameOf(version);
  const bits: number[] = [];
  let up = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step++) {
      const y = up ? size - 1 - step : step;
      for (const x of [right, right - 1]) {
        if (taken[y]![x]) continue;
        bits.push(grid[y]![x]! ^ (MASKS[mask]!(y, x) ? 1 : 0));
      }
    }
    up = !up;
  }

  const codewords: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j]!;
    codewords.push(byte);
  }
  expect(codewords.length).toBe(of.total);

  /* ⚠️ DE-INTERLEAVED BY THE BLOCK SHAPE, WHICH IS WHERE VERSIONS 8, 9 AND 10
     PUNISH A GUESS. Their blocks are two different lengths, and a reader that
     assumed one length recovers most of the message and the wrong tail. */
  const dataBlocks: number[][] = of.blocks.map(() => []);
  const longest = Math.max(...of.blocks);
  let at = 0;
  for (let i = 0; i < longest; i++) {
    for (let b = 0; b < of.blocks.length; b++) {
      if (i < of.blocks[b]!) dataBlocks[b]!.push(codewords[at++]!);
    }
  }
  const checkBlocks: number[][] = of.blocks.map(() => []);
  for (let i = 0; i < of.check; i++) {
    for (let b = 0; b < of.blocks.length; b++) checkBlocks[b]!.push(codewords[at++]!);
  }
  expect(at).toBe(of.total);

  /* ⚠️ EVERY BLOCK'S SYNDROMES ARE ZERO, which is what "no errors" MEANS in a
     Reed-Solomon code — evaluated here at α^0…α^(n−1) by a receiver's method
     rather than by re-running the encoder and comparing. */
  for (let b = 0; b < of.blocks.length; b++) {
    const whole = [...dataBlocks[b]!, ...checkBlocks[b]!];
    for (let s = 0; s < of.check; s++) {
      let sum = 0;
      for (const byte of whole) sum = gf.mul(sum, gf.pow(s)) ^ byte;
      expect(sum, `block ${b} syndrome ${s}`).toBe(0);
    }
  }

  const data = dataBlocks.flat();
  const stream: number[] = [];
  for (const byte of data) for (let i = 7; i >= 0; i--) stream.push((byte >>> i) & 1);
  const take = (n: number) => {
    let out = 0;
    for (let i = 0; i < n; i++) out = (out << 1) | stream.shift()!;
    return out;
  };

  expect(take(4), "mode indicator").toBe(0b0100);
  const length = take(version >= 10 ? 16 : 8);
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = take(8);
  return { text: new TextDecoder().decode(bytes), mask, version };
}

/* ---------------------------------------------------------------- the field --- */

describe("the error correction", () => {
  /*
    ⚠️ THE ONE PROPERTY THAT MATTERS AND IT IS CHECKABLE WITHOUT A FIXTURE: a
    codeword is a multiple of the generator, so every root of the generator is a
    root of the codeword. A transcribed "expected output" proves the
    transcription; this proves the arithmetic.
  */
  it("makes a codeword every syndrome reads as clean", () => {
    const data = new Uint8Array([0x40, 0xd2, 0x75, 0x47, 0x76, 0x17, 0x32, 0x06,
      0x27, 0x26, 0x96, 0xc6, 0xc6, 0x96, 0x70, 0xec]);
    const whole = [...data, ...checkBytes(data, 10)];
    for (let s = 0; s < 10; s++) {
      let sum = 0;
      for (const byte of whole) sum = gf.mul(sum, gf.pow(s)) ^ byte;
      expect(sum, `syndrome ${s}`).toBe(0);
    }
  });

  /* ⚠️ AND ONE FLIPPED BIT IS SEEN. A check that only ever looks at clean data
     would pass over an encoder that emitted zeroes. */
  it("sees a single flipped byte", () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const whole = [...data, ...checkBytes(data, 10)];
    whole[3] = whole[3]! ^ 0x20;
    let seen = 0;
    for (let s = 0; s < 10; s++) {
      let sum = 0;
      for (const byte of whole) sum = gf.mul(sum, gf.pow(s)) ^ byte;
      seen |= sum;
    }
    expect(seen).not.toBe(0);
  });
});

/* --------------------------------------------------------------- the table --- */

describe("what a version holds", () => {
  /*
    ⚠️ THE TABLE IS SELF-CONSISTENT OR THE SYMBOL IS THE WRONG SIZE. Data
    codewords plus check codewords per block must be the version's total, and a
    version whose sum is out by one produces a symbol a reader parses right up to
    the last codeword.
  */
  it("adds up, version by version", () => {
    for (const of of VERSIONS) {
      const data = of.blocks.reduce((n, b) => n + b, 0);
      expect(data + of.check * of.blocks.length, `version ${of.v}`).toBe(of.total);
    }
  });

  /* ⚠️ AND THE CODEWORDS FIT THE MODULES. Size, minus the frame, divided by
     eight, is the total — which is the arithmetic that catches a wrong
     alignment-pattern list as well as a wrong count. */
  it("names ten versions, each bigger than the last", () => {
    expect(VERSIONS.map((of) => of.v)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (let i = 1; i < VERSIONS.length; i++) {
      expect(VERSIONS[i]!.total).toBeGreaterThan(VERSIONS[i - 1]!.total);
    }
    expect(sizeOf(1)).toBe(21);
    expect(sizeOf(10)).toBe(57);
  });
});

/* --------------------------------------------------------------- the format --- */

describe("the fifteen bits a reader trusts absolutely", () => {
  /*
    ⚠️ THE ONE PLACE A PUBLISHED TABLE IS WORTH WRITING DOWN, and it is the
    reverse of the usual argument. Everything else here is checked by property
    because a transcription only proves the transcription — but the format
    strings are the OUTPUT of a BCH computation with no other check on it, so
    ISO/IEC 18004's own table is the independent authority. These are level M,
    masks 0 through 7, exactly as the standard prints them.

    ⚠️ AND GETTING THEM WRONG IS THE WORST FAILURE IN THE FILE. They are what
    tells a reader which mask to undo; a symbol whose format bits are off by one
    is unmasked with the wrong pattern and reads as noise, while everything about
    it — the finders, the timing, the size — looks perfect.
  */
  it("matches the standard's own table, level M", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((m) => formatBits(m).toString(2).padStart(15, "0")))
      .toEqual([
        "101010000010010", "101000100100101", "101111001111100", "101101101001011",
        "100010111111001", "100000011001110", "100111110010111", "100101010100000",
      ]);
  });

  /* ⚠️ AND THE VERSION BLOCK, WHICH ONLY VERSIONS 7 AND UP CARRY. A reader can
     work the version out by counting modules, so a wrong string here degrades
     rather than kills — which is exactly why nothing else would catch it. */
  it("matches the standard's version strings", () => {
    expect(versionBits(7).toString(2).padStart(18, "0")).toBe("000111101110111100");
    expect(versionBits(10).toString(2).padStart(18, "0")).toBe("001010101100001100");
  });
});

/* --------------------------------------------------------------- the symbol --- */

describe("a symbol read back", () => {
  /* ⚠️ THE ONE THE PRODUCT ACTUALLY PRINTS. A location tag, a decant label and
     an asset tag are all this shape, and this is version 1 — the smallest
     symbol, which is the whole reason the label format is short. */
  it("carries a label of ours", () => {
    const said = "ONE-L-7QP2XL9";
    const out = decode(qrMatrix(said));
    expect(out.text).toBe(said);
    expect(out.version).toBe(1);
  });

  /*
    ⚠️ EVERY VERSION IS EXERCISED, because each has its own block shape and its
    own alignment patterns — and versions 7 and up carry a version block as well,
    which moves the message. A test on one version proves one version.
  */
  it("carries a payload at every version it offers", () => {
    for (const of of VERSIONS) {
      const room = of.blocks.reduce((n, b) => n + b, 0) - (of.v >= 10 ? 3 : 2);
      /* ⚠️ FILLED TO THE BRIM, because the padding path and the terminator only
         run when there is slack — and a symbol that is exactly full is where a
         length written one bit wide too many lands in the next codeword. */
      const said = `v${of.v}:${"X".repeat(room - `v${of.v}:`.length)}`;
      const out = decode(qrMatrix(said));
      expect(out.text, `version ${of.v}`).toBe(said);
      expect(out.version, `version ${of.v}`).toBe(of.v);
    }
  });

  /*
    ⚠️ AND A SHORT PAYLOAD IS PADDED THE SPEC'S WAY. `0xEC 0x11` alternating is
    what readers are tested against; zeroes are valid bits and an unconventional
    symbol, which is the kind of thing that works on a phone and fails on a
    handheld scanner from 2014 that a warehouse actually owns.
  */
  it("pads with the two bytes the spec names", () => {
    const of = VERSIONS[0]!;
    const words = codewordsFor("A", of);
    expect([...words.slice(3, 7)]).toEqual([0xec, 0x11, 0xec, 0x11]);
  });

  /* ⚠️ UTF-8, BECAUSE A PRODUCT NAME IS NOT ASCII. "Sécurité", "Ürün",
     "المخزون" all go on labels, and byte mode carries whatever the encoder
     produced. */
  it("carries a name that is not English", () => {
    for (const said of ["Sécurité 5 L", "Ürün 250 ml", "معقم 500 مل", "手袋 M"]) {
      expect(decode(qrMatrix(said)).text, said).toBe(said);
    }
  });

  /* ⚠️ THE MASK IS CHOSEN, NOT FIXED — a symbol whose mask never varies is one
     that comes out with a long white band for some payload nobody tried. */
  it("chooses a mask rather than always using one", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) seen.add(decode(qrMatrix(`ONE-L-${i}${"Z".repeat(i % 7)}`)).mask);
    expect(seen.size).toBeGreaterThan(1);
  });
});

/* ---------------------------------------------------------------- the frame --- */

describe("what a scanner looks for first", () => {
  /*
    ⚠️ THREE FINDERS, EACH WITH ITS LIGHT SEPARATOR. A finder touching a dark
    data module reads as a bigger square and the 1:1:3:1:1 ratio a scanner hunts
    for is gone — the symbol is then not "hard to read", it is invisible.
  */
  it("puts a finder and its separator in three corners", () => {
    const grid = qrMatrix("ONE-L-7QP2XL9");
    const size = grid.length;
    const corners: readonly (readonly [number, number])[] = [[0, 0], [0, size - 7], [size - 7, 0]];
    for (const [y, x] of corners) {
      for (let dy = 0; dy < 7; dy++) {
        for (let dx = 0; dx < 7; dx++) {
          const edge = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
          expect(grid[y + dy]![x + dx], `${y + dy},${x + dx}`).toBe(edge === 2 ? 0 : 1);
        }
      }
    }
    /* ⚠️ AND THE SEPARATOR IS LIGHT ON BOTH INNER EDGES. */
    for (let i = 0; i < 8; i++) {
      expect(grid[7]![i]).toBe(0);
      expect(grid[i]![7]).toBe(0);
    }
  });

  /* ⚠️ THE TIMING LINES ARE WHAT THE READER COUNTS MODULES WITH, and they
     alternate from the finder's edge inwards, starting dark. */
  it("draws both timing lines, alternating", () => {
    const grid = qrMatrix("ONE-L-7QP2XL9");
    for (let i = 8; i < grid.length - 8; i++) {
      expect(grid[6]![i], `row ${i}`).toBe(i % 2 === 0 ? 1 : 0);
      expect(grid[i]![6], `col ${i}`).toBe(i % 2 === 0 ? 1 : 0);
    }
  });

  /* ⚠️ THE DARK MODULE. Always one, always here — a conformant reader refuses a
     symbol without it, and nothing else about the symbol looks wrong. */
  it("sets the dark module", () => {
    const grid = qrMatrix("ONE-L-7QP2XL9");
    expect(grid[grid.length - 8]![8]).toBe(1);
  });
});

/* ----------------------------------------------------------------- drawing --- */

describe("what gets drawn", () => {
  /*
    ⚠️ THE QUIET ZONE IS FOUR MODULES AND IT IS NOT OPTIONAL. A symbol printed
    flush against a border, a table rule or the edge of a label is one a scanner
    cannot bound — which is the commonest reason a technically perfect QR does
    not read.
  */
  it("leaves four modules of air on every side", () => {
    const out = qrPath("ONE-L-7QP2XL9");
    expect(out.span).toBe(21 + QUIET_MODULES * 2);
    /* ⚠️ NOTHING IS DRAWN INSIDE THE MARGIN — the first module starts at 4. */
    expect(out.path.startsWith("M4 4")).toBe(true);
    expect(out.path).not.toContain("M0 ");
  });

  /* ⚠️ ONE PATH, NOT A RECT PER MODULE. A version 10 symbol is 3,249 modules;
     as elements it is a document a printer chews on. */
  it("is a single path", () => {
    const out = qrPath("ONE-L-7QP2XL9");
    expect(out.path).toMatch(/^(M-?\d+ -?\d+h1v1h-1z)+$/);
  });

  /* ⚠️ AND A PAYLOAD BIGGER THAN THE BIGGEST SYMBOL IS REFUSED, never truncated.
     A QR carrying most of a URL is worse than no QR at all, because it scans. */
  it("refuses what it cannot hold rather than cutting it", () => {
    expect(() => qrMatrix("Z".repeat(300))).toThrow(/version 10/);
  });
});
