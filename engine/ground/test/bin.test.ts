/**
 * DELETE DOES NOT DESTROY, AND THIRTY DAYS LATER IT DOES.
 *
 * ⚠️ DRIVEN THROUGH THE DOORS, because the fault this exists to catch is a read
 * that forgot the filter. `setAside` returning true proves a column was written;
 * what has to be true is that the record is gone from the LIST, gone from the
 * COUNT, present in the BIN, and openable — four different code paths, three of
 * which a unit test on the writer never touches.
 *
 * ⚠️ AND THE SWEEP IS RUN AGAINST A REAL DATE. `sweepBin` reads a column and
 * compares ISO text; a test that stubbed the clock and asserted the SQL would
 * pass on a string comparison that is wrong in exactly the way lexicographic
 * dates are wrong.
 */

import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BIN_DAYS } from "@engine/kernel";
import {
  DIRECTORY_MODULES, SHARD_MODULES, NOBODY,
  addShard, applySchema, createTenant, found, memberFor, noteBelonging,
  noteShardApp, permissionsResolver, personalOps, schemaFor, serve, sessionIdFrom,
  startSession, sweepBin, tenantBySlug, upsertAccount, whoIs, type Db,
} from "@engine/runtime";
import { asLocating } from "./wiring.js";
import { GROUND, ground } from "../src/index.js";

const directory = () => env.DIRECTORY as unknown as Db;
const shard = () => env.SHARD_EU_1 as unknown as Db;

const APPS = { ground };
const SLUG = "binned";

const app = () => serve({
  roots: { root: "one.test" },
  apps: APPS,
  directory: directory(),
  shardOf: () => shard(),
  personal: personalOps({
    secret: "test-secret", sells: () => ["ground"],
    deliver: async () => undefined,
    deliverExport: async () => undefined,
    isOperator: () => false,
  }),
  /* ⚠️ THE QUOTA HAS TO BE THERE OR EVERY WRITE BELOW IS A 402 — `note` names
     `notes` as its ceiling, and a workspace with no entitlement has none. What
     is being tested here is what happens AFTER a record exists. */
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
        (appId) => APPS[appId as keyof typeof APPS]?.().access.roles ?? null),
    };
  },
});

const at = (path: string, init: RequestInit = {}) =>
  app()(new Request(`https://${SLUG}.one.test${path}`, init));

let cookie = "";

const post = (path: string, body: unknown) => at(path, {
  method: "POST",
  headers: { cookie, "content-type": "application/json" },
  body: JSON.stringify(body),
});

const get = async (path: string) => {
  const said = await at(path, { headers: { cookie } });
  return [said.status, await said.json()] as const;
};

/** ⚠️ A note through the real door, so it carries whatever a real one carries. */
const makeNote = async (title: string): Promise<string> => {
  const said = await post("/api/note.create", { title, body: "…" });
  expect(said.status).toBe(200);
  return (await said.json() as { id: string }).id;
};

const titles = async (): Promise<readonly string[]> => {
  const [, said] = await get("/api/note.list");
  return (said as { items: { title: string }[] }).items.map((n) => n.title);
};

beforeAll(async () => {
  await applySchema(directory(), DIRECTORY_MODULES);
  await applySchema(shard(), [schemaFor(GROUND), ...SHARD_MODULES]);
  await addShard(directory(), "eu-1", "eu", 100);
  await noteShardApp(directory(), "eu-1", "ground");
});

beforeEach(async () => {
  for (const t of ["membership", "note", "audit", "replay"]) await shard().exec(`DELETE FROM ${t};`);
  for (const t of ["belongs", "tenant_app", "tenant", "session", "account"]) {
    await directory().exec(`DELETE FROM ${t};`);
  }
  const made = await createTenant(directory(), {
    slug: SLUG, name: "Binned", country: "DE", where: "eu", apps: ["ground"],
  });
  if (typeof made === "string") throw new Error(made);
  const me = await upsertAccount(directory(), "owner@example.com", null);
  await found(shard(), made.tenant.id as never, me as never, "owner@example.com",
    { ground: "writer" });
  await noteBelonging(directory(), me as never, made.tenant.id as never);
  cookie = `one_session=${(await startSession(directory(), me as never)).id}`;
});

describe("a deleted record is out of the way, not gone", () => {
  it("leaves every list the moment it is deleted", async () => {
    const id = await makeNote("Keep this");
    await makeNote("Bin this");

    expect(await titles()).toHaveLength(2);
    expect((await post("/api/note.delete", { id })).status).toBe(200);

    /* ⚠️ THE LIST AND ITS COUNT, WHICH ARE TWO QUERIES. A filter applied to the
       page alone leaves "1 of 2" over a list of one — the number that makes
       somebody go looking for a record they will never be shown. */
    const [, said] = await get("/api/note.list");
    const listed = said as { items: unknown[]; total: number };
    expect(listed.items).toHaveLength(1);
    expect(listed.total).toBe(1);
    expect(await titles()).toEqual(["Bin this"]);
  });

  /* ⚠️ AND IT IS STILL OPENABLE, which is not a nicety — a record nothing can
     read is a record nothing can restore, and a reference into it from live
     history would be a dead link for the whole window. */
  it("still answers when it is asked for by name", async () => {
    const id = await makeNote("Keep this");
    await post("/api/note.delete", { id });

    const [status, said] = await get(`/api/note.read?id=${id}`);
    expect(status).toBe(200);
    expect((said as { title: string; aside: string }).title).toBe("Keep this");
    /* ⚠️ AND IT SAYS SO. A screen handed a record with no sign it was deleted
       would draw it as live, which is the one thing worse than not answering. */
    expect((said as { aside: string }).aside).toBe("binned");
  });

  it("is in the bin, with the window it has", async () => {
    const id = await makeNote("Keep this");
    await post("/api/note.delete", { id });

    const [status, said] = await get("/api/bin.list");
    expect(status).toBe(200);
    const bin = said as { items: { id: string; of: string; name: string }[]; days: number };
    expect(bin.items).toHaveLength(1);
    expect(bin.items[0]?.id).toBe(id);
    /* ⚠️ THE COLLECTION'S OWN WORD AND THE RECORD'S OWN NAME, so the row reads
       as "Note · Keep this" rather than as an id somebody has to open. */
    expect(bin.items[0]?.of).toBe("Note");
    expect(bin.items[0]?.name).toBe("Keep this");
    /* ⚠️ THE WINDOW TRAVELS WITH THE LIST rather than being written on a
       screen, so the sentence and the sweep cannot disagree. */
    expect(bin.days).toBe(BIN_DAYS);
  });

  it("comes back whole, and back into the lists", async () => {
    const id = await makeNote("Keep this");
    await post("/api/note.delete", { id });

    expect((await post("/api/bin.restore", { collection: "note", id })).status).toBe(200);
    expect(await titles()).toEqual(["Keep this"]);

    const [, said] = await get("/api/bin.list");
    expect((said as { items: unknown[] }).items).toHaveLength(0);

    /* ⚠️ AND THE DATE IS CLEARED. Left standing it is a sentence saying a live
       record was deleted a fortnight ago, printed beside something somebody is
       looking at right now. */
    const [, one] = await get(`/api/note.read?id=${id}`);
    expect((one as { aside: unknown }).aside).toBe(null);
  });

  it("refuses to restore a record that is not there", async () => {
    expect((await post("/api/bin.restore", { collection: "note", id: "n-nope" })).status)
      .toBe(404);
    /* ⚠️ AND A COLLECTION THIS APP DOES NOT DECLARE, which is the same answer for
       the same reason: telling the two apart is a way to ask what exists. */
    expect((await post("/api/bin.restore", { collection: "invented", id: "x" })).status)
      .toBe(404);
  });
});

describe("a frozen record stays, and has no clock on it", () => {
  it("leaves the lists and is still there", async () => {
    const id = await makeNote("Discontinued");
    expect((await post("/api/bin.freeze", { collection: "note", id })).status).toBe(200);

    expect(await titles()).toHaveLength(0);
    const [status, said] = await get(`/api/note.read?id=${id}`);
    expect(status).toBe(200);
    expect((said as { aside: string }).aside).toBe("frozen");
  });

  /* ⚠️ AND IT IS NOT IN THE BIN, which is the whole difference. A frozen record
     listed there is one somebody presses "restore" on expecting it to come back
     — and one the next reader assumes is on its way out. */
  it("is not in the bin", async () => {
    const id = await makeNote("Discontinued");
    await post("/api/bin.freeze", { collection: "note", id });

    const [, said] = await get("/api/bin.list");
    expect((said as { items: unknown[] }).items).toHaveLength(0);
  });

  it("comes back the same way a binned one does", async () => {
    const id = await makeNote("Discontinued");
    await post("/api/bin.freeze", { collection: "note", id });
    expect((await post("/api/bin.restore", { collection: "note", id })).status).toBe(200);
    expect(await titles()).toEqual(["Discontinued"]);
  });
});

/**
 * ⚠️ THE SWEEP IS THE OTHER HALF OF THE PROMISE. A bin that never empties is a
 * second copy of the database wearing a thirty-day sentence, and the failure is
 * invisible: everything works, for ever, and the storage bill is the only sign.
 */
describe("the trash empties, and only the trash", () => {
  const older = (days: number) => shard().prepare(
    `UPDATE note SET aside_at = ?`)
    .bind(new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()).run();

  const swept = () => sweepBin({
    directory: directory(), shards: [shard()], apps: APPS,
  } as never);

  it("destroys what has been in the bin long enough", async () => {
    const id = await makeNote("Old");
    await post("/api/note.delete", { id });
    await older(BIN_DAYS + 1);

    expect((await swept()).touched).toBe(1);
    expect((await get(`/api/note.read?id=${id}`))[0]).toBe(404);
  });

  it("leaves what is still inside the window", async () => {
    const id = await makeNote("Recent");
    await post("/api/note.delete", { id });
    await older(BIN_DAYS - 1);

    expect((await swept()).touched).toBe(0);
    expect((await get(`/api/note.read?id=${id}`))[0]).toBe(200);
  });

  /* ⚠️ AND IT NEVER TOUCHES A FROZEN ONE, however old. A sweep reading
     `aside IS NOT NULL` would destroy a discontinued product on the thirtieth
     day, silently, along with every reference into it. */
  it("never destroys a frozen record, however long it has been frozen", async () => {
    const id = await makeNote("Discontinued");
    await post("/api/bin.freeze", { collection: "note", id });
    await older(BIN_DAYS * 12);

    expect((await swept()).touched).toBe(0);
    expect((await get(`/api/note.read?id=${id}`))[0]).toBe(200);
  });
});
