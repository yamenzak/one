/**
 * A CHIP — a thing with a face, named inside a sentence.
 *
 * ⚠️ IT IS FOR PROSE, WHICH IS THE WHOLE REASON IT EXISTS. A row already shows a
 * workspace's face beside its name; a SENTENCE about that workspace had only the
 * words — "Whoever is using Scena · Corniche Screens will be signed out" — and at
 * that point the reader has to match a name they read to a planet they saw on the
 * row behind the sheet. The chip is the same object appearing in both places, so
 * there is nothing to match.
 *
 * ⚠️ IT IS NOT A CONTROL AND MUST NOT LOOK LIKE ONE. No border, no press, a
 * ground barely told from the surface it sits on: what it is doing is carrying a
 * face into a line of text, and anything more makes a sentence look like a form.
 *
 * ⚠️ AND IT DOES NOT WRAP. A chip broken across two lines is a face on one line
 * and a name on the next, which is worse than the plain words it replaced.
 */

import type { ReactNode } from "react";

export interface ChipProps {
  /** A `Face`, sized by the chip rather than by the caller. */
  readonly face?: ReactNode;
  readonly children: ReactNode;
}

export const Chip = ({ face, children }: ChipProps): ReactNode => (
  <span className="chip">
    {face}
    <span className="chip-name">{children}</span>
  </span>
);
