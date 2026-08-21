/**
 * A COLUMN ADDED TO A `CREATE TABLE` REACHES A DATABASE THAT ALREADY EXISTS.
 *
 * ⚠️ IT DID NOT, AND THE FAILURE WAS A DEAD DEPLOYMENT. `CREATE TABLE IF NOT
 * EXISTS` is a no-op where the table is there, so a column added to the
 * declaration reached fresh databases and no existing one — and the first
 * statement naming it threw out of `boot`, which answers every route 503. Found
 * by starting the worker on a database made two hours earlier.
 */

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { applySchema, columnsIn, refuseSql } from "../src/schema.js";
import { DIRECTORY_SCHEMA } from "../src/directory.js";
import type { Db } from "../src/sql.js";

const db = () => env.SHARD_GLOBAL_1 as unknown as Db;

describe("a column added after the table existed", () => {
  it("is added to a database that predates it", async () => {
    /* Yesterday's shape: the table without the column. */
    await applySchema(db(), [{
      id: "aged",
      statements: [`CREATE TABLE IF NOT EXISTS aged (id TEXT PRIMARY KEY, at TEXT NOT NULL);`],
    }]);

    /* Today's: one column more, and the stamp moves with it. */
    await applySchema(db(), [{
      id: "aged",
      statements: [
        `CREATE TABLE IF NOT EXISTS aged (id TEXT PRIMARY KEY, at TEXT NOT NULL, note TEXT);`,
      ],
    }]);

    /* ⚠️ THE ASSERTION IS A WRITE, NOT A PRAGMA. `no such column` is what the
       deployment actually met, and a pragma passing while an INSERT throws is
       the difference between a test and a check. */
    await db().prepare(`INSERT INTO aged (id, at, note) VALUES ('a', 'now', 'hi')`).run();
    const row = await db().prepare(`SELECT note FROM aged WHERE id = 'a'`).first<{ note: string }>();
    expect(row?.note).toBe("hi");
  });

  /* ⚠️ AND THE REAL MODULE IS COVERED, because the one that broke was this one:
     `shard.dedicated_to` was in the declaration and in no migration map. */
  it("derives the nullable columns of the directory's own tables", () => {
    const found = columnsIn(DIRECTORY_SCHEMA);
    expect(found.shard?.dedicated_to).toBe("TEXT");
    expect(found.tenant?.moving_to).toBe("TEXT");
    expect(found.tenant?.legal_name).toBe("TEXT");
  });

  /*
    ⚠️ NOT-NULL AND PRIMARY KEY ARE SKIPPED. SQLite refuses to ALTER one in —
    existing rows have no value for it — and the refusal takes the whole batch
    with it, which is a worse outage than the missing column.
  */
  it("never tries to add a column SQLite would refuse", () => {
    const found = columnsIn(DIRECTORY_SCHEMA);
    expect(found.tenant?.id).toBeUndefined();
    expect(found.tenant?.slug).toBeUndefined();
    expect(found.shard?.at).toBeUndefined();
  });

  /*
    ⚠️ AND A MODULE THAT ALREADY RAN IS EDITED AGAIN, WHICH IS THE LIVE CASE.
    `stampOf` is a HASH of the statements, so ANY later edit to a module replays
    every one of them — and a module reconciling a column through `columns` has
    to survive that against a table that already has it. This is the shape that
    took a deployment down: the same thing written as a raw `ALTER` answers
    "duplicate column name", out of `boot`, on every door at once.
  */
  it("re-applies a reconciled column to a table that already has it", async () => {
    const first = {
      id: "twice",
      statements: [`CREATE TABLE IF NOT EXISTS twice (id TEXT PRIMARY KEY, at TEXT NOT NULL);`],
      columns: { twice: { note: "TEXT" } },
    };
    await applySchema(db(), [first]);

    /* ⚠️ THE EDIT IS UNRELATED TO THE COLUMN, deliberately — an index added
       months later is what moves the stamp in real life, and it must not be
       able to break the migration that came before it. */
    const again = {
      ...first,
      statements: [
        ...first.statements,
        `CREATE INDEX IF NOT EXISTS ix_twice_at ON twice (at);`,
      ],
    };
    await expect(applySchema(db(), [again])).resolves.toBeDefined();

    await db().prepare(`INSERT INTO twice (id, at, note) VALUES ('a', 'now', 'hi')`).run();
    const row = await db().prepare(`SELECT note FROM twice WHERE id = 'a'`).first<{ note: string }>();
    expect(row?.note).toBe("hi");
  });

  /*
    ⚠️ SO A RAW `ALTER` IS REFUSED BEFORE ANYTHING RUNS. It is correct on a fresh
    database and therefore correct in every test, and wrong exactly once — on the
    next deploy after somebody edits the module, everywhere at once. The refusal
    is the only place that difference is visible.
  */
  it("refuses a statement that alters, and names the module", () => {
    const wrong = refuseSql({
      id: "altering",
      statements: [`ALTER TABLE twice ADD COLUMN late TEXT;`],
    });
    expect(wrong.map((w) => w.why)).toContain("altered");
    expect(wrong[0]?.module).toBe("altering");
  });

  /* ⚠️ AND NO PLATFORM MODULE CARRIES ONE. Three did — branding, membership and
     spend — which is how this was found. */
  it("leaves no raw alter in the directory's own module", () => {
    expect(refuseSql(DIRECTORY_SCHEMA)).toEqual([]);
  });
});
