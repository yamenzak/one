/**
 * A STANDING TOP-UP — THE ONE THING IN THIS DEPLOYMENT THAT SPENDS SOMEBODY'S
 * MONEY WITHOUT THEM PRESENT.
 *
 * ⚠️ EVERY ASSERTION HERE IS ABOUT A CHARGE THAT SHOULD NOT HAPPEN. A top-up
 * that fails to fire costs a customer an hour; one that fires twice costs them
 * money and costs us the relationship, and neither the cooldown nor the
 * threshold has a symptom until a statement arrives.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { TenantId } from "@engine/kernel";
import { BILLING_SCHEMA, applySchema, type Db } from "../src/index.js";
import {
  armAutoTopUp, autoTopUpOf, dueForTopUp, noteTopUpAttempt, noteTopUpFailed,
  openAccount, reserve, topUp,
} from "../src/wallet.js";

const db = () => env.DIRECTORY as unknown as Db;
const TENANT = "ten_auto" as TenantId;
const NOW = new Date("2026-08-17T12:00:00.000Z");

const withCard = async () => {
  await db().prepare(`UPDATE billing_account SET customer_ref = 'cus_a' WHERE tenant_id = ?`)
    .bind(TENANT).run();
};

beforeEach(async () => {
  await applySchema(db(), [BILLING_SCHEMA]);
  await db().exec(`DELETE FROM billing_account;`);
  await db().exec(`DELETE FROM credit_ledger;`);
  await openAccount(db(), TENANT, "USD", NOW);
});

describe("buying more credits by itself", () => {
  /* ⚠️ NOTHING IS ARMED UNTIL SOMEBODY ARMS IT. A standing charge a product set
     on a customer's behalf is the shape of every subscription complaint. */
  it("is off until a person turns it on", async () => {
    expect(await autoTopUpOf(db(), TENANT)).toMatchObject({ packId: null, below: 0 });
    expect(await dueForTopUp(db(), NOW)).toEqual([]);
  });

  it("comes due when the balance falls under the line", async () => {
    await withCard();
    await armAutoTopUp(db(), TENANT, "p5", 500);
    await topUp(db(), TENANT, 400, "seed", {}, NOW);

    expect((await dueForTopUp(db(), NOW)).map((o) => o.packId)).toEqual(["p5"]);
  });

  it("is not due while there is still enough", async () => {
    await withCard();
    await armAutoTopUp(db(), TENANT, "p5", 500);
    await topUp(db(), TENANT, 900, "seed", {}, NOW);

    expect(await dueForTopUp(db(), NOW)).toEqual([]);
  });

  /*
    ⚠️ WHAT IS HELD IS ALREADY SPENT AS FAR AS THIS IS CONCERNED. A balance of
    900 with 800 held has 100 to spend, and a threshold read against the balance
    rather than the spendable would leave a workspace out of credits with a
    standing instruction that never fires.
  */
  it("reads what can be spent, not what is on the row", async () => {
    await withCard();
    await armAutoTopUp(db(), TENANT, "p5", 500);
    await topUp(db(), TENANT, 900, "seed", {}, NOW);
    const held = await reserve(db(), TENANT, 800, "x");
    if (held === "not_enough") throw new Error("reserve refused");

    expect((await dueForTopUp(db(), NOW)).map((o) => o.tenantId)).toEqual([TENANT]);
  });

  /*
    ⚠️ THE COOLDOWN IS THE WHOLE SAFETY. A workspace out of credits on a busy
    afternoon asks for a top-up on every refusal, so without this the card is
    charged as fast as the requests arrive and the first anybody knows is the
    statement.
  */
  it("attempts at most once an hour, however often it is asked", async () => {
    await withCard();
    await armAutoTopUp(db(), TENANT, "p5", 500);
    expect(await dueForTopUp(db(), NOW)).toHaveLength(1);

    await noteTopUpAttempt(db(), TENANT, NOW);
    expect(await dueForTopUp(db(), NOW)).toEqual([]);

    const later = new Date(NOW.getTime() + 61 * 60 * 1000);
    expect(await dueForTopUp(db(), later)).toHaveLength(1);
  });

  /*
    ⚠️ AND A WORKSPACE WITH NO CARD IS NOT DUE. Charging off-session needs one
    Stripe already holds; without it the attempt is a guaranteed refusal, filed
    as an error somebody has to read and cannot act on.
  */
  it("does not try to charge a workspace we have no card for", async () => {
    await armAutoTopUp(db(), TENANT, "p5", 500);
    expect(await dueForTopUp(db(), NOW)).toEqual([]);
  });

  /* ⚠️ Clearing the pack is the off switch, and it is never refused. */
  it("stops completely when the pack is cleared", async () => {
    await withCard();
    await armAutoTopUp(db(), TENANT, "p5", 500);
    await armAutoTopUp(db(), TENANT, null, 0);

    expect(await autoTopUpOf(db(), TENANT)).toMatchObject({ packId: null });
    expect(await dueForTopUp(db(), NOW)).toEqual([]);
  });

  /*
    ⚠️ A DECLINE IS AN ANSWER, AND THE CUSTOMER IS THE ONE WHO NEEDS IT. Nobody
    is present when a bank refuses an off-session charge, so this row is the only
    place somebody can learn that their credits stopped topping up.
  */
  it("keeps why the last attempt failed, where the customer reads it", async () => {
    await withCard();
    await armAutoTopUp(db(), TENANT, "p5", 500);
    await noteTopUpFailed(db(), TENANT, "Your bank did not approve the charge.");

    expect((await autoTopUpOf(db(), TENANT)).error)
      .toBe("Your bank did not approve the charge.");

    /* ⚠️ And re-arming clears it — a stale failure beside a working instruction
       is a customer chasing a problem that is already fixed. */
    await armAutoTopUp(db(), TENANT, "p5", 800);
    expect((await autoTopUpOf(db(), TENANT)).error).toBeNull();
  });
});
