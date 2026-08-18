/**
 * THE WORDMARK AND THE LOCKUP THAT HOLDS IT.
 *
 * ⚠️ THE MARK ITSELF IS `frame/arrival.tsx`'s, AND THERE IS ONLY ONE. Drawing a
 * second here would have been two logos with one name — which is how a crown and
 * a sign-in screen end up wearing different brands, both of them ours.
 *
 * ⚠️ THE LOCKUP IS ONE COMPONENT WITH A `stack`, NOT TWO. Both arrangements are
 * wanted — a row in a header, where vertical space is the scarce thing, and a
 * stack on a sign-in screen, where the mark has room to be the subject — and
 * building them separately is how the two drift in weight, spacing and fit until
 * they are visibly different logos.
 */

import { Mark, type MarkOf } from "../frame/arrival.js";
import { SPACE } from "../tokens/metrics.js";
import { TYPE } from "../tokens/type.js";

/* ----------------------------------------------------------------- lockup --- */

export interface LockupProps {
  readonly of?: MarkOf;
  /**
   * The name, split where the weight changes. `One` is light, the rest is
   * strong — so the shared half recedes and the product is what is read.
   */
  readonly name?: readonly [string, string];
  /**
   * ⚠️ `row` IS THE DEFAULT AND IT IS THE ONE THAT FITS ANYWHERE. A stack makes
   * the lockup roughly square, which is a shape that competes for the vertical
   * space a header has least of — so it is for the surfaces that have room and
   * where the logo is the subject rather than the furniture.
   */
  readonly stack?: boolean;
  /**
   * How tall the mark is, in the mark's own scale. The wordmark is sized from
   * it, so one prop moves the whole lockup.
   */
  readonly size?: "nav" | "row" | "crown" | "door";
}

/**
 * THE PLATFORM AND ITS PRODUCTS, WRITTEN THE SAME WAY.
 *
 * ⚠️ THE WEIGHT SPLIT IS THE WHOLE WORDMARK. `One` in light and `Space` in
 * strong says the two things a lockup has to say at a glance: which family this
 * belongs to, and which member it is. Setting both the same makes every product
 * name a slightly different long word.
 *
 * ⚠️ AND THE MARK SPANS THE FULL HEIGHT IN BOTH ARRANGEMENTS. Stacked, it is as
 * tall as both lines together — which is what makes the numeral read as a
 * numeral rather than as a bracket beside the first line.
 */
/** ⚠️ The wordmark tracks the mark's height, so the two never drift apart. */
const WORD: Readonly<Record<NonNullable<LockupProps["size"]>, string>> = {
  nav: "text-sm", row: "text-base", crown: "text-lg", door: "text-4xl",
};

export function Lockup({
  of = "one", name = ["One", "Space"], stack = false, size = "crown",
}: LockupProps) {
  const [family, member] = name;

  return (
    <span
      className={`inline-flex items-center ${stack ? SPACE.snug : SPACE.tight}`}
      /* ⚠️ ONE LABEL FOR THE WHOLE THING. The mark is hidden from the reader
         above, so this is the only announcement and it is the name. */
      role="img"
      aria-label={`${family}${member}`}
    >
      {/* ⚠️ Stacked, the mark steps UP a size so it spans both lines — which is
          what makes the numeral read as a numeral rather than as a bracket
          beside the first one. */}
      <Mark of={of} size={stack && size !== "door" ? "door" : size} />

      <span className={`flex ${WORD[size]} ${stack ? "flex-col leading-[0.9]" : "flex-row items-baseline"}`}>
        {/*
          ⚠️ `font-mark` AND TIGHT TRACKING, WHICH IS WHAT `TYPE.wordmark` ALREADY
          KNOWS — but its size is baked in and this lockup is sized by its
          caller, so the family and the fit are borrowed and the scale is not.
          A wordmark is a shape rather than a sentence, and running text's
          default spacing reads as loose at any size.
        */}
        <span className={`${TYPE.lockupFamily} opacity-60`}>{family}</span>
        <span className={TYPE.lockupMember}>{member}</span>
      </span>
    </span>
  );
}
