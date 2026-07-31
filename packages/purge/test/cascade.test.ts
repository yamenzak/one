import { describe, expect, it } from "vitest";
import type { SchemaModule } from "@4dl/core";
import {
  applyCascade, cascadeTables, impossibleSteps, moduleColumns,
  scopeColumns, subjectCascade, tenantCascade, undeclaredScopes,
} from "../src/index.js";

const shop: SchemaModule = {
  id: "shop",
  version: "1",
  ddl: [
    "CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, tenant_id TEXT, buyer_id TEXT, total REAL);",
    "CREATE INDEX IF NOT EXISTS idx_orders ON orders(tenant_id);",
    "CREATE TABLE IF NOT EXISTS catalog (id TEXT PRIMARY KEY, name TEXT);",
  ],
  alters: ["ALTER TABLE catalog ADD COLUMN tenant_id TEXT"],
  scoped: {
    tenantColumn: "tenant_id",
    tenantTables: ["orders", "catalog"],
    subjectColumn: "buyer_id",
    subjectTables: ["orders"],
  },
};

describe("reading a module's columns", () => {
  it("takes them from CREATE TABLE and from ADD COLUMN", () => {
    // A column added by an ALTER is as real as one in the CREATE — and it is the
    // shape a package uses to compose onto another package's table, so missing
    // it would report a false gap on every one of those.
    const cols = moduleColumns(shop);
    expect([...cols.get("orders")!].sort()).toEqual(["buyer_id", "id", "tenant_id", "total"]);
    expect(cols.get("catalog")).toContain("tenant_id");
  });

  it("does not mistake a table constraint for a column", () => {
    // `PRIMARY KEY (client_id, date_local)` names two columns in parentheses. A
    // looser parse reads those as declarations, which is harmless here but would
    // invent columns on a table that has none of them.
    const m: SchemaModule = {
      id: "x", version: "1",
      ddl: ["CREATE TABLE IF NOT EXISTS logs (a TEXT, b TEXT, PRIMARY KEY (a, b));"],
    };
    expect([...moduleColumns(m).get("logs")!].sort()).toEqual(["a", "b"]);
  });
});

describe("deriving the cascades", () => {
  it("emits one step per declared table, carrying that module's column", () => {
    expect(tenantCascade([shop])).toEqual([
      { table: "orders", column: "tenant_id", module: "shop" },
      { table: "catalog", column: "tenant_id", module: "shop" },
    ]);
    expect(subjectCascade([shop])).toEqual([{ table: "orders", column: "buyer_id", module: "shop" }]);
  });

  it("derives the scope columns instead of naming them", () => {
    // The app's word for an individual is the app's. A hard-coded list would
    // have to guess it, and would keep checking a column after a rename.
    expect([...scopeColumns([shop])].sort()).toEqual(["buyer_id", "tenant_id"]);
  });

  it("deduplicates a table two modules both claim", () => {
    const other: SchemaModule = { ...shop, id: "other" };
    expect(tenantCascade([shop, other])).toHaveLength(2);
    expect([...cascadeTables([shop, other])].sort()).toEqual(["catalog", "orders"]);
  });

  it("skips a module that declares no scope at all", () => {
    const platform: SchemaModule = { id: "p", version: "1", ddl: ["CREATE TABLE IF NOT EXISTS plans (id TEXT);"] };
    expect(tenantCascade([platform])).toEqual([]);
  });
});

describe("the two conformance checks", () => {
  it("flags a table that carries a scope column nobody declared", () => {
    const forgotten: SchemaModule = {
      ...shop,
      ddl: [...shop.ddl!, "CREATE TABLE IF NOT EXISTS refunds (id TEXT PRIMARY KEY, tenant_id TEXT, buyer_id TEXT);"],
    };
    const gaps = undeclaredScopes([forgotten]);
    expect(gaps.map((g) => `${g.table}.${g.column}`).sort()).toEqual(["refunds.buyer_id", "refunds.tenant_id"]);
  });

  it("accepts an exemption, and only for what is really there", () => {
    const forgotten: SchemaModule = {
      ...shop,
      ddl: [...shop.ddl!, "CREATE TABLE IF NOT EXISTS refunds (id TEXT PRIMARY KEY, tenant_id TEXT);"],
    };
    expect(undeclaredScopes([forgotten], { exempt: ["refunds.tenant_id"] })).toEqual([]);
  });

  it("flags a step whose column the table does not have", () => {
    // The rename. This is the one that is invisible at runtime: the DELETE
    // raises "no such column" and a purge swallows it, so erasure silently
    // keeps the rows and reports success.
    const renamed: SchemaModule = {
      ...shop,
      ddl: ["CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, tenant_id TEXT, subject_id TEXT);"],
      alters: [],
      scoped: { ...shop.scoped, tenantTables: ["orders"], subjectTables: ["orders"] },
    };
    const bad = impossibleSteps([renamed]);
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatchObject({ table: "orders", column: "buyer_id" });
  });

  it("flags a step for a table no module creates", () => {
    const ghost: SchemaModule = { id: "g", version: "1", scoped: { tenantColumn: "tenant_id", tenantTables: ["nope"] } };
    expect(impossibleSteps([ghost])[0]).toMatchObject({ table: "nope", reason: "no module creates this table" });
  });
});

describe("running a cascade", () => {
  it("quotes both identifiers and binds the id", async () => {
    const seen: [string, string][] = [];
    await applyCascade(tenantCascade([shop]), "t_1", async (sql, id) => void seen.push([sql, id]));
    expect(seen).toEqual([
      ['DELETE FROM "orders" WHERE "tenant_id" = ?', "t_1"],
      ['DELETE FROM "catalog" WHERE "tenant_id" = ?', "t_1"],
    ]);
  });
});
