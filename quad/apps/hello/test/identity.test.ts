/**
 * SOMEBODY SIGNS IN, MAKES A WORKSPACE, AND INVITES A COLLEAGUE.
 *
 * ⚠️ THIS IS STAGE 4'S EXIT CRITERION, AND IT IS DRIVEN THROUGH THE REAL DOORS.
 * The code is read out of the database the way a person reads it out of their
 * inbox; the session is the cookie the browser would carry; the invitation is
 * claimed by signing in as the address it was sent to, which is the only way it
 * is ever claimed.
 *
 * ⚠️ AND THE THINGS THAT MUST NOT WORK ARE HALF OF IT: inviting somebody into a
 * role you could not grant key by key, guessing a code for ever, starting a
 * second workspace from inside somebody else's, and walking out as the last
 * person who could run the place.
 */

import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AUDIT_SCHEMA, CODE_TRIES, DIRECTORY_SCHEMA, IDENTITY_SCHEMA, MEMBERSHIP_SCHEMA, NOBODY,
  REPLAY_SCHEMA, addShard, applySchema, memberFor, membersOf, noteShardApp, permissionsResolver,
  personalOps, schemaFor, serve, sessionIdFrom, tenantBySlug, whoIs, type Db,
} from "@quad/runtime";
import { HELLO, hello } from "../src/index.js";

const directory = () => env.DIRECTORY as unknown as Db;
const shard = () => env.SHARD_EU_1 as unknown as Db;

const ROOTS = { root: "quad.test" };
const SECRET = "test-secret";

/** ⚠️ What a deployment's mailer would do. A failure here is a refusal, not a shrug. */
const sent: { to: string; code: string }[] = [];

const app = () => serve({
  roots: ROOTS,
  apps: { hello },
  directory: directory(),
  shardOf: () => shard(),
  personal: personalOps({
    secret: SECRET,
    appId: "hello",
    deliver: async (to, code) => { sent.push({ to, code }); },
  }),
  locate: async (door) => {
    if (door.kind !== "tenant" || !door.slug) return null;
    const tenant = await tenantBySlug(directory(), door.slug);
    return tenant
      ? {
        tenantId: tenant.id, db: shard(), apps: ["hello"],
        /* Stage 6 resolves these from a plan; here the ceiling is what the
           free plan sells, so the seat rule is exercised for real. */
        entitlements: [
          { key: "seats", value: SEATS, source: "plan" as const, plan: SEATS },
          { key: "notes", value: 20, source: "plan" as const, plan: 20 },
          { key: "publishing", value: true, source: "plan" as const, plan: true },
        ],
      }
      : null;
  },
  /*
    ⚠️ WHO IS ASKING IS RESOLVED FROM THE SESSION AND THE WORKSPACE'S OWN
    ROSTER — never from anything the request said about itself. Permissions are
    a function of which app asks (D15): the platform role answers everywhere,
    the app role only in its app, and a custom role works wherever a declared
    one does.
  */
  identify: async (request, located) => {
    const { session, email, accountId } = await whoIs(directory(), sessionIdFrom(request), new Date());
    if (!session || !accountId) return NOBODY;
    const member = await memberFor(located.db, located.tenantId as never, accountId);
    return {
      accountId, email,
      signedIn: true,
      provenAt: session.provenAt,
      permissionsIn: permissionsResolver(located.db, located.tenantId as never, member,
        (appId) => (appId === "hello" ? HELLO.access.roles : null)),
    };
  },
});

/** What the fixture's plan sells. */
let SEATS = 10;

const at = (host: string, path: string, init: RequestInit = {}) =>
  app()(new Request(`https://${host}.quad.test${path}`, init));

const post = (host: string, path: string, body: unknown, cookie?: string) =>
  at(host, path, {
    method: "POST", body: JSON.stringify(body),
    headers: cookie ? { cookie } : {},
  });

const get = (host: string, path: string, cookie?: string) =>
  at(host, path, { headers: cookie ? { cookie } : {} });

/** ⚠️ Read out of the database the way a person reads it out of their inbox. */
const codeFor = (email: string): string =>
  sent.filter((s) => s.to === email).at(-1)!.code;

const cookieOf = (r: Response): string => (r.headers.get("set-cookie") ?? "").split(";")[0]!;

/** Sign in, end to end, as a browser would. */
async function signIn(email: string): Promise<string> {
  const asked = await post("setup", "/api/me.code", { email });
  expect(asked.status).toBe(200);
  const done = await post("setup", "/api/me.session", { email, code: codeFor(email) });
  expect(done.status).toBe(200);
  return cookieOf(done);
}

beforeAll(async () => {
  await applySchema(directory(), [DIRECTORY_SCHEMA, IDENTITY_SCHEMA]);
  await applySchema(shard(), [schemaFor(HELLO), MEMBERSHIP_SCHEMA, AUDIT_SCHEMA, REPLAY_SCHEMA]);
  await addShard(directory(), "eu-1", "eu", 100);
  await noteShardApp(directory(), "eu-1", "hello");
});

beforeEach(async () => {
  sent.length = 0;
  for (const t of ["membership", "custom_role", "note", "audit", "replay"]) await shard().exec(`DELETE FROM ${t};`);
  for (const t of ["invited", "belongs", "tenant_app", "tenant", "session", "code", "account"]) {
    await directory().exec(`DELETE FROM ${t};`);
  }
});

/* --------------------------------------------------------------- signing in --- */

describe("signing in", () => {
  it("sends a code and exchanges it for a session", async () => {
    const cookie = await signIn("sam@example.com");
    expect(cookie).toContain("quad_session=");

    const who = await get("setup", "/api/me.who", cookie).then((r) => r.json()) as
      { email: string; tenants: unknown[] };
    expect(who.email).toBe("sam@example.com");
    expect(who.tenants).toEqual([]);
  });

  /*
    ⚠️ THE COOKIE'S FLAGS ARE A SECURITY DECISION AND THE RUNTIME WRITES THEM. A
    handler setting them slightly differently is one door with a weaker session,
    and nothing about the screen would say so.
  */
  it("issues a session cookie nothing in the page can read", async () => {
    const asked = await post("setup", "/api/me.code", { email: "sam@example.com" });
    expect(asked.status).toBe(200);
    const done = await post("setup", "/api/me.session",
      { email: "sam@example.com", code: codeFor("sam@example.com") });
    const cookie = done.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    /* One cookie for the whole root, so one sign-in covers every door. */
    expect(cookie).toContain("Domain=.quad.test");
  });

  /*
    ⚠️ A CODE WITH UNLIMITED ATTEMPTS IS A SIX-DIGIT PASSWORD. The attempt is
    counted before the value is checked, which is what makes the ceiling mean
    anything.
  */
  it("stops accepting guesses", async () => {
    await post("setup", "/api/me.code", { email: "sam@example.com" });
    for (let i = 0; i < CODE_TRIES; i++) {
      const out = await post("setup", "/api/me.session", { email: "sam@example.com", code: "000000" });
      expect(out.status).toBe(401);
    }
    /* Even the right code is refused now: the code is spent. */
    const out = await post("setup", "/api/me.session",
      { email: "sam@example.com", code: codeFor("sam@example.com") });
    expect(out.status).toBe(401);
  });

  /* ⚠️ The cooldown is what stops this endpoint being a way to send somebody a
     hundred emails, and it refuses rather than silently dropping. */
  it("refuses to send a second code immediately", async () => {
    await post("setup", "/api/me.code", { email: "sam@example.com" });
    const again = await post("setup", "/api/me.code", { email: "sam@example.com" });
    expect(again.status).toBe(429);
    expect(sent).toHaveLength(1);
  });

  /*
    ⚠️ ONE ANSWER FOR EVERY WAY A CODE CAN BE WRONG. Distinguishing "no such
    code" from "wrong code" tells somebody enumerating addresses which ones have
    been asked to sign in.
  */
  it("says the same thing whether the address was ever asked or not", async () => {
    const never = await post("setup", "/api/me.session",
      { email: "nobody@example.com", code: "123456" });
    await post("setup", "/api/me.code", { email: "sam@example.com" });
    const wrong = await post("setup", "/api/me.session",
      { email: "sam@example.com", code: "000000" });
    expect(never.status).toBe(wrong.status);
    expect(await never.json()).toEqual(await wrong.json());
  });

  /* ⚠️ The signpost is not an application: there is no tenancy for a code to be
     about, so it issues none. */
  it("sends no code from the signpost", async () => {
    const out = await app()(new Request("https://quad.test/api/me.code",
      { method: "POST", body: JSON.stringify({ email: "sam@example.com" }) }));
    expect(out.status).toBe(404);
    expect(sent).toHaveLength(0);
  });

  it("signs out, and the session stops working", async () => {
    const cookie = await signIn("sam@example.com");
    expect((await post("setup", "/api/me.signout", {}, cookie)).status).toBe(200);
    expect((await get("setup", "/api/me.who", cookie)).status).toBe(401);
  });
});

/* ------------------------------------------------------------ a workspace --- */

describe("making a workspace", () => {
  it("creates it, places it, and makes the founder somebody who can run it", async () => {
    const cookie = await signIn("sam@example.com");
    const made = await post("setup", "/api/me.tenant.create",
      { slug: "northwind", name: "Northwind", country: "DE" }, cookie);
    expect(made.status).toBe(200);

    const tenant = await tenantBySlug(directory(), "northwind");
    expect(tenant?.residency).toBe("eu");

    const members = await membersOf(shard(), tenant!.id);
    expect(members).toHaveLength(1);
    /* ⚠️ Two authorities on one row (D15): the platform makes every founder an
       `owner` — running the workspace is its to give — and the app's `founding`
       declaration says what they are INSIDE the product. */
    expect(members[0]!.platformRole).toBe("owner");
    expect(members[0]!.appRoles).toEqual({ hello: "writer" });
    /* ⚠️ Accepted the moment it is made — the founder is already signed in as
       themselves, and a pending invitation waiting at their own address is not
       a state anybody should have to resolve. */
    expect(members[0]!.acceptedAt).not.toBe(null);

    /* And they can immediately do the thing the workspace is for. */
    const wrote = await post("northwind", "/api/note.create", { title: "First" }, cookie);
    expect(wrote.status).toBe(200);
  });

  /*
    ⚠️ ONE PLACE A WORKSPACE IS MADE. Offered on a workspace's own door, it
    invites somebody who followed a colleague's link to start a second one — on
    that workspace's own branded page, which a previous platform shipped.
  */
  it("cannot be started from inside somebody else's workspace", async () => {
    const cookie = await signIn("sam@example.com");
    await post("setup", "/api/me.tenant.create",
      { slug: "northwind", name: "Northwind", country: "DE" }, cookie);
    const out = await post("northwind", "/api/me.tenant.create",
      { slug: "second", name: "Second", country: "DE" }, cookie);
    expect(out.status).toBe(404);
  });

  /* ⚠️ A slug is the address, so it is validated as a DNS label and refused if
     it is one of the doors or one of the infrastructure labels. */
  it("refuses a slug that is a door or infrastructure", async () => {
    const cookie = await signIn("sam@example.com");
    for (const slug of ["admin", "setup", "acme", "www"]) {
      const out = await post("setup", "/api/me.tenant.create",
        { slug, name: "Nope", country: "DE" }, cookie);
      expect(out.status).toBe(400);
    }
  });

  it("refuses a slug somebody already holds", async () => {
    const first = await signIn("sam@example.com");
    await post("setup", "/api/me.tenant.create",
      { slug: "northwind", name: "Northwind", country: "DE" }, first);
    const second = await signIn("alex@example.com");
    const out = await post("setup", "/api/me.tenant.create",
      { slug: "northwind", name: "Also", country: "FR" }, second);
    expect(out.status).toBe(409);
  });

  /* ⚠️ Residency follows the business's country, never anybody's nationality
     (D6) — a fact we can act on rather than one we would have to ask for. */
  it("places a business outside the EEA on the deployment's own region", async () => {
    await addShard(directory(), "global-1", "global", 100);
    await noteShardApp(directory(), "global-1", "hello");
    const cookie = await signIn("sam@example.com");
    await post("setup", "/api/me.tenant.create",
      { slug: "sunset", name: "Sunset", country: "AE" }, cookie);
    expect((await tenantBySlug(directory(), "sunset"))?.residency).toBe("global");
  });
});

/* -------------------------------------------------------------- colleagues --- */

describe("inviting a colleague", () => {
  /* ⚠️ THROUGH THE OPERATION, NOT AROUND IT. The roster is the platform's — an
     app that declared "invite a colleague" itself would be an app that could
     declare it without the two doors that bound it. */
  const found = async () => {
    const cookie = await signIn("sam@example.com");
    await post("setup", "/api/me.tenant.create",
      { slug: "northwind", name: "Northwind", country: "DE" }, cookie);
    const tenant = (await tenantBySlug(directory(), "northwind"))!;
    return { cookie, tenant };
  };

  it("invites an address, and they claim it by signing in as it", async () => {
    const { cookie, tenant } = await found();
    const made = await post("northwind", "/api/member.invite",
      { email: "alex@example.com", platformRole: "staff", appRoles: { hello: "writer" } }, cookie);
    expect(made.status).toBe(200);

    /* ⚠️ Claimed by signing in as the address it was sent to — the only way. */
    const theirs = await signIn("alex@example.com");
    const who = await get("setup", "/api/me.who", theirs).then((r) => r.json()) as
      { tenants: { slug: string }[] };
    expect(who.tenants.map((t) => t.slug)).toEqual(["northwind"]);

    const members = await membersOf(shard(), tenant.id);
    expect(members.find((m) => m.email === "alex@example.com")?.acceptedAt).not.toBe(null);

    /* And they can do what their role allows, in the workspace, immediately. */
    expect((await post("northwind", "/api/note.create", { title: "Theirs" }, theirs)).status).toBe(200);
  });

  /*
    ⚠️ NOBODY MAY INVITE SOMEBODY INTO A ROLE THEY COULD NOT GRANT KEY BY KEY.
    Without it, anybody who can invite escalates in two steps: invite a second
    address of your own as an owner, then sign in as it. A previous platform
    carried the function that checks this and called it from nowhere.
  */
  it("refuses an invitation into a role beyond the inviter", async () => {
    const { cookie, tenant } = await found();
    await post("northwind", "/api/member.invite",
      { email: "alex@example.com", platformRole: "staff", appRoles: { hello: "writer" } }, cookie);
    const theirs = await signIn("alex@example.com");

    /* Staff may not invite at all: they do not hold `member:manage`, so the
       gate refuses before the rule is even reached. */
    expect((await post("northwind", "/api/member.invite",
      { email: "mallory@example.com", platformRole: "owner" }, theirs)).status).toBe(403);

    /* Make them a manager — somebody who CAN invite, but not into every role. */
    const alexId = (await membersOf(shard(), tenant.id)).find((m) => m.email === "alex@example.com")!.id;
    await post("northwind", "/api/member.role", { id: alexId, platformRole: "manager" }, cookie);

    /* ⚠️ THE SAME SESSION, AND IT NOW CARRIES THE NEW ROLE. Permissions are
       resolved from the roster on every request rather than stamped into the
       session at sign-in — otherwise a role taken away keeps working until
       somebody signs out, which is precisely when it matters that it does not.
       A manager still may not mint an owner: they cannot grant `billing:manage`. */
    expect((await post("northwind", "/api/member.invite",
      { email: "mallory@example.com", platformRole: "owner" }, theirs)).status).toBe(403);
    /* ...and into roles they hold every key of — platform AND app — it works. */
    expect((await post("northwind", "/api/member.invite",
      { email: "mallory@example.com", platformRole: "staff", appRoles: { hello: "reader" } },
      theirs)).status).toBe(200);
  });

  /*
    ⚠️ A CUSTOM ROLE WORKS EVERYWHERE A DECLARED ONE DOES — it joins the app's
    registry at resolution, so nothing downstream knows it exists. And it is
    ONE APP'S: the platform's offices are not composable.
  */
  it("assigns a workspace's own role, and it resolves like a declared one", async () => {
    const { cookie, tenant } = await found();
    await post("northwind", "/api/member.invite",
      { email: "alex@example.com", platformRole: "staff", appRoles: { hello: "writer" } }, cookie);
    const theirs = await signIn("alex@example.com");
    await shard().prepare(
      `INSERT INTO custom_role (id, tenant_id, app, name, permissions_json, at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind("helper", tenant.id, "hello", "Helper",
        JSON.stringify(["note:read"]), new Date().toISOString()).run();

    const alexId = (await membersOf(shard(), tenant.id)).find((m) => m.email === "alex@example.com")!.id;
    expect((await post("northwind", "/api/member.role",
      { id: alexId, app: "hello", role: "helper" }, cookie)).status).toBe(200);

    /* The narrower role applies on the very next request: reads stay, writes stop. */
    expect((await post("northwind", "/api/note.create", { title: "Nope" }, theirs)).status).toBe(403);
    expect((await get("northwind", "/api/note.list", theirs)).status).toBe(200);
  });

  /*
    ⚠️ AN INVITATION OCCUPIES A SEAT BEFORE IT IS ANSWERED. Counting only accepted
    members lets anybody past the ceiling by inviting twenty people and waiting,
    and the overage arrives later as a bill rather than as a refusal.
  */
  it("counts an unanswered invitation against the seats — and customers never", async () => {
    SEATS = 2;
    try {
      const { cookie } = await found();
      expect((await post("northwind", "/api/member.invite",
        { email: "a@example.com", platformRole: "staff", appRoles: { hello: "writer" } },
        cookie)).status).toBe(200);
      const out = await post("northwind", "/api/member.invite",
        { email: "b@example.com", platformRole: "staff" }, cookie);
      expect(out.status).toBe(402);
      /* ⚠️ Both numbers, because they ARE the sentence. */
      const body = await out.json() as { problem: { title: string } };
      expect(body.problem.title).toContain("2");
      expect(body.problem.title).not.toContain("undefined");
      /* ⚠️ A customer is the product, not the staff: full seats must never stop
         a workspace adding the people it exists to serve. */
      expect((await post("northwind", "/api/member.invite",
        { email: "c@example.com", platformRole: "customer", appRoles: { hello: "reader" } },
        cookie)).status).toBe(200);
    } finally { SEATS = 10; }
  });

  it("refuses to invite somebody who is already here", async () => {
    const { cookie } = await found();
    expect((await post("northwind", "/api/member.invite",
      { email: "sam@example.com", platformRole: "staff" }, cookie)).status).toBe(409);
  });

  /*
    ⚠️ AND RE-ROLING IS BOUNDED BY THE SAME RULE, because bounding one door and
    not the other is the same escalation with a shorter first step.
  */
  it("promotes somebody, but only within what the promoter holds", async () => {
    const { cookie, tenant } = await found();
    await post("northwind", "/api/member.invite",
      { email: "alex@example.com", platformRole: "staff", appRoles: { hello: "writer" } }, cookie);
    const theirs = await signIn("alex@example.com");
    const them = (await membersOf(shard(), tenant.id)).find((m) => m.email === "alex@example.com")!;

    /* Staff cannot promote themselves — the same escalation with a shorter
       first step, which is why both doors ask. */
    expect((await post("northwind", "/api/member.role",
      { id: them.id, platformRole: "owner" }, theirs)).status).toBe(403);
    expect((await post("northwind", "/api/member.role",
      { id: them.id, platformRole: "owner" }, cookie)).status).toBe(200);
  });
});

/* ------------------------------------------------------------------ leaving --- */

describe("leaving", () => {
  /*
    ⚠️ A WORKSPACE WITH NOBODY WHO CAN MANAGE MEMBERS IS NOT CLOSED, IT IS
    UNREACHABLE: records intact, bill running, nobody able to invite anybody back
    in. Closing is a different action with a confirmation and an export attached.
  */
  it("refuses to let the last person who can run it walk out", async () => {
    const cookie = await signIn("sam@example.com");
    await post("setup", "/api/me.tenant.create",
      { slug: "northwind", name: "Northwind", country: "DE" }, cookie);
    const out = await post("setup", "/api/me.leave", { slug: "northwind" }, cookie);
    expect(out.status).toBe(409);
  });

  it("lets somebody else leave, and they stop being a member", async () => {
    const mine = await signIn("sam@example.com");
    await post("setup", "/api/me.tenant.create",
      { slug: "northwind", name: "Northwind", country: "DE" }, mine);
    const tenant = (await tenantBySlug(directory(), "northwind"))!;
    await post("northwind", "/api/member.invite",
      { email: "alex@example.com", platformRole: "staff", appRoles: { hello: "writer" } }, mine);
    const theirs = await signIn("alex@example.com");

    expect((await post("setup", "/api/me.leave", { slug: "northwind" }, theirs)).status).toBe(200);
    expect((await membersOf(shard(), tenant.id)).map((m) => m.email)).toEqual(["sam@example.com"]);
  });
});
