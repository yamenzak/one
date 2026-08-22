/**
 * AN OWNER ADDS AND REMOVES A PRODUCT, FROM INSIDE THEIR OWN WORKSPACE.
 *
 * ⚠️ `enableApp` AND `disableApp` WERE THE OPERATOR'S ALONE, so a workspace that
 * wanted a different product had to ask us — a support conversation for a
 * decision the customer is entitled to make about their own workspace. This is
 * the half that did not exist, driven through the real doors.
 *
 * ⚠️ AND IT TAKES TWO PRODUCTS TO ASK ANY OF IT. A list of what is on is a
 * status; the same list beside what is available is a decision. One product
 * cannot express "add", "remove" or "not the last one" — so this suite mounts
 * the ground and a second manifest beside it, which is what the ground is for.
 * It cannot live in the deployment's own suite, because the deployment sells one
 * product and must not mount a fixture to make a test easier.
 */

import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AppSpec, TenantId } from "@engine/kernel";
import {
  DIRECTORY_MODULES, SHARD_MODULES,
  AUDIT_SCHEMA, BILLING_SCHEMA, BRANDING_SCHEMA, DIRECTORY_SCHEMA, IDENTITY_SCHEMA,
  INBOX_SCHEMA, MEMBERSHIP_SCHEMA, NOBODY, REPLAY_SCHEMA,
  addShard, applySchema, createTenant, disableApp, enableApp, found, locator, memberFor,
  liveAppsOfTenant, noteBelonging, noteShardApp, permissionsResolver, personalOps, schemaFor, serve, sessionIdFrom,
  startSession, upsertAccount, whoIs, type Db,
} from "@engine/runtime";
import { GROUND, ground } from "../src/index.js";

const directory = () => env.DIRECTORY as unknown as Db;
const shard = () => env.SHARD_EU_1 as unknown as Db;

/**
 * ⚠️ A SECOND PRODUCT, AND ITS COLLECTION IS RENAMED RATHER THAN COPIED. Two
 * apps declaring `note` would both answer `note.list`, and `serve` takes the
 * first of the workspace's apps that has the operation — so "switched off means
 * 404" would pass with the switch doing nothing at all.
 */
const NOTE = GROUND.collections.find((c) => c.id === "note")!;
const LEDGER: AppSpec = {
  ...GROUND,
  id: "ledger",
  name: "Ledger",
  mark: "▤",
  screens: [],
  settings: {},
  settingAreas: {},
  operations: [],
  jobs: {},
  guide: undefined,
  milestones: undefined,
  help: undefined,
  notifications: {},
  collections: [{
    ...NOTE, id: "row", label: { one: "Row", many: "Rows" },
    permission: "row", quota: null, searchable: undefined,
  }],
  access: { permissions: ["row:read", "row:write"], roles: { keeper: ["row:read", "row:write"] },
    founding: "keeper" },
} as unknown as AppSpec;

const APPS = { ground, ledger: () => LEDGER };

const ROOTS = { root: "one.test" };
const SLUG = "switchable";

const app = () => serve({
  roots: ROOTS,
  apps: APPS,
  directory: directory(),
  shardOf: () => shard(),
  products: {
    sells: () => ["ledger", "ground"],
    switchOn: async (tenantId, appId, now) => {
      const app = APPS[appId as keyof typeof APPS]?.();
      if (!app) return false;
      return !await enableApp(directory(), shard(), tenantId as TenantId, appId as never,
        schemaFor(app), applySchema, now);
    },
    switchOff: (tenantId, appId, now) =>
      disableApp(directory(), tenantId as TenantId, appId as never, now),
  },
  personal: personalOps({
    secret: "test-secret", sells: () => ["ledger", "ground"],
    deliver: async () => undefined,
    deliverExport: async () => undefined,
    isOperator: () => false,
  }),
  locate: locator({
    directory: directory(),
    shardOf: () => shard(),
    /* ⚠️ WHAT IS ON, NOT WHAT IS MOUNTED, which is the whole subject here. This
       list becomes the composed surface, so a product switched off has to leave
       it — a fixture answering `[ground, ledger]` unconditionally would make
       every assertion below pass with the switch doing nothing. */
    appsOf: async (tenant) => {
      const ids = await liveAppsOfTenant(directory(), tenant.id);
      return ids.map((id) => APPS[id as keyof typeof APPS]?.())
        .filter((a): a is AppSpec => !!a);
    },
    plans: [],
    charging: async () => false,
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
        (appId) => APPS[appId as keyof typeof APPS]?.().access.roles ?? null),
    };
  },
});

const at = (path: string, init: RequestInit = {}) =>
  app()(new Request(`https://${SLUG}.one.test${path}`, init));

let tenantId = "";
let cookie = "";

beforeAll(async () => {
  await applySchema(directory(), DIRECTORY_MODULES);
  await applySchema(shard(), [schemaFor(GROUND), schemaFor(LEDGER), ...SHARD_MODULES]);
  await addShard(directory(), "eu-1", "eu", 100);
  for (const id of ["ground", "ledger"]) await noteShardApp(directory(), "eu-1", id);
});

beforeEach(async () => {
  for (const t of ["membership", "note", "row", "audit", "replay"]) {
    await shard().exec(`DELETE FROM ${t};`);
  }
  for (const t of ["belongs", "tenant_app", "tenant", "session", "account"]) {
    await directory().exec(`DELETE FROM ${t};`);
  }

  const made = await createTenant(directory(), {
    slug: SLUG, name: "Switchable", country: "DE", where: "eu", apps: ["ground"],
  });
  if (typeof made === "string") throw new Error(made);
  tenantId = made.tenant.id;

  const me = await upsertAccount(directory(), "owner@example.com", null);
  await found(shard(), tenantId as never, me as never, "owner@example.com", { ground: "writer" });
  await noteBelonging(directory(), me as never, tenantId as never);
  cookie = `one_session=${(await startSession(directory(), me as never)).id}`;
});

const listApps = () => at("/api/app.list", { headers: { cookie } })
  .then(async (r) => [r.status, await r.json()] as const);

const switchApp = (on: boolean, id: string) => at(`/api/app.${on ? "add" : "remove"}`, {
  method: "POST", headers: { cookie, "content-type": "application/json" },
  body: JSON.stringify({ id }),
});

describe("what a workspace has, and what it could", () => {
  it("lists what is on beside what could be added", async () => {
    const [status, said] = await listApps();
    expect(status).toBe(200);
    const items = (said as { items: { id: string; on: boolean; last: boolean }[] }).items;
    /* ⚠️ BOTH PRODUCTS, one on and one not — a list of only what is switched on
       is a status, and the pair is what makes it a decision. */
    expect(items.map((a) => [a.id, a.on])).toEqual([["ledger", false], ["ground", true]]);
    /* ⚠️ AND THE SCREEN IS TOLD WHICH ONE IS THE LAST, so it can disable that
       switch rather than let it be pressed and refused. */
    expect(items.find((a) => a.id === "ground")?.last).toBe(true);
  });

  /**
   * ⚠️ THE WHOLE POINT, END TO END: an owner adds a product and its routes start
   * answering at their own door, with no operator anywhere in it.
   */
  it("adds a product, and the product answers", async () => {
    expect((await at("/api/row.list", { headers: { cookie } })).status).toBe(404);

    expect((await switchApp(true, "ledger")).status).toBe(200);
    expect((await at("/api/row.list", { headers: { cookie } })).status).toBe(200);

    /* ⚠️ AND THE LAST-ONE FLAG MOVED WITH IT. With two on, neither is the last,
       so both switches are live. */
    const [, said] = await listApps();
    expect((said as { items: { last: boolean }[] }).items.every((a) => !a.last)).toBe(true);
  });

  it("removes one, and keeps the records behind it", async () => {
    expect((await switchApp(true, "ledger")).status).toBe(200);
    expect((await switchApp(false, "ledger")).status).toBe(200);
    expect((await at("/api/row.list", { headers: { cookie } })).status).toBe(404);

    /* ⚠️ OFF IS NOT GONE. Switching it back on returns everything — a toggle
       that erased would be the most destructive control in the product. */
    expect((await switchApp(true, "ledger")).status).toBe(200);
    expect((await at("/api/row.list", { headers: { cookie } })).status).toBe(200);
  });

  /**
   * ⚠️ A WORKSPACE CANNOT EMPTY ITSELF. With nothing switched on it has no
   * screens — including the one that would switch something back on — so it is a
   * door that locks from the inside, with the bill still running.
   */
  it("refuses to switch off the only product it has", async () => {
    expect((await switchApp(false, "ground")).status).toBe(409);
    expect((await at("/api/note.list", { headers: { cookie } })).status).toBe(200);
  });

  /* ⚠️ THE REGISTRY HOLDS WHAT THIS DEPLOYMENT CAN RUN; `sells` holds what
     anybody may switch on for themselves. An id in neither is not found. */
  it("refuses a product this deployment does not sell", async () => {
    expect((await switchApp(true, "nonesuch")).status).toBe(404);
  });

  /**
   * ⚠️ AND A SWITCH THAT DID NOT LAND SAYS SO, which is what a `200` used to
   * mean here. `switchOn` applies a schema and writes a row and can decline at
   * either; reported as success, the customer gets a switch that snaps on, a nav
   * that does not change, and a product answering 404 at every route.
   */
  it("says so when switching on did not land", async () => {
    const refusing = () => serve({
      roots: ROOTS, apps: APPS, directory: directory(), shardOf: () => shard(),
      products: { sells: () => ["ledger", "ground"], switchOn: async () => false,
        switchOff: async () => undefined },
      locate: locator({
        directory: directory(), shardOf: () => shard(),
        appsOf: async (tenant) => (await liveAppsOfTenant(directory(), tenant.id))
          .map((id) => APPS[id as keyof typeof APPS]?.()).filter((a): a is AppSpec => !!a),
        plans: [], charging: async () => false,
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
            (appId) => APPS[appId as keyof typeof APPS]?.().access.roles ?? null),
        };
      },
    });

    const out = await refusing()(new Request(`https://${SLUG}.one.test/api/app.add`, {
      method: "POST", headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ id: "ledger" }),
    }));
    expect(out.status).toBe(503);
    /* ⚠️ AND NOTHING WAS SWITCHED ON, so the screen and the workspace agree. */
    expect(await liveAppsOfTenant(directory(), tenantId as never)).toEqual(["ground"]);
  });
});
