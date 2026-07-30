/**
 * What happens to a CLIENT whose access lapsed — the studio's own policy.
 *
 * This is the second of two independent rails and they must not be confused:
 *
 *   Kova → tenant   the studio has not paid Kova. Kova decides. Read-only at 7
 *                   days, blocked at 30, purged at 37. `@4dl/tenancy`
 *                   `standing.ts`, `DUNNING_DAYS`.
 *   tenant → client THIS file. The client's package ran out. The STUDIO decides,
 *                   because it is their commercial relationship, not ours.
 *
 * A studio that coaches athletes between seasons wants a lapsed client to keep
 * their history and come back. A studio running a 6-week challenge wants the
 * seat freed the moment it ends. Both are legitimate, so the policy is a setting
 * rather than a hard-coded rule.
 *
 * ── The four outcomes ──
 *
 *   read_only  they keep the app and their history, and can buy again. The
 *              gentlest, and the default: a lapsed client is a returning
 *              customer until the studio says otherwise.
 *   blocked    the app is replaced by the storefront. Still their data, still
 *              buyable — the studio just will not let them use it meanwhile.
 *   archive    off the roster, history kept. HOLDS THE SEAT.
 *   delete     record and data removed. FREES THE SEAT.
 *
 * ── The seat rule is the one people get wrong ──
 *
 * Archiving keeps the client's row, so it keeps occupying a licensed seat;
 * deleting removes it and frees one. A studio at its plan's client limit that
 * archives everyone will hit the limit and not understand why, so both the
 * setting copy and this comment say it out loud.
 *
 * ── Nothing here is instant ──
 *
 * `graceDays` runs from the day access lapsed, and `archive`/`delete` are
 * DESTRUCTIVE, so they get a floor: a studio cannot configure same-day deletion
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
 * The gentlest option, on purpose. A studio that never opens this setting should
 * not be quietly deleting its lapsed clients, so the default is the one outcome
 * that loses nobody anything.
 */
export const DEFAULT_LAPSE_POLICY: LapsePolicy = { action: "read_only", graceDays: 7 };

/** Irreversible from the client's point of view — these get the longer floor. */
export const DESTRUCTIVE_ACTIONS: readonly LapseAction[] = ["archive", "delete"];
export const isDestructive = (a: LapseAction): boolean => DESTRUCTIVE_ACTIONS.includes(a);

/** A studio may not archive or delete a lapsed client inside this window. */
export const MIN_DESTRUCTIVE_GRACE_DAYS = 14;
export const MAX_GRACE_DAYS = 365;

export interface LapseMeta {
  label: string;
  /** What the client experiences, in their words — this is the setting's copy. */
  effect: string;
  /** The seat consequence, or null when the seat is untouched. */
  seat: string | null;
  destructive: boolean;
}

export const LAPSE_META: Record<LapseAction, LapseMeta> = {
  read_only: {
    label: "Keep read-only",
    effect: "They keep the app and their history, but can't log anything new until they renew.",
    seat: null,
    destructive: false,
  },
  blocked: {
    label: "Show the storefront",
    effect: "The app is replaced by your packages until they buy again. Their history is kept.",
    seat: null,
    destructive: false,
  },
  archive: {
    label: "Archive them",
    effect: "They come off your roster and can only read their history. You can reactivate them any time.",
    seat: "Keeps using a client seat",
    destructive: true,
  },
  delete: {
    label: "Delete their record",
    effect: "Their record and everything in it is removed. This cannot be undone.",
    seat: "Frees a client seat",
    destructive: true,
  },
};

export interface LapseCheck {
  ok: boolean;
  /** Why not, ready to show under the field. */
  error?: string;
}

/** Validate a policy before it is stored. */
export function checkLapsePolicy(p: LapsePolicy): LapseCheck {
  if (!LAPSE_ACTIONS.includes(p.action)) return { ok: false, error: "Unknown action." };
  if (!Number.isInteger(p.graceDays) || p.graceDays < 0) return { ok: false, error: "Grace must be a whole number of days." };
  if (p.graceDays > MAX_GRACE_DAYS) return { ok: false, error: `Grace can't exceed ${MAX_GRACE_DAYS} days.` };
  if (isDestructive(p.action) && p.graceDays < MIN_DESTRUCTIVE_GRACE_DAYS) {
    return {
      ok: false,
      error: `${LAPSE_META[p.action].label} needs at least ${MIN_DESTRUCTIVE_GRACE_DAYS} days' grace — it can't be undone by the client.`,
    };
  }
  return { ok: true };
}

/**
 * Has this client's lapse reached the studio's threshold?
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
 * How a lapsed client's own standing reads under a policy, for the app.
 *
 * `read_only` and `blocked` are STATES the client sits in indefinitely, so they
 * have to be renderable. `archive` and `delete` are EVENTS the sweep performs —
 * once done, the client's membership answers for them and this is not consulted.
 */
export function lapseStanding(action: LapseAction | null): { canWrite: boolean; lockedToStorefront: boolean } {
  if (action === "blocked") return { canWrite: false, lockedToStorefront: true };
  if (action === "read_only") return { canWrite: false, lockedToStorefront: false };
  // Inside grace, or an event already applied: nothing extra to impose here.
  return { canWrite: true, lockedToStorefront: false };
}
