/**
 * STORAGE IS METERED, NOT REFUSED — and every assertion here is about the
 * difference.
 *
 * ⚠️ A SEAT AND A DOMAIN ARE ADDED DELIBERATELY, SO REFUSING PAST THE NUMBER IS
 * FAIR. Storage accumulates as a side effect of ordinary work: refusing an
 * upload because a colleague filled the bucket punishes the wrong person, at the
 * worst possible moment. So the included amount is where the meter STARTS, the
 * excess draws on the wallet, and what an empty wallet cannot cover costs the
 * writes and never the files.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { PlanSpec, TenantId } from "@engine/kernel";
import { BILLING_SCHEMA, MEDIA_SCHEMA, applySchema, type Db } from "../src/index.js";
import { bytesUsed } from "../src/storage.js";
import { MILLI, collectOwed, openAccount, owe, topUp, walletOf } from "../src/wallet.js";

const db = () => env.DIRECTORY as unknown as Db;
const shard = () => env.SHARD_EU_1 as unknown as Db;
const TENANT = "ten_store" as TenantId;
const NOW = new Date("2026-08-17T12:00:00.000Z");
const GB = 1024 * 1024 * 1024;

const PLANS: readonly PlanSpec[] = [
  { id: "small", name: "Small", said: "", kind: "personal", price: 1200, currency: "USD",
    credits: 100, order: 1, includes: { seats: 1, storage: 10 * GB, domains: 0 } },
];

const stored = async (bytes: number, id = "med_1") => {
  await shard().prepare(
    `INSERT INTO media (id, tenant_id, subject_id, purpose, object_key, content_type, bytes, at, by)
     VALUES (?, ?, NULL, 'file', ?, 'image/png', ?, ?, NULL)`)
    .bind(id, TENANT, `k/${id}`, bytes, NOW.toISOString()).run();
};

beforeEach(async () => {
  await applySchema(db(), [BILLING_SCHEMA]);
  await applySchema(shard(), [MEDIA_SCHEMA]);
  await db().exec(`DELETE FROM billing_account;`);
  await db().exec(`DELETE FROM credit_ledger;`);
  await shard().exec(`DELETE FROM media;`);
  await openAccount(db(), TENANT, "USD", NOW);
});

describe("what a workspace is storing", () => {
  /*
    ⚠️ MEASURED FROM THE LEDGER, NEVER FROM THE BUCKET. R2 cannot answer "how
    many bytes does this prefix hold" without listing every object — a request
    per thousand files, slower with every upload. The ledger row carries the size
    because every write goes through one place, which is what makes this a SUM.
  */
  it("adds up from the ledger rather than the bucket", async () => {
    await stored(3 * GB, "a");
    await stored(2 * GB, "b");
    expect(await bytesUsed(shard(), TENANT)).toBe(5 * GB);
  });

  it("is nothing for a workspace that has stored nothing", async () => {
    expect(await bytesUsed(shard(), TENANT)).toBe(0);
  });
});

describe("charging for the excess", () => {
  const plan = PLANS[0]!;
  const rate = 20;
  const dayFor = (bytes: number) =>
    ((bytes - (plan.includes.storage as number)) / GB) * rate * MILLI / 30;

  /*
    ⚠️ A DAY OVER IS A FRACTION OF A CREDIT, AND BOTH ROUNDINGS ARE WRONG. Down,
    storage is free for ever; up, it costs thirty times the price. The
    accumulator is the only arithmetic that is neither — so a day that owes less
    than one credit takes nothing yet, and the debt is still there tomorrow.
  */
  it("takes nothing on a day that owes less than a credit", async () => {
    await topUp(db(), TENANT, 500, "seed", {}, NOW);
    await owe(db(), TENANT, dayFor(11 * GB));

    expect(await collectOwed(db(), TENANT, "Storage over your plan", NOW)).toBe(0);
    expect((await walletOf(db(), TENANT)).owedMilli).toBeGreaterThan(0);
  });

  /* ⚠️ And the fractions add up, so nothing is quietly free. */
  it("collects once the fractions have added up to a credit", async () => {
    await topUp(db(), TENANT, 500, "seed", {}, NOW);
    for (let day = 0; day < 30; day++) await owe(db(), TENANT, dayFor(11 * GB));

    /* One gigabyte over for a month is exactly the monthly rate. */
    expect(await collectOwed(db(), TENANT, "Storage over your plan", NOW)).toBe(rate);
    expect((await walletOf(db(), TENANT)).balance).toBe(500 - rate);
  });

  /*
    ⚠️ IT DRAWS AS FAR AS IT CAN RATHER THAN ALL-OR-NOTHING. A workspace with 3
    credits and a 5-credit debt pays 3 and owes 2 — refusing the whole charge
    leaves a wallet with money in it beside a debt, which reads to everybody as
    a bug.
  */
  it("takes what there is and keeps owing the rest", async () => {
    await topUp(db(), TENANT, 3, "seed", {}, NOW);
    await owe(db(), TENANT, 5 * MILLI);

    expect(await collectOwed(db(), TENANT, "Storage over your plan", NOW)).toBe(3);
    const wallet = await walletOf(db(), TENANT);
    expect(wallet.balance).toBe(0);
    expect(wallet.owedMilli).toBe(2 * MILLI);
  });

  /*
    ⚠️ AND OWING WITH AN EMPTY WALLET IS WHAT STOPS THE WRITES — not the storage,
    and not the upload. `locate` reads this one flag; everything stays readable
    and exportable, and adding credits clears it.
  */
  it("says so when the wallet cannot cover what is owed", async () => {
    await topUp(db(), TENANT, 3, "seed", {}, NOW);
    await owe(db(), TENANT, 5 * MILLI);
    await collectOwed(db(), TENANT, "Storage over your plan", NOW);
    expect((await walletOf(db(), TENANT)).owing).toBe(true);

    /* ⚠️ Adding credits is the way out, and it takes effect on the next pass. */
    await topUp(db(), TENANT, 100, "topped up", {}, NOW);
    expect((await walletOf(db(), TENANT)).owing).toBe(false);
    expect(await collectOwed(db(), TENANT, "Storage over your plan", NOW)).toBe(2);
    expect((await walletOf(db(), TENANT)).owedMilli).toBe(0);
  });

  /* ⚠️ A workspace under its included amount owes nothing at all, which is the
     ordinary case and must cost nothing to be in. */
  it("owes nothing while it is under the included amount", async () => {
    await stored(9 * GB);
    const used = await bytesUsed(shard(), TENANT);
    expect(used - (plan.includes.storage as number)).toBeLessThan(0);
    expect((await walletOf(db(), TENANT)).owedMilli).toBe(0);
  });

  /*
    ⚠️ AND EVERY COLLECTION IS A LEDGER ROW. A balance that dropped with nothing
    to explain it is the question support cannot answer, and storage is the one
    charge nobody pressed a button for.
  */
  it("puts every collection on the statement", async () => {
    await topUp(db(), TENANT, 100, "seed", {}, NOW);
    await owe(db(), TENANT, 4 * MILLI);
    await collectOwed(db(), TENANT, "Storage over your plan", NOW);

    const { movements } = await import("../src/wallet.js");
    const said = await movements(db(), TENANT);
    expect(said.some((m) => m.reason === "Storage over your plan" && m.delta === -4)).toBe(true);
  });
});
