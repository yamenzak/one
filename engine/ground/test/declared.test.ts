import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AppSpec } from "@engine/kernel";
import {
  DIRECTORY_MODULES, SHARD_MODULES,
  NOBODY, addShard, applySchema, createTenant, found, locator, memberFor,
  liveAppsOfTenant, noteBelonging, noteShardApp, permissionsResolver, personalOps,
  put, schemaFor, serve, sessionIdFrom, startSession, upsertAccount, whoIs, type Db,
} from "@engine/runtime";
import { GROUND, ground } from "../src/index.js";

const directory = () => env.DIRECTORY as unknown as Db;
const shard = () => env.SHARD_EU_1 as unknown as Db;

const APPS = { ground };

const ROOTS = { root: "one.test" };
const SLUG = "notebook";

const app = () => serve({
  roots: ROOTS,
  apps: APPS,
  directory: directory(),
  shardOf: () => shard(),
  personal: personalOps({
    secret: "test-secret", sells: () => ["ground"],
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
  await applySchema(shard(), [schemaFor(GROUND), ...SHARD_MODULES]);
  await addShard(directory(), "eu-1", "eu", 100);
  await noteShardApp(directory(), "eu-1", "ground");
});

beforeEach(async () => {
  for (const t of ["membership", "note", "audit", "replay"]) {
    await shard().exec(`DELETE FROM ${t};`);
  }
  for (const t of ["belongs", "tenant_app", "tenant", "session", "account"]) {
    await directory().exec(`DELETE FROM ${t};`);
  }

  const made = await createTenant(directory(), {
    slug: SLUG, name: "Notebook", country: "DE", where: "eu", apps: ["ground"],
  });
  if (typeof made === "string") throw new Error(made);
  tenantId = made.tenant.id;

  const me = await upsertAccount(directory(), "owner@example.com", null);
  await found(shard(), tenantId as never, me as never, "owner@example.com", { ground: "writer" });
  await noteBelonging(directory(), me as never, tenantId as never);
  cookie = `one_session=${(await startSession(directory(), me as never)).id}`;
});


const NOTES = GROUND.collections.find((c) => c.id === "note")!;

const write = async (title: string, text: string) => {
  const done = await put(shard(), NOTES, tenantId as never, { title, body: text });
  if ("why" in done) throw new Error(done.why);
  return done.id;
};

const screen = (id: string, query = "") =>
  at(`/api/screen/${id}${query}`, { headers: { cookie } })
    .then(async (r) => [r.status, await r.json()] as const);

/**
 * ⚠️ THE FIRST SCREEN IN THIS REPOSITORY DRAWN FROM WHAT IT DECLARES, driven
 * through the real door. Everything under it has been true for several stages
 * and reachable by nothing: the contract composed, the renderer drew, the runner
 * ran — and no request anywhere produced a view's rows. This is the request.
 */
describe("a screen drawn from what it declares", () => {
  it("answers the views its body reads, with the rows in them", async () => {
    await write("Sharpen the saw", "Before the tree");
    await write("Second thing", "After the first");

    const [status, said] = await screen("notes");
    expect(status, JSON.stringify(said)).toBe(200);
    const drawn = said as { views: Record<string, { items: { title: string }[]; count: number }> };
    expect(Object.keys(drawn.views)).toEqual(["every-note"]);
    expect(drawn.views["every-note"]?.count).toBe(2);
    expect(drawn.views["every-note"]?.items.map((n) => n.title).sort())
      .toEqual(["Second thing", "Sharpen the saw"]);
  });

  /*
    ⚠️ AN EMPTY VIEW IS AN ANSWER, NOT AN ABSENCE. The block declares what its
    emptiness MEANS and the frame draws that; what the door owes is a truthful
    zero rather than a missing key, because a missing key is indistinguishable
    from a view that failed.
  */
  it("answers a truthful nothing when the collection is empty", async () => {
    const [status, said] = await screen("notes");
    expect(status).toBe(200);
    const drawn = said as { views: Record<string, { items: unknown[]; count: number }> };
    expect(drawn.views["every-note"]).toEqual({ items: [], count: 0 });
  });

  /*
    ⚠️ A SCREEN WITHOUT A BODY IS NOT A SCREEN THIS DOOR ANSWERS. `people` is
    declared, routed and drawn by a component — asking this door for it must be
    a 404 rather than an empty body, because an empty body renders as a screen
    with nothing on it and reads as a workspace with nothing in it.
  */
  it("does not answer a screen that has no body", async () => {
    const [status] = await screen("people");
    expect(status).toBe(404);
  });

  it("does not answer a screen nobody declares", async () => {
    const [status] = await screen("invented");
    expect(status).toBe(404);
  });

  /*
    ⚠️ A READ IS A GET. The door is answering rows; accepting a POST would make
    it a second write path with none of the machinery a write has — no
    idempotency, no audit row, no gate beyond this one.
  */
  it("answers a GET and nothing else", async () => {
    const said = await at("/api/screen/notes", {
      method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}",
    });
    expect(said.status).toBe(404);
  });
});
