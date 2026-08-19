/**
 * THE PACKAGE RAIL, DRIVEN THROUGH THE REAL DOORS (D16).
 *
 * ⚠️ THE CLAIM UNDER TEST IS THE COLLAPSE OF THE DOUBLE-FLAGGING: a workspace
 * composes a priced bundle of keys, a purchase applies it to the buyer's
 * membership with a clock, and the ORDINARY permission gate opens and closes —
 * no second resolver, no app code, no sweep. The clock here is the wiring's
 * `now`, moved by the test the way days move, because a lapse that cannot be
 * reproduced is a lapse nobody has ever seen happen.
 */

import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DIRECTORY_MODULES, SHARD_MODULES,
  AUDIT_SCHEMA, DIRECTORY_SCHEMA, IDENTITY_SCHEMA, MEMBERSHIP_SCHEMA, NOBODY, PACKAGE_SCHEMA,
  REPLAY_SCHEMA, addShard, applySchema, memberFor, membersOf, noteShardApp, permissionsResolver,
  personalOps, schemaFor, serve, sessionIdFrom, tenantBySlug, whoIs, type Db,
} from "@engine/runtime";
import { asLocating } from "./wiring.js";
import { HELLO, hello } from "../src/index.js";

const directory = () => env.DIRECTORY as unknown as Db;
const shard = () => env.SHARD_EU_1 as unknown as Db;

const ROOTS = { root: "one.test" };
const sent: { to: string; code: string }[] = [];

/** ⚠️ The deployment's clock, and the test moves it — days pass in one line. */
let clock = new Date("2026-08-14T12:00:00Z");
const DAY = 86_400_000;
const daysOn = (n: number) => { clock = new Date(clock.getTime() + n * DAY); };

const app = () => serve({
  roots: ROOTS,
  apps: { hello },
  directory: directory(),
  shardOf: () => shard(),
  now: () => clock,
  personal: personalOps({
    secret: "test-secret", appId: "hello",
    deliver: async (to, code) => { sent.push({ to, code }); },
  }),
  locate: asLocating(async (door) => {
    if (door.kind !== "tenant" || !door.slug) return null;
    const tenant = await tenantBySlug(directory(), door.slug);
    return tenant
      ? {
        tenantId: tenant.id, db: shard(), apps: ["hello"],
        entitlements: [
          { key: "seats", value: 10, source: "plan" as const, plan: 10 },
          { key: "notes", value: 100, source: "plan" as const, plan: 100 },
          { key: "publishing", value: true, source: "plan" as const, plan: true },
        ],
      }
      : null;
  }),
  identify: async (request, finding) => {
    const located = await finding;
    if (!located) return NOBODY;
    const { session, email, accountId } = await whoIs(directory(), sessionIdFrom(request), clock);
    if (!session || !accountId) return NOBODY;
    const member = await memberFor(located.db, located.tenantId as never, accountId);
    return {
      accountId, email, signedIn: true, provenAt: session.provenAt,
      /* ⚠️ The clock the resolver reads is the deployment's — a grant expires
         here the moment it would expire in the world. */
      permissionsIn: permissionsResolver(located.db, located.tenantId as never, member,
        (appId) => (appId === "hello" ? HELLO.access.roles : null), clock),
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
  await applySchema(directory(), DIRECTORY_MODULES);
  await applySchema(shard(), [schemaFor(HELLO), ...SHARD_MODULES]);
  await addShard(directory(), "eu-1", "eu", 100);
  await noteShardApp(directory(), "eu-1", "hello");
});

beforeEach(async () => {
  sent.length = 0;
  clock = new Date("2026-08-14T12:00:00Z");
  for (const t of ["membership", "custom_role", "package", "purchase", "note", "audit", "replay"]) {
    await shard().exec(`DELETE FROM ${t};`);
  }
  for (const t of ["invited", "belongs", "tenant_app", "tenant", "session", "code", "account"]) {
    await directory().exec(`DELETE FROM ${t};`);
  }
});

/** A workspace, its owner, and a customer holding only the read-side role. */
async function studio() {
  const owner = await signIn("sam@example.com");
  await post("setup", "/api/me.tenant.create",
    { slug: "eastwind", name: "Eastwind", country: "DE" }, owner);
  await post("eastwind", "/api/member.invite",
    { email: "alex@example.com", platformRole: "customer", appRoles: { hello: "reader" } }, owner);
  const buyer = await signIn("alex@example.com");
  const tenant = (await tenantBySlug(directory(), "eastwind"))!;
  const member = (await membersOf(shard(), tenant.id)).find((m) => m.email === "alex@example.com")!;
  return { owner, buyer, memberId: member.id };
}

const PASS = {
  id: "author-pass", name: "Author pass", priceCents: 500,
  periodDays: 30, graceDays: 3, grants: ["note:write"],
};

describe("composing a package", () => {
  it("composes, and refuses what cannot be delivered", async () => {
    const { owner } = await studio();
    expect((await post("eastwind", "/api/package.create", PASS, owner)).status).toBe(200);

    /* ⚠️ Refused when composed, not at a customer's first 403 — a key nothing
       reads is money for nothing however carefully it is priced. */
    const ghost = await post("eastwind", "/api/package.create",
      { ...PASS, id: "ghost", grants: ["ghost:write"] }, owner);
    expect(ghost.status).toBe(400);

    /* The platform's offices are not for sale. */
    const office = await post("eastwind", "/api/package.create",
      { ...PASS, id: "office", grants: ["member:manage"] }, owner);
    expect(office.status).toBe(400);

    /* And the destructive floor cannot be configured away. */
    const shred = await post("eastwind", "/api/package.create",
      { ...PASS, id: "shred", retentionDays: 2 }, owner);
    expect(shred.status).toBe(400);
  });

  it("is composed by workspace authority, not by a customer", async () => {
    const { buyer } = await studio();
    expect((await post("eastwind", "/api/package.create", PASS, buyer)).status).toBe(403);
  });
});

describe("holding one", () => {
  it("opens the ordinary gate, survives grace, and lapses — no app code anywhere", async () => {
    const { owner, buyer, memberId } = await studio();
    await post("eastwind", "/api/package.create", PASS, owner);

    /* A reader may not write. */
    expect((await post("eastwind", "/api/note.create", { title: "Nope" }, buyer)).status).toBe(403);

    const granted = await post("eastwind", "/api/package.grant",
      { member: memberId, package: "author-pass" }, owner);
    expect(granted.status).toBe(200);

    /* ⚠️ The ORDINARY permission gate — note.create still says `note:write`
       and neither knows nor cares that the key arrived by purchase. */
    expect((await post("eastwind", "/api/note.create", { title: "Mine" }, buyer)).status).toBe(200);

    /* Day 31: expired, inside the 3-day grace — the grants still count.
       (Both sessions have aged out with the clock; signing in again is what a
       person would have done thirty-one days later.) */
    daysOn(31);
    const buyerLater = await signIn("alex@example.com");
    const ownerLater = await signIn("sam@example.com");
    expect((await post("eastwind", "/api/note.create", { title: "Grace" }, buyerLater)).status).toBe(200);
    const held = await (await get("eastwind", `/api/package.held?member=${memberId}`, ownerLater))
      .json() as { items: { state: string }[] };
    expect(held.items[0]!.state).toBe("grace");

    /* Day 35: lapsed. ONE comparison in the resolver, not a sweep. */
    daysOn(4);
    expect((await post("eastwind", "/api/note.create", { title: "Late" }, buyerLater)).status).toBe(403);
    /* ⚠️ The membership remains: their base role still reads, nothing was
       shredded, and nobody signed them out. */
    expect((await get("eastwind", "/api/note.list", buyerLater)).status).toBe(200);
  });

  it("extends on renewal — a queue, never a sum, and never a second window", async () => {
    const { owner, memberId } = await studio();
    await post("eastwind", "/api/package.create", PASS, owner);

    const first = await (await post("eastwind", "/api/package.grant",
      { member: memberId, package: "author-pass" }, owner)).json() as { paidUntil: string };
    const second = await (await post("eastwind", "/api/package.grant",
      { member: memberId, package: "author-pass" }, owner)).json() as { paidUntil: string };

    /* Renewing a live window queues 30 more days onto its end. */
    expect(Date.parse(second.paidUntil) - Date.parse(first.paidUntil)).toBe(30 * DAY);

    /* ⚠️ And the membership carries ONE window for the package, not two — the
       grants were replaced by source, so there is no overlapping clock for a
       resolver to mis-read. */
    const tenant = (await tenantBySlug(directory(), "eastwind"))!;
    const member = (await membersOf(shard(), tenant.id)).find((m) => m.id === memberId)!;
    expect((member.grants ?? []).filter((g) => g.source === "pkg:author-pass"))
      .toHaveLength(PASS.grants.length);
  });

  it("answers once-per from the ledger, which a folded row cannot", async () => {
    const { owner, memberId } = await studio();
    await post("eastwind", "/api/package.create",
      { ...PASS, id: "starter", oncePer: true }, owner);
    expect((await post("eastwind", "/api/package.grant",
      { member: memberId, package: "starter" }, owner)).status).toBe(200);
    expect((await post("eastwind", "/api/package.grant",
      { member: memberId, package: "starter" }, owner)).status).toBe(409);
  });

  it("is revocable as one thing, by its source", async () => {
    const { owner, buyer, memberId } = await studio();
    await post("eastwind", "/api/package.create", PASS, owner);
    await post("eastwind", "/api/package.grant", { member: memberId, package: "author-pass" }, owner);
    expect((await post("eastwind", "/api/note.create", { title: "Mine" }, buyer)).status).toBe(200);

    await post("eastwind", "/api/package.revoke", { member: memberId, package: "author-pass" }, owner);
    expect((await post("eastwind", "/api/note.create", { title: "Gone" }, buyer)).status).toBe(403);
  });

  it("stops selling an archived package while a live holding runs out its clock", async () => {
    const { owner, buyer, memberId } = await studio();
    await post("eastwind", "/api/package.create", PASS, owner);
    await post("eastwind", "/api/package.grant", { member: memberId, package: "author-pass" }, owner);
    await post("eastwind", "/api/package.archive", { id: "author-pass" }, owner);

    /* No new purchase... */
    expect((await post("eastwind", "/api/package.grant",
      { member: memberId, package: "author-pass" }, owner)).status).toBe(400);
    /* ...and the promise already priced still holds. */
    expect((await post("eastwind", "/api/note.create", { title: "Still" }, buyer)).status).toBe(200);
  });
});
