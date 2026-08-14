/**
 * A TENANT IS CREATED, PLACED, AND READ BACK THROUGH A SHARD.
 *
 * ⚠️ THIS IS STAGE 2'S EXIT CRITERION, ASSERTED AGAINST REAL DATABASES. Every
 * failure in here is one that would otherwise be found by a customer: a
 * workspace on a shard whose tables do not exist, a residency promise broken by
 * a rebalance, a product switched on with nothing behind it, an erasure that
 * reported success and left the rows.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { collection, field, operation, type AppSpec, type AnyOperation } from "@quad/kernel";
import {
  DIRECTORY_SCHEMA, addShard, appsOfTenant, createTenant, disableApp, enableApp, mayMove,
  noteBelonging, noteShardApp, shards, tenantBySlug, tenantsOf, upsertAccount,
} from "../src/directory.js";
import { applySchema, refuseSql, schemaFor, stampOf, statementsFor } from "../src/schema.js";
import { erase, list, put, readOne, unreachableByErasure } from "../src/records.js";
import { bindingFor, shardFor, unbound } from "../src/handles.js";
import type { Db } from "../src/sql.js";

const directory = () => env.DIRECTORY as unknown as Db;
const bindings = () => env as unknown as { DIRECTORY: Db; [k: string]: unknown };

/* ------------------------------------------------------------ a small app --- */

const note = collection({
  id: "note",
  label: { one: "Note", many: "Notes" },
  scope: { of: "tenant" },
  permission: "note",
  retention: null,
  onClose: { then: "purge" },
  fields: {
    title: field.text({ label: "Title", required: true, holds: "none", max: 200 }),
    done: field.bool({ label: "Done", holds: "none" }),
  },
});

const receipt = collection({
  id: "receipt",
  label: { one: "Receipt", many: "Receipts" },
  scope: { of: "tenant" },
  permission: "receipt",
  retention: null,
  /* ⚠️ The record that outlives the business, and it says why. */
  onClose: { then: "keep", why: "An invoice is evidence we were paid, after they are gone." },
  fields: { total: field.money({ label: "Total", required: true, holds: "financial" }) },
});

const stub = operation({
  id: "note.publish", kind: "write", summary: "Publish one.",
  input: { id: field.text({ label: "Id", required: true, holds: "none" }) },
  output: {}, permission: "note:write", idempotency: { mode: "none" },
  async handler() { return {}; },
}) as unknown as AnyOperation;

const app = (id: string, collections = [note]): AppSpec => ({
  id, name: id, mark: "◆",
  access: {
    permissions: ["note:read", "note:write", "receipt:read", "receipt:write", "member:manage", "tenant:create"],
    roles: { owner: ["note:read", "note:write", "receipt:read", "receipt:write", "member:manage"] },
    personal: ["tenant:create"],
    seats: { counts: ["owner"], entitlement: "seats" },
  },
  entitlements: { seats: { label: "Seats", withheld: "quota" } },
  plans: [{ id: "free", name: "Free", said: "", price: 0, currency: "EUR", order: 0, parking: true,
    includes: { seats: 1 } }],
  collections, operations: [stub], screens: [],
});

const notes = app("notes");

/* --------------------------------------------------------------- fixtures --- */

const wipe = async (db: Db, tables: readonly string[]) => {
  for (const t of tables) { try { await db.exec(`DELETE FROM ${t};`); } catch { /* not there yet */ } }
};

beforeEach(async () => {
  await applySchema(directory(), [DIRECTORY_SCHEMA]);
  await wipe(directory(), ["belongs", "tenant_app", "tenant", "shard_app", "shard", "account"]);
  await wipe(env.SHARD_EU_1 as unknown as Db, ["note", "receipt"]);
  await wipe(env.SHARD_EU_2 as unknown as Db, ["note", "receipt"]);
});

/* ------------------------------------------------------------- the schema --- */

describe("a schema derived from declarations", () => {
  /*
    ⚠️ NOBODY BUMPS A VERSION. The previous platform's marker row short-circuited
    a whole module, so a new table without a bump was invisible on a fresh
    database and fatal on every existing one — and the number was kept in a
    human's head.
  */
  it("re-runs when the declarations change and not when they do not", async () => {
    const first = await applySchema(env.SHARD_EU_1 as unknown as Db, [schemaFor(notes)]);
    expect(first[0]!.ran).toBe(true);
    const again = await applySchema(env.SHARD_EU_1 as unknown as Db, [schemaFor(notes)]);
    expect(again[0]!.ran).toBe(false);

    expect(stampOf(schemaFor(notes))).not.toBe(stampOf(schemaFor(app("notes", [note, receipt]))));
  });

  /*
    ⚠️ AND A NEW FIELD IS FOUND BY ASKING THE TABLE. Declaring historical alters
    fails in both directions and both are silent; `pragma_table_info` is the only
    answer that is right on a database whose history nobody knows.
  */
  it("adds a column a collection grew, on a database that already exists", async () => {
    const db = env.SHARD_EU_2 as unknown as Db;
    await applySchema(db, [schemaFor(notes)]);

    const grown = app("notes", [{ ...note, fields: {
      ...note.fields, colour: field.text({ label: "Colour", holds: "none" }),
    } }]);
    const applied = await applySchema(db, [schemaFor(grown)]);
    expect(applied[0]!.added).toEqual(["note.colour"]);

    /* And it is really there: a write naming it lands. */
    const written = await put(db, grown.collections[0]!, "ten_x", { title: "Hi", colour: "#ff0000" });
    expect(written).toHaveProperty("id");
  });

  /*
    ⚠️ THE SCOPE COLUMN IS WHAT ERASURE FOLLOWS, so a table without one is a table
    no deletion request can reach — and the sweep would report success anyway,
    having found nothing to do.
  */
  it("gives every scoped table the column erasure follows", () => {
    expect(statementsFor(note)[0]).toContain("tenant_id TEXT NOT NULL");
    expect(unreachableByErasure([note, receipt])).toEqual([]);
  });

  /* ⚠️ Each of these fails silently: a merged statement blames neither half, a
     `--` comments out the rest of the batch, a DROP migrates destructively. */
  it("refuses a statement that would fail quietly", () => {
    expect(refuseSql({ id: "x", statements: ["CREATE TABLE a (id TEXT)"] }).map((p) => p.why))
      .toEqual(["no_semicolon"]);
    expect(refuseSql({ id: "x", statements: ["DROP TABLE a;"] }).map((p) => p.why))
      .toEqual(["destructive"]);
    expect(refuseSql(schemaFor(notes))).toEqual([]);
  });
});

/* ---------------------------------------------------------------- placing --- */

describe("where a workspace lands", () => {
  const stock = async () => {
    await addShard(directory(), "eu-1", "eu", 100);
    await addShard(directory(), "eu-2", "eu", 100);
    await addShard(directory(), "global-1", "global", 100);
    for (const s of ["eu-1", "eu-2", "global-1"]) await noteShardApp(directory(), s, "notes");
  };

  it("creates a tenant, places it, and reads its records back through the shard", async () => {
    await stock();
    const made = await createTenant(directory(), {
      slug: "acme", name: "Acme", country: "DE", where: "eu", apps: ["notes"],
    });
    expect(typeof made).not.toBe("string");
    if (typeof made === "string") return;

    const db = shardFor(bindings(), made.tenant.shardId);
    await applySchema(db, [schemaFor(notes)]);
    const written = await put(db, note, made.tenant.id, { title: "First", done: false });
    expect(written).toHaveProperty("id");
    if (!("id" in written)) return;

    const back = await readOne(db, note, made.tenant.id, written.id);
    expect(back?.title).toBe("First");
    /* ⚠️ The scope column is written by the platform, never by the caller. */
    expect(back?.tenant_id).toBe(made.tenant.id);

    const found = await tenantBySlug(directory(), "acme");
    expect(found?.shardId).toBe(made.tenant.shardId);
  });

  /*
    ⚠️ A RESIDENCY PROMISE IS MADE TO THE BUSINESS, so capacity may not break it.
    The alternative — "put them anywhere with room" — is a rebalance that moves a
    German customer's records out of the EU with nothing connecting the two
    events.
  */
  it("refuses to place an EU tenant outside the EU, even with room elsewhere", async () => {
    await addShard(directory(), "global-1", "global", 100);
    await noteShardApp(directory(), "global-1", "notes");
    expect(await createTenant(directory(), {
      slug: "berlin", name: "Berlin", country: "DE", where: "eu", apps: ["notes"],
    })).toBe("nowhere_to_put_it");
  });

  /* ⚠️ And on a shard whose tables its product does not have — which would be a
     workspace answering "no such table" on every request. */
  it("refuses a shard that has never had the app's schema applied", async () => {
    await addShard(directory(), "eu-1", "eu", 100);
    expect(await createTenant(directory(), {
      slug: "acme", name: "Acme", country: "DE", where: "eu", apps: ["notes"],
    })).toBe("nowhere_to_put_it");
  });

  it("refuses a slug somebody already has", async () => {
    await stock();
    await createTenant(directory(), { slug: "acme", name: "A", country: "DE", where: "eu", apps: ["notes"] });
    expect(await createTenant(directory(), {
      slug: "acme", name: "B", country: "FR", where: "eu", apps: ["notes"],
    })).toBe("slug_taken");
  });

  /*
    ⚠️ THE EMPTIEST ELIGIBLE SHARD, which is a choice: filling one before starting
    the next would put every new customer — the ones evaluating us — on the
    busiest store we have.
  */
  it("spreads new workspaces rather than filling one shard first", async () => {
    await stock();
    const landed = new Set<string>();
    for (const slug of ["a", "b", "c", "d"]) {
      const made = await createTenant(directory(), {
        slug, name: slug, country: "DE", where: "eu", apps: ["notes"],
      });
      if (typeof made !== "string") landed.add(made.tenant.shardId);
    }
    expect(landed.size).toBe(2);
  });

  /* ⚠️ The count comes from the directory in one query — asking each shard how
     many it holds is the fan-out D5 exists to prevent. */
  it("counts what a shard holds without asking the shard", async () => {
    await stock();
    await createTenant(directory(), { slug: "one", name: "One", country: "DE", where: "eu", apps: ["notes"] });
    const eu = (await shards(directory())).filter((s) => s.where === "eu");
    expect(eu.reduce((n, s) => n + s.tenants, 0)).toBe(1);
  });
});

/* ------------------------------------------------------------- enablement --- */

describe("switching a product on", () => {
  it("applies the schema before the row, so nothing is reachable with nothing behind it", async () => {
    await addShard(directory(), "eu-1", "eu", 100);
    await noteShardApp(directory(), "eu-1", "notes");
    const made = await createTenant(directory(), {
      slug: "acme", name: "Acme", country: "DE", where: "eu", apps: ["notes"],
    });
    if (typeof made === "string") throw new Error(made);

    const db = shardFor(bindings(), made.tenant.shardId);
    const second = app("ledger", [receipt]);
    expect(await enableApp(directory(), db, made.tenant.id, "ledger", schemaFor(second), applySchema))
      .toBe(null);

    /* The tables are there, so the first write of the first minute works. */
    const written = await put(db, receipt, made.tenant.id, { total: 1999 });
    expect(written).toHaveProperty("id");

    /* And the shard is now recorded as able to hold that app. */
    expect((await shards(directory())).find((s) => s.id === "eu-1")?.apps).toContain("ledger");
  });

  /*
    ⚠️ TURNED OFF IS NOT REMOVED, and a move must still carry the schema for it.
    Otherwise the records are stranded — readable again the day the product comes
    back on, in a database that cannot read them.
  */
  it("keeps counting a disabled app when deciding where a tenant may go", async () => {
    await addShard(directory(), "eu-1", "eu", 100);
    await addShard(directory(), "eu-2", "eu", 100);
    await noteShardApp(directory(), "eu-1", "notes");
    await noteShardApp(directory(), "eu-1", "ledger");
    await noteShardApp(directory(), "eu-2", "notes");
    const made = await createTenant(directory(), {
      slug: "acme", name: "Acme", country: "DE", where: "eu", apps: ["notes", "ledger"],
    });
    if (typeof made === "string") throw new Error(made);

    await disableApp(directory(), made.tenant.id, "ledger");
    expect(await appsOfTenant(directory(), made.tenant.id)).toContain("ledger");
    expect(await mayMove(directory(), made.tenant.id, "eu-2")).toBe("schema_missing");
  });

  it("refuses a move to a shard in the wrong place", async () => {
    await addShard(directory(), "eu-1", "eu", 100);
    await addShard(directory(), "global-1", "global", 100);
    for (const s of ["eu-1", "global-1"]) await noteShardApp(directory(), s, "notes");
    const made = await createTenant(directory(), {
      slug: "acme", name: "Acme", country: "DE", where: "eu", apps: ["notes"],
    });
    if (typeof made === "string") throw new Error(made);
    expect(await mayMove(directory(), made.tenant.id, "global-1")).toBe("wrong_residency");
  });
});

/* ------------------------------------------------------------- membership --- */

describe("which workspaces somebody is in", () => {
  /*
    ⚠️ ONE QUERY, HOWEVER MANY SHARDS THERE ARE. The switcher and the erasure
    sweep ask this same question, and both would otherwise visit every database —
    which gets slower with every shard and times out at the size where it matters.
  */
  it("answers from the directory rather than from every shard", async () => {
    await addShard(directory(), "eu-1", "eu", 100);
    await addShard(directory(), "eu-2", "eu", 100);
    for (const s of ["eu-1", "eu-2"]) await noteShardApp(directory(), s, "notes");
    const me = await upsertAccount(directory(), "sam@example.com", "Sam");

    for (const slug of ["one", "two"]) {
      const made = await createTenant(directory(), {
        slug, name: slug, country: "DE", where: "eu", apps: ["notes"],
      });
      if (typeof made !== "string") await noteBelonging(directory(), me, made.tenant.id);
    }
    expect((await tenantsOf(directory(), me)).map((t) => t.slug).sort()).toEqual(["one", "two"]);
  });

  /* ⚠️ One person, one identity, across every product (D1). */
  it("gives the same person the same account whichever door they arrive at", async () => {
    const first = await upsertAccount(directory(), "sam@example.com", "Sam");
    expect(await upsertAccount(directory(), "sam@example.com", null)).toBe(first);
  });
});

/* ----------------------------------------------------------------- erasure --- */

describe("forgetting a workspace", () => {
  /*
    ⚠️ THE CASCADE IS DERIVED. A hand-written list is the one that misses a table,
    and missing one is silent by construction: the sweep reports success and the
    person is told they have been forgotten.
  */
  it("deletes what the declarations say is the tenant's, and keeps what said why", async () => {
    const db = env.SHARD_EU_1 as unknown as Db;
    await applySchema(db, [schemaFor(app("both", [note, receipt]))]);
    await put(db, note, "ten_a", { title: "Mine" });
    await put(db, receipt, "ten_a", { total: 500 });
    await put(db, note, "ten_b", { title: "Somebody else's" });

    const done = await erase(db, [note, receipt], "tenant", "ten_a");
    expect(done.find((d) => d.table === "note")?.rows).toBe(1);
    /* The invoice stays, because its declaration said why it outlives them. */
    expect(done.find((d) => d.table === "receipt")).toBeUndefined();
    expect(await list(db, receipt, "ten_a")).toHaveLength(1);
    /* And nobody else's rows moved. */
    expect(await list(db, note, "ten_b")).toHaveLength(1);
  });
});

/* ----------------------------------------------------------------- handles --- */

describe("finding the database a tenant is on", () => {
  it("derives the binding from the shard id", () => {
    expect(bindingFor("eu-1")).toBe("SHARD_EU_1");
    expect(() => bindingFor("../secrets")).toThrow();
  });

  /*
    ⚠️ A SHARD THE DIRECTORY KNOWS AND THE DEPLOYMENT DOES NOT IS A THROW. Serving
    that tenant from somewhere else would answer their requests with an empty
    workspace, which reads as data loss.
  */
  it("refuses to improvise when a shard has no binding", () => {
    expect(() => shardFor(bindings(), "eu-9")).toThrow(/SHARD_EU_9/);
    expect(unbound(bindings(), ["eu-1", "eu-9"])).toEqual(["eu-9"]);
  });
});

/* ------------------------------------------------------------- injection --- */

describe("what cannot reach a statement", () => {
  /*
    ⚠️ VALUES ARE BOUND AND IDENTIFIERS CANNOT BE, so the safety has to be that a
    name which is not a name never reaches the builder. It throws rather than
    escaping: a sanitised hostile identifier is a table with a strange name and a
    deployment that carries on.
  */
  it("throws on a collection id that is not a name", async () => {
    const hostile = { ...note, id: "note; DROP TABLE account" } as typeof note;
    await expect(put(env.SHARD_EU_1 as unknown as Db, hostile, "t", { title: "x" }))
      .rejects.toThrow(/is not a name/);
  });

  /* ⚠️ And a value that is not what the field says it is never lands at all. */
  it("refuses a write whose values do not match the declaration", async () => {
    const db = env.SHARD_EU_1 as unknown as Db;
    await applySchema(db, [schemaFor(notes)]);
    const out = await put(db, note, "ten_a", { title: 42 as unknown as string });
    expect(out).toHaveProperty("why", "invalid");
  });
});
