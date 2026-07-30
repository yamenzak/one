import { describe, expect, it } from "vitest";
import { schemaStatements } from "@4dl/core";
import { KOVA_SCHEMA } from "../src/db.js";

/**
 * Invariants the composed runner relies on. Every one of these is something that
 * fails SILENTLY at runtime if it is wrong — the DDL batch half-applies, or a
 * migration marks itself done while a column every write needs is missing — so
 * they are asserted here rather than discovered in production.
 */
describe("the Kova schema module", () => {
  it("declares only idempotent DDL", () => {
    // The module re-applies from scratch on any version bump, so a statement that
    // is not `IF NOT EXISTS` would throw on the second run and abort the batch.
    // `DROP INDEX IF EXISTS` is allowed alongside the creates: retiring an index
    // is idempotent too, and it has to run in the same ordered batch as the
    // statement that replaces it.
    for (const sql of schemaStatements(KOVA_SCHEMA)) {
      expect(sql, sql.slice(0, 70)).toMatch(/^(CREATE (TABLE|INDEX|UNIQUE INDEX) IF NOT EXISTS|DROP INDEX IF EXISTS)/);
    }
  });

  it("batches safely into one exec", () => {
    // The runner joins DDL with a space. A `--` comment would swallow every
    // statement after it in the batch; an embedded newline would split one
    // statement in half. Neither failure raises an error — the tables simply
    // never appear.
    for (const sql of schemaStatements(KOVA_SCHEMA)) {
      expect(sql, sql.slice(0, 70)).not.toMatch(/--/);
      expect(sql, sql.slice(0, 70)).not.toMatch(/\n/);
      // …and every statement TERMINATES. A statement in the `alters` array is
      // exec'd alone and needs no semicolon; the same string moved into `ddl`
      // fuses with the next one — `…created_at TEXT) CREATE INDEX …` — and D1
      // rejects the whole batch with `near "CREATE": syntax error`, taking all
      // 115 statements down with it. That is exactly how the two statements
      // re-homed here from `alters` first landed.
      expect(sql, sql.slice(0, 70)).toMatch(/;$/);
    }
  });

  it("uses ALTER only for tolerated column adds", () => {
    // The runner swallows exactly one error — "duplicate column" — because that
    // is what a re-applied ADD COLUMN raises. Any other ALTER shape (RENAME,
    // DROP) would fail differently and abort the module every single run.
    for (const sql of KOVA_SCHEMA.alters ?? []) {
      expect(sql, sql.slice(0, 70)).toMatch(/^ALTER TABLE \w+ ADD COLUMN /);
    }
  });

  it("still covers the whole database", () => {
    // A guard against an extraction quietly dropping statements on the way out.
    // These numbers go DOWN as tables move into @4dl/* packages — when they do,
    // update them here in the same commit as the move, so a silent loss can't
    // hide behind a passing suite.
    const ddl = schemaStatements(KOVA_SCHEMA);
    expect(ddl.filter((s) => s.startsWith("CREATE TABLE"))).toHaveLength(66);
    expect(ddl.filter((s) => s.startsWith("CREATE INDEX"))).toHaveLength(40);
    expect(ddl.filter((s) => s.startsWith("CREATE UNIQUE INDEX"))).toHaveLength(8);
    expect(ddl.filter((s) => s.startsWith("DROP INDEX"))).toHaveLength(1);
    expect(KOVA_SCHEMA.alters ?? []).toHaveLength(52);
  });

  it("names every backfill", () => {
    // Backfills are best-effort and only ever surface in a log line, so an
    // unnamed one is unattributable when it fails.
    for (const b of KOVA_SCHEMA.backfills ?? []) expect(b.name).toBeTruthy();
  });
});
