/**
 * Client-flag resolution + enforcement (SPEC §7).
 *
 * The single server-side path that turns a client's subscription into effective
 * `ClientFlags` (package flags → subscription flags → budget gating → ∩ tenant
 * entitlements), shared by the /context bundle and the per-route capability
 * gate. `requireClientFlag` is the counterpart to billing-store's `hasFeature`:
 * it 403s when the client's package doesn't include a capability — but ONLY for
 * the client persona. Staff act with full coaching powers and are never limited
 * by what a client bought (AI still meters against the tenant's own credits).
 */

import { resolveClientFlags, unionClientFlags, parseFlagsJson, gateSpecOf, type Budget, type ClientFlags, type Entitlements, type FeatureKey } from "@kova/domain";
import type { Context } from "hono";
import type { AppEnv } from "./auth-context.js";
import { tenantEntitlements, hasFeature } from "./billing-store.js";
import { parseJson } from "./db.js";

/**
 * The statuses that count as a LIVE access row — what the enforcing gate honours.
 * `paused` still holds capability (the budget clock is what expires access).
 */
export const LIVE_ACCESS_STATUSES = ["active", "paused"] as const;
/**
 * Live + `expired` — for the read-only access SUMMARIES (the client's Today
 * banner, the coach's attention queue) which must still describe a lapsed
 * subscriber ("expired", "0 days left") rather than look like a client who never
 * bought anything.
 */
export const REPORTED_ACCESS_STATUSES = ["active", "paused", "expired"] as const;

export interface ClientAccessRow {
  /** The row's own id — what an override is written against. */
  id: string;
  status: string;
  package_id: string | null;
  budgets_json: string | null;
  /** A SNAPSHOT of the package's flags, copied at grant time (see the grant
   *  path in commerce-routes.ts). Not a diff, and not an override. */
  flags_json: string | null;
  /** The sparse per-client override a staff member set on THIS row. */
  overrides_json: string | null;
}

/**
 * Load EVERY access row a client holds (not just the newest).
 *
 * This is the single read behind all three access surfaces. A client can hold
 * more than one row at a time by design — `grantClientPackage` gives every
 * Stripe subscription its OWN row while one-time purchases fold into the active
 * non-recurring row — so a client on a monthly membership who also buys a
 * one-time package legitimately has TWO. `ORDER BY started_at DESC LIMIT 1`
 * (what every caller used to do) honoured only one of them: the other row's
 * flags AND its paid-for budget days went dark, while /context summed days
 * across all rows — so the banner promised access the routes then 403'd.
 *
 * Tenant-scoped on purpose: a mis-tenanted row (a stale/foreign write) must
 * never be able to grant access inside this tenant.
 */
export async function loadClientAccessRows(
  db: D1Database,
  tenantId: string,
  clientId: string,
  statuses: readonly string[] = LIVE_ACCESS_STATUSES,
): Promise<ClientAccessRow[]> {
  const ph = statuses.map(() => "?").join(",");
  const r = await db
    .prepare(`SELECT id, status, package_id, budgets_json, flags_json, overrides_json FROM subject_subscriptions WHERE subject_id = ? AND tenant_id = ? AND status IN (${ph}) ORDER BY started_at DESC`)
    .bind(clientId, tenantId, ...statuses)
    .all<ClientAccessRow>();
  return r.results ?? [];
}

/** The runway a client actually holds: every row's budgets concatenated. Days
 *  STACK across packages (BILLING-PLAN §7), and the budget engine derives
 *  remaining days / expiry from each entry's own `expiresAt`, so concatenating
 *  is exactly right — no row's paid days are hidden behind another's. */
export function accessBudgetsOf(rows: ClientAccessRow[]): Budget[] {
  return rows.flatMap((r) => parseJson<Budget[]>(r.budgets_json, []));
}

/** Resolve a client's effective flags across EVERY live subscription row. */
export async function resolveClientFlagsFor(db: D1Database, tenantId: string, clientId: string): Promise<ClientFlags> {
  const entitlements = await tenantEntitlements(db, tenantId);
  const rows = await loadClientAccessRows(db, tenantId, clientId);
  const nowIso = new Date().toISOString();
  // No row at all ⇒ `budgets: null`, the resolver's documented "no subscription
  // context" signal, which SKIPS budget gating (a generous tenancy that never
  // sells packages). This is deliberately NOT `[]` — that means "a subscriber
  // whose budgets all lapsed" and correctly revokes plan access.
  if (rows.length === 0) {
    return resolveClientFlags({ packageFlags: null, subscriptionFlags: null, budgets: null, entitlements, nowIso });
  }
  // Resolve each row on its OWN package flags + overrides + budgets, then union:
  // the client keeps a capability for as long as ANY live package grants it.
  const resolved: ClientFlags[] = [];
  for (const row of rows) {
    let packageFlags = null;
    if (row.package_id) {
      // Tenant-scoped: never inherit another tenant's package flags.
      const pkg = await db.prepare("SELECT flags_json FROM packages WHERE id = ? AND tenant_id = ?").bind(row.package_id, tenantId).first<{ flags_json: string | null }>();
      packageFlags = parseFlagsJson(pkg?.flags_json);
    }
    resolved.push(
      resolveClientFlags({
        packageFlags,
        subscriptionFlags: parseFlagsJson(row.flags_json),
        overrideFlags: parseFlagsJson(row.overrides_json),
        budgets: parseJson<Budget[]>(row.budgets_json, []),
        entitlements,
        nowIso,
      }),
    );
  }
  return resolved.reduce(unionClientFlags);
}

/**
 * Gate a route on a client capability. Returns a 403 Response when the flag is
 * off, else null (proceed). No-op for staff callers — a client's package only
 * constrains the CLIENT's own self-service actions, not the coach's.
 */
export async function requireClientFlag(
  c: Context<AppEnv>,
  clientId: string,
  flag: keyof ClientFlags,
): Promise<Response | null> {
  if (c.get("role") !== "client") return null; // staff aren't limited by client packages
  const tenantId = c.get("tenantId");
  if (!tenantId) return null;
  const flags = await resolveClientFlagsFor(c.env.DB, tenantId, clientId);
  if (!flags[flag]) return c.json({ error: "not included in your current plan", flag }, 403);
  return null;
}

/**
 * Gate a route on a PLATFORM entitlement (what the tenant bought from Kova).
 * The single fetch-and-gate helper — resolves the tenant's entitlements (status-
 * clamped) and 403s with a uniform shape when the feature isn't in the plan.
 * Companion to `requireClientFlag`; replaces the hand-rolled
 * `tenantEntitlements()` + `if (!ent.features.x)` copies. Returns null to proceed.
 */
export async function requireFeature(
  c: Context<AppEnv>,
  feature: keyof Entitlements["features"],
): Promise<Response | null> {
  const tenantId = c.get("tenantId");
  if (!tenantId) return c.json({ error: "no tenant" }, 403);
  if (!(await hasFeature(c.env.DB, tenantId, feature))) {
    return c.json({ error: `${feature} not in your plan`, feature }, 403);
  }
  return null;
}

/**
 * Gate a route on a whole FEATURE, deriving its enforcement from the spec — the
 * tenant's platform entitlement AND (for a client caller) the client capability
 * flag, in one call. This is the composed gate the registry exists to enable:
 * instead of hand-pairing `requireFeature("aiSuite")` + `requireClientFlag(
 * "aiMealTools")` at each site, the pairing lives in FEATURES and can't drift.
 * Pass the clientId when the feature is a per-client capability. Returns null to
 * proceed. (Staff callers skip the client-flag half — see requireClientFlag.)
 */
export async function gateFeature(
  c: Context<AppEnv>,
  feature: FeatureKey,
  clientId?: string,
): Promise<Response | null> {
  const gate = gateSpecOf(feature);
  if (gate.entitlement) {
    const r = await requireFeature(c, gate.entitlement);
    if (r) return r;
  }
  if (gate.clientFlag && clientId) {
    const r = await requireClientFlag(c, clientId, gate.clientFlag);
    if (r) return r;
  }
  return null;
}

/**
 * `gateFeature`'s SHAPING counterpart, for a route that answers with several
 * features in one payload.
 *
 * `/api/progress` is the case that forced it: one response carries the body,
 * training, nutrition and wellness lenses, and only the first three are sold.
 * A 403 is the wrong answer there — refusing the response takes the ungated
 * wellness and consistency lenses down with it — so the route serves what the
 * package includes and withholds the rest. The UI already hid those lenses;
 * until this existed, it hid them from the SCREEN while the wire still carried
 * every PR, every body-fat reading and every calorie day to a client whose
 * package excluded them. Hiding a tab is a layout decision, not enforcement.
 *
 * Returns a predicate over feature keys. Staff get `() => true`: a client's
 * package never bounds their coach.
 */
export async function featureShaper(
  c: Context<AppEnv>,
  clientId: string,
): Promise<(feature: FeatureKey) => boolean> {
  const tenantId = c.get("tenantId");
  if (c.get("role") !== "client" || !tenantId) return () => true;
  const [flags, entitlements] = await Promise.all([
    resolveClientFlagsFor(c.env.DB, tenantId, clientId),
    tenantEntitlements(c.env.DB, tenantId),
  ]);
  return (feature: FeatureKey) => {
    const gate = gateSpecOf(feature);
    if (gate.entitlement && !entitlements.features[gate.entitlement]) return false;
    if (gate.clientFlag && !flags[gate.clientFlag]) return false;
    return true;
  };
}
