/**
 * CARDS AND THE THINGS IN THEM — the two row shapes, and what a card does while
 * it has nothing to show.
 *
 * ⚠️ A FILL, NOT A BORDER, AND NO RULES BETWEEN THE ROWS. The card is told from
 * the page by its own surface; a hairline round it and hairlines through it are
 * three lines doing one job, and they make a group of related things read as a
 * table.
 *
 * ⚠️ TWO ROW SHAPES, AND THE DIFFERENCE IS WHERE THE CONTENT IS. An `Item` is a
 * place to go: a mark, a name, a line of metadata, a chevron — everything on one
 * line because the name is what is scanned. An `Entry` is a value: a quiet label
 * with the value UNDER it, because a value is content — an address, a full name, a
 * list — and the right-hand column that fits a chevron fits none of them.
 *
 * ⚠️ `null` IS NOT ANSWERED YET AND `[]` IS ANSWERED AND EMPTY. They are different
 * screens, and the second is the one a product ships without ever looking at — it
 * is what a new person sees first. `Waiting` holds the shape of what is coming so
 * the page does not jump under whoever had started reading it.
 */

import type { ReactNode } from "react";
import { Onward } from "./icon.js";

export const Card = ({ children, className }: {
  readonly children: ReactNode;
  readonly className?: string;
}): ReactNode => (
  /* ⚠️ THE ROWS STAGGER INSIDE THE CARD as well as the cards inside the page:
     six things arriving together is one event, six 66ms apart is a sequence. */
  <div className={`card stagger${className ? ` ${className}` : ""}`}>{children}</div>
);

export interface ItemProps {
  /** A symbol on its ground. Use `mark` instead when it is a face or a logo. */
  readonly icon?: ReactNode;
  readonly mark?: ReactNode;
  readonly title: string;
  readonly detail?: ReactNode;
  /** The one row on a card that is not like the others. */
  readonly tone?: "alarm";
  /**
   * ⚠️ A ROW EITHER GOES SOMEWHERE OR DOES SOMETHING, NEVER BOTH. With an action
   * on the right the row itself is not pressable: two targets on one line means
   * the finger that meant "remove" and landed a millimetre left opens a screen
   * instead — and there is no chevron, because there is nowhere onward.
   */
  readonly onGo?: () => void;
  readonly action?: ReactNode;
}

export function Item({ icon, mark, title, detail, tone, onGo, action }: ItemProps): ReactNode {
  const body = (
    <>
      {/* ⚠️ THE WELL IS THE ICON'S GROUND, and it is what makes a column of glyphs
          read as a list rather than as loose marks at different optical weights. */}
      {mark ?? (icon ? <span className="well" data-tone={tone}>{icon}</span> : null)}
      <span className="item-body">
        <span className="item-title">{title}</span>
        {detail ? <span className="item-detail">{detail}</span> : null}
      </span>
      {onGo ? <Onward className="chevron" /> : action}
    </>
  );
  return onGo
    ? <button type="button" className="item press-flat" onClick={onGo}>{body}</button>
    : <div className="item">{body}</div>;
}

export interface EntryProps {
  readonly label: string;
  readonly children: ReactNode;
  /** ⚠️ ABSENT MEANS THERE IS NOTHING TO PRESS, and the row says so by being a
   *  row rather than a button. A read-only fact drawn in the shape of an editable
   *  one is a control that does nothing, which is worse than no control at all. */
  readonly onEdit?: () => void;
  /** The affordance, when there is one. Its own icon so it can move as itself. */
  readonly affordance?: ReactNode;
}

export function Entry({ label, children, onEdit, affordance }: EntryProps): ReactNode {
  const body = (
    <>
      <span className="entry-label">{label}{onEdit ? affordance : null}</span>
      <span className="entry-value">{children}</span>
    </>
  );
  return onEdit
    ? <button type="button" className="entry press-flat" onClick={onEdit}>{body}</button>
    : <div className="entry" data-fixed="">{body}</div>;
}

/**
 * A face with a symbol over it — the workspace a thing belongs to, and what kind
 * of thing it is.
 *
 * ⚠️ THE FACE IS DIMMED SO THE SYMBOL CAN BE READ. A planet at full strength is
 * the most colourful thing on the row and the badge on it disappears; at
 * two-thirds it is still unmistakably which workspace, and the symbol is legible
 * on top. Identity first, then kind — which is the order somebody scanning a list
 * of sessions actually asks them in.
 */
export const Marked = ({ face, badge }: {
  readonly face: ReactNode;
  readonly badge: ReactNode;
}): ReactNode => (
  <span className="marked">
    {face}
    <span className="marked-badge" aria-hidden="true">{badge}</span>
  </span>
);

/** A value the person has not given yet. Quiet, and not an error. */
export const Unset = ({ children }: { readonly children: ReactNode }): ReactNode =>
  <span className="entry-unset">{children}</span>;

/** Only on a row that has one — a standing on every row is a column nobody reads. */
export const Pill = ({ children, urgent }: {
  readonly children: ReactNode;
  readonly urgent?: boolean;
}): ReactNode => <span className="pill" data-urgent={urgent ? "" : undefined}>{children}</span>;

/** The card while the answer is still coming. */
export const Waiting = ({ rows = 3 }: { readonly rows?: number }): ReactNode => (
  <div className="card" aria-busy="true">
    {Array.from({ length: rows }, (_, i) => (
      <div className="item" key={i}>
        <span className="well waiting" />
        <span className="item-body">
          <span className="waiting line" />
          <span className="waiting line short" />
        </span>
      </div>
    ))}
  </div>
);

/** The card once the answer is in and there is nothing in it. */
export const Blank = ({ title, children }: {
  readonly title: string;
  readonly children?: ReactNode;
}): ReactNode => (
  <div className="card blank">
    <p className="blank-title">{title}</p>
    {children ? <p className="lede">{children}</p> : null}
  </div>
);
