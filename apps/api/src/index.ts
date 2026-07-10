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
import { ensureSchema } from "./db.js";
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
import { aiRoutes } from "./ai-routes.js";
import { healthRoutes } from "./health-routes.js";
import { contentHubRoutes, marketplaceRoutes } from "./content-routes.js";
import { reportRoutes } from "./report-routes.js";
import { settingsRoutes } from "./settings-routes.js";
import { externalRoutes } from "./external-routes.js";
import { stripeRoutes, stripeAdminRoutes } from "./stripe-routes.js";
import type { Env } from "./env.js";

export { TenantBillingDO } from "./billing-do.js";

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
app.route("/api", healthRoutes);
app.route("/api", contentHubRoutes);
app.route("/api", marketplaceRoutes);
app.route("/api", reportRoutes);
app.route("/api", settingsRoutes);
app.route("/api", externalRoutes);
app.route("/api", stripeRoutes);
app.route("/api", stripeAdminRoutes);

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

  // 2) Dunning: past_due older than the grace window → suspended.
  const graceCutoff = new Date(nowMs - GRACE_DAYS * 86_400_000).toISOString();
  await env.DB.prepare(
    "UPDATE subscriptions SET status = 'suspended', suspend_at = ?, delete_at = ? WHERE status = 'past_due' AND comp = 0 AND past_due_at IS NOT NULL AND past_due_at < ?",
  )
    .bind(nowIso, new Date(nowMs + DELETE_DAYS * 86_400_000).toISOString(), graceCutoff)
    .run()
    .catch(() => undefined);

  // 3) Suspended past the delete window → drop to free (data-wipe hook lives
  //    here; v1 resets the plan, retaining coaching data until wired).
  await env.DB.prepare(
    "UPDATE subscriptions SET status = 'canceled', plan_id = 'free', suspend_at = NULL, delete_at = NULL WHERE status = 'suspended' AND comp = 0 AND delete_at IS NOT NULL AND delete_at < ?",
  )
    .bind(nowIso)
    .run()
    .catch(() => undefined);
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
  for (const sub of subs.results ?? []) {
    if ((sub.notes ?? "").includes("expiry-notified")) continue;
    const budgets = JSON.parse(sub.budgets_json ?? "[]") as { expiresAt: string }[];
    const latest = Math.max(0, ...budgets.map((b) => Date.parse(b.expiresAt)));
    if (latest > Date.now() && latest < soon) {
      const client = await env.DB.prepare("SELECT user_id, display_name FROM clients WHERE id = ?").bind(sub.client_id).first<{ user_id: string | null; display_name: string }>();
      if (client?.user_id) {
        await env.DB.prepare(
          "INSERT INTO notifications (id, tenant_id, recipient_user_id, type, title, message, link, created_at) VALUES (?, ?, ?, 'sub_expiring', 'Your plan is expiring soon', 'Renew to keep your coaching access.', '/marketplace', ?)",
        )
          .bind(`ntf_${sub.id}`, sub.tenant_id, client.user_id, new Date().toISOString())
          .run()
          .catch(() => undefined);
      }
      await env.DB.prepare("UPDATE client_subscriptions SET notes = ? WHERE id = ?").bind(`${sub.notes ?? ""} expiry-notified`, sub.id).run().catch(() => undefined);
    }
  }
}

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    if (controller.cron === "10 0 * * *") await dailySweep(env);
    else if (controller.cron === "*/15 * * * *") await reminderSweep(env);
  },
} satisfies ExportedHandler<Env>;
