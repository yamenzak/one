/**
 * THE AUTH GOLDEN PATH, over real HTTP.
 *
 * The rest of `test/` reads declarations. This drives the actual worker through
 * Miniflare — the same Hono app, the same Better Auth, the same D1 — and that
 * difference is the whole point. Every assertion here corresponds to a failure
 * that typechecks perfectly and that all 141 unit tests pass through:
 *
 *   a schema module missing from the composed list, so a table never exists
 *   a table another module bootstrapped first, so an ADD COLUMN never happened
 *   a route mounted on the wrong prefix, so it 404s on the door it needs
 *   an auth provider whose default opens an endpoint nobody meant to open
 *   an auth callback that throws, which Better Auth SWALLOWS while still
 *     answering `200 {"success":true}`
 *
 * Four of those were real, in this app, in Stage 2 — found by hand against a
 * running `wrangler dev` because this file did not exist yet. It exists now so
 * the remaining stages do not have to be found the same way.
 *
 * ⚠️ EVERY TEST USER IS A PLATFORM ADMIN here (`ADMIN_EMAILS: ""` +
 * `ENVIRONMENT: "development"` — see `vitest.config.ts`), so the route guard's
 * action gate cannot be observed refusing. Authorization is asserted through
 * paths that do NOT consult platform-admin status: the seat ceiling, the
 * derived role grant, and the credential lane's own boundary.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";
import { ensureBilling } from "../src/billing-store.js";
import { STATION_DOMAIN } from "../src/auth.js";
import { purgeTenant } from "../src/purge.js";
import { raiseAlert } from "../src/alerts.js";

/*
  THE HOST IS THE TENANCY, IN TESTS TOO.

  Miniflare preserves the Host header exactly as the edge does, and `*.localhost`
  resolves to loopback, so this is the shipped topology rather than a simulation
  of it: sign-in happens on `setup.localhost`, workspace behaviour is asserted on
  `<slug>.localhost`, and the device door is a third address.

  This suite used to drive one origin. Stage 3 broke six of its tests, correctly:
  a tenant-scoped route on the ROOT door is a route on a signpost, and the guard
  now refuses it. Pointing them at the right door is the fix; widening the guard
  would not have been.
*/
const ROOT = "http://localhost:8787";
const SETUP = "http://setup.localhost:8787";
const DEVICE = "http://play.localhost:8787";
/** A workspace's own door. */
const at = (slug: string) => `http://${slug}.localhost:8787`;

const db = () => env.DB as D1Database;

/** Cookie jar helper — the session cookie is HttpOnly, so tests carry it by hand. */
function cookies(res: Response): string {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  return (h.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

/** JSON headers with the ORIGIN matching the door being driven — Better Auth
 *  1.6.23 trusts only the request's own origin, whatever `trustedOrigins` says. */
const json = (origin: string, cookie?: string): Record<string, string> => ({
  "content-type": "application/json",
  origin,
  ...(cookie ? { cookie } : {}),
});

/**
 * Read the freshest sign-in code straight out of D1.
 *
 * NEVER out of a log. The mock mailer prints it in development, but a test that
 * scrapes stdout passes for the wrong reason the moment the provider changes —
 * and `verification` is where Better Auth actually put it.
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

/** Sign in on the SETUP door — the only place a workspace is created. */
async function signIn(email: string): Promise<string> {
  await SELF.fetch(`${SETUP}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers: json(SETUP),
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  const res = await SELF.fetch(`${SETUP}/api/auth/sign-in/email-otp`, {
    method: "POST",
    headers: json(SETUP),
    body: JSON.stringify({ email, otp: await latestOtp(email) }),
  });
  expect(res.status, `sign-in for ${email}`).toBe(200);
  return cookies(res);
}

/**
 * A fresh owner with their own workspace, and its DOOR.
 *
 * `door` is what every later call uses. The cookie is carried by hand across
 * hosts because a `Domain` attribute is rejected for `localhost`, so each
 * `*.localhost` has its own jar in a browser — production issues one cookie for
 * the whole root and one sign-in covers every workspace. That is a documented
 * dev-only difference, not a shortcut here.
 */
async function newWorkspace(tag: string): Promise<{ cookie: string; slug: string; door: string; email: string }> {
  const n = Math.abs(Number(BigInt(Date.now()) % 1_000_000n)) + Math.floor(performance.now());
  const slug = `${tag}-${n}`;
  const email = `${slug}@example.com`;
  let cookie = await signIn(email);

  const created = await SELF.fetch(`${SETUP}/api/auth/organization/create`, {
    method: "POST",
    headers: json(SETUP, cookie),
    body: JSON.stringify({ name: `Workspace ${n}`, slug }),
  });
  expect(created.status, "organization/create").toBe(200);

  const active = await SELF.fetch(`${SETUP}/api/auth/organization/set-active`, {
    method: "POST",
    headers: json(SETUP, cookie),
    body: JSON.stringify({ organizationSlug: slug }),
  });
  cookie = cookies(active) || cookie;
  return { cookie, slug, door: at(slug), email };
}

/** Put a workspace on a named plan without going through Stripe. */
async function setPlan(slug: string, planId: string): Promise<void> {
  const org = await db().prepare('SELECT id FROM "organization" WHERE slug = ?').bind(slug).first<{ id: string }>();
  await db()
    .prepare("INSERT INTO subscriptions (tenant_id, plan_id, status) VALUES (?, ?, 'active') ON CONFLICT(tenant_id) DO UPDATE SET plan_id = excluded.plan_id")
    .bind(org!.id, planId)
    .run();
}

beforeAll(async () => {
  await ensureSchema(db());
  /*
    The plan catalog seeds LAZILY, on the first `getSubscription`. `setPlan`
    below writes a `subscriptions` row directly, and a row naming a plan that
    does not exist yet resolves to FREE_ENTITLEMENTS — so every seat number and
    every feature gate reads as the floor, and six tests fail for a reason that
    has nothing to do with what they assert. Seeding here is the harness's job,
    not a workaround: production seeds on the first authenticated request.
  */
  await ensureBilling(db());
});

describe("the composed schema actually applies", () => {
  it("creates the tables BOTH modules own", async () => {
    // `AUTH_SCHEMA` first, `SCENA_SCHEMA` second — a module missing from the
    // list is not an error, it is a table that never exists and a 500 on one
    // route, months later.
    const names = new Set(
      (
        await db()
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all<{ name: string }>()
      ).results?.map((r) => r.name) ?? [],
    );
    for (const t of ["user", "session", "account", "verification", "organization", "member", "invitation"]) {
      expect(names.has(t), `@4dl/auth's "${t}" is missing`).toBe(true);
    }
    // Three tables Scena never had and gets for free with the module.
    for (const t of ["passkey", "auth_logs", "action_otps"]) {
      expect(names.has(t), `@4dl/auth's ${t} is missing`).toBe(true);
    }
    for (const t of ["screens", "channels", "boards", "board_users", "subscriptions"]) {
      expect(names.has(t), `Scena's ${t} is missing`).toBe(true);
    }
  });

  it("has app_config.updated_at, which the bootstrap does NOT create", async () => {
    /*
      The exact Stage 1 regression, and the reason this file exists.

      `@4dl/core` must create `app_config (key, value)` before it can read a
      single marker row, so Scena's wider `CREATE TABLE IF NOT EXISTS` always
      found the table already there and did nothing. Every config write and the
      whole plan-catalog seed then died on `no column named updated_at` — on a
      FRESH database only, while an existing one worked perfectly. An ALTER is
      the only shape that is right on both.
    */
    const cols = (
      await db().prepare("PRAGMA table_info(app_config)").all<{ name: string }>()
    ).results?.map((c) => c.name);
    expect(cols).toContain("updated_at");
  });

  it("seeds the plan catalog, which is the write that used to fail", async () => {
    // `INSERT OR IGNORE INTO app_config (key, value, updated_at)` was the exact
    // statement that died on a fresh database, and it runs inside this seed.
    const plans = await db().prepare("SELECT COUNT(*) AS n FROM plans").first<{ n: number }>();
    expect(plans!.n).toBeGreaterThan(0);
    const cfg = await db().prepare("SELECT COUNT(*) AS n FROM app_config WHERE key LIKE 'email.%'").first<{ n: number }>();
    expect(cfg!.n).toBeGreaterThan(0);
  });

  it("seeds the sender the platform actually onboarded", async () => {
    // A seeded row BEATS `PLATFORM_FROM_DEFAULT`, so the constant being right is
    // not enough — this asserts the row. It read `noreply@fourdegreelabs.com`,
    // a domain nobody onboarded, which would have bounced every message.
    const row = await db().prepare("SELECT value FROM app_config WHERE key = 'email.from'").first<{ value: string }>();
    expect(row?.value).toContain("@4dl.app");
  });
});

describe("the doors", () => {
  it("answers the host probe with the door it is on", async () => {
    const body = (await (await SELF.fetch(`${SETUP}/api/host`)).json()) as {
      role: string;
      tenant: unknown;
    };
    expect(body.role).toBe("setup");
    // No workspace behind a platform door — and `null` here is an ANSWER, not an
    // absence. A client that reads it as "still loading" renders forever.
    expect(body.tenant).toBeNull();
  });

  it("names the workspace on its own door", async () => {
    const { slug, door } = await newWorkspace("door");
    const body = (await (await SELF.fetch(`${door}/api/host`)).json()) as {
      role: string;
      tenant: { slug: string } | null;
    };
    expect(body.role).toBe("tenant");
    expect(body.tenant?.slug).toBe(slug);
  });

  it("serves NOTHING but the probe on a well-formed subdomain nobody owns", async () => {
    // Not a 500 and not a sign-in form. A sign-in form on an unclaimed
    // subdomain is an invitation to authenticate somewhere that does not exist.
    const nowhere = at("nobody-owns-this-one");
    const probe = await SELF.fetch(`${nowhere}/api/host`);
    expect(probe.status).toBe(200);
    expect(((await probe.json()) as { tenant: unknown }).tenant).toBeNull();

    /*
      THE HOLE THIS CLOSES, and it is why `allowedWithoutTenant` is narrower
      than `allowedOnRoot`: the auth lane is PUBLIC, so on an unowned hostname —
      including the `*.workers.dev` name Cloudflare publishes for every worker,
      which anyone can guess — a stranger could otherwise request a sign-in code,
      verify it, and mint a workspace from an address that belongs to nobody.
    */
    const auth = await SELF.fetch(`${nowhere}/api/auth/email-otp/send-verification-otp`, {
      method: "POST",
      headers: json(nowhere),
      body: JSON.stringify({ email: "stranger@example.com", type: "sign-in" }),
    });
    expect(auth.status).toBe(404);
  });

  it("keeps the ROOT a signpost — a workspace route is not served there", async () => {
    const { cookie } = await newWorkspace("rootdoor");
    const res = await SELF.fetch(`${ROOT}/api/staff`, { headers: { cookie } });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe("wrong_door");
  });

  it("REFUSES a reserved label as a workspace slug", async () => {
    // A DNS label is an origin and an origin is a trust boundary. A workspace at
    // `admin` would be served the operator console's URL; one at `play` would be
    // served every screen's manifest request.
    const cookie = await signIn(`reserved-${Math.floor(performance.now())}@example.com`);
    for (const slug of ["admin", "setup", "play", "autodiscover", "api"]) {
      const res = await SELF.fetch(`${SETUP}/api/auth/organization/create`, {
        method: "POST",
        headers: json(SETUP, cookie),
        body: JSON.stringify({ name: "Nope", slug }),
      });
      expect(res.status, `"${slug}" was accepted as a slug`).toBe(400);
    }
  });

  it("gives a new workspace an ADDRESS, not just a row", async () => {
    // A workspace with no hostname is a workspace nobody can reach: every invite
    // link, every screen's pairing target and the owner's next visit are built
    // from it. The slug guard provisions it at create time for that reason.
    const { slug } = await newWorkspace("addr");
    const row = await db()
      .prepare("SELECT hostname, kind FROM tenant_domains WHERE hostname = ?")
      .bind(`${slug}.localhost`)
      .first<{ hostname: string; kind: string }>();
    expect(row?.hostname).toBe(`${slug}.localhost`);
  });
});

describe("the device door", () => {
  it("is its own door and resolves no workspace", async () => {
    /*
      A screen is a DEVICE: one pinned URL, Service-Worker-cached, running for
      months offline. Its tenancy arrives from the pairing CLAIM, so the whole
      fleet shares this one origin and survives being re-paired — which a
      workspace subdomain could not do, and custom domains would price by the
      size of the fleet.
    */
    const body = (await (await SELF.fetch(`${DEVICE}/api/host`)).json()) as {
      role: string;
      tenant: unknown;
    };
    expect(body.role).toBe("device");
    expect(body.tenant).toBeNull();
  });

  it("does not 404 for the missing tenant the way an unowned subdomain does", async () => {
    // The distinction the guard has to make: `play.` is not a hostname that
    // FAILED to resolve a workspace, it is one that was never going to.
    const res = await SELF.fetch(`${DEVICE}/health`);
    expect(res.status).toBe(200);
  });
});

describe("signing in", () => {
  it("takes a person from an address to a session with no password anywhere", async () => {
    const { cookie, door, email } = await newWorkspace("signin");
    const me = (await (await SELF.fetch(`${door}/api/me`, { headers: { cookie } })).json()) as {
      authenticated: boolean;
      email: string;
      role: string;
      tenantId: string | null;
    };
    expect(me.authenticated).toBe(true);
    expect(me.email).toBe(email);
    expect(me.role).toBe("owner");
    expect(me.tenantId).toBeTruthy();
  });

  it("REFUSES public password sign-up, which the station lane would otherwise open", async () => {
    /*
      The hole, as it actually behaved. Enabling the credential provider for
      stations also enables Better Auth's own registration endpoint for ANY
      address — verified against a running worker before the fix: a stranger
      registered `attacker@example.com` with a password of their choosing and
      signed in with it on the next request.

      `autoSignIn: false` withholds the token on the sign-up RESPONSE, which is
      what made it easy to miss: the endpoint reads as though it refused.
    */
    const res = await SELF.fetch(`${SETUP}/api/auth/sign-up/email`, {
      method: "POST",
      headers: json(SETUP),
      body: JSON.stringify({ email: "stranger@example.com", password: "hunter2hunter2", name: "S" }),
    });
    expect(res.status).not.toBe(200);

    // And the account must not exist — a 4xx with a row written would be worse
    // than the 200, because it would look closed.
    const row = await db().prepare('SELECT id FROM "user" WHERE email = ?').bind("stranger@example.com").first();
    expect(row).toBeNull();
  });

  it("does not let a password sign-in reach a real person's address", async () => {
    const { email } = await newWorkspace("nopass");
    const res = await SELF.fetch(`${SETUP}/api/auth/sign-in/email`, {
      method: "POST",
      headers: json(SETUP),
      body: JSON.stringify({ email, password: "anything-at-all" }),
    });
    expect(res.status).not.toBe(200);
  });
});

describe("the team", () => {
  it("reports seats from the SERVER, not from a row count", async () => {
    const { cookie, slug, door } = await newWorkspace("seats");
    await setPlan(slug, "pro");

    const res = await SELF.fetch(`${door}/api/staff`, { headers: { cookie } });
    expect(res.status, "the staff routes must be mounted under /api").toBe(200);
    const body = (await res.json()) as {
      seats: { used: number; pending: number; max: number; remaining: number };
      roles: { name: string }[];
      canManage: boolean;
    };
    expect(body.seats.used).toBe(1); // the owner fills a seat
    expect(body.seats.max).toBe(10); // pro
    expect(body.canManage).toBe(true);
    // The picker's list comes from the server so no screen hard-codes it.
    expect(body.roles.map((r) => r.name)).toEqual(["owner", "operator", "receptionist", "viewer"]);
  });

  it("refuses an invitation at the ceiling and admits one after an upgrade", async () => {
    // Authorization observable WITHOUT the route guard: the seat check runs
    // inside the staff routes and does not consult platform-admin status.
    const { cookie, slug, door } = await newWorkspace("ceiling");
    await setPlan(slug, "free"); // seats: 1, and the owner is already in it

    const refused = await SELF.fetch(`${door}/api/staff/invite`, {
      method: "POST",
      headers: json(door, cookie),
      body: JSON.stringify({ email: "colleague@example.com", role: "operator" }),
    });
    expect(refused.status).toBe(403);
    const body = (await refused.json()) as { error: string };
    // Actionable, not just "no".
    expect(body.error).toMatch(/upgrade your plan/);

    await setPlan(slug, "pro");
    const admitted = await SELF.fetch(`${door}/api/staff/invite`, {
      method: "POST",
      headers: json(door, cookie),
      body: JSON.stringify({ email: "colleague@example.com", role: "operator" }),
    });
    expect(admitted.status).toBe(201);
    const inv = (await admitted.json()) as { id: string; url: string };
    // The LINK comes back whether or not the mail did — that is what makes an
    // invitation survive a misconfigured mailer.
    expect(inv.url).toContain(inv.id);
  });

  it("counts a pending invitation as a RESERVED seat", async () => {
    const { cookie, slug, door } = await newWorkspace("pending");
    await setPlan(slug, "pro");
    await SELF.fetch(`${door}/api/staff/invite`, {
      method: "POST",
      headers: json(door, cookie),
      body: JSON.stringify({ email: "held@example.com", role: "viewer" }),
    });
    const body = (await (await SELF.fetch(`${door}/api/staff`, { headers: { cookie } })).json()) as {
      seats: { used: number; pending: number; remaining: number };
    };
    expect(body.seats.pending).toBe(1);
    // Without this, a tenant with one seat left sends five invitations and four
    // fail at the moment a real person clicks accept.
    expect(body.seats.remaining).toBe(10 - body.seats.used - body.seats.pending);
  });

  it("will not invite anyone into a BOARD role", async () => {
    // A station account promoted to `operator` is a device bolted to a wall in a
    // waiting room holding the run of the fleet.
    const { cookie, slug, door } = await newWorkspace("boardrole");
    await setPlan(slug, "pro");
    const res = await SELF.fetch(`${door}/api/staff/invite`, {
      method: "POST",
      headers: json(door, cookie),
      body: JSON.stringify({ email: "device@example.com", role: "board_station" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("stations", () => {
  it("provisions a board's users and signs one in on its own credential", async () => {
    const { cookie, slug, door } = await newWorkspace("station");
    await setPlan(slug, "business");

    const created = await SELF.fetch(`${door}/api/boards`, {
      method: "POST",
      headers: json(door, cookie),
      body: JSON.stringify({ kind: "queue", name: "Front desk", config: { counters: [{ id: "c1", name: "Counter 1" }] } }),
    });
    expect(created.status).toBe(200);
    const board = (await created.json()) as { id: string };

    const roster = (await (
      await SELF.fetch(`${door}/api/boards/${board.id}/users`, { headers: { cookie } })
    ).json()) as { users: { id: string; kind: string; username: string }[] };
    const station = roster.users.find((u) => u.kind === "station")!;
    expect(station).toBeTruthy();

    /*
      THE CODE IS NOT READABLE, only re-issuable. It used to sit in plaintext on
      `board_users` so an admin could look it up, which meant one D1 read yielded
      working logins for every station in every tenant.
    */
    const stored = await db()
      .prepare("SELECT password FROM board_users WHERE id = ?")
      .bind(station.id)
      .first<{ password: string | null }>();
    expect(stored?.password).toBeNull();

    const code = (
      (await (
        await SELF.fetch(`${door}/api/boards/${board.id}/users/${station.id}/regenerate`, {
          method: "POST",
          headers: json(door, cookie),
        })
      ).json()) as { password: string }
    ).password;
    expect(code).toBeTruthy();

    const stationCookie = cookies(
      await SELF.fetch(`${SETUP}/api/auth/sign-in/email`, {
        method: "POST",
        headers: json(SETUP),
        body: JSON.stringify({ email: `${station.username}${STATION_DOMAIN}`, password: code }),
      }),
    );
    expect(stationCookie).toBeTruthy();

    const me = (await (await SELF.fetch(`${door}/api/me`, { headers: { cookie: stationCookie } })).json()) as {
      role: string;
      board: { boardId: string; stationId: string } | null;
      permissions: Record<string, string[]>;
    };
    expect(me.role).toBe("board_station");
    expect(me.board?.boardId).toBe(board.id);
    expect(me.board?.stationId).toBe("c1");

    /*
      THE GRANT IS THE BOARD'S AND NOTHING ELSE.

      Scena's presets were a hand-written second copy of `access.ts` that omitted
      both board roles, so every station fell through to the `viewer` preset —
      a counter device in a public waiting room resolving `billing: ["read"]`
      and read access to the whole fleet. Deriving the presets fixed it; this is
      what "fixed" looks like from outside the process.
    */
    expect(me.permissions).toEqual({ board: ["read", "operate"] });
  });

  it("does not consume a staff seat for a station", async () => {
    // The reason `@4dl/auth`'s seat-free set had to become a list: board users
    // are minted PER BOARD, so a clinic with eight rooms would otherwise exhaust
    // its plan before hiring anybody.
    const { cookie, slug, door } = await newWorkspace("seatfree");
    await setPlan(slug, "business");
    const before = (await (await SELF.fetch(`${door}/api/staff`, { headers: { cookie } })).json()) as {
      seats: { used: number };
    };

    await SELF.fetch(`${door}/api/boards`, {
      method: "POST",
      headers: json(door, cookie),
      body: JSON.stringify({
        kind: "room",
        name: "Rooms",
        config: { rooms: [{ id: "r1", name: "Room 1" }, { id: "r2", name: "Room 2" }] },
      }),
    });

    const after = (await (await SELF.fetch(`${door}/api/staff`, { headers: { cookie } })).json()) as {
      seats: { used: number };
    };
    // A coordinator plus two station accounts — three memberships, zero seats.
    expect(after.seats.used).toBe(before.seats.used);
  });
});

describe("what a plan bought, as the app actually reads it", () => {
  it("reports the PLAN's capabilities to a workspace in good standing", async () => {
    const { cookie, slug, door } = await newWorkspace("ent");
    await setPlan(slug, "pro");
    const me = (await (await SELF.fetch(`${door}/api/me`, { headers: { cookie } })).json()) as {
      features: Record<string, unknown>;
      quotas: Record<string, number>;
    };
    expect(me.features.aiGeneration).toBe(true);
    expect(me.features.roomQueueManagement).toBe(true);
    expect(me.quotas.pairedDevices).toBe(15);
  });

  it("CLAMPS a suspended workspace to the free baseline", async () => {
    /*
      The rule Scena had nowhere. `tenantEntitlements` used to resolve the plan
      whatever the subscription said, with a comment claiming "playout is gated
      elsewhere" — which describes the HOST gate, and that answers a different
      question: it closes an origin, this decides capability.

      So a suspended workspace kept its full paid entitlements at every gate that
      asks what it may DO — the AI generator, the ads module, the music library,
      and the compile-time widget gate that decides what goes into a manifest a
      screen replays offline for weeks.

      Asserted through `/api/me` — i.e. through the resolver the gates read — not
      against the pure function, which is where the unit test looks and where the
      missing CALL was equally invisible.
    */
    const { cookie, slug, door } = await newWorkspace("clamp");
    await setPlan(slug, "pro");
    const org = await db().prepare('SELECT id FROM "organization" WHERE slug = ?').bind(slug).first<{ id: string }>();
    await db().prepare("UPDATE subscriptions SET status = 'suspended', comp = 0 WHERE tenant_id = ?").bind(org!.id).run();

    const me = (await (await SELF.fetch(`${door}/api/me`, { headers: { cookie } })).json()) as {
      features: Record<string, unknown>;
      quotas: Record<string, number>;
    };
    expect(me.features.aiGeneration).toBe(false);
    expect(me.features.roomQueueManagement).toBe(false);
    expect(me.quotas.pairedDevices).toBe(1);
    // …and the one capability that must survive every rung. Scena's screens
    // carry fire and evacuation messages.
    expect(me.features.emergencyOverride).toBe(true);
  });

  it("exempts a COMPED workspace from the clamp", async () => {
    // The whole point of comping is that the STATUS does not decide, an operator
    // does. A demo account parked on `suspended` must still demo.
    const { cookie, slug, door } = await newWorkspace("comped");
    await setPlan(slug, "pro");
    const org = await db().prepare('SELECT id FROM "organization" WHERE slug = ?').bind(slug).first<{ id: string }>();
    await db().prepare("UPDATE subscriptions SET status = 'suspended', comp = 1 WHERE tenant_id = ?").bind(org!.id).run();

    const me = (await (await SELF.fetch(`${door}/api/me`, { headers: { cookie } })).json()) as {
      features: Record<string, unknown>;
    };
    expect(me.features.aiGeneration).toBe(true);
  });
});

describe("the credit ledger", () => {
  /** A fresh, isolated credit DO. Its id is arbitrary — the DO IS the tenant. */
  const ledger = (name: string) => {
    const ns = env.BILLING as DurableObjectNamespace;
    return ns.get(ns.idFromName(name)) as unknown as {
      view(): Promise<{ balance: number; purchased: number; granted: number; held: number; available: number }>;
      topUp(credits: number, reason?: string): Promise<unknown>;
      grantMonthly(credits: number, periodKey: string): Promise<unknown>;
      charge(credits: number, reason?: string): Promise<{ ok: boolean }>;
      reserve(estimate: number): Promise<{ ok: boolean }>;
    };
  };

  it("keeps the two buckets apart", async () => {
    const d = ledger(`buckets-${performance.now()}`);
    await d.topUp(500, "pack");
    await d.grantMonthly(1000, "2026-01");
    const v = await d.view();
    expect(v.purchased).toBe(500);
    expect(v.granted).toBe(1000);
    expect(v.balance).toBe(1500);
  });

  it("LAPSES an unused grant instead of rolling it over", async () => {
    /*
      Scena's own DO kept ONE counter and implemented `grantMonthly` as a top-up,
      under a comment reading "a floor top-up: purchased credits persist
      alongside it" — which it could not do, having nothing to distinguish them.
      What actually happened: an unused monthly grant accumulated forever, so a
      top-tier workspace that generated nothing banked 5,000 credits a month and
      could spend a year's worth in an afternoon.
    */
    const d = ledger(`lapse-${performance.now()}`);
    await d.grantMonthly(1000, "2026-01");
    await d.grantMonthly(1000, "2026-02");
    const v = await d.view();
    expect(v.granted).toBe(1000); // reset, not 2000
    expect(v.balance).toBe(1000);
  });

  it("is idempotent within a period, so a re-run of the sweep grants nothing", async () => {
    const d = ledger(`idem-${performance.now()}`);
    await d.grantMonthly(1000, "2026-01");
    await d.grantMonthly(1000, "2026-01");
    expect((await d.view()).granted).toBe(1000);
  });

  it("spends the GRANT first, so a tenant never loses a credit they paid for", async () => {
    // Use-it-or-lose-it: the bucket that expires is the one that drains.
    const d = ledger(`order-${performance.now()}`);
    await d.topUp(500, "pack");
    await d.grantMonthly(1000, "2026-01");
    await d.charge(600, "usage");
    const v = await d.view();
    expect(v.granted).toBe(400);
    expect(v.purchased).toBe(500);
  });

  it("refuses a spend it cannot cover, rather than going negative", async () => {
    const d = ledger(`short-${performance.now()}`);
    await d.grantMonthly(10, "2026-01");
    expect((await d.charge(50, "usage")).ok).toBe(false);
    expect((await d.view()).balance).toBe(10);
    // A reserve is the same question asked before an expensive call, so the
    // caller can skip the upstream request entirely.
    expect((await d.reserve(50)).ok).toBe(false);
  });

  it("HOLDS a reserve against the available balance", async () => {
    // The whole reason the meter is a DO and not a D1 row: two concurrent
    // requests reading the same row both pass the check and both debit.
    const d = ledger(`hold-${performance.now()}`);
    await d.grantMonthly(100, "2026-01");
    expect((await d.reserve(80)).ok).toBe(true);
    const v = await d.view();
    expect(v.held).toBe(80);
    expect(v.available).toBe(20);
    expect((await d.reserve(50)).ok).toBe(false);
  });
});

describe("the Stripe rail", () => {
  const SECRET = "whsec_scena_integration";

  /** Stripe's own signature scheme, so the rail verifies for real. */
  async function sign(payload: string): Promise<string> {
    const t = Math.floor(Date.now() / 1000);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
    return `t=${t},v1=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  }

  const post = async (payload: string, signature?: string) =>
    SELF.fetch(`${ROOT}/api/stripe/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": signature ?? (await sign(payload)) },
      body: payload,
    });

  beforeAll(async () => {
    await db()
      .prepare("INSERT INTO app_config (key, value, updated_at) VALUES ('stripe.webhook_secret', ?, 0) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .bind(SECRET)
      .run();
  });

  it("refuses an unsigned or wrongly-signed payload", async () => {
    const payload = JSON.stringify({ id: "evt_bad", type: "invoice.paid", data: { object: {} } });
    expect((await post(payload, "t=1,v1=deadbeef")).status).toBe(400);
  });

  it("GRANTS A CREDIT PACK ONCE, however many times Stripe delivers it", async () => {
    /*
      Scena had NO idempotency — no seen-set, no event-id check. Stripe retries
      on any non-2xx and occasionally redelivers a success, so every redelivery
      of this event ran `topUp` again: the pack granted twice, three times, as
      many times as the delivery repeated, each answered a correct-looking 200.
    */
    const { slug } = await newWorkspace("pack");
    const org = await db().prepare('SELECT id FROM "organization" WHERE slug = ?').bind(slug).first<{ id: string }>();
    const payload = JSON.stringify({
      id: `evt_pack_${slug}`,
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_1", metadata: { app: "scena", scena_tenant: org!.id, scena_pack: "p1", scena_credits: "2500" } } },
    });

    expect((await post(payload)).status).toBe(200);
    // The SAME event id, delivered again — which is what a Stripe retry is.
    expect((await post(payload)).status).toBe(200);
    expect((await post(payload)).status).toBe(200);

    const ns = env.BILLING as DurableObjectNamespace;
    const view = await (ns.get(ns.idFromName(org!.id)) as unknown as { view(): Promise<{ purchased: number }> }).view();
    expect(view.purchased).toBe(2500);
  });

  it("PARKS an event it cannot attribute instead of answering 200 and forgetting", async () => {
    /*
      The old handler read `metadata.scena_tenant || DEMO_TENANT`, so an event
      belonging to another app on the same Stripe account — or one of Scena's own
      whose metadata did not survive — was applied to a REAL workspace: its plan
      changed, its balance moved, its dunning state advanced.

      Parking keeps the payload so an operator can read it, and does NOT claim
      the id, so the event is still replayable once someone works out whose it is.
    */
    const payload = JSON.stringify({
      id: "evt_someone_elses",
      type: "invoice.paid",
      data: { object: { id: "in_other", customer: "cus_not_ours", metadata: { app: "someotherapp" } } },
    });
    const res = await post(payload);
    expect(res.status).toBe(200); // Stripe must not retry an event that is not ours.

    const parked = await db()
      .prepare("SELECT event_id, payload FROM rail_parked_events WHERE event_id = ?")
      .bind("evt_someone_elses")
      .first<{ event_id: string; payload: string }>();
    expect(parked?.event_id).toBe("evt_someone_elses");
    expect(parked?.payload).toContain("someotherapp");

    // And nothing was applied to anybody.
    const seen = await db().prepare("SELECT id FROM stripe_events WHERE id = ?").bind("evt_someone_elses").first();
    expect(seen, "an unattributed event must not claim the id — Stripe could not then retry it").toBeNull();
  });

  it("still handles an event that is ours only by CUSTOMER id", async () => {
    /*
      `claims` is what stops metadata-routing being a regression. `invoice.paid`
      and the subscription events routinely carry no app metadata at all; they
      are Scena's because the Stripe customer on them is.
    */
    const { slug } = await newWorkspace("byc");
    // `setPlan` first: the subscription row is created LAZILY on first read, so
    // a bare UPDATE here matches nothing and the customer id is never stored —
    // whereupon `claims` correctly says no and the test fails for its setup.
    await setPlan(slug, "pro");
    const org = await db().prepare('SELECT id FROM "organization" WHERE slug = ?').bind(slug).first<{ id: string }>();
    await db()
      .prepare("UPDATE subscriptions SET stripe_customer_id = ? WHERE tenant_id = ?")
      .bind("cus_scena_known", org!.id)
      .run();

    const payload = JSON.stringify({
      id: `evt_byc_${slug}`,
      type: "invoice.paid",
      data: { object: { id: "in_ours", customer: "cus_scena_known" } },
    });
    expect((await post(payload)).status).toBe(200);
    // It was ATTRIBUTED, so the id is claimed and a retry is a no-op.
    const seen = await db().prepare("SELECT id FROM stripe_events WHERE id = ?").bind(`evt_byc_${slug}`).first();
    expect(seen).toBeTruthy();
  });
});

describe("the per-member grant can only narrow", () => {
  it("refuses to hand a role a power its preset does not carry", async () => {
    /*
      `resolvePermissions` returned a stored blob verbatim whenever it sanitized
      to something non-empty, so this route was a privilege-escalation
      primitive: an owner (or anything that could reach it) could write
      `billing: ["manage"]` onto a receptionist and have it resolve.

      Asserted through `/api/me`, i.e. through the resolver the guard itself
      reads — not against the pure function, which is where the unit test looks
      and where the bug was equally invisible.
    */
    const { cookie, slug, door } = await newWorkspace("narrow");
    await setPlan(slug, "pro");

    const org = await db().prepare('SELECT id FROM "organization" WHERE slug = ?').bind(slug).first<{ id: string }>();
    const member = await db()
      .prepare('SELECT id FROM "member" WHERE organizationId = ?')
      .bind(org!.id)
      .first<{ id: string }>();

    // Demote the owner to a receptionist so the ceiling is a real one, then try
    // to buy billing back with a grant.
    await db().prepare('UPDATE "member" SET role = ? WHERE id = ?').bind("receptionist", member!.id).run();
    await SELF.fetch(`${door}/api/members/${member!.id}/permissions`, {
      method: "POST",
      headers: json(door, cookie),
      body: JSON.stringify({ permissions: { billing: ["manage"], settings: ["manage"], board: ["read", "operate"] } }),
    });

    const me = (await (await SELF.fetch(`${door}/api/me`, { headers: { cookie } })).json()) as {
      permissions: Record<string, string[]>;
    };
    expect(me.permissions.billing).toBeUndefined();
    expect(me.permissions.settings).toBeUndefined();
    // What the role DOES carry survives, so the control still does its job.
    expect(me.permissions.board).toEqual(["read", "operate"]);
  });
});

describe("the routes that used to be public", () => {
  it("no longer answers a handle → address lookup", async () => {
    // `POST /api/username/resolve` and `GET /api/username/available` were both
    // public, and together they were an enumeration oracle over every account on
    // the platform. They existed only to make handle sign-in work.
    for (const [method, path] of [
      ["POST", "/api/username/resolve"],
      ["GET", "/api/username/available?u=anything"],
    ] as const) {
      const res = await SELF.fetch(`${SETUP}${path}`, {
        method,
        headers: json(SETUP),
        ...(method === "POST" ? { body: JSON.stringify({ username: "anything" }) } : {}),
      });
      expect([401, 404], `${method} ${path} is still reachable`).toContain(res.status);
    }
  });
});

/* ─────────────────────────── Stage 5 — storage ──────────────────────────── */

/** A PNG's magic bytes, then filler. Content-addressed, so `size` alone makes
 *  each call a distinct object without needing a random content type. */
const png = (size: number): ArrayBuffer => {
  const a = new Uint8Array(size);
  a.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // Vary the tail so two different sizes never collide, and two calls at the
  // same size deliberately DO — that is what the dedup assertions exercise.
  for (let i = 8; i < size; i++) a[i] = (size + i) % 251;
  return a.buffer;
};

const upload = (door: string, cookie: string, bytes: ArrayBuffer, mime = "image/png") =>
  SELF.fetch(`${door}/api/assets`, { method: "PUT", headers: { cookie, origin: door, "content-type": mime }, body: bytes });

describe("every stored object is accounted for", () => {
  it("records a ledger row, and the workspace's usage moves", async () => {
    const { cookie, slug, door } = await newWorkspace("store");
    await setPlan(slug, "pro");

    const before = (await (await SELF.fetch(`${door}/api/billing`, { headers: { cookie } })).json()) as {
      storage: { usedBytes: number; limitBytes: number };
    };
    // Pro sells 20 GB. Before Stage 5 there was no ceiling at all, on any tier.
    expect(before.storage.limitBytes).toBe(20_000 * 1024 * 1024);

    const res = await upload(door, cookie, png(4096));
    expect(res.status).toBe(200);
    const { hash, bytes } = (await res.json()) as { hash: string; bytes: number };
    expect(bytes).toBe(4096);

    const after = (await (await SELF.fetch(`${door}/api/billing`, { headers: { cookie } })).json()) as {
      storage: { usedBytes: number };
    };
    expect(after.storage.usedBytes).toBe(before.storage.usedBytes + 4096);

    // The ledger row is what makes that number possible, and it is qualified by
    // tenant — the R2 key is the content hash, which two workspaces can share.
    const org = await db().prepare('SELECT id FROM "organization" WHERE slug = ?').bind(slug).first<{ id: string }>();
    const row = await db()
      .prepare("SELECT tenant_id, size_bytes, purpose FROM media_assets WHERE r2_key = ?")
      .bind(`${org!.id}:${hash}`)
      .first<{ tenant_id: string; size_bytes: number; purpose: string }>();
    expect(row).toBeTruthy();
    expect(row!.tenant_id).toBe(org!.id);
    expect(row!.size_bytes).toBe(4096);
    expect(row!.purpose).toBe("upload");
  });

  it("charges the SAME bytes to both workspaces that reference them", async () => {
    // The bucket deduplicates (one object, keyed by content hash). The ledger
    // must not: each workspace pays for what it references, not for what it
    // happened to be first to upload. Before the qualified ledger key, the
    // second upload rewrote the first one's row — so the original owner's bytes
    // silently stopped counting against their quota.
    const a = await newWorkspace("dedupe-a");
    const b = await newWorkspace("dedupe-b");
    await setPlan(a.slug, "pro");
    await setPlan(b.slug, "pro");
    const same = png(2048);

    const ra = await upload(a.door, a.cookie, same);
    const rb = await upload(b.door, b.cookie, same);
    const ha = ((await ra.json()) as { hash: string }).hash;
    const hb = ((await rb.json()) as { hash: string }).hash;
    expect(ha, "identical bytes must land on one key").toBe(hb);

    // Matched by exact key, NOT `LIKE '%:hash'` — D1 caps a LIKE pattern at 50
    // characters and a SHA-256 is 64, so the pattern form fails with
    // "LIKE or GLOB pattern too complex" the moment a row exists to test it.
    // That is the same trap `@4dl/storage`'s purge documents.
    const ids = await Promise.all(
      [a.slug, b.slug].map((slug) => db().prepare('SELECT id FROM "organization" WHERE slug = ?').bind(slug).first<{ id: string }>()),
    );
    const rows = await db()
      .prepare("SELECT COUNT(*) AS n FROM media_assets WHERE r2_key IN (?, ?) AND deleted_at IS NULL")
      .bind(`${ids[0]!.id}:${ha}`, `${ids[1]!.id}:${ha}`)
      .first<{ n: number }>();
    expect(rows!.n, "one ledger row per workspace").toBe(2);

    for (const w of [a, b]) {
      const bill = (await (await SELF.fetch(`${w.door}/api/billing`, { headers: { cookie: w.cookie } })).json()) as {
        storage: { usedBytes: number };
      };
      expect(bill.storage.usedBytes).toBe(2048);
    }
  });

  it("refuses an upload that would break the plan's ceiling", async () => {
    // Free is 100 MB, so fill it from the ledger rather than by actually
    // uploading 100 MB into a test isolate.
    const { cookie, slug, door } = await newWorkspace("full");
    const org = await db().prepare('SELECT id FROM "organization" WHERE slug = ?').bind(slug).first<{ id: string }>();
    await db()
      .prepare(
        "INSERT INTO media_assets (id, tenant_id, r2_key, purpose, content_type, size_bytes, created_at) VALUES ('mda_fill', ?, ?, 'upload', 'video/mp4', ?, '2026-01-01T00:00:00Z')",
      )
      .bind(org!.id, `${org!.id}:filler`, 100 * 1024 * 1024)
      .run();

    const res = await upload(door, cookie, png(1024));
    expect(res.status, "an upload over the ceiling must be refused").toBe(413);
    const body = (await res.json()) as { error: string; limitBytes: number };
    expect(body.error).toBe("storage_full");
    expect(body.limitBytes).toBe(100 * 1024 * 1024);
  });

  it("refuses SVG outright, and serves everything under a sandbox", async () => {
    const { cookie, slug, door } = await newWorkspace("svg");
    await setPlan(slug, "pro");

    // An SVG is a DOCUMENT: it carries <script>, and this origin serves it back.
    // Uploading one used to be the whole of stored XSS on a workspace's domain.
    const evil = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const refused = await upload(door, cookie, evil.buffer as ArrayBuffer, "image/svg+xml");
    expect(refused.status).toBe(415);

    // And what IS stored comes back inert.
    const ok = await upload(door, cookie, png(512));
    const { hash } = (await ok.json()) as { hash: string };
    const served = await SELF.fetch(`${door}/api/assets/${hash}`);
    expect(served.status).toBe(200);
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
    expect(served.headers.get("content-security-policy")).toContain("sandbox");
    // A raster still renders inline — an attachment header here would break
    // every slide in the product.
    expect(served.headers.get("content-disposition")).toBeNull();
  });

  it("refuses an upload larger than one object may be", async () => {
    const { cookie, slug, door } = await newWorkspace("big");
    await setPlan(slug, "business");
    // Declared-length refusal, before the body is buffered — which is the only
    // check that can happen before `arrayBuffer()` materialises it in the isolate.
    const res = await SELF.fetch(`${door}/api/assets`, {
      method: "PUT",
      headers: { cookie, origin: door, "content-type": "video/mp4", "content-length": String(200 * 1024 * 1024) },
      body: png(64),
    });
    expect(res.status).toBe(413);
  });
});

describe("releasing media", () => {
  it("gives the quota back but keeps bytes another workspace still uses", async () => {
    const a = await newWorkspace("rel-a");
    const b = await newWorkspace("rel-b");
    await setPlan(a.slug, "pro");
    await setPlan(b.slug, "pro");
    const same = png(3072);
    const hash = ((await (await upload(a.door, a.cookie, same)).json()) as { hash: string }).hash;
    await upload(b.door, b.cookie, same);

    // Both workspaces file it in their library, then A deletes its card.
    const card = async (w: { door: string; cookie: string }) => {
      const res = await SELF.fetch(`${w.door}/api/media`, {
        method: "POST",
        headers: json(w.door, w.cookie),
        body: JSON.stringify({ kind: "image", name: "shared", assetHash: hash, assetUrl: `/api/assets/${hash}`, mime: "image/png" }),
      });
      return ((await res.json()) as { id: string }).id;
    };
    const idA = await card(a);
    await card(b);

    const del = await SELF.fetch(`${a.door}/api/media/${idA}`, { method: "DELETE", headers: { cookie: a.cookie, origin: a.door } });
    expect(del.status).toBe(200);

    // A's quota comes back...
    const billA = (await (await SELF.fetch(`${a.door}/api/billing`, { headers: { cookie: a.cookie } })).json()) as {
      storage: { usedBytes: number };
    };
    expect(billA.storage.usedBytes, "A stopped referencing it, so A stops paying").toBe(0);

    // ...and B's slide still renders. Deleting the object because ONE workspace
    // tidied up is what the tenant-scoped reference check used to do.
    const served = await SELF.fetch(`${b.door}/api/assets/${hash}`);
    expect(served.status, "B still references these bytes").toBe(200);
  });
});

describe("the mock lane", () => {
  /*
    ⚠️ This suite runs with `ENVIRONMENT: "development"` and CANNOT change that
    — bindings are fixed at runtime start, and `env` here is the runner's view,
    not the object a request sees.

    So the split is deliberate: this asserts the route READS the setting and
    applies the shared decision (which is the wiring an integration test can
    see), and `test/mock-lane.test.ts` asserts the decision itself in both
    environments. Neither half is sufficient alone, which is why both exist.
  */
  it("accepts every mode a developer may set, and rejects a value that is not one", async () => {
    const { cookie, door } = await newWorkspace("mock");
    for (const mode of ["on", "auto", "off"]) {
      const res = await SELF.fetch(`${door}/api/admin/config`, {
        method: "PUT",
        headers: json(door, cookie),
        body: JSON.stringify({ config: { "ai.mock": mode } }),
      });
      expect(res.status, `ai.mock=${mode} in development`).toBe(200);
    }
    const stored = await db().prepare("SELECT value FROM app_config WHERE key = 'ai.mock'").first<{ value: string }>();
    expect(stored!.value).toBe("off");
  });
});

/* ────────────────── Stage 6 — erasure, mail, the inbox ─────────────────── */

describe("erasing a workspace clears every table its schema declares", () => {
  it("does not leave the media library, the playlists or the ad rotations behind", async () => {
    const { cookie, slug, door } = await newWorkspace("purge");
    await setPlan(slug, "pro");
    const org = await db().prepare('SELECT id FROM "organization" WHERE slug = ?').bind(slug).first<{ id: string }>();
    const tenantId = org!.id;

    // Give the workspace something in each of the tables the OLD hand-written
    // list forgot. `media` and `media_assets` come from a real upload so the
    // ledger row is real too.
    const up = await upload(door, cookie, png(1500));
    const { hash } = (await up.json()) as { hash: string };
    await SELF.fetch(`${door}/api/media`, {
      method: "POST",
      headers: json(door, cookie),
      body: JSON.stringify({ kind: "image", name: "poster", assetHash: hash, assetUrl: `/api/assets/${hash}`, mime: "image/png" }),
    });
    // Ids are namespaced by slug: this suite runs with per-test storage
    // isolation OFF (see vitest.config.ts), so a fixed id collides on the retry.
    for (const [table, cols, vals] of [
      ["slide_playlists", "(id, tenant_id, name)", [`sp_${slug}`, tenantId, "Lobby"]],
      ["widget_profiles", "(id, tenant_id, name)", [`wp_${slug}`, tenantId, "Default"]],
      ["ad_profiles", "(id, tenant_id, name)", [`ap_${slug}`, tenantId, "House ads"]],
      ["weather_sources", "(id, tenant_id, label)", [`ws_${slug}`, tenantId, "HQ"]],
    ] as const) {
      await db().prepare(`INSERT INTO ${table} ${cols} VALUES (?, ?, ?)`).bind(...vals).run();
    }

    const survivors = async () => {
      const counts = await Promise.all(
        ["media", "media_assets", "slide_playlists", "widget_profiles", "ad_profiles", "weather_sources"].map(async (t) => {
          const r = await db().prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE tenant_id = ?`).bind(tenantId).first<{ n: number }>();
          return [t, r?.n ?? 0] as const;
        }),
      );
      return counts.filter(([, n]) => n > 0).map(([t]) => t);
    };
    expect(await survivors(), "the fixture did not land").not.toEqual([]);

    await purgeTenant(env as unknown as Parameters<typeof purgeTenant>[0], tenantId);

    // The exact list that used to be left behind: `deleteTenantData` named seven
    // tables while `scoped.tenantTables` declared twenty-five, and the sweep
    // reported success either way.
    expect(await survivors()).toEqual([]);
  });

  it("keeps bytes another workspace still references, and releases the quota anyway", async () => {
    const a = await newWorkspace("purge-a");
    const b = await newWorkspace("purge-b");
    await setPlan(a.slug, "pro");
    await setPlan(b.slug, "pro");
    const same = png(2500);
    const { hash } = (await (await upload(a.door, a.cookie, same)).json()) as { hash: string };
    await upload(b.door, b.cookie, same);

    const orgA = await db().prepare('SELECT id FROM "organization" WHERE slug = ?').bind(a.slug).first<{ id: string }>();
    await purgeTenant(env as unknown as Parameters<typeof purgeTenant>[0], orgA!.id);

    // B's slide still renders — the purge asked whether anything else pointed at
    // the content hash before deleting the object.
    expect((await SELF.fetch(`${b.door}/api/assets/${hash}`)).status).toBe(200);
    const billB = (await (await SELF.fetch(`${b.door}/api/billing`, { headers: { cookie: b.cookie } })).json()) as {
      storage: { usedBytes: number };
    };
    expect(billB.storage.usedBytes, "B still pays for what B references").toBe(2500);
  });
});

describe("the inbox", () => {
  it("is empty, personal, and answers on the workspace door", async () => {
    const { cookie, door } = await newWorkspace("inbox");
    const res = await SELF.fetch(`${door}/api/notifications`, { headers: { cookie } });
    expect(res.status).toBe(200);
    expect((await res.json()) as { notifications: unknown[] }).toEqual({ notifications: [] });
  });

  it("refuses a signed-out reader rather than answering with somebody's mail", async () => {
    const { door } = await newWorkspace("inbox-anon");
    expect((await SELF.fetch(`${door}/api/notifications`)).status).toBe(401);
  });

  it("delivers a screen alert to the people the workspace belongs to", async () => {
    // The gap this closes: an `alert_rules` row addresses a webhook URL or a
    // bare email string, never a USER — so an operator with no rule configured
    // learned that a screen went dark by walking past it.
    const { cookie, slug, door } = await newWorkspace("alerted");
    const org = await db().prepare('SELECT id FROM "organization" WHERE slug = ?').bind(slug).first<{ id: string }>();
    await db()
      .prepare("INSERT INTO screens (id, tenant_id, name, status, paired_at, last_seen) VALUES (?, ?, ?, 'online', ?, ?)")
      .bind(`scr_${slug}`, org!.id, "Lobby panel", Date.now(), Date.now())
      .run();

    await raiseAlert(env as unknown as Parameters<typeof raiseAlert>[0], {
      tenantId: org!.id,
      screenId: `scr_${slug}`,
      type: "offline",
      message: "Screen disconnected",
    });

    const { notifications } = (await (await SELF.fetch(`${door}/api/notifications`, { headers: { cookie } })).json()) as {
      notifications: { type: string; title: string; link: string | null }[];
    };
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.type).toBe("screen_offline");
    // Named, not an opaque id — the whole point of the join.
    expect(notifications[0]!.title).toContain("Lobby panel");
    expect(notifications[0]!.link).toBe("/screens");
  });

  it("marks one read, and then all", async () => {
    const { cookie, slug, door } = await newWorkspace("inbox-read");
    const org = await db().prepare('SELECT id FROM "organization" WHERE slug = ?').bind(slug).first<{ id: string }>();
    for (const id of [`scr_a_${slug}`, `scr_b_${slug}`]) {
      await db()
        .prepare("INSERT INTO screens (id, tenant_id, name, status, paired_at, last_seen) VALUES (?, ?, ?, 'online', ?, ?)")
        .bind(id, org!.id, id, Date.now(), Date.now())
        .run();
      await raiseAlert(env as unknown as Parameters<typeof raiseAlert>[0], {
        tenantId: org!.id,
        screenId: id,
        type: "offline",
        message: "gone",
      });
    }
    const list = async () =>
      ((await (await SELF.fetch(`${door}/api/notifications`, { headers: { cookie } })).json()) as {
        notifications: { id: string; read: number }[];
      }).notifications;

    const before = await list();
    expect(before).toHaveLength(2);
    await SELF.fetch(`${door}/api/notifications/${before[0]!.id}/read`, { method: "POST", headers: json(door, cookie) });
    expect((await list()).filter((n) => n.read).length).toBe(1);
    await SELF.fetch(`${door}/api/notifications/read-all`, { method: "POST", headers: json(door, cookie) });
    expect((await list()).filter((n) => n.read).length).toBe(2);
  });
});

/* ─────────────── Stage 7b — the console's own door ─────────────────────── */

describe("the operator console answers on its door and nowhere else", () => {
  /*
    The bug this closes: the SPA rendered the console at `/admin` INSIDE the
    studio Shell, on any host, while `/api/admin/*` has been restricted to the
    `admin.` door since Stage 3. In production that route rendered 1,448 lines
    of console and then 404'd on every call — invisible in dev, where one root
    means the guard correctly stands down.

    ⚠️ This suite runs on `localhost`, where `isDevRoot` spares the door check,
    so it CANNOT observe the refusal. What it can observe is that every endpoint
    the console needs actually exists and answers — which is the half that was
    missing: Scena had none of the four shared operator surfaces mounted, so
    six of the console's thirteen sections would have called routes that were
    never registered.
  */
  const ADMIN_SURFACES = [
    "/api/admin/email",
    "/api/admin/shared-config",
    "/api/admin/maintenance",
    "/api/admin/rail/parked",
    "/api/admin/domains/config",
    "/api/admin/turnstile/config",
  ];

  it("registers every endpoint the console's shared panels call", async () => {
    const { cookie, door } = await newWorkspace("console");
    for (const path of ADMIN_SURFACES) {
      const res = await SELF.fetch(`${door}${path}`, { headers: { cookie } });
      // 404 here means the route was never mounted — a panel that renders and
      // then fails on its first read. Anything else (200, 403, 503) means the
      // surface exists and the guard is doing its job.
      expect(res.status, `${path} is not mounted`).not.toBe(404);
    }
  });

  it("refuses an unauthenticated reader on every one of them", async () => {
    const { door } = await newWorkspace("console-anon");
    for (const path of ADMIN_SURFACES) {
      const res = await SELF.fetch(`${door}${path}`);
      expect([401, 403, 404], `${path} answered an anonymous caller ${res.status}`).toContain(res.status);
    }
  });
});
