/**
 * THE PRICE LIST BECOMES EDITABLE, AND THE DECLARATION STAYS THE AUTHORITY.
 *
 * ⚠️ WHAT IS ASSERTED IS THE SPLIT. Which plans exist and which keys each one
 * prices are decided in code, where `refuseCatalog` fails the build over them; a
 * store that could add a plan or drop a key would move that to runtime, where the
 * same mistake is a deployment that has already been selling something
 * incoherent for a week.
 *
 * ⚠️ AND THE FAIL-SAFE, WHICH IS THE HALF NOBODY WOULD WRITE A TEST FOR. Every
 * gate on the deployment resolves against this list, so a row that stopped
 * merging into a valid catalogue must fall back to the declaration rather than
 * take the product down.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { EntitlementDef, PlanSpec, TenantId } from "@engine/kernel";
import { PLATFORM_ENTITLEMENTS } from "@engine/kernel";
import { BILLING_SCHEMA, applySchema, type Db } from "../src/index.js";
import { MEMBERSHIP, heldBy, subscribe, subscriptionFor } from "../src/billing.js";
import {
  CATALOGUE_SCHEMA, applyEdits, catalogueProblems, editPlan, effectivePlans, onEachPlan,
  planEdits, resetPlan,
} from "../src/catalogue.js";

const db = () => env.DIRECTORY as unknown as Db;
const OLD = "ten_cat_old" as TenantId;
const NOW = new Date("2026-08-17T12:00:00.000Z");
const OPERATOR = "sam@example.com";

const KEYS: Readonly<Record<string, EntitlementDef>> = {
  ...PLATFORM_ENTITLEMENTS,
  notes: { label: "Notes", withheld: "quota" },
};

const DECLARED: readonly PlanSpec[] = [
  {
    id: "none", name: "No plan", said: "", kind: "personal", parking: true,
    price: 0, currency: "USD", credits: 0, order: 0,
    includes: { seats: 1, storage: 1, domains: 0, notes: 0 },
  },
  {
    id: "solo", name: "Solo", said: "One person.", kind: "personal", trialDays: 14,
    price: 1200, currency: "USD", credits: 1500, order: 1,
    includes: { seats: 2, storage: 10, domains: 0, notes: -1 },
  },
];

const soloIn = (plans: readonly PlanSpec[]): PlanSpec =>
  plans.find((p) => p.id === "solo") as PlanSpec;

beforeEach(async () => {
  await applySchema(db(), [BILLING_SCHEMA, CATALOGUE_SCHEMA]);
  await db().exec(`DELETE FROM plan_edit;`);
  await db().exec(`DELETE FROM subscription;`);
});

describe("what an edit may move", () => {
  it("serves the declaration until somebody edits it", async () => {
    expect(await effectivePlans(db(), DECLARED, KEYS)).toEqual(DECLARED);
  });

  it("lays a price, an allowance and a limit over the declared plan", async () => {
    const out = await editPlan(db(), DECLARED, KEYS, "solo",
      { price: 1900, credits: 3000, includes: { seats: 5 } }, NOW, OPERATOR);
    expect(out).toMatchObject({ ok: true });

    const solo = soloIn(await effectivePlans(db(), DECLARED, KEYS));
    expect(solo.price).toBe(1900);
    expect(solo.credits).toBe(3000);
    expect(solo.includes.seats).toBe(5);
    /* ⚠️ AND EVERYTHING NOBODY EDITED IS STILL THE DECLARATION'S. A row holding a
       whole copy of the plan would go on serving last month's numbers for every
       untouched field, including the ones a later deploy changed on purpose. */
    expect(solo.includes.storage).toBe(10);
    expect(solo.name).toBe("Solo");
  });

  /*
    ⚠️ THE KEYS ARE THE APPS', AND AN EDIT CANNOT INVENT ONE. A catalogue that
    could would be selling something no gate reads — which is exactly the shape
    `sells_undeclared` refuses at build time, arriving through a form instead.
  */
  it("drops a key the declared plan does not include", () => {
    const solo = soloIn(applyEdits(DECLARED, [
      { planId: "solo", includes: { seats: 9, invented: 5 }, at: "", by: null },
    ]));
    expect(solo.includes.seats).toBe(9);
    expect(solo.includes.invented).toBeUndefined();
  });

  /* ⚠️ Zero is "no trial", which is a real answer and not an absent one. */
  it("can set a trial to zero", async () => {
    await editPlan(db(), DECLARED, KEYS, "solo", { trialDays: 0 }, NOW, OPERATOR);
    expect(soloIn(await effectivePlans(db(), DECLARED, KEYS)).trialDays).toBe(0);
  });

  it("refuses a plan the declaration does not have", async () => {
    expect(await editPlan(db(), DECLARED, KEYS, "enterprise", { price: 1 }, NOW, OPERATOR))
      .toEqual({ ok: false, unknown: true });
  });
});

describe("what an edit may not do", () => {
  /*
    ⚠️ THE BUILD'S CHECK, RUN AGAIN. A second and laxer check for the console is
    how a deployment ends up with a lobby that costs money — so this is
    `refuseCatalog` over the merged result, and the refusals are what the
    operator reads.
  */
  it("refuses an edit that puts a price on the lobby", async () => {
    const out = await editPlan(db(), DECLARED, KEYS, "none", { price: 500 }, NOW, OPERATOR);
    expect(out.ok).toBe(false);
    expect("problems" in out && out.problems.map((p) => p.why)).toContain("parking_costs_money");
  });

  /* ⚠️ NOT PAYING MUST NEVER BUY MORE THAN PAYING DOES. */
  it("refuses an edit that lifts the lobby above the cheapest paid tier", async () => {
    const out = await editPlan(db(), DECLARED, KEYS, "none",
      { includes: { seats: 50 } }, NOW, OPERATOR);
    expect(out.ok).toBe(false);
    expect("problems" in out && out.problems.map((p) => p.why)).toContain("parking_above_floor");
  });

  /* ⚠️ AND A REFUSED EDIT WRITES NOTHING. Half-applying it would leave the
     catalogue in the state the check exists to prevent. */
  it("writes nothing at all when it refuses", async () => {
    await editPlan(db(), DECLARED, KEYS, "none", { price: 500 }, NOW, OPERATOR);
    expect(await planEdits(db())).toEqual([]);
    expect(await effectivePlans(db(), DECLARED, KEYS)).toEqual(DECLARED);
  });
});

describe("holding what was sold", () => {
  beforeEach(async () => {
    await subscribe(db(), OLD, MEMBERSHIP, "solo", "active");
  });

  /*
    ⚠️ THE ORDER IS THE MECHANISM. The snapshot is taken from the numbers the edit
    is about to replace — afterwards they are gone and there is nothing left to
    snapshot, which is a mistake with no symptom because the write still succeeds.
  */
  it("holds everybody on the plan at what they had, and says how many", async () => {
    const out = await editPlan(db(), DECLARED, KEYS, "solo",
      { credits: 500, includes: { seats: 1 } }, NOW, OPERATOR);
    expect(out).toMatchObject({ ok: true, held: 1 });

    const sold = await effectivePlans(db(), DECLARED, KEYS);
    const held = await heldBy(db(), OLD, { plans: sold, keys: KEYS }, NOW as never, true);
    expect(held.entitlements.find((e) => e.key === "seats")?.value).toBe(2);
    expect(held.credits).toBe(1500);
  });

  /*
    ⚠️ AND THE SECOND EDIT COMPARES AGAINST THE FIRST, NOT AGAINST THE CODE.
    Comparing with the declaration would find the first cut a second time and miss
    the second cut entirely — so a tier narrowed in two steps would lose the step
    nobody re-derived.
  */
  it("compares a second edit with what was being sold, not with the declaration", async () => {
    await editPlan(db(), DECLARED, KEYS, "solo", { includes: { seats: 5 } }, NOW, OPERATOR);
    await editPlan(db(), DECLARED, KEYS, "solo", { includes: { seats: 3 } }, NOW, OPERATOR);
    expect((await subscriptionFor(db(), OLD, MEMBERSHIP))?.overrides.seats).toBe(5);
  });

  /* ⚠️ A REVERT IS STILL AN EDIT, so a declaration that moved down since makes
     the way back a cut — and it grandfathers like any other. */
  it("grandfathers on the way back to the declaration", async () => {
    await editPlan(db(), DECLARED, KEYS, "solo", { includes: { seats: 7 } }, NOW, OPERATOR);
    expect(await resetPlan(db(), DECLARED, "solo")).toBe(1);
    expect((await subscriptionFor(db(), OLD, MEMBERSHIP))?.overrides.seats).toBe(7);
    expect(await effectivePlans(db(), DECLARED, KEYS)).toEqual(DECLARED);
  });

  it("counts who is on each tier, for the person about to cut one", async () => {
    expect(await onEachPlan(db())).toMatchObject({ solo: 1 });
  });
});

describe("when a stored edit stops applying", () => {
  /*
    ⚠️ THE DECLARATION MOVES UNDERNEATH THESE ROWS. A key leaves an app, a plan is
    retired — and an edit written against last month's catalogue can stop merging
    into a valid one. Every gate on the deployment reads this list, so serving the
    broken result would be the whole product rather than one screen.
  */
  /*
    ⚠️ A DECLARATION THAT IS ITSELF SOUND, MERGING INTO ONE THAT IS NOT. The
    lobby and the floor both rise in a later deploy — a perfectly valid
    catalogue — and the stored edit, valid on the day it was typed, now leaves
    the paid tier below the lobby. Nobody did anything wrong and the merge is
    unsellable.
  */
  const moved = DECLARED.map((p) =>
    p.id === "none" ? { ...p, includes: { ...p.includes, seats: 4 } }
      : { ...p, includes: { ...p.includes, seats: 6 } });

  it("serves the declaration rather than a catalogue that would be refused", async () => {
    await editPlan(db(), DECLARED, KEYS, "solo", { includes: { seats: 3 } }, NOW, OPERATOR);
    expect(await effectivePlans(db(), DECLARED, KEYS)).not.toEqual(DECLARED);

    /* ⚠️ THE DECLARATION IT FALLS BACK TO IS SOUND, which is what makes falling
       back safe rather than merely different. */
    expect(await catalogueProblems(db(), DECLARED, KEYS)).toEqual([]);
    expect(await effectivePlans(db(), moved, KEYS)).toEqual(moved);
  });

  /* ⚠️ AND THE FALLBACK IS CORRECT AND INVISIBLE, WHICH IS THE PROBLEM IT
     CREATES — an operator sees the old numbers and no reason. */
  it("says why, so the silence is not the only answer", async () => {
    await editPlan(db(), DECLARED, KEYS, "solo", { includes: { seats: 3 } }, NOW, OPERATOR);

    expect((await catalogueProblems(db(), moved, KEYS)).map((p) => p.why))
      .toContain("parking_above_floor");
    /* ⚠️ And nothing to report when the edits apply cleanly. */
    expect(await catalogueProblems(db(), DECLARED, KEYS)).toEqual([]);
  });

  /* ⚠️ A DEPLOYMENT THAT NEVER APPLIED THE MODULE SELLS WHAT IT DECLARED, rather
     than answering every request with "no such table: plan_edit". */
  it("sells the declaration where the table does not exist", async () => {
    await db().exec(`DROP TABLE plan_edit;`);
    expect(await effectivePlans(db(), DECLARED, KEYS)).toEqual(DECLARED);
    await applySchema(db(), [CATALOGUE_SCHEMA]);
  });
});
