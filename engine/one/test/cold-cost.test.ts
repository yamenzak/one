/**
 * WHAT A COLD ISOLATE PAYS BEFORE IT ANSWERS ANYTHING.
 *
 * ⚠️ THIS IS THE COST EVERY VISIT PAYS, NOT AN EDGE CASE. An isolate is evicted
 * after seconds of quiet and a burst of requests is spread across several of
 * them, so "cold" is the ordinary state, not the first one. `boot` applies every
 * schema module to the directory and to each shard and settles the deployment's
 * bindings, and every `/api/*` request waits for all of it — on a deployment
 * whose database is not in the same building, each sequential trip is a hundred
 * milliseconds or more.
 *
 * ⚠️ AND THE NUMBER THAT MATTERS IS THE DEPTH. Queries awaited together cost one
 * wait; awaited in turn they cost one each. Nothing in the source says which it
 * is — `await` reads the same either way — so it is measured. Measured live, a
 * burst of seven requests came back in 2.2–2.7 seconds each having spent 9–13 ms
 * of CPU: not work, waits.
 *
 * ⚠️ THE FIRST BOOT OF A DATABASE IS NOT WHAT THIS MEASURES, deliberately. That
 * happens once per deployment and is allowed to be expensive. What every cold
 * isolate for the rest of a version's life pays is the cost of learning that
 * nothing has changed, and that is the number below.
 */

import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "@engine/runtime";

/**
 * ⚠️ THE WAVE IS A PROPERTY OF THE BOOT, NOT OF A CONNECTION. A boot touches the
 * directory and every shard, so counting each separately would report two
 * queries running side by side as two waits — which is exactly the parallelism
 * this measurement exists to reward.
 */
const clock = () => {
  let open = 0, depth = 0;
  return {
    depth: () => depth,
    began: () => { if (open === 0) depth++; open++; },
    ended: () => { open--; },
    beside: () => open > 1,
  };
};

const counting = (db: Db, said: string[], label: string, at: ReturnType<typeof clock>) => {
  const note = (sql: string) => {
    at.began();
    said.push(`${String(at.depth()).padStart(2)}${at.beside() ? "|" : " "} ${label} `
      + sql.replace(/\s+/g, " ").trim().slice(0, 72));
  };
  const done = async <T>(work: Promise<T>): Promise<T> => {
    try { return await work; } finally { at.ended(); }
  };
  const wrap = (o: Record<string, () => Promise<never>>, query: string) => ({
    all: () => { note(query); return done(o.all!()); },
    first: () => { note(query); return done(o.first!()); },
    run: () => { note(query); return done(o.run!()); },
    raw: () => { note(query); return done(o.raw!()); },
  });
  return {
    prepare: (query: string) => {
      const made = db.prepare(query);
      return {
        ...wrap(made as never, query),
        bind: (...v: unknown[]) => wrap(made.bind(...v) as never, query),
      } as never;
    },
    exec: (query: string) => { note(query); return done(db.exec(query) as never) as never; },
  } as Db;
};

const base = () => ({
  ROOT: "localhost", AUTH_SECRET: "test", ENVIRONMENT: "development",
  ASSETS: { fetch: async () => new Response("<!doctype html>") },
});

/* ⚠️ A NEW MODULE REGISTRY IS A NEW ISOLATE. `boot` memoises per module scope,
   so without this the second request is warm and the question has no answer. */
const isolate = async () => {
  vi.resetModules();
  return (await import("../src/index.js")).default;
};

const ask = async (worker: { fetch: (r: Request, e: never, c: never) => Promise<Response> },
  directory: Db, shard: Db) =>
  worker.fetch(new Request("http://id.localhost:8080/api/me.who"),
    { ...base(), DIRECTORY: directory, SHARD_EU_1: shard } as never,
    { waitUntil: () => {} } as never);

describe("what a cold isolate pays on a settled database", () => {
  /*
    ⚠️ THE CEILINGS ARE CEILINGS, NOT TARGETS. A change that makes a boot cheaper
    tightens them in the same commit; one that makes it dearer has to raise a
    number somebody will read. They were 5 waves and 10 statements, and the three
    that came off were: a `CREATE TABLE IF NOT EXISTS` in front of a read that
    already tolerated the table being absent, the directory and the shipped
    shards migrated one after the other rather than together, and
    `SELECT * FROM resource` read twice — once to find grown shards and again
    inside `settleBindings`.
  */
  const WAVES = 2;
  const TRIPS = 8;

  it("boots in two waves, not five", async () => {
    /* ⚠️ Warm the REAL databases first, so what follows meets a settled one —
       which is what a deployment's second and every later isolate meets. */
    await ask(await isolate(), env.DIRECTORY as never, env.SHARD_EU_1 as never);

    const said: string[] = [];
    const at = clock();
    const worker = await isolate();
    const res = await ask(worker,
      counting(env.DIRECTORY as never, said, "dir  ", at),
      counting(env.SHARD_EU_1 as never, said, "shard", at));

    const report = `\n${said.join("\n")}`;
    expect(res.status, report).toBeLessThan(500);
    expect(at.depth(), `${at.depth()} waves, ${said.length} statements${report}`)
      .toBeLessThanOrEqual(WAVES);
    expect(said.length, `${at.depth()} waves, ${said.length} statements${report}`)
      .toBeLessThanOrEqual(TRIPS);
  }, 60_000);

  /* ⚠️ AND THE CHEAP PATH MUST NOT HAVE BECOME THE ONLY PATH. Reading the stamps
     before making the table they live in is only safe because a database that
     has never booted still gets one — a boot that skipped it would write every
     stamp into nothing and re-apply every module on every isolate, for ever,
     with nothing failing. */
  it("still migrates a database whose marker table is not there", async () => {
    const { applySchema, DIRECTORY_MODULES } = await import("@engine/runtime");
    const db = env.DIRECTORY as unknown as Db;
    /* ⚠️ The state a database has never left before its first boot. Storage is
       isolated per test, so this is undone when the test ends. */
    await db.exec("DROP TABLE IF EXISTS _schema");

    const applied = await applySchema(db, DIRECTORY_MODULES);
    expect(applied.length).toBe(DIRECTORY_MODULES.length);
    expect(applied.every((a) => a.ran), "a module did not run against a fresh marker")
      .toBe(true);

    /* ⚠️ AND THE STAMPS LANDED. Creating the table in the catch is only correct
       if it happens before the first stamp is written — without that every
       stamp goes nowhere and every isolate re-applies every module for ever,
       with nothing failing and nothing to see. */
    const again = await applySchema(db, DIRECTORY_MODULES);
    expect(again.every((a) => !a.ran), "the stamps did not land").toBe(true);
  }, 60_000);
});
