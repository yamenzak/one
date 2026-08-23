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

const ask = (op: string, env_: never) =>
  worker.fetch(new Request(`http://${SLUG}.localhost:8080/api/${op}`,
    { headers: { cookie } }), env_, ctx);

/**
 * ⚠️ WARMED FIRST, THEN TIMED. The first call through a fresh module registry
 * pays for the schema check and whatever the settings hold has let go of, and
 * measuring that reports the cold path under the warm one's name.
 */
const timed = async (op: string, lag: number) => {
  const at = held(lag);
  await ask(op, at);
  const began = Date.now();
  const res = await ask(op, at);
  return { ms: Date.now() - began, status: res.status };
};

const spent = async (op: string) => {
  const fast = await timed(op, FAST);
  const slower = await timed(op, SLOW);
  return {
    status: slower.status,
    deep: (slower.ms - fast.ms) / (SLOW - FAST),
    ms: `${fast.ms} ms at ${FAST}, ${slower.ms} ms at ${SLOW}`,
  };
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
    ⚠️ AND NOTHING MAY ANSWER WITHOUT ASKING. A budget is met perfectly by a
    request that reads nothing and returns nothing, so the floor is asserted
    beside the ceiling — these operations really do go to a database.
  */
  it("still reads what it answers with", async () => {
    const at = await spent("totals.read");
    expect(at.deep, "a read that touched no database at all").toBeGreaterThan(1);
  }, 60_000);
});
