import * as React from "react";
import { SPACE } from "../tokens/metrics.js";
import { TYPE } from "../tokens/type.js";

/**
 * A PRODUCT BARCODE, DRAWN — and the code's own kind, read off the digits.
 *
 * ⚠️ THIS EXISTS SO A SCREEN NEVER ASKS SOMEBODY WHAT KIND OF CODE THEY JUST
 * SCANNED. A camera hands back the symbology it decoded; a typed EAN-13 announces
 * itself in thirteen digits and a check digit that either works or does not. So
 * "what kind" is a question with an answer already in the room, and a form asking
 * it is a form asking somebody to re-type what the machine read.
 *
 * ⚠️ AND DRAWING IT IS NOT DECORATION. A code on a shelf label is a code somebody
 * checks against the box in their hand: the digits alone put that on the person,
 * and the bars are the thing the two objects actually have in common. The same
 * encoder serves the printed label, where it is the whole point.
 *
 * ⚠️ EAN AND UPC ONLY, AND THAT IS THE HONEST SCOPE. They are what is printed on
 * a retail product, they share one encoder, and their check digit is what makes
 * detection possible at all. Code-128 and Code-39 appear on inner cartons and
 * carry arbitrary text with no self-describing length — a renderer for them is a
 * different piece of work, and pretending with a plausible-looking picture of the
 * wrong symbology is worse than showing the digits.
 */

/* --------------------------------------------------------------- the kinds --- */

/**
 * ⚠️ OUR NAMES ARE THE DETECTOR'S NAMES. `BarcodeDetector` answers `ean_13`,
 * `upc_a`, `qr_code`; a second vocabulary here would be a mapping table that has
 * to be kept in step with a browser API, and the first thing to fall out of step
 * is the one nobody scans in development.
 */
export type CodeKind =
  | "ean_13" | "ean_8" | "upc_a" | "upc_e"
  | "qr_code" | "data_matrix"
  | "code_128" | "code_39" | "itf"
  | "other";

/** What a person is shown. The keys are the machine's; these are the reader's. */
export const SAYS_KIND: Readonly<Record<CodeKind, string>> = {
  ean_13: "EAN-13", ean_8: "EAN-8", upc_a: "UPC-A", upc_e: "UPC-E",
  qr_code: "QR", data_matrix: "Data Matrix",
  code_128: "Code 128", code_39: "Code 39", itf: "ITF",
  other: "Code",
};

/**
 * ⚠️ THE CHECK DIGIT IS WHAT MAKES A GUESS A READING. Thirteen digits is not an
 * EAN-13 — thirteen digits whose last one is the weighted sum of the other twelve
 * is. Without it, any thirteen-digit string a person typed would be labelled a
 * retail barcode and drawn as one, which is a picture that scans as something
 * else or as nothing.
 */
export const checksIn = (digits: string): boolean => {
  if (!/^\d+$/.test(digits) || digits.length < 8) return false;
  const of = [...digits].map(Number);
  const check = of.pop()!;
  /* ⚠️ WEIGHTED FROM THE RIGHT, which is what makes one routine serve EAN-13,
     EAN-8 and UPC-A at once: the alternation is anchored at the check digit's end
     rather than at the start, so a different length does not shift the weights. */
  const sum = of.reverse().reduce((all, n, i) => all + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
};

/**
 * WHAT KIND OF CODE THIS IS, FROM THE CODE.
 *
 * ⚠️ A LENGTH ALONE IS NOT AN ANSWER, so the check digit decides. Twelve digits
 * that check are a UPC-A; twelve that do not are a number somebody typed, and
 * calling it `other` is the truthful answer rather than the tidy one.
 */
export const kindOf = (code: string): CodeKind => {
  const said = code.trim();
  if (!/^\d+$/.test(said)) return "other";
  if (said.length === 13 && checksIn(said)) return "ean_13";
  if (said.length === 12 && checksIn(said)) return "upc_a";
  if (said.length === 8 && checksIn(said)) return "ean_8";
  return "other";
};

/* ------------------------------------------------------------- the encoder --- */

/**
 * ⚠️ THE THREE ALPHABETS EAN USES, AND THE PARITY TABLE THAT PICKS BETWEEN TWO OF
 * THEM. A thirteen-digit code carries twelve digits of bars: the FIRST digit is
 * not drawn at all — it is encoded in which of `L` and `G` each of the left six
 * uses. That is the part every naive implementation misses, and the symbol it
 * produces scans perfectly as the wrong number.
 */
const L = [
  "0001101", "0011001", "0010011", "0111101", "0100011",
  "0110001", "0101111", "0111011", "0110111", "0001011",
] as const;

const G = [
  "0100111", "0110011", "0011011", "0100001", "0011101",
  "0111001", "0000101", "0010001", "0001001", "0010111",
] as const;

/** ⚠️ The right half is `L` inverted — one table, not a third one to mistype. */
const R = L.map((bits) => [...bits].map((b) => (b === "0" ? "1" : "0")).join(""));

const PARITY = [
  "LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG",
  "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL",
] as const;

const EDGE = "101";
const MIDDLE = "01010";

/**
 * THE BAR PATTERN, AS ONES AND NOUGHTS.
 *
 * ⚠️ A UPC-A IS AN EAN-13 WITH A LEADING NOUGHT, which is not a convenience — it
 * is what the standard says, and it is why one encoder covers both. Drawing them
 * as different symbologies would produce two pictures of the same object.
 */
const modulesFor = (code: string): string | null => {
  const kind = kindOf(code);
  if (kind === "ean_8") {
    const of = [...code].map(Number);
    return EDGE
      + of.slice(0, 4).map((n) => L[n]!).join("")
      + MIDDLE
      + of.slice(4).map((n) => R[n]!).join("")
      + EDGE;
  }
  if (kind !== "ean_13" && kind !== "upc_a") return null;

  const full = kind === "upc_a" ? `0${code}` : code;
  const of = [...full].map(Number);
  const lead = of[0]!;
  const parity = PARITY[lead]!;
  const left = of.slice(1, 7)
    .map((n, i) => (parity[i] === "L" ? L[n]! : G[n]!))
    .join("");
  const right = of.slice(7).map((n) => R[n]!).join("");
  return EDGE + left + MIDDLE + right + EDGE;
};

export interface Bars {
  /** One `<path>` of the dark bars, in module units. */
  readonly path: string;
  /** How many modules wide, quiet zone included. */
  readonly span: number;
  /** How tall the drawing is, in the same units. */
  readonly tall: number;
  /** What it turned out to be — `other` where nothing could be drawn. */
  readonly kind: CodeKind;
}

/**
 * ⚠️ NINE MODULES OF QUIET ON EACH SIDE, WHICH IS THE STANDARD'S OWN NUMBER AND
 * THE COMMONEST REASON A TECHNICALLY PERFECT BARCODE DOES NOT SCAN. A symbol
 * drawn flush to its box has no margin for the scanner to bound it with, and the
 * failure is intermittent — it reads on a white page and not on a coloured row.
 */
const QUIET = 9;

/**
 * ⚠️ THE GUARD BARS RUN LONGER THAN THE DIGITS' BARS, and it is not styling: it
 * is how a reader finds the ends of the symbol. Drawn all one height the picture
 * still usually scans and stops looking like a barcode, which is the half a
 * person checks against the box in their hand.
 */
const TALL = 68;
const GUARD = 74;

/** Which module positions belong to a guard, for a 95- or 67-module symbol. */
const guards = (span: number): readonly (readonly [number, number])[] =>
  (span === 67
    ? [[0, 3], [32, 5], [64, 3]]
    : [[0, 3], [46, 5], [92, 3]]);

/**
 * A BARCODE AS A PATH, OR NOTHING.
 *
 * ⚠️ IT RETURNS `null` RATHER THAN DRAWING SOMETHING. A code this cannot encode
 * is a Code-128, a QR's payload or a number somebody made up, and every one of
 * those is better shown as its digits than as a picture of a different barcode.
 */
export function barsFor(code: string): Bars | null {
  const said = code.trim();
  const bits = modulesFor(said);
  if (!bits) return null;

  const inGuard = guards(bits.length);
  const parts: string[] = [];
  for (let at = 0; at < bits.length; at++) {
    if (bits[at] !== "1") continue;
    const long = inGuard.some(([from, wide]) => at >= from && at < from + wide);
    parts.push(`M${at + QUIET} 0h1v${long ? GUARD : TALL}h-1z`);
  }
  return {
    path: parts.join(""),
    span: bits.length + QUIET * 2,
    tall: GUARD,
    kind: kindOf(said),
  };
}

/* --------------------------------------------------------------- the mark --- */

export interface BarsProps {
  /** The digits. Anything this cannot encode draws nothing — see `barsFor`. */
  readonly of: string;
  /** Millimetres wide. The height follows the symbol's own proportion. */
  readonly mm?: number;
  /** ⚠️ On a screen rather than on paper — see below. */
  readonly onScreen?: boolean;
}

/**
 * A PRODUCT BARCODE, DRAWN.
 *
 * ⚠️ NOTHING WHERE IT CANNOT BE DRAWN, WHICH IS THE POINT OF THE `null`. A
 * Code-128 or a number somebody typed is better shown as its digits than as a
 * convincing picture of a different symbology — one scans as the wrong product
 * and the other scans as nothing, and both look right.
 *
 * ⚠️ AND IT IS INK ON WHITE ON PAPER AND CURRENT COLOUR ON A SCREEN. A label is
 * printed and must be black on white whatever the theme; the same symbol beside a
 * field is part of the interface and follows it, because a white card in a dark
 * form is a hole. `onScreen` is that difference, and it is the caller's because
 * only the caller knows which it is making.
 */
/**
 * ⚠️ THE HUMAN-READABLE LINE IS PART OF THE SYMBOL, NOT A CAPTION. GS1 specifies
 * it, every printed barcode in a shop has it, and the reason is the case the
 * whole component exists for: the scanner does not read, the light is bad, the
 * label is scuffed — and a person reads the digits out instead. A symbol without
 * them is a picture of a barcode.
 *
 * ⚠️ AND THE GROUPS ARE THE STANDARD'S, PER SYMBOLOGY. EAN-13 prints its first
 * digit outside the bars and then two sixes, because that first digit is not
 * drawn in the symbol at all — it is carried in the PARITY of the left six (see
 * the encoder). Grouping is not decoration here: it is what tells a reader which
 * digit belongs to which half.
 */
const GROUPS: Readonly<Record<string, readonly number[]>> = {
  ean_13: [1, 6, 6],
  upc_a: [1, 5, 5, 1],
  ean_8: [4, 4],
};

const spoken = (code: string, kind: string): string => {
  const cuts = GROUPS[kind];
  if (!cuts) return code;
  const out: string[] = [];
  let at = 0;
  for (const n of cuts) { out.push(code.slice(at, at + n)); at += n; }
  return out.filter(Boolean).join(" ");
};

export function Bars({ of, mm, onScreen }: BarsProps) {
  const drawn = React.useMemo(() => barsFor(of), [of]);
  if (!drawn) return null;
  return (
    /*
      ⚠️ THE SYMBOL AND ITS DIGITS ARE ONE OBJECT, CENTRED, AND SIZED BY THE
      SYMBOL. `inline-flex` with `w-fit` is what stops a 48mm barcode sitting at
      the left edge of a 358px card with the rest of the row empty — which is
      what it did, and it read as a picture somebody had dropped in rather than
      as the code for the thing the card is about.
    */
    <span className={`inline-flex w-fit flex-col items-center ${SPACE.hair}`}>
      <svg
        viewBox={`0 0 ${drawn.span} ${drawn.tall}`}
        {...(mm === undefined ? {} : { width: `${mm}mm` })}
        /* ⚠️ `crispEdges` FOR THE SAME REASON THE QR HAS IT. A bar is a rectangle of
           ink; anti-aliasing its edges produces greys a low-contrast scan reads as
           neither colour. */
        shapeRendering="crispEdges"
        /* ⚠️ `presentation`, BECAUSE THE DIGITS BELOW ARE NOW THE ACCESSIBLE
           NAME. Labelled here as well, a screen reader reads the number twice —
           once as an image and once as text — which is the double-announcement
           the media card's own `alt` note warns about one file over. */
        role="presentation"
        style={{ display: "block", width: mm === undefined ? "100%" : undefined, height: "auto" }}
      >
        {onScreen
          ? null
          /* ⚠️ THE QUIET ZONE IS PAINTED, NOT LEFT TRANSPARENT — see `Code`. */
          : <rect width={drawn.span} height={drawn.tall} fill="#fff" />}
        <path d={drawn.path} fill={onScreen ? "currentColor" : "#000"} />
      </svg>
      {/* ⚠️ ON PAPER IT IS BLACK LIKE THE BARS, for the reason the bars are: a
          label is printed and the theme is not a thing the paper has. On a
          screen it takes the interface's ink, and `TYPE.code` is the one role
          that tracks OPEN so the digits can be read one at a time. */}
      {/* ⚠️ `data-print`, NOT A STYLE — the rule is in `ambienceStylesheet` for
          the D7 reason every fill in this package is. A component that names a
          colour is a component nothing can re-theme, and `ground.test.mjs`
          refuses one. */}
      <span className={TYPE.printed} {...(onScreen ? {} : { "data-print": "true" })}>
        {spoken(of.trim(), drawn.kind)}
      </span>
    </span>
  );
}

