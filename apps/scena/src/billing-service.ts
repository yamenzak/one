/**
 * Billing orchestration (BLUEPRINT §25) — ties the D1 catalog to the
 * TenantBillingDO credit authority and runs the payment lifecycle.
 *
 *  - grantForTenant: drop the plan's recurring monthly credit grant (idempotent
 *    per period), driven by the invoice.paid webhook or the monthly cron.
 *  - lifecycleSweep: the dunning state machine — active → past_due (grace) →
 *    suspended (playout gated) → auto-deleted after a configurable window.
 *    Comped/promo/gift plans are exempt.
 *  - identity: resolve the caller's email (Cloudflare Access header, or the
 *    dev OPERATOR_EMAIL) and the admin allowlist for the Admin UI gate.
 */

import type { Env } from "./env.js";
import { DEMO_TENANT } from "./db.js";
import { getSubscription, updateSubscription, getPlan, listSubscriptions, tenantEntitlements } from "./billing-store.js";
import { resolveEntitlements } from "./entitlements.js";
import { notifyAdmin, emailShell } from "./mailer.js";

/** Stable "YYYY-MM" key so a grant applies at most once per calendar month. */
export function periodKey(now: number): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Drop the plan's monthly credit grant into the tenant's balance (idempotent). */
export async function grantForTenant(env: Env, tenantId = DEMO_TENANT, now = Date.now()): Promise<number> {
  const sub = await getSubscription(env.DB, tenantId);
  const plan = await getPlan(env.DB, sub.plan_id);
  const grant = resolveEntitlements(plan?.entitlements_json).aiCredits.monthlyGrant;
  if (grant <= 0) return 0;
  const billing = env.BILLING.get(env.BILLING.idFromName(tenantId));
  await billing.bind(tenantId);
  await billing.grantMonthly(grant, periodKey(now));
  return grant;
}

/** Drop the monthly credit grant to EVERY tenant, not just the demo one. Comped
 *  and free plans have no Stripe invoice to trigger a grant, so the cron is their
 *  only source; grantMonthly is period-keyed, so re-running daily is idempotent. */
export async function grantAll(env: Env, now = Date.now()): Promise<number> {
  const subs = await listSubscriptions(env.DB);
  let granted = 0;
  for (const sub of subs) {
    granted += await grantForTenant(env, sub.tenant_id, now).catch(() => 0);
  }
  return granted;
}

export interface LifecycleAction {
  tenantId: string;
  from: string;
  to: string;
}

/**
 * Advance the dunning state machine for every subscription (§25). Called from
 * the cron. Returns the transitions applied.
 *
 *   past_due  + grace_days elapsed → suspended (+ schedule deletion)
 *   suspended + delete_days elapsed → deleted (tenant data wiped)
 *
 * Comped subscriptions (promo/gift/demo) never enter dunning.
 */
export async function lifecycleSweep(env: Env, now = Date.now()): Promise<LifecycleAction[]> {
  const cfg = await import("./billing-store.js").then((m) => m.getConfig(env.DB));
  const graceMs = days(cfg["billing.grace_days"]) ;
  const deleteMs = days(cfg["billing.delete_days"]);
  const actions: LifecycleAction[] = [];

  for (const sub of await listSubscriptions(env.DB)) {
    if (sub.comp === 1) continue; // gifted/demo accounts are exempt

    if (sub.status === "past_due" && sub.past_due_at) {
      const suspendAt = sub.suspend_at ?? sub.past_due_at + graceMs;
      if (sub.suspend_at == null) await updateSubscription(env.DB, sub.tenant_id, { suspend_at: suspendAt });
      if (now >= suspendAt) {
        await updateSubscription(env.DB, sub.tenant_id, { status: "suspended", delete_at: now + deleteMs });
        actions.push({ tenantId: sub.tenant_id, from: "past_due", to: "suspended" });
        await notifyAdmin(env.DB, env.OPERATOR_EMAIL, {
          subject: "Account suspended — screens paused",
          html: emailShell("Account suspended", `<p>Your account is suspended for non-payment and your screens now show a holding card. Reactivate by updating your payment. Data is scheduled for deletion in ${Math.round(deleteMs / 86400000)} days.</p>`),
        }, env.EMAIL).catch(() => undefined);
      }
    } else if (sub.status === "suspended" && sub.delete_at && now >= sub.delete_at) {
      await deleteTenantData(env, sub.tenant_id);
      await updateSubscription(env.DB, sub.tenant_id, { status: "canceled", plan_id: "free", delete_at: null, suspend_at: null, past_due_at: null });
      actions.push({ tenantId: sub.tenant_id, from: "suspended", to: "deleted" });
      await notifyAdmin(env.DB, env.OPERATOR_EMAIL, {
        subject: "Account data deleted",
        html: emailShell("Account data removed", "<p>After the suspension window elapsed, your channels, screens, and content were deleted. Your billing history is retained.</p>"),
      }, env.EMAIL).catch(() => undefined);
    }
  }
  return actions;
}

function days(v: string | undefined): number {
  const n = Number(v);
  return (Number.isFinite(n) ? n : 7) * 24 * 3600 * 1000;
}

/** Is the tenant's playout gated (suspended for non-payment)? */
export async function isSuspended(db: D1Database, tenantId = DEMO_TENANT): Promise<boolean> {
  const sub = await getSubscription(db, tenantId);
  return sub.status === "suspended";
}

/**
 * Auto-deletion (§25): wipe a tenant's authoring data. Screens, content,
 * boards, feeds, schedules, and alerts are removed; billing rows (subscription,
 * ledger) are retained for the record. Destructive and irreversible.
 */
export async function deleteTenantData(env: Env, tenantId: string): Promise<void> {
  const db = env.DB;
  // slides/device_schedule_rules/feed_items are keyed by parent id; clear by
  // tenant join, then clear the tenant-keyed tables directly.
  const stmts = [
    db.prepare("DELETE FROM slides WHERE channel_id IN (SELECT id FROM channels WHERE tenant_id = ?)").bind(tenantId),
    db.prepare("DELETE FROM device_schedule_rules WHERE screen_id IN (SELECT id FROM screens WHERE tenant_id = ?)").bind(tenantId),
    db.prepare("DELETE FROM feed_items WHERE feed_id IN (SELECT id FROM feeds WHERE tenant_id = ?)").bind(tenantId),
    ...["screens", "channels", "boards", "feeds", "alert_rules", "alerts", "playout_events"].map((t) => db.prepare(`DELETE FROM ${t} WHERE tenant_id = ?`).bind(tenantId)),
  ];
  await db.batch(stmts);
}

/* ------------------------------- identity -------------------------------- */

/** Resolve the caller's email: Cloudflare Access header, else dev fallback. */
export function callerEmail(env: Env, req: Request): string {
  return req.headers.get("Cf-Access-Authenticated-User-Email") || env.OPERATOR_EMAIL || "";
}

/** Effective entitlements for the tenant (re-export for route convenience). */
export { tenantEntitlements };
