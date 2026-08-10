/**
 * THE ONE THING A STOREFRONT MUST NOT GET WRONG.
 *
 * ⚠️ THE SHELF AND THE GATE COUNT THE SAME THING. A preview that estimated usage
 * its own way promises a downgrade the very next write then refuses — a surface
 * that is not the mechanism, which is harder to spot than a mechanism with no
 * surface because everything renders and nothing throws.
 */

import { describe, expect, it } from "vitest";
import { previewOf, shelf } from "../src/market.js";
import { UNLIMITED, type AppSpec, type Currency, type EntitlementDef, type PlanSpec, type SqlHandle } from "@one/kernel";

const declared: Record<string, EntitlementDef> = {
  notes: { label: "Notes", parked: true, enforcement: "gate" },
  receipts: { label: "Receipts kept", parked: 5, enforcement: "quota" },
};

const plan = (id: string, entitlements: PlanSpec["entitlements"]): PlanSpec => ({
  id, name: id, price: { minor: 0, currency: "EUR" as Currency }, period: "month", trialDays: 0, entitlements,
});

const app = {
  access: { entitlements: declared, plans: [plan("free", { receipts: 5 }), plan("big", { receipts: UNLIMITED })] },
} as unknown as AppSpec<never>;

const explode = () => { throw new Error("the store was touched"); };
const db = { all: explode, first: explode, run: explode, batch: explode } as unknown as SqlHandle;

const preview = (toPlanId: string, usage: (key: string) => Promise<number> | null) =>
  previewOf({ app, db, tenantId: "t_1", currentPlanId: null, toPlanId, usage });

describe("the preview counts what the gate counts", () => {
  /*
    ⚠️ ASKED PER KEY, THROUGH THE CALLER'S COUNTER. A second way to count a
    ceiling is a second answer to "is there room", and the two drift the first
    time one of them forgets soft-deleted rows.
  */
  it("asks the caller's counter for each key it can count", async () => {
    const asked: string[] = [];
    const out = await preview("free", (key) => { asked.push(key); return Promise.resolve(40); });
    expect(asked).toEqual(["notes", "receipts"]);
    expect(out!.strains).toEqual([{ key: "receipts", label: "Receipts kept", have: 40, allows: 5 }]);
  });

  /*
    ⚠️ NO COUNTER IS NOT ZERO. A key nothing counts is a switch rather than a
    number — reading it as zero would report every workspace as comfortably
    inside a ceiling that does not exist.
  */
  it("skips a key nothing can count rather than reading it as none", async () => {
    const out = await preview("free", (key) => (key === "receipts" ? Promise.resolve(40) : null));
    expect(out!.strains.map((s) => s.key)).toEqual(["receipts"]);
    /* ⚠️ Absent, not zero: a key nothing counts has no usage to report. */
    expect(out!.usage).toEqual({ receipts: 40 });
  });

  /*
    ⚠️ A COUNTER THAT THROWS MUST NOT TAKE THE PRICE LIST DOWN. Somebody looking
    at plans is doing the one thing the business wants them to do, and a failed
    count is not a reason to show them an error.
  */
  it("survives a counter that fails", async () => {
    const out = await preview("free", () => Promise.reject(new Error("gone")));
    expect(out!.strains).toEqual([]);
    expect(out!.to.id).toBe("free");
  });

  it("answers nothing at all for a plan nobody sells", async () => {
    expect(await preview("ghost", () => null)).toBeNull();
  });

  /* ⚠️ Unlimited strains against nothing, however much is stored. */
  it("never strains against an unlimited ceiling", async () => {
    const out = await preview("big", () => Promise.resolve(9_000));
    expect(out!.strains).toEqual([]);
    expect(out!.gains.map((g) => g.key)).toContain("receipts");
  });
});

describe("the shelf is one list", () => {
  it("cards every plan with a row per declared key", () => {
    const cards = shelf(app.access.plans, declared);
    expect(cards.map((c) => c.id)).toEqual(["free", "big"]);
    for (const card of cards) expect(card.includes.map((l) => l.key)).toEqual(["notes", "receipts"]);
  });
});
