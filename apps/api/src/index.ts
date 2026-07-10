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

/**
 * Daily cron (00:10 UTC): idempotent monthly credit grants for every active
 * tenant subscription. Dunning lifecycle joins with the platform-Stripe phase.
 * The 15-min tick is reserved for reminder sweeps (later phase).
 */
async function dailySweep(env: Env): Promise<void> {
  await ensureSchema(env.DB);
  await seedBilling(env.DB);
  const plans = await listPlans(env.DB);
  const grants = new Map(plans.map((p) => [p.id, resolveEntitlements(p.entitlements_json).aiCredits.monthlyGrant]));
  const subs = await env.DB.prepare(
    "SELECT tenant_id, plan_id FROM subscriptions WHERE status IN ('active','trialing')",
  ).all<{ tenant_id: string; plan_id: string }>();
  const key = periodKey();
  for (const sub of subs.results ?? []) {
    const grant = grants.get(sub.plan_id) ?? 0;
    if (grant <= 0) continue;
    const dobj = env.BILLING.get(env.BILLING.idFromName(sub.tenant_id));
    await dobj.bind(sub.tenant_id);
    await dobj.grantMonthly(grant, key).catch(() => undefined);
  }
}

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    if (controller.cron === "10 0 * * *") await dailySweep(env);
  },
} satisfies ExportedHandler<Env>;
