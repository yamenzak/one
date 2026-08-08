/**
 * THE PLAN EDITOR'S ROUTES, against a fake D1 that records every statement.
 *
 * Three of these rules are invisible from anywhere except the SQL, and each one
 * costs money or capability when it is missing — which is not hypothetical:
 * before this moved into the package, one app had all three, one had none of
 * them because it had no plan editor at all, and one had an editor without the
 * grandfathering.
 *
 *   THE REPRICE NULLS THE STRIPE ID PAIR. `syncCatalog` skips any plan that
 *   already carries a `stripe_price_id`, so a repriced plan keeps charging the
 *   OLD amount forever. There is no failing request and no log line; the only
 *   symptom is an invoice.
 *
 *   LOWERING A LIMIT GRANDFATHERS. Existing tenants are held at what they
 *   bought, through the grant-only override. Raising one needs no write at all.
 *
 *   AN OMITTED `trialDays` MEANS "LEAVE IT ALONE". A client that predates the
 *   field posts back the matrix it rendered, and reading the gap as zero retires
 *   a plan's free trial as a side effect of renaming it.
 *
 * The fake is deliberately dumb — it records `prepare`/`bind` and answers
 * `first` from a canned map. What is under test is which statements we emit.
 */

import { describe, expect, it } from "vitest";
import { bindEntitlements, type EntitlementShape } from "../src/entitlements.js";
import { planAdminRoutes } from "../src/plan-admin-routes.js";

interface Ent extends EntitlementShape {
  quotas: { seats: number; widgets: number };
  features: { fancy: boolean };
}

const FREE: Ent = { quotas: { seats: 1, widgets: 5 }, features: { fancy: false }, aiCredits: { monthlyGrant: 0 }, trialDays: 0 };
const engine = bindEntitlements<Ent>(FREE);

/** The plan under edit: 10 seats, fancy on, a 14-day trial, $39. */
const STORED = JSON.stringify({ quotas: { seats: 10, widgets: -1 }, features: { fancy: true }, aiCredits: { monthlyGrant: 1_000 }, trialDays: 14 });

interface Stmt { sql: string; binds: unknown[] }

class FakeDb {
  stmts: Stmt[] = [];
  answers: { match: string; row: unknown }[] = [];
  rows: { match: string; results: unknown[] }[] = [];
  batches: Stmt[][] = [];

  prepare(sql: string) {
    const self = this;
    const rec: Stmt = { sql, binds: [] };
    this.stmts.push(rec);
    const stmt = {
      bind(...binds: unknown[]) { rec.binds = binds; return stmt; },
      async first<T>(): Promise<T | null> {
        return (self.answers.find((a) => sql.includes(a.match))?.row ?? null) as T | null;
      },
      async all<T>(): Promise<{ results: T[] }> {
        return { results: (self.rows.find((r) => sql.includes(r.match))?.results ?? []) as T[] };
      },
      async run(): Promise<void> {},
      /** So a batched statement can be identified in `batches`. */
      __rec: rec,
    };
    return stmt;
  }

  async batch(stmts: { __rec: Stmt }[]): Promise<void> {
    this.batches.push(stmts.map((s) => s.__rec));
  }
}

function harness(opts: { admin?: boolean; db?: FakeDb } = {}) {
  const db = opts.db ?? new FakeDb();
  db.answers.push({ match: "SELECT entitlements_json, price_usd_month FROM plans", row: { entitlements_json: STORED, price_usd_month: 39 } });
  let seeded = 0;
  const app = planAdminRoutes<Ent>({
    isPlatformAdmin: () => opts.admin !== false,
    seed: async () => { seeded += 1; },
    engine,
    quotaMeta: { seats: { label: "Seats", hint: "People who can sign in." } },
    featureMeta: { fancy: { label: "Fancy", hint: "The paid one." } },
  });
  const env = { DB: db as unknown as D1Database };
  return {
    db,
    seeded: () => seeded,
    get: (path: string) => app.request(path, {}, env),
    patch: (path: string, body: unknown) =>
      app.request(path, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, env),
  };
}

/** Every UPDATE the run emitted against `plans`. */
const planUpdates = (db: FakeDb) => db.stmts.filter((s) => s.sql.startsWith("UPDATE plans SET"));

describe("GET /admin/plans", () => {
  it("hands over the key registry beside the catalog, so the editor is self-updating", async () => {
    const h = harness();
    h.db.rows.push({ match: "FROM plans ORDER BY ord", results: [{ id: "pro", name: "Pro", price_usd_month: 39, entitlements_json: STORED, active: 1, ord: 1 }] });
    h.db.rows.push({ match: "COUNT(*) AS n FROM subscriptions", results: [{ plan_id: "pro", n: 3 }] });
    const body = (await (await h.get("/admin/plans")).json()) as {
      plans: { id: string; tenantCount: number; entitlements: Ent }[];
      quotaKeys: string[]; featureKeys: string[]; quotaMeta: Record<string, unknown>;
    };
    expect(body.quotaKeys).toEqual(["seats", "widgets"]);
    expect(body.featureKeys).toEqual(["fancy"]);
    expect(body.quotaMeta.seats).toEqual({ label: "Seats", hint: "People who can sign in." });
    // The count is what the editor's grandfathering warning is drawn from.
    expect(body.plans[0]).toMatchObject({ id: "pro", tenantCount: 3 });
    expect(body.plans[0]!.entitlements.trialDays).toBe(14);
  });

  it("seeds before it reads, so a fresh deployment does not show an empty catalog", async () => {
    const h = harness();
    await h.get("/admin/plans");
    expect(h.seeded()).toBe(1);
  });

  it("refuses a caller who is not a platform operator", async () => {
    const h = harness({ admin: false });
    expect((await h.get("/admin/plans")).status).toBe(403);
    expect((await h.patch("/admin/plans/pro", { name: "x" })).status).toBe(403);
  });
});

describe("PATCH /admin/plans/:id — the reprice", () => {
  it("NULLS the Stripe id pair and says a re-sync is required", async () => {
    const h = harness();
    const res = await h.patch("/admin/plans/pro", { priceUsdMonth: 49 });
    expect(await res.json()).toMatchObject({ ok: true, stripeResyncRequired: true });
    const sql = planUpdates(h.db)[0]!.sql;
    expect(sql).toContain("stripe_product_id = NULL");
    expect(sql).toContain("stripe_price_id = NULL");
  });

  it("leaves them alone when the price did not actually move", async () => {
    const h = harness();
    const res = await h.patch("/admin/plans/pro", { priceUsdMonth: 39, name: "Pro" });
    expect(await res.json()).toMatchObject({ stripeResyncRequired: false });
    expect(planUpdates(h.db)[0]!.sql).not.toContain("stripe_price_id = NULL");
  });

  it("leaves them alone for an edit that never mentions price", async () => {
    const h = harness();
    await h.patch("/admin/plans/pro", { name: "Professional" });
    expect(planUpdates(h.db)[0]!.sql).not.toContain("stripe_price_id = NULL");
  });
});

describe("PATCH /admin/plans/:id — grandfathering", () => {
  const lower = { quotas: { seats: 3, widgets: -1 }, features: { fancy: true }, aiCredits: { monthlyGrant: 1_000 }, trialDays: 14 };
  const higher = { quotas: { seats: 25, widgets: -1 }, features: { fancy: true }, aiCredits: { monthlyGrant: 1_000 }, trialDays: 14 };

  it("holds every existing tenant at what they bought when a limit is LOWERED", async () => {
    const h = harness();
    h.db.rows.push({ match: "SELECT tenant_id, overrides_json FROM subscriptions", results: [{ tenant_id: "t1", overrides_json: null }, { tenant_id: "t2", overrides_json: null }] });
    const res = await h.patch("/admin/plans/pro", { entitlements: lower });
    expect(await res.json()).toMatchObject({ grandfathered: 2 });
    expect(h.db.batches[0]).toHaveLength(2);
    // The override written back must carry the OLD ceiling, not the new one.
    expect(String(h.db.batches[0]![0]!.binds[0])).toContain("10");
  });

  it("writes NOTHING when a limit is RAISED — that applies at read time", async () => {
    const h = harness();
    h.db.rows.push({ match: "SELECT tenant_id, overrides_json FROM subscriptions", results: [{ tenant_id: "t1", overrides_json: null }] });
    const res = await h.patch("/admin/plans/pro", { entitlements: higher });
    expect(await res.json()).toMatchObject({ grandfathered: 0 });
    expect(h.db.batches).toHaveLength(0);
  });
});

describe("PATCH /admin/plans/:id — the trial", () => {
  const base = { quotas: { seats: 10, widgets: -1 }, features: { fancy: true }, aiCredits: { monthlyGrant: 1_000 } };

  it("KEEPS the existing trial when the field is omitted", async () => {
    // The regression this guards: an older console posts the matrix it knows
    // about, and reading the gap as 0 retires the plan's trial silently.
    const h = harness();
    await h.patch("/admin/plans/pro", { entitlements: base });
    expect(JSON.parse(String(planUpdates(h.db)[0]!.binds[0])).trialDays).toBe(14);
  });

  it("writes a trial the operator actually set", async () => {
    const h = harness();
    await h.patch("/admin/plans/pro", { entitlements: { ...base, trialDays: 30 } });
    expect(JSON.parse(String(planUpdates(h.db)[0]!.binds[0])).trialDays).toBe(30);
  });

  it("lets an operator turn a trial OFF by saying zero", async () => {
    const h = harness();
    await h.patch("/admin/plans/pro", { entitlements: { ...base, trialDays: 0 } });
    expect(JSON.parse(String(planUpdates(h.db)[0]!.binds[0])).trialDays).toBe(0);
  });

  it("refuses a trial Stripe would reject rather than storing it", async () => {
    const h = harness();
    expect((await h.patch("/admin/plans/pro", { entitlements: { ...base, trialDays: 9_999 } })).status).toBe(400);
    expect((await h.patch("/admin/plans/pro", { entitlements: { ...base, trialDays: -1 } })).status).toBe(400);
  });
});

describe("PATCH /admin/plans/:id — the refusals", () => {
  it("404s an unknown plan rather than creating one", async () => {
    const db = new FakeDb();
    const h = harness({ db });
    db.answers.length = 0; // no row comes back
    expect((await h.patch("/admin/plans/nope", { name: "x" })).status).toBe(404);
    expect(planUpdates(db)).toHaveLength(0);
  });

  it("400s a malformed body rather than coercing it", async () => {
    const h = harness();
    // A quota as a string is the exact shape the engine's type coercion exists
    // to stop; refusing it at the door means it never reaches storage either.
    expect((await h.patch("/admin/plans/pro", { entitlements: { quotas: { seats: "10" }, features: {}, aiCredits: { monthlyGrant: 0 } } })).status).toBe(400);
    expect((await h.patch("/admin/plans/pro", { priceUsdMonth: -5 })).status).toBe(400);
  });
});
