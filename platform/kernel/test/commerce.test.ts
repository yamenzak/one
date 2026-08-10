/**
 * THE TWO RAILS, PROVED SEPARATELY AND THEN AGAINST EACH OTHER.
 *
 * ⚠️ EVERY ASSERTION HERE IS ABOUT MONEY, which is why they are exhaustive
 * rather than representative. A resolution bug in either rail is silent by
 * construction: nothing throws, no test of the interface fails, and the symptom
 * is a workspace that got more than it paid for or a customer who lost something
 * they did. Both are found by a person, months later, and neither is cheap.
 */

import { describe, expect, it } from "vitest";
import {
  NO_OVERRIDES, UNLIMITED,
  balanceOf, catalogueOf, charsPerUnit, daysRemaining, explainCustomerFlags, explainEntitlements,
  extendBudget, floorPlan, gateFor, heldEntitlements, mayPurchase, packageContradictions,
  packProblems, parkingAboveFloor, planRun, refuseCatalogueEdit, resolveCustomerFlags, resolveEntitlements, reversal,
  snapshotDowngrade,
  DESTRUCTIVE_FLOOR_DAYS, ladderProblems, lapsedFor, runwayFor, rungFor, settle, withinQuota,
  type Allowance, type EntitlementDef, type FlagDef, type Instant, type PackageSpec, type PlanSpec,
} from "../src/index.js";

const OPEN = gateFor({ standing: "active", reason: "ok" });
const SHUT = gateFor({ standing: "blocked", reason: "arrears" });

const declared: Record<string, EntitlementDef> = {
  reports: { label: "Some capability", parked: false, enforcement: "gate" },
  seats: { label: "Some capability", parked: 1, enforcement: "quota" },
  chat: { label: "Some capability", parked: false, enforcement: { unenforced: "nothing sells it yet" } },
};

const starter: PlanSpec = {
  id: "starter", name: "Starter", price: { minor: 499, currency: "USD" }, period: "month", trialDays: 14,
  entitlements: { reports: true, seats: 3, chat: false },
};

const walk = (over: { plan?: PlanSpec | null; grandfathered?: Record<string, Allowance>; adjusted?: Record<string, Allowance | null>; gate?: typeof OPEN } = {}) =>
  explainEntitlements({
    declared,
    plan: over.plan === undefined ? starter : over.plan,
    overrides: { grandfathered: over.grandfathered ?? {}, adjusted: over.adjusted ?? {} },
    gate: over.gate ?? OPEN,
  });

/* ------------------------------------------------------- the tenant rail --- */

describe("what the workspace bought", () => {
  it("serves the parking value when there is no plan, and says so", () => {
    const r = walk({ plan: null });
    expect(r.seats).toEqual({ value: 1, from: "parked", planValue: 1 });
    expect(r.reports!.value).toBe(false);
  });

  it("takes the plan's value when there is one", () => {
    expect(walk().seats!.value).toBe(3);
    expect(walk().reports!.value).toBe(true);
  });

  /*
    ⚠️ THE TWO OVERRIDE STORES WANT OPPOSITE RULES, and sharing one write path is
    what made "give this workspace ten seats" a one-way door in a shipping
    product: the only way back discarded the grandfathering with it.
  */
  it("lets grandfathering raise but never lower", () => {
    expect(walk({ grandfathered: { seats: 10 } }).seats).toEqual({ value: 10, from: "grandfathered", planValue: 3 });
    expect(walk({ grandfathered: { seats: 1 } }).seats!.value).toBe(3);
    expect(walk({ grandfathered: { seats: 1 } }).seats!.from).toBe("plan");
  });

  it("treats unlimited as absorbing when grandfathering", () => {
    expect(walk({ grandfathered: { seats: UNLIMITED } }).seats!.value).toBe(UNLIMITED);
    expect(walk({ plan: { ...starter, entitlements: { ...starter.entitlements, seats: UNLIMITED } }, grandfathered: { seats: 3 } }).seats!.value).toBe(UNLIMITED);
  });

  it("lets an operator adjustment move a value in either direction, and clear", () => {
    expect(walk({ adjusted: { seats: 10 } }).seats).toEqual({ value: 10, from: "adjusted", planValue: 3 });
    expect(walk({ adjusted: { seats: 1 } }).seats!.value).toBe(1);
    expect(walk({ adjusted: { seats: null } }).seats!.value).toBe(3);
  });

  it("lets an adjustment lower something grandfathering raised", () => {
    expect(walk({ grandfathered: { seats: 10 }, adjusted: { seats: 2 } }).seats!.value).toBe(2);
  });

  /*
    ⚠️ THE CLAMP IS LAST AND MUST STAY LAST. Applied before the adjustment, an
    operator's support gesture becomes a way around the payment ladder.
  */
  it("floors everything when the product itself is withheld, whatever was adjusted", () => {
    const r = walk({ grandfathered: { seats: 99 }, adjusted: { seats: 50, reports: true }, gate: SHUT });
    expect(r.seats!.value).toBe(0);
    expect(r.reports!.value).toBe(false);
    expect(r.seats!.from).toBe("withheld");
  });

  it("projects to the plain answer without a second merge", () => {
    const input = { declared, plan: starter, overrides: NO_OVERRIDES, gate: OPEN };
    const explained = explainEntitlements(input);
    const resolved = resolveEntitlements(input);
    for (const [key, r] of Object.entries(explained)) expect(resolved[key]).toBe(r.value);
  });

  it("holds only what is worth something", () => {
    const held = heldEntitlements(resolveEntitlements({ declared, plan: starter, overrides: NO_OVERRIDES, gate: OPEN }));
    expect([...held].sort()).toEqual(["reports", "seats"]);
  });

  it("counts against a ceiling, with unlimited never full and a switch answering itself", () => {
    expect(withinQuota(3, 2)).toBe(true);
    expect(withinQuota(3, 3)).toBe(false);
    expect(withinQuota(UNLIMITED, 10_000)).toBe(true);
    expect(withinQuota(true, 10_000)).toBe(true);
    expect(withinQuota(false, 0)).toBe(false);
  });

  /*
    ⚠️ THIS HAS SHIPPED, IN A REAL PRODUCT: the parking state carried three seats
    against the entry plan's one, so the entry plan was a downgrade and never
    paying was the better deal.
  */
  it("refuses a parking state more generous than the cheapest plan", () => {
    expect(parkingAboveFloor(declared, [starter])).toEqual([]);
    expect(parkingAboveFloor({ ...declared, seats: { label: "Some capability", parked: 5, enforcement: "quota" } }, [starter])).toEqual(["seats"]);
    expect(parkingAboveFloor({ ...declared, reports: { label: "Some capability", parked: true, enforcement: "gate" } }, [starter])).toEqual([]);
  });

  it("compares against the CHEAPEST plan, not the first declared", () => {
    const pro: PlanSpec = { ...starter, id: "pro", price: { minor: 2900, currency: "USD" }, entitlements: { ...starter.entitlements, seats: 20 } };
    expect(parkingAboveFloor({ ...declared, seats: { label: "Some capability", parked: 10, enforcement: "quota" } }, [pro, starter])).toEqual(["seats"]);
  });

  /*
    ⚠️ AND THE OTHER HALF OF THE SAME RULE, which is the one that had no test.
    The parking state sits below the entry plan on purpose — fair only where
    paying is possible. With no payment provider there is no plan to buy, so
    holding a workspace at the parking floor punishes it for OUR missing
    configuration and there is no way out at all. `standingFor` already stands
    down in exactly that case; without this the gate opens onto a product that
    permits one of everything.
  */
  it("serves the cheapest plan where nothing can be bought", () => {
    const pro: PlanSpec = { ...starter, id: "pro", price: { minor: 2900, currency: "USD" }, entitlements: { ...starter.entitlements, seats: 20 } };
    expect(floorPlan([pro, starter])!.id).toBe("starter");
    expect(floorPlan([])).toBeNull();

    const r = explainEntitlements({
      declared, plan: null, overrides: NO_OVERRIDES, gate: OPEN, floorPlan: floorPlan([pro, starter]),
    });
    /* ⚠️ Its own source. "plan" would claim they are on one they never bought. */
    expect(r.seats).toEqual({ value: 3, from: "floor", planValue: 3 });
    expect(r.reports!.value).toBe(true);
  });

  /*
    ⚠️ A REAL PLAN ALWAYS WINS, so a deployment that starts charging does not
    quietly re-price everybody who had already bought something.
  */
  it("never displaces a plan the workspace actually has", () => {
    const pro: PlanSpec = { ...starter, id: "pro", price: { minor: 2900, currency: "USD" }, entitlements: { ...starter.entitlements, seats: 20 } };
    const r = explainEntitlements({ declared, plan: pro, overrides: NO_OVERRIDES, gate: OPEN, floorPlan: starter });
    expect(r.seats).toEqual({ value: 20, from: "plan", planValue: 20 });
  });

  /* The clamp is still last: being unable to charge is not a way past the ladder. */
  it("is still withheld when the workspace is blocked", () => {
    const r = explainEntitlements({ declared, plan: null, overrides: NO_OVERRIDES, gate: SHUT, floorPlan: starter });
    expect(r.seats).toEqual({ value: 0, from: "withheld", planValue: 3 });
  });
});

/* ----------------------------------------------------- the customer rail --- */

const flags: Record<string, FlagDef> = {
  bodyReport: { label: "Some capability", parked: false, enforcement: "shape", scope: "body" },
  plans: { label: "Some capability", parked: false, enforcement: "gate", scope: "training", requires: "reports" },
  breakdown: { label: "Some capability", parked: true, enforcement: { derived: "from their own entries" } },
};

const pkg: PackageSpec = {
  id: "full", name: "Full", price: { minor: 9900, currency: "USD" },
  flags: { bodyReport: true, plans: true },
  budgets: { body: 30, training: 30 },
  oncePerCustomer: false,
};

const NOW = "2026-01-10T00:00:00.000Z" as Instant;
const stocked = runwayFor({ body: "2026-02-09T00:00:00.000Z" as Instant, training: "2026-02-09T00:00:00.000Z" as Instant }, NOW);

const customer = (over: Partial<Parameters<typeof explainCustomerFlags>[0]> = {}) =>
  explainCustomerFlags({
    declared: flags, pkg, snapshot: {}, overrides: {},
    runway: stocked, tenantHolds: new Set(["reports"]),
    ...over,
  });

describe("what the customer bought", () => {
  it("takes the package's value over the parked one", () => {
    expect(customer().bodyReport).toEqual({ value: true, from: "package" });
    expect(customer({ pkg: null }).bodyReport!.value).toBe(false);
  });

  /*
    ⚠️ ONLY ONE OF THE FOUR LAYERS IS A DIFF, and the difference is load-bearing.
    A snapshot masks later package edits on purpose; an override is sparse so
    `null` can mean "back to the package".
  */
  it("lets a snapshot mask a later package edit", () => {
    const edited = { ...pkg, flags: { ...pkg.flags, bodyReport: false } };
    expect(customer({ pkg: edited }).bodyReport!.value).toBe(false);
    expect(customer({ pkg: edited, snapshot: { bodyReport: true } }).bodyReport).toEqual({ value: true, from: "snapshot" });
  });

  it("lets an override set a value and lets null return it to the package", () => {
    expect(customer({ overrides: { bodyReport: false } }).bodyReport).toEqual({ value: false, from: "override" });
    expect(customer({ overrides: { bodyReport: null } }).bodyReport!.from).toBe("package");
  });

  it("refuses a lapsed scope whatever the override says, and names the scope", () => {
    const dry = runwayFor({ body: "2026-01-01T00:00:00.000Z" as Instant, training: "2026-02-09T00:00:00.000Z" as Instant }, NOW);
    expect(customer({ runway: dry, overrides: { bodyReport: true } }).bodyReport)
      .toEqual({ value: false, from: "lapsed", blockedBy: "body" });
  });

  /*
    ⚠️ THE INTERSECTION IS WHAT STOPS A WORKSPACE SELLING WHAT IT DID NOT BUY,
    and it names the entitlement rather than assuming a shared key.
  */
  it("refuses what the workspace itself does not hold", () => {
    expect(customer({ tenantHolds: new Set() }).plans).toEqual({ value: false, from: "not_sold", blockedBy: "reports" });
    expect(customer({ tenantHolds: new Set() }).bodyReport!.value).toBe(true);
  });

  it("projects to the plain answer without a second merge", () => {
    const explained = customer();
    const resolved = resolveCustomerFlags({ declared: flags, pkg, snapshot: {}, overrides: {}, runway: stocked, tenantHolds: new Set(["reports"]) });
    for (const [key, r] of Object.entries(explained)) expect(resolved.has(key)).toBe(r.value);
  });
});

/* ---------------------------------------------------------------- budgets --- */

describe("days of access", () => {
  /*
    ⚠️ DAYS QUEUE. Extending from now throws away what was paid for; summing the
    remainders drifts on every boundary.
  */
  it("extends from the later of now and the current expiry", () => {
    const running = "2026-02-09T00:00:00.000Z" as Instant;
    expect(extendBudget(running, NOW, 30)).toBe("2026-03-11T00:00:00.000Z");
    expect(extendBudget(null, NOW, 30)).toBe("2026-02-09T00:00:00.000Z");
    expect(extendBudget("2025-12-01T00:00:00.000Z" as Instant, NOW, 30)).toBe("2026-02-09T00:00:00.000Z");
  });

  it("floors a spent budget at zero rather than counting backwards", () => {
    expect(daysRemaining("2026-01-01T00:00:00.000Z" as Instant, NOW)).toBe(0);
    expect(daysRemaining("2026-01-20T00:00:00.000Z" as Instant, NOW)).toBe(10);
  });

  /*
    ⚠️ THE HEADLINE NUMBER IS A MAXIMUM AND IS A LIE ON ITS OWN — sixty days of
    one thing and none of another reads as sixty days covered.
  */
  it("reports the maximum and the breakdown that corrects it", () => {
    const r = runwayFor({ body: "2026-01-01T00:00:00.000Z" as Instant, training: "2026-03-11T00:00:00.000Z" as Instant }, NOW);
    expect(r.overall).toBe(60);
    expect(r.byScope).toEqual({ body: 0, training: 60 });

    /*
      ⚠️ TWO LIVE SCOPES, because one live and one spent cannot tell a maximum
      from a sum — they agree whenever the other term is zero, which is exactly
      the case the first assertion here covers. A mutation to `reduce` survived
      until this line existed.
    */
    const both = runwayFor({ body: "2026-01-20T00:00:00.000Z" as Instant, training: "2026-03-11T00:00:00.000Z" as Instant }, NOW);
    expect(both.overall).toBe(60);
    expect(both.byScope).toEqual({ body: 10, training: 60 });
  });

  it("answers a repeat purchase from the grant ledger, not the open row", () => {
    const once = { ...pkg, oncePerCustomer: true };
    expect(mayPurchase(once, [])).toEqual({ allowed: true });
    expect(mayPurchase(once, ["full"])).toEqual({ allowed: false, refusal: "already_purchased" });
    expect(mayPurchase(pkg, ["full", "full"])).toEqual({ allowed: true });
  });

  it("reports both directions a package can contradict itself, and refuses neither", () => {
    const noDays = packageContradictions({ ...pkg, budgets: { training: 30 } }, flags);
    expect(noDays).toEqual([{ kind: "flag_without_days", subject: "bodyReport", explanation: expect.stringContaining("body") }]);

    const noFlag = packageContradictions({ ...pkg, flags: { bodyReport: true } }, flags);
    expect(noFlag.map((c) => c.subject)).toEqual(["training"]);
    expect(packageContradictions(pkg, flags)).toEqual([]);
  });
});

/* ---------------------------------------------------------------- meter --- */

describe("what happens after access runs out", () => {
  /*
    ⚠️ THE FURTHEST RUNG, NOT THE FIRST ONE CROSSED. A sweep that missed a week
    must land somebody where they should be today rather than walking them
    through every rung it skipped — which for the destructive pair would mean
    archiving somebody on the way to deleting them, in one run.
  */
  const ladder = { readOnlyAfter: 3, blockedAfter: 10, archiveAfter: 30, deleteAfter: 90 };

  it("reports where somebody has actually got to", () => {
    expect(rungFor(0, ladder)).toBe("none");
    expect(rungFor(2, ladder)).toBe("none");
    expect(rungFor(3, ladder)).toBe("read_only");
    expect(rungFor(29, ladder)).toBe("blocked");
    expect(rungFor(200, ladder)).toBe("delete");
  });

  it("never reaches a rung the workspace did not set", () => {
    expect(rungFor(1_000, { readOnlyAfter: 7 })).toBe("read_only");
    expect(rungFor(1_000, {})).toBe("none");
  });

  /*
    ⚠️ THE DESTRUCTIVE PAIR CARRIES A FLOOR, AND IT IS REFUSED RATHER THAN
    CLAMPED. Archiving somebody a fortnight after a payment slipped is a support
    incident with no undo — a card expires, somebody is on holiday, an invoice
    sits in a spam folder — and quietly doing something gentler than what an
    operator typed leaves a settings screen showing a number nothing uses.
  */
  it("refuses to archive or delete sooner than the floor", () => {
    expect(ladderProblems({ archiveAfter: DESTRUCTIVE_FLOOR_DAYS })).toEqual([]);
    expect(ladderProblems({ archiveAfter: DESTRUCTIVE_FLOOR_DAYS - 1 })).toHaveLength(1);
    expect(ladderProblems({ deleteAfter: 1 })).toHaveLength(1);
    /* ⚠️ And the gentle rungs have no floor: read-only on day one is a choice. */
    expect(ladderProblems({ readOnlyAfter: 0, blockedAfter: 1 })).toEqual([]);
  });

  /* ⚠️ A ladder that goes backwards is not a ladder — the skipped rung reads on
     a settings screen as a step somebody configured and gets, and is neither. */
  it("refuses a rung that comes before the one above it", () => {
    expect(ladderProblems({ archiveAfter: 90, deleteAfter: 30 })).toHaveLength(1);
    expect(ladderProblems({ readOnlyAfter: 10, blockedAfter: 3 })).toHaveLength(1);
  });

  /*
    ⚠️ LAPSED IS MEASURED FROM THE LATEST EXPIRY. Taking the earliest starts the
    clock on somebody who is still paying for something else — and the rungs at
    the end of this are archive and delete.
  */
  it("counts from the last thing to run out, not the first", () => {
    const now = "2026-03-01T00:00:00.000Z" as Instant;
    expect(lapsedFor({ coaching: "2026-02-01T00:00:00.000Z" as Instant, food: "2026-02-24T00:00:00.000Z" as Instant }, now)).toBe(5);
  });

  /*
    ⚠️ AND SOMEBODY WHO HOLDS NOTHING HAS NOT LAPSED. Null rather than zero: a
    customer who never bought anything would otherwise be at the bottom of the
    ladder on day one, and a workspace that switched the ladder on would archive
    every record it had ever created.
  */
  it("says nothing at all about somebody who never held anything", () => {
    expect(lapsedFor({}, "2026-03-01T00:00:00.000Z" as Instant)).toBeNull();
  });

  it("says nothing about somebody whose access is still running", () => {
    expect(lapsedFor({ coaching: "2026-04-01T00:00:00.000Z" as Instant }, "2026-03-01T00:00:00.000Z" as Instant)).toBeNull();
  });
});

describe("metering", () => {
  /*
    ⚠️ THE DEFECT WAS A SHAPE, NOT AN ARITHMETIC SLIP: two functions, one
    producing the text and one producing the reserve, and a caller free to hand a
    different text to each.
  */
  it("returns the text and the reserve it implies from one call", () => {
    const run = planRun({ system: "s".repeat(400), prompt: "p".repeat(400), maxOutput: 1000, thinking: false, rate: { input: 1, output: 1 } });
    expect(run.system).toBe("s".repeat(400));
    expect(run.reserve).toBe(200 + 1000);
  });

  it("budgets what the request ASKS FOR, widened for a model that reasons first", () => {
    const base = { system: "", prompt: "", maxOutput: 1000, rate: { input: 1, output: 1 } };
    expect(planRun({ ...base, thinking: false }).reserve).toBe(1000);
    expect(planRun({ ...base, thinking: true }).reserve).toBe(1500);
  });

  /*
    ⚠️ FOUR CHARACTERS PER UNIT IS THE ENGLISH ANSWER. A fixed constant halves
    the reserve for a workspace operating in a denser script — a systematic
    under-charge on exactly the customers it was never measured against.
  */
  it("measures a denser script as denser", () => {
    expect(charsPerUnit("hello there, this is ordinary english")).toBe(4);
    expect(charsPerUnit("مرحبا بك في هذا النص العربي الطويل جدا")).toBe(2);
    const latin = planRun({ system: "a".repeat(100), prompt: "", maxOutput: 0, thinking: false, rate: { input: 1, output: 1 } });
    const dense = planRun({ system: "ا".repeat(100), prompt: "", maxOutput: 0, thinking: false, rate: { input: 1, output: 1 } });
    expect(dense.reserve).toBeGreaterThan(latin.reserve);
  });

  it("caps the charge at what was held", () => {
    expect(settle(100, 40)).toBe(40);
    expect(settle(100, 400)).toBe(100);
    expect(settle(100, -5)).toBe(0);
  });

  /*
    ⚠️ A MISSING REPORT SETTLES AT THE RESERVE. Recounting the text that came
    back can only ever be low, because the cap already catches the other
    direction — so every unreported call would become a discount.
  */
  it("settles an unreported call at the reserve, never at a recount", () => {
    expect(settle(100, null)).toBe(100);
  });

  it("sums a balance rather than storing one", () => {
    expect(balanceOf([{ delta: 100, reason: "bought" }, { delta: -30, reason: "used" }])).toBe(70);
    expect(balanceOf([])).toBe(0);
  });

  /*
    ⚠️ THE PROVIDER REPORTS A CUMULATIVE FIGURE. Reversing the reported amount
    each time reverses the first refund again on the second.
  */
  it("reverses proportionally, incrementally, and never past what was granted", () => {
    expect(reversal({ granted: 1000, paidMinor: 1000, refundedMinorTotal: 250, alreadyReversed: 0 })).toBe(250);
    expect(reversal({ granted: 1000, paidMinor: 1000, refundedMinorTotal: 600, alreadyReversed: 250 })).toBe(350);
    expect(reversal({ granted: 1000, paidMinor: 1000, refundedMinorTotal: 1000, alreadyReversed: 1000 })).toBe(0);
    expect(reversal({ granted: 1000, paidMinor: 1000, refundedMinorTotal: 2000, alreadyReversed: 0 })).toBe(1000);
    expect(reversal({ granted: 1000, paidMinor: 0, refundedMinorTotal: 500, alreadyReversed: 0 })).toBe(0);
  });
});


/* ------------------------------------------------------- editing a plan --- */

/**
 * ⚠️ A CATALOGUE IS EDITABLE BECAUSE A MANIFEST IS A DEPLOY AND A PRICE IS NOT —
 * the same argument as a model's rate, one rail over.
 *
 * ⚠️ AND THE SNAPSHOT IS WHAT MAKES IT SAFE. `grandfathered_json` has been read
 * by the resolver since the beginning and written by nothing, because until an
 * operator could edit a plan there was nothing to protect anybody from. A
 * workspace bought three seats; the plan becomes two — for good reasons, about
 * what is sold from now on — and without a snapshot that workspace loses a seat
 * it paid for, mid-period, with no notice. The symptom is a colleague who cannot
 * sign in and a support conversation nobody can explain, because the plan says
 * two and appears always to have.
 */
describe("editing what a deployment sells", () => {
  const plans: PlanSpec[] = [
    { id: "solo", name: "Solo", price: { minor: 499, currency: "usd" }, period: "month", trialDays: 14,
      entitlements: { clients: 3, seats: 1, training: true } },
  ];
  const keys: Record<string, EntitlementDef> = {
    clients: { label: "Clients", parked: 1, enforcement: "quota" },
    seats: { label: "Staff", parked: 1, enforcement: "quota" },
    training: { label: "Training", parked: false, enforcement: "gate" },
  };

  it("leaves a plan nobody edited exactly as declared", () => {
    expect(catalogueOf(plans, {})).toEqual(plans);
  });

  it("applies a price without touching the ceilings", () => {
    const out = catalogueOf(plans, { solo: { price: { minor: 900, currency: "usd" } } })[0]!;
    expect(out.price.minor).toBe(900);
    expect(out.entitlements).toEqual({ clients: 3, seats: 1, training: true });
  });

  /* ⚠️ Sparse. An edit that had to restate the whole plan silently resets the
     parts nobody meant to touch. */
  it("merges one ceiling and keeps the rest", () => {
    const out = catalogueOf(plans, { solo: { entitlements: { clients: 10 } } })[0]!;
    expect(out.entitlements).toEqual({ clients: 10, seats: 1, training: true });
  });

  it("refuses an entitlement key the app never declared", () => {
    expect(refuseCatalogueEdit(plans, keys, "solo", { entitlements: { invented: 5 } })).toBe("unknown_key");
  });

  /*
    ⚠️ THE KIND HAS TO MATCH WHAT THE GATE READS. A quota given `true` is a
    ceiling every count compares against a boolean; a gate given `3` is a feature
    that is on because three is truthy. Both "work" until somebody looks at a
    number.
  */
  it("refuses a quota set to a switch, and a switch set to a number", () => {
    expect(refuseCatalogueEdit(plans, keys, "solo", { entitlements: { clients: true } })).toBe("kind");
    expect(refuseCatalogueEdit(plans, keys, "solo", { entitlements: { training: 3 } })).toBe("kind");
  });

  it("refuses a negative price and a negative trial", () => {
    expect(refuseCatalogueEdit(plans, keys, "solo", { price: { minor: -1, currency: "usd" } })).toBe("negative_price");
    expect(refuseCatalogueEdit(plans, keys, "solo", { trialDays: -1 })).toBe("negative_trial");
  });

  it("refuses a plan that does not exist", () => {
    expect(refuseCatalogueEdit(plans, keys, "nope", { trialDays: 0 })).toBe("unknown_plan");
  });

  it("accepts an ordinary edit", () => {
    expect(refuseCatalogueEdit(plans, keys, "solo", { price: { minor: 900, currency: "usd" }, entitlements: { clients: 10 } })).toBeNull();
  });
});

describe("holding an existing subscriber at what they were sold", () => {
  const before = { clients: 3, seats: 2, training: true };

  it("records what a reduction takes away", () => {
    expect(snapshotDowngrade(before, { ...before, seats: 1 }, {})).toEqual({ seats: 2 });
  });

  /* ⚠️ Raising needs no snapshot: the new value is better and resolution already
     prefers the higher of the two, so writing one freezes a workspace out of
     every future improvement. */
  it("records nothing when a plan gets better", () => {
    expect(snapshotDowngrade(before, { ...before, clients: 10 }, {})).toEqual({});
  });

  it("records a capability withdrawn", () => {
    expect(snapshotDowngrade(before, { ...before, training: false }, {})).toEqual({ training: true });
  });

  it("says nothing about a capability that was already off", () => {
    expect(snapshotDowngrade({ training: false }, { training: false }, {})).toEqual({});
  });

  /*
    ⚠️ IT RATCHETS UP ONLY. A snapshot merged downward would be the edit it
    exists to protect against, applied by the protection itself — so a second
    reduction cannot lower a workspace already held at the first.
  */
  it("keeps the higher of what is already held", () => {
    const held = { seats: 5 };
    expect(snapshotDowngrade(before, { ...before, seats: 1 }, held)).toEqual({ seats: 5 });
  });

  /*
    ⚠️ `UNLIMITED` IS THE TOP, NOT A SMALL NUMBER. Stored as -1, an arithmetic
    comparison reads it as lower than one — so "you had unlimited and now have
    five" records nothing at all, silently, for exactly the workspaces with the
    most to lose.
  */
  it("treats unlimited as the highest value there is", () => {
    expect(snapshotDowngrade({ clients: UNLIMITED }, { clients: 5 }, {})).toEqual({ clients: UNLIMITED });
    expect(snapshotDowngrade({ clients: 5 }, { clients: UNLIMITED }, {})).toEqual({});
    expect(snapshotDowngrade({ clients: UNLIMITED }, { clients: 5 }, { clients: 9 })).toEqual({ clients: UNLIMITED });
  });

  it("ignores a key the new plan does not mention at all", () => {
    expect(snapshotDowngrade(before, { clients: 3 }, {})).toEqual({});
  });

  /* ⚠️ And the snapshot is what the resolver then honours — the two halves have
     to meet, or the write is a column nobody reads. */
  it("is honoured by the resolution walk", () => {
    const held = snapshotDowngrade(before, { ...before, seats: 1 }, {});
    const out = explainEntitlements({
      declared: { seats: { label: "Staff", parked: 1, enforcement: "quota" } },
      plan: { id: "solo", name: "Solo", price: { minor: 499, currency: "usd" }, period: "month", trialDays: 0, entitlements: { seats: 1 } },
      overrides: { grandfathered: held, adjusted: {} },
      gate: { reads: true, writes: true, app: true },
    });
    expect(out.seats).toMatchObject({ value: 2, from: "grandfathered", planValue: 1 });
  });
});

/* ------------------------------------------------------------ credit packs --- */

/**
 * ⚠️ EVERY ONE OF THESE IS A PACK SOMEBODY COULD BUY AND GET NOTHING FROM, and
 * none of them throws: the purchase succeeds and the balance does not move,
 * which is the worst shape a money bug can take.
 */
describe("what a workspace may buy to top up", () => {
  it("refuses a pack that grants nothing or costs nothing", () => {
    expect(packProblems([{ id: "a", name: "A", price: { minor: 900, currency: "USD" }, credits: 0 }])
      .map((p) => p.why).join()).toMatch(/no credits/);
    expect(packProblems([{ id: "b", name: "B", price: { minor: 0, currency: "USD" }, credits: 10 }])
      .map((p) => p.why).join()).toMatch(/costs nothing/);
  });

  it("refuses two packs sharing an id", () => {
    const twice = { id: "a", name: "A", price: { minor: 900, currency: "USD" as const }, credits: 10 };
    expect(packProblems([twice, twice]).map((p) => p.why).join()).toMatch(/declared twice/);
  });

  it("says nothing about a sound one", () => {
    expect(packProblems([{ id: "a", name: "A", price: { minor: 900, currency: "USD" }, credits: 10_000 }])).toEqual([]);
  });
});
