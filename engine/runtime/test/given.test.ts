/**
 * WHAT AN OPERATOR GAVE SOMEBODY, AND THE THREE WAYS IT ENDS.
 *
 * ⚠️ THE GIFT IS THE ONE WRITE IN THE SYSTEM THAT HANDS OUT VALUE FOR NOTHING,
 * so the arithmetic under it gets the same treatment as the metering does. A
 * gift that spends twice is a free tier given away with nothing recording that
 * it was; one that refuses to spend is a person told they may not open the
 * workspace an operator just gave them.
 *
 * ⚠️ AND THE RACE IS THE HALF A UNIT TEST CANNOT SEE. `spendGift` carries its
 * count in the `WHERE`, so two foundings at once cannot both take the last one —
 * the read-then-write shape passes every test and hands out one extra exactly
 * when somebody is in a hurry. It is asserted here against a real database.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { giftIsLive, giftOver, giftedWorkspaces } from "@engine/kernel";
import type { AccountId } from "@engine/kernel";
import { applySchema } from "../src/schema.js";
import {
  DIRECTORY_SCHEMA, commercialAllowanceFor, giftsFor, give, spendGift, stopGift, upsertAccount,
} from "../src/directory.js";
import type { Db } from "../src/sql.js";

const db = () => env.SHARD_GLOBAL_1 as unknown as Db;

const NOW = new Date("2026-08-21T10:00:00.000Z");
const LATER = "2026-12-01T00:00:00.000Z";

/* ⚠️ A fresh address per test, because the directory is shared across this
   file's cases and `account.email` is unique. */
let n = 0;
const someone = () => `given-${++n}@example.test`;

beforeEach(async () => {
  await applySchema(db(), [DIRECTORY_SCHEMA]);
});

describe("a gift of a plan", () => {
  it("is written with who made it and why, and is live", async () => {
    const email = someone();
    const gift = await give(db(), {
      email, kind: "plan", planId: "max", workspaces: 2,
      why: "Paid cash for a year", by: "op@4dl.app",
    }, NOW);

    expect(gift.by).toBe("op@4dl.app");
    expect(gift.why).toBe("Paid cash for a year");
    expect(giftIsLive(gift, NOW.toISOString())).toBe(true);
    expect(giftOver(gift, NOW.toISOString())).toBe(null);
  });

  it("confers the right to found, counted with the bare allowance", async () => {
    const email = someone();
    const accountId = await upsertAccount(db(), email, null, NOW);
    await give(db(), {
      email, kind: "plan", planId: "max", workspaces: 2, why: "A friend", by: "op@4dl.app",
    }, NOW);

    /* ⚠️ THE FAILURE THIS EXISTS TO PREVENT: an operator gives somebody a
       workspace at Max and the door refuses them, because the gift and the
       commercial count were two separate numbers and only one was raised. */
    const allowance = await commercialAllowanceFor(db(), accountId, NOW.toISOString());
    expect(allowance.granted).toBe(2);
  });

  it("runs out rather than being taken back", async () => {
    const email = someone();
    const gift = await give(db(), {
      email, kind: "plan", planId: "max", workspaces: 1, why: "Demo", by: "op@4dl.app",
    }, NOW);

    expect(await spendGift(db(), gift.id)).toBe(true);
    /* The second press finds nothing left, and says so rather than throwing. */
    expect(await spendGift(db(), gift.id)).toBe(false);

    const [after] = await giftsFor(db(), email);
    expect(after!.spent).toBe(1);
    expect(giftOver(after!, NOW.toISOString())).toBe("spent");
  });

  /**
   * ⚠️ THE ONE A UNIT TEST CANNOT ASK. Both statements are issued before either
   * resolves, which is the shape a real double-press has — and `spendGift`
   * survives it only because the count is in the `WHERE`.
   */
  it("cannot be spent twice at once", async () => {
    const email = someone();
    const gift = await give(db(), {
      email, kind: "plan", planId: "max", workspaces: 1, why: "Demo", by: "op@4dl.app",
    }, NOW);

    const both = await Promise.all([spendGift(db(), gift.id), spendGift(db(), gift.id)]);
    expect(both.filter(Boolean).length).toBe(1);
  });
});

describe("the three ways a gift is over", () => {
  it("stopped — an operator ended it, and the row stays", async () => {
    const email = someone();
    const gift = await give(db(), {
      email, kind: "plan", planId: "max", why: "Trial", by: "op@4dl.app",
    }, NOW);

    expect(await stopGift(db(), gift.id, NOW)).toBe(true);
    /* ⚠️ Ending it twice is not an error and is not a second stamp. */
    expect(await stopGift(db(), gift.id, NOW)).toBe(false);

    const [after] = await giftsFor(db(), email);
    expect(after!.stoppedAt).toBe(NOW.toISOString());
    expect(giftOver(after!, NOW.toISOString())).toBe("stopped");
    /* ⚠️ AND IT DOES NOT REACH BACK: what was already spent stays spent. */
    expect(await spendGift(db(), gift.id)).toBe(false);
  });

  it("lapsed — the date passed, and nothing had to run to make it so", async () => {
    const email = someone();
    const gift = await give(db(), {
      email, kind: "plan", planId: "max", until: LATER, why: "A year of cash", by: "op@4dl.app",
    }, NOW);

    expect(giftIsLive(gift, NOW.toISOString())).toBe(true);
    expect(giftIsLive(gift, "2027-01-01T00:00:00.000Z")).toBe(false);
    expect(giftOver(gift, "2027-01-01T00:00:00.000Z")).toBe("lapsed");
  });

  it("a lapsed gift confers nothing", () => {
    const lapsed = {
      id: "g", kind: "plan" as const, planId: "max", credits: 0, workspaces: 3, spent: 0,
      until: LATER, why: "x", by: "op@4dl.app", at: NOW.toISOString(), stoppedAt: null,
    };
    expect(giftedWorkspaces([lapsed], NOW.toISOString())).toBe(3);
    expect(giftedWorkspaces([lapsed], "2027-01-01T00:00:00.000Z")).toBe(0);
  });
});

describe("a gift made before they arrive", () => {
  /**
   * ⚠️ THE CASE THE WHOLE FEATURE IS FOR. "Give my friend a workspace at Max" is
   * said about an ADDRESS — there is no account row until they ask for their
   * first code. A ledger keyed on the id would answer nothing for exactly the
   * person it was written for.
   */
  it("is claimed by the account when it appears", async () => {
    const email = someone();
    await give(db(), {
      email, kind: "plan", planId: "max", why: "A friend", by: "op@4dl.app",
    }, NOW);

    const before = await giftsFor(db(), email);
    expect(before).toHaveLength(1);

    const accountId = await upsertAccount(db(), email, null, NOW);
    const row = await db().prepare(`SELECT account_id FROM given WHERE email = ?`)
      .bind(email).first<{ account_id: string | null }>();
    expect(row?.account_id).toBe(accountId);
  });

  it("is found by an address in any case somebody typed it in", async () => {
    const email = someone();
    await give(db(), {
      email: email.toUpperCase(), kind: "credits", credits: 500,
      why: "Sorry about Tuesday", by: "op@4dl.app",
    }, NOW);
    expect(await giftsFor(db(), email)).toHaveLength(1);
  });
});

describe("a gift of credits", () => {
  /**
   * ⚠️ COUNTED AS ONE WORKSPACE'S WORTH, so `spent < workspaces` is the single
   * arithmetic behind "is there anything left in this" for both kinds. Two
   * counters would be two answers, and the second one is the one nobody checks.
   */
  it("is spendable once", async () => {
    const email = someone();
    const gift = await give(db(), {
      email, kind: "credits", credits: 2_000, why: "Cash customer", by: "op@4dl.app",
    }, NOW);

    expect(gift.workspaces).toBe(1);
    expect(gift.credits).toBe(2_000);
    expect(await spendGift(db(), gift.id)).toBe(true);
    expect(await spendGift(db(), gift.id)).toBe(false);
  });

  it("confers no right to found a business", async () => {
    const email = someone();
    const accountId = await upsertAccount(db(), email, null, NOW);
    await give(db(), {
      email, kind: "credits", credits: 2_000, why: "Cash customer", by: "op@4dl.app",
    }, NOW);

    const allowance = await commercialAllowanceFor(
      db(), accountId as AccountId, NOW.toISOString());
    expect(allowance.granted).toBe(0);
  });
});
