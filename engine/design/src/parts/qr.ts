/**
 * A QR CODE, FROM NOTHING — ISO/IEC 18004, byte mode, error correction M.
 *
 * ⚠️ ONE SYMBOLOGY FOR EVERY LABEL WE PRINT, AND IT IS THIS ONE. A product
 * printing both QR and Code 128 has two encoders, two pattern tables and two
 * ways for a tag to come out unscannable — and the case Code 128 exists for
 * (a tag with no room) is answered here anyway: the smallest symbol is 21
 * modules square, which at a third of a millimetre a module is a seven
 * millimetre square. Reading everybody ELSE'S symbologies is a different job and
 * belongs to the camera, which already does it.
 *
 * ⚠️ AND IT IS HAND-WRITTEN RATHER THAN TAKEN, WHICH IS ONLY DEFENSIBLE BECAUSE
 * OF THE TEST. `qr.test.ts` DECODES what this produces — unmasks it, reads the
 * format bits back, de-interleaves the blocks, checks the Reed-Solomon syndromes
 * are zero and parses the payload — with no code shared with anything below. A
 * label that does not scan is a silent failure discovered by somebody standing
 * at a shelf with a broken workflow, so the encoder is only worth writing if
 * something independent reads it.
 *
 * ⚠️ LEVEL M IS THE CHOICE AND IT IS ABOUT DIRT. Fifteen per cent recovery is
 * what survives a thumbprint, a splash and the corner of a label lifting off a
 * cold drum; L is for screens and this is for a store room. Pure — no DOM, no
 * platform, so the same function draws a sheet and answers a test.
 */

/* ------------------------------------------------------------------ field --- */

/**
 * ⚠️ GF(256) WITH THE QR PRIMITIVE, 0x11D. The tables are built once at module
 * load rather than written down: a transcribed 256-entry log table is 256
 * chances to be wrong in a way that produces a symbol which is valid, scannable
 * and carries different bytes.
 */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
}

const mul = (a: number, b: number): number =>
  (a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!);

/** ⚠️ The generator for `n` check bytes: ∏ (x − α^i). Built, never transcribed. */
const generator = (n: number): Uint8Array => {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < n; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] = next[j]! ^ poly[j]!;
      next[j + 1] = next[j + 1]! ^ mul(poly[j]!, EXP[i]!);
    }
    poly = next;
  }
  return poly;
};

/**
 * ⚠️ THE REMAINDER OF THE MESSAGE DIVIDED BY THE GENERATOR, which is the whole
 * of Reed-Solomon encoding. `qr.test.ts` checks it the way a receiver would —
 * every syndrome of the finished codeword is zero — rather than against a
 * transcribed expected output, because the second only proves the transcription.
 */
export const checkBytes = (data: Uint8Array, n: number): Uint8Array => {
  const gen = generator(n);
  const out = new Uint8Array(n);
  for (const byte of data) {
    const factor = byte ^ out[0]!;
    out.copyWithin(0, 1);
    out[n - 1] = 0;
    for (let i = 0; i < n; i++) out[i] = out[i]! ^ mul(gen[i + 1]!, factor);
  }
  return out;
};

/* ---------------------------------------------------------------- versions --- */

/**
 * WHAT ONE VERSION HOLDS AT LEVEL M.
 *
 * ⚠️ `blocks` IS A LIST OF DATA-CODEWORD COUNTS, NOT A COUNT OF BLOCKS. Versions
 * 8, 9 and 10 split their data into blocks of two different sizes, and a table
 * that recorded "five blocks" would have to reconstruct which are the long ones
 * — a computation with an off-by-one that produces a symbol nothing can read.
 * Written out, the sum is checkable by eye and by the test.
 */
interface Version {
  readonly v: number;
  readonly total: number;
  /** Error-correction codewords per block. */
  readonly check: number;
  readonly blocks: readonly number[];
  readonly align: readonly number[];
}

export const VERSIONS: readonly Version[] = [
  { v: 1, total: 26, check: 10, blocks: [16], align: [] },
  { v: 2, total: 44, check: 16, blocks: [28], align: [6, 18] },
  { v: 3, total: 70, check: 26, blocks: [44], align: [6, 22] },
  { v: 4, total: 100, check: 18, blocks: [32, 32], align: [6, 26] },
  { v: 5, total: 134, check: 24, blocks: [43, 43], align: [6, 30] },
  { v: 6, total: 172, check: 16, blocks: [27, 27, 27, 27], align: [6, 34] },
  { v: 7, total: 196, check: 18, blocks: [31, 31, 31, 31], align: [6, 22, 38] },
  { v: 8, total: 242, check: 22, blocks: [38, 38, 39, 39], align: [6, 24, 42] },
  { v: 9, total: 292, check: 22, blocks: [36, 36, 36, 37, 37], align: [6, 26, 46] },
  { v: 10, total: 346, check: 26, blocks: [43, 43, 43, 43, 44], align: [6, 28, 50] },
];

export const sizeOf = (v: number): number => 17 + 4 * v;

/**
 * ⚠️ THE MODULES LEFT OVER AFTER THE CODEWORDS, AND THEY ARE NOT DECORATION. A
 * symbol short of its remainder bits is one whose last codeword lands in the
 * wrong place; the reader gets a length it believes and bytes it does not.
 */
const remainderBits = (v: number): number => (v >= 2 && v <= 6 ? 7 : 0);

/* ------------------------------------------------------------------- bits --- */

class Bits {
  readonly of: number[] = [];
  put(value: number, width: number): void {
    for (let i = width - 1; i >= 0; i--) this.of.push((value >>> i) & 1);
  }
}

/* -------------------------------------------------------------- the symbol --- */

export type Cell = 0 | 1;

/**
 * ⚠️ A THIRD STATE WHILE IT IS BEING BUILT, BECAUSE THE MASK MUST NOT TOUCH THE
 * FUNCTION PATTERNS. A finder or a timing line flipped by a mask is a symbol a
 * scanner cannot even find, and `null` is the only way to tell "light module of
 * the message" from "light module of the frame" once both are drawn.
 */
type Draft = (Cell | null)[][];

const blank = (size: number): Draft =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => null));

const finder = (grid: Draft, x: number, y: number): void => {
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) {
      const at = [y + dy, x + dx] as const;
      if (at[0] < 0 || at[1] < 0 || at[0] >= grid.length || at[1] >= grid.length) continue;
      const edge = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      /* ⚠️ THE SEPARATOR IS PART OF THE PATTERN, NOT A GAP LEFT BY LUCK. A
         finder touching a dark data module reads as a bigger square and the
         1:1:3:1:1 ratio a scanner looks for is gone. */
      grid[at[0]]![at[1]] = edge === 2 || edge > 3 ? 0 : 1;
    }
  }
};

const alignment = (grid: Draft, x: number, y: number): void => {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      grid[y + dy]![x + dx] = Math.max(Math.abs(dx), Math.abs(dy)) === 1 ? 0 : 1;
    }
  }
};

/**
 * ⚠️ EVERYTHING A MASK MAY NOT TOUCH, DRAWN BEFORE THE MESSAGE. The order is the
 * rule: finders and their separators, timing, alignment (never over a finder),
 * the dark module, and the format/version areas RESERVED so the walk skips them.
 */
const frame = (of: Version): Draft => {
  const size = sizeOf(of.v);
  const grid = blank(size);

  finder(grid, 0, 0);
  finder(grid, size - 7, 0);
  finder(grid, 0, size - 7);

  for (let i = 8; i < size - 8; i++) {
    const on: Cell = i % 2 === 0 ? 1 : 0;
    grid[6]![i] = on;
    grid[i]![6] = on;
  }

  for (const y of of.align) {
    for (const x of of.align) {
      /* ⚠️ NEVER OVER A FINDER. The three corners where a centre would land
         inside one are the whole reason this is a filtered product rather than
         a cross product. */
      const corner = (x === 6 && y === 6)
        || (x === 6 && y === size - 7) || (x === size - 7 && y === 6);
      if (!corner) alignment(grid, x, y);
    }
  }

  /* ⚠️ THE DARK MODULE. Always one, always here, and a symbol without it is
     refused by a conformant reader. */
  grid[size - 8]![8] = 1;

  /* ⚠️ RESERVED, NOT WRITTEN. The format bits are decided by the mask, which is
     chosen after the message is placed — so the walk has to know these are taken
     before their values exist. */
  for (let i = 0; i < 9; i++) {
    if (grid[8]![i] === null) grid[8]![i] = 0;
    if (grid[i]![8] === null) grid[i]![8] = 0;
  }
  for (let i = 0; i < 8; i++) {
    grid[8]![size - 1 - i] = 0;
    grid[size - 1 - i]![8] = 0;
  }
  if (of.v >= 7) {
    for (let i = 0; i < 18; i++) {
      grid[Math.floor(i / 3)]![size - 11 + (i % 3)] = 0;
      grid[size - 11 + (i % 3)]![Math.floor(i / 3)] = 0;
    }
  }
  return grid;
};

/* -------------------------------------------------------------- the format --- */

/**
 * ⚠️ BCH, COMPUTED, FOR THE REASON THE LOG TABLE IS. The fifteen format strings
 * and the thirty-six version strings are published constants and every one of
 * them is a chance to transcribe a digit — into a field a reader trusts
 * absolutely, because the format bits are what tell it which mask to undo.
 */
const bch = (value: number, poly: number, width: number): number => {
  let out = value << (width - 1);
  const top = 1 << (width - 1);
  for (let i = 32 - Math.clz32(out); i >= width; i--) {
    if (out & (1 << (i - 1))) out ^= poly << (i - width);
  }
  return (value << (width - 1)) | (out & (top - 1));
};

/** ⚠️ Level M is `00`. The mask is the low three bits. */
export const formatBits = (mask: number): number =>
  bch((0b00 << 3) | mask, 0b10100110111, 11) ^ 0b101010000010010;

export const versionBits = (v: number): number => bch(v, 0b1111100100, 13);

const writeFormat = (grid: Draft, mask: number): void => {
  const size = grid.length;
  const bits = formatBits(mask);
  const at = (i: number): Cell => ((bits >>> i) & 1) as Cell;

  for (let i = 0; i <= 5; i++) grid[8]![i] = at(i);
  grid[8]![7] = at(6);
  grid[8]![8] = at(7);
  grid[7]![8] = at(8);
  for (let i = 9; i <= 14; i++) grid[14 - i]![8] = at(i);

  for (let i = 0; i <= 7; i++) grid[size - 1 - i]![8] = at(i);
  for (let i = 8; i <= 14; i++) grid[8]![size - 15 + i] = at(i);
  grid[size - 8]![8] = 1;
};

const writeVersion = (grid: Draft, v: number): void => {
  if (v < 7) return;
  const size = grid.length;
  const bits = versionBits(v);
  for (let i = 0; i < 18; i++) {
    const on = ((bits >>> i) & 1) as Cell;
    grid[Math.floor(i / 3)]![size - 11 + (i % 3)] = on;
    grid[size - 11 + (i % 3)]![Math.floor(i / 3)] = on;
  }
};

/* ---------------------------------------------------------------- the mask --- */

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

/**
 * ⚠️ THE PENALTY IS WHY A MASK IS CHOSEN RATHER THAN PICKED. An unmasked symbol
 * can come out with a long white band or a run that imitates a finder, and a
 * scanner then either fails to lock on or locks on to the wrong corner — which
 * looks to a person exactly like a smudged label.
 */
const penalty = (grid: readonly Cell[][]): number => {
  const size = grid.length;
  let score = 0;

  const run = (read: (a: number, b: number) => Cell) => {
    for (let a = 0; a < size; a++) {
      let same = 1;
      for (let b = 1; b < size; b++) {
        if (read(a, b) === read(a, b - 1)) same++;
        else {
          if (same >= 5) score += 3 + (same - 5);
          same = 1;
        }
      }
      if (same >= 5) score += 3 + (same - 5);
    }
  };
  run((a, b) => grid[a]![b]!);
  run((a, b) => grid[b]![a]!);

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const of = grid[y]![x]!;
      if (grid[y]![x + 1] === of && grid[y + 1]![x] === of && grid[y + 1]![x + 1] === of) {
        score += 3;
      }
    }
  }

  /* ⚠️ THE FINDER-LIKE RUN, BOTH WAYS ROUND. `1011101` with four light modules
     on either side is the pattern a scanner uses to locate the symbol; one in
     the data is a decoy that costs a lock. */
  const LOOKS = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const decoy = (read: (a: number, b: number) => Cell) => {
    for (let a = 0; a < size; a++) {
      for (let b = 0; b <= size - 11; b++) {
        const ahead = LOOKS.every((want, i) => read(a, b + i) === want);
        const behind = LOOKS.every((want, i) => read(a, b + 10 - i) === want);
        if (ahead || behind) score += 40;
      }
    }
  };
  decoy((a, b) => grid[a]![b]!);
  decoy((a, b) => grid[b]![a]!);

  let dark = 0;
  for (const row of grid) for (const cell of row) dark += cell;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
};

/* ------------------------------------------------------------------- draw --- */

/**
 * ⚠️ THE WALK IS UP AND DOWN IN TWO-MODULE COLUMNS FROM THE BOTTOM RIGHT, AND IT
 * SKIPS COLUMN SIX. That column is the vertical timing line; a walk that counted
 * it puts every module after it one place out, which produces a symbol that is
 * perfectly well-formed and says something else.
 */
const place = (grid: Draft, bits: readonly number[]): void => {
  const size = grid.length;
  let at = 0;
  let up = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step++) {
      const y = up ? size - 1 - step : step;
      for (const x of [right, right - 1]) {
        if (grid[y]![x] !== null) continue;
        grid[y]![x] = ((bits[at] ?? 0) & 1) as Cell;
        at++;
      }
    }
    up = !up;
  }
};

/* ------------------------------------------------------------------ encode --- */

const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);

/**
 * ⚠️ THE SMALLEST VERSION THAT HOLDS IT, because a bigger symbol is a bigger
 * label and a label is a physical object somebody has to stick to a bottle.
 * Refused rather than truncated past version 10: a QR carrying most of a URL is
 * worse than no QR, since it scans.
 */
const versionFor = (bytes: number): Version => {
  for (const of of VERSIONS) {
    const data = of.blocks.reduce((n, b) => n + b, 0);
    const header = 4 + (of.v >= 10 ? 16 : 8);
    if (data * 8 >= header + bytes * 8) return of;
  }
  throw new Error(`qr: ${bytes} bytes is more than a version 10 symbol holds`);
};

/**
 * THE CODEWORDS, INTERLEAVED — data blocks first, then every block's check bytes.
 *
 * ⚠️ INTERLEAVING IS WHAT MAKES THE ERROR CORRECTION WORTH HAVING. A thumbprint
 * covers a patch of one symbol; written block after block, that patch is most of
 * one block and beyond its correcting power, and written round-robin it is a few
 * bytes of each. Getting the order wrong produces a symbol that scans perfectly
 * until it is dirty, which is the worst possible way to be wrong.
 */
export const codewordsFor = (text: string, of: Version): Uint8Array => {
  const bytes = bytesOf(text);
  const bits = new Bits();
  bits.put(0b0100, 4);
  bits.put(bytes.length, of.v >= 10 ? 16 : 8);
  for (const byte of bytes) bits.put(byte, 8);

  const capacity = of.blocks.reduce((n, b) => n + b, 0) * 8;
  bits.put(0, Math.min(4, capacity - bits.of.length));
  while (bits.of.length % 8 !== 0) bits.of.push(0);

  const data = new Uint8Array(capacity / 8);
  for (let i = 0; i < bits.of.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits.of[i + j]!;
    data[i / 8] = byte;
  }
  /* ⚠️ THE PAD BYTES ARE THE SPEC'S TWO, ALTERNATING. Zeroes would be valid
     bits and an unconventional symbol; readers are tested against these. */
  for (let i = bits.of.length / 8; i < data.length; i++) {
    data[i] = i % 2 === bits.of.length / 8 % 2 ? 0xec : 0x11;
  }

  const dataBlocks: Uint8Array[] = [];
  const checkBlocks: Uint8Array[] = [];
  let at = 0;
  for (const size of of.blocks) {
    const block = data.slice(at, at + size);
    at += size;
    dataBlocks.push(block);
    checkBlocks.push(checkBytes(block, of.check));
  }

  const out: number[] = [];
  const longest = Math.max(...of.blocks);
  for (let i = 0; i < longest; i++) {
    for (const block of dataBlocks) if (i < block.length) out.push(block[i]!);
  }
  for (let i = 0; i < of.check; i++) {
    for (const block of checkBlocks) out.push(block[i]!);
  }
  return new Uint8Array(out);
};

/**
 * THE FINISHED SYMBOL — 1 is a dark module.
 *
 * ⚠️ NO QUIET ZONE HERE. Four light modules on every side are required and are
 * the RENDERER's, because the margin belongs to the thing the symbol is drawn
 * on: an SVG adds it as padding, a label sheet may already have it, and a matrix
 * carrying its own would make every consumer subtract it back off.
 */
export function qrMatrix(text: string): readonly Cell[][] {
  const of = versionFor(bytesOf(text).length);
  const codewords = codewordsFor(text, of);

  const bits: number[] = [];
  for (const byte of codewords) {
    for (let i = 7; i >= 0; i--) bits.push((byte >>> i) & 1);
  }
  for (let i = 0; i < remainderBits(of.v); i++) bits.push(0);

  const drawn = frame(of);
  const reserved = drawn.map((row) => row.map((cell) => cell !== null));
  place(drawn, bits);
  writeVersion(drawn, of.v);

  /* ⚠️ EVERY MASK IS TRIED AND THE CHEAPEST WINS, which is the spec and is not
     an optimisation. A fixed mask is the one that produces an unreadable symbol
     for some payload nobody tested with. */
  let best: Cell[][] | null = null;
  let cheapest = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const grid = drawn.map((row) => row.map((cell) => (cell ?? 0) as Cell));
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid.length; x++) {
        if (!reserved[y]![x] && MASKS[mask]!(y, x)) grid[y]![x] = (grid[y]![x]! ^ 1) as Cell;
      }
    }
    writeFormat(grid as Draft, mask);
    const cost = penalty(grid);
    if (cost < cheapest) { cheapest = cost; best = grid; }
  }
  return best!;
}

/**
 * THE SYMBOL AS ONE SVG PATH, WITH ITS QUIET ZONE.
 *
 * ⚠️ ONE PATH RATHER THAN A RECT PER MODULE. A version 10 symbol is 3,249
 * modules; as elements that is a document a printer chews on and a browser
 * lays out. As a path it is one node, and the printed result is identical.
 *
 * ⚠️ AND THE VIEWBOX IS IN MODULES, so whatever draws it decides the physical
 * size in millimetres — which is the only unit a label has.
 */
export interface Drawn {
  readonly path: string;
  /** Modules across, quiet zone included. It is the viewBox. */
  readonly span: number;
}

export const QUIET_MODULES = 4;

export function qrPath(text: string): Drawn {
  const grid = qrMatrix(text);
  const parts: string[] = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid.length; x++) {
      if (grid[y]![x]) parts.push(`M${x + QUIET_MODULES} ${y + QUIET_MODULES}h1v1h-1z`);
    }
  }
  return { path: parts.join(""), span: grid.length + QUIET_MODULES * 2 };
}
