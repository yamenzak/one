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
import { applySchema, columnsIn } from "../src/schema.js";
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
});
