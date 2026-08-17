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
  DIRECTORY_MODULES, SHARD_MODULES,
  AUDIT_SCHEMA, CODE_TRIES, DIRECTORY_SCHEMA, IDENTITY_SCHEMA, MEMBERSHIP_SCHEMA, NOBODY,
  REPLAY_SCHEMA, addShard, applySchema, memberFor, membersOf, noteShardApp, permissionsResolver,
  personalOps, schemaFor, serve, sessionIdFrom, tenantBySlug, whoIs, type Db,
} from "@engine/runtime";
import { HELLO, hello } from "../src/index.js";

const directory = () => env.DIRECTORY as unknown as Db;
const shard = () => env.SHARD_EU_1 as unknown as Db;

const ROOTS = { root: "one.test" };
const SECRET = "test-secret";

/** ⚠️ What a deployment's mailer would do. A failure here is a refusal, not a shrug. */
const sent: { to: string; code: string }[] = [];

/**
 * ⚠️ THE VAULT SECRET IS A PARAMETER SO THE ABSENT CASE CAN BE DRIVEN. A
 * deployment that has not bound one must REFUSE a special category rather than
 * fall back to the column that exists, and a harness that always binds one
 * cannot tell the difference.
 *
 * ⚠️ AND IT IS ITS OWN SECRET, NEVER THE SESSION ONE. Rotating `AUTH_SECRET` is
 * ordinary hygiene; rotating this is the silent loss of every fact stored under
 * it, with no error until somebody reads one.
 */
const app = (vaultSecret: string | null = "test-vault-secret") => serve({
  roots: ROOTS,
  apps: { hello },
  directory: directory(),
  ...(vaultSecret ? { vaultSecret } : {}),
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
  app()(new Request(`https://${host}.one.test${path}`, init));

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
  await applySchema(directory(), DIRECTORY_MODULES);
  await applySchema(shard(), [schemaFor(HELLO), ...SHARD_MODULES]);
  await addShard(directory(), "eu-1", "eu", 100);
  await noteShardApp(directory(), "eu-1", "hello");
});

beforeEach(async () => {
  sent.length = 0;
  for (const t of ["membership", "custom_role", "note", "check_in", "audit", "replay"]) {
    await shard().exec(`DELETE FROM ${t};`);
  }
  for (const t of ["invited", "belongs", "tenant_app", "tenant", "session", "code", "account"]) {
    await directory().exec(`DELETE FROM ${t};`);
  }
});

/* --------------------------------------------------------------- signing in --- */

describe("signing in", () => {
  it("sends a code and exchanges it for a session", async () => {
    const cookie = await signIn("sam@example.com");
    expect(cookie).toContain("one_session=");

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
    expect(cookie).toContain("Domain=.one.test");
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
    const out = await app()(new Request("https://one.test/api/me.code",
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

/* ------------------------------------------------- somebody's own records --- */

/**
 * ⚠️ A SUBJECT-SCOPED COLLECTION IS THE CALLER'S OWN, BY CONSTRUCTION. The
 * generated verbs filter by whoever is asking, so nobody has to remember a
 * `WHERE` — and the one thing a handler could get wrong is the one thing no
 * handler does. Reading somebody ELSE's is a declared operation with a key of
 * its own, because only a product knows who may look.
 */
describe("a person's own records", () => {
  const week = "2026-08-10";

  const workspace = async () => {
    const boss = await signIn("sam@example.com");
    await post("setup", "/api/me.tenant.create",
      { slug: "northwind", name: "Northwind", country: "DE" }, boss);
    await post("northwind", "/api/member.invite",
      { email: "alex@example.com", platformRole: "customer", appRoles: { hello: "reader" } }, boss);
    const theirs = await signIn("alex@example.com");
    return { boss, theirs };
  };

  it("keeps one person's check-in out of another's list, without a handler saying so", async () => {
    const { boss, theirs } = await workspace();

    /* ⚠️ `person` is the scope column. It is sent, and it is discarded: the
       platform writes who is asking, so a caller cannot file a record as
       somebody else by naming them. */
    const wrote = await post("northwind", "/api/check-in.create",
      { person: "somebody-else", week, went: "fine", said: "Steady." }, theirs);
    expect(wrote.status).toBe(200);

    const mine = await get("northwind", "/api/check-in.list", theirs)
      .then((r) => r.json()) as { items: { person: string }[] };
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]?.person).not.toBe("somebody-else");

    /* The founder's own list is the founder's own, and it is empty. */
    const boss_ = await get("northwind", "/api/check-in.list", boss)
      .then((r) => r.json()) as { items: unknown[] };
    expect(boss_.items).toHaveLength(0);
  });

  /*
    ⚠️ A VAULT-BACKED VALUE NEVER REACHES A PRODUCT COLUMN, PROVEN THROUGH THE
    REAL WRITE. The kernel refuses a MANIFEST that keeps a special category
    outside the vault, and that refusal was the whole of the protection: the
    generated write bound every checked value to a column of the same name,
    `vault: true` included. So the one field an app may not keep would have been
    kept — in plaintext, outside consent, outside the record of who looked, and
    outside crypto-shredding — with every guard and every test green.

    ⚠️ AND IT IS REFUSED, NOT DROPPED. Discarding it silently would answer 200 to
    somebody who typed something private and believed it was saved.
  */
  it("refuses a vault-backed value on a deployment with no vault wired", async () => {
    const { theirs } = await workspace();

    /* ⚠️ NO SECRET IS A REFUSAL, NOT A FALLBACK. The wrong answer is to write it
       to the column that exists — which is the whole failure the declaration
       exists to prevent, and would look like an ordinary successful save. */
    const wrote = await app(null)(new Request("https://northwind.one.test/api/check-in.create", {
      method: "POST", headers: { cookie: theirs, "content-type": "application/json" },
      body: JSON.stringify({ week, went: "hard", struggling: "Not sleeping." }),
    }));
    expect(wrote.status).toBe(400);
    expect(JSON.stringify(await wrote.json())).toContain("struggling");
  });

  /*
    ⚠️ AN EVENT AN OPERATION RAISES REACHES AN INBOX, PROVEN THROUGH THE REAL
    WORKER. Everything but this was built: the inbox read, the policy, the
    per-person preference, the bell's count. `fileNote` had no caller, so an app
    raising an event raised it into nothing — and an empty inbox is
    indistinguishable from a quiet week, which is why it survived three stages.

    ⚠️ AND NOBODY IS TOLD ABOUT THEIR OWN ACTION. The founder publishes; the
    founder's own inbox stays empty and the colleague's does not.
  */
  it("files a note for the audience when an operation raises its event", async () => {
    const { boss, theirs } = await workspace();

    const made = await post("northwind", "/api/note.create", { title: "Ledger" }, boss)
      .then((r) => r.json()) as { id: string };
    expect((await post("northwind", "/api/note.publish", { id: made.id }, boss)).status).toBe(200);

    const mine = await get("northwind", "/api/inbox.list", theirs)
      .then((r) => r.json()) as { items: { title: string }[] };
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]?.title).toContain("Ledger");

    const own = await get("northwind", "/api/inbox.list", boss)
      .then((r) => r.json()) as { items: unknown[] };
    expect(own.items).toHaveLength(0);
  });

  /*
    ⚠️ THE WHOLE VAULT, THROUGH THE REAL WORKER. The value never reaches the
    column that bears its name; it is encrypted under a key derived from a
    secret this database does not hold and a salt destroying which erases the
    person. What the row keeps is nothing.
  */
  it("keeps a special category out of its own column and in the vault", async () => {
    const { theirs } = await workspace();

    const wrote = await post("northwind", "/api/check-in.create",
      { week, went: "hard", struggling: "Not sleeping." }, theirs);
    expect(wrote.status).toBe(200);

    /* ⚠️ THE COLUMN IS EMPTY AND THE CIPHERTEXT IS NOT THE PLAINTEXT. Asserting
       only the first would pass on a write that dropped the value entirely. */
    const row = await shard().prepare(`SELECT struggling FROM check_in`)
      .first<{ struggling: string | null }>();
    expect(row?.struggling ?? null).toBeNull();

    const fact = await shard().prepare(`SELECT cipher FROM vault_fact WHERE field = ?`)
      .bind("check-in.struggling").first<{ cipher: string }>();
    expect(fact?.cipher).toBeTruthy();
    expect(fact?.cipher).not.toContain("Not sleeping");

    /* ⚠️ AND THE PERSON CAN READ THEIR OWN, which is Article 15 and is the one
       read that needs no grant: a subject does not ask themselves for consent. */
    const mine = await get("northwind", "/api/vault.export", theirs)
      .then((r) => r.json()) as { facts: Record<string, string> };
    /* ⚠️ Keyed `collection.field`, which is what the declaration says and what
       the export, the grant and the look all read. */
    expect(mine.facts["check-in.struggling"]).toBe("Not sleeping.");
  });

  /*
    ⚠️ ERASURE IS THE KEY, NOT THE ROWS. After it the ciphertext is still there —
    deliberately, so the count of what was held stays verifiable — and nothing
    can read it, including us.
  */
  it("makes every fact about somebody noise, and cannot be done twice", async () => {
    const { theirs } = await workspace();
    await post("northwind", "/api/check-in.create",
      { week, went: "hard", struggling: "Not sleeping." }, theirs);

    expect((await post("northwind", "/api/vault.forget", {}, theirs)).status).toBe(200);

    const still = await shard().prepare(`SELECT cipher FROM vault_fact WHERE field = ?`)
      .bind("check-in.struggling").first<{ cipher: string }>();
    expect(still?.cipher).toBeTruthy();

    /* The export can no longer produce it, and neither can anything else. */
    expect((await get("northwind", "/api/vault.export", theirs)).status).toBe(404);
    /* ⚠️ And erasure is not a pause: a second one is refused rather than
       re-opening the subject with a new salt. */
    expect((await post("northwind", "/api/vault.forget", {}, theirs)).status).toBe(404);
  });

  /*
    ⚠️ CONSENT IS THE PART THAT MEETS ARTICLE 9, AND IT IS WITHDRAWABLE. A
    purpose the product depends on is no exception — what changes is what the
    app can do afterwards, never whether the answer may be no.
  */
  it("records an agreement and a withdrawal, and keeps both", async () => {
    const { theirs } = await workspace();

    const shown = await get("northwind", "/api/vault.consents", theirs)
      .then((r) => r.json()) as { purposes: { id: string; givenAt: string | null }[] };
    expect(shown.purposes.map((p) => p.id)).toContain("wellbeing");
    expect(shown.purposes[0]?.givenAt).toBeNull();

    await post("northwind", "/api/vault.consent", { purpose: "wellbeing", given: true }, theirs);
    await post("northwind", "/api/vault.consent", { purpose: "wellbeing", given: false }, theirs);

    const after = await get("northwind", "/api/vault.consents", theirs)
      .then((r) => r.json()) as { purposes: { givenAt: string | null; withdrawnAt: string | null }[] };
    /* ⚠️ "They agreed on Tuesday and withdrew on Friday" is the record. Deleting
       the row would leave no evidence the reads before Friday were lawful. */
    expect(after.purposes[0]?.givenAt).toBeTruthy();
    expect(after.purposes[0]?.withdrawnAt).toBeTruthy();
  });

  it("lets somebody who holds the review key read the team's, and nobody else", async () => {
    const { boss, theirs } = await workspace();
    await post("northwind", "/api/check-in.create", { week, went: "hard" }, theirs);

    const seen = await get("northwind", `/api/check-in.team?week=${week}`, boss)
      .then((r) => r.json()) as { items: unknown[] };
    expect(seen.items).toHaveLength(1);

    /* ⚠️ Writing your own week does not open everybody's — that is a third key
       and a different operation. */
    expect((await get("northwind", `/api/check-in.team?week=${week}`, theirs)).status).toBe(403);
  });
});

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
