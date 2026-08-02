/**
 * THE CATALOG STORE, against a fake D1 that records every statement.
 *
 * Both live apps' integration suites exercise this through the real worker, and
 * they are the reason to trust it end to end. What they cannot see is the SQL
 * itself, and three of the rules here are invisible from outside:
 *
 *   - a price change NULLS the Stripe id pair. Miss it and `syncCatalog` skips
 *     the row forever, so a repriced plan keeps charging the OLD amount. There
 *     is no failing request, no error, and no way to notice except by reading a
 *     Stripe invoice.
 *   - a RETIRED plan is deactivated and nothing else. Reconcile it like a live
 *     one and every grandfathered tenant is silently re-priced onto the current
 *     entitlements — which for one of the real retired tiers means a storage
 *     ceiling cut from 25 GB to 10 GB, on tenants already above it.
 *   - a failed read must NOT become "no plan". That laundering downgrades a
 *     paying tenant to the free baseline during a D1 blip.
 *
 * The fake is deliberately dumb: it records `prepare`/`bind` and answers `first`
 * from a canned map. It is not a SQL engine and is not pretending to be one —
 * what is under test is which statements we emit and what we do with the answers.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { bindEntitlements, type EntitlementShape } from "../src/entitlements.js";
import { bindBillingStore, type PackRow, type PlanSeed } from "../src/store.js";

interface Ent extends EntitlementShape {
  quotas: { seats: number; widgets: number };
  features: { fancy: boolean };
}

const FREE: Ent = {
  quotas: { seats: 1, widgets: 5 },
  features: { fancy: false },
  aiCredits: { monthlyGrant: 0 },
  trialDays: 0,
};

const engine = bindEntitlements<Ent>(FREE);

const PAID = JSON.stringify({
  quotas: { seats: 10, widgets: -1 },
  features: { fancy: true },
  aiCredits: { monthlyGrant: 1_000 },
  trialDays: 14,
});

const PLANS: PlanSeed[] = [{ id: "paid", name: "Paid", price_usd_month: 39, entitlements_json: PAID, ord: 1, active: 1 }];
const RETIRED: PlanSeed[] = [{ id: "old", name: "Old", price_usd_month: 79, entitlements_json: PAID, ord: 90, active: 0 }];
const PACKS: PackRow[] = [{ id: "p1", name: "1k", credits: 1_000, price_usd: 1, ord: 0, active: 1 }];

/** One recorded statement: its SQL and the values bound to it. */
interface Stmt {
  sql: string;
  binds: unknown[];
}

class FakeDb {
  stmts: Stmt[] = [];
  /** Canned answers for `first`, matched on an SQL substring. */
  answers: { match: string; row: unknown }[] = [];
  /** SQL substrings whose read should THROW, standing in for a D1 failure. */
  failing: string[] = [];
  batched = 0;

  /** When true, `batch` throws — standing in for a failed catalog migration. */
  batchFails = false;

  /** Recorded at PREPARE time, so a statement that only ever goes into a
   *  `batch()` is captured too — which is every statement the migration emits. */
  prepare(sql: string) {
    const self = this;
    const rec: Stmt = { sql, binds: [] };
    this.stmts.push(rec);
    const stmt = {
      bind(...binds: unknown[]) {
        rec.binds = binds;
        return stmt;
      },
      async first<T>(): Promise<T | null> {
        if (self.failing.some((f) => sql.includes(f))) throw new Error("D1_ERROR: storage unavailable");
        return (self.answers.find((a) => sql.includes(a.match))?.row ?? null) as T | null;
      },
      async all<T>(): Promise<{ results: T[] }> {
        return { results: [] };
      },
      async run(): Promise<void> {
        if (self.failing.some((f) => sql.includes(f))) throw new Error("D1_ERROR: storage unavailable");
      },
    };
    return stmt;
  }

  async batch(stmts: unknown[]): Promise<void> {
    void stmts;
    if (this.batchFails) throw new Error("D1_ERROR: batch failed");
    this.batched += 1;
  }
}

/** The statements a batch prepared, in order. */
function batchSql(db: FakeDb): string[] {
  return db.stmts.map((s) => s.sql);
}

function make(over: Partial<Parameters<typeof bindBillingStore<Ent>>[0]> = {}) {
  return bindBillingStore<Ent>({
    entitlements: engine,
    catalog: { plans: PLANS, retired: RETIRED, packs: PACKS, version: "7" },
    defaultSubscription: { plan_id: "free", status: "active" },
    materialiseOnRead: false,
    ...over,
  });
}

let db: FakeDb;
beforeEach(() => {
  db = new FakeDb();
});

const asD1 = (x: FakeDb) => x as unknown as D1Database;

describe("the catalog migration", () => {
  it("NULLS the Stripe id pair when a plan's price has moved", async () => {
    await make().seedBilling(asD1(db));
    const nulling = batchSql(db).filter((s) => s.includes("stripe_product_id = NULL"));
    expect(nulling).toHaveLength(1);
    // Guarded on the price actually differing, so an unchanged plan keeps its ids.
    expect(nulling[0]).toContain("price_usd_month <> ?");
    const stmt = db.stmts.find((s) => s.sql.includes("stripe_product_id = NULL"))!;
    expect(stmt.binds).toEqual(["paid", 39]);
  });

  it("reconciles a live plan in full, binding its own `active`", async () => {
    await make().seedBilling(asD1(db));
    const reconcile = db.stmts.find((s) => s.sql.includes("UPDATE plans SET name = ?"))!;
    expect(reconcile.binds).toEqual(["Paid", 39, PAID, 1, 1, "paid"]);
  });

  it("only DEACTIVATES a retired plan — never its price or entitlements", async () => {
    await make().seedBilling(asD1(db));
    const retired = db.stmts.filter((s) => s.sql.includes("UPDATE plans SET active = 0"));
    expect(retired).toHaveLength(1);
    expect(retired[0]!.binds).toEqual([90, "old"]);
    // Exactly one full reconcile ran, and it was the live plan's.
    expect(db.stmts.filter((s) => s.sql.includes("UPDATE plans SET name = ?"))).toHaveLength(1);
    // The retired row is still INSERTed, so a fresh database has it to resolve.
    const inserts = db.stmts.filter((s) => s.sql.includes("INSERT OR IGNORE INTO plans"));
    expect(inserts.map((s) => s.binds[0])).toEqual(["paid", "old"]);
  });

  it("skips everything when the version stamp already matches", async () => {
    db.answers.push({ match: "FROM app_config", row: { value: "7" } });
    await make().seedBilling(asD1(db));
    expect(db.batched).toBe(0);
  });

  it("does NOT stamp the version when the migration throws", async () => {
    // Leaving it unstamped is what makes the next call retry — every statement
    // is idempotent. Stamping a half-applied catalog skips it forever.
    db.batchFails = true;
    await expect(make().seedBilling(asD1(db))).resolves.toBeUndefined();
    expect(db.stmts.some((s) => s.sql.includes("INTO app_config"))).toBe(false);
  });

  it("stamps the version once the migration succeeds", async () => {
    await make().seedBilling(asD1(db));
    const stamp = db.stmts.find((s) => s.sql.includes("INTO app_config"))!;
    expect(stamp.binds).toContain("7");
  });
});

describe("resolving a tenant's entitlements", () => {
  it("resolves the plan blob and clamps by status", async () => {
    db.answers.push({ match: "FROM subscriptions", row: { tenant_id: "t", plan_id: "paid", status: "active", overrides_json: null } });
    db.answers.push({ match: "FROM plans WHERE id", row: { entitlements_json: PAID } });
    const ent = await make().tenantEntitlements(asD1(db), "t");
    expect(ent.quotas.seats).toBe(10);
    expect(ent.features.fancy).toBe(true);
  });

  it("falls back to free for a tenant with no row at all", async () => {
    const ent = await make().tenantEntitlements(asD1(db), "nobody");
    expect(ent).toEqual(FREE);
  });

  it("clamps a suspended tenant all the way to free, in one place", async () => {
    db.answers.push({ match: "FROM subscriptions", row: { tenant_id: "t", plan_id: "paid", status: "suspended", overrides_json: null } });
    db.answers.push({ match: "FROM plans WHERE id", row: { entitlements_json: PAID } });
    const ent = await make().tenantEntitlements(asD1(db), "t");
    expect(ent).toEqual(FREE);
  });

  it("looks the plan up by the configured default when the tenant has no row", async () => {
    await make({ defaultSubscription: { plan_id: "starter", status: "active" } }).tenantEntitlements(asD1(db), "t");
    const lookup = db.stmts.find((s) => s.sql.includes("FROM plans WHERE id"))!;
    expect(lookup.binds).toEqual(["starter"]);
  });
});

describe("a failed read is not an answer", () => {
  it("propagates a D1 error from the plan lookup rather than resolving to free", async () => {
    db.answers.push({ match: "FROM subscriptions", row: { tenant_id: "t", plan_id: "paid", status: "active", overrides_json: null } });
    db.failing.push("FROM plans WHERE id");
    await expect(make().tenantEntitlements(asD1(db), "t")).rejects.toThrow(/D1_ERROR/);
  });

  it("propagates a D1 error from the subscription lookup", async () => {
    db.failing.push("FROM subscriptions");
    await expect(make().tenantEntitlements(asD1(db), "t")).rejects.toThrow(/D1_ERROR/);
  });
});

describe("the two seams the apps configure", () => {
  it("materialiseOnRead writes the default row, and not writing it is also a choice", async () => {
    await make({ materialiseOnRead: true }).tenantEntitlements(asD1(db), "t");
    const insert = db.stmts.find((s) => s.sql.includes("INSERT OR IGNORE INTO subscriptions"));
    expect(insert?.binds.slice(0, 3)).toEqual(["t", "free", "active"]);

    const quiet = new FakeDb();
    await make({ materialiseOnRead: false }).tenantEntitlements(asD1(quiet), "t");
    expect(quiet.stmts.some((s) => s.sql.includes("INSERT OR IGNORE INTO subscriptions"))).toBe(false);
  });

  it("writes the app's own default status, not a hard-coded one", async () => {
    await make({ defaultSubscription: { plan_id: "free", status: "incomplete" } }).ensureSubscription(asD1(db), "t");
    const insert = db.stmts.find((s) => s.sql.includes("INSERT OR IGNORE INTO subscriptions"))!;
    expect(insert.binds.slice(0, 3)).toEqual(["t", "free", "incomplete"]);
  });

  it("returns the default row itself, so a caller never sees null after ensure", async () => {
    const row = await make().ensureSubscription(asD1(db), "t");
    expect(row).toMatchObject({ tenant_id: "t", plan_id: "free", status: "active", comp: 0, overrides_json: null });
  });
});

describe("the quota ceiling", () => {
  beforeEach(() => {
    db.answers.push({ match: "FROM subscriptions", row: { tenant_id: "t", plan_id: "paid", status: "active", overrides_json: null } });
    db.answers.push({ match: "FROM plans WHERE id", row: { entitlements_json: PAID } });
  });

  it("allows one more below the ceiling and refuses at it", async () => {
    const store = make();
    await expect(store.withinQuota(asD1(db), "t", "seats", 9)).resolves.toEqual({ ok: true, max: 10 });
    await expect(store.withinQuota(asD1(db), "t", "seats", 10)).resolves.toEqual({ ok: false, max: 10 });
  });

  it("treats -1 as unlimited", async () => {
    await expect(make().withinQuota(asD1(db), "t", "widgets", 10_000)).resolves.toEqual({ ok: true, max: -1 });
  });

  it("reads a feature through the same resolution, so the clamp applies to both", async () => {
    await expect(make().hasFeature(asD1(db), "t", "fancy")).resolves.toBe(true);
  });
});
