/**
 * THE SCHEMA RUNNER — what re-runs, what does not, and what it refuses.
 *
 * Every rule here fails silently in production if it is wrong: a module that
 * does not re-run leaves a table that never appears; one that re-runs everything
 * repeats a backfill; a composition applied despite a duplicate table leaves one
 * module's columns permanently absent.
 */

import { describe, expect, it } from "vitest";
import type { SchemaModule } from "@one/kernel";
import { applySchema, SchemaInvalid } from "../src/schema.js";
import { handleOf, recorder } from "./fake.js";

const mod = (over: Partial<SchemaModule> = {}): SchemaModule => ({
  id: "notes",
  ddl: [`CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY);`],
  ...over,
});

describe("a module runs when it changed, and not otherwise", () => {
  it("applies a module the database has never seen", async () => {
    const r = recorder();
    const report = await applySchema(handleOf(r), [mod()]);
    expect(report.applied).toEqual(["notes"]);
    expect(r.batches.some((b) => b[0]?.includes("CREATE TABLE IF NOT EXISTS notes"))).toBe(true);
  });

  /*
    ⚠️ THE VERSION IS COMPUTED, NEVER WRITTEN. A hand-written version is one
    somebody forgets to bump, and forgetting made a new table invisible on a
    fresh database and fatal on every existing one. Nothing to remember, nothing
    to forget.
  */
  it("skips a module whose content is unchanged", async () => {
    const r = recorder();
    await applySchema(handleOf(r), [mod()]);
    r.batches.length = 0;
    const again = await applySchema(handleOf(r), [mod()]);
    expect(again.skipped).toEqual(["notes"]);
    // The marker table's own CREATE still runs — it is what the run reads to
    // decide, so it cannot be conditional on itself. Nothing of the MODULE does.
    expect(r.batches.flat().filter((s) => s.includes("notes"))).toEqual([]);
  });

  it("re-applies a module whose DDL changed", async () => {
    const r = recorder();
    await applySchema(handleOf(r), [mod()]);
    const changed = mod({ ddl: [`CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, title TEXT);`] });
    expect((await applySchema(handleOf(r), [changed])).applied).toEqual(["notes"]);
  });

  /*
    ⚠️ PER SECTION. Editing a backfill must not re-run the DDL, and a comment
    reflowed in the DDL must not re-run a backfill — one is wasteful, the other
    repeats a data change.
  */
  it("re-runs only the section that changed", async () => {
    const r = recorder();
    const withFill = mod({ backfills: [{ id: "seed", sql: `UPDATE notes SET title = '' WHERE title IS NULL;` }] });
    await applySchema(handleOf(r), [withFill]);
    r.batches.length = 0;

    const edited = mod({ backfills: [{ id: "seed", sql: `UPDATE notes SET title = 'x' WHERE title IS NULL;` }] });
    await applySchema(handleOf(r), [edited]);
    expect(r.batches.flat().some((s) => s.includes("CREATE TABLE IF NOT EXISTS notes"))).toBe(false);
    expect(r.batches.flat().some((s) => s.includes("UPDATE notes"))).toBe(true);
  });
});

describe("what it tolerates, it reports", () => {
  /*
    ⚠️ THE ONE PLACE ANYTHING IS SWALLOWED. `ADD COLUMN` on a column that exists
    is the expected outcome of a re-run and is indistinguishable from a typo —
    so it is tolerated and NAMED. A swallow nobody can see is how a column
    silently never appears.
  */
  it("tolerates an alter the database refuses, and says which", async () => {
    const r = recorder();
    r.refuse = /ALTER TABLE/;
    const report = await applySchema(handleOf(r), [mod({ alters: [`ALTER TABLE notes ADD COLUMN title TEXT;`] })]);
    expect(report.applied).toEqual(["notes"]);
    expect(report.tolerated).toHaveLength(1);
    expect(report.tolerated[0]).toContain("notes");
  });

  it("does not tolerate a failing CREATE", async () => {
    const r = recorder();
    r.refuse = /CREATE TABLE/;
    await expect(applySchema(handleOf(r), [mod()])).rejects.toThrow();
  });
});

describe("an invalid composition never reaches the database", () => {
  /*
    ⚠️ TWO TABLES WITH ONE NAME is the most expensive failure in the set:
    `IF NOT EXISTS` is won by whichever module runs first, and the loser's
    columns silently never exist. A database is the worst place to find out.
  */
  it("refuses two modules creating the same table", async () => {
    const r = recorder();
    const a = mod({ id: "one_a" });
    const b = mod({ id: "one_b" });
    await expect(applySchema(handleOf(r), [a, b])).rejects.toThrow(SchemaInvalid);
    expect(r.batches).toEqual([]);
  });

  it("refuses a module ordered before something it declares it needs", async () => {
    const r = recorder();
    const first = mod({ id: "needs_other", after: ["other"] });
    const other: SchemaModule = { id: "other", ddl: [`CREATE TABLE IF NOT EXISTS other (id TEXT PRIMARY KEY);`] };
    await expect(applySchema(handleOf(r), [first, other])).rejects.toThrow(SchemaInvalid);
  });

  it("refuses DDL that is not re-runnable", async () => {
    const r = recorder();
    await expect(applySchema(handleOf(r), [mod({ ddl: [`CREATE TABLE notes (id TEXT);`] })])).rejects.toThrow(SchemaInvalid);
  });
});
