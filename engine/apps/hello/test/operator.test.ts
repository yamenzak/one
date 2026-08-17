/**
 * THE OPERATOR DOOR, AND THE SWITCH THAT CLOSES EVERY OTHER ONE.
 *
 * ⚠️ TWO DOORS BOUND THE CONSOLE AND BOTH ARE LOAD-BEARING: the hostname (it
 * answers on `admin.` and nowhere else — a console reachable at a workspace's
 * address is a console any member can try) and the ADDRESS (the deployment
 * decides who counts, because an operator is outside every workspace and no
 * role can express that).
 *
 * ⚠️ AND MAINTENANCE IS ASKED IN THE ONE OPERATION PATH, so what it withholds
 * is a property of the platform rather than a habit of routes: `readonly`
 * refuses writes and serves reads, `full` withholds both — while the operator
 * door, sign-in and leaving keep working, or the switch is a trap.
 */

import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DIRECTORY_MODULES, SHARD_MODULES,
  AUDIT_SCHEMA, BILLING_SCHEMA, DIRECTORY_SCHEMA, IDENTITY_SCHEMA, JOBS_SCHEMA,
  MEMBERSHIP_SCHEMA, NOBODY, OPERATOR_SCHEMA, REPLAY_SCHEMA,
  addShard, applySchema, memberFor, noteShardApp, operatorOps,
  permissionsResolver, personalOps, schemaFor, serve, sessionIdFrom, tenantBySlug, whoIs,
  type Db,
} from "@engine/runtime";
import { HELLO, hello } from "../src/index.js";

const directory = () => env.DIRECTORY as unknown as Db;
const shard = () => env.SHARD_EU_1 as unknown as Db;

const ROOTS = { root: "one.test" };
const sent: { to: string; code: string }[] = [];

/** ⚠️ Who the DEPLOYMENT says is an operator — never a role, never a claim. */
const OPERATORS = ["ops@example.com"];

const app = () => serve({
  roots: ROOTS,
  apps: { hello },
  directory: directory(),
  shardOf: () => shard(),
  personal: {
    ...personalOps({
      secret: "test-secret", appId: "hello",
      deliver: async (to, code) => { sent.push({ to, code }); },
    }),
    ...operatorOps({
      apps: { hello },
      isOperator: (email) => !!email && OPERATORS.includes(email),
    }),
  },
  locate: async (door) => {
    if (door.kind !== "tenant" || !door.slug) return null;
    const tenant = await tenantBySlug(directory(), door.slug);
    return tenant
      ? {
        tenantId: tenant.id, db: shard(), apps: ["hello"],
        entitlements: [
          { key: "seats", value: 10, source: "plan" as const, plan: 10 },
          { key: "notes", value: 50, source: "plan" as const, plan: 50 },
        ],
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

let ops = "";
let owner = "";

beforeAll(async () => {
  await applySchema(directory(), DIRECTORY_MODULES);
  await applySchema(shard(), [schemaFor(HELLO), ...SHARD_MODULES]);
  await addShard(directory(), "eu-1", "eu", 100);
  await noteShardApp(directory(), "eu-1", "hello");
});

beforeEach(async () => {
  sent.length = 0;
  for (const t of ["membership", "note", "audit", "replay"]) await shard().exec(`DELETE FROM ${t};`);
  for (const t of ["invited", "belongs", "tenant_app", "tenant", "session", "code", "account",
    "subscription", "maintenance", "deployment_flag"]) {
    await directory().exec(`DELETE FROM ${t};`);
  }
  ops = await signIn("ops@example.com");
  owner = await signIn("sam@example.com");
  await post("setup", "/api/me.tenant.create",
    { slug: "eastgate", name: "Eastgate", country: "DE" }, owner);
});

/* --------------------------------------------------------------- the door --- */

describe("the console's two doors", () => {
  /*
    ⚠️ EVERY OPERATOR OPERATION, DERIVED — never one of them as a sample. A
    console reachable at a workspace's own address is the deployment's own
    surface offered to that workspace's members, and one operation asserted by
    name says nothing about the next one added beside it.

    ⚠️ THIS IS THE BEHAVIOURAL HALF OF A RULE `scripts/operator.test.mjs` ALSO
    CHECKS STATICALLY, and both are worth having: the static one reads the
    declaration, this one drives the door. A declaration that is right and a
    filter that stopped reading it would pass the first and fail here.

    ⚠️ AND DRIVING A WRITE AT THE WRONG DOOR IS SAFE, which is what makes the
    sweep possible. The door filter runs before the handler, so a refusal is the
    only thing that happens.
  */
  const EVERY_OP = Object.entries(operatorOps({
    apps: { hello }, isOperator: () => true,
  })).filter(([id]) => id.startsWith("op."));

  it("answers on the operator door and nowhere else", async () => {
    expect(EVERY_OP.length, "no operator operations were found at all").toBeGreaterThan(10);
    expect((await get("admin", "/api/op.tenants", ops)).status).toBe(200);

    for (const [id, op] of EVERY_OP) {
      for (const host of ["setup", "id", "eastgate"]) {
        const said = op.kind === "read"
          ? await get(host, `/api/${id}`, ops)
          : await post(host, `/api/${id}`, {}, ops);
        expect(said.status, `${id} at ${host}`).toBe(404);
      }
    }
  });

  /* ⚠️ Signed in is not the same as an operator. The deployment decides; a
     workspace owner is nobody here. */
  it("admits an operator and refuses everybody else", async () => {
    expect((await get("admin", "/api/op.tenants", owner)).status).toBe(403);
    expect((await get("admin", "/api/op.tenants")).status).toBe(401);
  });
});

/* ------------------------------------------------------------- the writes --- */

describe("what the console can change", () => {
  it("lists the workspaces with what each is on", async () => {
    const seen = await (await get("admin", "/api/op.tenants", ops)).json() as
      { items: { slug: string; apps: { id: string }[] }[]; apps: { id: string }[] };
    expect(seen.items.map((t) => t.slug)).toContain("eastgate");
    expect(seen.apps.map((a) => a.id)).toEqual(["hello"]);
  });

  /*
    ⚠️ ABSOLUTE, EITHER DIRECTION, CLEARED PER KEY. A workspace held at ten
    seats and then cleared is back on the plan's own number — not on whatever
    the last adjustment happened to be, and never with the grandfathering
    discarded along with it.
  */
  it("adjusts a tenant's entitlement, and clears one key back to the plan", async () => {
    const tenant = (await tenantBySlug(directory(), "eastgate"))!;
    expect((await post("admin", "/api/op.tenant.adjust",
      { tenant: tenant.id, app: "hello", key: "seats", value: 25 }, ops)).status).toBe(200);

    const after = await (await get("admin", "/api/op.tenants", ops)).json() as
      { items: { slug: string; apps: { adjustments: Record<string, unknown> }[] }[] };
    const row = after.items.find((t) => t.slug === "eastgate")!;
    expect(row.apps[0]!.adjustments.seats).toBe(25);

    expect((await post("admin", "/api/op.tenant.adjust",
      { tenant: tenant.id, app: "hello", key: "seats", value: null }, ops)).status).toBe(200);
    const cleared = await (await get("admin", "/api/op.tenants", ops)).json() as
      { items: { slug: string; apps: { adjustments: Record<string, unknown> }[] }[] };
    expect(cleared.items.find((t) => t.slug === "eastgate")!.apps[0]!.adjustments).toEqual({});
  });

  /* ⚠️ A switch nothing declares is a switch that does nothing — refused, or
     the console fills with rows that lie. */
  it("switches a declared flag and refuses one nothing declares", async () => {
    expect((await post("admin", "/api/op.flag.set", { id: "note-search", on: true }, ops)).status).toBe(200);
    const seen = await (await get("admin", "/api/op.flags", ops)).json() as
      { deployment: Record<string, boolean> };
    expect(seen.deployment["note-search"]).toBe(true);
    expect((await post("admin", "/api/op.flag.set", { id: "ghost", on: true }, ops)).status).toBe(404);
  });

  it("reads the jobs and the ground", async () => {
    expect((await get("admin", "/api/op.jobs", ops)).status).toBe(200);
    const ground = await (await get("admin", "/api/op.shards", ops)).json() as
      { items: { id: string }[] };
    expect(ground.items.map((s) => s.id)).toContain("eu-1");
  });
});

/* ------------------------------------------------------- maintenance --- */

describe("maintenance", () => {
  const mode = async (m: string) =>
    expect((await post("admin", "/api/op.maintenance.set", { mode: m }, ops)).status).toBe(200);

  it("serves reads and refuses writes on readonly", async () => {
    expect((await post("eastgate", "/api/note.create", { title: "Before" }, owner)).status).toBe(200);
    await mode("readonly");

    const wrote = await post("eastgate", "/api/note.create", { title: "During" }, owner);
    expect(wrote.status).toBe(503);
    expect((await wrote.json() as { problem: { code: string } }).problem.code).toBe("platform.maintenance");
    /* ⚠️ Reads keep serving — people find their records where they left them. */
    expect((await get("eastgate", "/api/note.list", owner)).status).toBe(200);

    await mode("off");
    expect((await post("eastgate", "/api/note.create", { title: "After" }, owner)).status).toBe(200);
  });

  it("withholds both on full, and never the way out", async () => {
    await mode("full");
    expect((await get("eastgate", "/api/note.list", owner)).status).toBe(503);
    expect((await post("eastgate", "/api/note.create", { title: "No" }, owner)).status).toBe(503);

    /* ⚠️ THE EXEMPTIONS ARE THE FEATURE. The operator door still answers, or
       nobody can lift it; the personal lane still answers, or somebody's way
       out of a workspace is something our maintenance can prevent. */
    expect((await get("admin", "/api/op.maintenance", ops)).status).toBe(200);
    expect((await get("setup", "/api/me.who", owner)).status).toBe(200);
    expect((await post("setup", "/api/me.leave", { slug: "nowhere" }, owner)).status).toBe(404);

    await mode("off");
  });

  it("refuses a mode nobody declared", async () => {
    expect((await post("admin", "/api/op.maintenance.set", { mode: "sideways" }, ops)).status).toBe(400);
  });
});
