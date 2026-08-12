/**
 * CAPSULES — the two rounded things in this interface, and the rule that stops
 * there being a third.
 *
 * ⚠️ THERE WERE THREE AND THEY LOOKED IDENTICAL. A chip, a pill and a tag were
 * all a rounded rectangle with a grey ground and small text — so one row carried a
 * chip with a face beside a pill with a count, under a stack of tags, and none of
 * the three told a reader anything the others did not. That is what "chips
 * everywhere" is: not too many capsules, but no rule about what one MEANS.
 *
 * There are two, and they answer different questions:
 *
 *   CHIP   WHICH one. It carries a face into a sentence, so the thing being
 *          talked about appears as itself rather than as its name. It is never
 *          coloured, because the face is the identification and a colour on top
 *          would be a second one.
 *
 *   PILL   WHAT STATE this row is in. It takes its colour from the tone scale and
 *          from nowhere else, it appears only when the state is worth saying, and
 *          a row has at most one.
 *
 * ⚠️ AND THE TAG IS GONE. It was a data category rendered as a capsule — seventeen
 * possible values, three or four per row, in a colour chosen per row. A set of
 * things is a sentence or a count, and a reader who has to parse a stack of grey
 * lozenges to answer "is my health data in there" is doing the work the screen was
 * supposed to do.
 *
 * ⚠️ A PILL IS NOT A CONTROL AND MUST NOT LOOK LIKE ONE. No border, no press, no
 * shadow: it is a fact about the row, and anything more makes a list of facts look
 * like a row of buttons.
 */

import type { ReactNode } from "react";

/**
 * ⚠️ THE TONE SCALE, AND A PILL MAY TAKE NO OTHER COLOUR. `quiet` is the default
 * because most states are not urgent; a screen that reached for a hue directly is
 * how a column of capsules came to look arbitrary.
 */
export type PillTone = "quiet" | "warn" | "alarm" | "ok";

export interface PillProps {
  readonly children: ReactNode;
  readonly tone?: PillTone;
}

export const Pill = ({ children, tone = "quiet" }: PillProps): ReactNode =>
  <span className="pill" data-tone={tone}>{children}</span>;

export interface ChipProps {
  /** A `Mark`, sized by the chip rather than by the caller. */
  readonly face?: ReactNode;
  readonly children: ReactNode;
}

/**
 * ⚠️ IT DOES NOT WRAP. A chip broken across two lines is a face on one and a name
 * on the next, which is worse than the plain words it replaced.
 */
export const Chip = ({ face, children }: ChipProps): ReactNode => (
  <span className="chip">
    {face}
    <span className="chip-name">{children}</span>
  </span>
);
