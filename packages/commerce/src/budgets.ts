/**
 * THE ACCESS ECONOMY — pure budget math, no I/O, no `Date.now()`.
 *
 * A tenant sells TIMED ACCESS to a capability: "12 weeks of the training plan",
 * "a year of the label scanner". What is being sold is the app's vocabulary and
 * arrives as the `F` type parameter; the arithmetic below is not.
 *
 * A client subscription carries `budgets[]`, each with its own `startedAt` /
 * `expiresAt` (ISO instants). **Days remaining are always derived from
 * `expiresAt` at read time — there are no counters and no cron.** The route
 * layer reconciles status lazily on read (`isFullyExpired` -> flip to expired).
 *
 * Repeat purchases QUEUE, never sum: a new budget starts at
 * max(now, latest active expiry for that feature scope) so buying twice
 * extends the runway instead of pooling days (ByShujaa's
 * `computeBudgetStart`, kept).
 */

/**
 * What a budget grants access to.
 *
 * The app supplies its own union — Kova's is `"workout" | "meal" | "all"` — and
 * one member is the WILDCARD that satisfies every scope. Modelled as a plain
 * string here so this package carries no product nouns; the app narrows it.
 */
export type BudgetFeature = string;

/** The scope that satisfies every other. Apps that want a different wildcard
 *  name pass it explicitly; nothing else here hard-codes it. */
export const ALL_FEATURES = "all";

export interface Budget {
  feature: BudgetFeature;
  /** Days originally purchased (for display; never used to derive remaining). */
  daysTotal: number;
  startedAt: string; // ISO instant
  expiresAt: string; // ISO instant
}

export interface AddOnBalance {
  addOnTypeId: string;
  quantityTotal: number;
  quantityUsed: number;
}

const DAY_MS = 86_400_000;

const t = (iso: string): number => Date.parse(iso);

/** A budget is active at `now` when now ∈ [startedAt, expiresAt). */
export function isBudgetActive(b: Budget, nowIso: string): boolean {
  const now = t(nowIso);
  return t(b.startedAt) <= now && now < t(b.expiresAt);
}

/** Budgets covering `feature` (an `all` budget covers everything). */
export function budgetsForFeature(budgets: Budget[], feature: BudgetFeature, wildcard = ALL_FEATURES): Budget[] {
  return budgets.filter((b) => b.feature === feature || b.feature === wildcard);
}

export function hasActiveBudget(budgets: Budget[], feature: BudgetFeature, nowIso: string, wildcard = ALL_FEATURES): boolean {
  return budgetsForFeature(budgets, feature).some((b) => isBudgetActive(b, nowIso));
}

/**
 * Latest expiry for a feature, counting queued (future) budgets — this is the
 * client's real runway end for that feature. Null when nothing covers it.
 */
export function latestExpiryForFeature(
  budgets: Budget[],
  feature: BudgetFeature,
  nowIso: string,
): string | null {
  const now = t(nowIso);
  let latest: number | null = null;
  for (const b of budgetsForFeature(budgets, feature)) {
    const exp = t(b.expiresAt);
    if (exp <= now) continue; // fully lapsed
    if (latest === null || exp > latest) latest = exp;
  }
  return latest === null ? null : new Date(latest).toISOString();
}

/** Whole days remaining for a feature (ceil — a partial day still counts). */
export function daysRemainingForFeature(
  budgets: Budget[],
  feature: BudgetFeature,
  nowIso: string,
): number {
  const latest = latestExpiryForFeature(budgets, feature, nowIso);
  if (!latest) return 0;
  return Math.max(0, Math.ceil((t(latest) - t(nowIso)) / DAY_MS));
}

/**
 * Max days remaining across every feature — the headline number.
 *
 * Derived from the BUDGETS THEMSELVES rather than from a feature registry, so
 * this needs no configuration and cannot go stale when an app adds a scope.
 */
export function overallDaysRemaining(budgets: Budget[], nowIso: string): number {
  const scopes = new Set(budgets.map((b) => b.feature));
  return Math.max(...[...scopes].map((f) => daysRemainingForFeature(budgets, f, nowIso)), 0);
}

/** True when every budget has lapsed — the lazy-reconcile trigger. */
export function isFullyExpired(budgets: Budget[], nowIso: string): boolean {
  if (budgets.length === 0) return true;
  const now = t(nowIso);
  return budgets.every((b) => t(b.expiresAt) <= now);
}

/**
 * Queue-not-sum: where a newly purchased budget for `feature` starts.
 * = max(now, latest not-yet-lapsed expiry among budgets covering the feature,
 *   and — for an `all` purchase — among ALL budgets, since it supersedes each).
 */
export function computeBudgetStart(
  existing: Budget[],
  feature: BudgetFeature,
  nowIso: string,
  wildcard = ALL_FEATURES,
): string {
  const pool = feature === wildcard ? existing : budgetsForFeature(existing, feature, wildcard);
  let start = t(nowIso);
  for (const b of pool) {
    const exp = t(b.expiresAt);
    if (exp > start) start = exp;
  }
  return new Date(start).toISOString();
}

export interface PackageBudgetSpec {
  feature: BudgetFeature;
  days: number;
}

/**
 * Expand a WILDCARD spec into one spec per concrete scope so each queues behind
 * ITS OWN runway.
 *
 * A single queued wildcard budget starts behind the LONGEST existing runway,
 * which strands every shorter-runway scope: with scope A active now→day 40 and
 * scope B not covered at all, a wildcard purchase would start at day 40 and
 * leave B — which the buyer just paid for — uncovered until then. Per-scope
 * queueing fills the gap (B starts now) while still extending, not pooling, A.
 *
 * `scopes` is the app's concrete list, wildcard excluded.
 */
function expandSpecs(specs: PackageBudgetSpec[], scopes: readonly BudgetFeature[], wildcard: BudgetFeature): PackageBudgetSpec[] {
  const out: PackageBudgetSpec[] = [];
  for (const s of specs) {
    if (s.feature === wildcard) for (const f of scopes) out.push({ feature: f, days: s.days });
    else out.push(s);
  }
  return out;
}

/**
 * Budgets created by purchasing a package — each queued independently.
 *
 * `scopes` is the app's concrete scope list (wildcard excluded); it is only
 * consulted to expand a wildcard spec.
 */
export function buildBudgetsForPurchase(
  existing: Budget[],
  specs: PackageBudgetSpec[],
  nowIso: string,
  scopes: readonly BudgetFeature[] = [],
  wildcard = ALL_FEATURES,
): Budget[] {
  const out: Budget[] = [];
  // Work against a growing pool so two same-scope specs in one package queue
  // behind each other too. Wildcard specs are expanded per-scope first.
  const pool = [...existing];
  for (const spec of expandSpecs(specs, scopes, wildcard)) {
    if (spec.days <= 0) continue;
    const startedAt = computeBudgetStart(pool, spec.feature, nowIso, wildcard);
    const expiresAt = new Date(t(startedAt) + spec.days * DAY_MS).toISOString();
    const b: Budget = { feature: spec.feature, daysTotal: spec.days, startedAt, expiresAt };
    out.push(b);
    pool.push(b);
  }
  return out;
}

/** Merge purchased add-on quantities into existing balances (sum, keyed by type). */
export function mergeAddOnBalances(
  existing: AddOnBalance[],
  purchased: { addOnTypeId: string; quantity: number }[],
): AddOnBalance[] {
  const map = new Map<string, AddOnBalance>();
  for (const b of existing) map.set(b.addOnTypeId, { ...b });
  for (const p of purchased) {
    if (p.quantity <= 0) continue;
    const cur = map.get(p.addOnTypeId);
    if (cur) cur.quantityTotal += p.quantity;
    else map.set(p.addOnTypeId, { addOnTypeId: p.addOnTypeId, quantityTotal: p.quantity, quantityUsed: 0 });
  }
  return [...map.values()];
}

export function remainingAddOnQuantity(balances: AddOnBalance[], addOnTypeId: string): number {
  const b = balances.find((x) => x.addOnTypeId === addOnTypeId);
  return b ? Math.max(0, b.quantityTotal - b.quantityUsed) : 0;
}

/**
 * Redemption-code top-up: extends the feature's runway by `days`, queued at the
 * current runway end (or starting now if nothing active).
 *
 * FOOTGUN: for the WILDCARD scope this queues a SINGLE wildcard budget behind
 * the longest existing runway of ANY scope, which strands every shorter-runway
 * scope (the exact behaviour `buildBudgetsForPurchase` corrects by expanding the
 * wildcard per scope). Redemption routes therefore build their budgets with
 * `buildBudgetsForPurchase`, NOT this helper. Keep this only for a single
 * explicit (non-wildcard) scope; `days` is floored to a
 * non-negative whole number so a bad caller can't mint a negative-length budget.
 */
export function buildRedemptionBudget(
  existing: Budget[],
  feature: BudgetFeature,
  days: number,
  nowIso: string,
): Budget {
  const d = Math.max(0, Math.floor(days));
  const startedAt = computeBudgetStart(existing, feature, nowIso);
  return {
    feature,
    daysTotal: d,
    startedAt,
    expiresAt: new Date(t(startedAt) + d * DAY_MS).toISOString(),
  };
}

/**
 * Days remaining PER SCOPE — the honest breakdown behind the headline.
 *
 * `overallDaysRemaining` is a MAX, which is right for "is this customer still a
 * customer" and misleading as a number on a screen: a client with 70 days of one
 * scope and none of another reads as "70 days left" while half of what they
 * bought has already lapsed. Every surface that shows the headline should be
 * able to show this next to it.
 */
export function daysByFeature(budgets: Budget[], scopes: readonly BudgetFeature[], nowIso: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of scopes) out[f] = daysRemainingForFeature(budgets, f, nowIso);
  return out;
}

/**
 * SET a scope's remaining days to exactly `days` — the correction primitive.
 *
 * Everything else in this file only ever ADDS runway, which is correct for
 * selling and useless for repair: when a defect has granted a client 210 days
 * they never bought, no amount of queueing fixes it. The operator needs to say
 * what the number IS.
 *
 * The rules, and why each one:
 *
 *   LAPSED BUDGETS ARE HISTORY.   Anything already expired at `now` is left
 *                                 untouched. It is the record of what was sold,
 *                                 it affects nothing, and rewriting it would
 *                                 destroy the only evidence of what went wrong.
 *   LIVE AND QUEUED ARE REPLACED. Every not-yet-lapsed budget covering the scope
 *                                 — including ones queued to start later — is
 *                                 removed and replaced by ONE budget running
 *                                 from now. Trimming the last one instead would
 *                                 leave a client at "30 days" whose runway is
 *                                 three stacked fragments, and the next purchase
 *                                 would queue behind the wrong end.
 *   ZERO IS ALLOWED, AND MEANS ZERO. Setting 0 removes the scope's live runway
 *                                 outright rather than minting an already-
 *                                 expired budget.
 *   A WILDCARD BUDGET IS SPLIT.   A legacy `all` budget covers this scope AND
 *                                 the others; it cannot simply be deleted. It is
 *                                 re-issued for the scopes NOT being set, so
 *                                 correcting one scope never silently revokes
 *                                 another.
 *
 * Pure, and `days` is floored to a non-negative whole number.
 */
export function setRemainingDays(
  budgets: Budget[],
  feature: BudgetFeature,
  days: number,
  nowIso: string,
  scopes: readonly BudgetFeature[] = [],
  wildcard = ALL_FEATURES,
): Budget[] {
  const d = Math.max(0, Math.floor(days));
  const now = t(nowIso);
  const out: Budget[] = [];

  for (const b of budgets) {
    const lapsed = t(b.expiresAt) <= now;
    // History, or a scope this call is not about: keep verbatim.
    if (lapsed || (b.feature !== feature && b.feature !== wildcard)) { out.push(b); continue; }
    if (b.feature === feature) continue; // replaced below
    // A live wildcard budget: it also covers the OTHER scopes, and setting this
    // one must not take those away. Re-issue it for each of them, unchanged.
    for (const other of scopes) {
      if (other === feature) continue;
      out.push({ ...b, feature: other });
    }
  }

  if (d > 0) {
    out.push({ feature, daysTotal: d, startedAt: nowIso, expiresAt: new Date(now + d * DAY_MS).toISOString() });
  }
  return out;
}
