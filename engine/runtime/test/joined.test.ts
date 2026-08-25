/**
 * A FIELD ON WHAT THE ROW POINTS AT.
 *
 * ⚠️ THE ASSERTIONS ARE ABOUT HOW MANY STATEMENTS IT TAKES, not only about the
 * values. A join that returns the right names by asking once per row is the
 * right answer at the wrong price — fifty subrequests on a warehouse phone —
 * and every value-only test in this file would pass over it. `runaway.test.mjs`
 * refuses the SHAPE; this counts the statements, because the two questions have
 * different failure modes and only one of them is visible in a diff.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { field, reachFor, type CollectionSpec } from "@engine/kernel";
import { applySchema, type Db } from "../src/index.js";
import { joinRows } from "../src/joined.js";
import { put } from "../src/records.js";
import { schemaFor } from "../src/schema.js";

const TENANT = "ten_join";
const OTHER = "ten_other";
const NOW = new Date("2026-08-25T09:00:00.000Z");

const made = (id: string, fields: CollectionSpec["fields"]): CollectionSpec => ({
  id,
  label: { one: id, many: `${id}s` },
  scope: { of: "tenant" },
  permission: id,
  retention: null,
  onClose: { then: "purge" },
  fields,
} as CollectionSpec);

const product = made("product", {
  name: field.text({ label: "Name", required: true, holds: "none", max: 80 }),
  unit: field.text({ label: "Unit", holds: "none", max: 20 }),
});
const place = made("place", {
  name: field.text({ label: "Name", required: true, holds: "none", max: 80 }),
});
const line = made("line", {
  product: field.ref({ label: "Product", required: true, holds: "none", to: "product" }),
  place: field.ref({ label: "Where", holds: "none", to: "place" }),
  quantity: field.number({ label: "How many", holds: "none" }),
});

const COLLECTIONS = [product, place, line];
const shard = () => env.SHARD_EU_1 as unknown as Db;

/**
 * ⚠️ THE REAL BINDING, COUNTED. Wrapping `prepare` is how many statements a call
 * actually issues — the one number `Promise.all` hides, since a fan-out and a
 * single query take the same wall-clock shape in a test.
 */
const counting = () => {
  const db = shard();
  let n = 0;
  return {
    n: () => n,
    db: { prepare: (sql: string) => { n++; return db.prepare(sql); } } as unknown as Db,
  };
};

const add = async (spec: CollectionSpec, row: Record<string, unknown>, scope = TENANT) => {
  const done = await put(shard(), spec, scope, row, null, NOW);
  if ("why" in done) throw new Error(done.why);
  return done.id;
};

const reach = (of: CollectionSpec, path: string) => {
  const got = reachFor(path, of.fields, COLLECTIONS);
  if (typeof got === "string") throw new Error(`${path}: ${got}`);
  return got;
};

let salt = "";
let cold = "";
let rows: Record<string, unknown>[] = [];

beforeEach(async () => {
  await applySchema(shard(), COLLECTIONS.map((c) => schemaFor({ id: "wh", collections: [c] } as never)));
  for (const t of ["line", "product", "place"]) await shard().prepare(`DELETE FROM ${t}`).run();

  salt = await add(product, { name: "Sodium chloride", unit: "kg" });
  const soap = await add(product, { name: "Hand soap", unit: "L" });
  cold = await add(place, { name: "Cold room" });

  await add(line, { product: salt, place: cold, quantity: 12 });
  await add(line, { product: soap, place: cold, quantity: 4 });
  await add(line, { product: salt, place: cold, quantity: 7 });
  const got = await shard().prepare("SELECT * FROM line ORDER BY id").all();
  rows = got.results as Record<string, unknown>[];
});

describe("a row carries a field from what it points at", () => {
  it("writes the target's value under the path itself", async () => {
    const out = await joinRows(
      shard(), rows, [reach(line, "product.name")], COLLECTIONS, TENANT);
    expect(out.map((r) => r["product.name"]).sort())
      .toEqual(["Hand soap", "Sodium chloride", "Sodium chloride"]);
  });

  it("reaches through two different references at once", async () => {
    const out = await joinRows(
      shard(), rows,
      [reach(line, "product.unit"), reach(line, "place.name")],
      COLLECTIONS, TENANT);
    expect(out[0]?.["place.name"]).toBe("Cold room");
    expect(out.map((r) => r["product.unit"])).toContain("kg");
  });

  /*
    ⚠️ THE ONE THIS MODULE EXISTS FOR. Three lines over two products and one
    place is TWO statements, not three and not six — the ids are collected and
    deduplicated first. Asking per row is the same answer at fifty times the
    price, and it is invisible in every assertion above.
  */
  it("asks once per reference, never once per row", async () => {
    const { db, n } = counting();
    await joinRows(
      db, rows, [reach(line, "product.name"), reach(line, "place.name")], COLLECTIONS, TENANT);
    expect(n(), "one statement per row rather than per reference").toBe(2);
  });

  it("asks once even when two paths go through the same reference", async () => {
    const { db, n } = counting();
    await joinRows(
      db, rows, [reach(line, "product.name"), reach(line, "product.unit")], COLLECTIONS, TENANT);
    expect(n()).toBe(1);
  });

  it("asks nothing at all when the body names no path", async () => {
    const { db, n } = counting();
    const out = await joinRows(db, rows, [], COLLECTIONS, TENANT);
    expect(n()).toBe(0);
    expect(out).toBe(rows);
  });
});

describe("what it does when the other end is not there", () => {
  /*
    ⚠️ A ROW WHOSE REFERENCE IS MISSING IS STILL A ROW. Dropping it silently
    changes a total nobody can then explain; `null` beside a real quantity is
    honest, and every formatter already draws it as nothing.
  */
  it("answers null rather than dropping the row", async () => {
    await shard().prepare("DELETE FROM product WHERE id = ?").bind(salt).run();
    const out = await joinRows(
      shard(), rows, [reach(line, "product.name")], COLLECTIONS, TENANT);
    expect(out).toHaveLength(3);
    expect(out.filter((r) => r["product.name"] === null)).toHaveLength(2);
  });

  it("answers null for a reference that was never set", async () => {
    await shard().prepare("UPDATE line SET place = '' WHERE id = ?").bind(rows[0]!["id"]).run();
    const again = (await shard().prepare("SELECT * FROM line ORDER BY id").all())
      .results as Record<string, unknown>[];
    const out = await joinRows(shard(), again, [reach(line, "place.name")], COLLECTIONS, TENANT);
    expect(out[0]?.["place.name"]).toBeNull();
  });

  /*
    ⚠️ AND THE SCOPE IS APPLIED AGAIN ON THE TARGET. A reference is an id, and an
    id is a string somebody could have written into a row — reading the target
    without its own scope clause would make a stale or forged reference a way to
    read one workspace's rows through another's screen. The reference here is
    real and the caller is not, which is exactly the case a test that only ever
    passes the right tenant cannot see.
  */
  it("refuses to resolve a reference from another workspace", async () => {
    const out = await joinRows(
      shard(), rows, [reach(line, "product.name")], COLLECTIONS, OTHER);
    expect(out.every((r) => r["product.name"] === null),
      "a reference resolved past the caller's own scope").toBe(true);
  });
});
