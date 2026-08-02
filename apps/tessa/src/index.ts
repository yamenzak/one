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
import { caseRoutes } from "./case-routes.js";
import { contextRoutes } from "./context-routes.js";
import { notifyRoutes } from "@4dl/notify/routes";
// Importing the binding is also what INSTALLS the registry (`notifications.ts`
// calls `configureNotify` at module scope). The routes below read it to scope
// "mark all read", so the import is load-bearing even where `notify` is unused.
import { notifyRole } from "./notify.js";
import { accountRoutes, tenantCloseRoutes } from "./exit-routes.js";
import { mediaRoutes } from "./media-routes.js";
import { cycleRoutes } from "./cycle-routes.js";
import { packRoutes } from "./pack-routes.js";
import { stockRoutes } from "./stock-routes.js";
import { emailAdminRoutes } from "@4dl/email/admin-routes";
import { sharedConfigRoutes } from "@4dl/core/admin-routes";
import { PLATFORM_FROM_DEFAULT } from "./mailer.js";
import { DUNNING_DAYS } from "@4dl/billing";
import { periodKey } from "@4dl/core";
import { billingAdminRoutes, billingRoutes, stripeWebhookRoutes } from "./billing-routes.js";
import { aiAdminRoutes, aiRoutes } from "./ai-routes.js";
import { aiCatalogAdminRoutes } from "@4dl/ai";
import { settingsRoutes } from "./settings-routes.js";
import { insightRoutes } from "./insight-routes.js";
import { staffRoutes } from "./staff-routes.js";
import { entitlements } from "./entitlements.js";
import { listPlans, seedBilling } from "./billing-store.js";
import { ensureSchema } from "./db.js";
import { purgeTenant } from "./purge.js";
import { maintenanceAdminRoutes, maintenanceMiddleware } from "@4dl/tenancy";
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

/** Better Auth owns its whole lane: OTP, passkeys, sessions, organizations. */
app.on(["GET", "POST"], "/api/auth/*", (c) => {
  const auth = createAuth(c.env, new URL(c.req.url).origin, c.get("host").shape);
  return auth.handler(c.req.raw);
});

/**
 * THE CATALOG — Tessa's first real routes, and the shape every later one copies.
 *
 * The guard has already established that the caller is a member of THIS host's
 * tenant and holds the right grant. What it cannot establish is ROW-LEVEL scope:
 * that row 47 belongs to them. `WHERE tenant_id = ?` on every read and write is
 * that scope here, and it is not optional on any route that follows.
 *
 * A catalog item is the TYPE of a thing (TESSA.md §3.1) — "Sterile gauze 10x10",
 * "Kelly forceps 14cm" — never a physical object. The physical ones are lots,
 * units and packs, and each has its own lifecycle.
 */
app.get("/api/catalog", async (c) => {
  const who = requireTenant(c);
  if (!who) return c.json({ error: "unauthenticated" }, 401);
  const rows = await c.env.DB
    .prepare("SELECT id, name, code, kind, tracking, gtin, consumption, post_opening_days, sterile_shelf_days, reprocessing_class, par_level, created_at FROM catalog_items WHERE tenant_id = ? AND active = 1 ORDER BY name LIMIT 500")
    .bind(who.tenantId)
    .all();
  return c.json({ items: rows.results ?? [] });
});

app.post("/api/catalog", async (c) => {
  const denied = requirePermission(c, { catalog: ["create"] });
  if (denied) return denied;
  const who = requireTenant(c)!;
  type Body = {
    name?: string;
    code?: string;
    kind?: string;
    tracking?: string;
    gtin?: string;
    consumption?: string;
    postOpeningDays?: number;
    sterileShelfDays?: number;
    reprocessingClass?: string;
  };
  const body: Body = await c.req.json<Body>().catch(() => ({}) as Body);
  if (!body.name) return c.json({ error: "name is required" }, 400);

  /**
   * Closed vocabularies, validated here rather than trusted.
   *
   * `tracking` decides which instance table a physical thing lands in, and
   * `consumption` decides whether opening commits the whole thing. A typo in
   * either does not fail loudly — it produces an item whose lifecycle silently
   * does not match the object on the shelf.
   */
  const kind = body.kind ?? "consumable";
  const tracking = body.tracking ?? "lot";
  const consumption = body.consumption ?? "discrete";
  if (!["consumable", "instrument", "equipment"].includes(kind)) return c.json({ error: "unknown kind" }, 400);
  if (!["lot", "unit", "none"].includes(tracking)) return c.json({ error: "unknown tracking" }, 400);
  if (!["divisible", "discrete", "single_use_on_open"].includes(consumption)) return c.json({ error: "unknown consumption" }, 400);

  const id = newId("cat");
  await c.env.DB
    .prepare("INSERT INTO catalog_items (id, tenant_id, name, code, kind, tracking, gtin, consumption, post_opening_days, sterile_shelf_days, reprocessing_class, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)")
    .bind(
      id, who.tenantId, body.name, body.code ?? null, kind, tracking, body.gtin ?? null, consumption,
      body.postOpeningDays ?? null, body.sterileShelfDays ?? null, body.reprocessingClass ?? null,
      nowIso(), nowIso(),
    )
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
app.route("/api", contextRoutes);
/**
 * The inbox: the list, the two mark-read writes, and the `InboxDO` socket.
 *
 * This app exported the DO, bound it in `wrangler.jsonc`, pinned its class name
 * in a migration and applied four tables — and had no way to reach any of it,
 * for as long as these four routes lived inside the other app's context tree.
 */
app.route("/api", notifyRoutes<AppEnv>({ currentUserId: (c) => c.get("user")?.id ?? null }));
/**
 * Billing: the picker, the two checkouts, the portal — and the webhook.
 *
 * The webhook sits UNDER the guard here rather than before it, which is safe
 * only because `/api/webhooks/*` is in the guard's `isPublic` list. Mounting it
 * above the middleware would work too, and would silently opt it out of the
 * maintenance switch and the read-only gate — both of which it needs to pass
 * *deliberately*, not by accident of mount order.
 */
app.route("/api", billingRoutes);
app.route("/api", settingsRoutes);
app.route("/api", staffRoutes);
/**
 * LEAVING. `route-guard.ts` has exempted `/api/tenant/close` from the read-only
 * gate since it was written — the ladder is built so that paying is A way out
 * and not the ONLY one — and until now the route it exempted did not exist, so
 * a suspended centre had every write refused and no way to shut itself down.
 * `/api/me/*` is exempt for the same reason: a person may always leave.
 */
/**
 * Media. The bucket has been bound since day one and written to from exactly one
 * place — `@4dl/ai`'s vision lane — so nobody could attach the autoclave
 * printout that `/cycles/:id/end` has always accepted a key for.
 */
app.route("/api", mediaRoutes);
app.route("/api", tenantCloseRoutes);
app.route("/api", accountRoutes);
app.route("/api", insightRoutes);
app.route("/api", aiRoutes);
app.route("/api", stripeWebhookRoutes);
app.route("/api", billingAdminRoutes);
app.route("/api", aiAdminRoutes);
// The provider key, mock lane, credit markup and model catalog are
// `@4dl/ai`'s state, so their console endpoints are `@4dl/ai`'s routes.
app.route("/api", aiCatalogAdminRoutes({ isPlatformAdmin: (c) => isPlatformAdmin(c as never) }) as unknown as Hono<AppEnv>);
app.route("/api", stockRoutes);
app.route("/api", packRoutes);
app.route("/api", cycleRoutes);
app.route("/api", caseRoutes);
app.route("/api", domainRoutes);
app.route("/api", domainAdminRoutes);

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
  // The value the console SHOWS when nothing is stored. It must match what
  // provisioning seeds, or the screen advertises a sender the deployment does
  // not use — this said `Template <noreply@template.local>` until now.
  { from: PLATFORM_FROM_DEFAULT },
) as unknown as Hono<AppEnv>);

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
   * The scheduled lane.
   *
   * Only ONE thing belongs here: `@4dl/billing`'s dunning ladder, anchored on
   * `past_due_at`. Without a cron the ladder never advances and a lapsed centre
   * stays fully served forever.
   *
   * Tessa has no second ladder. Kova runs `@4dl/commerce`'s customer-side lapse
   * because a studio sells packages to its clients; a sterile-supply centre
   * sells nothing to anybody, so there is no customer standing to sweep.
   *
   * The 15-minute trigger is deliberately a no-op — the cron list in
   * `wrangler.jsonc` carries it for future work, and doing the daily ladder on
   * every tick would advance it 96× too fast.
   */
  async scheduled(event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    if (event.cron !== DAILY_CRON) return;
    await dailySweep(env);
  },
};

/** Must match `wrangler.jsonc`'s `triggers.crons` entry exactly. */
const DAILY_CRON = "10 0 * * *";

const dunningCutoff = (nowMs: number, days: number) => new Date(nowMs - days * 86_400_000).toISOString();

/**
 * THE LADDER, once a day: past_due → 7d read-only → 30d blocked → 37d purged.
 *
 * Every phase is isolated. This sweep is the only thing that grants monthly
 * credits and the only thing that advances the lifecycle, and it runs once a
 * day — so a single transient D1 error aborting the whole run from the first
 * statement would mean paying centres silently received no credits that month.
 * Kova had exactly that bug; `step` is the fix.
 *
 * **Reads are never gated, at any rung.** `readOnly` still serves the whole app.
 * Withholding a centre's sterilisation records over an invoice would put a
 * recall out of reach of the people who need to run it — the ledger is a legal
 * document under MPBetreibV, not leverage.
 */
async function dailySweep(env: Env): Promise<void> {
  const step = async (name: string, fn: () => Promise<void>) => {
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
  const nowStamp = new Date(nowMs).toISOString();

  // 1) Monthly credit grants. `grantMonthly` is keyed by period, so a centre
  //    that already received this month's grant at checkout is not granted twice.
  await step("monthly-grants", async () => {
    const plans = await listPlans(env.DB);
    const grants = new Map(plans.map((p) => [p.id, entitlements.resolve(p.entitlements_json).aiCredits.monthlyGrant]));
    const active = await env.DB
      .prepare("SELECT tenant_id, plan_id FROM subscriptions WHERE status IN ('active','trialing')")
      .all<{ tenant_id: string; plan_id: string }>();
    const key = periodKey();
    for (const sub of active.results ?? []) {
      const grant = grants.get(sub.plan_id) ?? 0;
      if (grant <= 0) continue;
      const stub = env.BILLING.get(env.BILLING.idFromName(sub.tenant_id));
      await stub.bind(sub.tenant_id);
      // Money path: a swallowed failure means a paying centre silently never
      // receives its credits. Surface it.
      await stub.grantMonthly(grant, key).catch((e) => console.error(`[dailySweep] grantMonthly ${sub.tenant_id}:`, e));
    }
  });

  /**
   * Who is about to move down a rung. Read BEFORE the update, because the
   * `WHERE` that selects them is the same one that stops selecting them.
   *
   * A rung that arrives unannounced is the complaint every dunning ladder
   * generates: the centre discovers it is read-only by trying to record a load,
   * which in a CSSD is the worst possible moment to find out. `dedupeKey` is the
   * rung itself, so a sweep that runs twice in a day sends once.
   */
  const aboutToFall = async (from: string, cutoffDays: number): Promise<string[]> => {
    const rows = await env.DB
      .prepare("SELECT tenant_id FROM subscriptions WHERE status = ? AND comp = 0 AND past_due_at IS NOT NULL AND past_due_at < ?")
      .bind(from, dunningCutoff(nowMs, cutoffDays))
      .all<{ tenant_id: string }>()
      .catch(() => ({ results: [] as { tenant_id: string }[] }));
    return (rows.results ?? []).map((r) => r.tenant_id);
  };

  // 2) Rung one — read-only. The centre keeps the whole app and loses the
  //    ability to write to it. `comp = 0` excludes centres the operator comped.
  await step("dunning-read-only", async () => {
    const falling = await aboutToFall("past_due", DUNNING_DAYS.readOnly);
    await env.DB
      .prepare("UPDATE subscriptions SET status = 'suspended', suspend_at = ?, updated_at = ? WHERE status = 'past_due' AND comp = 0 AND past_due_at IS NOT NULL AND past_due_at < ?")
      .bind(nowStamp, nowStamp, dunningCutoff(nowMs, DUNNING_DAYS.readOnly))
      .run();
    for (const tenantId of falling) {
      await notifyRole(env, tenantId, "owner", {
        type: "billing_suspended",
        message: `Tessa is read-only until the invoice is settled. Your records stay readable — a recall is never withheld — but nothing new can be recorded. ${DUNNING_DAYS.blocked - DUNNING_DAYS.readOnly} days from now the app itself is withheld.`,
        dedupeKey: `dun_suspended_${tenantId}`,
      });
    }
  });

  // 3) Rung two — blocked. The app itself is withheld, and the purge clock is
  //    stamped so the centre (and this sweep) can both see the deadline.
  await step("dunning-blocked", async () => {
    const falling = await aboutToFall("suspended", DUNNING_DAYS.blocked);
    await env.DB
      .prepare("UPDATE subscriptions SET status = 'blocked', delete_at = ?, updated_at = ? WHERE status = 'suspended' AND comp = 0 AND past_due_at IS NOT NULL AND past_due_at < ?")
      .bind(
        new Date(nowMs + (DUNNING_DAYS.purge - DUNNING_DAYS.blocked) * 86_400_000).toISOString(),
        nowStamp,
        dunningCutoff(nowMs, DUNNING_DAYS.blocked),
      )
      .run();
    for (const tenantId of falling) {
      await notifyRole(env, tenantId, "owner", {
        type: "billing_canceled",
        title: "Tessa is now withheld",
        message: `Your centre's data is intact and is deleted in ${DUNNING_DAYS.purge - DUNNING_DAYS.blocked} days unless the invoice is settled. Settling restores everything.`,
        dedupeKey: `dun_blocked_${tenantId}`,
      });
    }
  });

  // 4) Rung three — PURGE, 37 days after the first missed payment.
  await step("dunning-purge", async () => {
    const rows = await env.DB
      .prepare("SELECT tenant_id FROM subscriptions WHERE status = 'blocked' AND comp = 0 AND past_due_at IS NOT NULL AND past_due_at < ?")
      .bind(dunningCutoff(nowMs, DUNNING_DAYS.purge))
      .all<{ tenant_id: string }>()
      .catch(() => ({ results: [] as { tenant_id: string }[] }));
    for (const s of rows.results ?? []) {
      await purgeTenant(env, s.tenant_id).catch((e) => console.error(`[dailySweep] purge ${s.tenant_id}:`, e));
    }
  });
}
