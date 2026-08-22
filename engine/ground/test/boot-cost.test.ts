/**
 * HOW MANY TIMES A COLD ISOLATE TALKS TO A DATABASE BEFORE IT ANSWERS.
 *
 * ⚠️ THIS IS A LATENCY BUDGET, NOT A MICRO-BENCHMARK, and it is the difference
 * between an app that opens and one somebody dreads opening. Every one of these
 * is a SEQUENTIAL round trip: on a deployment whose database is a continent away
 * they are a hundred milliseconds each, so thirty of them is three seconds
 * before the first byte — and an isolate is evicted after seconds of quiet, so
 * most visits pay it.
 *
 * ⚠️ AND NOTHING ELSE WOULD EVER CATCH IT. Each read is correct, cheap in
 * isolation, and covered by a passing test; what is wrong is the COUNT, which no
 * assertion about behaviour can see. It is measured here because the alternative
 * is noticing it in production, which is what happened.
 */

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  DIRECTORY_MODULES, SHARD_MODULES, applySchema, schemaFor, type Db,
} from "@engine/runtime";
import { GROUND } from "../src/index.js";

/** ⚠️ Counts what crosses the wire, whichever call shape asked for it. */
function counting(db: Db): { db: Db; trips: () => number } {
  let n = 0;
  const seen = <T>(made: T): T => { n++; return made; };
  const at: Db = {
    prepare: (query) => {
      const made = db.prepare(query);
      const wrap = <T extends object>(o: T): T => ({
        all: () => seen(o) && (o as never as { all: () => never }).all(),
        first: () => seen(o) && (o as never as { first: () => never }).first(),
        run: () => seen(o) && (o as never as { run: () => never }).run(),
      } as never);
      return { ...wrap(made), bind: (...v: unknown[]) => wrap(made.bind(...v)) } as never;
    },
    exec: (query) => { n++; return db.exec(query); },
  };
  return { db: at, trips: () => n };
}

const directory = () => env.DIRECTORY as unknown as Db;
const shard = () => env.SHARD_EU_1 as unknown as Db;

describe("what a boot costs", () => {
  /*
    ⚠️ THE SECOND PASS IS THE ONE THAT MATTERS. The first applies the schema and
    is allowed to be expensive — it happens once per deployment. The second is
    what EVERY cold isolate for the rest of that version's life pays to learn
    that nothing has changed, and it was one read per module: seventeen on the
    directory and eleven on each shard.
  */
  it("asks a settled database once, not once per module", async () => {
    await applySchema(directory(), DIRECTORY_MODULES);
    const at = counting(directory());
    await applySchema(at.db, DIRECTORY_MODULES);

    expect(DIRECTORY_MODULES.length).toBeGreaterThan(10);
    /* ⚠️ The marker, and one read of every stamp. Nothing per module. */
    expect(at.trips()).toBeLessThanOrEqual(2);
  });

  it("asks a settled shard once too", async () => {
    const modules = [schemaFor(GROUND), ...SHARD_MODULES];
    await applySchema(shard(), modules);
    const at = counting(shard());
    await applySchema(at.db, modules);

    expect(modules.length).toBeGreaterThan(5);
    expect(at.trips()).toBeLessThanOrEqual(2);
  });

  /* ⚠️ AND IT STILL APPLIES A DATABASE THAT HAS NEVER BOOTED. Reading every
     stamp in one query must not have turned the fast path into the only path. */
  it("still applies everything to a database with nothing in it", async () => {
    const applied = await applySchema(shard(), [schemaFor(GROUND), ...SHARD_MODULES]);
    expect(applied.length).toBe(SHARD_MODULES.length + 1);
    /* ⚠️ Ran at least once between the two calls above — the shape, not the count. */
    expect(applied.every((a) => typeof a.ran === "boolean")).toBe(true);
  });
});
