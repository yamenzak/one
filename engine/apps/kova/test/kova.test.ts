/**
 * KOVA RUNS, AND NOTHING IN `src/` IS INFRASTRUCTURE.
 *
 * ⚠️ THIS IS STAGE 9'S EXIT CRITERION AND IT IS ONE CLAIM: a real product — not
 * a toy — signs somebody in, creates a workspace, keeps records, gates them,
 * bills for them, tells people about them and erases them, with a manifest and
 * no code of its own beyond three handlers. Everything below is the platform
 * doing it.
 *
 * ⚠️ THE GOLDEN PATH IS THE POINT: a coach signs in, opens a studio, adds a
 * client, builds a plan, publishes it, and the client — signing in as
 * themselves, on their own invitation — logs a set that the coach can see. Every
 * failure in that chain is a failure a customer would meet on their first day.
 */

import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { primaryOf, refuseApp } from "@engine/kernel";
import {
  AUDIT_SCHEMA, BILLING_SCHEMA, DIRECTORY_SCHEMA, IDENTITY_SCHEMA, INBOX_SCHEMA,
  MEMBERSHIP_SCHEMA, REPLAY_SCHEMA, VAULT_SCHEMA,
  NOBODY, addShard, applySchema, compose, forget, locator, memberFor, noteShardApp, openAccount,
  permissionsResolver, personalOps, schemaFor, serve, sessionIdFrom, subscribe, surfaceOfComposed,
  tenantBySlug, whoIs, type Db,
} from "@engine/runtime";
import { KOVA, kova } from "../src/index.js";

const directory = () => env.DIRECTORY as unknown as Db;
const shard = () => env.SHARD_EU_1 as unknown as Db;

const ROOTS = { root: "one.test" };
const sent: { to: string; code: string }[] = [];

/**
 * ⚠️ THE WHOLE DEPLOYMENT, IN ONE OBJECT. This is what shipping Kova amounts to
 * now: a manifest, a locator and the platform's own personal operations. There
 * is no Kova worker, no Kova database, no Kova migration and no Kova router.
 */
const app = () => serve({
  roots: ROOTS,
  apps: { kova },
  directory: directory(),
  shardOf: () => shard(),
  personal: personalOps({
    secret: "test-secret", appId: "kova",
    deliver: async (to, code) => { sent.push({ to, code }); },
  }),
  locate: locator({
    directory: directory(),
    shardOf: () => shard(),
    appsOf: async () => [KOVA],
    charging: true,
    flags: async () => ({ "ai-drafting": false }),
  }),
  identify: async (request, located) => {
    const { session, email, accountId } = await whoIs(directory(), sessionIdFrom(request), new Date());
    if (!session || !accountId) return NOBODY;
    const member = await memberFor(located.db, located.tenantId as never, accountId);
    return {
      accountId, email, signedIn: true, provenAt: session.provenAt,
      permissionsIn: permissionsResolver(located.db, located.tenantId as never, member,
        (appId) => (appId === "kova" ? KOVA.access.roles : null)),
    };
  },
});

const at = (host: string, path: string, init: RequestInit = {}) =>
  app()(new Request(`https://${host}.one.test${path}`, init));
const post = (host: string, path: string, body: unknown, cookie?: string) =>
  at(host, path, { method: "POST", body: JSON.stringify(body), headers: cookie ? { cookie } : {} });
const get = (host: string, path: string, cookie?: string) =>
  at(host, path, { headers: cookie ? { cookie } : {} });

const codeFor = (email: string) => sent.filter((s) => s.to === email).at(-1)!.code;
const cookieOf = (r: Response) => (r.headers.get("set-cookie") ?? "").split(";")[0]!;

async function signIn(email: string): Promise<string> {
  expect((await post("setup", "/api/me.code", { email })).status).toBe(200);
  const done = await post("setup", "/api/me.session", { email, code: codeFor(email) });
  expect(done.status).toBe(200);
  return cookieOf(done);
}

beforeAll(async () => {
  await applySchema(directory(), [DIRECTORY_SCHEMA, IDENTITY_SCHEMA, BILLING_SCHEMA]);
  await applySchema(shard(),
    [schemaFor(KOVA), MEMBERSHIP_SCHEMA, AUDIT_SCHEMA, REPLAY_SCHEMA, INBOX_SCHEMA, VAULT_SCHEMA]);
  await addShard(directory(), "eu-1", "eu", 100);
  await noteShardApp(directory(), "eu-1", "kova");
});

beforeEach(async () => {
  forget();
  sent.length = 0;
  for (const t of ["client", "plan", "workout_log", "meal", "measurement", "invoice",
    "membership", "custom_role", "audit", "replay", "inbox"]) {
    await shard().exec(`DELETE FROM ${t};`);
  }
  for (const t of ["invited", "belongs", "billing_account", "subscription", "tenant_app",
    "tenant", "session", "code", "account"]) {
    await directory().exec(`DELETE FROM ${t};`);
  }
});

/** A studio, on a plan that includes what the tests exercise. */
async function studio(plan = "studio"): Promise<{ coach: string; slug: string }> {
  const coach = await signIn("coach@example.com");
  const made = await post("setup", "/api/me.tenant.create",
    { slug: "ironworks", name: "Ironworks", country: "DE" }, coach);
  expect(made.status).toBe(200);
  const tenant = (await tenantBySlug(directory(), "ironworks"))!;
  await openAccount(directory(), tenant.id);
  await subscribe(directory(), tenant.id, "kova", plan, "active");
  return { coach, slug: "ironworks" };
}

/* ------------------------------------------------------- what it composes --- */

describe("the manifest alone", () => {
  it("composes, with nothing sold that is not enforced and nothing declared that is unreachable", () => {
    expect(refuseApp(KOVA)).toEqual([]);
  });

  /*
    ⚠️ SIX COLLECTIONS AND THREE HANDLERS PRODUCED THIRTY-EIGHT ROUTES, and not
    one of them was registered. The roster and the inbox are there without Kova
    declaring them, because every workspace has people in it and everybody has
    been told things.
  */
  it("derives its whole surface, including what it never declared", () => {
    const surface = surfaceOfComposed(compose(KOVA)).map((r) => r.id);
    expect(surface).toContain("client.create");
    expect(surface).toContain("plan.publish");
    expect(surface).toContain("client.history");
    expect(surface).toContain("member.invite");
    expect(surface).toContain("inbox.list");
    expect(surface.length).toBeGreaterThan(30);
  });

  /* ⚠️ Five primary destinations, maximum (D10). */
  it("keeps to five places to be", () => {
    expect(primaryOf(KOVA.screens)).toHaveLength(5);
  });
});

/* ------------------------------------------------------- the golden path --- */

describe("a coach's first day", () => {
  it("opens a studio, adds a client, builds a plan and publishes it", async () => {
    const { coach, slug } = await studio();

    const client = await post(slug, "/api/client.create",
      { name: "Alex Rivera", email: "alex@example.com", goal: "First 5k" }, coach);
    expect(client.status).toBe(200);

    const plan = await post(slug, "/api/plan.create",
      { title: "Base building", weeks: { 1: ["squat", "row"] }, published: false }, coach);
    expect(plan.status).toBe(200);
    const { id } = await plan.json() as { id: string };

    const out = await post(slug, "/api/plan.publish", { id }, coach);
    expect(await out.json()).toEqual({ id, published: true });

    /* ⚠️ The audit entry was written by the platform: nothing in Kova's manifest
       mentions auditing, and every write here is recorded. */
    const audited = await shard().prepare(
      `SELECT op FROM audit WHERE ok = 1 ORDER BY at`).all<{ op: string }>();
    expect(audited.results.map((r) => r.op))
      .toEqual(["client.create", "plan.create", "plan.publish"]);
  });

  /*
    ⚠️ AND A CLIENT'S LOGBOOK IS THEIRS BY CONSTRUCTION. `workout-log` is
    subject-scoped, so the generated verbs filter by whoever is asking — a coach
    reading it goes through `client.history`, which is a declared operation with
    its own permission rather than a handler remembering a `WHERE`.
  */
  it("lets a client log a set, and the coach see it", async () => {
    const { coach, slug } = await studio();
    expect((await post(slug, "/api/member.invite",
      { email: "alex@example.com", platformRole: "customer", appRoles: { kova: "client" } }, coach)).status).toBe(200);

    const client = await signIn("alex@example.com");
    const logged = await post(slug, "/api/workout-log.create",
      { loggedBy: "ignored", exercise: "Back squat", reps: 5, weightKg: 80, onDay: "2026-08-14" },
      client);
    expect(logged.status).toBe(200);

    /* Their own list is their own. */
    const mine = await (await get(slug, "/api/workout-log.list", client)).json() as { items: unknown[] };
    expect(mine.items).toHaveLength(1);

    /* ⚠️ The coach cannot read it through the generated verb — that one only
       ever answers with the caller's own — and can through the declared one. */
    const theirs = await (await get(slug, "/api/workout-log.list", coach)).json() as { items: unknown[] };
    expect(theirs.items).toHaveLength(0);

    const account = await directory().prepare(`SELECT id FROM account WHERE email = ?`)
      .bind("alex@example.com").first<{ id: string }>();
    const seen = await (await get(slug,
      `/api/client.history?clientId=${account!.id}&since=2026-01-01`, coach)).json() as
      { items: unknown[] };
    expect(seen.items).toHaveLength(1);
  });

  /* ⚠️ A client holds none of the coach's keys, and the refusal comes from the
     platform rather than from anything Kova wrote. */
  it("does not let a client read the studio's roster or its clients", async () => {
    const { coach, slug } = await studio();
    await post(slug, "/api/member.invite", { email: "alex@example.com", platformRole: "customer", appRoles: { kova: "client" } }, coach);
    const client = await signIn("alex@example.com");

    expect((await get(slug, "/api/client.list", client)).status).toBe(403);
    expect((await get(slug, "/api/member.list", client)).status).toBe(403);
    /* ...and their own inbox is theirs, which needs no role at all. */
    expect((await get(slug, "/api/inbox.list", client)).status).toBe(200);
  });
});

/* ------------------------------------------------------------ what is sold --- */

describe("what a studio has paid for", () => {
  /*
    ⚠️ THE CEILING IS THE PLAN'S, COUNTED FROM THE RECORDS. Nothing in Kova's
    manifest counts anything: `clients` is named as the collection's quota and
    the platform does the rest.
  */
  it("stops at the number of clients the plan includes", async () => {
    const { coach, slug } = await studio("solo");
    /* Solo includes 15; make them and then one more. */
    for (let i = 0; i < 15; i++) {
      expect((await post(slug, "/api/client.create", { name: `Client ${i}` }, coach)).status).toBe(200);
    }
    const over = await post(slug, "/api/client.create", { name: "One too many" }, coach);
    expect(over.status).toBe(402);
    const body = await over.json() as { problem: { code: string; title: string } };
    expect(body.problem.code).toBe("platform.quota_reached");
    expect(body.problem.title).toContain("15");
    expect(body.problem.title).not.toContain("undefined");
  });

  /* ⚠️ "Your plan does not include this" is a different sentence from "you have
     used all of yours", and it comes first. */
  it("refuses AI drafting on a plan that does not include it", async () => {
    const { coach, slug } = await studio("solo");
    const out = await post(slug, "/api/plan.draft", { clientId: "x", weeks: 4 }, coach);
    expect(out.status).toBe(402);
    expect((await out.json() as { problem: { code: string } }).problem.code)
      .toBe("platform.payment_required");
  });

  /*
    ⚠️ AND A FLAG IS OURS WHILE AN ENTITLEMENT IS THEIRS. On a plan that DOES
    include it, the switch we have not turned on answers "not here" rather than
    offering to sell something that does not exist yet.
  */
  it("hides what we have not switched on rather than selling it", async () => {
    const { coach, slug } = await studio("max");
    const out = await post(slug, "/api/plan.draft", { clientId: "x", weeks: 4 }, coach);
    expect(out.status).toBe(404);
  });

  /* ⚠️ A client costs no seat: they are the product, not the staff. */
  it("counts staff against the seats and clients against the clients", async () => {
    const { coach, slug } = await studio("solo");
    /* Solo sells one seat, and the founder is holding it. */
    const staff = await post(slug, "/api/member.invite",
      { email: "second@example.com", platformRole: "staff", appRoles: { kova: "trainer" } }, coach);
    expect(staff.status).toBe(402);

    const asClient = await post(slug, "/api/member.invite",
      { email: "alex@example.com", platformRole: "customer", appRoles: { kova: "client" } }, coach);
    expect(asClient.status).toBe(200);
  });
});

/* ------------------------------------------------------------- the record --- */

describe("what Kova never wrote", () => {
  /*
    ⚠️ NONE OF THIS IS IN `src/index.ts`. The tables, the scope column, the audit
    row, the replay, the erasure cascade, the roster and the inbox are all the
    platform's — which is the entire claim of the stage.
  */
  it("keeps a client's record in a table nobody wrote a migration for", async () => {
    const { coach, slug } = await studio();
    await post(slug, "/api/client.create", { name: "Alex Rivera", goal: "First 5k" }, coach);
    const row = await shard().prepare(`SELECT name, tenant_id, by FROM client`).first<
      { name: string; tenant_id: string; by: string }>();
    expect(row?.name).toBe("Alex Rivera");
    /* ⚠️ The scope and the actor were written by the platform, not the caller. */
    expect(row?.tenant_id).toBeTruthy();
    expect(row?.by).toBeTruthy();
  });

  it("answers a retried publish with the first answer, once", async () => {
    const { coach, slug } = await studio();
    const plan = await post(slug, "/api/plan.create", { title: "Base" }, coach);
    const { id } = await plan.json() as { id: string };
    const first = await post(slug, "/api/plan.publish", { id }, coach);
    const again = await post(slug, "/api/plan.publish", { id }, coach);
    expect(await again.json()).toEqual(await first.json());
    expect(again.headers.get("idempotent-replay")).toBe("true");
  });

  /* ⚠️ A studio in arrears reads everything and changes nothing — and the
     sentence it is given is about the bill rather than about its roles. */
  it("holds a studio that stopped paying to reading", async () => {
    const { coach, slug } = await studio();
    const tenant = (await tenantBySlug(directory(), "ironworks"))!;
    await directory().prepare(
      `UPDATE subscription SET status = 'past_due', past_due_at = ? WHERE tenant_id = ?`)
      .bind(new Date(Date.now() - 12 * 24 * 3600 * 1000).toISOString(), tenant.id).run();

    expect((await get(slug, "/api/client.list", coach)).status).toBe(200);
    const blocked = await post(slug, "/api/client.create", { name: "Nope" }, coach);
    expect(blocked.status).toBe(402);
    const body = await blocked.json() as { problem: { code: string; detail?: string } };
    expect(body.problem.code).toBe("platform.read_only");
    expect(body.problem.detail).toContain("invoice");

    /* ⚠️ And leaving is still allowed: paying must be a way out, not the only one. */
    expect((await get("setup", "/api/me.who", coach)).status).toBe(200);
  });
});
