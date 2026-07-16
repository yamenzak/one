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

import { resolveClientFlags, parseFlagsJson, type Budget, type ClientFlags } from "@mossa/domain";
import type { Context } from "hono";
import type { AppEnv } from "./auth-context.js";
import { tenantEntitlements } from "./billing-store.js";
import { parseJson } from "./db.js";

/** Resolve a client's effective flags from their current subscription (if any). */
export async function resolveClientFlagsFor(db: D1Database, tenantId: string, clientId: string): Promise<ClientFlags> {
  const entitlements = await tenantEntitlements(db, tenantId);
  const sub = await db
    .prepare("SELECT budgets_json, flags_json, package_id FROM client_subscriptions WHERE client_id = ? AND status IN ('active','paused') ORDER BY started_at DESC LIMIT 1")
    .bind(clientId)
    .first<{ budgets_json: string | null; flags_json: string | null; package_id: string | null }>();
  let packageFlags = null;
  if (sub?.package_id) {
    const pkg = await db.prepare("SELECT flags_json FROM packages WHERE id = ?").bind(sub.package_id).first<{ flags_json: string | null }>();
    packageFlags = parseFlagsJson(pkg?.flags_json);
  }
  return resolveClientFlags({
    packageFlags,
    subscriptionFlags: parseFlagsJson(sub?.flags_json),
    budgets: sub ? parseJson<Budget[]>(sub.budgets_json, []) : null,
    entitlements,
    nowIso: new Date().toISOString(),
  });
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
