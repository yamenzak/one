/**
 * A small, dependency-free QR encoder (byte mode, versions 1–10). Codes render
 * at ECC-M — capacity ~216 bytes — ample for any URL or wifi/vCard payload a
 * sign shows; longer payloads fail cleanly (the widget shows "shorten it"). It
 * builds the
 * module matrix per ISO/IEC 18004: Reed–Solomon ECC over GF(256), block
 * interleaving, the standard function patterns, all 8 data masks scored by the
 * spec's penalty rules, and BCH format info. Output is a boolean matrix or an
 * SVG string — pure, so the builder preview and the player draw the same code.
 */

import { type Style, type Config, str, num } from "./types.js";
import { radiusValue, borderCss, shadowValue } from "./render.js";

export type QrEcc = "L" | "M" | "Q" | "H";
const ECC_ORDER: QrEcc[] = ["M", "L", "H", "Q"]; // table index order per version

/* --------------------------- GF(256) arithmetic -------------------------- */

const EXP = new Uint8Array(256);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // primitive polynomial x^8+x^4+x^3+x^2+1
  }
  EXP[255] = EXP[0]!; // the cycle repeats: α^255 = α^0 = 1
})();
const gfMul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[(LOG[a]! + LOG[b]!) % 255]!);

/** Multiply two polynomials over GF(256) (big-endian: index 0 = highest degree). */
function polyMul(a: number[], b: number[]): number[] {
  const r = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] ^= gfMul(a[i]!, b[j]!);
  return r;
}

/** Reed–Solomon generator polynomial ∏(x − α^i) for i∈[0,degree), big-endian. */
function rsGenerator(degree: number): number[] {
  let g = [1];
  for (let i = 0; i < degree; i++) g = polyMul(g, [1, EXP[i]!]);
  return g; // length degree+1, g[0] === 1
}

/** The `eccLen` ECC codewords for one data block (polynomial-division remainder). */
function rsEncode(data: number[], eccLen: number): number[] {
  const gen = rsGenerator(eccLen);
  const out = [...data, ...new Array(eccLen).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = out[i]!;
    if (coef !== 0) for (let j = 1; j < gen.length; j++) out[i + j] ^= gfMul(gen[j]!, coef);
  }
  return out.slice(data.length);
}

/* --------------------------- version / ECC tables ------------------------ */

// Total codewords per version (1–10).
const TOTAL_CW = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
// RS blocks per (version, ecc) as flat [count,total,data,(count2,total2,data2)?].
// Order within a version is [M, L, H, Q] (matches ECC_ORDER).
const RS_BLOCKS: number[][][] = [
  [[1, 26, 16], [1, 26, 19], [1, 26, 9], [1, 26, 13]], // 1
  [[1, 44, 28], [1, 44, 34], [1, 44, 16], [1, 44, 22]], // 2
  [[1, 70, 44], [1, 70, 55], [2, 35, 13], [2, 35, 17]], // 3
  [[2, 50, 32], [1, 100, 80], [4, 25, 9], [2, 50, 24]], // 4
  [[2, 67, 43], [1, 134, 108], [2, 33, 11, 2, 34, 12], [2, 33, 15, 2, 34, 16]], // 5
  [[4, 43, 27], [2, 86, 68], [4, 43, 15], [4, 43, 19]], // 6
  [[4, 49, 31], [2, 98, 78], [4, 39, 13, 1, 40, 14], [2, 32, 14, 4, 33, 15]], // 7
  [[2, 60, 38, 2, 61, 39], [2, 121, 97], [4, 40, 14, 2, 41, 15], [4, 40, 18, 2, 41, 19]], // 8
  [[3, 58, 36, 2, 59, 37], [2, 146, 116], [4, 36, 12, 4, 37, 13], [4, 36, 16, 4, 37, 17]], // 9
  [[4, 69, 43, 1, 70, 44], [2, 86, 68, 2, 87, 69], [6, 43, 15, 2, 44, 16], [6, 43, 19, 2, 44, 20]], // 10
];
// Alignment-pattern centre coordinates per version.
const ALIGN: number[][] = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
// Data capacity (bytes) per (version, ecc): sum of dataPerBlock*count.
function dataCapacity(version: number, ecc: QrEcc): number {
  const row = RS_BLOCKS[version - 1]![ECC_ORDER.indexOf(ecc)]!;
  let cap = 0;
  for (let i = 0; i < row.length; i += 3) cap += row[i]! * row[i + 2]!;
  return cap;
}

/* ------------------------------- encoding -------------------------------- */

function utf8Bytes(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    let c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return out;
}

/** Choose the smallest version (1–10) that fits the payload at the ECC level. */
function pickVersion(byteLen: number, ecc: QrEcc): number {
  for (let v = 1; v <= 10; v++) {
    const countBits = v < 10 ? 8 : 16;
    const need = 4 + countBits + byteLen * 8;
    if (need <= dataCapacity(v, ecc) * 8) return v;
  }
  return 0; // too big for this compact encoder
}

/** Build the interleaved data+ECC codeword stream for the payload. */
function makeCodewords(bytes: number[], version: number, ecc: QrEcc): number[] {
  const countBits = version < 10 ? 8 : 16;
  const bits: number[] = [];
  const push = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(0b0100, 4); // byte mode
  push(bytes.length, countBits);
  for (const b of bytes) push(b, 8);
  const capBits = dataCapacity(version, ecc) * 8;
  for (let i = 0; i < 4 && bits.length < capBits; i++) bits.push(0); // terminator
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]!; data.push(b); }
  const pads = [0xec, 0x11];
  for (let i = 0; data.length < dataCapacity(version, ecc); i++) data.push(pads[i % 2]!);

  // Split into RS blocks, compute ECC, then interleave (data cols, then ecc cols).
  const row = RS_BLOCKS[version - 1]![ECC_ORDER.indexOf(ecc)]!;
  const dataBlocks: number[][] = [];
  const eccBlocks: number[][] = [];
  let pos = 0;
  for (let g = 0; g < row.length; g += 3) {
    const count = row[g]!, total = row[g + 1]!, dcount = row[g + 2]!;
    for (let b = 0; b < count; b++) {
      const block = data.slice(pos, pos + dcount); pos += dcount;
      dataBlocks.push(block);
      eccBlocks.push(rsEncode(block, total - dcount));
    }
  }
  const result: number[] = [];
  const maxData = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) for (const b of dataBlocks) if (i < b.length) result.push(b[i]!);
  const maxEcc = Math.max(...eccBlocks.map((b) => b.length));
  for (let i = 0; i < maxEcc; i++) for (const b of eccBlocks) if (i < b.length) result.push(b[i]!);
  return result;
}

/* ------------------------------ matrix build ----------------------------- */

function buildMatrix(codewords: number[], version: number, ecc: QrEcc): boolean[][] {
  const size = version * 4 + 17;
  const grid: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  // `func` marks every function module (finders, separators, timing, alignment,
  // dark module, format/version areas) — these are never masked or overwritten
  // by data, and format/version bits are stamped in after masking.
  const func: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (r: number, c: number, v: boolean) => { if (r >= 0 && r < size && c >= 0 && c < size) { grid[r]![c] = v; func[r]![c] = true; } };

  // Finder patterns + separators (the 1-module light border around each finder).
  const finder = (r0: number, c0: number) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const on = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      set(r0 + r, c0 + c, on);
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

  // Timing patterns.
  for (let i = 8; i < size - 8; i++) { const on = i % 2 === 0; set(6, i, on); set(i, 6, on); }

  // Alignment patterns (skip any overlapping a finder).
  const centres = ALIGN[version - 1]!;
  for (const ar of centres) for (const ac of centres) {
    if ((ar <= 7 && ac <= 7) || (ar <= 7 && ac >= size - 8) || (ar >= size - 8 && ac <= 7)) continue;
    for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) {
      set(ar + r, ac + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
    }
  }

  // Dark module + reserve format/version areas (values stamped after masking).
  set(size - 8, 8, true);
  for (let i = 0; i < 9; i++) { if (i !== 6) { func[8]![i] = true; func[i]![8] = true; } }
  for (let i = 0; i < 8; i++) { func[8]![size - 1 - i] = true; func[size - 1 - i]![8] = true; }
  if (version >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { func[i]![size - 11 + j] = true; func[size - 11 + j]![i] = true; }

  // Data placement: zig-zag column pairs from the right, reversing at each edge.
  const totalBits = codewords.length * 8;
  let bit = 0;
  const nextBit = (): boolean => { const v = bit < totalBits && ((codewords[bit >> 3]! >> (7 - (bit & 7))) & 1) === 1; bit++; return v; };
  let inc = -1, row = size - 1;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col = 5; // the vertical timing column is skipped
    for (;;) {
      for (let c = 0; c < 2; c++) { const cc = col - c; if (!func[row]![cc]) grid[row]![cc] = nextBit(); }
      row += inc;
      if (row < 0 || row >= size) { row -= inc; inc = -inc; break; }
    }
  }

  // Try all 8 masks; keep the lowest-penalty result (per the spec's scoring).
  let best: boolean[][] | null = null; let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = applyMask(grid, func, mask, size);
    placeFormat(m, ecc, mask, size);
    if (version >= 7) placeVersion(m, version, size);
    const pen = penalty(m, size);
    if (pen < bestPenalty) { bestPenalty = pen; best = m; }
  }
  return best!;
}

function maskFn(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
  }
}

function applyMask(grid: boolean[][], func: boolean[][], mask: number, size: number): boolean[][] {
  const out: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    out[r]![c] = func[r]![c] ? grid[r]![c]! : grid[r]![c] !== maskFn(mask, r, c);
  }
  return out;
}

const ECC_BITS: Record<QrEcc, number> = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };

function placeFormat(m: boolean[][], ecc: QrEcc, mask: number, size: number): void {
  const data = (ECC_BITS[ecc] << 3) | mask;
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0b10100110111 << (i - 10);
  const bits = ((data << 10) | rem) ^ 0b101010000010010;
  const get = (i: number) => ((bits >> i) & 1) === 1;
  // Vertical copy down column 8 (and up the bottom-left finder's right edge).
  for (let i = 0; i < 15; i++) {
    const v = get(i);
    if (i < 6) m[i]![8] = v;
    else if (i < 8) m[i + 1]![8] = v;
    else m[size - 15 + i]![8] = v;
  }
  // Horizontal copy along row 8.
  for (let i = 0; i < 15; i++) {
    const v = get(i);
    if (i < 8) m[8]![size - 1 - i] = v;
    else if (i < 9) m[8]![15 - i] = v;
    else m[8]![15 - i - 1] = v;
  }
}

function placeVersion(m: boolean[][], version: number, size: number): void {
  let rem = version << 12;
  for (let i = 17; i >= 12; i--) if ((rem >> i) & 1) rem ^= 0b1111100100101 << (i - 12);
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const on = ((bits >> i) & 1) === 1;
    const r = Math.floor(i / 3), c = i % 3;
    m[r]![size - 11 + c] = on;
    m[size - 11 + c]![r] = on;
  }
}

function penalty(m: boolean[][], size: number): number {
  let score = 0;
  // Rule 1: runs of 5+ same-colour modules in a row/column.
  for (let r = 0; r < size; r++) for (let dir = 0; dir < 2; dir++) {
    let run = 1;
    for (let c = 1; c < size; c++) {
      const a = dir ? m[c]![r]! : m[r]![c]!;
      const b = dir ? m[c - 1]![r]! : m[r]![c - 1]!;
      if (a === b) { run++; if (run === 5) score += 3; else if (run > 5) score += 1; } else run = 1;
    }
  }
  // Rule 2: 2×2 same-colour blocks.
  for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
    const v = m[r]![c]!;
    if (v === m[r]![c + 1] && v === m[r + 1]![c] && v === m[r + 1]![c + 1]) score += 3;
  }
  // Rule 3: finder-like 1:1:3:1:1 patterns.
  const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
  const pat2 = [false, false, false, false, true, false, true, true, true, false, true];
  for (let r = 0; r < size; r++) for (let c = 0; c <= size - 11; c++) {
    const rowMatch = (p: boolean[]) => p.every((v, k) => m[r]![c + k] === v);
    const colMatch = (p: boolean[]) => p.every((v, k) => m[c + k]![r] === v);
    if (rowMatch(pat1) || rowMatch(pat2)) score += 40;
    if (colMatch(pat1) || colMatch(pat2)) score += 40;
  }
  // Rule 4: overall dark/light balance.
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (m[r]![c]) dark++;
  const ratio = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(ratio - 50) / 5) * 10;
  return score;
}

/** The QR module matrix for a payload (true = dark). Empty when it won't fit. */
export function qrMatrix(text: string, ecc: QrEcc = "M"): boolean[][] {
  const bytes = utf8Bytes(text);
  const version = pickVersion(bytes.length, ecc);
  if (!version) return [];
  const cw = makeCodewords(bytes, version, ecc);
  return buildMatrix(cw, version, ecc);
}

/* --------------------------------- SVG ----------------------------------- */

/** Render a QR matrix to a crisp SVG string, with a quiet zone. */
export function qrSvg(text: string, opts: { dark: string; light: string; quiet?: number }): string {
  const m = qrMatrix(text, "M");
  if (!m.length) return "";
  const q = opts.quiet ?? 4;
  const n = m.length + q * 2;
  let path = "";
  for (let r = 0; r < m.length; r++) for (let c = 0; c < m.length; c++) if (m[r]![c]) path += `M${c + q} ${r + q}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n} ${n}" width="100%" height="100%" shape-rendering="crispEdges" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">`
    + `<rect width="${n}" height="${n}" fill="${opts.light}"/>`
    + `<path d="${path}" fill="${opts.dark}"/></svg>`;
}

/* ------------------------------- widget ---------------------------------- */

/** Container chrome for the QR widget. Bare by default — transparent, no padding,
 *  no radius — so the widget is just the code. It becomes a card only when the
 *  user sets a background / padding / radius / border / shadow. */
export function qrContainerCss(style: Style): Record<string, string | number> {
  const css: Record<string, string | number> = {
    width: "100%", height: "100%", boxSizing: "border-box",
    background: str(style.bg, "transparent"),
    borderRadius: radiusValue(style, 0),
    opacity: num(style.opacity, 1),
    overflow: "hidden",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    padding: `${Math.round(num(style.pad, 0))}%`,
  };
  Object.assign(css, borderCss(style));
  const shadow = shadowValue(style);
  if (shadow) css.boxShadow = shadow;
  return css;
}

/** Full inner HTML for a QR node — the code SVG plus an optional caption. */
export function qrBodyHtml(style: Style, config: Config, h: number): string {
  const text = str(config.text, str(config.url, "")).trim();
  const dark = str(style.color, "#0b0b0f");
  // The code's own "paper" (quiet zone) — kept light and independent of the
  // container background, so the container can be transparent (just the code)
  // while the code itself stays scannable.
  const light = str(style.paper, "#ffffff");
  const caption = escapeHtml(str(config.caption, "").trim());
  if (!text) {
    return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:oklch(0.5 0.02 300);font-family:'Hanken Grotesk',system-ui,sans-serif;font-size:${Math.max(12, Math.round(h * 0.1))}px">Add a link or text →</div>`;
  }
  const svg = qrSvg(text, { dark, light });
  if (!svg) {
    return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:oklch(0.6 0.2 25);font-family:'Hanken Grotesk',system-ui,sans-serif;font-size:${Math.max(12, Math.round(h * 0.08))}px;text-align:center;padding:0 8%">Text too long for a QR code — shorten it.</div>`;
  }
  const capFs = Math.max(10, Math.round(h * 0.07));
  const capHtml = caption
    ? `<div style="margin-top:${Math.round(h * 0.03)}px;color:${dark};font-family:'Hanken Grotesk',system-ui,sans-serif;font-weight:600;font-size:${capFs}px;text-align:center;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${caption}</div>`
    : "";
  return `<div style="max-width:100%;max-height:100%;display:flex;flex-direction:column;align-items:center;min-height:0"><div style="flex:1;min-height:0;aspect-ratio:1/1;display:flex">${svg}</div>${capHtml}</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"));
}
