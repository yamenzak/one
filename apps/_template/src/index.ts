/**
 * THE WORKER. One entry module, one origin.
 *
 * The API and (once there is one) the SPA are served from the SAME origin, which
 * is not a convenience: the Better Auth session cookie is then same-origin, with
 * no CORS or credentials juggling, and every passkey ceremony binds to the one
 * hostname the user actually came through.
 *
 * ── The middleware ORDER is the security model ──────────────────────────────
 *
 *   sessionMiddleware   resolves host → session → membership OF THAT HOST'S
 *                       tenant, in that order. The tenancy is pinned from the
 *                       hostname before the session is read, so a session
 *                       pointed at the wrong tenant grants nothing.
 *   guard               the five gates, once, for every route beneath it.
 *
 * Routes mounted BEFORE the guard are ungoverned. There is one legitimate
 * reason to do that — a provider webhook that carries its own signature and no
 * session — and it is called out below.
 */

import { Hono } from "hono";
import { newId, nowIso } from "@4dl/core";
import { sessionMiddleware, requirePermission, requireTenant, isPlatformAdmin, type AppEnv } from "./auth-context.js";
import type { Env } from "./env.js";
import { createAuth } from "./auth.js";
import { guard } from "./route-guard.js";
import { domainAdminRoutes, domainRoutes } from "./domain-routes.js";
import { orgCreateGuard, orgUpdateGuard } from "./org-guard.js";
import { emailAdminRoutes } from "@4dl/email/admin-routes";
import { sharedConfigRoutes } from "@4dl/core/admin-routes";
import { maintenanceAdminRoutes, maintenanceMiddleware } from "@4dl/tenancy";
import { notifyRoutes } from "@4dl/notify/routes";
import { aiCatalogAdminRoutes } from "@4dl/ai";
import { planAdminRoutes } from "@4dl/billing";
import { otpSendGuard } from "./otp-guard.js";
import { staffRoutes } from "./staff-routes.js";
import { mediaRoutes } from "./media-routes.js";
import { accountRoutes, tenantCloseRoutes } from "./exit-routes.js";
import { entitlements, PLAN_FEATURE_META, PLAN_QUOTA_META } from "./entitlements.js";
import { seedBilling } from "./billing-store.js";
// Declaring the notification vocabulary is a SIDE EFFECT of importing it —
// `configureNotify` runs at module load, and `notifyRoutes` reads that registry.
// An app that mounts the routes without this import serves an inbox whose every
// type is unknown.
import "./notifications.js";
import type { MiddlewareHandler } from "hono";

export { TenantBillingDO } from "./billing-do.js";
export { InboxDO } from "./inbox-do.js";

const app = new Hono<AppEnv>();

app.use("*", sessionMiddleware);
// Resolve the deployment-wide maintenance switch once per request, between the
// session and the guard: the guard refuses on it and `/api/host` reports it, and
// both must see the same read.
app.use("*", maintenanceMiddleware() as unknown as MiddlewareHandler<AppEnv>);
app.use("*", guard);

app.get("/health", (c) => c.json({ ok: true }));

/**
 * A tenant's slug becomes an ORIGIN, so it is validated before Better Auth
 * stores it — mounted AROUND the pass-through below, never instead of it.
 */
app.use("/api/auth/organization/create", orgCreateGuard);
app.use("/api/auth/organization/update", orgUpdateGuard);

/**
 * ⚠️ THE ONE GATE IN FRONT OF THE SIGN-IN CODE, and it must be mounted BEFORE
 * the catch-all below.
 *
 * Hono matches in registration order, so the wildcard `/api/auth/*` would
 * otherwise answer this path first and the guard would never run — a bypass that
 * typechecks, passes every test, and looks identical in the route list.
 * `scripts/otp-gate.test.mjs` asserts the ORDER for exactly that reason.
 *
 * See `otp-guard.ts` for what the guard carries. Two apps shipped without it.
 */
app.post("/api/auth/email-otp/send-verification-otp", otpSendGuard);

/** Better Auth owns the rest of its lane: OTP verify, passkeys, sessions, orgs. */
app.on(["GET", "POST"], "/api/auth/*", (c) => {
  const auth = createAuth(c.env, new URL(c.req.url).origin, c.get("host").shape);
  return auth.handler(c.req.raw);
});

/**
 * One example route, showing the two gates that are NOT the guard's job.
 *
 * The guard already checked that the caller is a member of this host's tenant
 * and holds `record:create`. What it cannot check is ROW-LEVEL scope — that a
 * row belongs to this tenant, and that a customer may only reach their own.
 * That is the invariant every real route needs and no framework can supply.
 */
app.get("/api/records", async (c) => {
  const who = requireTenant(c);
  if (!who) return c.json({ error: "unauthenticated" }, 401);
  const rows = await c.env.DB
    .prepare("SELECT id, title, subject_id, created_at FROM records WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100")
    .bind(who.tenantId)
    .all();
  return c.json({ records: rows.results ?? [] });
});

app.post("/api/records", async (c) => {
  const denied = requirePermission(c, { record: ["create"] });
  if (denied) return denied;
  const who = requireTenant(c)!;
  type Body = { title?: string; subjectId?: string };
  const body: Body = await c.req.json<Body>().catch(() => ({}) as Body);
  if (!body.title) return c.json({ error: "title is required" }, 400);
  const id = newId("rec");
  await c.env.DB
    .prepare("INSERT INTO records (id, tenant_id, subject_id, title, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, who.tenantId, body.subjectId ?? null, body.title, who.userId, nowIso())
    .run();
  return c.json({ id }, 201);
});

/**
 * `/api/host` — the one PUBLIC read the pre-auth client makes, and the custom-
 * domain surface behind it. Both come from `@4dl/tenancy`, which is why this app
 * does not hand-write a host probe: the door classification, the whole-gate
 * spread and the 404-vs-network distinction are all decisions the package
 * already made correctly.
 */
app.route("/api", domainRoutes);
app.route("/api", domainAdminRoutes);

/**
 * THE INBOX. Four routes, one hibernating WebSocket per user, and a registry
 * this app declared in `notifications.ts`.
 *
 * Mounted from day one because the alternative is what Scena shipped: the schema
 * applied, `InboxDO` bound, sixteen dispatch sites writing rows — and no route
 * to read one back, so every notification the product produced was reachable
 * nowhere a person would look, for three stages.
 */
app.route("/api", notifyRoutes<AppEnv>({ currentUserId: (c) => c.get("user")?.id ?? null }));

/** The roster: invite, revoke, re-role, remove. See `staff-routes.ts`. */
app.route("/api", staffRoutes);

/** Upload, the storage meter, the authed read. See `media-routes.ts`. */
app.route("/api", mediaRoutes);

/**
 * LEAVING. The standing ladder exempts both of these at every rung, so their
 * absence turns that exemption into a trap rather than a feature — see
 * `exit-routes.ts`.
 */
app.route("/api", tenantCloseRoutes);
app.route("/api", accountRoutes);

/**
 * Email configuration, on the operator door. Mounted from day one on purpose:
 * `@4dl/email` fails closed until `email.provider` and `email.from` are set, so
 * an app without these routes is an app whose first deploy cannot send the
 * sign-in code that is the only way in. Kova learned this the expensive way —
 * the endpoints existed but nothing called them, and the deploy guide carried
 * "edit D1 by hand" as a step.
 */
// `c as never` is the house idiom for an injected guard: the seam is
// structural, but Hono's `Context` is invariant enough that the app's fuller env
// is not assignable to the package's narrower one. The alternative — threading a
// type parameter through every handler — forces each call site to name the app's
// full env, which is the coupling the seam exists to avoid.
app.route("/api", emailAdminRoutes(
  { isPlatformAdmin: (c) => isPlatformAdmin(c as never) },
  { from: "Template <noreply@template.local>" },
) as unknown as Hono<AppEnv>);

/**
 * The SHARED platform config store, on the operator door.
 *
 * Every app's console writes the SAME namespace, which is the point: the Google
 * key, the Stripe account, the Cloudflare token and the Turnstile widget are one
 * fact about the platform, not one per product. This app's own `app_config` rows
 * still win — see `packages/core/src/config.ts`.
 */
app.route("/api", sharedConfigRoutes({ isPlatformAdmin: (c) => isPlatformAdmin(c as never) }) as unknown as Hono<AppEnv>);

/**
 * THE PLAN CATALOG, on the operator door — `@4dl/billing`'s routes under
 * `@4dl/admin`'s `PlatformPlansSection`.
 *
 * Three rules ride in with them and every one is invisible from outside: a price
 * change NULLS the plan's Stripe id pair (without which a repriced plan charges
 * the old amount forever, with no error anywhere), lowering a limit
 * GRANDFATHERS whoever is already on the tier, and an omitted `trialDays` means
 * "leave it alone" rather than "no trial". An app that hand-rolls this editor
 * gets none of them — one did, and its help text described the missing
 * grandfathering as the design.
 *
 * The key LIST comes off the bound engine, so a quota added to `entitlements.ts`
 * appears in the editor with no client release. Only the LABELS are here.
 */
app.route("/api", planAdminRoutes({
  isPlatformAdmin: (c) => isPlatformAdmin(c as never),
  seed: seedBilling,
  engine: entitlements,
  quotaMeta: PLAN_QUOTA_META,
  featureMeta: PLAN_FEATURE_META,
}) as unknown as Hono<AppEnv>);

/**
 * THE AI MODEL CATALOG, on the operator door — `@4dl/ai`'s routes under
 * `@4dl/admin`'s `PlatformAiSection`.
 *
 * The rates in `ai_models` are parsed from two public pricing pages and are
 * identical in every product, so a successful sync PUBLISHES them to the shared
 * store and a new app seeds its whole priced catalog the first time this panel
 * is opened — instead of living on the eleven-row hardcoded floor until somebody
 * presses Sync. `appName` is what the "apply to every 4DL app" broadcast is
 * attributed to.
 */
app.route("/api", aiCatalogAdminRoutes({
  isPlatformAdmin: (c) => isPlatformAdmin(c as never),
  appName: "Template",
}) as unknown as Hono<AppEnv>);

/**
 * The maintenance switch, on the operator door.
 *
 * `signOutEveryone` is injected because the session table is `@4dl/auth`'s and
 * because WHO counts as an operator is this app's answer — sign the operator out
 * along with everyone else and they lose the console they are standing in.
 */
app.route("/api", maintenanceAdminRoutes(
  { isPlatformAdmin: (c) => isPlatformAdmin(c as never) },
  {
    signOutEveryone: async (c) => {
      const res = await (c.env as Env).DB
        .prepare('DELETE FROM "session" WHERE userId NOT IN (SELECT id FROM "user" WHERE LOWER(email) IN (SELECT value FROM json_each(?)))')
        .bind(JSON.stringify(((c.env as Env).ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)))
        .run()
        .catch(() => null);
      return res?.meta?.changes ?? 0;
    },
  },
) as unknown as Hono<AppEnv>);

app.notFound((c) => c.json({ error: "not_found" }, 404));

export default {
  fetch: app.fetch,

  /**
   * The scheduled lane. Two things belong here and nothing else:
   *
   *   the DUNNING sweep    `@4dl/billing`'s ladder, anchored on `past_due_at`,
   *                        driven daily. Without a cron the ladder never
   *                        advances and a lapsed tenant stays fully served.
   *   the tenant LAPSE     `@4dl/commerce`'s customer-side ladder, which must
   *                        FREEZE unless the tenant is itself in good standing:
   *                        a tenant the platform suspended must not be shredding
   *                        a roster it can no longer see.
   *
   * `@4dl/commerce` budgets need NO cron — status reconciles lazily on read.
   */
  async scheduled(_event: ScheduledController, _env: unknown, _ctx: ExecutionContext): Promise<void> {
    // Wire `dailySweep` here once the app bills. Left empty rather than stubbed
    // so it fails as "nothing happens" instead of "something happened wrongly".
  },
};
