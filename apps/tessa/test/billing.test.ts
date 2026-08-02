/**
 * THE MONEY PATH, over real HTTP.
 *
 * Three things here are worth a test and nothing else in the suite covers them,
 * because each one FAILS SILENTLY:
 *
 *   the catalog seeds     a `seedBilling` that never ran leaves `/billing` with
 *                         an empty picker — which looks like "no plans yet"
 *                         rather than a broken migration.
 *   the parking state     a centre with no subscription row cannot be told apart
 *                         from a cancelled one, and the two need different copy.
 *   the credit grant      `grantMonthly` is keyed by PERIOD. Granting twice in a
 *                         month is free money; the guard against it is invisible
 *                         unless something calls it twice.
 *
 * The webhook itself is NOT driven here. It needs a valid Stripe signature, and
 * a test that forged one would be asserting against our own verifier rather than
 * Stripe's. The handler's logic is exercised through the routes it shares with
 * the rest of the app; the signature path is `@4dl/billing`'s own suite.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";
import type { TenantBillingDO } from "../src/billing-do.js";
import { DEFAULT_PACKS, DEFAULT_PLANS, RETIRED_PLANS, seedBilling, tenantEntitlements, withinQuota } from "../src/billing-store.js";
import { FREE } from "../src/entitlements.js";

const db = () => env.DB as D1Database;
/** `cloudflare:test`'s `env` is untyped for DO namespaces — same cast as `db()`. */
const billing = () => env.BILLING as unknown as DurableObjectNamespace<TenantBillingDO>;

beforeAll(async () => {
  await ensureSchema(db());
});

describe("the catalog", () => {
  it("seeds one sellable plan and the packs, and is idempotent", async () => {
    await seedBilling(db());
    // Twice: the version stamp must make the second run a no-op rather than a
    // duplicate-key failure or a second set of rows.
    await seedBilling(db());

    const plans = await db().prepare("SELECT id, name, price_usd_month, active FROM plans ORDER BY ord").all<{ id: string; name: string; price_usd_month: number; active: number }>();
    // Both lists land as rows. `free` moved from DEFAULT_PLANS to RETIRED_PLANS
    // when the store was extracted — same row, same values, but declared where
    // "insert it, hold it inactive, never reconcile it again" is what happens.
    expect(plans.results?.length).toBe(DEFAULT_PLANS.length + RETIRED_PLANS.length);

    // Exactly one plan is offered. `free` exists so a tenant already parked on
    // it still resolves, but it must never appear in a picker.
    const sellable = (plans.results ?? []).filter((p) => p.active === 1);
    expect(sellable.map((p) => p.id)).toEqual(["practice"]);
    expect(sellable[0]!.price_usd_month).toBeGreaterThan(0);

    const packs = await db().prepare("SELECT id FROM credit_packs WHERE active = 1").all();
    expect(packs.results?.length).toBe(DEFAULT_PACKS.length);
  });

  it("gives the paid plan AI and the parking state none", async () => {
    await seedBilling(db());
    const rows = await db().prepare("SELECT id, entitlements_json FROM plans").all<{ id: string; entitlements_json: string }>();
    const byId = new Map((rows.results ?? []).map((r) => [r.id, JSON.parse(r.entitlements_json) as typeof FREE]));

    // The whole point of the `ai` feature flag: it is what a centre is buying.
    expect(byId.get("practice")?.features.ai).toBe(true);
    expect(byId.get("free")?.features.ai).toBe(false);

    // A ceiling on the catalog would make a centre choose which instruments to
    // track, which defeats the trace. `-1` is unlimited.
    expect(byId.get("practice")?.quotas.catalogItems).toBe(-1);
  });
});

describe("a centre with no plan", () => {
  const tenantId = "tenant-unplanned";

  it("resolves the free baseline rather than throwing", async () => {
    await seedBilling(db());
    // No subscription row at all — the state a centre is in between creating a
    // workspace and choosing anything.
    const ent = await tenantEntitlements(db(), tenantId);
    expect(ent.features.ai).toBe(false);
    expect(ent.quotas.staffSeats).toBe(FREE.quotas.staffSeats);
  });

  it("counts a quota against the ceiling, and never against rows that exist", async () => {
    const at = await withinQuota(db(), tenantId, "staffSeats", FREE.quotas.staffSeats - 1);
    expect(at.ok).toBe(true);
    const over = await withinQuota(db(), tenantId, "staffSeats", FREE.quotas.staffSeats);
    expect(over.ok).toBe(false);
    expect(over.max).toBe(FREE.quotas.staffSeats);
  });

  it("treats -1 as unlimited rather than as a number to compare", async () => {
    await seedBilling(db());
    // Unlimited is the PAID plan's catalog ceiling, not the free baseline's —
    // so this needs a tenant actually on it.
    const tenantId = "tenant-on-practice";
    await db()
      .prepare("INSERT OR REPLACE INTO subscriptions (tenant_id, plan_id, status) VALUES (?, 'practice', 'active')")
      .bind(tenantId)
      .run();

    // A naive `count < max` would refuse EVERY create against `-1`, which reads
    // as "the plan you just paid for lets you add nothing".
    const unlimited = await withinQuota(db(), tenantId, "catalogItems", 10_000);
    expect(unlimited.ok).toBe(true);
    expect(unlimited.max).toBe(-1);

    // A finite quota on the same plan still bites.
    const seats = await withinQuota(db(), tenantId, "staffSeats", 10);
    expect(seats.ok).toBe(false);
  });
});

describe("a suspended centre", () => {
  it("falls back to the free baseline everywhere at once", async () => {
    await seedBilling(db());
    const tenantId = "tenant-suspended";
    await db()
      .prepare("INSERT OR REPLACE INTO subscriptions (tenant_id, plan_id, status) VALUES (?, 'practice', 'suspended')")
      .bind(tenantId)
      .run();

    // Clamping in ONE place is the design: otherwise every gate has to remember
    // to check standing, and the one that forgets is the one that leaks.
    const ent = await tenantEntitlements(db(), tenantId);
    expect(ent.features.ai).toBe(false);
    expect(ent.features.customDomain).toBe(false);
  });
});

describe("the credit grant", () => {
  it("grants a plan's monthly credits once per period, not once per call", async () => {
    const tenantId = "tenant-grant";
    const stub = billing().get(billing().idFromName(tenantId));
    await stub.bind(tenantId);

    const first = await stub.grantMonthly(2_000, "2026-08");
    expect(first.balance).toBe(2_000);

    // The same period again — a renewal invoice landing in the same month as a
    // checkout, or simply a re-run of the daily sweep. Free money if it stacks.
    const again = await stub.grantMonthly(2_000, "2026-08");
    expect(again.balance).toBe(2_000);

    /**
     * A new period RESETS rather than adding: plan credits are use-it-or-lose-it,
     * so last month's unused 2,000 lapses and this month's 2,000 replaces it.
     *
     * This is the assertion worth having. Rolling grants forward is the obvious
     * implementation and it is wrong — a centre that skipped a quiet August
     * would arrive in December with five months banked and the plan's monthly
     * price would stop bounding what it can spend.
     */
    const next = await stub.grantMonthly(2_000, "2026-09");
    expect(next.balance).toBe(2_000);
  });

  it("never lets the monthly reset take credits the centre PAID for", async () => {
    const tenantId = "tenant-purchase";
    const stub = billing().get(billing().idFromName(tenantId));
    await stub.bind(tenantId);
    await stub.grantMonthly(100, "2026-08");
    const afterPack = await stub.topUp(1_000, "pack.purchase", "pack_1k");
    expect(afterPack.balance).toBe(1_100);

    // Month rolls over. The 100 granted lapses; the 1,000 bought does not —
    // purchased credits are a different bucket, and expiring them would be
    // taking back something that was paid for.
    const nextMonth = await stub.grantMonthly(100, "2026-09");
    expect(nextMonth.balance).toBe(1_100);
  });
});

describe("the billing route", () => {
  it("is refused without a session", async () => {
    // Not a formality: `/billing` reports the plan, the balance and whether the
    // deployment can take money at all. It is behind the tenant gate.
    const res = await SELF.fetch("http://nobody.localhost:8787/api/billing");
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
