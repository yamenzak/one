/**
 * WHAT HAPPENS WHEN A BUSINESS STOPS PAYING.
 *
 * ⚠️ READS ARE NEVER WITHHELD, AT ANY RUNG. Taking away a business's own records
 * over an unpaid invoice is holding their data hostage; what arrears take away
 * is the ability to CHANGE things. Every rung below narrows what can be written
 * and none of them narrows what can be read.
 *
 * ⚠️ AND PAYING IS A WAY OUT, NOT THE ONLY ONE. Leaving, exporting and closing
 * stay available at every rung — a workspace that cannot pay and cannot leave is
 * a trap, and a product that traps people is one nobody recommends.
 *
 * ⚠️ THE LADDER IS ANCHORED ON ONE TIMESTAMP. Every rung is a number of days
 * from `pastDueAt`, so there is no state machine to get out of step with itself
 * and no way for a tenant to be on two rungs at once. The rung is derived on
 * every read rather than written by a sweep, which means a sweep that failed to
 * run has not silently left somebody in the wrong state.
 *
 * Layer 2. Imports primitives and tenancy.
 */

import type { Instant } from "./primitives.js";
import type { Standing } from "./tenancy.js";

/**
 * ⚠️ `incomplete` IS A PARKING STATE, NOT A VERDICT. It is where a workspace
 * sits before anybody has chosen a plan — which is most of the first minute of
 * every signup — and the dunning ladder must never read it as arrears. A
 * previous platform's fail-open branch returned the stored status verbatim, so
 * the moment anything materialised the row, a brand-new workspace was held
 * read-only over an invoice that had never existed.
 */
export type SubStatus = "active" | "trialing" | "past_due" | "cancelled" | "incomplete";

export interface Ladder {
  /** Days past due before writes stop. */
  readonly readOnlyAfter: number;
  /** Days before the product is withheld entirely. */
  readonly blockedAfter: number;
  /** Days before the records go. ⚠️ Never less than `blockedAfter` plus a week. */
  readonly purgeAfter: number;
}

/**
 * ⚠️ SEVEN DAYS TO NOTICE, A MONTH TO ACT, TWO MONTHS MORE BEFORE ANYTHING IS
 * LOST. The gap between blocked and purged is the one that matters, and it is
 * the only rung measured against a person rather than an invoice: it is the
 * window in which somebody who has stopped reading our email can still be
 * reached by a colleague, come back from leave, or change their mind. A week was
 * enough to be defensible and not enough to survive one holiday, and the cost of
 * the longer window is storage we are already paying for.
 *
 * ⚠️ NOTHING QUOTES THESE NUMBERS BUT THIS LINE. The terms of use are written
 * from them (`whoWeAre`'s neighbours in the deployment's documents), so softening
 * a rung here softens the sentence a customer reads — which is the only way the
 * two can be kept from disagreeing.
 */
export const LADDER: Ladder = { readOnlyAfter: 7, blockedAfter: 30, purgeAfter: 90 };

const DAY = 24 * 60 * 60 * 1000;

export const daysPastDue = (pastDueAt: Instant | null, now: Instant): number =>
  pastDueAt ? Math.floor((Date.parse(now) - Date.parse(pastDueAt)) / DAY) : 0;

/**
 * Where a workspace stands.
 *
 * ⚠️ `charging` IS WHAT KEEPS A SELF-HOST WORKING. Gating "has not paid" on a
 * deployment that cannot take a payment strands every workspace over OUR
 * misconfiguration — so the ladder only applies where money can actually change
 * hands. Fail closed on their non-payment, open on ours.
 */
export function standingFor(
  sub: { readonly status: SubStatus; readonly pastDueAt: Instant | null } | null,
  now: Instant,
  opts: { readonly charging: boolean; readonly ladder?: Ladder } = { charging: true },
): Standing {
  const ladder = opts.ladder ?? LADDER;
  if (!opts.charging) return { writable: true, serving: true, reason: "" };

  /* ⚠️ No row and no plan is a workspace mid-signup, not a debtor. */
  if (!sub || sub.status === "incomplete") {
    return { writable: true, serving: true, reason: "" };
  }
  if (sub.status === "active" || sub.status === "trialing") {
    return { writable: true, serving: true, reason: "" };
  }

  const days = daysPastDue(sub.pastDueAt, now);

  if (sub.status === "cancelled") {
    return {
      writable: false, serving: true,
      reason: "This workspace's plan was cancelled. Choose a plan to start making changes again.",
    };
  }

  if (days >= ladder.blockedAfter) {
    return {
      writable: false, serving: false,
      reason: `There has been an unpaid invoice for ${days} days. Settling it restores the workspace.`,
    };
  }
  if (days >= ladder.readOnlyAfter) {
    return {
      writable: false, serving: true,
      reason: `There is an invoice outstanding from ${days} days ago. Everything is still here to read.`,
    };
  }
  /* ⚠️ The first week past due changes nothing. A card that expired on a Friday
     is not a reason to stop somebody working on Monday. */
  return { writable: true, serving: true, reason: "" };
}

/** ⚠️ Only after the last rung, and only where the deployment charges at all. */
export const dueForPurge = (
  sub: { readonly status: SubStatus; readonly pastDueAt: Instant | null } | null,
  now: Instant,
  ladder: Ladder = LADDER,
): boolean =>
  !!sub && sub.status === "past_due" && daysPastDue(sub.pastDueAt, now) >= ladder.purgeAfter;

/* ------------------------------------------------------------------ rules --- */

export type LadderRefusal = "rungs_out_of_order" | "purge_too_soon" | "no_grace";

/**
 * ⚠️ A LADDER THAT PURGES BEFORE IT BLOCKS DELETES A CUSTOMER'S RECORDS WITHOUT
 * EVER HAVING TOLD THEM ANYTHING WAS WRONG. It is a configuration mistake rather
 * than a bug, which is why it is checked here rather than trusted to review.
 */
export function refuseLadder(ladder: Ladder): readonly LadderRefusal[] {
  const out: LadderRefusal[] = [];
  if (ladder.readOnlyAfter < 1) out.push("no_grace");
  if (!(ladder.readOnlyAfter <= ladder.blockedAfter && ladder.blockedAfter <= ladder.purgeAfter)) {
    out.push("rungs_out_of_order");
  }
  if (ladder.purgeAfter - ladder.blockedAfter < 7) out.push("purge_too_soon");
  return out;
}
