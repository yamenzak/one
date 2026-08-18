/**
 * A COMPED WORKSPACE HAS NO INVOICE, SO IT NEEDS OUR OWN CLOCK.
 *
 * ⚠️ THIS IS THE HALF THAT WOULD HAVE BEEN FORGOTTEN, and it fails by going
 * quiet. `renewAllowance` is called from the ladder's `paid`, which only fires on
 * a Stripe event — so a plan an operator granted would get its credits once, on
 * the day of the comp, and never again. Nothing throws, nothing goes red, and a
 * month later the workspace simply stops being able to do the thing it was
 * comped for.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { PlanSpec, TenantId } from "@engine/kernel";
import { BILLING_SCHEMA, applySchema, type Db } from "../src/index.js";
import { MEMBERSHIP, compPlan, compedSubscriptions, subscribe } from "../src/billing.js";
import { dueForAllowance, openAccount, renewAllowance, walletOf } from "../src/wallet.js";

const db = () => env.DIRECTORY as unknown as Db;
const TENANT = "ten_comp" as TenantId;
const NOW = new Date("2026-08-17T12:00:00.000Z");
const later = (days: number) => new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);

const PLANS: readonly PlanSpec[] = [
  { id: "solo", name: "Solo", said: "", kind: "personal", price: 1200, currency: "USD",
    credits: 1500, order: 1, includes: { seats: 1, storage: 0, domains: 0 } },
];

beforeEach(async () => {
  await applySchema(db(), [BILLING_SCHEMA]);
  await db().exec(`DELETE FROM billing_account;`);
  await db().exec(`DELETE FROM credit_ledger;`);
  await db().exec(`DELETE FROM subscription;`);
  await openAccount(db(), TENANT, "USD", NOW);
});

describe("a plan an operator gave", () => {
  /* ⚠️ GIVEN AND BOUGHT LOOK IDENTICAL ON THE ROW, and only one of them has an
     invoice behind it — which is what decides who renews it. */
  it("is marked as given rather than bought", async () => {
    await compPlan(db(), TENANT, MEMBERSHIP, "solo", NOW);
    expect((await compedSubscriptions(db())).map((c) => c.tenantId)).toEqual([TENANT]);
  });

  /*
    ⚠️ AND A REAL PAYMENT CLEARS IT. A workspace that starts paying must stop
    being renewed by our clock as well as Stripe's, or it gets its allowance
    twice on two drifting days of the month.
  */
  it("stops being ours to renew the moment somebody pays", async () => {
    await compPlan(db(), TENANT, MEMBERSHIP, "solo", NOW);
    await subscribe(db(), TENANT, MEMBERSHIP, "solo", "active", NOW);
    expect(await compedSubscriptions(db())).toEqual([]);
  });

  /*
    ⚠️ THE PERIOD IS MEASURED FROM THE LAST GRANT, because there is no invoice to
    hang it off. Never granted is due — a comp made before this column existed
    must not wait a month for its first allowance.
  */
  it("is due immediately, then not again until the month is up", async () => {
    expect(await dueForAllowance(db(), TENANT, NOW)).toBe(true);

    await compPlan(db(), TENANT, MEMBERSHIP, "solo", NOW);
    await renewAllowance(db(), TENANT, PLANS, NOW);
    expect(await walletOf(db(), TENANT)).toMatchObject({ granted: 1500 });

    expect(await dueForAllowance(db(), TENANT, later(29))).toBe(false);
    expect(await dueForAllowance(db(), TENANT, later(31))).toBe(true);
  });

  /*
    ⚠️ AND THE SECOND MONTH ACTUALLY ARRIVES. This is the whole point: without a
    clock the comp grants once and stops, and the only symptom is a customer who
    quietly cannot work a month later.
  */
  it("grants again a month later, and sets rather than adds", async () => {
    await compPlan(db(), TENANT, MEMBERSHIP, "solo", NOW);
    await renewAllowance(db(), TENANT, PLANS, NOW);

    /* Some of it is spent. */
    await db().prepare(`UPDATE billing_account SET granted = 400 WHERE tenant_id = ?`)
      .bind(TENANT).run();

    await renewAllowance(db(), TENANT, PLANS, later(31));
    expect(await walletOf(db(), TENANT)).toMatchObject({ granted: 1500 });
  });
});

describe("an allowance an operator set", () => {
  /*
    ⚠️ THE OVERRIDE HAS TO REACH THE CLOCK, not just the screen. Honoured by
    `heldBy` and ignored by the renewal, it is a promise of credits that never
    arrive — and the two live in different files, which is exactly how that
    happens.
  */
  it("is what the renewal grants, not the plan's own number", async () => {
    await compPlan(db(), TENANT, MEMBERSHIP, "solo", NOW);
    await db().prepare(
      `UPDATE subscription SET adjustments_json = ? WHERE tenant_id = ? AND app_id = ?`)
      .bind(JSON.stringify({ credits: 40000 }), TENANT, MEMBERSHIP).run();

    expect(await renewAllowance(db(), TENANT, PLANS, NOW)).toBe(40000);
    expect(await walletOf(db(), TENANT)).toMatchObject({ granted: 40000 });
  });

  /* ⚠️ Cleared per key is back to the plan's own, never back to zero. */
  it("goes back to the plan's number when it is cleared", async () => {
    await compPlan(db(), TENANT, MEMBERSHIP, "solo", NOW);
    await db().prepare(
      `UPDATE subscription SET adjustments_json = '{}' WHERE tenant_id = ? AND app_id = ?`)
      .bind(TENANT, MEMBERSHIP).run();
    expect(await renewAllowance(db(), TENANT, PLANS, NOW)).toBe(1500);
  });

  /*
    ⚠️ AND ZERO IS A REAL ANSWER. An operator setting a workspace to no monthly
    allowance at all — a partner who buys packs instead — must not fall through
    to the plan's number, which is what a truthy check would do.
  */
  it("takes zero as an answer rather than as absent", async () => {
    await compPlan(db(), TENANT, MEMBERSHIP, "solo", NOW);
    await db().prepare(
      `UPDATE subscription SET adjustments_json = ? WHERE tenant_id = ? AND app_id = ?`)
      .bind(JSON.stringify({ credits: 0 }), TENANT, MEMBERSHIP).run();
    expect(await renewAllowance(db(), TENANT, PLANS, NOW)).toBe(0);
  });
});
