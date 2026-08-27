/**
 * WHAT A PRESS IS ABOUT TO DO, AS A ROW OF COUNTS.
 *
 * ⚠️ IT EXISTS BECAUSE A REVIEW OF THE ANSWERS IS NOT A REVIEW OF THE
 * CONSEQUENCES, and for one whole class of act they are nowhere near each other.
 * A flow that registers a product recaps four facts about a box, and reading
 * them back IS the check. A flow that applies a spreadsheet recaps "a
 * spreadsheet, today" — both true, neither of them the thing somebody has to
 * agree to, which is that four hundred and twelve rows are about to be created
 * and eleven refused.
 *
 * ⚠️ COUNTS RATHER THAN ROWS, AND THE CHOICE IS ABOUT WHAT GETS READ. Eight
 * hundred lines of what-would-happen is a screen of its own that nobody scrolls;
 * three numbers are weighed in a second. The detail is not lost — the write
 * answers with its refusals — but the DECISION is made against the shape, and
 * the shape is a handful of totals.
 *
 * ⚠️ THE ONE THAT IS NOT ZERO AND MEANS TROUBLE WEARS THE TONE. A refusal count
 * sitting in the same ink as an addition count is a number somebody reads past;
 * this is the only place in the row where colour is doing work, so nothing else
 * takes any. `data-ink` carries it, like every other reported state.
 *
 * ⚠️ AND NOT ONE OF THEM COUNTS UP. `Tally`'s own header draws the line: a hero
 * counts because somebody came to see it, and a row of six numbers ticking at
 * once is noise for the second it lasts. These are being read to make a
 * decision, which is the opposite of being watched.
 */

import * as React from "react";
import { TYPE } from "../tokens/type.js";
import { SPACE } from "../tokens/metrics.js";
import { Num } from "./said.js";

export interface Consequence {
  /** ⚠️ The word after the number — the app's, because the engine has no nouns. */
  readonly says: string;
  readonly count: number;
  /**
   * ⚠️ THE ONE THAT NEEDS LOOKING AT, AND AT MOST ONE OF THEM SHOULD SAY SO. A
   * row where every entry is marked is a row where none is.
   */
  readonly ink?: "warn";
}

export interface ConsequencesProps {
  readonly of: readonly Consequence[];
  /** ⚠️ One line over the row, where the numbers need saying what they are OF. */
  readonly says?: string;
}

/**
 * ⚠️ A ZERO IS DRAWN, NOT DROPPED, AND THAT IS THE WHOLE HONESTY OF THE THING.
 * "0 refused" is the sentence somebody is looking for; a row that hides its
 * empty counts says the same thing by absence, which is indistinguishable from
 * the report having failed to mention them.
 */
export function Consequences({ of, says }: ConsequencesProps) {
  if (!of.length) return null;
  return (
    <div className={`flex flex-col ${SPACE.tight}`}>
      {says ? <p className={TYPE.note}>{says}</p> : null}
      <div className={`flex flex-wrap ${SPACE.roomy}`}>
        {of.map((one) => (
          <div key={one.says} className={`flex flex-col ${SPACE.hair}`}>
            <span
              className={TYPE.figure}
              {...(one.ink && one.count > 0 ? { "data-ink": one.ink } : {})}
            >
              {/* ⚠️ THE WORKSPACE'S OWN CONVENTIONS, NEVER THIS FILE'S — D7.
                    `toLocaleString` here is a thousands separator chosen by
                    whichever browser is open, in a product where every other
                    figure is grouped the way the workspace asked for. */}
              <Num value={one.count} />
            </span>
            <span className={TYPE.note}>{one.says}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
