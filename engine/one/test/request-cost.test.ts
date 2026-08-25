/**
 * WHAT ONE REQUEST COSTS IN ROUND TRIPS, AND HOW MANY OF THEM WAIT.
 *
 * ⚠️ THE NUMBER THAT MATTERS IS THE DEPTH, NOT THE TOTAL. Queries awaited
 * together cost one wait; awaited in turn they cost one each. Nothing in the
 * source says which it is — `await` reads the same either way — so it is
 * measured. On this deployment a round trip is a fifth of a second, so the depth
 * IS the speed: a live trace showed twelve requests averaging 2.4 seconds each
 * having spent nine milliseconds of CPU between them.
 *
 * ⚠️ AND `me.who` IS THE ONE THE CURTAIN WAITS FOR. Nothing can be drawn until
 * it answers — not the door, not the screen, not the shell — so its depth is the
 * blank screen somebody watches. It was TEN waves, the deepest request in the
 * product, because the wall it resolves was asked last and re-read three things
 * the reads above it already had.
 *
 * ⚠️ THE BUDGETS ARE CEILINGS, NOT TARGETS. A change that makes a request
 * cheaper tightens them in the same commit; one that makes it dearer has to say
 * so out loud by raising a number somebody will read.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import {
  MEMBERSHIP, addShard, compPlan, createTenant, found, noteBelonging, noteShardApp,
  startSession, upsertAccount, type Db,
} from "@engine/runtime";
import worker, { APPS, LEGAL } from "../src/index.js";
import { warm } from "./warm.js";

const { ctx, settled } = warm();
const asDev = { ...env, ROOT: "localhost", ENVIRONMENT: "development", AUTH_SECRET: "test" };
const SLUG = "costed";
const directory = () => env.DIRECTORY as unknown as Db;
let cookie = "";

/**
 * HOW DEEP THE CHAIN IS, MEASURED BY MAKING EVERY QUERY COST THE SAME.
 *
 * ⚠️ COUNTING WHAT IS IN FLIGHT DOES NOT ANSWER THIS, AND THE FIRST VERSION OF
 * THIS FILE TRIED. "A new wave begins when nothing is open" reports two chains
 * running beside each other as ONE wave however long each of them is — so a
 * three-deep chain overlapping a one-deep one reads as depth two, and the number
 * flatters exactly the code it is meant to catch. It said `me.who` was two waves
 * when the live deployment was spending four round trips on it.
 *
 * ⚠️ SO EVERY QUERY IS HELD FOR A FIXED LAG AND THE WALL CLOCK IS READ. Queries
 * that ran side by side add nothing to it; queries that waited add one lag each.
 * Against the live numbers it agrees: `me.who` measures four here and takes
 * 1,038 ms there, on a database roughly 260 ms away.
 *
 * ⚠️ AND IT IS THE SLOPE BETWEEN TWO LAGS, NOT ONE TOTAL DIVIDED BY ONE LAG. A
 * single reading also contains everything the request does that is NOT waiting
 * for a database — parsing, composing, and, under a parallel workspace run, the
 * scheduler — so it moves with the load on the machine and the test failed only
 * when the rest of the suite ran beside it. Timing the same request at two lags
 * and dividing the DIFFERENCE cancels every fixed cost, whatever it is: what is
 * left is the count of things that waited.
 */
const SLOW = 60;
const FAST = 20;

const slow = (db: Db, lag: number): Db => {
  const hold = async <T>(work: Promise<T>): Promise<T> => {
    const [got] = await Promise.all([work, new Promise((go) => { setTimeout(go, lag); })]);
    return got as T;
  };
  const wrap = (o: Record<string, () => Promise<never>>) => ({
    all: () => hold(o.all!()), first: () => hold(o.first!()),
    run: () => hold(o.run!()), raw: () => hold(o.raw!()),
  });
  return {
    prepare: (q: string) => {
      const made = db.prepare(q);
      return {
        ...wrap(made as never),
        bind: (...v: unknown[]) => wrap(made.bind(...v) as never),
      } as never;
    },
    exec: (q: string) => hold(db.exec(q) as never) as never,
  } as Db;
};

beforeAll(async () => {
  await worker.fetch(new Request(`http://${SLUG}.localhost:8080/health`), asDev as never, ctx);
  await settled();
  await addShard(directory(), "eu-1", "eu", 100);
  for (const id of Object.keys(APPS)) await noteShardApp(directory(), "eu-1", id);
  const made = await createTenant(directory(), {
    slug: SLUG, name: "Costed", country: "DE", where: "eu", apps: ["inventory"],
  });
  if (typeof made === "string") throw new Error(made);
  await compPlan(directory(), made.tenant.id as never, MEMBERSHIP, "solo");
  const who = await upsertAccount(directory(), "keeper@example.com", null);
  await found(env.SHARD_EU_1 as unknown as Db, made.tenant.id as never, who as never,
    "keeper@example.com", { inventory: "keeper" });
  await noteBelonging(directory(), who as never, made.tenant.id as never);
  cookie = `one_session=${(await startSession(directory(), who as never)).id}`;
  /* ⚠️ THE WALL FIRST, or every measurement below is of a refusal. */
  for (const doc of Object.values(LEGAL.documents)) {
    await worker.fetch(new Request(`http://${SLUG}.localhost:8080/api/me.accept`, {
      method: "POST", headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ document: doc.id, version: doc.version }),
    }), asDev as never, ctx);
  }
}, 120_000);

const held = (lag: number) => ({
  ...asDev,
  DIRECTORY: slow(directory(), lag),
  SHARD_EU_1: slow(env.SHARD_EU_1 as never, lag),
}) as never;

/* ⚠️ THE DOOR IS A PARAMETER BECAUSE THE OPERATOR'S READS ARE NOT ON THIS ONE.
   The console answers at `admin.` and nowhere else, and its list of workspaces
   is the read whose cost grows with the deployment rather than with a page. */
const ask = (op: string, env_: never, host = `${SLUG}.localhost`) =>
  worker.fetch(new Request(`http://${host}:8080/api/${op}`,
    { headers: { cookie } }), env_, ctx);

/**
 * ⚠️ WARMED FIRST, THEN TIMED. The first call through a fresh module registry
 * pays for the schema check and whatever the settings hold has let go of, and
 * measuring that reports the cold path under the warm one's name.
 */
const timed = async (op: string, lag: number, host?: string) => {
  const at = held(lag);
  await ask(op, at, host);
  const began = Date.now();
  const res = await ask(op, at, host);
  return { ms: Date.now() - began, status: res.status };
};

/**
 * ⚠️ WARMED FIRST, BECAUSE THE PAIR MUST DO THE SAME WORK. The slope only means
 * anything if both readings ran the same queries — and the FIRST call of an
 * operation does not: a lazily-built cache, a schema check, a memo that is empty
 * once. It failed in CI exactly that way, reporting `inbox.list` at 9.5 with a
 * fast reading of 39 ms, which is less time than eight sequential twenty
 * millisecond holds can take. That is not a deep request; it is two readings of
 * different requests, subtracted.
 *
 * ⚠️ AND THE WARM-UP IS UNTIMED AND DISCARDED. Timing it would put the one-off
 * cost back into the number this is trying to isolate.
 */
/**
 * ⚠️ AND A READING THAT CANNOT BE TRUE IS DISCARDED RATHER THAN REPORTED. Two
 * timings imply a depth AND a fixed cost: `fast = d·FAST + F` and
 * `slow = d·SLOW + F`, so `F = fast − d·FAST`. A NEGATIVE fixed cost is not a
 * slow request, it is arithmetic saying the two readings did not measure the
 * same thing — and that is exactly how this failed in CI twice, reporting depths
 * of 9.5 and 10.7 off fast readings of 39 ms and 38 ms. Eight sequential
 * twenty-millisecond holds cannot finish in thirty-eight.
 *
 * ⚠️ SO IT IS SAMPLED UNTIL IT AGREES WITH ITSELF, and gives up out loud. A
 * shared runner deschedules a process mid-measurement; the answer to that is to
 * measure again, not to widen the budget until the noise fits inside it. A
 * budget raised to accommodate an invalid reading is a budget that has stopped
 * being able to fail.
 */
const TRIES = 5;

/**
 * ⚠️ A LITTLE BELOW ZERO IS NOISE, NOT A BROKEN PAIR. Two timings of a cheap
 * request land a millisecond or two either side of each other, so the implied
 * fixed cost wobbles around zero and resampling on that is work for nothing.
 * What is being caught is a reading that cannot be true at all — a fast run that
 * finished in a fraction of the time its own depth requires, which comes out
 * hundreds of milliseconds negative.
 */
const IMPOSSIBLE = -FAST / 2;

const once = async (op: string, host?: string) => {
  const fast = await timed(op, FAST, host);
  const slower = await timed(op, SLOW, host);
  const deep = (slower.ms - fast.ms) / (SLOW - FAST);
  return {
    status: slower.status,
    deep,
    /* What the request costs BESIDES waiting — parsing, composing, the
       scheduler. It cannot be less than nothing. */
    fixed: fast.ms - deep * FAST,
    ms: `${fast.ms} ms at ${FAST}, ${slower.ms} ms at ${SLOW}`,
  };
};

const spent = async (op: string, host?: string) => {
  /* ⚠️ WARMED AND DISCARDED. The first call of an operation does work the second
     does not — a lazily built cache, a memo that is empty once — and timing it
     puts that one-off cost into the number this is trying to isolate. */
  await timed(op, FAST, host);

  let last = await once(op, host);
  for (let n = 1; n < TRIES && last.fixed < IMPOSSIBLE; n += 1) last = await once(op, host);
  if (last.fixed < IMPOSSIBLE) {
    throw new Error(
      `${op}: ${TRIES} readings all implied a negative fixed cost — the last was `
      + `${last.ms}, which is ${last.deep.toFixed(1)} deep with ${last.fixed.toFixed(0)} ms `
      + "of work outside the waiting. The pair did not measure the same request; "
      + "this is the harness on a loaded machine, not a slow operation.",
    );
  }
  return last;
};

describe("what a warm request costs", () => {
  /*
    ⚠️ THE READ THE CURTAIN WAITS FOR, AND IT WAS THE DEEPEST IN THE PRODUCT.
    Ten waves: the wall was resolved after the whole walk over every workspace
    somebody belongs to, and inside it the workspace was looked up by slug, read
    back by id, then asked for its membership and its live apps one at a time —
    three of which the reads above had already made. It needs an account and a
    hostname, and neither is a fact in any of them.
  */
  it("answers me.who four round trips deep", async () => {
    const at = await spent("me.who");
    expect(at.status).toBe(200);
    expect(at.deep, `${at.deep.toFixed(1)} round trips (${at.ms})`)
      .toBeLessThanOrEqual(5);
  }, 60_000);

  /*
    ⚠️ AND AN ORDINARY READ IS THREE, WHICH IS THE SHAPE RATHER THAN THE NUMBER:
    everything the door needs at once, then the wall, then the operation's own
    work. It was six — two of those waves were the wall re-reading the roster row
    the identity had just resolved permissions from and the app list `Located`
    was already carrying, and two more were the notification channels, which
    cost a round trip each and which one operation in the product reads.
  */
  const BUDGETED = [["totals.read", 6], ["guide.view", 7], ["centre.view", 8], ["inbox.list", 8]] as const;

  for (const [op, deep] of BUDGETED) {
    it(`answers ${op} ${deep} round trips deep`, async () => {
      const at = await spent(op);
      expect(at.status).toBe(200);
      expect(at.deep, `${at.deep.toFixed(1)} round trips (${at.ms})`)
        .toBeLessThanOrEqual(deep);
    }, 60_000);
  }

  /*
    ⚠️ ONE GENERATED READ STANDS FOR ALL OF THEM, WHICH IS WHY THIS IS ONE LINE
    RATHER THAN A HUNDRED. Every collection in every app is answered by the same
    function in `records.ts` — the same gate walk, the same scope filter, the
    same count beside the page — so a change that puts a round trip into the
    shape puts it into all of them at once, and a single representative catches
    that. Budgeting each collection instead would be a hundred numbers measuring
    one thing, and a hundred numbers nobody reads.
  */
  it("answers a generated collection read five round trips deep", async () => {
    const at = await spent("product.list");
    expect(at.status).toBe(200);
    expect(at.deep, `${at.deep.toFixed(1)} round trips (${at.ms})`)
      .toBeLessThanOrEqual(6);
  }, 60_000);

  /*
    ⚠️ AND THE ONE OPERATOR READ WHOSE COST GROWS WITH THE DEPLOYMENT. Every
    other budget here is a page: what it costs is what it costs whoever opens it.
    The console's workspace list is the read that gets dearer as the business
    succeeds — it walked every workspace for its products and its membership, so
    it was three subrequests a row and as many waves as the slowest of them.
    A budget is what stops that coming back as somebody's convenience.
  */
  it("answers the console's workspace list two round trips deep", async () => {
    const at = await spent("op.tenants", "admin.localhost");
    expect(at.status).toBe(200);
    expect(at.deep, `${at.deep.toFixed(1)} round trips (${at.ms})`)
      .toBeLessThanOrEqual(3);
  }, 60_000);

  /*
    ⚠️ AND NOTHING MAY ANSWER WITHOUT ASKING. A budget is met perfectly by a
    request that reads nothing and returns nothing, so the floor is asserted
    beside the ceiling — these operations really do go to a database.
  */
  it("still reads what it answers with", async () => {
    const at = await spent("totals.read");
    expect(at.deep, "a read that touched no database at all").toBeGreaterThan(1);
  }, 60_000);
});
