/**
 * Mossa API worker (SPEC §3) — Hono router. One origin serves the app SPA
 * (assets binding, SPA fallback) and this API (`run_worker_first`).
 *
 * Middleware order: session (per-request Better Auth + identity) → route
 * guard (three lanes) → routes. Better Auth's own endpoints are mounted at
 * /api/auth/* and handle OTP + passkey ceremonies + organization management.
 */

import { Hono } from "hono";
import { sessionMiddleware, type AppEnv } from "./auth-context.js";
import { routeGuard } from "./route-guard.js";
import { ensureSchema, parseJson } from "./db.js";
import { seedBilling, listPlans, getSubscription } from "./billing-store.js";
import { resolveEntitlements } from "@mossa/domain";
import { periodKey } from "./ids.js";
import { contextRoutes } from "./context-routes.js";
import { billingRoutes, adminRoutes } from "./billing-routes.js";
import { clientRoutes } from "./clients.js";
import { memberRoutes } from "./member-routes.js";
import { planRoutes } from "./plan-routes.js";
import { logRoutes } from "./log-routes.js";
import { libraryRoutes } from "./library-routes.js";
import { goalRoutes } from "./goal-routes.js";
import { commerceRoutes } from "./commerce-routes.js";
import { aiRoutes, aiAdminRoutes } from "./ai-routes.js";
import { healthRoutes } from "./health-routes.js";
import { bodyScanRoutes } from "./body-scan-routes.js";
import { contentHubRoutes, marketplaceRoutes } from "./content-routes.js";
import { reportRoutes } from "./report-routes.js";
import { progressRoutes } from "./progress-routes.js";
import { settingsRoutes } from "./settings-routes.js";
import { externalRoutes } from "./external-routes.js";
import { stripeRoutes, stripeAdminRoutes } from "./stripe-routes.js";
import { mediaRoutes } from "./media-routes.js";
import { demoRoutes } from "./demo-routes.js";
import { sessionRoutes, promoRoutes } from "./session-routes.js";
import { domainRoutes, domainAdminRoutes } from "./domain-routes.js";
import type { Env } from "./env.js";

import { notify, notifyOwners } from "./notify.js";
import { runWeeklyDigest } from "./digest.js";

export { TenantBillingDO } from "./billing-do.js";
export { InboxDO } from "./inbox-do.js";

const app = new Hono<AppEnv>();

app.get("/health", (c) => c.json({ ok: true, service: "mossa-api" }));

app.use("*", sessionMiddleware);
app.use("*", routeGuard);

// Better Auth: sign-in (OTP), passkey ceremonies, org management, sessions.
app.on(["GET", "POST"], "/api/auth/*", (c) => c.get("auth").handler(c.req.raw));

app.route("/api", contextRoutes);
app.route("/api", billingRoutes);
app.route("/api", adminRoutes);
app.route("/api", clientRoutes);
app.route("/api", memberRoutes);
app.route("/api", planRoutes);
app.route("/api", logRoutes);
app.route("/api", libraryRoutes);
app.route("/api", goalRoutes);
app.route("/api", commerceRoutes);
app.route("/api", aiRoutes);
app.route("/api", aiAdminRoutes);
app.route("/api", healthRoutes);
app.route("/api", bodyScanRoutes);
app.route("/api", contentHubRoutes);
app.route("/api", marketplaceRoutes);
app.route("/api", reportRoutes);
app.route("/api", progressRoutes);
app.route("/api", settingsRoutes);
app.route("/api", externalRoutes);
app.route("/api", stripeRoutes);
app.route("/api", stripeAdminRoutes);
app.route("/api", mediaRoutes);
app.route("/api", demoRoutes);
app.route("/api", sessionRoutes);
app.route("/api", promoRoutes);
app.route("/api", domainRoutes);
app.route("/api", domainAdminRoutes);

app.notFound((c) =>
  c.req.path.startsWith("/api/") ? c.json({ error: "not found" }, 404) : c.text("not found", 404),
);

const GRACE_DAYS = 7; // past_due → suspended
const DELETE_DAYS = 30; // suspended → data wipe

/**
 * Daily cron (00:10 UTC): idempotent monthly credit grants + the platform
 * dunning lifecycle (SPEC §7): past_due → (7d) suspended → (30d) deleted.
 * Comped tenants are exempt.
 */
async function dailySweep(env: Env): Promise<void> {
  await ensureSchema(env.DB);
  await seedBilling(env.DB);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // 1) Monthly grants.
  const plans = await listPlans(env.DB);
  const grants = new Map(plans.map((p) => [p.id, resolveEntitlements(p.entitlements_json).aiCredits.monthlyGrant]));
  const active = await env.DB.prepare("SELECT tenant_id, plan_id FROM subscriptions WHERE status IN ('active','trialing')").all<{ tenant_id: string; plan_id: string }>();
  const key = periodKey();
  for (const sub of active.results ?? []) {
    const grant = grants.get(sub.plan_id) ?? 0;
    if (grant <= 0) continue;
    const dobj = env.BILLING.get(env.BILLING.idFromName(sub.tenant_id));
    await dobj.bind(sub.tenant_id);
    await dobj.grantMonthly(grant, key).catch(() => undefined);
  }

  // 2) Dunning: past_due older than the grace window → suspended. Select first
  //    so we can notify each owner that their studio just went dark.
  const graceCutoff = new Date(nowMs - GRACE_DAYS * 86_400_000).toISOString();
  const toSuspend = await env.DB.prepare(
    "SELECT tenant_id FROM subscriptions WHERE status = 'past_due' AND comp = 0 AND past_due_at IS NOT NULL AND past_due_at < ?",
  ).bind(graceCutoff).all<{ tenant_id: string }>().catch(() => ({ results: [] as { tenant_id: string }[] }));
  await env.DB.prepare(
    "UPDATE subscriptions SET status = 'suspended', suspend_at = ?, delete_at = ? WHERE status = 'past_due' AND comp = 0 AND past_due_at IS NOT NULL AND past_due_at < ?",
  )
    .bind(nowIso, new Date(nowMs + DELETE_DAYS * 86_400_000).toISOString(), graceCutoff)
    .run()
    .catch(() => undefined);
  for (const s of toSuspend.results ?? []) {
    await notifyOwners(env, s.tenant_id, {
      category: "billing",
      type: "billing_suspended",
      title: "Your studio is suspended",
      message: "Your Mossa subscription lapsed, so paid features are paused for you and your clients. Update your payment to restore everything.",
      link: "/business",
      dedupeKey: `susp_${s.tenant_id}`,
    });
  }

  // 3) Suspended past the delete window → drop to free (data-wipe hook lives
  //    here; v1 resets the plan, retaining coaching data until wired).
  const toCancel = await env.DB.prepare(
    "SELECT tenant_id FROM subscriptions WHERE status = 'suspended' AND comp = 0 AND delete_at IS NOT NULL AND delete_at < ?",
  ).bind(nowIso).all<{ tenant_id: string }>().catch(() => ({ results: [] as { tenant_id: string }[] }));
  await env.DB.prepare(
    "UPDATE subscriptions SET status = 'canceled', plan_id = 'free', suspend_at = NULL, delete_at = NULL WHERE status = 'suspended' AND comp = 0 AND delete_at IS NOT NULL AND delete_at < ?",
  )
    .bind(nowIso)
    .run()
    .catch(() => undefined);
  for (const s of toCancel.results ?? []) {
    await notifyOwners(env, s.tenant_id, {
      category: "billing",
      type: "billing_canceled",
      title: "Subscription canceled",
      message: "Your studio dropped to the free plan after non-payment. Resubscribe any time to bring back paid features.",
      link: "/business",
      dedupeKey: `cancel_${s.tenant_id}`,
    });
  }
}

/**
 * 15-min tick: reminder sweeps. Notifies clients whose feature budgets are
 * within 3 days of lapsing (once per subscription, tracked via a marker note).
 */
async function reminderSweep(env: Env): Promise<void> {
  await ensureSchema(env.DB);
  const soon = Date.now() + 3 * 86_400_000;
  const subs = await env.DB.prepare(
    "SELECT id, tenant_id, client_id, budgets_json, notes FROM client_subscriptions WHERE status = 'active'",
  ).all<{ id: string; tenant_id: string; client_id: string; budgets_json: string | null; notes: string | null }>();
  const now = Date.now();
  for (const sub of subs.results ?? []) {
   try {
    const notes = sub.notes ?? "";
    // parseJson (never bare JSON.parse): one malformed budgets_json row must not
    // abort the sweep for every remaining tenant.
    const budgets = parseJson<{ expiresAt: string }[]>(sub.budgets_json, []);
    if (!budgets.length) continue;
    const latest = Math.max(0, ...budgets.map((b) => Date.parse(b.expiresAt)));
    const nudge = async (type: string, title: string, message: string, marker: string) => {
      const client = await env.DB.prepare("SELECT user_id FROM clients WHERE id = ?").bind(sub.client_id).first<{ user_id: string | null }>();
      if (client?.user_id) {
        await notify(env, { tenantId: sub.tenant_id, userId: client.user_id, category: "commerce", type, title, message, link: "/shop", dedupeKey: `${marker}_${sub.id}` });
      }
      await env.DB.prepare("UPDATE client_subscriptions SET notes = ? WHERE id = ?").bind(`${notes} ${marker}`.trim(), sub.id).run().catch(() => undefined);
    };
    // Fully lapsed → one "expired" nudge, and reconcile the status.
    if (latest > 0 && latest <= now) {
      if (!notes.includes("expired-notified")) {
        await nudge("sub_expired", "Your access has expired", "Renew to pick your plan back up where you left off.", "expired-notified");
        await env.DB.prepare("UPDATE client_subscriptions SET status = 'expired' WHERE id = ?").bind(sub.id).run().catch(() => undefined);
      }
      continue;
    }
    // Within 3 days of lapsing → one "expiring soon" nudge.
    if (latest > now && latest < soon && !notes.includes("expiry-notified")) {
      await nudge("sub_expiring", "Your plan is expiring soon", "Renew to keep your coaching access.", "expiry-notified");
    }
   } catch { /* skip this row; a bad record can't stall the whole sweep */ }
  }
}

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    if (controller.cron === "10 0 * * *") await dailySweep(env);
    else if (controller.cron === "*/15 * * * *") await reminderSweep(env);
    else if (controller.cron === "0 8 * * 1") await runWeeklyDigest(env);
  },
} satisfies ExportedHandler<Env>;
