/**
 * STANDING — what a person may do in ONE tenancy, decided in one place.
 *
 * A client's position in a studio is not one flag, it is the intersection of
 * several independent ones, and before this each consumer combined them by hand:
 * the Shell had its own access-gate condition, `requireClientAccess` had its own
 * archived rule, the Today banner had a third reading. Three implementations of
 * one policy is how you end up asking an archived person to buy a package.
 *
 * So the policy lives here, pure and total: give it the facts, get back what the
 * person can do. The API enforces it, the app renders it, and a test enumerates
 * every combination — see `standing.test.ts`.
 *
 * ── The axes ────────────────────────────────────────────────────────────────
 *
 *   membership  the client record's status in THIS tenancy
 *                 none            no client record (staff-only persona)
 *                 pending_signup  reserved by a self-signup, address unverified
 *                 active          a client
 *                 archived        off the roster; the studio ended it
 *   access      whether a live plan/package covers them, and whether this
 *               studio requires one at all
 *   studio      the STUDIO's own standing with Mossa (paid, or delinquent)
 *
 * ── The rules, in precedence order ──────────────────────────────────────────
 *
 * 1. A DELINQUENT STUDIO degrades its own paid features, never a person's access
 *    to their data. The studio owes Mossa money; the client did nothing.
 * 2. ARCHIVED outranks access. The relationship is over, so there is nothing to
 *    sell and nothing to unlock — read your history, write nothing.
 * 3. GATED ACCESS with no live plan locks to the storefront, and ONLY then.
 * 4. Otherwise: full use.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 *
 * Every one of these facts is per-tenancy, and so is every answer. A person
 * archived at studio A, locked out at studio B and training happily at studio C
 * holds three different standings at once, and nothing here can mix them: the
 * caller passes one tenancy's facts and gets that tenancy's answer. This is the
 * property that makes multi-studio identity safe, so it is asserted directly.
 */

/** The client record's status in this tenancy. */
export type Membership = "none" | "pending_signup" | "active" | "archived";

export interface StandingFacts {
  membership: Membership;
  /** A live plan/package covers them right now. */
  accessActive: boolean;
  /** This studio requires a live plan/package to use the app at all. */
  accessRequired: boolean;
  /** The STUDIO's subscription with Mossa has lapsed. */
  studioDelinquent: boolean;
}

export interface Standing {
  /** Read their own record, logs, plans, history. */
  canRead: boolean;
  /** Log, check in, edit their own data. */
  canWrite: boolean;
  /** Buy or redeem access at this studio. */
  canPurchase: boolean;
  /** The app must replace itself with the storefront. */
  lockedToStorefront: boolean;
  /** Machine-readable reason, for copy and for tests. */
  reason:
    | "ok"
    | "no_record"
    | "unclaimed"
    | "archived"
    | "needs_access"
    | "studio_delinquent";
}

/**
 * What this person may do in this tenancy. Total: every combination of the axes
 * returns something, and nothing throws.
 */
export function resolveStanding(f: StandingFacts): Standing {
  // No client record: there is nothing to read, and nothing to sell. A staff-only
  // persona lands here and is governed by role + entitlements instead.
  if (f.membership === "none") {
    return { canRead: false, canWrite: false, canPurchase: false, lockedToStorefront: false, reason: "no_record" };
  }

  // A reservation is not a person yet — nobody has proved they own the address.
  // It should never surface as a persona at all (no member row exists until it is
  // claimed); this is the belt, so a future caller that finds one cannot treat it
  // as a client.
  if (f.membership === "pending_signup") {
    return { canRead: false, canWrite: false, canPurchase: false, lockedToStorefront: false, reason: "unclaimed" };
  }

  // Archived: the data is theirs to read, and the relationship is over — so no
  // writes, and crucially NOT a storefront. Buying would not un-archive them, and
  // being sold to by a studio that just let you go is insulting.
  if (f.membership === "archived") {
    return { canRead: true, canWrite: false, canPurchase: false, lockedToStorefront: false, reason: "archived" };
  }

  // The studio owes MOSSA money. That is between the studio and us: it degrades
  // the studio's paid features (enforced by entitlements, elsewhere), but the
  // client keeps their own data and keeps logging. Never punish a client for
  // their coach's unpaid invoice — and never lock them to a storefront over it,
  // since buying more access would not fix the studio's subscription.
  if (f.studioDelinquent) {
    return { canRead: true, canWrite: true, canPurchase: false, lockedToStorefront: false, reason: "studio_delinquent" };
  }

  // Gated studio, no live access → the storefront, which they CAN buy from.
  if (f.accessRequired && !f.accessActive) {
    return { canRead: false, canWrite: false, canPurchase: true, lockedToStorefront: true, reason: "needs_access" };
  }

  return { canRead: true, canWrite: true, canPurchase: true, lockedToStorefront: false, reason: "ok" };
}

/** Every axis value, for exhaustive enumeration in tests and docs. */
export const STANDING_AXES = {
  membership: ["none", "pending_signup", "active", "archived"] as Membership[],
  accessActive: [true, false],
  accessRequired: [true, false],
  studioDelinquent: [true, false],
};
