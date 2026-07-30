import { describe, expect, it, vi } from "vitest";
import {
  applySchema, schemaGate, schemaStatements, schemaMarkerKey, SchemaMigrationError,
  type SchemaModule,
} from "../src/schema.js";

/**
 * A D1 stand-in that records what was asked of it.
 *
 * Enough surface for the runner: `exec` for DDL, and a prepare/bind/run/all chain
 * for the marker table. `fail` injects an error for any statement matching a
 * pattern, which is how the ALTER and backfill failure paths get exercised
 * without a real database.
 */
function fakeDb(opts: { markers?: Record<string, string>; fail?: [RegExp, string][] } = {}) {
  const markers = new Map(Object.entries(opts.markers ?? {}));
  const execs: string[] = [];
  const backfills: string[] = [];
  const check = (sql: string) => {
    for (const [re, msg] of opts.fail ?? []) if (re.test(sql)) throw new Error(msg);
  };
  const db = {
    async exec(sql: string) {
      check(sql);
      execs.push(sql);
      return { count: 0, duration: 0 };
    },
    prepare(sql: string) {
      const stmt = {
        _binds: [] as unknown[],
        bind(...b: unknown[]) {
          this._binds = b;
          return this;
        },
        async run() {
          if (/^INSERT INTO app_config/.test(sql)) {
            markers.set(String(this._binds[0]), String(this._binds[1]));
          } else {
            check(sql);
            backfills.push(sql);
          }
          return { success: true };
        },
        async all() {
          return { results: [...markers].map(([key, value]) => ({ key, value })) };
        },
      };
      return stmt;
    },
  };
  return { db: db as unknown as D1Database, markers, execs, backfills };
}

const mod = (id: string, version: string, extra: Partial<SchemaModule> = {}): SchemaModule => ({
  id,
  version,
  ddl: [
    `CREATE TABLE IF NOT EXISTS ${id}_t (id TEXT PRIMARY KEY);`,
    `CREATE INDEX IF NOT EXISTS ${id}_i ON ${id}_t (id);`,
  ],
  ...extra,
});

describe("composed schema", () => {
  it("applies every module in order and records one marker each", async () => {
    const { db, markers, execs } = fakeDb();
    await applySchema(db, [mod("auth", "1"), mod("billing", "1")]);

    // Bootstrap first — nothing can read a marker before app_config exists.
    expect(execs[0]).toContain("app_config");
    expect(execs[1]).toContain("auth_t");
    expect(execs[2]).toContain("billing_t");
    expect(markers.get(schemaMarkerKey("auth"))).toBe("1");
    expect(markers.get(schemaMarkerKey("billing"))).toBe("1");
  });

  it("skips a module already at its version, and re-applies ONLY the one that moved", async () => {
    // This is the whole point of a per-module marker: Kova's single
    // `schema_version` re-ran all ~110 statements for any DDL change anywhere.
    const { db, execs } = fakeDb({
      markers: { [schemaMarkerKey("auth")]: "1", [schemaMarkerKey("billing")]: "1" },
    });
    await applySchema(db, [mod("auth", "1"), mod("billing", "2")]);

    const ddl = execs.filter((s) => s.includes("CREATE TABLE IF NOT EXISTS auth_t") || s.includes("CREATE TABLE IF NOT EXISTS billing_t"));
    expect(ddl).toHaveLength(1);
    expect(ddl[0]).toContain("billing_t");
  });

  it("costs one bootstrap and one read when everything is current", async () => {
    const { db, execs } = fakeDb({ markers: { [schemaMarkerKey("auth")]: "1" } });
    await applySchema(db, [mod("auth", "1")]);
    expect(execs).toEqual([expect.stringContaining("app_config")]);
  });

  it("swallows duplicate-column ALTERs and fails loudly on anything else", async () => {
    const dup = fakeDb({ fail: [[/ALTER TABLE auth_t ADD COLUMN a/, "duplicate column name: a"]] });
    await expect(
      applySchema(dup.db, [mod("auth", "1", { alters: ["ALTER TABLE auth_t ADD COLUMN a TEXT"] })]),
    ).resolves.toBeUndefined();
    expect(dup.markers.get(schemaMarkerKey("auth"))).toBe("1");

    const real = fakeDb({ fail: [[/ALTER TABLE auth_t ADD COLUMN b/, "D1_ERROR: network"]] });
    await expect(
      applySchema(real.db, [mod("auth", "1", { alters: ["ALTER TABLE auth_t ADD COLUMN b TEXT"] })]),
    ).rejects.toBeInstanceOf(SchemaMigrationError);
    // …and crucially the marker is NOT stamped, so the next request retries
    // rather than recording a half-applied module as done.
    expect(real.markers.has(schemaMarkerKey("auth"))).toBe(false);
  });

  it("does not let a failed backfill block the module", async () => {
    // A backfill is a repair, not a precondition — its WHERE guard makes it a
    // no-op once satisfied, so a transient failure must not wedge the schema.
    const { db, markers } = fakeDb({ fail: [[/UPDATE auth_t/, "D1_ERROR: timeout"]] });
    await applySchema(db, [mod("auth", "1", { backfills: [{ name: "fill", sql: "UPDATE auth_t SET id = id" }] })]);
    expect(markers.get(schemaMarkerKey("auth"))).toBe("1");
  });

  it("refuses two modules claiming the same id", async () => {
    const { db } = fakeDb();
    await expect(applySchema(db, [mod("auth", "1"), mod("auth", "2")])).rejects.toThrow(/duplicate schema module id/);
  });

  it("applies ddl in declared order, index beside its table", async () => {
    expect(schemaStatements(mod("x", "1"))).toEqual([
      "CREATE TABLE IF NOT EXISTS x_t (id TEXT PRIMARY KEY);",
      "CREATE INDEX IF NOT EXISTS x_i ON x_t (id);",
    ]);
  });

  it("gates to once per isolate, and retries after a failure", async () => {
    const ok = fakeDb();
    const gate = schemaGate([mod("auth", "1")]);
    await Promise.all([gate({ DB: ok.db }), gate({ DB: ok.db })]);
    expect(ok.execs.filter((s) => s.includes("auth_t"))).toHaveLength(1);

    const boom = fakeDb({ fail: [[/ALTER/, "D1_ERROR: down"]] });
    const errGate = schemaGate([mod("auth", "1", { alters: ["ALTER TABLE auth_t ADD COLUMN a TEXT"] })]);
    const env = { DB: boom.db };
    await expect(errGate(env)).rejects.toThrow();
    // A cached rejection would poison the isolate for its whole lifetime.
    await expect(errGate(env)).rejects.toThrow();
    expect(boom.execs.filter((s) => s.includes("auth_t"))).toHaveLength(2);
  });

  it("logs a backfill failure rather than swallowing it silently", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { db } = fakeDb({ fail: [[/UPDATE auth_t/, "D1_ERROR: timeout"]] });
    await applySchema(db, [mod("auth", "1", { backfills: [{ name: "fill", sql: "UPDATE auth_t SET id = id" }] })]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('backfill "fill"'), expect.anything());
    warn.mockRestore();
  });
});
