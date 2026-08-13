/**
 * CREDITS — one balance per ACCOUNT, and the two kinds it is made of.
 *
 * Layer 1. Imports primitives only.
 *
 * ⚠️ THE BALANCE BELONGS TO THE ACCOUNT, NOT TO A WORKSPACE OR TO A PRODUCT.
 * Somebody who buys credits buys them once and spends them wherever they work —
 * a balance per workspace means a person with two of them running out in one
 * while the other is full, and topping up the wrong one to fix it. It is also
 * the only shape in which a single storefront can sell credits at all: a hub
 * cannot fill a balance it would have to pick a workspace for.
 *
 * ⚠️ AND IT IS TWO KINDS OF CREDIT WEARING ONE NUMBER, WHICH IS THE WHOLE OF
 * THIS FILE. A plan GRANTS an allowance every period and it does not roll over;
 * a pack is BOUGHT and it never expires. Held as one total they are impossible to
 * tell apart, so either every credit expires — destroying money somebody paid for
 * — or none does, and the monthly allowance silently becomes cumulative, which is
 * a product giving away a year of generation to anybody who waits.
 *
 * ⚠️ SPEND THE PERISHABLE ONE FIRST. It is the only order that is not a quiet
 * loss: charging purchased credits while granted ones expire beside them takes
 * money from somebody in a way no screen shows and no error reports.
 */

import type { Instant } from "./primitives.js";

/* --------------------------------------------------------------- the two --- */

/**
 * ⚠️ TWO VALUES, AND NEITHER IS A DEFAULT. An entry with no kind would have to
 * be read as one of them, and whichever is chosen is wrong for the other half of
 * the ledger — silently, in the direction of either destroying paid credits or
 * making an allowance permanent.
 */
export type CreditKind =
  /** From a plan's allowance. Expires with its period; never rolls over. */
  | "granted"
  /** Bought outright. No expiry, ever. */
  | "purchased";

/**
 * A batch of granted credits that expire together.
 *
 * ⚠️ THE CHARGE CARRIES THE SAME EXPIRY AS THE GRANT IT DRAWS FROM, which is
 * what keeps the balance a plain SUM. Grant `+30000 expiring 1 Sep` and charge
 * `-500 expiring 1 Sep` both drop out of the sum on the 1st, together — so the
 * unused part expires and the spent part does not have to be remembered
 * anywhere. Written with the charge unexpiring, the ledger goes NEGATIVE by
 * whatever was spent the moment the grant lapses.
 */
export interface Cohort {
  /** Null for `purchased`, which is the cohort that never ends. */
  readonly expiresAt: Instant | null;
  /** What is left in it. Never negative in a well-formed ledger. */
  readonly left: number;
}

/** One share of a spend, against one cohort. */
export interface CreditShare {
  readonly kind: CreditKind;
  readonly expiresAt: Instant | null;
  /** Positive. The caller writes it as a debit. */
  readonly amount: number;
}

export interface CreditAllocation {
  readonly shares: readonly CreditShare[];
  /**
   * What could not be covered. Non-zero means the spend must be REFUSED — a
   * partial charge is a generation half paid for, which is the one outcome
   * neither side wants.
   */
  readonly short: number;
}

/**
 * Which credits a spend comes out of.
 *
 * ⚠️ PERISHABLE FIRST, AND SOONEST-PERISHING BEFORE THE REST. Two cohorts can
 * be live at once — a period's grant arriving before the previous one lapses,
 * an operator's one-off with its own date — and spending the later one first
 * lets the earlier one expire unused. Nothing reports that; the balance is
 * simply smaller next month than the arithmetic says it should be.
 *
 * ⚠️ IT IS PURE, AND SO IS THE REFUSAL. Whether there is enough is decided here
 * and written once, rather than each caller comparing a total it read earlier —
 * which is the shape that overspends under two requests at the same instant.
 */
export function allocateCredits(cohorts: readonly Cohort[], purchased: number, amount: number): CreditAllocation {
  if (amount <= 0) return { shares: [], short: 0 };

  const perishable = [...cohorts]
    .filter((c) => c.left > 0 && c.expiresAt !== null)
    .sort((a, b) => (a.expiresAt! < b.expiresAt! ? -1 : a.expiresAt! > b.expiresAt! ? 1 : 0));

  const shares: CreditShare[] = [];
  let left = amount;

  for (const cohort of perishable) {
    if (left === 0) break;
    const take = Math.min(cohort.left, left);
    shares.push({ kind: "granted", expiresAt: cohort.expiresAt, amount: take });
    left -= take;
  }

  if (left > 0 && purchased > 0) {
    const take = Math.min(purchased, left);
    shares.push({ kind: "purchased", expiresAt: null, amount: take });
    left -= take;
  }

  return { shares, short: left };
}

/* -------------------------------------------------------------- the sum --- */

export interface CreditBalance {
  readonly total: number;
  readonly granted: number;
  readonly purchased: number;
  /**
   * When the next cohort lapses, and how much goes with it — so a screen can say
   * "3,000 expire on 1 September" rather than showing a number that drops
   * overnight for no visible reason.
   */
  readonly expiring: { readonly at: Instant; readonly amount: number } | null;
}

/**
 * ⚠️ EXPIRY IS A PREDICATE, NOT A SWEEP. A job that zeroed lapsed cohorts would
 * make the balance depend on whether that job ran — so a deployment whose
 * scheduler is wedged keeps handing out an allowance that expired in March, and
 * the ledger says it was correct to. Read as a predicate, the credits stop being
 * spendable at the instant they were sold as stopping, with nothing to run.
 */
export function creditBalance(cohorts: readonly Cohort[], purchased: number, now: Instant): CreditBalance {
  const live = cohorts.filter((c) => c.expiresAt !== null && c.expiresAt > now && c.left > 0);
  const granted = live.reduce((sum, c) => sum + c.left, 0);
  const next = [...live].sort((a, b) => (a.expiresAt! < b.expiresAt! ? -1 : 1))[0];
  return {
    total: granted + purchased,
    granted,
    purchased,
    expiring: next ? { at: next.expiresAt!, amount: next.left } : null,
  };
}

/* ------------------------------------------------------------- the grant --- */

/**
 * ⚠️ AN ALLOWANCE IS GRANTED ONCE PER PERIOD, AND THE PERIOD IS THE KEY.
 *
 * A payment provider redelivers, a sweep re-runs, an operator presses a button
 * twice — and every one of those is a second month's credits granted inside one
 * month if the entry is unkeyed. Stamping the period into the reference makes
 * the ledger's own uniqueness the protection, so there is no counter anybody has
 * to keep and no window where two grants both look like the first.
 */
export const grantRef = (subscriptionId: string, period: string): string =>
  `allowance:${subscriptionId}:${period}`;

/**
 * The period a moment falls in, as the text the reference is keyed on.
 *
 * ⚠️ DERIVED FROM THE INSTANT RATHER THAN COUNTED, so a deployment that missed a
 * month does not grant the missed one late and then run a month behind forever.
 * Somebody who was away gets this period's allowance, not a backlog — which is
 * what "does not roll over" means.
 */
export const periodOf = (at: Instant): string => at.slice(0, 7);
