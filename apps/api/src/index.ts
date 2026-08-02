/**
 * Kova API worker (SPEC §3) — Hono router. One origin serves the app SPA
 * (assets binding, SPA fallback) and this API (`run_worker_first`).
 *
 * Middleware order: session (per-request Better Auth + identity) → route
 * guard (three lanes) → routes. Better Auth's own endpoints are mounted at
 * /api/auth/* and handle OTP + passkey ceremonies + organization management.
 */

import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { maintenanceMiddleware } from "@4dl/tenancy";
import { isPlatformAdmin, sessionMiddleware, type AppContext, type AppEnv } from "./auth-context.js";
import { routeGuard } from "./route-guard.js";
import { ensureSchema, parseJson } from "./db.js";
import { seedBilling, listPlans, getSubscription } from "./billing-store.js";
import {
  resolveEntitlements, type NotifType,
  DEFAULT_LAPSE_POLICY, checkLapsePolicy, isDestructive, isFullyExpired, type LapsePolicy,
} from "@kova/domain";
import { DUNNING_DAYS } from "@4dl/billing";
import { periodKey } from "./ids.js";
import { contextRoutes } from "./context-routes.js";
import { notifyRoutes } from "@4dl/notify/routes";
import { billingRoutes, adminRoutes, emailConfigRoutes } from "./billing-routes.js";
import { maintenanceRoutes } from "./maintenance.js";
import { sharedConfigRoutes } from "@4dl/core/admin-routes";
import { railAdminRoutes } from "@4dl/billing-rail/admin-routes";
import { downgradeRoutes } from "./downgrade-routes.js";
import { clientRoutes } from "./clients.js";
import { memberRoutes } from "./member-routes.js";
import { staffRoutes } from "./staff-routes.js";
import { planRoutes } from "./plan-routes.js";
import { planVariantRoutes } from "./plan-variants.js";
import { attentionRoutes } from "./attention-routes.js";
import { logRoutes } from "./log-routes.js";
import { libraryRoutes } from "./library-routes.js";
import { goalRoutes } from "./goal-routes.js";
import { commerceRoutes } from "./commerce-routes.js";
import { paymentsRoutes, paymentsWebhook } from "./payments-routes.js";
import { aiRoutes, aiAdminRoutes } from "./ai-routes.js";
import { aiCatalogAdminRoutes } from "@4dl/ai";
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
import { purgeTenant, purgeClient } from "./purge.js";
import { loadClientAccessRows, accessBudgetsOf, REPORTED_ACCESS_STATUSES } from "./client-flags.js";
import { sessionRoutes, promoRoutes } from "./session-routes.js";
import { domainRoutes, domainAdminRoutes } from "./domain-routes.js";
import { onboardingRoutes } from "./onboarding-routes.js";
import { otpSendGuard } from "./otp-guard.js";
import { orgCreateGuard, orgUpdateGuard } from "./org-guard.js";
import { buildManifest } from "./manifest.js";
import type { Env } from "./env.js";

import { notify, notifyOwners } from "./notify.js";
import { runWeeklyDigest } from "./digest.js";

export { TenantBillingDO } from "./billing-do.js";
export { InboxDO } from "./inbox-do.js";

const app = new Hono<AppEnv>();

// Liveness: the worker is up. Deliberately trivial and dependency-free.
app.get("/health", (c) => c.json({ ok: true, service: "kova-api" }));

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
  return c.json({ ok, checks, service: "kova-api" }, ok ? 200 : 503);
});

app.use("*", sessionMiddleware);
// Resolve the deployment-wide maintenance switch once per request, BETWEEN the
// session and the guard: the guard refuses on it, `/api/host` reports it, and
// both must see the same read. Only `/api/*` and `/health` pay for it — the
// static SPA is never withheld, because the SPA is what renders the notice.
app.use("*", maintenanceMiddleware() as unknown as MiddlewareHandler<AppEnv>);
app.use("*", routeGuard);

// OTP send runs our policy gate first (cooldown, Turnstile, tenant sign-up
// eligibility), then forwards to Better Auth. Registered before the catch-all
// so this exact path lands here, not on the generic handler.
app.post("/api/auth/email-otp/send-verification-otp", otpSendGuard);

// A studio's slug is its HOSTNAME, so it cannot be whatever the client posted.
// These validate it against the reserved-label list and DNS label rules, then
// provision (or move) the studio's `<slug>.<root>` address. Registered before the
// catch-all so these exact paths land here first — see org-guard.ts.
app.post("/api/auth/organization/create", orgCreateGuard);
app.post("/api/auth/organization/update", orgUpdateGuard);

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
// The inbox: /notifications, /notifications/:id/read, /notifications/read-all
// and the InboxDO socket. The surface scoping of "mark all read" comes from the
// notification registry `@kova/domain` configures, not from anything here.
app.route("/api", notifyRoutes<AppEnv>({ currentUserId: (c) => c.get("user")?.id ?? null }));
app.route("/api", billingRoutes);
// MUST stay ahead of `stripeRoutes`: downgradeRoutes registers pass-through
// guards on POST /billing/plan-intent + /billing/checkout-plan that refuse an
// ineligible downgrade and otherwise `next()` into the real Stripe handlers.
// Mounted later, the Stripe handler would answer first and the gate would be dead.
app.route("/api", downgradeRoutes);
app.route("/api", adminRoutes);
app.route("/api", emailConfigRoutes);
/**
 * The SHARED platform config store, on the operator door.
 *
 * Every app's console writes the SAME namespace, which is the point: the Google
 * key, the Stripe account, the Cloudflare token and the Turnstile widget are one
 * fact about the platform, not one per product. This app's own `app_config`
 * rows still win — see `packages/core/src/config.ts`.
 */
app.route("/api", sharedConfigRoutes({ isPlatformAdmin: (c) => isPlatformAdmin(c as never) }) as unknown as Hono<AppEnv>);

/**
 * The Stripe rail's DEAD LETTER, on the operator door.
 *
 * The rail parks an event it cannot attribute to any app — money captured,
 * nothing granted — and until now nothing in the repo could read one back. One
 * Stripe account serves every 4DL product, so the queue is the platform's
 * rather than this app's; it answers on whichever worker Stripe delivered to.
 */
app.route("/api", railAdminRoutes({
  isPlatformAdmin: (c) => isPlatformAdmin(c as never),
  // The audit line on a closed event. Identifying the operator is the app's
  // business — this package has never seen its auth.
  // `c.get("user").email` is the same field `isPlatformAdmin` checks against
  // ADMIN_EMAILS, so the audit line names whoever the allowlist let in.
  operatorRef: (c) => (c as unknown as AppContext).get("user")?.email ?? "operator",
}) as unknown as Hono<AppEnv>);
app.route("/api", maintenanceRoutes as unknown as Hono<AppEnv>);
app.route("/api", clientRoutes);
app.route("/api", memberRoutes);
// The staff screen: the roster WITH pending invitations, invite, revoke,
// re-role and remove. `memberRoutes` keeps the custom per-member grant, which
// is Kova's alone.
app.route("/api", staffRoutes);
app.route("/api", planRoutes);
app.route("/api", planVariantRoutes);
app.route("/api", attentionRoutes);
app.route("/api", logRoutes);
app.route("/api", libraryRoutes);
app.route("/api", goalRoutes);
app.route("/api", commerceRoutes);
app.route("/api", paymentsRoutes);
// The tenant payment rail's provider callback. Public and session-less by
// construction — see `isProviderWebhook` in route-guard.ts.
app.route("/api", paymentsWebhook);
app.route("/api", aiRoutes);
app.route("/api", aiAdminRoutes);
// The provider key, mock lane, credit markup and model catalog are
// `@4dl/ai`'s state, so their console endpoints are `@4dl/ai`'s routes.
app.route("/api", aiCatalogAdminRoutes({
  isPlatformAdmin: (c) => isPlatformAdmin(c as never),
  // Stamped on a catalog this app publishes for the platform, so another app's
  // console can say where its model rates came from.
  appName: "Kova",
  // Kova's own consequence of a first key: cached TTS cues were voiced by the
  // keyless mock lane (silent WAVs), so keeping them leaves an owner stuck with
  // silence they already "generated".
  onFirstProviderKey: async (db) => { await db.prepare("DELETE FROM tts_cues").run().catch(() => undefined); },
}) as unknown as Hono<AppEnv>);
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

// The rungs live in @4dl/platform so the sweep, the gate and the UI copy cannot
// drift; `DUNNING_DAYS` is days from `past_due_at`, not from the previous rung.
const dunningCutoff = (nowMs: number, days: number) => new Date(nowMs - days * 86_400_000).toISOString();

/**
 * Daily cron (00:10 UTC): idempotent monthly credit grants + BOTH access ladders.
 *
 *   Kova → tenant   past_due → (7d) read-only → (30d) blocked → (37d) PURGED.
 *                   Anchored on `past_due_at`, which is written once
 *                   (`COALESCE(past_due_at, ?)`) and cleared on recovery, so it
 *                   is a stable clock rather than a per-transition timestamp.
 *                   Comped tenants are exempt at every rung.
 *   tenant → client each studio's own `lapse_json` policy, applied to clients
 *                   whose package ran out. FROZEN while the studio itself is not
 *                   in good standing — see the phase comment.
 */
/**
 * Tell every client of a studio that their data is days from deletion.
 *
 * They are not party to the invoice and cannot settle it, so the only thing this
 * can honestly offer is the exit: export or delete on their own terms, now,
 * rather than losing everything to someone else's lapse. Inbox rather than email
 * because the mailer is tenant-configured and a lapsed studio's may not be.
 */
async function warnClientsOfPurge(env: Env, tenantId: string): Promise<void> {
  const days = DUNNING_DAYS.purge - DUNNING_DAYS.blocked;
  const rows = await env.DB
    .prepare("SELECT user_id FROM clients WHERE tenant_id = ? AND user_id IS NOT NULL AND status != 'archived'")
    .bind(tenantId)
    .all<{ user_id: string }>()
    .catch(() => ({ results: [] as { user_id: string }[] }));
  for (const r of rows.results ?? []) {
    await notify(env, {
      tenantId,
      userId: r.user_id,
      type: "sub_expiring",
      title: "This studio is closing",
      message: `Your coach's studio has been suspended and everything in it — including your logs and history — is scheduled for deletion in ${days} days. You can delete your account yourself at any time.`,
      link: "/profile",
    }).catch(() => undefined);
  }
}

/**
 * Apply each studio's own lapse policy to its lapsed clients.
 *
 * Only `archive` and `delete` are performed here, because only they are EVENTS.
 * `read_only` and `blocked` are STATES the client sits in for as long as the
 * lapse lasts, and they are resolved live from the same policy — writing them
 * into the record would make "renewed" a second migration instead of just a
 * fact that changes.
 */
async function applyClientLapsePolicies(env: Env, nowMs: number): Promise<void> {
  const nowIsoStr = new Date(nowMs).toISOString();
  const tenants = await env.DB
    .prepare(
      // GOOD STANDING ONLY. A studio Kova suspended, blocked or is closing must
      // not be deleting clients — the lapses are partly its own doing.
      `SELECT s.tenant_id, t.lapse_json
         FROM subscriptions s LEFT JOIN tenant_settings t ON t.tenant_id = s.tenant_id
        WHERE s.status IN ('active','trialing','past_due')`,
    )
    .all<{ tenant_id: string; lapse_json: string | null }>()
    .catch(() => ({ results: [] as { tenant_id: string; lapse_json: string | null }[] }));

  for (const t of tenants.results ?? []) {
    const policy = { ...DEFAULT_LAPSE_POLICY, ...parseJson<Partial<LapsePolicy>>(t.lapse_json, {}) } as LapsePolicy;
    // A stored policy that no longer validates (a floor was raised under it) is
    // ignored rather than applied — never destroy data on a rule we would refuse
    // to accept today.
    if (!checkLapsePolicy(policy).ok) continue;
    if (!isDestructive(policy.action)) continue; // read_only / blocked resolve live

    // Access lives in each subscription's `budgets_json` (expiresAt per budget,
    // days derived at read time — CLAUDE.md, the access economy), NOT in a column,
    // so lapse is decided by the SAME pure helpers the app and the routes use.
    // Any SQL shortcut here would be a fourth opinion about who has access.
    const cutoffIso = new Date(nowMs - policy.graceDays * 86_400_000).toISOString();
    const candidates = await env.DB
      .prepare("SELECT id FROM clients WHERE tenant_id = ? AND status = 'active'")
      .bind(t.tenant_id)
      .all<{ id: string }>()
      .catch(() => ({ results: [] as { id: string }[] }));

    const due: string[] = [];
    for (const c of candidates.results ?? []) {
      const rows = await loadClientAccessRows(env.DB, t.tenant_id, c.id, REPORTED_ACCESS_STATUSES);
      // Never sold anything: not a lapse, just a client the studio has not
      // charged. Deleting those would empty the roster of every free client.
      if (rows.length === 0) continue;
      const budgets = accessBudgetsOf(rows);
      if (budgets.length === 0) continue;
      // Still covered today, or lapsed but inside grace.
      if (!isFullyExpired(budgets, nowIsoStr)) continue;
      if (!isFullyExpired(budgets, cutoffIso)) continue;
      due.push(c.id);
    }

    for (const id of due) {
      if (policy.action === "delete") {
        await purgeClient(env, t.tenant_id, id).catch((e) => console.error(`[dailySweep] lapse delete ${id}:`, e));
      } else {
        await env.DB
          .prepare("UPDATE clients SET status = 'archived' WHERE id = ? AND tenant_id = ? AND status = 'active'")
          .bind(id, t.tenant_id)
          .run()
          .catch((e) => console.error(`[dailySweep] lapse archive ${id}:`, e));
      }
    }
  }
}

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

  // 2) Rung one — read-only. The studio and every client keep the whole app and
  //    lose the ability to write to it. Owners are told; clients are not, because
  //    at this point the studio can still fix it inside a day.
  await step("dunning-read-only", async () => {
    const cutoff = dunningCutoff(nowMs, DUNNING_DAYS.readOnly);
    const rows = await env.DB.prepare(
      "SELECT tenant_id FROM subscriptions WHERE status = 'past_due' AND comp = 0 AND past_due_at IS NOT NULL AND past_due_at < ?",
    ).bind(cutoff).all<{ tenant_id: string }>().catch(() => ({ results: [] as { tenant_id: string }[] }));
    await env.DB.prepare(
      "UPDATE subscriptions SET status = 'suspended', suspend_at = ? WHERE status = 'past_due' AND comp = 0 AND past_due_at IS NOT NULL AND past_due_at < ?",
    ).bind(nowIso, cutoff).run().catch((e) => console.error("[dailySweep] read-only UPDATE failed:", e));
    for (const s of rows.results ?? []) {
      await notifyOwners(env, s.tenant_id, {
        type: "billing_suspended",
        message: `Your Kova subscription lapsed, so your studio is read-only for you and your clients. Update your payment to restore everything. Access is withheld after ${DUNNING_DAYS.blocked} days.`,
        dedupeKey: `susp_${s.tenant_id}`,
      });
    }
  });

  // 3) Rung two — blocked. The app itself is withheld. This rung did not exist:
  //    a studio unpaid for a month looked exactly like one unpaid for a week, and
  //    the only thing between a customer and permanent deletion was a banner.
  await step("dunning-blocked", async () => {
    const cutoff = dunningCutoff(nowMs, DUNNING_DAYS.blocked);
    const rows = await env.DB.prepare(
      "SELECT tenant_id FROM subscriptions WHERE status = 'suspended' AND comp = 0 AND past_due_at IS NOT NULL AND past_due_at < ?",
    ).bind(cutoff).all<{ tenant_id: string }>().catch(() => ({ results: [] as { tenant_id: string }[] }));
    await env.DB.prepare(
      "UPDATE subscriptions SET status = 'blocked', delete_at = ? WHERE status = 'suspended' AND comp = 0 AND past_due_at IS NOT NULL AND past_due_at < ?",
    )
      .bind(new Date(nowMs + (DUNNING_DAYS.purge - DUNNING_DAYS.blocked) * 86_400_000).toISOString(), cutoff)
      .run()
      .catch((e) => console.error("[dailySweep] blocked UPDATE failed:", e));
    for (const s of rows.results ?? []) {
      await notifyOwners(env, s.tenant_id, {
        type: "billing_suspended",
        message: `Your studio is now closed to you and your clients. Everything is deleted permanently in ${DUNNING_DAYS.purge - DUNNING_DAYS.blocked} days unless you pay. You can still export or close your studio.`,
        dedupeKey: `blocked_${s.tenant_id}`,
      });
      // The clients are told too. Their training history is about to be deleted
      // over an invoice they had no part in and no way to settle — being told
      // only by the coach who stopped paying is not good enough.
      await warnClientsOfPurge(env, s.tenant_id).catch((e) => console.error("[dailySweep] purge warning failed:", e));
    }
  });

  // 4) Rung three — PURGE. Tenant, members and every client record.
  //
  //    This is the rung the lifecycle documented and never performed: the old
  //    phase set `status='canceled', plan_id='free'` and kept all coaching data
  //    indefinitely, while the function's own header claimed "(30d) deleted".
  //    It deletes now, 37 days after the first missed payment, after warnings at
  //    days 7 and 30 to the owner and at day 30 to every client.
  await step("dunning-purge", async () => {
    const cutoff = dunningCutoff(nowMs, DUNNING_DAYS.purge);
    const rows = await env.DB.prepare(
      "SELECT tenant_id FROM subscriptions WHERE status = 'blocked' AND comp = 0 AND past_due_at IS NOT NULL AND past_due_at < ?",
    ).bind(cutoff).all<{ tenant_id: string }>().catch(() => ({ results: [] as { tenant_id: string }[] }));
    for (const s of rows.results ?? []) {
      await purgeTenant(env, s.tenant_id).catch((e) => console.error(`[dailySweep] dunning purge failed for ${s.tenant_id}:`, e));
    }
  });

  // 5) Each studio's OWN policy for a client whose package ran out.
  //
  //    Frozen unless the studio is in good standing. A studio Kova has suspended
  //    or blocked has no working relationship with its clients — letting its
  //    `delete` policy keep firing would have it quietly shredding a roster it
  //    can no longer even see, for lapses caused by its own outage.
  await step("client-lapse", async () => {
    await applyClientLapsePolicies(env, nowMs);
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
    "SELECT id, tenant_id, subject_id, budgets_json, notes FROM subject_subscriptions WHERE status = 'active'",
  ).all<{ id: string; tenant_id: string; subject_id: string; budgets_json: string | null; notes: string | null }>();
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
      const client = await env.DB.prepare("SELECT user_id FROM clients WHERE id = ?").bind(sub.subject_id).first<{ user_id: string | null }>();
      if (client?.user_id) {
        // Title + link (/shop) come from the type's record; `studioName` is auto.
        await notify(env, { tenantId: sub.tenant_id, userId: client.user_id, type, message, dedupeKey: `${marker}_${sub.id}`, vars });
      }
      // CAS on the notes we read: two overlapping sweeps (or a coach saving a
      // note) must not clobber each other's marker and re-nudge the client.
      await env.DB.prepare("UPDATE subject_subscriptions SET notes = ? WHERE id = ? AND notes IS ?").bind(`${notes} ${marker}`.trim(), sub.id, sub.notes ?? null).run().catch(() => undefined);
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
          .prepare("UPDATE subject_subscriptions SET status = 'expired' WHERE id = ? AND status = 'active' AND budgets_json IS ?")
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
