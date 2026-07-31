/**
 * What happens to a CUSTOMER whose access lapsed — the tenant's own policy.
 *
 * This is the second of two independent rails and they must not be confused:
 *
 *   Kova → tenant   the tenant has not paid Kova. Kova decides. Read-only at 7
 *                   days, blocked at 30, purged at 37. `@4dl/tenancy`
 *                   `@4dl/billing` dunning.ts, `DUNNING_DAYS`.
 *   tenant → customer THIS file. The customer's package ran out. The TENANT decides,
 *                   because it is their commercial relationship, not ours.
 *
 * A tenant that coaches athletes between seasons wants a lapsed customer to keep
 * their history and come back. A tenant running a 6-week challenge wants the
 * seat freed the moment it ends. Both are legitimate, so the policy is a setting
 * rather than a hard-coded rule.
 *
 * ── The four outcomes ──
 *
 *   read_only  they keep the app and their history, and can buy again. The
 *              gentlest, and the default: a lapsed customer is a returning
 *              customer until the tenant says otherwise.
 *   blocked    the app is replaced by the storefront. Still their data, still
 *              buyable — the tenant just will not let them use it meanwhile.
 *   archive    off the roster, history kept. HOLDS THE SEAT.
 *   delete     record and data removed. FREES THE SEAT.
 *
 * ── The seat rule is the one people get wrong ──
 *
 * Archiving keeps the customer's row, so it keeps occupying a licensed seat;
 * deleting removes it and frees one. A tenant at its plan's customer limit that
 * archives everyone will hit the limit and not understand why, so both the
 * setting copy and this comment say it out loud.
 *
 * ── Nothing here is instant ──
 *
 * `graceDays` runs from the day access lapsed, and `archive`/`delete` are
 * DESTRUCTIVE, so they get a floor: a tenant cannot configure same-day deletion
 * of a paying customer who was one day late. See `MIN_DESTRUCTIVE_GRACE_DAYS`.
 */

export const LAPSE_ACTIONS = ["read_only", "blocked", "archive", "delete"] as const;
export type LapseAction = (typeof LAPSE_ACTIONS)[number];

export interface LapsePolicy {
  action: LapseAction;
  /** Days after access lapsed before the action applies. */
  graceDays: number;
}

/**
 * The gentlest option, on purpose. A tenant that never opens this setting should
 * not be quietly deleting its lapsed customers, so the default is the one outcome
 * that loses nobody anything.
 */
export const DEFAULT_LAPSE_POLICY: LapsePolicy = { action: "read_only", graceDays: 7 };

/** Irreversible from the client's point of view — these get the longer floor. */
export const DESTRUCTIVE_ACTIONS: readonly LapseAction[] = ["archive", "delete"];
export const isDestructive = (a: LapseAction): boolean => DESTRUCTIVE_ACTIONS.includes(a);

/** A studio may not archive or delete a lapsed client inside this window. */
export const MIN_DESTRUCTIVE_GRACE_DAYS = 14;
export const MAX_GRACE_DAYS = 365;

/**
 * The COPY for each action lives in the app, not here.
 *
 * "Keeps using a client seat" versus "Keeps using a licence" is the app's
 * vocabulary, and a settings screen that reads a shared package's wording is a
 * settings screen that will one day say the wrong noun to a real customer. The
 * app supplies a `label` resolver; everything below is mechanism.
 */
export type LapseLabels = (action: LapseAction) => string;

/** Fallback labels, so an app that has not supplied copy still produces a
 *  readable error rather than `undefined needs at least 14 days' grace`. */
export const DEFAULT_LAPSE_LABELS: LapseLabels = (a) =>
  ({ read_only: "Keep read-only", blocked: "Show the storefront", archive: "Archive them", delete: "Delete their record" })[a];

export interface LapseCheck {
  ok: boolean;
  /** Why not, ready to show under the field. */
  error?: string;
}

/** Validate a policy before it is stored. */
export function checkLapsePolicy(p: LapsePolicy, label: LapseLabels = DEFAULT_LAPSE_LABELS): LapseCheck {
  if (!LAPSE_ACTIONS.includes(p.action)) return { ok: false, error: "Unknown action." };
  if (!Number.isInteger(p.graceDays) || p.graceDays < 0) return { ok: false, error: "Grace must be a whole number of days." };
  if (p.graceDays > MAX_GRACE_DAYS) return { ok: false, error: `Grace can't exceed ${MAX_GRACE_DAYS} days.` };
  if (isDestructive(p.action) && p.graceDays < MIN_DESTRUCTIVE_GRACE_DAYS) {
    return {
      ok: false,
      error: `${label(p.action)} needs at least ${MIN_DESTRUCTIVE_GRACE_DAYS} days' grace — it can't be undone by the customer.`,
    };
  }
  return { ok: true };
}

/**
 * Has this customer's lapse reached the tenant's threshold?
 *
 * `lapsedDays` is days since access ended. Returns the action to apply, or null
 * while still inside grace — so the sweep is a filter over this one predicate
 * and cannot drift from what the settings screen promised.
 */
export function lapseActionDue(p: LapsePolicy, lapsedDays: number): LapseAction | null {
  if (lapsedDays < p.graceDays) return null;
  return p.action;
}

/**
 * How a lapsed customer's own standing reads under a policy, for the app.
 *
 * `read_only` and `blocked` are STATES the customer sits in indefinitely, so they
 * have to be renderable. `archive` and `delete` are EVENTS the sweep performs —
 * once done, the customer's membership answers for them and this is not consulted.
 */
export function lapseStanding(action: LapseAction | null): { canWrite: boolean; lockedToStorefront: boolean } {
  if (action === "blocked") return { canWrite: false, lockedToStorefront: true };
  if (action === "read_only") return { canWrite: false, lockedToStorefront: false };
  // Inside grace, or an event already applied: nothing extra to impose here.
  return { canWrite: true, lockedToStorefront: false };
}
