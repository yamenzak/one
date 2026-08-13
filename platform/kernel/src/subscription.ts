/**
 * WHAT AN ACCOUNT HOLDS — one subscription per product, per workspace.
 *
 * Layer 3. Imports entitlement, standing and primitives.
 *
 * ⚠️ THE PAYER IS AN ACCOUNT, AND IT WAS A WORKSPACE. That is the whole change,
 * and every consequence below follows from it. A workspace could not be the payer
 * because it does not exist yet at the moment somebody decides to buy: the
 * purchase is what lets them create one. Held on the workspace, the only
 * expressible order is "make it first, pay later" — which is the parking state,
 * a product that has to be given away until somebody gets round to paying for it.
 *
 * ⚠️ SO A SUBSCRIPTION CAN EXIST WITH NOWHERE TO POINT, and that is a state
 * rather than a gap. Somebody buys in the hub, is handed to the product's setup
 * door, and closes the tab: what they hold is a paid subscription looking for a
 * workspace. It is theirs, it is visible, and it is claimed by the next workspace
 * they create in that product. Modelled as an error it would be money taken with
 * nothing to show, and the recovery would be a support conversation.
 *
 * ⚠️ AND ONE SUBSCRIPTION IS ONE WORKSPACE. A plan's ceilings are written per
 * workspace — so many clients, so many screens — and a subscription covering
 * every workspace an account owns makes each of those numbers ambiguous in a way
 * no reading fixes. A second studio is a second subscription on the same card.
 */

import type { Instant } from "./primitives.js";
import type { Overrides } from "./entitlement.js";
import { NO_OVERRIDES } from "./entitlement.js";
import type { StandingState } from "./standing.js";

/* ------------------------------------------------------------- the state --- */

/**
 * ⚠️ WHAT THE PROVIDER LAST SAID, NOT WHAT IT MEANS. The ladder decides meaning
 * over time; this is the fact it decides from. Merging them is how a deployment
 * with no provider at all ends up unable to express "nothing is wrong here".
 */
export type PaymentStatus =
  /** Nothing has ever been said. A subscription in this state has not started. */
  | "none"
  /** Free, running, with an end date. Nothing has been charged yet. */
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled";

export interface Subscription {
  readonly id: string;
  readonly accountId: string;
  /** Which product this is for. An account may hold one per product, and several. */
  readonly productId: string;
  /**
   * ⚠️ NULL IS THE ORDINARY STATE FOR A FEW MINUTES, and sometimes for weeks.
   * See the header: bought, not yet pointed at anything.
   */
  readonly tenantId: string | null;
  readonly planId: string | null;
  /**
   * ⚠️ CHOOSING A PLAN NEVER GRANTS IT. Only a settled payment may write
   * `planId`, so a choice made before the money moves is recorded here — which
   * is also what lets a deployment with no payment provider record one at all.
   */
  readonly pendingPlanId: string | null;
  readonly status: PaymentStatus;
  /** ⚠️ Set while `trialing`, and kept afterwards so a second trial is refusable. */
  readonly trialEndsAt: Instant | null;
  readonly pastDueAt: Instant | null;
  readonly closingAt: Instant | null;
  readonly overrides: Overrides;
}

export const UNSTARTED: Omit<Subscription, "id" | "accountId" | "productId"> = {
  tenantId: null, planId: null, pendingPlanId: null, status: "none",
  trialEndsAt: null, pastDueAt: null, closingAt: null, overrides: NO_OVERRIDES,
};

/* ------------------------------------------------------------ the ladder --- */

/**
 * ⚠️ ONE LADDER FOR EVERY WAY OF NOT PAYING, and the rungs are the same ones the
 * arrears ladder already had. A trial that ended without a card and a charge that
 * failed are the same fact to a workspace — the product is unpaid — and giving
 * them separate ladders means two sets of rungs, two sweeps and two chances to
 * get the destructive end wrong.
 *
 * ⚠️ AND THE LAST RUNG IS DESTRUCTIVE, WHICH IS WHY IT IS THE FURTHEST OUT AND
 * ANNOUNCED AT EVERY RUNG BEFORE IT. Deprovisioning is the only step here that
 * cannot be undone by paying.
 */
export interface ArrearsLadder {
  /** Notices only. Everything still works. */
  readonly graceDays: number;
  /** Writes refused, reads served. */
  readonly readOnlyDays: number;
  /** The product withheld — one screen instead of it. */
  readonly blockedDays: number;
  /** The workspace and its records erased. */
  readonly erasedDays: number;
}

/**
 * ⚠️ THE ERASURE RUNG HAS A FLOOR AND IT IS NOT TASTE. Somebody who missed a
 * payment while travelling has to be able to come back to a product rather than
 * to an apology, and every rung before this one is reversible by paying. A
 * ladder that reached erasure in a fortnight would be a support incident per
 * customer per holiday.
 */
export const ERASURE_FLOOR_DAYS = 30;

export const DEFAULT_ARREARS: ArrearsLadder = { graceDays: 3, readOnlyDays: 10, blockedDays: 30, erasedDays: 60 };

export function arrearsProblems(ladder: ArrearsLadder): readonly string[] {
  const out: string[] = [];
  const rungs = [ladder.graceDays, ladder.readOnlyDays, ladder.blockedDays, ladder.erasedDays];
  /*
    ⚠️ OUT OF ORDER IS NOT A TYPO, IT IS A LADDER THAT SKIPS RUNGS. Blocked before
    read-only means a workspace is withheld with no warning step, and every rung
    the comparison passes over is a notice somebody was supposed to get.
  */
  if (rungs.some((d, i) => i > 0 && d <= rungs[i - 1]!)) out.push("rungs are not in increasing order, so a step is skipped with no notice");
  if (ladder.erasedDays < ERASURE_FLOOR_DAYS) out.push(`erases sooner than ${ERASURE_FLOOR_DAYS} days, which is not long enough to come back from a missed payment`);
  return out;
}

const DAY_MS = 86_400_000;
const daysBetween = (from: Instant, to: Instant): number =>
  Math.floor((Date.parse(to) - Date.parse(from)) / DAY_MS);

/**
 * Where a subscription stands, and what it means for the workspace on it.
 *
 * ⚠️ `chargeable` IS THE DEPLOYMENT'S OWN CONFIGURATION, AND IT GATES EXACTLY ONE
 * BRANCH. With no payment provider — a self-host, anything before the deploy
 * guide's payment step, every test in this repo — holding a workspace read-only
 * for never having chosen a plan punishes somebody for OUR missing configuration,
 * with nothing they could pay to escape it.
 *
 * ⚠️ IT DOES NOT STAND THE ARREARS LADDER DOWN, AND THAT DISTINCTION IS THE WHOLE
 * OF IT. A reported failed charge is evidence a payment rail EXISTS — read as
 * "this deployment cannot charge", every workspace that stopped paying would sit
 * at `active` forever while the provider retried, and the ladder would look
 * correct at every individual moment and never arrive. Fail closed on their
 * non-payment; open only on ours.
 */
export function standingOf(
  sub: Pick<Subscription, "planId" | "status" | "trialEndsAt" | "pastDueAt" | "closingAt">,
  now: Instant,
  chargeable: boolean,
  ladder: ArrearsLadder = DEFAULT_ARREARS,
): StandingState {
  if (sub.closingAt) return { standing: "closing", reason: "closing", nextAt: sub.closingAt };

  /*
    ⚠️ AN ENDED TRIAL IS ARREARS, MEASURED FROM THE DAY IT ENDED. Treated as its
    own state it would need its own rungs; anchored here it walks the one ladder
    everything else walks, so nobody has to keep two sets of dates in step.
  */
  const unpaidSince =
    sub.pastDueAt ??
    (sub.status === "trialing" && sub.trialEndsAt && sub.trialEndsAt <= now ? sub.trialEndsAt : null);

  if (unpaidSince) {
    const days = daysBetween(unpaidSince, now);
    const at = (d: number) => new Date(Date.parse(unpaidSince) + d * DAY_MS).toISOString() as Instant;
    if (days < ladder.graceDays) return { standing: "grace", reason: "arrears", nextAt: at(ladder.graceDays) };
    if (days < ladder.readOnlyDays) return { standing: "read_only", reason: "arrears", nextAt: at(ladder.readOnlyDays) };
    if (days < ladder.erasedDays) return { standing: "blocked", reason: "arrears", nextAt: at(ladder.erasedDays) };
    /*
      ⚠️ PAST THE LAST RUNG IS STILL `blocked`, NOT A SIXTH STANDING. Erasure is
      something a sweep DOES, not a state a request reads — and a standing that
      meant "already gone" would be read by a request for a workspace that is
      still there, because the sweep runs on its own clock.
    */
    return { standing: "blocked", reason: "arrears", nextAt: at(ladder.erasedDays) };
  }

  if (sub.status === "cancelled") return { standing: "read_only", reason: "suspended" };
  if (sub.status === "trialing") return { standing: "active", reason: "ok", ...(sub.trialEndsAt ? { nextAt: sub.trialEndsAt } : {}) };

  /*
    ⚠️ NO PLAN AND NOTHING OWED IS `setup`, AND IT IS THE STATE A WORKSPACE SHOULD
    NEVER REACH NOW. A workspace is created by claiming a subscription somebody
    already started, so this is the leftover of one created before that rule or by
    an operator — served read-only with its own reason rather than as arrears,
    because nothing was taken and there is nothing to settle.
  */
  if (!sub.planId && chargeable) return { standing: "read_only", reason: "setup" };
  return { standing: "active", reason: "ok" };
}

/** Whether the sweep should erase what this subscription's workspace holds. */
export function dueForErasure(
  sub: Pick<Subscription, "status" | "trialEndsAt" | "pastDueAt" | "closingAt">,
  now: Instant,
  ladder: ArrearsLadder = DEFAULT_ARREARS,
): boolean {
  const unpaidSince =
    sub.pastDueAt ?? (sub.status === "trialing" && sub.trialEndsAt && sub.trialEndsAt <= now ? sub.trialEndsAt : null);
  if (!unpaidSince) return false;
  return daysBetween(unpaidSince, now) >= ladder.erasedDays;
}

/* -------------------------------------------------------------- claiming --- */

/**
 * Whether this subscription is one a new workspace may attach itself to.
 *
 * ⚠️ POINTING AT NOTHING IS NOT ENOUGH — IT MUST ALSO BE PAID FOR. A cancelled
 * subscription and one whose trial ran out both point at nothing, and letting
 * either be claimed makes "you cannot start until you have paid" a rule anybody
 * can walk around by starting a trial, letting it lapse and creating a workspace
 * on the corpse.
 */
export function claimable(sub: Subscription, productId: string, now: Instant): boolean {
  if (sub.tenantId !== null) return false;
  if (sub.productId !== productId) return false;
  if (sub.status === "active") return true;
  return sub.status === "trialing" && sub.trialEndsAt !== null && sub.trialEndsAt > now;
}

/**
 * ⚠️ ONE TRIAL PER ACCOUNT PER PRODUCT, AND THE RECORD IS THE SUBSCRIPTION ROW
 * ITSELF. `trialEndsAt` is kept after the trial ends precisely so this question
 * has an answer — cleared on expiry, somebody gets a fresh trial every time they
 * cancel, which is a free product with extra steps.
 */
export const hadTrial = (subs: readonly Subscription[], productId: string): boolean =>
  subs.some((s) => s.productId === productId && s.trialEndsAt !== null);
