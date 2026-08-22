/**
 * A WORKSPACE ENABLES A SECOND PRODUCT AND IS BILLED ONCE.
 *
 * ⚠️ THIS IS STAGE 6'S EXIT CRITERION AND IT IS THE PRODUCT ARGUMENT THE WHOLE
 * INVERSION IS FOR (D1). A business with two of our products has one customer
 * record, one balance and one invoice with two lines — not two workspaces, two
 * cards and two renewal dates arriving on two different days. The previous
 * platform could not express it: a subscription belonged to a product, so a
 * customer of two products was two customers.
 *
 * ⚠️ AND THE LADDER IS HALF OF IT. What arrears take away is the ability to
 * change things, never the ability to read them, and never the ability to leave.
 */

import { MILLI } from "@engine/kernel";
import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AppSpec, Instant, PlanSpec, TenantId } from "@engine/kernel";
import { LADDER, PLATFORM_ENTITLEMENTS, refuseLadder, standingFor } from "@engine/kernel";
import {
  DIRECTORY_MODULES, SHARD_MODULES,
  BILLING_SCHEMA, DIRECTORY_SCHEMA, IDENTITY_SCHEMA, JOBS_SCHEMA, MEMBERSHIP_SCHEMA,
  MEMBERSHIP,
  addShard, adjust, applySchema, billFor, createTenant, grandfather, heldBy,
  markPaid, markPastDue, noteShardApp, openAccount, pastDue, release, reserve, run, runsOf,
  settle, spentByApp, subscribe, topUp, walletOf, renewAllowance, movements, LEDGER as REASONS, type Db,
} from "@engine/runtime";
import { GROUND } from "../src/index.js";

const directory = () => env.DIRECTORY as unknown as Db;

const NOW = "2026-08-14T12:00:00.000Z" as Instant;
const daysAgo = (n: number) =>
  new Date(Date.parse(NOW) - n * 24 * 60 * 60 * 1000).toISOString() as Instant;

/**
 * ⚠️ A SECOND PRODUCT ON THE SAME WORKSPACE — the whole point of one membership.
 * It declares its own KEYS and no plans: the catalogue is the deployment's.
 */
const LEDGER: AppSpec = {
  ...GROUND,
  id: "ledger",
  name: "Ledger",
  entitlements: { rows: { label: "Rows", withheld: "quota" }, ...GROUND.entitlements },
};

/**
 * ⚠️ THE DEPLOYMENT'S CATALOGUE, and every plan prices every key both products
 * declare — which `refuseCatalog` now demands, because a key no tier mentions
 * resolves to `false` for everybody while the feature sits there built.
 */
const PLANS: readonly PlanSpec[] = [
  { id: "none", name: "No plan", said: "", kind: "personal", price: 0, currency: "USD",
    credits: 0, order: 0, parking: true,
    includes: { seats: 1, storage: 0, domains: 0, notes: 20, publishing: false, rows: 100 } },
  { id: "team", name: "Team", said: "", kind: "personal", price: 900, currency: "USD",
    credits: 1000, order: 1,
    includes: { seats: 10, storage: 100, domains: 0, notes: -1, publishing: true, rows: -1 } },
  { id: "pro", name: "Pro", said: "", kind: "commercial", price: 1900, currency: "USD",
    credits: 5000, order: 2,
    includes: { seats: 25, storage: 1000, domains: 1, notes: -1, publishing: true, rows: -1 } },
];

/** Every key the workspace could hold — the platform's, and both products'. */
const KEYS = { ...PLATFORM_ENTITLEMENTS, ...GROUND.entitlements, ...LEDGER.entitlements };

/** ⚠️ One membership, so one row and no app id — see `MEMBERSHIP`. */
const onPlan = (id: string) => subscribe(directory(), tenantId, MEMBERSHIP, id, "active");

/* ⚠️ Its own slug — see the note in serve.test.ts. */
let tenantId = "" as TenantId;

beforeAll(async () => {
  await applySchema(directory(), DIRECTORY_MODULES);
  await applySchema(env.SHARD_EU_1 as unknown as Db, [MEMBERSHIP_SCHEMA]);
  await addShard(directory(), "eu-1", "eu", 100);
  for (const app of ["ground", "ledger"]) await noteShardApp(directory(), "eu-1", app);
});

beforeEach(async () => {
  for (const t of ["credit_ledger", "billing_account", "subscription", "job_run", "tenant_app", "tenant"]) {
    await directory().exec(`DELETE FROM ${t};`);
  }
  const made = await createTenant(directory(), {
    slug: "eastwind", name: "Eastwind", country: "DE", where: "eu", apps: ["ground"],
  });
  if (typeof made === "string") throw new Error(made);
  tenantId = made.tenant.id;
  await openAccount(directory(), tenantId);
});

/* ------------------------------------------------------------ two products --- */

describe("a workspace with two of our products", () => {
  /*
    ⚠️ ONE MEMBERSHIP, ONE LINE, HOWEVER MANY PRODUCTS. The bill is the
    workspace's — a per-product answer is three emails on three days from what
    looks like three companies, and the strictest-standing rule already closes
    the whole workspace over any one of them.
  */
  it("pays for one membership rather than one bill per product", async () => {
    await onPlan("pro");
    const bill = await billFor(directory(), tenantId, PLANS);
    expect(bill.lines).toHaveLength(1);
    expect(bill.total).toBe(1900);
    expect(bill.currency).toBe("USD");
  });

  /* ⚠️ The lobby is not a line. "No plan — $0.00" is noise on the one document
     people actually read. */
  it("puts nothing on the bill for a workspace in the lobby", async () => {
    await onPlan("none");
    const bill = await billFor(directory(), tenantId, PLANS);
    expect(bill.lines).toHaveLength(0);
    expect(bill.total).toBe(0);
  });

  /*
    ⚠️ AND ONE RESOLUTION OVER THE UNION OF KEYS. Resolving per app answered
    `false` for the other app's keys the moment two products were on — so a
    workspace paying for both would have been told it had neither.
  */
  it("resolves every product's keys from the one plan", async () => {
    await onPlan("team");
    const held = await heldBy(directory(), tenantId, { plans: PLANS, keys: KEYS }, NOW, true);

    expect(held.entitlements.find((e) => e.key === "notes")?.value).toBe(-1);
    expect(held.entitlements.find((e) => e.key === "rows")?.value).toBe(-1);
    expect(held.entitlements.find((e) => e.key === "publishing")?.value).toBe(true);
    /* ⚠️ And the platform's own, which no app declares. */
    expect(held.entitlements.find((e) => e.key === "seats")?.value).toBe(10);
    /* ⚠️ The month's credits travel with the resolution — one lookup, so what a
       workspace HAS and what it may SPEND cannot disagree. */
    expect(held.credits).toBe(1000);
  });

  /*
    ⚠️ AND ONE WALLET. A business that topped up in one product and ran out in
    another, on the same day, holding the same card, is a business being told to
    buy credits twice.
  */
  it("spends one balance from either product, and says which spent what", async () => {
    await topUp(directory(), tenantId, 1000);

    const one = await reserve(directory(), tenantId, 300, "note.draft");
    expect(one).not.toBe("not_enough");
    if (one === "not_enough") return;
    await settle(directory(), tenantId, one, 120 * MILLI, { appId: "ground" });

    const two = await reserve(directory(), tenantId, 400, "ledger.summarise");
    if (two === "not_enough") return;
    await settle(directory(), tenantId, two, 400 * MILLI, { appId: "ledger" });

    expect((await walletOf(directory(), tenantId)).balance).toBe(1000 - 120 - 400);
    const spent = await spentByApp(directory(), tenantId, daysAgo(1));
    expect(spent).toEqual([{ appId: "ledger", credits: 400 }, { appId: "ground", credits: 120 }]);
  });
});

/* --------------------------------------------------------------- the wallet --- */

describe("holding and spending credits", () => {
  /*
    ⚠️ THE RESERVE IS A CEILING ON REVENUE. Settlement charges `min(held,
    actual)`, so every unit an estimate fails to anticipate is a unit the
    platform pays for and the customer does not — silently, on every call.
  */
  it("never charges more than was held", async () => {
    await topUp(directory(), tenantId, 500);
    const held = await reserve(directory(), tenantId, 100, "x");
    if (held === "not_enough") throw new Error("reserve refused");
    expect((await settle(directory(), tenantId, held, 400 * MILLI)).credits).toBe(100);
    expect((await walletOf(directory(), tenantId)).balance).toBe(400);
  });

  /* ⚠️ A missing usage report falls back to the reserve, never to a recount:
     because of the cap, a recount can only ever charge less than the truth. */
  it("charges the reserve when nothing was reported", async () => {
    await topUp(directory(), tenantId, 500);
    const held = await reserve(directory(), tenantId, 100, "x");
    if (held === "not_enough") throw new Error("reserve refused");
    expect((await settle(directory(), tenantId, held, null)).credits).toBe(100);
  });

  /*
    ⚠️ THE HOLD IS TAKEN IN THE STATEMENT THAT CHECKS IT. Two concurrent calls
    that both read a balance of 100 and both hold 80 have spent 160 of it, and
    the symptom is a balance that went negative long after the calls that did it.
  */
  it("refuses a second hold that the balance cannot cover", async () => {
    await topUp(directory(), tenantId, 100);
    expect(await reserve(directory(), tenantId, 80, "a")).not.toBe("not_enough");
    expect(await reserve(directory(), tenantId, 80, "b")).toBe("not_enough");
    /* ⚠️ And what is spendable excludes what is held, or the number disagrees
       with what happens at the moment of a refusal. */
    expect(await walletOf(directory(), tenantId)).toMatchObject({ balance: 100, held: 80, spendable: 20 });
  });

  /* ⚠️ A reserve nothing settles would hold somebody's credits for ever — a
     balance they cannot spend with nothing to explain it. */
  it("gives back a hold whose call never finished", async () => {
    await topUp(directory(), tenantId, 100);
    const held = await reserve(directory(), tenantId, 80, "a");
    if (held === "not_enough") throw new Error("reserve refused");
    await release(directory(), tenantId, held);
    expect((await walletOf(directory(), tenantId)).spendable).toBe(100);
  });
});

/* ------------------------------------------------------------ two balances --- */

describe("the month's allowance, and what was bought", () => {
  /*
    ⚠️ SET, NOT ADDED, AND THAT IS THE COST MODEL. A plan granting 1,500 a month
    to somebody who spent none of last month's grants 1,500 — not 3,000. An
    allowance that compounds prices a quiet quarter as three months of headroom,
    and the customer who then has a busy month costs more than they ever paid.
  */
  it("sets the month's allowance rather than adding to it", async () => {
    await onPlan("team");
    await renewAllowance(directory(), tenantId, PLANS);
    expect((await walletOf(directory(), tenantId)).granted).toBe(1000);

    await renewAllowance(directory(), tenantId, PLANS);
    expect((await walletOf(directory(), tenantId)).granted).toBe(1000);
  });

  /*
    ⚠️ AND WHAT LAPSED IS ON THE STATEMENT. Setting the column silently makes a
    balance drop between two rows with nothing between them to explain it, and
    "where did my credits go" is then a question with no answer to show.
  */
  it("says on the statement what did not carry over", async () => {
    await onPlan("team");
    await renewAllowance(directory(), tenantId, PLANS);
    const held = await reserve(directory(), tenantId, 400, "x");
    if (held === "not_enough") throw new Error("reserve refused");
    await settle(directory(), tenantId, held, 400 * MILLI);

    await renewAllowance(directory(), tenantId, PLANS);
    const said = await movements(directory(), tenantId);
    expect(said.some((m) => m.reason === REASONS.expired && m.delta === -600)).toBe(true);
    expect((await walletOf(directory(), tenantId)).granted).toBe(1000);
  });

  /*
    ⚠️ WHAT WAS BOUGHT IS NEVER RESET. A renewal that swept it away would be a
    monthly confiscation of something paid for with a card, on the day somebody
    is least likely to be looking at it.
  */
  it("never touches credits somebody paid for", async () => {
    await onPlan("team");
    await topUp(directory(), tenantId, 2_500);
    await renewAllowance(directory(), tenantId, PLANS);
    await renewAllowance(directory(), tenantId, PLANS);

    expect(await walletOf(directory(), tenantId))
      .toMatchObject({ granted: 1000, bought: 2_500, balance: 3_500 });
  });

  /*
    ⚠️ THE ALLOWANCE IS SPENT FIRST, and it is not a preference. Drawing on the
    bought balance while an allowance sits there means the customer pays cash for
    something they had already been given, and then watches it lapse.
  */
  it("spends the allowance before what was bought", async () => {
    await onPlan("team");
    await topUp(directory(), tenantId, 500);
    await renewAllowance(directory(), tenantId, PLANS);

    const held = await reserve(directory(), tenantId, 1_200, "x");
    if (held === "not_enough") throw new Error("reserve refused");
    await settle(directory(), tenantId, held, 1_200 * MILLI);

    /* 1,000 off the allowance, the remaining 200 off what was bought. */
    expect(await walletOf(directory(), tenantId))
      .toMatchObject({ granted: 0, bought: 300, balance: 300 });
  });

  /*
    ⚠️ AND NEITHER IS CONFISCATED WHEN STANDING STOPS. `walk` ends with a clamp
    that zeroes everything a workspace holds — correct for a permission, theft
    for a balance. Credits are a plan FIELD rather than an entitlement precisely
    so they never go through it: a suspended workspace cannot spend, because the
    gate refuses the write, and finds its balance intact when it comes back.
  */
  it("leaves the balance alone when the workspace is suspended", async () => {
    await onPlan("team");
    await topUp(directory(), tenantId, 900);
    await renewAllowance(directory(), tenantId, PLANS);
    /* ⚠️ Past the BLOCKED rung, which is where the clamp starts — read-only
       withholds the writes and leaves every allowance where it was. */
    await markPastDue(directory(), tenantId, MEMBERSHIP, new Date(Date.parse(daysAgo(35))));

    const held = await heldBy(directory(), tenantId, { plans: PLANS, keys: KEYS }, NOW, true);
    expect(held.standing.writable).toBe(false);
    /* ⚠️ Every allowance is clamped to nothing... */
    expect(held.entitlements.find((e) => e.key === "notes")?.value).toBe(0);
    /* ...and the money is exactly where they left it. */
    expect(await walletOf(directory(), tenantId))
      .toMatchObject({ granted: 1000, bought: 900, balance: 1_900 });
  });
});

/* --------------------------------------------------------------- the ladder --- */

describe("a workspace that stops paying", () => {
  const sub = (days: number) => ({ status: "past_due" as const, pastDueAt: daysAgo(days) });

  /* ⚠️ A card that expired on a Friday is not a reason to stop somebody working
     on Monday. */
  it("changes nothing in the first week", () => {
    expect(standingFor(sub(3), NOW)).toMatchObject({ writable: true, serving: true });
  });

  it("stops writes after a week and still serves every read", () => {
    const at = standingFor(sub(10), NOW);
    expect(at).toMatchObject({ writable: false, serving: true });
    expect(at.reason).toContain("still here to read");
  });

  it("withholds the product after a month", () => {
    expect(standingFor(sub(31), NOW)).toMatchObject({ writable: false, serving: false });
  });

  /*
    ⚠️ AND A BRAND-NEW WORKSPACE IS NOT A DEBTOR. `incomplete` is the parking
    state a signup sits in for its first minute; a previous platform read it as a
    verdict and held new workspaces read-only over an invoice that never existed.
  */
  it("never reads a signup in progress as arrears", () => {
    expect(standingFor({ status: "incomplete", pastDueAt: null }, NOW))
      .toMatchObject({ writable: true, serving: true });
    expect(standingFor(null, NOW)).toMatchObject({ writable: true, serving: true });
  });

  /*
    ⚠️ AND THE LADDER ONLY APPLIES WHERE MONEY CAN CHANGE HANDS. Gating "has not
    paid" on a deployment that cannot take a payment strands every workspace over
    OUR misconfiguration.
  */
  it("stands down entirely where the deployment cannot charge", () => {
    expect(standingFor(sub(90), NOW, { charging: false }))
      .toMatchObject({ writable: true, serving: true });
  });

  /* ⚠️ A ladder that purges before it blocks deletes a customer's records
     without ever having told them anything was wrong. */
  it("refuses a ladder whose rungs are out of order", () => {
    expect(refuseLadder(LADDER)).toEqual([]);
    expect(refuseLadder({ readOnlyAfter: 30, blockedAfter: 7, purgeAfter: 37 }))
      .toContain("rungs_out_of_order");
    expect(refuseLadder({ readOnlyAfter: 7, blockedAfter: 30, purgeAfter: 31 }))
      .toContain("purge_too_soon");
  });

  it("finds every workspace past due in one query over the directory", async () => {
    await onPlan("team");
    await markPastDue(directory(), tenantId, MEMBERSHIP, new Date(Date.parse(daysAgo(12))));
    const overdue = await pastDue(directory(), NOW);
    expect(overdue).toHaveLength(1);
    expect(overdue[0]!.days).toBe(12);

    /* ⚠️ Paying clears the anchor, so the ladder starts again from nothing
       rather than from where it left off. */
    await markPaid(directory(), tenantId, MEMBERSHIP);
    expect(await pastDue(directory(), NOW)).toHaveLength(0);
  });

  /* ⚠️ The clamp is last, so a workspace we have stopped serving cannot be
     adjusted back into service by a well-meaning operator edit. */
  it("clamps everything for a workspace we no longer serve", async () => {
    await onPlan("team");
    await markPastDue(directory(), tenantId, MEMBERSHIP, new Date(Date.parse(daysAgo(40))));
    await adjust(directory(), tenantId, MEMBERSHIP, "notes", 9999);
    const held = await heldBy(directory(), tenantId, { plans: PLANS, keys: KEYS }, NOW, true);
    expect(held.entitlements.find((e) => e.key === "notes")?.value).toBe(0);
  });
});

/* ------------------------------------------------------- what they were sold --- */

describe("what a plan edit does to somebody already on it", () => {
  /*
    ⚠️ GRANDFATHERING RATCHETS UP AND AN ADJUSTMENT DOES NOT. They shared one
    blob in an earlier platform, so "give this workspace ten seats" was a one-way
    door: the only way back discarded the grandfathering with it.
  */
  it("holds a workspace at what it was sold, and lets an operator move it either way", async () => {
    await onPlan("none");
    await grandfather(directory(), tenantId, MEMBERSHIP, { notes: 500 });
    expect((await heldBy(directory(), tenantId, { plans: PLANS, keys: KEYS }, NOW, true))
      .entitlements.find((e) => e.key === "notes")?.value).toBe(500);

    /* An operator may go DOWN, which grandfathering alone could never do. */
    await adjust(directory(), tenantId, MEMBERSHIP, "notes", 50);
    expect((await heldBy(directory(), tenantId, { plans: PLANS, keys: KEYS }, NOW, true))
      .entitlements.find((e) => e.key === "notes")?.value).toBe(50);

    /* And clearing that one key leaves the grandfathering intact. */
    await adjust(directory(), tenantId, MEMBERSHIP, "notes", null);
    expect((await heldBy(directory(), tenantId, { plans: PLANS, keys: KEYS }, NOW, true))
      .entitlements.find((e) => e.key === "notes")?.value).toBe(500);
  });
});

/* ----------------------------------------------------------------- the jobs --- */

describe("work nobody is watching", () => {
  /*
    ⚠️ A JOB THAT STOPS RUNNING DOES NOT FAIL, IT GOES QUIET. Recording the
    failure is the only way anybody finds out — there is no user, no request and
    no red test behind it.
  */
  it("records a run that failed instead of losing it", async () => {
    const out = await run(directory(), "dunning", async () => { throw new Error("D1 timed out"); });
    expect(out.ok).toBe(false);
    expect(out.detail).toContain("timed out");

    const seen = await runsOf(directory(), { dunning: {} as never });
    expect(seen[0]).toMatchObject({ jobId: "dunning", ok: false });
  });

  /* ⚠️ The row is opened before the work and closed after it, so a run that
     never came back is visible as a row with no end. */
  it("leaves a run that never came back visible", async () => {
    await directory().prepare(
      `INSERT INTO job_run (id, job_id, started_at, ended_at, ok, detail, touched)
       VALUES ('run_x', 'sweep', ?, NULL, NULL, NULL, 0)`).bind(daysAgo(1)).run();
    const seen = await runsOf(directory(), { sweep: {} as never });
    expect(seen[0]).toMatchObject({ endedAt: null, ok: null });
  });

  it("records what a successful run handled", async () => {
    const out = await run(directory(), "dunning", async () => ({ touched: 4, detail: "4 reminded" }));
    expect(out).toMatchObject({ ok: true, touched: 4 });
  });
});
