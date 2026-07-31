/**
 * WHAT A PLAN INCLUDES — this app's entitlement registry, on `@4dl/billing`'s
 * engine.
 *
 * The engine owns the resolution: merge a stored blob onto the free baseline,
 * apply grants (which RAISE a ceiling and never lower one), and zero everything
 * out for a suspended tenant. It cannot own the KEYS — `staffSeats` and
 * `subjects` mean nothing to it, and a warehouse app would have `locations` and
 * `skus`.
 *
 * Two rules the shape enforces:
 *
 *   quotas    a number. `-1` is UNLIMITED, and it always wins a merge.
 *   features  a boolean. A feature nobody sells yet is `false` here, not absent
 *             — an absent key reads as "off" too, but only by accident, and the
 *             conformance test cannot see it.
 */

import { bindEntitlements, type EntitlementShape } from "@4dl/billing";

export interface AppEntitlements extends EntitlementShape {
  quotas: {
    /** Owner + staff. The customer role does not consume one. */
    staffSeats: number;
    /** The individuals a tenant may have on its books. */
    subjects: number;
    /** Megabytes in the media bucket. `-1` = unlimited. */
    storageMb: number;
  };
  features: {
    /** Bring-your-own domain (Cloudflare for SaaS). */
    customDomain: boolean;
    /** The AI suite. */
    ai: boolean;
  };
  aiCredits: { monthlyGrant: number };
  trialDays: number;
}

/**
 * The FREE baseline — what a tenant gets with no plan row at all.
 *
 * Every key must appear. The engine merges a stored blob ONTO this, key by key,
 * so a key missing here can never be set by a plan.
 */
export const FREE: AppEntitlements = {
  quotas: { staffSeats: 1, subjects: 5, storageMb: 100 },
  features: { customDomain: false, ai: false },
  aiCredits: { monthlyGrant: 0 },
  trialDays: 0,
};

/** The ENGINE: resolve a stored blob onto FREE, layer grants, clamp on status. */
export const entitlements = bindEntitlements<AppEntitlements>(FREE);

/**
 * The D1 lookups. Thin on purpose — the engine is shared, the QUERY is the
 * app's, because which table holds a tenant's plan is a schema decision.
 *
 * `clamp` is the one place delinquency bites: every feature gate and every quota
 * check resolves through here, so a suspended tenant falls back to FREE
 * everywhere at once rather than in each gate separately.
 */
export async function tenantEntitlements(db: D1Database, tenantId: string): Promise<AppEntitlements> {
  const sub = await db
    .prepare("SELECT plan_id, status, overrides_json FROM subscriptions WHERE tenant_id = ?")
    .bind(tenantId)
    .first<{ plan_id: string | null; status: string | null; overrides_json: string | null }>()
    .catch(() => null);
  const plan = sub?.plan_id
    ? await db.prepare("SELECT entitlements_json FROM plans WHERE id = ?").bind(sub.plan_id).first<{ entitlements_json: string | null }>().catch(() => null)
    : null;
  const resolved = entitlements.merge(entitlements.resolve(plan?.entitlements_json), sub?.overrides_json);
  return entitlements.clamp(resolved, sub?.status ?? "active");
}

/** True when the tenant's plan (or a grant) includes `feature`. */
export async function hasFeature(db: D1Database, tenantId: string, feature: keyof AppEntitlements["features"]): Promise<boolean> {
  return (await tenantEntitlements(db, tenantId)).features[feature];
}

/**
 * Is ONE MORE of `quota` allowed? `-1` is unlimited.
 *
 * Note what this deliberately does NOT do: it never looks at rows that already
 * exist. Call it only on a CREATE. A tenant left over a lowered ceiling keeps
 * every existing row fully readable and writable; they simply cannot add
 * another. Nothing should ever archive, hide or brick an over-quota row.
 */
export async function withinQuota(
  db: D1Database,
  tenantId: string,
  quota: keyof AppEntitlements["quotas"],
  currentCount: number,
): Promise<{ ok: boolean; max: number }> {
  const max = (await tenantEntitlements(db, tenantId)).quotas[quota];
  if (max < 0) return { ok: true, max };
  return { ok: currentCount < max, max };
}
