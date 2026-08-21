/**
 * A WORKSPACE WITH TWO SITES, AND SOMEBODY WHO WORKS AT ONE OF THEM.
 *
 * ⚠️ THIS IS THE ONLY THING THAT PROVES THE FEATURE. `reach` is a declaration,
 * a column, a resolver, a filter in five generated statements and a helper in
 * forty handwritten ones — every part of which composes, typechecks and passes a
 * structural guard while narrowing nothing at all. What a guard cannot say is
 * whether a REQUEST comes back short, and that is the whole claim.
 *
 * ⚠️ AND IT ASSERTS BOTH DIRECTIONS. That the narrowed member is refused is half
 * of it; the other half is that the owner, whom nobody narrowed, still sees
 * everything — because a filter that quietly applied to everybody would pass
 * every "is it hidden" test ever written and break the product for its ordinary
 * customer, who has one site.
 *
 * ⚠️ THE GRANT IS TO THE SITE AND THE STOCK IS ON A SHELF INSIDE IT, deliberately.
 * A grant that only covered the row it named would make narrowing somebody a job
 * of listing four hundred bins, and every bin added afterwards invisible to the
 * person who works there.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import {
  MEMBERSHIP, addShard, claimInvitations, compPlan, createTenant, found, noteBelonging,
  noteShardApp, startSession, upsertAccount, type Db,
} from "@engine/runtime";
import worker, { APPS, LEGAL } from "../src/index.js";
import { warm } from "./warm.js";

const { ctx, settled } = warm();

const asDev = { ...env, ROOT: "localhost", ENVIRONMENT: "development", AUTH_SECRET: "test" };

const SLUG = "harbourworks";
const directory = () => env.DIRECTORY as unknown as Db;
const shard = () => env.SHARD_EU_1 as unknown as Db;
const TODAY = "2026-08-21";

let owner = "";
let hand = "";
let tenantId = "";
/** The membership row the grant is written against. */
let handMember = "";

const at = (path: string, init: RequestInit = {}) =>
  worker.fetch(new Request(`http://${SLUG}.localhost:8080${path}`, init), asDev as never, ctx);

interface Said { readonly status: number; readonly body: Record<string, unknown> }

const read = async (op: string, who: string, input: Record<string, string> = {}): Promise<Said> => {
  const query = new URLSearchParams(input).toString();
  const res = await at(`/api/${op}${query ? `?${query}` : ""}`, { headers: { cookie: who } });
  return { status: res.status, body: await res.json() as Record<string, unknown> };
};

const write = async (op: string, who: string, input: unknown = {}): Promise<Said> => {
  const res = await at(`/api/${op}`, {
    method: "POST",
    headers: { cookie: who, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return { status: res.status, body: await res.json() as Record<string, unknown> };
};

const ok = (said: Said): Record<string, unknown> => {
  expect(said.status, JSON.stringify(said.body)).toBe(200);
  return said.body;
};

const idOf = (said: Said): string => String(ok(said).id);

/** ⚠️ Two sites, and a shelf INSIDE the first — see the header. */
let north = "";
let southern = "";
let shelf = "";
let gloves = "";
let code = "";

const accept = async (cookie: string) => {
  for (const doc of Object.values(LEGAL.documents)) {
    await at("/api/me.accept", {
      method: "POST", headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ document: doc.id, version: doc.version }),
    });
  }
};

beforeAll(async () => {
  await at("/health");
  await settled();
  await addShard(directory(), "eu-1", "eu", 100);
  for (const id of Object.keys(APPS)) await noteShardApp(directory(), "eu-1", id);

  const made = await createTenant(directory(), {
    slug: SLUG, name: "Harbour Works", country: "DE", where: "eu", apps: ["inventory"],
  });
  if (typeof made === "string") throw new Error(made);
  tenantId = made.tenant.id;
  await compPlan(directory(), tenantId as never, MEMBERSHIP, "studio");

  const boss = await upsertAccount(directory(), "owner@example.com", null);
  await found(shard(), tenantId as never, boss as never, "owner@example.com",
    { inventory: "keeper" });
  await noteBelonging(directory(), boss as never, tenantId as never);
  owner = `one_session=${(await startSession(directory(), boss as never)).id}`;
  await accept(owner);

  /* ⚠️ A SECOND PERSON, INVITED THROUGH THE ROSTER'S OWN ROUTE and claimed the
     way an invitation is claimed — by signing in as the address it was sent to.
     A membership written by hand would skip the two doors that bound one, and
     this feature hangs a column off exactly that row. */
  handMember = idOf(await write("member.invite", owner, {
    email: "hand@example.com", platformRole: "staff", appRoles: { inventory: "keeper" },
  }));

  const them = await upsertAccount(directory(), "hand@example.com", null);
  await claimInvitations(shard(), them as never, "hand@example.com");
  await noteBelonging(directory(), them as never, tenantId as never);
  hand = `one_session=${(await startSession(directory(), them as never)).id}`;
  await accept(hand);

  /* Two sites, one shelf inside the first, one product, some stock on each. */
  north = idOf(await write("location.create", owner, { name: "Northgate", kind: "site" }));
  southern = idOf(await write("location.create", owner, { name: "Southern", kind: "site" }));
  shelf = idOf(await write("location.create", owner,
    { name: "Rack A", kind: "rack", within: north }));

  gloves = idOf(await write("product.create", owner,
    { name: "Nitrile gloves, M", unit: "box", tracking: "counted" }));
  code = String((ok(await write("product.label", owner, { ids: [gloves] }))
    .items as { code: string }[])[0]?.code);

  for (const place of [shelf, southern]) {
    ok(await write("stock.arrive", owner,
      { raw: code, location: place, quantity: 5, day: TODAY, year: 2026 }));
  }
});

/* ------------------------------------------------------------ before a grant --- */

describe("a workspace nobody has narrowed", () => {
  /*
    ⚠️ THE DEFAULT IS EVERYTHING, AND IT IS THE HALF THAT WOULD BREAK QUIETLY. A
    filter that applied before anybody was granted anything would empty every
    screen in every workspace with one site — which is almost all of them.
  */
  it("shows everybody every shelf", async () => {
    for (const who of [owner, hand]) {
      const said = ok(await read("stock.list", who));
      expect((said.items as unknown[]).length, JSON.stringify(said)).toBe(2);
    }
  });
});

/* ------------------------------------------------------------- after a grant --- */

describe("somebody who works at one site", () => {
  beforeAll(async () => {
    /* ⚠️ THE GRANT IS TO THE SITE, not to the rack under it. */
    ok(await write("member.reach", owner,
      { app: "inventory", id: handMember, places: [north] }));
  });

  it("reads the shelves inside their site and no others", async () => {
    const said = ok(await read("stock.list", hand));
    const rows = said.items as { location: string }[];
    expect(rows.map((r) => r.location)).toEqual([shelf]);
    /* ⚠️ AND THE TOTAL AGREES. "1 of 2" over a workspace showing one row is a
       number that sends somebody looking for stock they will never be shown. */
    expect(said.total).toBe(1);
  });

  it("leaves the owner reading all of it", async () => {
    expect((ok(await read("stock.list", owner)).items as unknown[]).length).toBe(2);
  });

  /*
    ⚠️ THE WRITE IS THE HALF A FILTERED LIST DOES NOT COVER. A screen that shows
    one site and a route that accepts a move at another is a product that looks
    narrowed and is not — which is the whole failure this stage exists to close.
  */
  it("is refused a movement at a site it does not work in", async () => {
    const no = await write("stock.arrive", hand,
      { raw: code, location: southern, quantity: 1, day: TODAY, year: 2026 });
    expect(no.status).toBe(403);
    expect((no.body as { problem: { code: string } }).problem.code)
      .toBe("platform.out_of_reach");
  });

  it("is allowed the same movement inside its own site", async () => {
    ok(await write("stock.arrive", hand,
      { raw: code, location: shelf, quantity: 1, day: TODAY, year: 2026 }));
  });

  /* ⚠️ AND A COUNT SESSION AT ANOTHER SITE IS REFUSED, which is the operation
     that would otherwise LOCK a shelf for the person who actually works there. */
  it("cannot open a count on another site's shelf", async () => {
    /* ⚠️ THE OWN-SHELF CASE FIRST, so a refusal from a mistyped route cannot
       pass as a refusal from the rule. */
    ok(await write("count.open", hand, { location: shelf, day: TODAY }));
    const no = await write("count.open", hand, { location: southern, day: TODAY });
    expect(no.status, JSON.stringify(no.body)).toBe(403);
    expect((no.body as { problem: { code: string } }).problem.code)
      .toBe("platform.out_of_reach");
  });

  /* ⚠️ A GENERATED READ OF ONE ROW ANSWERS `not_found` RATHER THAN `forbidden`,
     and the difference is deliberate: the id is another site's and saying so
     tells somebody which ids exist. The WRITE says `out_of_reach`, because there
     the person picked a place and can pick another. */
  it("cannot read one of another site's places by id", async () => {
    expect((await read("location.read", hand, { id: southern })).status).toBe(404);
    expect((await read("location.read", hand, { id: shelf })).status).toBe(200);
  });
});

/* -------------------------------------------------------------- handing out --- */

describe("who may narrow somebody", () => {
  /*
    ⚠️ A GRANT IS BOUNDED BY THE GRANTER'S OWN REACH. Without it, narrowing a
    colleague is how somebody kept out of a site lets themselves into it — one
    membership at a time, through a screen they are supposed to have.
  */
  it("refuses a place the granter does not work in", async () => {
    const no = await write("member.reach", hand,
      { app: "inventory", id: handMember, places: [north, southern] });
    expect(no.status).toBe(403);
  });

  /* ⚠️ AND CLEARING IT PUTS THEM BACK TO THE WHOLE WORKSPACE, which is the
     `null` an empty list must not be confused with. */
  it("widens back to everything when the grant is cleared", async () => {
    ok(await write("member.reach", owner, { app: "inventory", id: handMember, places: null }));
    expect((ok(await read("stock.list", hand)).items as unknown[]).length).toBe(2);
  });
});
