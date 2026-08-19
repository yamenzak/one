/**
 * BOOTING AGAINST A DATABASE THAT ALREADY EXISTS.
 *
 * ⚠️ EVERY OTHER SUITE STARTS FROM AN EMPTY DATABASE, AND THAT IS THE WHOLE GAP.
 * `CREATE TABLE IF NOT EXISTS` builds whatever shape the code currently declares
 * when there is no table — so a column added to a `CREATE TABLE` is present in
 * every test and absent in every deployment that has booted once. The tests are
 * green, the schema check is green, and the first write to the new column fails
 * in production.
 *
 * ⚠️ IT TOOK ONE DOWN. `job_run` gained a `by` column that way; the live table
 * did not have it, so the nightly pass threw on its first INSERT. This suite is
 * the shape of test that would have caught it before the deploy rather than
 * after — start from the OLD shape, apply the CURRENT modules, and use them.
 *
 * ⚠️ AND THE MECHANISM FOR THIS ALREADY EXISTED. `SchemaModule.columns` is
 * reconciled against `pragma_table_info` on every boot; the module simply did
 * not declare any. A migration path nobody exercises is a migration path that
 * is not there.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import {
  DIRECTORY_MODULES, JOBS_SCHEMA, SHARD_MODULES, applySchema, asTable, run, schemaFor,
  type Db,
} from "@engine/runtime";
import { APPS } from "../src/index.js";

const db = () => env.DIRECTORY as unknown as Db;

/**
 * ⚠️ THE SHAPE AS IT SHIPPED, WRITTEN OUT RATHER THAN IMPORTED. Importing the
 * old statement is impossible — it is gone — and reconstructing it from the
 * current one is the mistake this test exists to catch, in the test.
 */
const AS_IT_WAS = `CREATE TABLE IF NOT EXISTS job_run (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL, started_at TEXT NOT NULL,
  ended_at TEXT, ok INTEGER, detail TEXT, touched INTEGER NOT NULL)`;

beforeAll(async () => {
  /* ⚠️ THE OLD TABLE FIRST, so `CREATE TABLE IF NOT EXISTS` is the no-op it is
     in every real deployment rather than the constructor it is in a test. */
  await db().exec(AS_IT_WAS.replace(/\n\s*/g, " "));
  await applySchema(db(), [JOBS_SCHEMA]);
});

describe("a database that predates the current schema", () => {
  /*
    ⚠️ THE COLUMN HAS TO ARRIVE BY RECONCILIATION, because the statement that
    would have created it is a no-op here. This is the assertion that was
    missing: it fails on a module that adds a column to a `CREATE TABLE` and
    declares nothing in `columns`.
  */
  it("gains a column that was added to an existing table", async () => {
    const cols = await db().prepare(`SELECT name FROM pragma_table_info('job_run')`)
      .all<{ name: string }>();
    expect(cols.results.map((c) => c.name)).toContain("by");
  });

  /*
    ⚠️ AND THE WRITE HAS TO LAND, which is the thing an operator would find out
    about at 03:00. `run` records the row before doing the work, so a missing
    column throws before anything is caught and the whole pass dies.
  */
  it("records a run against the migrated table", async () => {
    const row = await run(db(), "migration.probe", async () => ({ touched: 1, detail: "ok" }));
    expect(row.ok).toBe(true);
    const back = await db().prepare(
      `SELECT job_id, touched FROM job_run WHERE job_id = 'migration.probe'`)
      .first<{ job_id: string; touched: number }>();
    expect(back?.touched).toBe(1);
  });

  /* ⚠️ And a table the module adds outright still appears — the ordinary case,
     asserted so a fix to the one above cannot quietly break the other. */
  it("creates a table the module added since", async () => {
    const t = await db().prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='job_schedule'`).first();
    expect(t).not.toBeNull();
  });

  /*
    ⚠️ AND EVERY OTHER TABLE, NOT JUST THE ONE THAT BROKE. `job_run` is where
    this was found; the fault was in `asTable`, so it applied to all twenty-odd
    platform tables with an underscore in their name and to every collection
    whose id has a hyphen. A test pinned to one table would go green on a fix
    that only helped that table.

    ⚠️ ASKED OF THE DECLARATIONS THIS DEPLOYMENT ACTUALLY APPLIES, so a table
    added later is covered the day it is declared rather than the day somebody
    remembers to extend a list.
  */
  it("can add a column to every table this deployment declares", () => {
    const names = [...DIRECTORY_MODULES, ...SHARD_MODULES,
      ...Object.values(APPS).map((make) => schemaFor(make()))]
      .flatMap((m) => m.statements)
      .map((s) => /CREATE TABLE IF NOT EXISTS (\w+)/i.exec(s)?.[1])
      .filter((n): n is string => Boolean(n));

    expect(names.length).toBeGreaterThan(20);
    /* ⚠️ `asTable` is what the ALTER path puts the name through. A name it
       refuses is a table that can never gain a column — and the refusal throws
       out of `boot`, so it is not one broken migration, it is the deployment. */
    for (const name of names) expect(() => asTable(name)).not.toThrow();
  });
});
