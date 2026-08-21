/**
 * WHAT A CONTROL SAYS WHEN THE GATE WOULD REFUSE IT — before it is pressed.
 *
 * ⚠️ A REFUSAL THAT ARRIVES AFTER THE PRESS ARRIVES OVER A FORM SOMEBODY HAS
 * ALREADY FILLED IN. The gate's verdict is knowable from the moment the page
 * loads (`blockedBy`, carried on `centre.view` as `may`), so a product that
 * draws the control anyway is one that lets somebody do the work and then takes
 * it away — which is worse than not offering it, because the work is gone.
 *
 * ⚠️ THE GATE, NOT A BOOLEAN, AND THE DIFFERENCE IS THE CONTROL. "You cannot
 * yet" is a disabled button with a reason; "your plan does not include this" is
 * an OFFER, and the way out is a screen this workspace can reach today. Handed
 * `false` a screen can only draw the first, and every paywall in the product
 * then reads as a bug.
 *
 * ⚠️ AND THE WORDS ARE HERE RATHER THAN AT THE CALL SITE. Nine gates × every
 * control in every product is a sentence somebody writes again each time, and
 * the fourth one to be written is the one that says something different about
 * the same refusal. The PROBLEM catalogue is the server's copy for the same
 * situations; this is the shorter form a control wears.
 */

import * as React from "react";
import type { Gate } from "@engine/kernel";

/** What a blocked control says, and whether there is anywhere to send somebody. */
export interface Stopped {
  /** ⚠️ A fragment, not a sentence — it sits under a control. */
  readonly why: string;
  /**
   * ⚠️ WHERE THE WAY OUT IS, OR NOTHING. Only three of the nine have one a
   * person can act on themselves; offering a button for the others would be
   * sending somebody to a screen that cannot help them.
   */
  readonly out: "plan" | "wallet" | "prove" | null;
}

/**
 * ⚠️ EVERY GATE, BECAUSE A MISSING ONE IS A CONTROL WITH NO EXPLANATION. The
 * record is exhaustive by type, so adding a gate to `GATE_ORDER` is a red build
 * here rather than a button that is quietly dead on one tier.
 */
export const STOPPED: Readonly<Record<Gate, Stopped>> = {
  accepted: { why: "Agree to the terms first", out: null },
  standing: { why: "This workspace is read-only", out: "plan" },
  permission: { why: "Your role does not include this", out: null },
  kind: { why: "Only a business workspace can do this", out: "plan" },
  proof: { why: "Confirm it is you first", out: "prove" },
  entitlement: { why: "Your plan does not include this", out: "plan" },
  /* ⚠️ A FLAG IS OURS AND AN ENTITLEMENT IS THEIRS. Telling somebody to upgrade
     for a thing we have switched off is selling something that does not exist,
     so this one names nothing and offers nothing. */
  flag: { why: "Not available here", out: null },
  quota: { why: "You have used all of yours", out: "plan" },
  credits: { why: "Not enough credits", out: "wallet" },
};

/** The short form, for a control that has room for one line. */
export const sayGate = (gate: Gate): string => STOPPED[gate].why;

/* ------------------------------------------------------------ what may be --- */

/**
 * ⚠️ THE VERDICTS ARRIVE ONCE AND EVERY CONTROL READS THEM. Threading them from
 * the surface down to each button is a prop on every screen in every product,
 * and the fault it produces is silent: the one screen somebody forgot draws a
 * control that still fails after the press. A context is what makes the default
 * REACHING the control rather than being passed to it.
 *
 * ⚠️ AND EMPTY MEANS ALLOWED, WHICH IS THE ONLY SAFE DIRECTION FOR A SURFACE.
 * The gate itself is the enforcement; drawing a control the server will refuse
 * costs a wasted press, while HIDING one the server would have allowed costs a
 * feature somebody paid for and cannot find.
 */
const ALLOWED = React.createContext<Readonly<Record<string, Gate>>>({});

export function Allowed({ may, children }: {
  readonly may?: Readonly<Record<string, Gate>>;
  readonly children: React.ReactNode;
}) {
  return <ALLOWED.Provider value={may ?? {}}>{children}</ALLOWED.Provider>;
}

/**
 * WHICH GATE WOULD REFUSE THIS OPERATION, FOR WHOEVER IS LOOKING.
 *
 * ⚠️ THE OPERATION'S ID, BECAUSE THAT IS WHAT A CONTROL ACTUALLY CALLS. A screen
 * asking "am I allowed to adjust stock" would be a screen restating the gate's
 * question in its own words, and the two drift; asking about the OPERATION is
 * asking the same question the request will ask.
 */
export const useGate = (op: string | undefined): Gate | null =>
  React.useContext(ALLOWED)[op ?? ""] ?? null;
