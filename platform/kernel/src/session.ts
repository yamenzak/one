/**
 * SESSIONS — per origin, per app, per region, and never shared.
 *
 * Layer 2. Imports primitives and identity.
 *
 * ⚠️ AN ACCOUNT IS SHARED ACROSS PRODUCTS; A SESSION IS NOT. That distinction is
 * the entire security argument for single sign-on here.
 *
 * One credential across every product is a feature: sign in once, tap once on
 * the next product, one place to manage the account. One SESSION across every
 * product would mean a script injected into any one of them acting as that
 * person in all of them — a signage dashboard reaching a health record. The
 * account is worth sharing; the bearer token is not.
 */

import type { Account } from "./identity.js";
import type { Instant, Locale, UserId } from "./primitives.js";

/**
 * The account fields a session carries with it.
 *
 * ⚠️ THIS COPY IS WHY A GLOBAL IDENTITY STORE IS AFFORDABLE. Validation happens
 * on every request; without the snapshot each one would cross a region to read
 * the account, putting a continental round trip on the hot path of the entire
 * platform. With it, the shared store is read once per sign-in.
 *
 * The cost is staleness, bounded and deliberate: a renamed person shows their
 * old name until the session refreshes. `profileVersion` is how the copy knows
 * it is behind — compared at sign-in and refresh, never per request, which would
 * reintroduce exactly the read this exists to avoid.
 */
export interface AccountSnapshot {
  readonly email: string;
  readonly name: string | null;
  readonly avatarUrl: string | null;
  readonly locale: Locale;
  readonly profileVersion: number;
}

export interface Session {
  readonly id: string;
  readonly accountId: UserId;
  /**
   * ⚠️ THE ORIGIN THIS SESSION IS FOR, and it is never widened.
   *
   * Checked on every request. A cookie can be sent somewhere it was not meant
   * for — by a misconfigured domain attribute, a proxy, or a mistake in a future
   * edit — and this field is what makes that inert rather than a cross-product
   * compromise. Belt as well as braces, on the one thing where braces alone
   * would be a bad trade.
   */
  readonly origin: string;
  readonly appId: string;
  readonly createdAt: Instant;
  readonly expiresAt: Instant;
  readonly snapshot: AccountSnapshot;
}

/**
 * HOW LONG A PROOF OF POSSESSION STAYS FRESH.
 *
 * ⚠️ TEN MINUTES, AND THE NUMBER IS A TRADE RATHER THAN A CONVENTION. Long
 * enough that reading a screen, thinking, and deciding does not expire it —
 * closing an account is not a thing anybody should be rushed through — and short
 * enough that a session left open on a borrowed machine is not a standing licence
 * to use it. It is the same ten minutes an emailed code is good for, which is not
 * a coincidence: both are answers to "was this person here just now".
 */
export const PROOF_FRESH_MS = 10 * 60_000;

/**
 * WHETHER A SESSION WAS PROVEN RECENTLY ENOUGH FOR SOMETHING SERIOUS.
 *
 * ⚠️ THE PROOF IS THE SESSION'S OWN AGE, AND THAT IS THE WHOLE MECHANISM. A
 * session exists because somebody completed a ceremony — a passkey assertion or
 * an emailed code — so "recently proven" and "recently created" are the same
 * fact. Re-proving mints a new session, which resets it.
 *
 * ⚠️ WHICH IS WHY THERE IS NO SECOND TIMESTAMP AND NO STEP-UP TABLE. Both would
 * be a copy of something already recorded, and a copy is a thing that can
 * disagree — including in the direction that says somebody proved themselves when
 * they did not.
 */
export const provenRecently = (session: Pick<Session, "createdAt">, now: Instant): boolean =>
  Date.parse(now) - Date.parse(session.createdAt) < PROOF_FRESH_MS;

export type SessionVerdict =
  | { readonly ok: true; readonly session: Session; readonly stale: boolean }
  | { readonly ok: false; readonly why: "expired" | "wrong_origin" | "wrong_app" };

/**
 * Validate a session against the request it arrived on.
 *
 * ⚠️ PURE, AND IT NEVER READS THE ACCOUNT. That is the property worth
 * protecting: everything needed on the hot path is in the session row, so this
 * function cannot be tempted into a cross-region lookup no matter how convenient
 * one would be. The moment it takes an `Account`, the design is gone.
 *
 * `stale` is advisory. A behind-the-times snapshot is still a VALID session —
 * refusing one because somebody changed their avatar would sign people out for
 * a cosmetic reason. The caller refreshes at its leisure.
 */
export function validateSession(session: Session, at: { origin: string; appId: string }, now: Instant, knownProfileVersion?: number): SessionVerdict {
  if (session.origin !== at.origin) return { ok: false, why: "wrong_origin" };
  if (session.appId !== at.appId) return { ok: false, why: "wrong_app" };
  // ISO-8601 UTC compares lexicographically, which is the whole reason instants
  // are that format and branded rather than epoch milliseconds.
  if (session.expiresAt <= now) return { ok: false, why: "expired" };
  const stale = knownProfileVersion !== undefined && knownProfileVersion > session.snapshot.profileVersion;
  return { ok: true, session, stale };
}

/** Take the snapshot. The one place an account becomes a session's copy of it. */
export function snapshotOf(account: Account): AccountSnapshot {
  return {
    email: account.email,
    name: account.name,
    avatarUrl: account.avatarUrl,
    locale: account.locale,
    profileVersion: account.profileVersion,
  };
}
