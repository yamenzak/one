/**
 * THE MARK — 4DL's, flat, and the same shape everywhere it appears.
 *
 * ⚠️ ONE GEOMETRY, TWO FORMS. `MARK` below is the source; this component renders
 * it and `assets/mark.svg` carries it for everything React cannot reach — a
 * favicon, an email, a marketing page, an app manifest. `test/brand.test.tsx`
 * fails if the two drift, because a logo that is subtly different in the email
 * from the one in the app is the kind of thing nobody reports and everybody
 * notices.
 *
 * ⚠️ IT IS FLAT, AND THAT WAS A CORRECTION. The version this came from carried
 * seven gradient definitions and a drop-shadow filter, of which the rendered
 * group referenced NONE — dead defs travelling with the mark into every
 * consumer. A gradient in a logo is also the reason a logo cannot be used: it
 * cannot be one colour on a dark ground and another on a light one, it cannot be
 * a favicon, it cannot be engraved, and it cannot be printed in one ink.
 *
 * ⚠️ IT DRAWS IN `currentColor`, WHICH IS THE WHOLE REASON IT WORKS ANYWHERE. No
 * colour of its own means it takes the ink of whatever it is placed in, so it is
 * correct on the sky, on a card, in a light theme and in a dark one without a
 * second copy existing.
 */

import type { ReactNode } from "react";

/**
 * The mark, as four shapes.
 *
 * ⚠️ THE VIEWBOX IS THE TIGHT BOUNDING BOX, strokes included. A logo with
 * built-in padding is a logo that cannot be aligned to anything: every consumer
 * then removes the padding by eye, and no two remove the same amount.
 */
export const MARK = {
  viewBox: "78 43 259 327",
  /** The rising stroke and the baseline — the angle the mark is built on. */
  rise: "M94.85 280.67 233.15 59.33",
  base: "M94 284h156",
  /** The four-point star that ends the baseline. */
  star: "M247 202c0 44 36 80 80 80-44 0-80 36-80 80 0-44-36-80-80-80 44 0 80-36 80-80Z",
  /** The degree, which is the half of the name that is not a number. */
  degree: { cx: 307, cy: 106, r: 24, width: 11 },
} as const;

export interface MarkProps {
  /** ⚠️ A LENGTH, not a class. The mark is placed, so its host states the size. */
  readonly size?: number | string;
  /** Given only when the mark stands alone. In a lockup the words name it. */
  readonly label?: string;
}

export function Mark({ size = "1em", label }: MarkProps): ReactNode {
  return (
    <svg
      className="brand-mark"
      viewBox={MARK.viewBox}
      height={size}
      fill="none"
      role={label ? "img" : "presentation"}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={MARK.rise} stroke="currentColor" strokeWidth="32" strokeLinecap="round" />
      <path d={MARK.base} stroke="currentColor" strokeWidth="32" strokeLinecap="round" />
      <path d={MARK.star} fill="currentColor" stroke="currentColor" strokeWidth="16" strokeLinejoin="round" />
      <circle cx={MARK.degree.cx} cy={MARK.degree.cy} r={MARK.degree.r} stroke="currentColor" strokeWidth={MARK.degree.width} />
    </svg>
  );
}

/**
 * The mark and a name, set as one thing.
 *
 * ⚠️ IT IS ONE OBJECT, WHICH IS A TYPOGRAPHIC CLAIM AND NOT A LAYOUT ONE. The
 * mark is drawn from the same geometry the brand face is built on, set at the
 * weight of that face, spaced by its own stem and sharing its ink — so the pair
 * reads as lettering rather than as a logo with a label after it. Break any one
 * of those and it becomes a badge with a caption.
 *
 * ⚠️ SIZED AGAINST THE CAP HEIGHT, NOT AGAINST THE FONT SIZE. An em is the whole
 * line box, of which the capitals occupy roughly seven tenths; a mark set at 1em
 * therefore stands about a third taller than the word beside it and reads as an
 * icon that was dropped in. This is that ratio, plus the little a mark is
 * allowed to overshoot by.
 */
export const Lockup = ({ word }: { readonly word: string }): ReactNode => (
  <span className="lockup" role="img" aria-label={`4DL ${word}`}>
    <Mark size="1.15em" />
    <span className="lockup-word">{word}</span>
  </span>
);
