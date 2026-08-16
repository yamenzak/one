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

import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AppSpec, Instant, TenantId } from "@engine/kernel";
import { LADDER, refuseLadder, standingFor } from "@engine/kernel";
import {
  BILLING_SCHEMA, DIRECTORY_SCHEMA, IDENTITY_SCHEMA, JOBS_SCHEMA, MEMBERSHIP_SCHEMA,
  addShard, adjust, applySchema, balanceOf, billFor, createTenant, credit, grandfather, heldBy,
  markPaid, markPastDue, noteShardApp, openAccount, pastDue, release, reserve, run, runsOf,
  settle, spentByApp, subscribe, type Db,
} from "@engine/runtime";
import { HELLO } from "../src/index.js";

const directory = () => env.DIRECTORY as unknown as Db;

const NOW = "2026-08-14T12:00:00.000Z" as Instant;
const daysAgo = (n: number) =>
  new Date(Date.parse(NOW) - n * 24 * 60 * 60 * 1000).toISOString() as Instant;

/** ⚠️ A second product on the same workspace — the whole point of the stage. */
const LEDGER: AppSpec = {
  ...HELLO,
  id: "ledger",
  name: "Ledger",
  entitlements: { rows: { label: "Rows", withheld: "quota" }, ...HELLO.entitlements },
  plans: [
    { id: "free", name: "Free", said: "", price: 0, currency: "EUR", order: 0, parking: true,
      includes: { rows: 100, seats: 1, notes: 0, publishing: false } },
    { id: "pro", name: "Pro", said: "", price: 1900, currency: "EUR", order: 1,
      includes: { rows: -1, seats: 25, notes: -1, publishing: true } },
  ],
};

/* ⚠️ Its own slug — see the note in serve.test.ts. */
let tenantId = "" as TenantId;

beforeAll(async () => {
  await applySchema(directory(),
    [DIRECTORY_SCHEMA, IDENTITY_SCHEMA, BILLING_SCHEMA, JOBS_SCHEMA]);
  await applySchema(env.SHARD_EU_1 as unknown as Db, [MEMBERSHIP_SCHEMA]);
  await addShard(directory(), "eu-1", "eu", 100);
  for (const app of ["hello", "ledger"]) await noteShardApp(directory(), "eu-1", app);
});

beforeEach(async () => {
  for (const t of ["credit_ledger", "billing_account", "subscription", "job_run", "tenant_app", "tenant"]) {
    await directory().exec(`DELETE FROM ${t};`);
  }
  const made = await createTenant(directory(), {
    slug: "eastwind", name: "Eastwind", country: "DE", where: "eu", apps: ["hello"],
  });
  if (typeof made === "string") throw new Error(made);
  tenantId = made.tenant.id;
  await openAccount(directory(), tenantId);
});

/* ------------------------------------------------------------ two products --- */

describe("a workspace with two of our products", () => {
  it("holds a plan in each and pays one bill", async () => {
    await subscribe(directory(), tenantId, "hello", "team", "active");
    await subscribe(directory(), tenantId, "ledger", "pro", "active");

    const bill = await billFor(directory(), tenantId, [HELLO, LEDGER]);
    expect(bill.lines.map((l) => l.appId).sort()).toEqual(["hello", "ledger"]);
    /* ⚠️ One total: €9 + €19. Two invoices would be two companies to a customer. */
    expect(bill.total).toBe(900 + 1900);
    expect(bill.currency).toBe("EUR");
  });

  /* ⚠️ Charging nothing is not a line. "Free — €0.00" is noise on the one
     document people actually read. */
  it("puts nothing on the bill for a product on a free plan", async () => {
    await subscribe(directory(), tenantId, "hello", "free", "active");
    await subscribe(directory(), tenantId, "ledger", "pro", "active");
    const bill = await billFor(directory(), tenantId, [HELLO, LEDGER]);
    expect(bill.lines).toHaveLength(1);
    expect(bill.total).toBe(1900);
  });

  /*
    ⚠️ EACH PRODUCT'S ENTITLEMENTS ARE ITS OWN. One workspace, two plans, two
    answers — and a screen in one product asking what the other sells would be
    the seam this design exists to close.
  */
  it("resolves each product's entitlements separately", async () => {
    await subscribe(directory(), tenantId, "hello", "free", "active");
    await subscribe(directory(), tenantId, "ledger", "pro", "active");

    const hello = await heldBy(directory(), tenantId, HELLO, NOW, true);
    const ledger = await heldBy(directory(), tenantId, LEDGER, NOW, true);

    expect(hello.entitlements.find((e) => e.key === "notes")?.value).toBe(20);
    expect(ledger.entitlements.find((e) => e.key === "rows")?.value).toBe(-1);
    expect(hello.entitlements.find((e) => e.key === "publishing")?.value).toBe(false);
    expect(ledger.entitlements.find((e) => e.key === "publishing")?.value).toBe(true);
  });

  /*
    ⚠️ AND ONE WALLET. A business that topped up in one product and ran out in
    another, on the same day, holding the same card, is a business being told to
    buy credits twice.
  */
  it("spends one balance from either product, and says which spent what", async () => {
    await credit(directory(), tenantId, 1000, "pack.bought");

    const one = await reserve(directory(), tenantId, 300, "note.draft");
    expect(one).not.toBe("not_enough");
    if (one === "not_enough") return;
    await settle(directory(), tenantId, one, 120, { appId: "hello" });

    const two = await reserve(directory(), tenantId, 400, "ledger.summarise");
    if (two === "not_enough") return;
    await settle(directory(), tenantId, two, 400, { appId: "ledger" });

    expect((await balanceOf(directory(), tenantId)).balance).toBe(1000 - 120 - 400);
    const spent = await spentByApp(directory(), tenantId, daysAgo(1));
    expect(spent).toEqual([{ appId: "ledger", credits: 400 }, { appId: "hello", credits: 120 }]);
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
    await credit(directory(), tenantId, 500, "pack.bought");
    const held = await reserve(directory(), tenantId, 100, "x");
    if (held === "not_enough") throw new Error("reserve refused");
    expect(await settle(directory(), tenantId, held, 400)).toBe(100);
    expect((await balanceOf(directory(), tenantId)).balance).toBe(400);
  });

  /* ⚠️ A missing usage report falls back to the reserve, never to a recount:
     because of the cap, a recount can only ever charge less than the truth. */
  it("charges the reserve when nothing was reported", async () => {
    await credit(directory(), tenantId, 500, "pack.bought");
    const held = await reserve(directory(), tenantId, 100, "x");
    if (held === "not_enough") throw new Error("reserve refused");
    expect(await settle(directory(), tenantId, held, null)).toBe(100);
  });

  /*
    ⚠️ THE HOLD IS TAKEN IN THE STATEMENT THAT CHECKS IT. Two concurrent calls
    that both read a balance of 100 and both hold 80 have spent 160 of it, and
    the symptom is a balance that went negative long after the calls that did it.
  */
  it("refuses a second hold that the balance cannot cover", async () => {
    await credit(directory(), tenantId, 100, "pack.bought");
    expect(await reserve(directory(), tenantId, 80, "a")).not.toBe("not_enough");
    expect(await reserve(directory(), tenantId, 80, "b")).toBe("not_enough");
    /* ⚠️ And what is spendable excludes what is held, or the number disagrees
       with what happens at the moment of a refusal. */
    expect(await balanceOf(directory(), tenantId)).toMatchObject({ balance: 100, held: 80, spendable: 20 });
  });

  /* ⚠️ A reserve nothing settles would hold somebody's credits for ever — a
     balance they cannot spend with nothing to explain it. */
  it("gives back a hold whose call never finished", async () => {
    await credit(directory(), tenantId, 100, "pack.bought");
    const held = await reserve(directory(), tenantId, 80, "a");
    if (held === "not_enough") throw new Error("reserve refused");
    await release(directory(), tenantId, held);
    expect((await balanceOf(directory(), tenantId)).spendable).toBe(100);
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
    await subscribe(directory(), tenantId, "hello", "team", "active");
    await markPastDue(directory(), tenantId, "hello", new Date(Date.parse(daysAgo(12))));
    const overdue = await pastDue(directory(), NOW);
    expect(overdue).toHaveLength(1);
    expect(overdue[0]!.days).toBe(12);

    /* ⚠️ Paying clears the anchor, so the ladder starts again from nothing
       rather than from where it left off. */
    await markPaid(directory(), tenantId, "hello");
    expect(await pastDue(directory(), NOW)).toHaveLength(0);
  });

  /* ⚠️ The clamp is last, so a workspace we have stopped serving cannot be
     adjusted back into service by a well-meaning operator edit. */
  it("clamps everything for a workspace we no longer serve", async () => {
    await subscribe(directory(), tenantId, "hello", "team", "active");
    await markPastDue(directory(), tenantId, "hello", new Date(Date.parse(daysAgo(40))));
    await adjust(directory(), tenantId, "hello", "notes", 9999);
    const held = await heldBy(directory(), tenantId, HELLO, NOW, true);
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
    await subscribe(directory(), tenantId, "hello", "free", "active");
    await grandfather(directory(), tenantId, "hello", { notes: 500 });
    expect((await heldBy(directory(), tenantId, HELLO, NOW, true))
      .entitlements.find((e) => e.key === "notes")?.value).toBe(500);

    /* An operator may go DOWN, which grandfathering alone could never do. */
    await adjust(directory(), tenantId, "hello", "notes", 50);
    expect((await heldBy(directory(), tenantId, HELLO, NOW, true))
      .entitlements.find((e) => e.key === "notes")?.value).toBe(50);

    /* And clearing that one key leaves the grandfathering intact. */
    await adjust(directory(), tenantId, "hello", "notes", null);
    expect((await heldBy(directory(), tenantId, HELLO, NOW, true))
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
