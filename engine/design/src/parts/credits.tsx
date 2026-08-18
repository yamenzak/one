/**
 * A CREDIT FIGURE, WEARING THE MARK THAT MAKES IT A CURRENCY.
 *
 * ⚠️ A BARE NUMBER IS NOT A BALANCE. "1,500" beside a heading is a count of
 * something, and every screen that shows one has to say what — so it either
 * repeats the word "credits" six times on one page or leaves the reader to
 * infer it. A currency mark is what a number wears instead: £, $, and this.
 *
 * ⚠️ THE MARK IS SET IN `em`, SO IT TRACKS WHATEVER IT SITS BESIDE. Pinned to a
 * pixel height it would be correct in exactly one of the places a credit figure
 * appears — a hero balance, a table cell, a chip, a sentence — and visibly wrong
 * in the rest.
 *
 * ⚠️ AND IT IS DRAWN, NOT A GLYPH. There is no code point for this, and a
 * substituted font would render it as a box on the machines least likely to have
 * anything installed.
 */

import { Mark } from "../frame/arrival.js";
import { GLYPH_GAP } from "../tokens/metrics.js";
import { TYPE } from "../tokens/type.js";
import { sayNumber, type Shown } from "@engine/kernel";
import { useShown } from "./said.js";

export interface CreditsProps {
  readonly value: number;
  /**
   * ⚠️ WHICH ROLE THE NUMBER PLAYS, not which size it is. `figure` is a balance
   * in a row; `display` is the one number a whole screen is about; `inline` is a
   * figure inside running text or a control, where it takes the size it is given.
   */
  readonly as?: "inline" | "figure" | "display";
  /**
   * ⚠️ A SIGN, FOR A MOVEMENT RATHER THAN A BALANCE. A statement line is `−400`
   * and `+1,000`; a balance is `1,500` and putting a plus on it would read as a
   * change nobody made.
   */
  readonly signed?: boolean;
  /** An accessible name for the mark. Absent, the number reads on its own. */
  readonly label?: string;
}

const ROLE: Readonly<Record<NonNullable<CreditsProps["as"]>, string>> = {
  inline: "tabular-nums",
  figure: TYPE.figure,
  display: TYPE.display,
};

/**
 * ⚠️ GROUPED, ALWAYS. Four digits without a separator is the difference between
 * reading a balance and counting one, and credit figures run to five.
 */
const grouped = (shown: Shown, n: number, signed: boolean): string => {
  /* ⚠️ THE READER'S SEPARATOR, NOT `"en-US"`. A German balance written
     `12,500` is twelve and a half, and the reader has no way to know which of
     the two the product meant. */
  const body = sayNumber(shown, Math.abs(n));
  if (n < 0) return `\u2212${body}`;
  return signed ? `+${body}` : body;
};

export function Credits({ value, as = "figure", signed = false, label }: CreditsProps) {
  const shown = useShown();
  return (
    <span className={`inline-flex items-center ${GLYPH_GAP} ${ROLE[as]}`}>
      {/*
        ⚠️ THE MARK IS SLIGHTLY SMALLER THAN THE TEXT AND SITS ON THE CENTRE, not
        the baseline. It is a tall narrow numeral: matched to the cap height it
        towers over the digits beside it, and baseline-aligned its overhanging
        bars fall below them. Every currency mark in every typeface is set this
        way for the same reason.
      */}
      <span className="inline-flex items-center text-[0.85em] opacity-70">
        <Mark of="wallet" size="inline" label={label} />
      </span>
      {grouped(shown, value, signed)}
    </span>
  );
}
