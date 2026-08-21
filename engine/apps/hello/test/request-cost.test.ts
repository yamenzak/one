/**
 * WHAT ONE REQUEST COSTS IN ROUND TRIPS, AND HOW MANY OF THEM WAIT.
 *
 * ⚠️ A LIST READ IS THE MOST COMMON THING THIS PRODUCT DOES, so it is the one
 * with a budget. Before the operation runs at all the platform resolves a
 * workspace, its apps, whether it is charging, what it holds, its wallet, who is
 * asking, what they are owed, whether the deployment is closed and what
 * permissions they have — nine questions, every one correct, every one a
 * separate trip to a database that is not in the same building.
 *
 * ⚠️ AND THE NUMBER THAT MATTERS IS THE DEPTH, NOT THE TOTAL. Four queries
 * awaited together cost one wait; four awaited in turn cost four. Nothing about
 * the code says which it is — `await` reads the same either way — so it is
 * measured rather than reviewed.
 *
 * ⚠️ THE BUDGETS ARE CEILINGS, NOT TARGETS. A change that makes a request
 * cheaper should tighten them in the same commit; one that makes it dearer has
 * to say so out loud by raising a number somebody will read.
 */

import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DIRECTORY_MODULES, SHARD_MODULES,
  NOBODY, addShard, applySchema, locator, memberFor, noteShardApp,
  permissionsResolver, personalOps, schemaFor, serve, sessionIdFrom, tenantBySlug,
  whoIs, type Db,
} from "@engine/runtime";
import { HELLO, hello } from "../src/index.js";
import { counting, waves, type Counted, type Waves } from "./counting.js";

const ROOTS = { root: "one.test" };
const sent: { to: string; code: string }[] = [];

/* ⚠️ THE COUNTERS WRAP THE BINDINGS, so everything the platform does on the way
   to an answer is seen — the locator, the identity, the gates and the operation
   itself, rather than one layer instrumented by hand. */
let clock: Waves;
let onDirectory: Counted;
let onShard: Counted;

const app = () => serve({
  roots: ROOTS,
  apps: { hello },
  directory: onDirectory.db,
  shardOf: () => onShard.db,
  personal: {
    ...personalOps({
      secret: "test-secret", appId: "hello",
      deliver: async (to, code) => { sent.push({ to, code }); },
      deliverExport: async () => undefined,
    }),
  },
  /* ⚠️ THE REAL LOCATOR. A hand-written one would measure the test's own
     shortcut rather than what a request pays. */
  locate: locator({
    directory: onDirectory.db,
    shardOf: () => onShard.db,
    appsOf: async () => [HELLO],
    plans: [],
    charging: async () => false,
  }),
  identify: async (request, finding) => {
    const located = await finding;
    if (!located) return NOBODY;
    const { session, email, accountId } =
      await whoIs(onDirectory.db, sessionIdFrom(request), new Date());
    if (!session || !accountId) return NOBODY;
    const member = await memberFor(located.db, located.tenantId as never, accountId);
    return {
      accountId, email, signedIn: true, provenAt: session.provenAt,
      permissionsIn: permissionsResolver(located.db, located.tenantId as never, member,
        (appId) => (appId === "hello" ? HELLO.access.roles : null)),
    };
  },
});

const at = (host: string, path: string, init: RequestInit = {}) =>
  app()(new Request(`https://${host}.one.test${path}`, init));
const post = (host: string, path: string, body: unknown, cookie?: string) =>
  at(host, path, { method: "POST", body: JSON.stringify(body), headers: cookie ? { cookie } : {} });
const get = (host: string, path: string, cookie?: string) =>
  at(host, path, { headers: cookie ? { cookie } : {} });

const codeFor = (email: string) => sent.filter((s) => s.to === email).at(-1)!.code;
const cookieOf = (r: Response) => (r.headers.get("set-cookie") ?? "").split(";")[0]!;

let cookie = "";
let slug = "";

beforeAll(async () => {
  /* ⚠️ ONE CLOCK FOR BOTH — see `waves`. */
  clock = waves();
  onDirectory = counting(env.DIRECTORY as unknown as Db, clock);
  onShard = counting(env.SHARD_EU_1 as unknown as Db, clock);
  await applySchema(onDirectory.db, DIRECTORY_MODULES);
  await applySchema(onShard.db, [schemaFor(HELLO), ...SHARD_MODULES]);
  await addShard(onDirectory.db, "eu-1", "eu", 100);
  await noteShardApp(onDirectory.db, "eu-1", "hello");

  expect((await post("setup", "/api/me.code", { email: "sam@example.com" })).status).toBe(200);
  cookie = cookieOf(await post("setup", "/api/me.session",
    { email: "sam@example.com", code: codeFor("sam@example.com") }));
  slug = "fastwork";
  const made = await post("setup", "/api/me.tenant.create",
    { slug, name: "Fast", country: "DE" }, cookie);
  expect(made.status, await made.clone().text()).toBe(200);

  /* ⚠️ Warmed once: the first request of any isolate pays the boot, which has
     its own budget in `boot-cost.test.ts` and is not what this measures. */
  await get(slug, "/api/note.list", cookie);
});

beforeEach(() => { clock.reset(); onDirectory.reset(); onShard.reset(); });

const spent = () => ({
  trips: onDirectory.trips() + onShard.trips(),
  depth: clock.depth(),
});

describe("what a read costs", () => {
  it("answers a list without a wall of waiting", async () => {
    const res = await get(slug, "/api/note.list", cookie);
    expect(res.status).toBe(200);

    const at = spent();
    /*
      ⚠️ RAISE THESE ONLY WITH A REASON IN THE COMMIT. Every point on `depth` is
      a round trip a person waits for, and on a deployment whose database is a
      continent away that is a tenth of a second each. The failure this catches
      is not a slow query; it is a tenth question added to the nine already
      asked, by somebody who could not see the other nine.

      ⚠️ ELEVEN QUERIES, THREE WAITS — and the gap between those two numbers is
      the whole point of measuring depth rather than trips. It was eleven waits,
      then seven, then three: the workspace lookup, the identity and the
      maintenance switch all start together now (`Locating`), so the only things
      left in a line are the three that genuinely feed each other — which
      workspace this is, then what it holds and who is on its roster, then the
      answer.

      ⚠️ THE ELEVENTH IS THE FLAG STORE, AND IT WAS TEN. Raised on purpose: what
      somebody switched has to be read for the gate and the surface to agree
      about it, and it was read by nothing at all — the console wrote rows only
      the console read back, so a flag switched on changed nothing anywhere with
      every suite green. It is ONE query rather than two (both levels in a single
      statement, `switchesFor`), it starts beside the identity so it adds no
      DEPTH, and a deployment whose products declare no flag never runs it. This
      app declares one, so this measurement pays for it.

      ⚠️ AND THE TWELFTH IS THE TOTAL, WHICH IS WORTH A QUERY. A page of fifty
      out of two hundred was indistinguishable from a collection of fifty, and
      the screen drawing it said "fifty products" with complete confidence — in a
      product whose entire purpose is answering how many there are. It runs
      BESIDE the page rather than before it, so `depth` is unchanged at three:
      what this buys is a trip, not a wait.
    */
    expect(at.depth, `depth ${at.depth}, trips ${at.trips}`).toBeLessThanOrEqual(3);
    expect(at.trips, `depth ${at.depth}, trips ${at.trips}`).toBeLessThanOrEqual(12);
  });

  /* ⚠️ AND A SECOND READ IS NOT DEARER THAN THE FIRST. Anything held per
     request has to be held per request — a value resolved once and then again
     inside the same call is the shape that grows silently. */
  it("costs the same the second time", async () => {
    await get(slug, "/api/note.list", cookie);
    const first = spent();
    clock.reset(); onDirectory.reset(); onShard.reset();
    await get(slug, "/api/note.list", cookie);
    expect(spent().depth).toBe(first.depth);
  });
});

/**
 * ⚠️ THE PERSONAL LANE IS THE ONE EVERY VISIT STARTS ON, so it is the one that
 * decides how long "opening the app" takes. It resolves no workspace and no
 * entitlement — it is a session and an account — and it must stay that cheap.
 */
describe("what the account door costs", () => {
  it("says who is here in a couple of trips", async () => {
    const res = await get("id", "/api/me.who", cookie);
    expect(res.status).toBe(200);
    const at = spent();
    expect(at.depth, `depth ${at.depth}, trips ${at.trips}`).toBeLessThanOrEqual(4);
    expect(at.trips, `depth ${at.depth}, trips ${at.trips}`).toBeLessThanOrEqual(6);
  });
});

/**
 * ⚠️ AND THE SHAPE OF THE LOG IS THE TOOL, not the numbers above. When a budget
 * fails, print `onDirectory.said()` and `onShard.said()` — each line is
 * wave-numbered and marks with `|` anything that did not wait — and the chain
 * that grew is visible in one read rather than inferred from a total.
 */
