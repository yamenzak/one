/**
 * A GIFT LANDING ON A WORKSPACE — the one path, and what it refuses.
 *
 * ⚠️ THE GIFT IS MADE TO A PERSON AND SPENT ON A WORKSPACE, and those are two
 * moments weeks apart. Everything that can go wrong lives in the gap: the plan
 * was retired, the workspace is the wrong kind for it, somebody founded two at
 * once, the gift was stopped yesterday. Each of those is a person told they hold
 * something they cannot use, so each is asserted here.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { PlanSpec, TenantId } from "@engine/kernel";
import { applySchema } from "../src/schema.js";
import { BILLING_SCHEMA, MEMBERSHIP, subscriptionFor } from "../src/billing.js";
import { DIRECTORY_SCHEMA, giftsFor, give } from "../src/directory.js";
import { applyCreditGift, applyGifts, applyPlanGift } from "../src/gifts.js";
import { walletOf } from "../src/wallet.js";
import type { Db } from "../src/sql.js";

const db = () => env.SHARD_GLOBAL_1 as unknown as Db;

const NOW = new Date("2026-08-21T10:00:00.000Z");

const plan = (id: string, kind: "personal" | "commercial", credits: number): PlanSpec => ({
  id, name: id, said: id, kind, price: 0, currency: "usd", credits,
  includes: {}, order: 1,
});

const PLANS: readonly PlanSpec[] = [
  plan("solo", "personal", 100),
  plan("max", "commercial", 5_000),
];

let n = 0;
const someone = () => `gift-${++n}@example.test`;

/* ⚠️ A REAL WORKSPACE ROW, because `applyPlanGift` reads the KIND off it — the
   half of this that a stub would answer whatever the test wanted. */
const workspace = async (kind: "personal" | "commercial"): Promise<TenantId> => {
  const id = `ten_${++n}` as TenantId;
  await db().prepare(
    `INSERT INTO tenant (id, slug, name, country, shard_id, residency, kind, at)
     VALUES (?, ?, ?, 'DE', 'global-1', 'global', ?, ?)`)
    .bind(id, `w${n}`, `Workspace ${n}`, kind, NOW.toISOString()).run();
  return id;
};

beforeEach(async () => {
  await applySchema(db(), [DIRECTORY_SCHEMA, BILLING_SCHEMA]);
});

describe("a plan gift landing", () => {
  it("comps the workspace and grants the allowance the same instant", async () => {
    const email = someone();
    const tenant = await workspace("commercial");
    await give(db(), {
      email, kind: "plan", planId: "max", why: "Cash", by: "op@4dl.app",
    }, NOW);

    const done = await applyPlanGift(db(), tenant, email, PLANS, NOW);
    expect(typeof done).not.toBe("string");

    const sub = await subscriptionFor(db(), tenant, MEMBERSHIP);
    expect(sub?.planId).toBe("max");
    /* ⚠️ GIVEN, NOT BOUGHT — the stamp is what every screen reads to tell one
       from the other, and without it the workspace is a customer nobody
       invoiced. */
    expect(sub?.compedAt).toBeTruthy();

    /* ⚠️ THE ALLOWANCE IS THERE NOW, not on tomorrow's sweep. A gift that took
       a day to become usable is one reported as broken on the day it arrived. */
    const wallet = await walletOf(db(), tenant);
    expect(wallet.granted).toBe(5_000);
  });

  it("marks the gift spent, so the next workspace does not get it free", async () => {
    const email = someone();
    const one = await workspace("commercial");
    const two = await workspace("commercial");
    await give(db(), {
      email, kind: "plan", planId: "max", workspaces: 1, why: "One only", by: "op@4dl.app",
    }, NOW);

    expect(typeof await applyPlanGift(db(), one, email, PLANS, NOW)).not.toBe("string");
    expect(await applyPlanGift(db(), two, email, PLANS, NOW)).toBe("no_gift");
    expect((await subscriptionFor(db(), two, MEMBERSHIP))?.planId).toBeUndefined();
  });

  /**
   * ⚠️ THE KIND IS ASKED, NEVER ASSUMED. `mayBrand` and `mayIsolate` read the
   * workspace's kind rather than its plan, so a commercial tier on a personal
   * workspace is a set of entitlements the gates refuse — a tier somebody was
   * given and cannot use, with nothing on any screen saying why.
   */
  it("refuses a commercial plan on a personal workspace, and says which", async () => {
    const email = someone();
    const tenant = await workspace("personal");
    await give(db(), {
      email, kind: "plan", planId: "max", why: "Cash", by: "op@4dl.app",
    }, NOW);

    /* ⚠️ `wrong_kind` RATHER THAN `no_gift`, because they are different things
       for the person to do: one is "you have nothing", the other is "make this
       a business first". */
    expect(await applyPlanGift(db(), tenant, email, PLANS, NOW)).toBe("wrong_kind");
    /* And it stays unspent, waiting for the workspace to become one. */
    const [gift] = await giftsFor(db(), email);
    expect(gift!.spent).toBe(0);
  });

  it("picks the gift the workspace can actually use", async () => {
    const email = someone();
    const tenant = await workspace("personal");
    await give(db(), {
      email, kind: "plan", planId: "max", why: "For the business", by: "op@4dl.app",
    }, NOW);
    await give(db(), {
      email, kind: "plan", planId: "solo", why: "For this one", by: "op@4dl.app",
    }, NOW);

    const done = await applyPlanGift(db(), tenant, email, PLANS, NOW);
    expect(typeof done === "string" ? done : done.planId).toBe("solo");
  });

  /**
   * ⚠️ A CATALOGUE EDIT CAN RETIRE A TIER WHILE A GIFT NAMING IT IS STILL LIVE.
   * Comping onto an id with no plan behind it is an empty entitlement set, which
   * resolves as a refusal a week later with nothing pointing back here.
   */
  it("will not comp onto a plan the deployment no longer sells", async () => {
    const email = someone();
    const tenant = await workspace("commercial");
    await give(db(), {
      email, kind: "plan", planId: "retired", why: "Old tier", by: "op@4dl.app",
    }, NOW);

    expect(await applyPlanGift(db(), tenant, email, PLANS, NOW)).toBe("no_gift");
    expect((await subscriptionFor(db(), tenant, MEMBERSHIP))?.planId).toBeUndefined();
  });

  it("does nothing for a workspace that is gone", async () => {
    const email = someone();
    await give(db(), {
      email, kind: "plan", planId: "max", why: "Cash", by: "op@4dl.app",
    }, NOW);
    expect(await applyPlanGift(db(), "ten_nope" as TenantId, email, PLANS, NOW))
      .toBe("no_tenant");
  });
});

describe("a credit gift landing", () => {
  it("goes into what was bought, so a renewal cannot sweep it away", async () => {
    const email = someone();
    const tenant = await workspace("personal");
    await give(db(), {
      email, kind: "credits", credits: 2_000, why: "Paid cash", by: "op@4dl.app",
    }, NOW);

    expect(typeof await applyCreditGift(db(), tenant, email, NOW)).not.toBe("string");
    const wallet = await walletOf(db(), tenant);
    /* ⚠️ `bought`, NEVER `granted`. In the month's allowance it would be gone on
       the first — an apology that expires, which is worse than none. */
    expect(wallet.bought).toBe(2_000);
    expect(wallet.granted).toBe(0);
  });

  it("says on the statement that it was given, and why", async () => {
    const email = someone();
    const tenant = await workspace("personal");
    await give(db(), {
      email, kind: "credits", credits: 500, why: "Sorry about Tuesday", by: "op@4dl.app",
    }, NOW);
    await applyCreditGift(db(), tenant, email, NOW);

    const row = await db().prepare(
      `SELECT reason FROM credit_ledger WHERE tenant_id = ? ORDER BY at DESC LIMIT 1`)
      .bind(tenant).first<{ reason: string }>();
    /* ⚠️ THE WORKSPACE'S OWN BILL IS WHERE SOMEBODY NOTICES A BALANCE THEY DID
       NOT BUY, and the reason is the whole of what they need to read there. */
    expect(row?.reason).toContain("Sorry about Tuesday");
  });

  it("is spent once", async () => {
    const email = someone();
    const tenant = await workspace("personal");
    await give(db(), {
      email, kind: "credits", credits: 500, why: "Goodwill", by: "op@4dl.app",
    }, NOW);

    expect(typeof await applyCreditGift(db(), tenant, email, NOW)).not.toBe("string");
    expect(await applyCreditGift(db(), tenant, email, NOW)).toBe("no_gift");
    expect((await walletOf(db(), tenant)).bought).toBe(500);
  });
});

describe("both at once", () => {
  /**
   * ⚠️ FOUNDING IS ONE MOMENT. Somebody given a plan AND credits who had to make
   * two workspaces to receive them would be meeting the shape of our ledger
   * rather than the shape of the gift.
   */
  it("a plan and credits both land on one founding", async () => {
    const email = someone();
    const tenant = await workspace("commercial");
    await give(db(), {
      email, kind: "plan", planId: "max", why: "Cash for a year", by: "op@4dl.app",
    }, NOW);
    await give(db(), {
      email, kind: "credits", credits: 1_000, why: "And some credits", by: "op@4dl.app",
    }, NOW);

    const done = await applyGifts(db(), tenant, email, PLANS, NOW);
    expect(done).toHaveLength(2);
    expect((await subscriptionFor(db(), tenant, MEMBERSHIP))?.planId).toBe("max");
    expect((await walletOf(db(), tenant)).bought).toBe(1_000);
  });

  /**
   * ⚠️ THE ORDINARY CASE, AND IT MUST NOT BE A FAILURE. This runs on every
   * founding on the deployment, and almost nobody is holding a gift.
   */
  it("answers nothing, quietly, when nothing is waiting", async () => {
    const tenant = await workspace("personal");
    expect(await applyGifts(db(), tenant, someone(), PLANS, NOW)).toEqual([]);
  });

  it("a refusal on one half does not stop the other", async () => {
    const email = someone();
    const tenant = await workspace("personal");
    /* The plan is for a business; this workspace is not one. The credits are
       fine, and a caller that stopped at the first refusal would drop them. */
    await give(db(), {
      email, kind: "plan", planId: "max", why: "For later", by: "op@4dl.app",
    }, NOW);
    await give(db(), {
      email, kind: "credits", credits: 300, why: "Now", by: "op@4dl.app",
    }, NOW);

    const done = await applyGifts(db(), tenant, email, PLANS, NOW);
    expect(done).toHaveLength(1);
    expect((await walletOf(db(), tenant)).bought).toBe(300);
  });
});
