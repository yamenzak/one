/**
 * CODE 128 B — the barcode a centre prints for its own things.
 *
 * A manufacturer's box arrives with a GS1 DataMatrix on it and `gs1.ts` reads
 * that. A tray a centre assembled this morning has no barcode until somebody
 * makes one, and until then its label code is TYPED — which undoes the entire
 * scan-first premise at exactly the point where the centre creates the object.
 *
 * ── Why Code 128 and not DataMatrix ─────────────────────────────────────────
 *
 * DataMatrix is what the incoming UDI carriers use, and encoding it means Reed–
 * Solomon error correction over a Galois field, a placement matrix, and a symbol
 * size table — several hundred lines that must be exactly right, verified
 * against a reader, to produce something a linear code already does here.
 *
 * These labels only ever carry OUR OWN identifier: `TRAY-0041`, `INS-113`. That
 * is short, ASCII, and read at arm's length off a tray in good light. Code 128 B
 * covers all of it, is a hundred lines, and — the part that matters — is in the
 * format list the app's scanner already accepts, so a label printed by this
 * function is read by the same camera that reads the manufacturer's box. If a
 * customer ever needs to emit a real UDI for a device they manufacture, that is
 * a different requirement and deserves a real DataMatrix encoder, not an
 * extension of this one.
 *
 * ── What this returns, and why not SVG ──────────────────────────────────────
 *
 * Alternating BAR/SPACE widths in modules, starting with a bar. Rendering is the
 * app's: a print sheet wants SVG, a label printer might want a bitmap, and a
 * test wants neither. Keeping the encoder pure is what lets the checksum — the
 * one part that is silently wrong rather than visibly wrong — be tested against
 * a published vector with no DOM in the way.
 *
 * Pure, total, no I/O.
 */

/**
 * The 107 symbol patterns, as six module widths each (bar, space, bar, space,
 * bar, space). Index is the Code 128 value; 106 is the stop pattern and is the
 * only seven-element one.
 *
 * Transcribed from the Code 128 specification. Not derivable — it is a lookup
 * table by nature, which is why `code128.test.ts` checks its shape (107 entries,
 * every width 1–4, every symbol 11 modules except the stop's 13) rather than
 * trusting that it was pasted correctly.
 */
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
] as const;

/** Code 128 B: printable ASCII, value = code point − 32. */
const START_B = 104;
const STOP = 106;

export const CODE128_PATTERNS = PATTERNS;

/** Can this string be encoded at all? Code 128 B covers ASCII 32–126. */
export function isEncodable(text: string): boolean {
  if (text.length === 0) return false;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 32 || c > 126) return false;
  }
  return true;
}

export interface Code128 {
  /** Alternating bar/space widths in modules, starting with a BAR. */
  widths: number[];
  /** Total width in modules — what a renderer scales against. */
  modules: number;
  /** The mod-103 check symbol. Exposed for testing; readers verify it. */
  checksum: number;
}

/**
 * Encode a string as Code 128 B.
 *
 * Throws on anything unencodable rather than substituting or dropping it. A
 * label that silently lost a character would scan cleanly and identify the wrong
 * tray, which is worse in every direction than a printer that refuses.
 *
 * ── The checksum is the part that fails silently ────────────────────────────
 *
 * Every other mistake here produces a barcode no reader will decode, which is
 * obvious the first time somebody scans it. A wrong checksum produces a symbol
 * that is *structurally* valid and simply never reads — indistinguishable, at a
 * glance, from a smudged label or a bad camera. It is weighted by POSITION
 * (1-based, over the data only, with the start code counted once un-weighted),
 * and `code128.test.ts` pins it against a published vector.
 */
export function encodeCode128B(text: string): Code128 {
  if (!isEncodable(text)) throw new Error(`Code 128 B cannot encode ${JSON.stringify(text)}`);

  const values = [...text].map((ch) => ch.codePointAt(0)! - 32);

  let sum = START_B;
  values.forEach((v, i) => {
    sum += (i + 1) * v;
  });
  const checksum = sum % 103;

  const symbols = [START_B, ...values, checksum, STOP];
  const widths: number[] = [];
  for (const s of symbols) {
    for (const d of PATTERNS[s]!) widths.push(Number(d));
  }

  return { widths, modules: widths.reduce((a, b) => a + b, 0), checksum };
}

/**
 * The same thing as rectangles a renderer can draw directly.
 *
 * Offered because every caller otherwise writes the same alternating-index loop,
 * and getting its parity wrong inverts the symbol — which produces a barcode
 * that looks entirely plausible and reads as nothing.
 */
export function code128Bars(text: string): { bars: { x: number; width: number }[]; modules: number } {
  const { widths, modules } = encodeCode128B(text);
  const bars: { x: number; width: number }[] = [];
  let x = 0;
  widths.forEach((w, i) => {
    // Even indices are bars, odd are spaces — the pattern table always starts
    // with a bar.
    if (i % 2 === 0) bars.push({ x, width: w });
    x += w;
  });
  return { bars, modules };
}
