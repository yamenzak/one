/**
 * WHERE A TENANT'S RECORDS GO, AND WHAT REFUSES A BAD ANSWER.
 *
 * ⚠️ EVERY FAILURE IN HERE IS SILENT IN PRODUCTION. A tenant placed where its
 * schema is missing does not error at placement — it errors on every request
 * afterwards, as "no such table", for one customer. A residency promise broken
 * by a move is not visible at all until somebody audits it.
 */

import { describe, expect, it } from "vitest";
import { appsOf, enabled, placeOn, refusePlacement, type Enablement, type Shard } from "../src/tenancy.js";
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

/* ------------------------------------------------------------ enablement --- */

describe("an app switched on for a tenant", () => {
  it("is live until it is disabled, and never deleted", () => {
    expect(enabled(on("hello"))).toBe(true);
    expect(enabled(on("hello", { disabledAt: AT }))).toBe(false);
  });

  /*
    ⚠️ A DISABLED APP STILL COUNTS TOWARDS WHAT A SHARD MUST CARRY. Its records
    are still there — nobody asked to be forgotten — so a move that dropped its
    schema would strand data that becomes reachable again the moment the product
    is switched back on, by then in a database that cannot read it.
  */
  it("counts a disabled app when deciding what a shard needs", () => {
    expect(appsOf([on("hello"), on("atlas", { disabledAt: AT })])).toEqual(["hello", "atlas"]);
  });

  it("counts each app once, however many rows say so", () => {
    expect(appsOf([on("hello"), on("hello")])).toEqual(["hello"]);
  });
});
