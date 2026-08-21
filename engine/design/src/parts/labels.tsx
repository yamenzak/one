/**
 * THINGS THAT GET PRINTED AND STUCK TO SOMETHING.
 *
 * ⚠️ A LABEL IS MEASURED IN MILLIMETRES AND NOTHING ELSE HERE IS. Every other
 * surface in this design system is measured in what a screen has — a scale, a
 * token, a gutter — because a screen has no fixed size. A label does: it is
 * 38 × 21 mm because that is the roll in the printer, and a design that thought
 * in rem would come out of the machine the wrong size on every browser whose
 * default font is not sixteen pixels.
 *
 * ⚠️ SO THIS IS THE ONE PLACE WITH ABSOLUTE UNITS, AND THEY ARE DECLARED PER
 * LABEL. `mm` prints as millimetres in every browser's print path; `px` and
 * `rem` are a conversion through a DPI somebody's driver chose.
 *
 * ⚠️ AND PRINTING IS A DIFFERENT DOCUMENT, NOT A STYLED SCREEN. `@media print`
 * takes the app's chrome, the ambience, the nav and the theme out and leaves the
 * sheet — because a page that prints its own navigation is the reason people
 * screenshot things instead.
 *
 * ⚠️ NOT THEMED, DELIBERATELY. A label is ink on white: the dark theme's ground
 * is a screen decision and a printer would either ignore it or waste a cartridge
 * on it, and a QR on a dark ground is one no scanner reads.
 */

import * as React from "react";
import { qrPath } from "./qr.js";

/* ------------------------------------------------------------------- code --- */

export interface CodeProps {
  /** What the symbol carries. Ours are short on purpose — see `qr.ts`. */
  readonly of: string;
  /** Millimetres, square, quiet zone included. */
  readonly mm: number;
  readonly title?: string;
}

/**
 * A QR CODE AT A PHYSICAL SIZE.
 *
 * ⚠️ THE SIZE IS AN INPUT BECAUSE IT IS A PHYSICAL FACT. A symbol printed too
 * small is one a scanner cannot resolve the modules of, and "too small" is a
 * question about millimetres and the camera — not about a layout. The floor
 * worth knowing: a version 1 symbol at 12 mm gives a module of about half a
 * millimetre, which every phone reads and most handheld scanners do.
 *
 * ⚠️ AND `shape-rendering: crispEdges`. A module is a square of ink; anti-
 * aliasing it produces grey edges that a low-contrast scan reads as neither
 * colour, which is the difference between a label that reads first time and one
 * somebody waves about.
 */
export function Code({ of, mm, title }: CodeProps) {
  const drawn = React.useMemo(() => qrPath(of), [of]);
  return (
    <svg
      viewBox={`0 0 ${drawn.span} ${drawn.span}`}
      width={`${mm}mm`}
      height={`${mm}mm`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={title ?? of}
      style={{ display: "block" }}
    >
      {/* ⚠️ THE QUIET ZONE IS DRAWN WHITE RATHER THAN LEFT TRANSPARENT. A symbol
          on a coloured label, a photograph or a shaded row is one a scanner
          cannot bound — and the margin is the commonest reason a technically
          perfect QR does not read. */}
      <rect width={drawn.span} height={drawn.span} fill="#fff" />
      <path d={drawn.path} fill="#000" />
    </svg>
  );
}

/* ------------------------------------------------------------------ sheet --- */

/**
 * ⚠️ THE PRINT RULES, WRITTEN ONCE. Every app printing anything wants the same
 * four: no chrome, no ambience, white ground, and a label that is never split
 * across a page. Left to each screen they are written four ways and one of them
 * forgets `break-inside`, which halves a barcode.
 */
const PRINT = `
@media print {
  @page { margin: 8mm; }
  html, body { background: #fff !important; }
  body > *:not([data-print]) { display: none !important; }
  /* ⚠️ THE PAPER GROUND GOES WHITE. On screen the sheet is grey so the white
     labels have an edge without one being drawn; a printer would put that grey
     on the page, which is a cartridge spent on a screen affordance. */
  [data-print] { display: block !important; position: static !important;
    background: #fff !important; padding: 0 !important; }
  [data-label] { break-inside: avoid; page-break-inside: avoid; }
  [data-print-hide] { display: none !important; }
}
`;

export interface LabelSheetProps {
  /** Millimetres between labels, and it is the gap a cutter needs. */
  readonly gap?: number;
  readonly children: React.ReactNode;
}

/**
 * ⚠️ THE PAPER, AND IT IS WHY NO LABEL DRAWS A BORDER. A white label on a white
 * sheet has no edge, and an outline round each one is a line of ink that does
 * not line up with the die-cut — so the SHEET is grey on screen and the gap
 * between labels shows it through, which is the same rule every stacked surface
 * in this system follows (D7). It prints white.
 */
const PAPER = "#e8e8e8";

/**
 * THE PAGE OF LABELS.
 *
 * ⚠️ IT IS A `data-print` ISLAND, WHICH IS WHAT MAKES THE REST OF THE APP
 * DISAPPEAR. The alternative — hiding the chrome piece by piece — is a list
 * somebody has to add to every time a new banner is built, and the failure is a
 * nav bar printed across the top of forty labels somebody has already stuck to
 * bottles.
 *
 * ⚠️ AND IT WRAPS, so a sheet of eight and a sheet of eighty are the same
 * component. What a printer does with the second is a page break, and
 * `break-inside: avoid` on each label is what stops one landing half on each.
 */
export function LabelSheet({ gap = 3, children }: LabelSheetProps) {
  return (
    <div
      data-print
      style={{
        display: "flex", flexWrap: "wrap", gap: `${gap}mm`,
        background: PAPER, color: "#000", padding: `${gap}mm`,
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: PRINT }} />
      {children}
    </div>
  );
}

export interface LabelProps {
  /** Millimetres. The roll in the printer decides these, not a layout. */
  readonly width: number;
  readonly height: number;
  readonly children: React.ReactNode;
}

/**
 * ONE LABEL.
 *
 * ⚠️ NO BORDER, AND THE SHEET IS WHY. Somebody arranging labels needs to see
 * where each one ends, and a drawn edge is both a line of ink that misses the
 * die-cut and the thing D7 forbids — so the paper behind is grey and the gap
 * shows it through. The label itself is white on all four sides.
 *
 * ⚠️ AND IT DOES NOT SCROLL OR SHRINK. `overflow: hidden` is the honest
 * behaviour for a physical object: a name too long for a 38 mm label is cut off
 * on the label too, and a layout that quietly reflowed would show something on
 * screen that the printer cannot produce.
 */
export function Label({ width, height, children }: LabelProps) {
  return (
    <div
      data-label
      style={{
        width: `${width}mm`, height: `${height}mm`,
        boxSizing: "border-box", overflow: "hidden",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        padding: "1.5mm", background: "#fff", color: "#000",
        fontFamily: "system-ui, sans-serif", lineHeight: 1.15,
      }}
    >
      {children}
    </div>
  );
}

/**
 * ⚠️ A LINE OF LABEL TEXT, SIZED IN MILLIMETRES LIKE EVERYTHING ELSE HERE. A
 * product name at 3 mm cap height is readable at arm's length under a store-room
 * light; the same line in `rem` is whatever the browser's default font happens
 * to be, scaled by whatever the print dialogue is set to.
 *
 * ⚠️ AND `clamp` RATHER THAN ELLIPSIS ON A NAME. A label that ends in "…" has
 * spent a character telling somebody it ran out of room; two lines of a long
 * name tells them what the thing is.
 */
export function LabelText({ mm, bold, lines = 1, children }: {
  readonly mm: number;
  readonly bold?: boolean;
  readonly lines?: number;
  readonly children: React.ReactNode;
}) {
  return (
    <span
      style={{
        fontSize: `${mm}mm`,
        fontWeight: bold ? 700 : 400,
        display: "-webkit-box",
        WebkitLineClamp: lines,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }}
    >
      {children}
    </span>
  );
}
