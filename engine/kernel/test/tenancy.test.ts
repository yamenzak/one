/**
 * WHERE A TENANT'S RECORDS GO, AND WHAT REFUSES A BAD ANSWER.
 *
 * ⚠️ EVERY FAILURE IN HERE IS SILENT IN PRODUCTION. A tenant placed where its
 * schema is missing does not error at placement — it errors on every request
 * afterwards, as "no such table", for one customer. A residency promise broken
 * by a move is not visible at all until somebody audits it.
 */

import { describe, expect, it } from "vitest";
import {
  HEADROOM, allowanceLeft, mayBecome, mayBrand, mayIsolate, placeOn, refuseCommercial,
  refusePlacement, shardsWanted, type Enablement, type Shard,
} from "../src/tenancy.js";
import type { AppId, Instant, TenantId } from "../src/primitives.js";

const AT = "2026-08-14T00:00:00.000Z" as Instant;

const shard = (over: Partial<Shard> = {}): Shard => ({
  id: "eu-1", where: "eu", apps: ["hello"], tenants: 10, ceiling: 100, ...over,
});

const on = (appId: AppId, over: Partial<Enablement> = {}): Enablement => ({
  tenantId: "t1" as TenantId, appId, at: AT, disabledAt: null, ...over,
});

/* ------------------------------------------------------------- placement --- */

describe("where a tenant's records may go", () => {
  it("accepts a shard that has the residency and the schemas", () => {
    expect(refusePlacement(shard(), { where: "eu", apps: ["hello"] })).toBe(null);
  });

  /*
    ⚠️ A SHARD'S SCHEMA IS THE UNION OF ITS TENANTS' APPS, so a tenant cannot
    land where its products' tables do not exist. Unrefused, this is not a
    placement bug — it is every request for that one customer answering "no such
    table", after a move that reported success.
  */
  it("refuses a shard whose schema does not cover the tenant's apps", () => {
    expect(refusePlacement(shard(), { where: "eu", apps: ["hello", "atlas"] })).toBe("schema_missing");
  });

  /*
    ⚠️ RESIDENCY IS A PROMISE, NOT A PREFERENCE (D6). It is a claim made to a
    business about where their customers' records sit, so a move that satisfied
    capacity and broke it would be a compliance failure reported as a success.
  */
  it("refuses a shard in the wrong place, whatever else is true of it", () => {
    expect(refusePlacement(shard({ where: "global", tenants: 0 }), { where: "eu", apps: ["hello"] }))
      .toBe("wrong_residency");
  });

  /*
    ⚠️ THE CEILING REFUSES AN ARRIVAL AND NEVER EVICTS A RESIDENT. A ceiling that
    forced a move would turn a capacity setting into an outage trigger at
    whatever hour it happened to be crossed.
  */
  it("stops accepting at the ceiling, and says nothing about who is already there", () => {
    expect(refusePlacement(shard({ tenants: 100 }), { where: "eu", apps: ["hello"] })).toBe("full");
    expect(refusePlacement(shard({ tenants: 99 }), { where: "eu", apps: ["hello"] })).toBe(null);
  });
});

describe("choosing between the shards there are", () => {
  /*
    ⚠️ THE EMPTIEST ELIGIBLE ONE, WHICH IS A CHOICE. Packing one shard before
    starting the next keeps the database count down and puts every new tenant —
    the ones most likely to still be evaluating us — on the busiest store we own.
  */
  it("spreads rather than packs", () => {
    const chosen = placeOn([shard({ id: "eu-1", tenants: 80 }), shard({ id: "eu-2", tenants: 3 })],
      { where: "eu", apps: ["hello"] });
    expect(chosen?.id).toBe("eu-2");
  });

  /* ⚠️ Null rather than a bad placement: nowhere to put somebody is an operator's
     problem to solve, and answering with an ineligible shard hides it. */
  it("answers with nothing rather than somewhere wrong", () => {
    expect(placeOn([shard({ where: "global" })], { where: "eu", apps: ["hello"] })).toBe(null);
    expect(placeOn([], { where: "eu", apps: ["hello"] })).toBe(null);
  });
});

/*
  ⚠️ ENABLEMENT IS ASKED OF THE STORE, NOT OF A PURE FUNCTION, and its two
  questions are `runtime/test/placement.test.ts`'s — what a workspace has ON, and
  what a shard must still be able to HOLD. They differ over a disabled product,
  which is exactly why neither may be re-derived here from a row.
*/

/* ------------------------------------------------------ personal or business --- */

/**
 * ⚠️ WHAT A WORKSPACE IS, NOT WHAT IT BOUGHT. A plan moves both ways every
 * month; this is who is trading, whose name is over the door, and whether its
 * records may sit on a database of their own. Every failure below is silent:
 * nothing throws when a personal workspace gets a brand, and nobody complains
 * when a business is quietly rolled back to personal — they simply find their
 * logo gone one morning with no event that removed it.
 */
describe("a workspace's kind", () => {
  const personal = { kind: "personal" as const };
  const commercial = { kind: "commercial" as const };
  const none = { granted: 0, used: 0 };

  it("is one way, and the other direction is refused rather than unimplemented", () => {
    expect(mayBecome("personal", "commercial")).toBe(true);
    /* ⚠️ THE ONE THAT MATTERS. Rolling back would withdraw a brand a business's
       own customers have seen and move records off a shard they were promised. */
    expect(mayBecome("commercial", "personal")).toBe(false);
    expect(mayBecome("commercial", "commercial")).toBe(false);
    expect(mayBecome("personal", "personal")).toBe(false);
  });

  it("decides branding and isolation, in one place rather than at each call site", () => {
    expect(mayBrand("commercial")).toBe(true);
    expect(mayBrand("personal")).toBe(false);
    expect(mayIsolate("commercial")).toBe(true);
    expect(mayIsolate("personal")).toBe(false);
  });

  /* ⚠️ EVERYTHING FREE TO FIX IS ASKED BEFORE ANYTHING THAT COSTS. Taking a
     payment and then refusing over an empty field is a refund and an apology. */
  it("asks for the legal name before it asks for money", () => {
    expect(refuseCommercial(personal, { legalName: "  ", paid: true, allowance: none }))
      .toBe("legal_name");
    expect(refuseCommercial(personal, { legalName: "Northwind GmbH", paid: false, allowance: none }))
      .toBe("unpaid");
    expect(refuseCommercial(personal, { legalName: "Northwind GmbH", paid: true, allowance: none }))
      .toBe(null);
  });

  /* ⚠️ AN ALLOWANCE IS AS GOOD AS A PAYMENT, and what comes out is identical: a
     comped business is still a business. */
  it("lets an operator's allowance stand in for the payment", () => {
    expect(refuseCommercial(personal,
      { legalName: "Northwind GmbH", paid: false, allowance: { granted: 2, used: 1 } })).toBe(null);
    expect(refuseCommercial(personal,
      { legalName: "Northwind GmbH", paid: false, allowance: { granted: 2, used: 2 } })).toBe("unpaid");
  });

  it("counts an allowance down and never below nothing", () => {
    expect(allowanceLeft({ granted: 3, used: 1 })).toBe(2);
    /* ⚠️ A grant lowered under what somebody has already spent is a negative
       number everywhere it is printed, and a `> 0` check that still passes. */
    expect(allowanceLeft({ granted: 1, used: 4 })).toBe(0);
  });

  it("has nothing to do for a workspace that is already one", () => {
    expect(refuseCommercial(commercial, { legalName: "X", paid: true, allowance: none }))
      .toBe("already");
  });
});

/* --------------------------------------------------------- a shard of its own --- */

/**
 * ⚠️ A DEDICATED SHARD IS A PROMISE IN BOTH DIRECTIONS, and both halves fail
 * silently. A stranger placed on one breaks the isolation somebody paid for and
 * nothing downstream notices, because both workspaces work perfectly; a
 * workspace that asked to be alone landing on a shared shard is the same broken
 * promise from the other end.
 */
describe("a shard somebody paid to have to themselves", () => {
  const mine = "ten_a" as TenantId;
  const theirs = "ten_b" as TenantId;

  it("takes nobody but the workspace it belongs to", () => {
    const alone = shard({ dedicatedTo: mine });
    expect(refusePlacement(alone, { where: "eu", apps: ["hello"], tenantId: theirs }))
      .toBe("someone_elses");
    expect(refusePlacement(alone, { where: "eu", apps: ["hello"], tenantId: mine })).toBe(null);
    /* ⚠️ And a placement checked in the abstract carries no tenant, so it is a
       stranger too — the safe reading of "we do not know who this is". */
    expect(refusePlacement(alone, { where: "eu", apps: ["hello"] })).toBe("someone_elses");
  });

  it("refuses a shared shard to a workspace that asked to be alone", () => {
    expect(refusePlacement(shard(), { where: "eu", apps: ["hello"], tenantId: mine, alone: true }))
      .toBe("shared");
  });

  it("is never chosen for anybody else, however empty it is", () => {
    const chosen = placeOn(
      [shard({ id: "dedicated", tenants: 0, dedicatedTo: theirs }), shard({ id: "shared", tenants: 40 })],
      { where: "eu", apps: ["hello"], tenantId: mine });
    /* ⚠️ The emptiest eligible shard — and the empty one is not eligible. */
    expect(chosen?.id).toBe("shared");
  });
});

/* ------------------------------------------------------------- headroom --- */

/*
  ⚠️ RUNNING OUT OF ROOM IS A CLOSED FRONT DOOR, and that is the failure this
  rule exists to prevent. `placeOn` returns null when every eligible shard is at
  its ceiling and `createTenant` refuses with `nowhere_to_put_it` — so the
  failure mode of SUCCESS is that nobody new can sign up, discovered by whoever
  tried to.
*/
describe("wanting the next shard before the last one fills", () => {
  const at = (over: Partial<Shard>): Shard => ({
    id: "eu-1", where: "eu", apps: ["hello" as never], tenants: 0, ceiling: 100, ...over,
  });

  it("wants nothing while there is room", () => {
    expect(shardsWanted([at({ tenants: 10 })], ["eu"])).toEqual([]);
  });

  /* ⚠️ BEFORE IT IS FULL, NOT WHEN IT IS. Creating, binding and rolling out a
     database takes minutes; a rule that reacted at a hundred percent would start
     building capacity at the moment there was none. */
  it("wants one once the last shard is inside the margin", () => {
    expect(shardsWanted([at({ tenants: 100 * (1 - HEADROOM) + 1 })], ["eu"]))
      .toEqual([{ id: "eu-2", where: "eu" }]);
  });

  /*
    ⚠️ A DEDICATED SHARD IS NOT CAPACITY. It belongs to one workspace and will
    never take another, so counting it as room is how a deployment concludes it
    has plenty while having none — and the more customers pay for isolation, the
    more confidently wrong the count gets.
  */
  it("does not count a dedicated shard as room", () => {
    const shards = [at({ tenants: 100 }), at({ id: "eu-2", tenants: 0, dedicatedTo: "t_x" as never })];
    expect(shardsWanted(shards, ["eu"])).toEqual([{ id: "eu-3", where: "eu" }]);
  });

  /* ⚠️ AND THE ORDINAL IS NEVER REUSED. A `SHARD_EU_2` that once existed and was
     drained is not a name to hand to a different database. */
  it("takes the next ordinal past every shard it has seen", () => {
    const shards = [at({ id: "eu-3", tenants: 100 }), at({ id: "eu-1", tenants: 100 })];
    expect(shardsWanted(shards, ["eu"])).toEqual([{ id: "eu-4", where: "eu" }]);
  });

  it("answers per jurisdiction, because a shard in one is no room in the other", () => {
    expect(shardsWanted([at({ tenants: 100 })], ["eu", "global"]))
      .toEqual([{ id: "eu-2", where: "eu" }, { id: "global-1", where: "global" }]);
  });
});
