/**
 * Promo codes (BLUEPRINT §25) — gift a full plan (comped) or top up credits.
 *
 * Two kinds:
 *   - `credits`: redeeming grants a one-time credit top-up (like a pack, free).
 *   - `plan`:    redeeming comps the tenant onto a plan for N months — this is
 *                how you gift the whole solution to a friend's business or spin
 *                up a sales demo account, with no Stripe subscription.
 *
 * The pure `validateRedemption` is the testable seam; `redeemPromo` wraps it
 * with the DB writes (increment counters, record the audit row).
 */

import { DEMO_TENANT } from "./db.js";
import { ensureBilling, getPlan, updateSubscription, type PromoRow } from "./billing-store.js";

export type PromoError =
  | "not_found"
  | "inactive"
  | "expired"
  | "exhausted"
  | "already_redeemed"
  | "bad_plan";

/** Pure gate: can `tenant` redeem `promo` right now, given prior redemptions? */
export function validateRedemption(
  promo: PromoRow | null,
  now: number,
  tenantRedemptions: number,
): { ok: true } | { ok: false; error: PromoError } {
  if (!promo) return { ok: false, error: "not_found" };
  if (!promo.active) return { ok: false, error: "inactive" };
  if (promo.expires_at && now > promo.expires_at) return { ok: false, error: "expired" };
  if (promo.max_redemptions != null && promo.redeemed_count >= promo.max_redemptions) return { ok: false, error: "exhausted" };
  const perTenant = promo.per_tenant_limit ?? 1;
  if (tenantRedemptions >= perTenant) return { ok: false, error: "already_redeemed" };
  return { ok: true };
}

export interface PromoInput {
  code: string;
  kind: "credits" | "plan";
  credits?: number;
  planId?: string;
  planMonths?: number;
  maxRedemptions?: number | null;
  perTenantLimit?: number | null;
  expiresAt?: number | null;
  note?: string;
}

export async function createPromo(db: D1Database, input: PromoInput): Promise<void> {
  await ensureBilling(db);
  await db
    .prepare(
      "INSERT INTO promo_codes (code, kind, credits, plan_id, plan_months, max_redemptions, redeemed_count, per_tenant_limit, expires_at, note, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 1, ?)",
    )
    .bind(
      input.code.trim().toUpperCase(),
      input.kind,
      input.kind === "credits" ? (input.credits ?? 0) : null,
      input.kind === "plan" ? (input.planId ?? null) : null,
      input.kind === "plan" ? (input.planMonths ?? 12) : null,
      input.maxRedemptions ?? null,
      input.perTenantLimit ?? 1,
      input.expiresAt ?? null,
      input.note ?? null,
      Date.now(),
    )
    .run();
}

export async function getPromo(db: D1Database, code: string): Promise<PromoRow | null> {
  await ensureBilling(db);
  return db.prepare("SELECT * FROM promo_codes WHERE code = ?").bind(code.trim().toUpperCase()).first<PromoRow>();
}

export async function listPromos(db: D1Database): Promise<PromoRow[]> {
  await ensureBilling(db);
  const res = await db.prepare("SELECT * FROM promo_codes ORDER BY created_at DESC").all<PromoRow>();
  return res.results ?? [];
}

export async function setPromoActive(db: D1Database, code: string, active: boolean): Promise<void> {
  await ensureBilling(db);
  await db.prepare("UPDATE promo_codes SET active = ? WHERE code = ?").bind(active ? 1 : 0, code.trim().toUpperCase()).run();
}

export interface RedeemResult {
  kind: "credits" | "plan";
  /** For a credits promo, how many credits were granted (caller tops up the DO). */
  credits?: number;
  planId?: string;
  planMonths?: number;
  note?: string;
}

/**
 * Redeem a code for `tenant`. On a `plan` promo this comps the subscription
 * here (no Stripe); on a `credits` promo it returns the amount so the caller
 * can top up the TenantBillingDO (the credit authority). Throws a `PromoError`
 * string on any gate failure.
 */
export async function redeemPromo(db: D1Database, code: string, tenantId = DEMO_TENANT): Promise<RedeemResult> {
  await ensureBilling(db);
  const promo = await getPromo(db, code);
  const priorRow = await db
    .prepare("SELECT COUNT(*) AS n FROM promo_redemptions WHERE code = ? AND tenant_id = ?")
    .bind(code.trim().toUpperCase(), tenantId)
    .first<{ n: number }>();
  const gate = validateRedemption(promo, Date.now(), priorRow?.n ?? 0);
  if (!gate.ok) throw new Error(gate.error);
  const p = promo!;

  if (p.kind === "plan") {
    const plan = await getPlan(db, p.plan_id ?? "");
    if (!plan) throw new Error("bad_plan" satisfies PromoError);
    const months = p.plan_months ?? 12;
    const periodEnd = Date.now() + months * 30 * 24 * 3600 * 1000;
    // Comped: active plan, exempt from dunning, no Stripe subscription.
    await updateSubscription(db, tenantId, {
      plan_id: plan.id,
      status: "active",
      comp: 1,
      current_period_end: periodEnd,
      past_due_at: null,
      suspend_at: null,
      delete_at: null,
      pending_plan_id: null,
    });
  }

  await recordRedemption(db, p, tenantId);
  return p.kind === "plan"
    ? { kind: "plan", planId: p.plan_id ?? undefined, planMonths: p.plan_months ?? undefined, note: p.note ?? undefined }
    : { kind: "credits", credits: p.credits ?? 0, note: p.note ?? undefined };
}

async function recordRedemption(db: D1Database, promo: PromoRow, tenantId: string): Promise<void> {
  const id = `red_${randomHex(10)}`;
  await db.batch([
    db
      .prepare("INSERT INTO promo_redemptions (id, code, tenant_id, kind, credits, plan_id, redeemed_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, promo.code, tenantId, promo.kind, promo.credits ?? null, promo.plan_id ?? null, Date.now()),
    db.prepare("UPDATE promo_codes SET redeemed_count = redeemed_count + 1 WHERE code = ?").bind(promo.code),
  ]);
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}
