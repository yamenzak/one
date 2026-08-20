/**
 * WHAT A COLD ISOLATE SERVES WHILE ITS DATABASE IS STILL BEING MIGRATED.
 *
 * ⚠️ THIS IS THE ONE THING NO OTHER SUITE HERE CAN SEE. `boot` is memoised per
 * isolate, so by the second request every test in this package is warm and the
 * question "did that request WAIT for the schema" has no observable answer. It
 * is also the question that decided how long opening the product took: the
 * migration ran in front of every request, the page included, so a cold start
 * served no HTML at all until every module had been applied to the directory and
 * to each shard.
 *
 * ⚠️ SO THE MODULE IS LOADED FRESH AND THE DATABASE NEVER ANSWERS. `resetModules`
 * clears the boot memo; the directory below returns a promise that is never
 * settled, which is a migration that has not finished yet, held still. A path
 * that waits for it hangs forever and a path that does not answers at once —
 * which is exactly the distinction, with nothing in between to be ambiguous
 * about.
 *
 * ⚠️ AND THE FAILING MODE IS A TIMEOUT RATHER THAN AN ASSERTION, so the race is
 * explicit: every request here is run against a short timer and `"hung"` is a
 * value the test compares, never a suite that stalls until vitest gives up.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/** ⚠️ A migration that has not finished. Nothing here ever settles. */
const hangs = () => {
  const forever = new Promise<never>(() => {});
  const statement = {
    bind: () => statement,
    all: () => forever, first: () => forever, run: () => forever, raw: () => forever,
  };
  return { prepare: () => statement, batch: () => forever, exec: () => forever };
};

/**
 * ⚠️ A DATABASE THAT ANSWERS EVERYTHING WITH NOTHING, IN ORDER. The hanging one
 * above can only show that a request did NOT wait; showing that one DID has to be
 * the order the statements went out in, because a request that waits correctly
 * and one that skipped the wait and got lucky look identical from outside.
 */
const records = (said: string[]) => {
  /* ⚠️ A TICK PER STATEMENT, AND IT IS THE POINT. A real database is a network
     away; answering instantly would let a request that never waited finish its
     whole chain inside one microtask and come out looking ordered. */
  const trip = async <T>(value: T): Promise<T> => {
    await new Promise((go) => { setTimeout(go, 0); });
    return value;
  };
  const at = (sql: string) => {
    said.push(sql.replace(/\s+/g, " ").trim());
    const statement: Record<string, unknown> = { bind: () => statement };
    statement.all = () => trip({ results: [] });
    statement.first = () => trip(null);
    statement.run = () => trip({ success: true });
    statement.raw = () => trip([]);
    return statement;
  };
  return {
    prepare: at,
    exec: async (sql: string) => { at(sql); await trip(null); },
    batch: () => trip([]),
  };
};

const ENV = {
  ROOT: "localhost",
  AUTH_SECRET: "test",
  ENVIRONMENT: "development",
  DIRECTORY: hangs(),
  SHARD_EU_1: hangs(),
  /* ⚠️ The page is served by the assets binding, so it has to say something. */
  ASSETS: { fetch: async () => new Response("<!doctype html>", { status: 200 }) },
};

/** ⚠️ Handed over rather than awaited, and nothing here ever awaits it. */
const ctx = { waitUntil: () => {} };

const HUNG = "hung" as const;
/**
 * ⚠️ THE NUMBER IS NOT PART OF THE ASSERTION, AND TREATING IT AS ONE MADE THIS
 * FILE FLAKY. The database here NEVER answers, so a request that waits for one
 * waits forever: anything that comes back AT ALL is the pass, and a millisecond
 * and a minute say exactly the same thing. The bound exists only so a failure
 * reads as "the page waited for the database" instead of hanging until vitest
 * gives up with no explanation.
 *
 * ⚠️ SO IT IS FAR ABOVE ANYTHING THE MACHINE CAN DO, because what it was
 * actually racing was the isolate's own work rather than the handler's. Each
 * test resets the module registry, so the route's chunk is transformed on the
 * way in — and under a full workspace run in parallel that alone blew through
 * 250ms. Three failures in one afternoon, none of them on this file's subject.
 * A tighter bound does not test anything more; it only teaches the next person
 * to re-run instead of to look.
 *
 * ⚠️ AND THE NUMBER THAT ACTUALLY FIRED WAS NOT THIS ONE — WHICH IS WHY
 * WIDENING THIS ALONE FIXED NOTHING. The failures landed at 5.0s against a 2s
 * bound, because most of that time is spent BEFORE the race starts: the
 * transform is in `cold()`, and vitest's own default per-test timeout is five
 * seconds. A
 * bound inside the test cannot rescue a test the runner has already abandoned,
 * so both numbers have to move, and this one has to stay under the other.
 */

/**
 * ⚠️ ABOVE `within`, SO THE FAILURE THAT ARRIVES IS THE ONE WITH THE SENTENCE ON
 * IT. If the runner gives up first, all anybody gets is "test timed out" against
 * a file whose whole subject is what a request waits for — which reads as the
 * fault it is looking for and is not.
 */
const SLOW = 60_000;
const within = async (
  work: Promise<Response>, ms = 20_000,
): Promise<Response | typeof HUNG> =>
  Promise.race([
    work,
    new Promise<typeof HUNG>((go) => { setTimeout(() => go(HUNG), ms); }),
  ]);

/* ⚠️ FRESH PER TEST. A worker whose boot memo is already set is a warm isolate,
   which is the state this file exists to escape. */
const cold = async () => {
  vi.resetModules();
  return (await import("../src/index.js")).default;
};

const at = async (path: string, host = "id.localhost") => {
  const worker = await cold();
  return within(worker.fetch(new Request(`http://${host}:8080${path}`), ENV as never, ctx));
};

beforeEach(() => { vi.resetModules(); });

describe("a request that reads no table", () => {
  /* ⚠️ THE PAGE. This is what somebody sees first, and for a while it was a
     blank screen for the length of a migration. */
  it("serves the page while the schema is still being applied", async () => {
    const res = await at("/settings/notifications");
    expect(res, "the page waited for the database").not.toBe(HUNG);
    expect((res as Response).status).toBe(200);
  }, SLOW);

  /* ⚠️ AND THE PROBE. `/health` is four fields read off the hostname — it is the
     request behind "Finding this place", and it needs no table at all. */
  it("says which door this is while the schema is still being applied", async () => {
    const res = await at("/health");
    expect(res, "the probe waited for the database").not.toBe(HUNG);
    expect(await (res as Response).json()).toMatchObject({ ok: true, door: "account" });
  }, SLOW);
});

describe("a request that reads a table", () => {
  /*
    ⚠️ AND THIS ONE MUST WAIT, which is the other half and the reason the split
    is safe. An operation answered before its tables exist is "no such table" to
    whoever happens to be first after a deploy — a fault that appears once and
    never reproduces.

    ⚠️ THE ORDER IS THE ASSERTION, NOT THE DELAY. Against the hanging database
    above an operation stalls whatever the code does, because the very next thing
    it reads is the plan catalogue — so "it hung" would have passed with the wait
    deleted. What separates the two is whether the request's own first read lands
    after the migration FINISHED or in the middle of it, and `plan_edit` is the
    one table only the request ever names.
  */
  it("finishes applying the schema before it reads anything of its own", async () => {
    const said: string[] = [];
    const worker = await cold();
    await within(worker.fetch(
      new Request("http://id.localhost:8080/api/me.who"),
      { ...ENV, DIRECTORY: records(said), SHARD_EU_1: records(said) } as never,
      ctx,
    ), 3_000);

    /* ⚠️ THE READ, NOT THE `CREATE TABLE`. `plan_edit` appears in the migration
       too — matching the bare name found the DDL and reported the request as
       early when it was not. */
    const done = said.reduce((last, s, i) => (s.includes("_schema") ? i : last), -1);
    const asked = said.findIndex((s) => /^SELECT .*\bFROM plan_edit\b/.test(s));
    expect(done, "nothing applied a schema at all").toBeGreaterThan(-1);
    expect(asked, "the request never read the catalogue").toBeGreaterThan(-1);
    expect(asked, `catalogue read at ${asked}, schema still running at ${done}`)
      .toBeGreaterThan(done);
    /* ⚠️ Its own bound stays three seconds — this one WANTS the request to stall,
       and what it reads afterwards is the ORDER of what was said, not the time.
       The runner still has to be told to wait, because the transform in front of
       it is the same one. */
  }, SLOW);
});
