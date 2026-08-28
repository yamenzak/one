/**
 * HOW MANY OF EACH THING THERE ARE, THROUGH THE REAL DOOR.
 *
 * ⚠️ ONE ASK, NOT ONE PER NUMBER. A home screen leading with three figures had
 * to make three list reads with `limit: 1` to get them, because a list was the
 * only thing on offer that knew a total — three round trips, each carrying
 * identity, workspace, membership and standing, to run three `SELECT COUNT(*)`.
 *
 * ⚠️ AND THE TWO THINGS IT COULD GET WRONG ARE BOTH SILENT, so both are asserted
 * here rather than reasoned about. A collection the caller may not read is
 * ABSENT — "you have none" and "this is not yours to see" are different answers
 * and a nought cannot tell them apart. And a person-scoped collection is counted
 * against the PERSON: counted against the workspace, everybody would be shown
 * everybody's total, which looks exactly like a number that is simply larger.
 */

import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DIRECTORY_MODULES, SHARD_MODULES,
  NOBODY, applySchema, addShard, memberFor, noteShardApp, permissionsResolver, personalOps,
  schemaFor, serve, sessionIdFrom, tenantBySlug, whoIs, type Db,
} from "@engine/runtime";
import { asLocating } from "./wiring.js";
import { GROUND, ground } from "../src/index.js";

const directory = () => env.DIRECTORY as unknown as Db;
const shard = () => env.SHARD_EU_1 as unknown as Db;

const ROOTS = { root: "one.test" };
const sent: { to: string; code: string }[] = [];

const app = () => serve({
  roots: ROOTS,
  apps: { ground },
  directory: directory(),
  shardOf: () => shard(),
  personal: personalOps({
    secret: "test-secret", sells: () => ["ground"],
    deliver: async (to, code) => { sent.push({ to, code }); },
    deliverExport: async () => undefined,
  }),
  plans: [
    { id: "none", name: "No plan", said: "", kind: "personal", price: 0, currency: "USD",
      credits: 0, order: 0, parking: true, includes: { seats: 1 } },
  ],
  locate: asLocating(async (door) => {
    if (door.kind !== "tenant" || !door.slug) return null;
    const tenant = await tenantBySlug(directory(), door.slug);
    return tenant
      ? {
        tenantId: tenant.id, db: shard(), apps: ["ground"],
        entitlements: [
          { key: "seats", value: 10, source: "plan" as const, plan: 10 },
          { key: "notes", value: 100, source: "plan" as const, plan: 100 },
        ],
      }
      : null;
  }),
  identify: async (request, finding) => {
    const located = await finding;
    if (!located) return NOBODY;
    const { session, email, accountId } =
      await whoIs(directory(), sessionIdFrom(request), new Date());
    if (!session || !accountId) return NOBODY;
    const member = await memberFor(located.db, located.tenantId as never, accountId);
    return {
      accountId, email, signedIn: true, provenAt: session.provenAt,
      permissionsIn: permissionsResolver(located.db, located.tenantId as never, member,
        (appId) => (appId === "ground" ? GROUND.access.roles : null)),
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

/** ⚠️ The whole answer, so an absent key is distinguishable from a nought. */
const totals = async (cookie: string): Promise<Record<string, number>> => {
  const answer = await get("westgate", "/api/totals.read", cookie);
  expect(answer.status).toBe(200);
  return ((await answer.json()) as { counts: Record<string, number> }).counts;
};

beforeAll(async () => {
  await applySchema(directory(), DIRECTORY_MODULES);
  await applySchema(shard(), [schemaFor(GROUND), ...SHARD_MODULES]);
  await addShard(directory(), "eu-1", "eu", 100);
  await noteShardApp(directory(), "eu-1", "ground");
});

beforeEach(async () => {
  sent.length = 0;
  for (const t of ["membership", "setting", "note", "check_in", "audit", "replay"]) {
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
    { slug: "westgate", name: "Westgate", country: "DE", apps: ["ground"] }, owner);
  return owner;
}

describe("totals.read", () => {
  it("answers every collection's count in one request", async () => {
    const owner = await studio();
    for (const title of ["One", "Two", "Three"]) {
      expect((await post("westgate", "/api/note.create", { title }, owner)).status).toBe(200);
    }
    expect((await post("westgate", "/api/check-in.create",
      { week: "2026-08-17", went: "fine" }, owner)).status).toBe(200);

    /* ⚠️ EVERY COLLECTION, INCLUDING THE ONES NOBODY HAS USED. A workspace with
       no minutes in it answers zero rather than omitting the key — a missing
       entry and a count of none are the same thing to a screen reading a map,
       and only one of them is true. */
    expect(await totals(owner)).toEqual({ note: 3, "check-in": 1, minute: 0 });
  });

  /*
    ⚠️ THE COUNT AND THE LIST HAVE TO AGREE, WHICH IS WHY THE FILTERS ARE SHARED
    RATHER THAN WRITTEN TWICE. A hero saying four hundred over a screen showing
    twelve is the failure this replaces, and both numbers are confident.
  */
  it("counts what the list of the same collection counts", async () => {
    const owner = await studio();
    for (const title of ["One", "Two"]) {
      await post("westgate", "/api/note.create", { title }, owner);
    }
    const listed = await (await get("westgate", "/api/note.list", owner)).json() as
      { total: number };
    expect((await totals(owner)).note).toBe(listed.total);
  });

  /*
    ⚠️ A PERSON'S COLLECTION IS COUNTED AGAINST THE PERSON. Counted against the
    workspace — one id for a mixed list is the easy way to write this — every
    member would be shown everybody's check-ins as their own, and the number
    would look like nothing but a larger number.
  */
  it("counts a person-scoped collection per person, not per workspace", async () => {
    const owner = await studio();
    await post("westgate", "/api/check-in.create", { week: "2026-08-17", went: "fine" }, owner);
    await post("westgate", "/api/member.invite",
      { email: "alex@example.com", platformRole: "staff", appRoles: { ground: "writer" } }, owner);
    const colleague = await signIn("alex@example.com");

    expect((await totals(owner))["check-in"]).toBe(1);
    /* ⚠️ Nought, not absent — this person holds the key and has written none. */
    expect((await totals(colleague))["check-in"]).toBe(0);
  });

  /*
    ⚠️ ABSENT, NOT NOUGHT, AND THIS IS THE ASSERTION THE FEATURE TURNS ON. The
    operation's own permission is `PUBLIC` because no fixed key could be right
    for every caller — so what decides the CONTENTS is the collection's own read
    key, asked the way the gate asks it.
  */
  it("leaves out a collection the caller may not read", async () => {
    const owner = await studio();
    await post("westgate", "/api/note.create", { title: "One" }, owner);
    await post("westgate", "/api/member.invite",
      { email: "kim@example.com", platformRole: "customer", appRoles: {} }, owner);
    const outsider = await signIn("kim@example.com");

    const theirs = await totals(outsider);
    expect("note" in theirs).toBe(false);
    expect("check-in" in theirs).toBe(false);
    expect(theirs).toEqual({});
  });
});
