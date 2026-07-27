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
 *   studio      the STUDIO's own standing with Mossa (ok / grace / suspended)
 *
 * ── The rules, in precedence order ──────────────────────────────────────────
 *
 * 1. A SUSPENDED STUDIO loses what Mossa sells — for itself AND its clients, via
 *    the entitlement clamp — but never a person's access to their own data. The
 *    studio owes Mossa; the client did nothing. Grace (`past_due`) is full
 *    service by definition and changes nothing for anyone but the owner.
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

/**
 * The STUDIO's own standing with Mossa. Three states, not two, because the
 * lifecycle has a grace window and collapsing it loses the whole point of one:
 *
 *   ok         paid up.
 *   grace      a payment failed and dunning is running (`past_due`). GRACE_DAYS
 *              of FULL service — that is what a grace window is for. The owner is
 *              notified; the client is not affected at all and must not be.
 *   suspended  grace expired (`suspended`/`canceled`/`unpaid`). Entitlements are
 *              clamped to free by `clampEntitlementsForStatus`, and because a
 *              client's capability is `entitlements ∩ clientFlags`, that passes
 *              through with no per-client bookkeeping: their AI, commerce, body
 *              scan and external search all stop. What survives is logging their
 *              own data, which costs the studio nothing and is theirs anyway.
 *
 * So a suspended studio's clients do NOT carry on "as if nothing" — they lose
 * every paid feature. They keep their own record and their own logbook, which is
 * the line this module draws: Mossa withholds what Mossa sells, and does not hold
 * a client's own history hostage over their coach's invoice.
 */
export type StudioStanding = "ok" | "grace" | "suspended";

/** The client record's status in this tenancy. */
export type Membership = "none" | "pending_signup" | "active" | "archived";

export interface StandingFacts {
  membership: Membership;
  /** A live plan/package covers them right now. */
  accessActive: boolean;
  /** This studio requires a live plan/package to use the app at all. */
  accessRequired: boolean;
  /** The STUDIO's standing with Mossa: paid, in dunning grace, or suspended. */
  studio: StudioStanding;
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
    | "studio_suspended";
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

  // Grace is deliberately invisible here: `past_due` means dunning is running and
  // the studio still has full service, so there is nothing for the client to see
  // or lose. Only the owner is told (billing_past_due). Falling through to the
  // normal rules below is the correct behaviour, not an omission.

  // Grace expired. Paid features are already gone — `clampEntitlementsForStatus`
  // drops the tenant to free and the client inherits that through
  // `entitlements ∩ clientFlags`, so AI, commerce, body scan and search stop
  // without any per-client work. What is left to decide here is the client's own
  // data, and that stays theirs: read it, keep logging to it. Purchasing is off
  // because the storefront is a paid feature the studio no longer has, and no
  // amount of buying would fix the studio's own subscription anyway.
  if (f.studio === "suspended") {
    return { canRead: true, canWrite: true, canPurchase: false, lockedToStorefront: false, reason: "studio_suspended" };
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
  studio: ["ok", "grace", "suspended"] as StudioStanding[],
};
