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
import { packRoutes } from "./pack-routes.js";
import { stockRoutes } from "./stock-routes.js";
import { emailAdminRoutes } from "@4dl/email/admin-routes";
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
app.route("/api", stockRoutes);
app.route("/api", packRoutes);
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
  { from: "Template <noreply@template.local>" },
) as unknown as Hono<AppEnv>);

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
