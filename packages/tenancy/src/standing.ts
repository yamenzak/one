/**
 * STANDING — what a person may do in ONE tenancy, decided in one place.
 *
 * A client's position in a tenant is not one flag, it is the intersection of
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
 *                 archived        off the roster; the tenant ended it
 *   access      whether a live plan/package covers them, and whether this
 *               tenant requires one at all
 *   tenant      the TENANT's own standing with the platform (ok / grace / suspended)
 *
 * ── The rules, in precedence order ──────────────────────────────────────────
 *
 * 1. A SUSPENDED TENANT is closed. Its whole subdomain drops to read-only — see
 *    `resolveHostGate` below, which is where that is enforced once for every
 *    route rather than re-derived per handler. Nobody loses sight of their own
 *    data; nobody writes to a tenant that is not paying to run. Grace
 *    (`past_due`) is full service by definition and changes nothing for anyone
 *    but the owner, who is being dunned.
 * 2. ARCHIVED outranks access. The relationship is over, so there is nothing to
 *    sell and nothing to unlock — read your history, write nothing.
 * 3. GATED ACCESS with no live plan locks to the storefront, and ONLY then.
 * 4. Otherwise: full use.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 *
 * Every one of these facts is per-tenancy, and so is every answer. A person
 * archived at tenant A, locked out at tenant B and training happily at tenant C
 * holds three different standings at once, and nothing here can mix them: the
 * caller passes one tenancy's facts and gets that tenancy's answer. This is the
 * property that makes multi-tenant identity safe, so it is asserted directly.
 */

/**
 * The TENANT's own standing with the platform. Three states, not two, because the
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
 *              own data, which costs the tenant nothing and is theirs anyway.
 *
 * So a suspended tenant's clients do NOT carry on "as if nothing" — they lose
 * every paid feature. They keep their own record and their own logbook, which is
 * the line this module draws: the platform withholds what the platform sells, and does not hold
 * a client's own history hostage over their coach's invoice.
 */
export type TenantStanding = "ok" | "grace" | "suspended" | "blocked";

/** The client record's status in this tenancy. */
export type Membership = "none" | "pending_signup" | "active" | "archived";

export interface StandingFacts {
  membership: Membership;
  /** A live plan/package covers them right now. */
  accessActive: boolean;
  /** This tenant requires a live plan/package to use the app at all. */
  accessRequired: boolean;
  /** The TENANT's standing with the platform: paid, in dunning grace, or suspended. */
  tenant: TenantStanding;
}

export interface Standing {
  /** Read their own record, logs, plans, history. */
  canRead: boolean;
  /** Log, check in, edit their own data. */
  canWrite: boolean;
  /** Buy or redeem access at this tenant. */
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
    | "tenant_suspended";
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
  // being sold to by a tenant that just let you go is insulting.
  if (f.membership === "archived") {
    return { canRead: true, canWrite: false, canPurchase: false, lockedToStorefront: false, reason: "archived" };
  }

  // Grace is deliberately invisible here: `past_due` means dunning is running and
  // the tenant still has full service, so there is nothing for the client to see
  // or lose. Only the owner is told (billing_past_due). Falling through to the
  // normal rules below is the correct behaviour, not an omission.

  // Grace expired: the tenant is closed, and its whole subdomain is read-only.
  //
  // Paid features are already gone by a separate mechanism —
  // `clampEntitlementsForStatus` drops the tenant to free and the client inherits
  // that through `entitlements ∩ clientFlags`, so AI, commerce, body scan and
  // search stop with no per-client work. What is decided HERE is the client's own
  // data, and the line is: it stays readable, and it stops being writable.
  //
  // Writes are off because a write is the tenant continuing to operate. Letting
  // clients keep logging into a tenant that stopped paying means the product runs
  // indefinitely for free, and it also creates data the coach cannot act on (they
  // are locked out of the same host). Reads stay on because a person's own
  // training history is theirs and must never be held hostage over their coach's
  // invoice — the same principle that governs `archived` above.
  //
  // Purchasing is off: the storefront is a paid feature the tenant no longer has,
  // and no amount of client spending would settle the tenant's own bill.
  //
  // `blocked` is the next rung and lands here too: it withholds the APP, which
  // the host gate does, but a person's own data stays readable behind it for
  // exactly the reason above. Nothing about the debt makes their logbook ours.
  if (f.tenant === "suspended" || f.tenant === "blocked") {
    return { canRead: true, canWrite: false, canPurchase: false, lockedToStorefront: false, reason: "tenant_suspended" };
  }

  // Gated tenant, no live access → the storefront, which they CAN buy from.
  if (f.accessRequired && !f.accessActive) {
    return { canRead: false, canWrite: false, canPurchase: true, lockedToStorefront: true, reason: "needs_access" };
  }

  return { canRead: true, canWrite: true, canPurchase: true, lockedToStorefront: false, reason: "ok" };
}

/**
 * ── THE HOST GATE ───────────────────────────────────────────────────────────
 *
 * `resolveStanding` above answers "what may this PERSON do in this tenancy".
 * This answers the question one level up: "does this TENANT's host serve a
 * working app at all". They are separate because they have different inputs and
 * different blast radii — the host gate depends only on the tenant's own
 * subscription, applies identically to everyone who lands there, and is enforced
 * once in the route guard rather than in each of ~200 handlers.
 *
 * Splitting it out is what makes "a suspended tenant is closed" a real property
 * instead of an aspiration. Previously the tenant axis existed in `StandingFacts`
 * and BOTH callers passed `tenant: "ok"` — a hardcoded literal in `clients.ts`
 * and in the app's `Shell` — so a suspended tenant's clients were never actually
 * treated as suspended by this module at all. The entitlement clamp was doing the
 * entire job, which is why paid features stopped but ordinary logging did not.
 */

/** A tenant's subscription state, as the billing tables record it. */
export type SubscriptionStatus =
  | "active" | "trialing" | "past_due" | "suspended" | "blocked" | "unpaid" | "canceled" | "closing"
  /**
   * NEVER CONFIGURED — a tenant that exists and has never had a plan.
   *
   * Distinct from every status above, all of which describe a subscription that
   * once worked. This one describes the absence of one: an owner who abandoned
   * the wizard, whose card was declined at the first attempt, or who reloaded
   * mid-checkout. It is not a lapse and must not be spoken of as one.
   */
  | "incomplete";

export type HostGateReason = "ok" | "grace" | "suspended" | "blocked" | "closing" | "setup";

/**
 * The dunning ladder itself lives in `@4dl/billing` (`DUNNING_DAYS`,
 * `dunningRung`): it is a PAYMENT lifecycle, and an app that never bills its
 * tenants has no dunning while still having a host gate. What tenancy owns is
 * the mapping from whatever status the ladder produced onto what the host serves
 * — which is the part every app needs, billing or not.
 */

export interface HostGate {
  /** Every write on this host is refused. Reads are unaffected — always. */
  readOnly: boolean;
  /**
   * The app itself is withheld: one screen saying the tenant is suspended, and
   * nothing else. Distinct from `readOnly`, which still shows the whole app.
   *
   * Reads are STILL served to the person's own record behind this — blocking is
   * about withholding the product, not about holding a client's history hostage
   * over their coach's invoice, and the export/delete paths must keep working.
   */
  blocked: boolean;
  /**
   * The billing surface stays writable even while `readOnly`, so the one action
   * that fixes the situation is reachable from inside it. Without this a lapsed
   * tenant would be locked out of paying, which is an unrecoverable state.
   * Combine with a `billing:manage` permission check — this flag says the HOST
   * permits it, not that the caller is entitled to it.
   */
  billingWritable: boolean;
  /** Machine-readable, for API responses, copy and tests. */
  reason: HostGateReason;
}

/**
 * Map a subscription status onto the tenant's standing.
 *
 * A MISSING subscription row resolves to `ok`, deliberately: a tenant is created
 * before its plan is chosen, and gating the host on a row that the onboarding
 * wizard has not written yet would brick tenant creation at step one. Onboarding
 * enforces plan selection itself (a tenant cannot leave the wizard without one);
 * this function's job is the steady state.
 */
export function tenantStandingOf(status: SubscriptionStatus | string | null | undefined): TenantStanding {
  switch (status) {
    case "past_due":
      return "grace";
    case "blocked":
      return "blocked";
    case "suspended":
    case "unpaid":
    case "canceled":
    case "closing":
    // A tenant that never configured a plan is read-only for the same reason a
    // lapsed one is: the product does not run indefinitely for nothing. What
    // differs is only the copy, which the GATE carries (`reason: "setup"`) —
    // this axis exists to tell a CLIENT what they may do, and to a client the
    // two are identical.
    case "incomplete":
      return "suspended";
    default:
      // active, trialing, missing, or anything a future Stripe status introduces.
      return "ok";
  }
}

/**
 * Does this tenant's host serve a working app?
 *
 * `closing` is reported separately from `suspended` even though both are
 * read-only, because the copy has to differ: a suspended tenant is told to pay,
 * a closing one is told its data is scheduled for deletion and how to stop that.
 * Passing the raw status rather than a `TenantStanding` is what preserves the
 * distinction — `tenantStandingOf` folds them together, and this must not.
 */
export function resolveHostGate(status: SubscriptionStatus | string | null | undefined): HostGate {
  /**
   * Never configured. Read-only, and the billing lane stays open — which is the
   * whole point: the one action that resolves this state has to be reachable
   * from inside it.
   *
   * Reported as its own reason rather than folded into `suspended` for the same
   * reason `closing` is: the copy cannot be shared. "Your studio is paused, pay
   * to restore" is wrong in both directions for someone who never started —
   * nothing was taken away, and there is no arrears to settle. They are told to
   * finish setting up.
   *
   * Checked FIRST so it cannot be mistaken for a lapse by a later branch.
   */
  if (status === "incomplete") {
    return { readOnly: true, blocked: false, billingWritable: true, reason: "setup" };
  }
  if (status === "closing") {
    return { readOnly: true, blocked: false, billingWritable: true, reason: "closing" };
  }
  // Blocked outranks suspended: it is the same debt, one rung further along.
  if (status === "blocked") {
    return { readOnly: true, blocked: true, billingWritable: true, reason: "blocked" };
  }
  if (tenantStandingOf(status) === "suspended") {
    return { readOnly: true, blocked: false, billingWritable: true, reason: "suspended" };
  }
  if (status === "past_due") {
    // Grace is FULL service. That is the entire purpose of a grace window: the
    // owner gets dunning notices, and nothing about the tenant changes for anyone
    // until the window closes. Reported so the owner's UI can show the warning.
    return { readOnly: false, blocked: false, billingWritable: true, reason: "grace" };
  }
  return { readOnly: false, blocked: false, billingWritable: true, reason: "ok" };
}

/**
 * A gate reason back to a tenant standing, for the app.
 *
 * The client never sees the raw subscription status — `/api/host` hands it the
 * gate — so this is how the UI feeds the same tenant axis into `resolveStanding`
 * that the server feeds it from `subscriptions.status`. Both paths therefore agree
 * by construction rather than by two hand-written mappings staying in step.
 */
export function tenantStandingOfGate(reason: HostGateReason | null | undefined): TenantStanding {
  if (reason === "blocked") return "blocked";
  if (reason === "suspended" || reason === "closing" || reason === "setup") return "suspended";
  if (reason === "grace") return "grace";
  return "ok";
}

/** Every axis value, for exhaustive enumeration in tests and docs. */
export const STANDING_AXES = {
  membership: ["none", "pending_signup", "active", "archived"] as Membership[],
  accessActive: [true, false],
  accessRequired: [true, false],
  tenant: ["ok", "grace", "suspended", "blocked"] as TenantStanding[],
};
