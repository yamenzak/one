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
import { resolveEntitlements, type NotifType } from "@mossa/domain";
import { periodKey } from "./ids.js";
import { contextRoutes } from "./context-routes.js";
import { billingRoutes, adminRoutes } from "./billing-routes.js";
import { downgradeRoutes } from "./downgrade-routes.js";
import { clientRoutes } from "./clients.js";
import { memberRoutes } from "./member-routes.js";
import { planRoutes } from "./plan-routes.js";
import { planVariantRoutes } from "./plan-variants.js";
import { attentionRoutes } from "./attention-routes.js";
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
import { mediaLibraryRoutes } from "./media-library-routes.js";
import { accountRoutes } from "./account-routes.js";
import { tenantCloseRoutes } from "./tenant-close-routes.js";
import { nuclearRoutes } from "./nuclear-routes.js";
import { purgeTenant } from "./purge.js";
import { sessionRoutes, promoRoutes } from "./session-routes.js";
import { domainRoutes, domainAdminRoutes } from "./domain-routes.js";
import { onboardingRoutes } from "./onboarding-routes.js";
import { otpSendGuard } from "./otp-guard.js";
import { buildManifest } from "./manifest.js";
import type { Env } from "./env.js";

import { notify, notifyOwners } from "./notify.js";
import { runWeeklyDigest } from "./digest.js";

export { TenantBillingDO } from "./billing-do.js";
export { InboxDO } from "./inbox-do.js";

const app = new Hono<AppEnv>();

// Liveness: the worker is up. Deliberately trivial and dependency-free.
app.get("/health", (c) => c.json({ ok: true, service: "mossa-api" }));

// Readiness: point an external uptime monitor HERE, not at /health. A worker that
// boots while D1 is unreachable answers /health with 200 and 500s every real
// request, so liveness alone cannot detect a broken deploy. This touches the
// bindings a request actually depends on and returns 503 when one is down.
app.get("/ready", async (c) => {
  const checks: Record<string, boolean> = {};
  await Promise.all([
    c.env.DB.prepare("SELECT 1 AS x").first<{ x: number }>().then(
      (r) => { checks.d1 = r?.x === 1; },
      () => { checks.d1 = false; },
    ),
    c.env.CACHE.get("__ready_probe").then(() => { checks.kv = true; }, () => { checks.kv = false; }),
  ]);
  const ok = Object.values(checks).every(Boolean);
  return c.json({ ok, checks, service: "mossa-api" }, ok ? 200 : 503);
});

app.use("*", sessionMiddleware);
app.use("*", routeGuard);

// OTP send runs our policy gate first (cooldown, Turnstile, tenant sign-up
// eligibility), then forwards to Better Auth. Registered before the catch-all
// so this exact path lands here, not on the generic handler.
app.post("/api/auth/email-otp/send-verification-otp", otpSendGuard);

// Close the two sibling endpoints the emailOTP plugin registers unconditionally.
// Both call the same sendVerificationOTP callback directly, so they are a way
// around otpSendGuard entirely — no Turnstile, no 30s cooldown, no per-IP hourly
// ceiling — which would let an attacker keep emailing codes after an operator
// turned Turnstile on. There is no password provider here at all
// (`emailAndPassword: { enabled: false }`), so password-reset OTP is pure attack
// surface with no legitimate caller. 404 rather than 403: don't confirm it exists.
app.post("/api/auth/email-otp/request-password-reset", (c) => c.json({ error: "not_found" }, 404));
app.post("/api/auth/forget-password/email-otp", (c) => c.json({ error: "not_found" }, 404));

// Better Auth: sign-in (OTP), passkey ceremonies, org management, sessions.
app.on(["GET", "POST"], "/api/auth/*", (c) => c.get("auth").handler(c.req.raw));

app.route("/api", contextRoutes);
app.route("/api", billingRoutes);
// MUST stay ahead of `stripeRoutes`: downgradeRoutes registers pass-through
// guards on POST /billing/plan-intent + /billing/checkout-plan that refuse an
// ineligible downgrade and otherwise `next()` into the real Stripe handlers.
// Mounted later, the Stripe handler would answer first and the gate would be dead.
app.route("/api", downgradeRoutes);
app.route("/api", adminRoutes);
app.route("/api", clientRoutes);
app.route("/api", memberRoutes);
app.route("/api", planRoutes);
app.route("/api", planVariantRoutes);
app.route("/api", attentionRoutes);
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
app.route("/api", mediaLibraryRoutes);
app.route("/api", accountRoutes);
app.route("/api", tenantCloseRoutes);
app.route("/api", nuclearRoutes);
app.route("/api", sessionRoutes);
app.route("/api", promoRoutes);
app.route("/api", domainRoutes);
app.route("/api", domainAdminRoutes);
// First-run studio wizard. Mounted under `/api/me/...` on purpose — that is the
// one authenticated route-guard lane that does not demand a tenant, which is
// exactly the caller (signed in, no studio yet). See onboarding-routes.ts.
app.route("/api", onboardingRoutes);

// Per-tenant PWA manifest (white-label). Served by the worker (run_worker_first
// lists this path) so the installed app wears the host tenant's name/icon/colors.
app.get("/manifest.webmanifest", (c) =>
  new Response(buildManifest(c.get("hostTenant")), {
    headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=300" },
  }),
);

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
  // Every phase below is independent, so each is isolated: this sweep is the only
  // thing that grants monthly credits, advances the dunning lifecycle, executes
  // scheduled closures and bounds table growth, and it runs once a day. A single
  // transient D1 error used to abort the whole run from the very first statement —
  // meaning paying tenants silently received zero credits for that month, with
  // nothing surfaced. Isolate per phase so one failure costs one phase, not the day.
  const step = async (name: string, fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
    } catch (e) {
      console.error(`[dailySweep] phase "${name}" failed:`, e);
    }
  };

  await step("schema+seed", async () => {
    await ensureSchema(env.DB);
    await seedBilling(env.DB);
  });
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // 1) Monthly grants.
  await step("monthly-grants", async () => {
    const plans = await listPlans(env.DB);
    const grants = new Map(plans.map((p) => [p.id, resolveEntitlements(p.entitlements_json).aiCredits.monthlyGrant]));
    const active = await env.DB.prepare("SELECT tenant_id, plan_id FROM subscriptions WHERE status IN ('active','trialing')").all<{ tenant_id: string; plan_id: string }>();
    const key = periodKey();
    for (const sub of active.results ?? []) {
      const grant = grants.get(sub.plan_id) ?? 0;
      if (grant <= 0) continue;
      const dobj = env.BILLING.get(env.BILLING.idFromName(sub.tenant_id));
      await dobj.bind(sub.tenant_id);
      // Money path: a swallowed grant failure means a paid tenant silently never
      // receives its monthly credits — surface it so it's observable.
      await dobj.grantMonthly(grant, key).catch((e) => console.error(`[dailySweep] grantMonthly failed for ${sub.tenant_id}:`, e));
    }
  });

  // 2) Dunning: past_due older than the grace window → suspended. Select first
  //    so we can notify each owner that their studio just went dark.
  await step("dunning-suspend", async () => {
  const graceCutoff = new Date(nowMs - GRACE_DAYS * 86_400_000).toISOString();
  const toSuspend = await env.DB.prepare(
    "SELECT tenant_id FROM subscriptions WHERE status = 'past_due' AND comp = 0 AND past_due_at IS NOT NULL AND past_due_at < ?",
  ).bind(graceCutoff).all<{ tenant_id: string }>().catch(() => ({ results: [] as { tenant_id: string }[] }));
  await env.DB.prepare(
    "UPDATE subscriptions SET status = 'suspended', suspend_at = ?, delete_at = ? WHERE status = 'past_due' AND comp = 0 AND past_due_at IS NOT NULL AND past_due_at < ?",
  )
    .bind(nowIso, new Date(nowMs + DELETE_DAYS * 86_400_000).toISOString(), graceCutoff)
    .run()
    .catch((e) => console.error("[dailySweep] dunning suspend UPDATE failed:", e));
  for (const s of toSuspend.results ?? []) {
    await notifyOwners(env, s.tenant_id, {
      type: "billing_suspended",
      message: "Your Mossa subscription lapsed, so paid features are paused for you and your clients. Update your payment to restore everything.",
      dedupeKey: `susp_${s.tenant_id}`,
    });
  }
  });

  // 3) Suspended past the delete window → drop to free (data-wipe hook lives
  //    here; v1 resets the plan, retaining coaching data until wired).
  await step("dunning-cancel", async () => {
  const toCancel = await env.DB.prepare(
    "SELECT tenant_id FROM subscriptions WHERE status = 'suspended' AND comp = 0 AND delete_at IS NOT NULL AND delete_at < ?",
  ).bind(nowIso).all<{ tenant_id: string }>().catch(() => ({ results: [] as { tenant_id: string }[] }));
  await env.DB.prepare(
    "UPDATE subscriptions SET status = 'canceled', plan_id = 'free', suspend_at = NULL, delete_at = NULL WHERE status = 'suspended' AND comp = 0 AND delete_at IS NOT NULL AND delete_at < ?",
  )
    .bind(nowIso)
    .run()
    .catch((e) => console.error("[dailySweep] dunning cancel UPDATE failed:", e));
  for (const s of toCancel.results ?? []) {
    await notifyOwners(env, s.tenant_id, {
      type: "billing_canceled",
      message: "Your studio dropped to the free plan after non-payment. Resubscribe any time to bring back paid features.",
      dedupeKey: `cancel_${s.tenant_id}`,
    });
  }
  });

  // 4) Owner-initiated studio closures past their 7-day hold → full hard purge
  //    (R2 + D1 + billing DO + member identities). Distinct from the dunning
  //    lifecycle above (which merely resets a delinquent tenant to free).
  await step("scheduled-closures", async () => {
    const toPurge = await env.DB.prepare(
      "SELECT tenant_id FROM subscriptions WHERE status = 'closing' AND delete_at IS NOT NULL AND delete_at < ?",
    ).bind(nowIso).all<{ tenant_id: string }>().catch(() => ({ results: [] as { tenant_id: string }[] }));
    for (const s of toPurge.results ?? []) {
      await purgeTenant(env, s.tenant_id).catch((e) => console.error(`[dailySweep] purgeTenant failed for ${s.tenant_id}:`, e));
    }
  });

  // 5) Housekeeping: bound the growth of the append-only dedup/cache/ledger
  //    tables. Webhook dedup only needs a window wider than Stripe's retry
  //    horizon; the AI cache and weekly-digest ledger likewise need only recent
  //    rows (stripe_events.at / ai_cache.at are ms; digest_sent.at is ISO text).
  const pruneMs = nowMs - 45 * 86_400_000;
  await env.DB.prepare("DELETE FROM stripe_events WHERE at < ?").bind(pruneMs).run().catch((e) => console.error("[dailySweep] stripe_events prune failed:", e));
  await env.DB.prepare("DELETE FROM ai_cache WHERE at < ?").bind(pruneMs).run().catch((e) => console.error("[dailySweep] ai_cache prune failed:", e));
  await env.DB.prepare("DELETE FROM digest_sent WHERE at < ?").bind(new Date(pruneMs).toISOString()).run().catch((e) => console.error("[dailySweep] digest_sent prune failed:", e));
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
    const nudge = async (type: NotifType, message: string, marker: string, vars?: Record<string, string | number>) => {
      const client = await env.DB.prepare("SELECT user_id FROM clients WHERE id = ?").bind(sub.client_id).first<{ user_id: string | null }>();
      if (client?.user_id) {
        // Title + link (/shop) come from the type's record; `studioName` is auto.
        await notify(env, { tenantId: sub.tenant_id, userId: client.user_id, type, message, dedupeKey: `${marker}_${sub.id}`, vars });
      }
      // CAS on the notes we read: two overlapping sweeps (or a coach saving a
      // note) must not clobber each other's marker and re-nudge the client.
      await env.DB.prepare("UPDATE client_subscriptions SET notes = ? WHERE id = ? AND notes IS ?").bind(`${notes} ${marker}`.trim(), sub.id, sub.notes ?? null).run().catch(() => undefined);
    };
    // Fully lapsed → one "expired" nudge, and reconcile the status.
    if (latest > 0 && latest <= now) {
      if (!notes.includes("expired-notified")) {
        await nudge("sub_expired", "Renew to pick your plan back up where you left off.", "expired-notified");
        // Guard on the exact status + budgets this iteration read — the same
        // guard reconcile() uses (commerce-routes.ts). The row set was snapshotted
        // by one SELECT at the top of the sweep and each iteration then does D1
        // reads plus a notify() network call, so on a large roster the snapshot is
        // minutes stale by the time we get here. Without the guard, a renewal that
        // landed in that window (invoice.paid appending fresh days and setting the
        // row active) gets stamped 'expired' on top — and since NO read path ever
        // flips expired→active, the client has paid and is locked out of every
        // budget-gated capability until their next invoice.
        await env.DB
          .prepare("UPDATE client_subscriptions SET status = 'expired' WHERE id = ? AND status = 'active' AND budgets_json IS ?")
          .bind(sub.id, sub.budgets_json ?? null)
          .run()
          .catch(() => undefined);
      }
      continue;
    }
    // Within 3 days of lapsing → one "expiring soon" nudge.
    if (latest > now && latest < soon && !notes.includes("expiry-notified")) {
      await nudge("sub_expiring", "Renew to keep your coaching access.", "expiry-notified", { daysLeft: Math.max(1, Math.ceil((latest - now) / 86_400_000)) });
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
