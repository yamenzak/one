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
  DIRECTORY_MODULES, SHARD_MODULES,
  AUDIT_SCHEMA, BILLING_SCHEMA, DIRECTORY_SCHEMA, IDENTITY_SCHEMA, MEMBERSHIP_SCHEMA, NOBODY,
  REPLAY_SCHEMA, SETTING_SCHEMA, addShard, applySchema, memberFor, noteShardApp, openAccount,
  MEMBERSHIP,
  permissionsResolver, personalOps, schemaFor, serve, sessionIdFrom, subscribe, tenantBySlug,
  whoIs, type Db,
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
  /* ⚠️ The deployment's catalogue — one membership, one list. */
  plans: [
    { id: "none", name: "No plan", said: "", kind: "personal", price: 0, currency: "USD",
      credits: 0, order: 0, parking: true, includes: { seats: 1 } },
    { id: "team", name: "Team", said: "", kind: "personal", price: 900, currency: "USD",
      credits: 1000, order: 1, includes: { seats: 10 } },
  ],
  locate: asLocating(async (door) => {
    if (door.kind !== "tenant" || !door.slug) return null;
    const tenant = await tenantBySlug(directory(), door.slug);
    return tenant
      ? {
        tenantId: tenant.id, db: shard(), apps: ["ground"],
        entitlements: [
          { key: "seats", value: 10, source: "plan" as const, plan: 10 },
          /* ⚠️ `publishing` TOO, so a workspace step can actually be taken here.
             Without it `note.publish` is refused by the gate and the assertion
             that a newcomer is not asked to repeat it would pass for the wrong
             reason — the step is undone for everybody. */
          { key: "publishing", value: 1, source: "plan" as const, plan: 1 },
          { key: "notes", value: 100, source: "plan" as const, plan: 100 },
        ],
      }
      : null;
  }),
  identify: async (request, finding) => {
    const located = await finding;
    if (!located) return NOBODY;
    const { session, email, accountId } = await whoIs(directory(), sessionIdFrom(request), new Date());
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

beforeAll(async () => {
  await applySchema(directory(), DIRECTORY_MODULES);
  await applySchema(shard(), [schemaFor(GROUND), ...SHARD_MODULES]);
  await addShard(directory(), "eu-1", "eu", 100);
  await noteShardApp(directory(), "eu-1", "ground");
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
    { slug: "westgate", name: "Westgate", country: "DE", apps: ["ground"] }, owner);
  await post("westgate", "/api/member.invite",
    { email: "alex@example.com", platformRole: "customer", appRoles: { ground: "reader" } }, owner);
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
    await subscribe(directory(), tenantId as never, MEMBERSHIP, "team", "active");
    await openAccount(directory(), tenantId as never);

    /* ⚠️ `billing:read` — a customer never sees what the workspace pays. */
    expect((await get("westgate", "/api/money.view", customer)).status).toBe(403);

    const seen = await (await get("westgate", "/api/money.view", owner)).json() as {
      plan: { id: string; kind: string } | null;
      plans: unknown[];
      apps: { id: string }[];
      bill: { total: number; lines: unknown[] };
      wallet: { spendable: number };
    };
    /* ⚠️ ONE MEMBERSHIP, AND THE PRODUCTS BESIDE IT RATHER THAN UNDER IT. The
       plan is the workspace's; what it reaches is a list. */
    expect(seen.plan?.id).toBe("team");
    expect(seen.apps.map((a) => a.id)).toEqual(["ground"]);
    expect(seen.plans.length).toBeGreaterThan(0);
    /* ⚠️ The same rows a charge would collect — the paid plan is a line. */
    expect(seen.bill.lines).toHaveLength(1);
    expect(seen.bill.total).toBeGreaterThan(0);
    expect(seen.wallet.spendable).toBe(0);
  });
});

/* -------------------------------------------------------------------- centre --- */

describe("the centre's bootstrap", () => {
  /**
   * ⚠️ THE BOOK LEAVES THE SERVER, WHICH IS THE HALF A BROWSER TEST CANNOT SEE.
   * `one-space` proves the door APPLIES what it was handed; nothing there proves
   * anything hands it over, and a payload that quietly stopped carrying these
   * two would leave every write in the product silent again with the door's own
   * suite still green.
   */
  it("carries what a phone may hold and what a write says", async () => {
    const { owner } = await studio();

    const seen = await (await get("westgate", "/api/centre.view", owner)).json() as {
      apps: readonly {
        offline?: Record<string, string>;
        outcomes?: Record<string, { message: string; invalidates?: readonly string[] }>;
      }[];
    };
    const ground = seen.apps[0]!;

    /* ⚠️ A note may be written with no signal and a check-in may be read
       without one — the two halves of `offline`, both declared and both here. */
    expect(ground.offline?.["note.create"]).toBe("queue");
    expect(ground.offline?.["note.list"]).toBe("cache");
    expect(ground.offline?.["check-in.create"]).toBeUndefined();
    expect(ground.offline?.["check-in.list"]).toBe("cache");

    /* ⚠️ And what a declared write says when it worked. */
    expect(ground.outcomes?.["note.publish"]?.message).toBe("Published.");
    expect(ground.outcomes?.["note.publish"]?.invalidates).toEqual(["note.list"]);
    /* ⚠️ Absent for an operation that declared nothing, because silence is what
       that means. */
    expect(ground.outcomes?.["note.start"]).toBeUndefined();
  });
});

/* ------------------------------------------------------- whose step it is --- */

/**
 * ⚠️ HALF A CHECKLIST IS THE WORKSPACE'S AND HALF IS THE PERSON'S, AND ONLY THE
 * SECOND HALF CAN BE GOT WRONG QUIETLY. Ticked from the workspace alone,
 * somebody invited into a notebook that has been running opens a finished
 * checklist: every box crossed off by their employer, nothing taught, and
 * nothing failing anywhere — the list simply renders empty and looks right.
 */
describe("a checklist", () => {
  const guide = (cookie: string) =>
    get("westgate", "/api/guide.view", cookie).then((r) => r.json()) as Promise<{
      counts: Record<string, number>; mine: string[]; steps: { id: string }[];
    }>;

  async function joined(email: string, owner: string): Promise<string> {
    expect((await post("westgate", "/api/member.invite",
      { email, platformRole: "customer", appRoles: { ground: "writer" } }, owner)).status)
      .toBe(200);
    return signIn(email);
  }

  it("ticks a person's own step from their own work, and nobody else's", async () => {
    const { owner } = await studio();
    const made = await post("westgate", "/api/note.create", { title: "The first" }, owner);
    expect(made.status, await made.clone().text()).toBe(200);

    const mine = await guide(owner);
    expect(mine.counts["note.created"]).toBeGreaterThan(0);
    expect(mine.mine).toContain("note.created");
    expect(mine.steps.map((s) => s.id)).not.toContain("first-note");

    /* ⚠️ AND NOW SOMEBODY WHO WAS NOT THERE. The workspace's tally says a note
       has been written; theirs says nothing, so their own first note is still
       in front of them. */
    const theirs = await guide(await joined("later@example.com", owner));
    expect(theirs.counts["note.created"], "the workspace's history is everybody's")
      .toBeGreaterThan(0);
    expect(theirs.mine).toEqual([]);
    expect(theirs.steps.map((s) => s.id), "their own first note is still theirs to write")
      .toContain("first-note");
  });

  /*
    ⚠️ AND A WORKSPACE STEP STAYS THE WORKSPACE'S, which is the same fault
    pointing the other way. Publishing is the notebook discovering it has a
    public face — done once, for everybody. Made per person, the newcomer above
    would be told to publish something that has been public for a year.
  */
  it("does not ask a newcomer to repeat what the workspace has already done", async () => {
    const { owner } = await studio();
    const { id } = await post("westgate", "/api/note.create", { title: "The first" }, owner)
      .then((r) => r.json()) as { id: string };
    expect((await post("westgate", "/api/note.publish", { id }, owner)).status).toBe(200);

    const theirs = await guide(await joined("after@example.com", owner));
    expect(theirs.mine).toEqual([]);
    expect(theirs.steps.map((s) => s.id)).not.toContain("publish-one");
  });
});
