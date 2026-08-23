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
 * ⚠️ ONE CLOCK ACROSS EVERY DATABASE. A request touches the directory and a
 * shard, so counting each separately would report two queries running side by
 * side as two waits — exactly the parallelism this exists to reward.
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

const counting = (db: Db, said: string[], label: string, at: ReturnType<typeof clock>): Db => {
  const note = (sql: string) => {
    at.began();
    said.push(`${String(at.depth()).padStart(2)}${at.beside() ? "|" : " "} ${label} `
      + sql.replace(/\s+/g, " ").trim().slice(0, 88));
  };
  const done = async <T>(work: Promise<T>): Promise<T> => {
    try { return await work; } finally { at.ended(); }
  };
  const wrap = (o: Record<string, () => Promise<never>>, q: string) => ({
    all: () => { note(q); return done(o.all!()); },
    first: () => { note(q); return done(o.first!()); },
    run: () => { note(q); return done(o.run!()); },
    raw: () => { note(q); return done(o.raw!()); },
  });
  return {
    prepare: (q: string) => {
      const made = db.prepare(q);
      return {
        ...wrap(made as never, q),
        bind: (...v: unknown[]) => wrap(made.bind(...v) as never, q),
      } as never;
    },
    exec: (q: string) => { note(q); return done(db.exec(q) as never) as never; },
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

const spent = async (op: string) => {
  const said: string[] = [];
  const at = clock();
  const res = await worker.fetch(
    new Request(`http://${SLUG}.localhost:8080/api/${op}`, { headers: { cookie } }),
    {
      ...asDev,
      DIRECTORY: counting(directory(), said, "dir  ", at),
      SHARD_EU_1: counting(env.SHARD_EU_1 as never, said, "shard", at),
    } as never, ctx);
  return { status: res.status, depth: at.depth(), trips: said.length, said };
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
  it("answers me.who in two waves", async () => {
    const at = await spent("me.who");
    expect(at.status).toBe(200);
    expect(at.depth, `${at.depth} waves, ${at.trips} trips\n${at.said.join("\n")}`)
      .toBeLessThanOrEqual(2);
  }, 60_000);

  /*
    ⚠️ AND AN ORDINARY READ IS THREE, WHICH IS THE SHAPE RATHER THAN THE NUMBER:
    everything the door needs at once, then the wall, then the operation's own
    work. It was six — two of those waves were the wall re-reading the roster row
    the identity had just resolved permissions from and the app list `Located`
    was already carrying, and two more were the notification channels, which
    cost a round trip each and which one operation in the product reads.
  */
  for (const [op, waves] of [["totals.read", 3], ["guide.view", 3]] as const) {
    it(`answers ${op} in ${waves} waves`, async () => {
      const at = await spent(op);
      expect(at.status).toBe(200);
      expect(at.depth, `${at.depth} waves, ${at.trips} trips\n${at.said.join("\n")}`)
        .toBeLessThanOrEqual(waves);
    }, 60_000);
  }

  /*
    ⚠️ AND NOTHING MAY ANSWER WITHOUT ASKING. A budget is met perfectly by a
    request that reads nothing and returns nothing, so the floor is asserted
    beside the ceiling — these operations really do go to a database.
  */
  it("still reads what it answers with", async () => {
    const at = await spent("totals.read");
    expect(at.trips, "a read that touched nothing").toBeGreaterThan(10);
  }, 60_000);
});
