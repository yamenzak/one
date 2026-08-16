/**
 * THE CENTRE'S PLATFORM READS AND WRITES, THROUGH THE REAL DOORS.
 *
 * ⚠️ TWO OPERATIONS CARRY THE WHOLE SETTINGS SURFACE, AND THE AUTHORITY IS THE
 * DECLARATION'S. A person's row is theirs; a workspace row needs the declared
 * `needs`; what the caller may not change is ABSENT from the read, not hidden
 * by a screen. And the Money area is ONE call for the whole workspace — the
 * bill somebody sees is assembled from the same rows a charge would collect.
 */

import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AUDIT_SCHEMA, BILLING_SCHEMA, DIRECTORY_SCHEMA, IDENTITY_SCHEMA, MEMBERSHIP_SCHEMA, NOBODY,
  REPLAY_SCHEMA, SETTING_SCHEMA, addShard, applySchema, memberFor, noteShardApp, openAccount,
  permissionsResolver, personalOps, schemaFor, serve, sessionIdFrom, subscribe, tenantBySlug,
  whoIs, type Db,
} from "@engine/runtime";
import { HELLO, hello } from "../src/index.js";

const directory = () => env.DIRECTORY as unknown as Db;
const shard = () => env.SHARD_EU_1 as unknown as Db;

const ROOTS = { root: "one.test" };
const sent: { to: string; code: string }[] = [];

const app = () => serve({
  roots: ROOTS,
  apps: { hello },
  directory: directory(),
  shardOf: () => shard(),
  personal: personalOps({
    secret: "test-secret", appId: "hello",
    deliver: async (to, code) => { sent.push({ to, code }); },
  }),
  locate: async (door) => {
    if (door.kind !== "tenant" || !door.slug) return null;
    const tenant = await tenantBySlug(directory(), door.slug);
    return tenant
      ? {
        tenantId: tenant.id, db: shard(), apps: ["hello"],
        entitlements: [{ key: "seats", value: 10, source: "plan" as const, plan: 10 }],
      }
      : null;
  },
  identify: async (request, located) => {
    const { session, email, accountId } = await whoIs(directory(), sessionIdFrom(request), new Date());
    if (!session || !accountId) return NOBODY;
    const member = await memberFor(located.db, located.tenantId as never, accountId);
    return {
      accountId, email, signedIn: true, provenAt: session.provenAt,
      permissionsIn: permissionsResolver(located.db, located.tenantId as never, member,
        (appId) => (appId === "hello" ? HELLO.access.roles : null)),
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
    [schemaFor(HELLO), MEMBERSHIP_SCHEMA, SETTING_SCHEMA, AUDIT_SCHEMA, REPLAY_SCHEMA]);
  await addShard(directory(), "eu-1", "eu", 100);
  await noteShardApp(directory(), "eu-1", "hello");
});

beforeEach(async () => {
  sent.length = 0;
  for (const t of ["membership", "setting", "note", "audit", "replay"]) {
    await shard().exec(`DELETE FROM ${t};`);
  }
  for (const t of ["invited", "belongs", "tenant_app", "tenant", "session", "code", "account",
    "subscription", "billing_account", "credit_ledger"]) {
    await directory().exec(`DELETE FROM ${t};`);
  }
});

async function studio() {
  const owner = await signIn("sam@example.com");
  await post("setup", "/api/me.tenant.create",
    { slug: "westgate", name: "Westgate", country: "DE" }, owner);
  await post("westgate", "/api/member.invite",
    { email: "alex@example.com", platformRole: "customer", appRoles: { hello: "reader" } }, owner);
  const customer = await signIn("alex@example.com");
  const tenant = (await tenantBySlug(directory(), "westgate"))!;
  return { owner, customer, tenantId: tenant.id };
}

/* ------------------------------------------------------------------ settings --- */

describe("the settings surface", () => {
  it("answers per caller: the workspace's rows only to who could change them", async () => {
    const { owner, customer } = await studio();

    const mine = await (await get("westgate", "/api/setting.read", owner)).json() as
      { tenant: Record<string, unknown>; person: Record<string, unknown> };
    expect(mine.tenant["notes.default_pinned"]).toEqual({ value: false });
    expect(mine.person["notes.density"]).toEqual({ value: undefined });

    /* ⚠️ ABSENT, not disabled — the autodiscovery rule's server half. */
    const theirs = await (await get("westgate", "/api/setting.read", customer)).json() as
      { tenant: Record<string, unknown>; person: Record<string, unknown> };
    expect(theirs.tenant["notes.default_pinned"]).toBeUndefined();
    expect("notes.density" in theirs.person).toBe(true);
  });

  it("writes a person's own row with no workspace authority at all", async () => {
    const { customer } = await studio();
    expect((await post("westgate", "/api/setting.write",
      { id: "notes.density", value: "compact" }, customer)).status).toBe(200);
    const read = await (await get("westgate", "/api/setting.read", customer)).json() as
      { person: Record<string, { value: unknown }> };
    expect(read.person["notes.density"]!.value).toBe("compact");
  });

  it("holds the declaration's authority on a workspace row", async () => {
    const { owner, customer } = await studio();
    /* The customer holds nothing the declaration names. */
    expect((await post("westgate", "/api/setting.write",
      { id: "notes.default_pinned", value: true }, customer)).status).toBe(403);
    expect((await post("westgate", "/api/setting.write",
      { id: "notes.default_pinned", value: true }, owner)).status).toBe(200);

    const read = await (await get("westgate", "/api/setting.read", owner)).json() as
      { tenant: Record<string, { value: unknown }> };
    expect(read.tenant["notes.default_pinned"]!.value).toBe(true);
  });

  it("refuses a value the field refuses, and a setting nothing declares", async () => {
    const { customer } = await studio();
    expect((await post("westgate", "/api/setting.write",
      { id: "notes.density", value: "sideways" }, customer)).status).toBe(400);
    expect((await post("westgate", "/api/setting.write",
      { id: "ghost.setting", value: 1 }, customer)).status).toBe(404);
  });
});

/* --------------------------------------------------------------------- money --- */

describe("the money view", () => {
  it("answers the whole workspace in one call, to billing authority only", async () => {
    const { owner, customer, tenantId } = await studio();
    await subscribe(directory(), tenantId as never, "hello" as never, "team", "active");
    await openAccount(directory(), tenantId as never);

    /* ⚠️ `billing:read` — a customer never sees what the workspace pays. */
    expect((await get("westgate", "/api/money.view", customer)).status).toBe(403);

    const seen = await (await get("westgate", "/api/money.view", owner)).json() as {
      apps: { id: string; planId: string | null; plans: unknown[] }[];
      bill: { total: number; lines: unknown[] };
      balance: { spendable: number };
    };
    expect(seen.apps.map((a) => a.id)).toEqual(["hello"]);
    expect(seen.apps[0]!.planId).toBe("team");
    expect(seen.apps[0]!.plans.length).toBeGreaterThan(0);
    /* ⚠️ The same rows a charge would collect — the paid plan is a line. */
    expect(seen.bill.lines).toHaveLength(1);
    expect(seen.bill.total).toBeGreaterThan(0);
    expect(seen.balance.spendable).toBe(0);
  });
});
