/**
 * THE OVERLAY LADDER — chosen by what somebody is DOING, not by what is in it.
 *
 * ⚠️ A SHEET AND A PANEL ARE ONE COMPONENT WITH TWO PLACEMENTS. Two components
 * is where "the mobile version looks different" comes from, and it never comes
 * back together once it has separated.
 *
 * ⚠️ ONLY A DIALOG BLOCKS. Everything else yields to Escape and to a gesture; a
 * dialog demands an answer because a decision is what it is for.
 */

import type { ReactNode } from "react";

export type OverlayKind = "sheet" | "dialog" | "menu" | "popover" | "drawer";

/** How deep an overlay may sit. ⚠️ Two, and the second must be a dialog. */
export const MAX_DEPTH = 2;

export interface OverlayProblem { readonly detail: string }

/**
 * ⚠️ A SHEET OPENED FROM A SHEET IS A SCREEN THAT SHOULD HAVE BEEN A ROUTE.
 * Refusing at the third layer is what stops an interface becoming a stack
 * somebody has to unwind backwards to find out where they were.
 */
export function stackProblem(open: readonly OverlayKind[]): OverlayProblem | null {
  /*
    The most specific answer first. Reported as "only a dialog may cover another
    overlay", two open drawers reads as a layering question when it is really a
    second navigation surface — which is a different mistake with a different fix.
  */
  if (open.filter((k) => k === "drawer").length > 1) return { detail: "two drawers are open — a drawer is navigation, and there is one of those" };
  if (open.length > MAX_DEPTH) return { detail: `${open.length} overlays are open; at most ${MAX_DEPTH} may be` };
  if (open.length === MAX_DEPTH && open[1] !== "dialog") {
    return { detail: `a ${open[1]} opened over a ${open[0]} — only a dialog may cover another overlay` };
  }
  return null;
}

export interface OverlayProps {
  readonly kind: OverlayKind;
  readonly title: string;
  readonly children?: ReactNode;
  /** ⚠️ A sheet's primary action is PINNED, so the thumb lands in one place. */
  readonly action?: ReactNode;
  readonly onDismiss?: () => void;
}

export function Overlay({ kind, title, children, action, onDismiss }: OverlayProps) {
  const blocking = kind === "dialog";
  return (
    <div
      data-one="overlay"
      data-kind={kind}
      role={blocking ? "alertdialog" : "dialog"}
      aria-modal={blocking ? true : undefined}
      aria-label={title}
    >
      {/* Pinned. Only the body scrolls, so the action never falls below the fold. */}
      <div data-one="overlay-header"><span data-one="overlay-title">{title}</span></div>
      <div data-one="overlay-body">{children}</div>
      {action ? <div data-one="overlay-footer">{action}</div> : null}
      {/*
        ⚠️ EVERYTHING BUT A DIALOG IS DISMISSIBLE BY GESTURE AND BY ESCAPE. A
        dialog is not, because a decision needs an answer — and an overlay that
        can be dismissed accidentally is one that loses the work in it.
      */}
      {!blocking && onDismiss ? <button type="button" data-one="overlay-dismiss" onClick={onDismiss}>Close</button> : null}
    </div>
  );
}

/**
 * ⚠️ A DESTRUCTIVE CONFIRM NAMES THE OBJECT. "Delete" is the last place a
 * mistake can be caught, and a generic verb catches nothing.
 */
export interface ConfirmProps {
  readonly verb: string;
  readonly object: string;
  /**
   * ⚠️ THE BUTTON'S OWN WORDS, WHEN THE OBJECT IS LONG. The question names the
   * thing in full because that is what makes a mistake catchable; the BUTTON
   * repeating it in full is a four-line pill, which is what the whole object
   * produced before this existed. Defaults to the object, so the short form is
   * something a caller opts into rather than something they must remember.
   */
  readonly short?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export const Confirm = ({ verb, object, short, onConfirm, onCancel }: ConfirmProps) => (
  <Overlay
    kind="dialog"
    title={`${verb} ${object}?`}
    action={
      <>
        <button type="button" data-one="confirm-cancel" onClick={onCancel}>Keep</button>
        {/* ⚠️ NEVER JUST THE VERB EITHER. "Cancel" beside "Keep" is a question
            about the dialog rather than about the booking, and it is the exact
            ambiguity a destructive confirm exists to remove. */}
        <button type="button" data-one="confirm-go" data-kind="destructive" onClick={onConfirm}>{`${verb} ${short ?? object}`}</button>
      </>
    }
  />
);
