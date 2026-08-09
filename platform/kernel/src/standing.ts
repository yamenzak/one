/**
 * STANDING — what a tenant may still do, and the two rules that never bend.
 *
 * Layer 1. Imports primitives only.
 *
 * A payment lifecycle, not a permission. Standing answers "is this workspace in
 * good order with us", which is a different question from "may this person do
 * this" and must be resolved once per request rather than asked per route.
 */

import type { Instant } from "./primitives.js";

export type Standing =
  | "active"
  /** Notices only. Everything still works. */
  | "grace"
  /** Writes refused, reads served, nobody signed out. */
  | "read_only"
  /** The app is withheld — one screen instead of the product. */
  | "blocked"
  /** The OWNER's decision, cancellable, reversed by cancelling rather than paying. */
  | "closing";

export interface StandingState {
  readonly standing: Standing;
  /** Why, so the copy can differ. Arrears and an unfinished signup are not the same. */
  readonly reason: "ok" | "arrears" | "setup" | "closing" | "suspended";
  /** When the next rung arrives, so a person can be told before it does. */
  readonly nextAt?: Instant;
}

/**
 * ⚠️ TWO RULES, AND NEITHER IS NEGOTIABLE.
 *
 * READS ARE NEVER GATED, AT ANY RUNG. Withholding the product is not the same as
 * holding somebody's own records hostage over a bill they did not personally
 * incur — and the people locked out of a lapsed workspace are usually not the
 * people who failed to pay it.
 *
 * LEAVING IS ALWAYS ALLOWED. Paying must be a way out, never the only one. A
 * workspace that cannot be closed while suspended is a trap, and a suspended
 * tenant whose exit route is also suspended has no route at all.
 */
export interface StandingGate {
  readonly reads: true;
  readonly writes: boolean;
  /** The app itself. False replaces the product with one screen. */
  readonly app: boolean;
}

/** Paths that survive every rung. Not a convenience — see the rules above. */
export const ALWAYS_ALLOWED: readonly string[] = [
  "identity",   // sign in, sign out, manage the account
  "exit",       // close the tenant, delete yourself
  "billing",    // pay, so the ladder is escapable
  "webhook",    // or suspension becomes unrecoverable
  "health",
];

export function gateFor(state: StandingState): StandingGate {
  switch (state.standing) {
    case "active":
    case "grace":
      return { reads: true, writes: true, app: true };
    case "read_only":
    case "closing":
      return { reads: true, writes: false, app: true };
    case "blocked":
      return { reads: true, writes: false, app: false };
  }
}

/**
 * Whether an operation survives the gate.
 *
 * `lane` is the operation's category — the app declares it, and the five above
 * are exempt at every rung. Everything else is refused on a write when the gate
 * is closed, and never on a read.
 */
export function permits(gate: StandingGate, lane: string, mutates: boolean): boolean {
  if (ALWAYS_ALLOWED.includes(lane)) return true;
  if (!mutates) return gate.reads;
  return gate.writes;
}
