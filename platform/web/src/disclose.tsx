/**
 * A DISCLOSURE — a summary you can read without opening, and a body you open.
 *
 * ⚠️ THE SUMMARY HAS TO BE WORTH NOT OPENING. A list of disclosures whose rows
 * are only names is a list of doors: everything is one press further away and
 * nothing has been gained. The count on the right is what earns the shape — the
 * whole configuration is readable closed, and opening is for changing rather than
 * for finding out.
 *
 * ⚠️ IT IS `details`, NOT A DIV WITH STATE. The element already does the whole
 * job — open and closed, keyboard, and a control a screen reader announces as
 * expandable — and a hand-built one gets the last of those wrong every time. What
 * is added here is a marker that turns, and the animation for the body.
 *
 * ⚠️ AND THE OPEN ONE IS NOT A CARD INSIDE A CARD. The summary is the card's own
 * row; the body sits under it on the same ground, indented to the row's text so
 * the two read as one thing unfolding rather than as a panel appearing.
 */

import { useId, type ReactNode } from "react";
import { Onward } from "./icon.js";

export interface DiscloseProps {
  /** A face or a logo. The one thing this disclosure is about. */
  readonly mark?: ReactNode;
  readonly title: string;
  /** One line under the name, read closed. */
  readonly detail?: ReactNode;
  /**
   * ⚠️ THE STATE, IN A WORD OR TWO, ON THE RIGHT. "2 of 5 shared" is why somebody
   * does not have to open it; "5 things" is a count of rows, which they can see.
   */
  readonly said?: ReactNode;
  /** ⚠️ Open on FIRST render only. `details` owns the state after that. */
  readonly openAtFirst?: boolean;
  readonly children: ReactNode;
}

export function Disclose({ mark, title, detail, said, openAtFirst, children }: DiscloseProps): ReactNode {
  const id = useId();
  return (
    <details className="disclose" open={openAtFirst}>
      <summary className="disclose-head press-flat" aria-describedby={detail ? id : undefined}>
        {mark ? <span className="disclose-mark">{mark}</span> : null}
        <span className="disclose-said">
          <span className="disclose-name">{title}</span>
          {detail ? <span className="item-detail" id={id}>{detail}</span> : null}
        </span>
        {said ? <span className="disclose-state">{said}</span> : null}
        {/* ⚠️ THE SAME CHEVRON AS A ROW THAT GOES SOMEWHERE, TURNED. Onward is
            what the interface already means by "there is more this way", and a
            second glyph for the same idea is a second thing to learn. */}
        <Onward className="disclose-turn" />
      </summary>
      <div className="disclose-body">{children}</div>
    </details>
  );
}
