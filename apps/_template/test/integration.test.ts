/**
 * THE GOLDEN PATH, over real HTTP.
 *
 * The conformance tests read declarations; this one drives the actual worker
 * through Miniflare — the same Hono app, the same Better Auth, the same D1 — and
 * that difference is the point. Everything here is a wiring failure that
 * typechecks perfectly:
 *
 *   a middleware in the wrong ORDER, so the guard runs before the identity
 *   a route mounted on the wrong PREFIX, so it 404s on the door it needs
 *   a schema module missing from the composed list, so a table never exists
 *   an auth callback that throws, which Better Auth SWALLOWS while still
 *     returning `200 {"success":true}`
 *
 * Start here on day one. Nothing else catches this class, and it is the class a
 * new app produces most.
 *
 * ── Two things about the environment, both real ─────────────────────────────
 *
 * **The host IS the tenancy**, in tests too. Miniflare preserves the Host header
 * and browsers resolve `*.localhost` to loopback, so signing in happens on
 * `setup.localhost` and tenant behaviour is asserted on `<slug>.localhost`. That
 * is the shipped topology, not a simulation of it.
 *
 * **Every test user is a platform admin** (`ADMIN_EMAILS: ""` +
 * `ENVIRONMENT: "development"` — see `vitest.config.ts`). So a route-guard
 * action gate cannot be observed failing here. Assert authorization through
 * something that does not consult platform-admin status: row-level scope, or an
 * in-handler check.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";

const SETUP = "http://setup.localhost:8787";
const db = () => env.DB as D1Database;

/** Cookie jar helper — the session cookie is HttpOnly, so tests carry it by hand. */
function cookies(res: Response): string {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  return (h.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

/**
 * Read the freshest sign-in code straight out of D1.
 *
 * NEVER out of a log. The mock mailer prints it in development, but a test that
 * scrapes stdout passes for the wrong reason the moment the provider changes —
 * and the `verification` table is where Better Auth actually put it.
 */
async function latestOtp(email: string): Promise<string> {
  const row = await db()
    .prepare("SELECT value FROM verification WHERE identifier LIKE ? ORDER BY createdAt DESC LIMIT 1")
    .bind(`%otp%${email}%`)
    .first<{ value: string }>();
  const otp = (row?.value ?? "").match(/\d{6}/)?.[0];
  if (!otp) throw new Error(`no OTP in the verification table for ${email}`);
  return otp;
}

async function signIn(email: string): Promise<string> {
  await SELF.fetch(`${SETUP}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SETUP },
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  return cookies(
    await SELF.fetch(`${SETUP}/api/auth/sign-in/email-otp`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: SETUP },
      body: JSON.stringify({ email, otp: await latestOtp(email) }),
    }),
  );
}

beforeAll(async () => {
  await ensureSchema(db());
});

describe("the doors", () => {
  it("answers the host probe with the door it is on", async () => {
    const res = await SELF.fetch(`${SETUP}/api/host`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { role: string; platform: boolean; tenant: unknown };
    expect(body.role).toBe("setup");
    expect(body.platform).toBe(true);
    // No tenant behind a platform door — and `null` here is an ANSWER, not an
    // absence. A client that reads it as "still loading" renders forever.
    expect(body.tenant).toBeNull();
  });

  it("serves the probe and nothing else on a hostname owning no tenant", async () => {
    const nowhere = "http://nobody.localhost:8787";
    expect((await SELF.fetch(`${nowhere}/api/host`)).status).toBe(200);
    // This is the hole worth having a test for: the auth lane is PUBLIC, so an
    // unowned hostname that answered it would let a stranger request a code,
    // verify it, and mint a tenant from an address belonging to nobody — which
    // includes the `*.workers.dev` name Cloudflare publishes for every worker.
    const res = await SELF.fetch(`${nowhere}/api/records`);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("sign-up, then the app", () => {
  it("creates a workspace, gives it a hostname, and scopes a record to it", async () => {
    const email = `owner-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const slug = `acme-${crypto.randomUUID().slice(0, 6)}`;
    const jar = await signIn(email);
    const auth = { cookie: jar } as Record<string, string>;

    // Better Auth mints the organization; `orgCreateGuard` validates the slug as
    // a DNS label and provisions the hostname behind it.
    const created = await SELF.fetch(`${SETUP}/api/auth/organization/create`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: SETUP, ...auth },
      body: JSON.stringify({ name: "Acme", slug }),
    });
    expect(created.status, await created.text().catch(() => "")).toBeLessThan(300);

    // The hostname row is what every emailed link and the sign-out target are
    // built from. A workspace without one is a workspace nobody can reach.
    const host = await db()
      .prepare("SELECT hostname, kind FROM tenant_domains WHERE hostname = ?")
      .bind(`${slug}.localhost`)
      .first<{ hostname: string; kind: string }>();
    expect(host?.kind).toBe("subdomain");

    // …and the tenant door now resolves it, pre-auth.
    const origin = `http://${slug}.localhost:8787`;
    const probe = (await (await SELF.fetch(`${origin}/api/host`)).json()) as { role: string; tenant: { slug: string } | null };
    expect(probe.role).toBe("tenant");
    expect(probe.tenant?.slug).toBe(slug);

    // A write on the tenant door lands, scoped to that tenant.
    const post = await SELF.fetch(`${origin}/api/records`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, ...auth },
      body: JSON.stringify({ title: "first" }),
    });
    expect(post.status, await post.text().catch(() => "")).toBe(201);

    const list = (await (await SELF.fetch(`${origin}/api/records`, { headers: auth })).json()) as {
      records: { title: string }[];
    };
    expect(list.records.map((r) => r.title)).toContain("first");
  });

  it("refuses a slug that would take over one of the platform's own doors", async () => {
    // The slug becomes an ORIGIN, and an origin is a trust boundary: `admin`
    // would be served at the operator console's URL, and every one of these
    // receives the root-scoped session cookie.
    const jar = await signIn(`taker-${crypto.randomUUID().slice(0, 8)}@example.com`);
    for (const slug of ["admin", "setup", "autodiscover"]) {
      const res = await SELF.fetch(`${SETUP}/api/auth/organization/create`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: SETUP, cookie: jar },
        body: JSON.stringify({ name: slug, slug }),
      });
      expect(res.status, slug).toBe(400);
      expect(((await res.json()) as { code?: string }).code, slug).toBe("INVALID_SLUG");
    }
  });
});

describe("what an unauthenticated caller can reach", () => {
  it("is the public lane, and nothing that touches a tenant's data", async () => {
    expect((await SELF.fetch(`${SETUP}/health`)).status).toBe(200);
    expect((await SELF.fetch(`${SETUP}/api/host`)).status).toBe(200);
    // No session ⇒ no tenant ⇒ refused. The guard runs before any handler, so
    // this also proves the middleware ORDER is right: were it reversed, the
    // handler would run first and throw on a null identity instead.
    const res = await SELF.fetch(`${SETUP}/api/records`);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

/**
 * The maintenance switch, wired.
 *
 * One test, because the LEVELS are `@4dl/tenancy`'s and are covered by its own
 * suite. What can only fail here is the wiring: the middleware mounted after the
 * guard instead of before it (the switch resolves to nothing and withholds
 * nothing), or `maintenanceExempt` forgetting the host probe (the app can no
 * longer tell "closed" from "broken"). Both typecheck perfectly.
 *
 * Signed out on purpose — every test user here is a platform admin, and a
 * platform admin is exempt from this gate by design.
 */
describe("maintenance", () => {
  it("closes the deployment while still answering the host probe", async () => {
    const put = "INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value";
    await db().prepare(put).bind("platform.maintenance", "full").run();
    try {
      const closed = await SELF.fetch(`${SETUP}/api/records`);
      expect(closed.status).toBe(503);
      expect(await closed.json()).toMatchObject({ error: "maintenance", level: "full" });

      const probe = await SELF.fetch(`${SETUP}/api/host`);
      expect(probe.status).toBe(200);
      expect(await probe.json()).toMatchObject({ maintenance: { level: "full" } });
    } finally {
      await db().prepare(put).bind("platform.maintenance", "off").run();
    }
  });
});
