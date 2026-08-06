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
