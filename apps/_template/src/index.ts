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
import { sessionMiddleware, requirePermission, requireTenant, type AppEnv } from "./auth-context.js";
import { createAuth } from "./auth.js";
import { guard } from "./route-guard.js";
import { isPlatformDoor, rootDomain } from "./host-context.js";

export { TenantBillingDO } from "./billing-do.js";
export { InboxDO } from "./inbox-do.js";

const app = new Hono<AppEnv>();

app.use("*", sessionMiddleware);
app.use("*", guard);

app.get("/health", (c) => c.json({ ok: true }));

/**
 * WHICH DOOR IS THIS? The one public read the pre-auth client makes.
 *
 * Note `gate: { ...host.gate }` — the WHOLE gate, spread, never a hand-picked
 * pair of fields. Listing them is how a new rung reaches the model, the resolver
 * and the server while the client still reads the old shape and renders the
 * wrong state for a tenant whose access was withheld.
 */
app.get("/api/host", (c) => {
  const host = c.get("host");
  const t = host.tenant;
  const here = new URL(c.req.url);
  const root = host.shape.root;
  const port = here.port ? `:${here.port}` : "";
  return c.json({
    role: host.shape.role,
    platform: isPlatformDoor(host.shape),
    rootDomain: root || rootDomain(c.env),
    setupUrl: `${here.protocol}//setup.${root}${port}`,
    tenant: t ? { tenantId: t.tenantId, name: t.name, slug: t.slug, branding: t.branding, allowSignup: t.allowSignup } : null,
    gate: host.gate ? { ...host.gate } : null,
  });
});

/** Better Auth owns its whole lane: OTP, passkeys, sessions, organizations. */
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
