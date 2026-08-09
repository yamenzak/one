/**
 * THE MIGRATION THAT LETS SCENA ADOPT `BILLING_SCHEMA`, against a real database
 * in the shape it is migrating FROM.
 *
 * ── Why this cannot be a unit test over a fake D1 ───────────────────────────
 *
 * Every interesting statement in `billing-reconcile.ts` is SQLite's rather than
 * ours: `pragma_table_info` is what decides whether a step runs at all,
 * `typeof(col) IN ('integer','real')` is what makes the timestamp conversion
 * idempotent, and `strftime('%Y-%m-%dT%H:%M:%fZ', ms/1000.0, 'unixepoch')` is
 * asserted here to produce the SAME BYTES as `Date.prototype.toISOString`,
 * because the columns are compared with `<` in SQL and ISO's ordering is only
 * lexicographic if the format is exact. A fake would be asserting the fixture.
 *
 * It runs against `MIGRATION_DB`, a second empty D1 the vitest config binds for
 * this file alone — `env.DB` is the CURRENT shape, seeded once and shared by the
 * whole suite, so rebuilding the legacy tables inside it would take the catalog
 * every other test reads down with it.
 *
 * ── The failure being guarded, and it is a total outage ─────────────────────
 *
 * `BILLING_SCHEMA` declares `CREATE INDEX … ON credit_ledger(tenant_id, at)`.
 * On a pre-migration database that column is `created_at`, so the index throws
 * `no such column: at`, the whole DDL batch throws, `applySchema` throws with
 * it, and EVERY route that touches D1 answers 500. The last test in the first
 * block is that exact sequence — legacy tables, reconcile, then the shared
 * module — and it is the reason the reconciler runs BEFORE `applySchema` rather
 * than as one more module inside it.
 */

import { env } from "cloudflare:test";
import { applySchema } from "@4dl/core";
import { BILLING_SCHEMA } from "@4dl/billing";
import { beforeEach, describe, expect, it } from "vitest";
import { reconcileLegacyBilling } from "../src/billing-reconcile.js";

const db = env.MIGRATION_DB;

/**
 * The five tables EXACTLY as `SCENA_SCHEMA` declared them before the move.
 *
 * Copied rather than imported on purpose: they are gone from the app, and the
 * point of this fixture is to be the shape that is no longer in the codebase.
 */
const LEGACY_DDL = [
  "CREATE TABLE plans (id TEXT PRIMARY KEY, name TEXT, price_cents INTEGER, currency TEXT, interval TEXT, entitlements_json TEXT, stripe_product_id TEXT, stripe_price_id TEXT, sort INTEGER, active INTEGER, created_at INTEGER)",
  "CREATE TABLE subscriptions (tenant_id TEXT PRIMARY KEY, plan_id TEXT, status TEXT, comp INTEGER, stripe_customer_id TEXT, stripe_sub_id TEXT, pending_plan_id TEXT, current_period_end INTEGER, past_due_at INTEGER, suspend_at INTEGER, delete_at INTEGER, updated_at INTEGER, overrides_json TEXT)",
  "CREATE TABLE credit_packs (id TEXT PRIMARY KEY, name TEXT, credits INTEGER, price_cents INTEGER, currency TEXT, stripe_product_id TEXT, stripe_price_id TEXT, sort INTEGER, active INTEGER)",
  "CREATE TABLE credit_ledger (id TEXT PRIMARY KEY, tenant_id TEXT, delta INTEGER, balance INTEGER, reason TEXT, ref TEXT, created_at INTEGER)",
  "CREATE TABLE stripe_events (id TEXT PRIMARY KEY, at INTEGER)",
];

/** A fixed instant, so an assertion can name the exact string it expects. */
const PAST_DUE_MS = 1_754_000_000_000; // 2025-07-31T22:13:20.000Z
const DELETE_MS = 1_756_592_000_000;

async function dropAll(): Promise<void> {
  for (const t of ["plans", "subscriptions", "credit_packs", "credit_ledger", "stripe_events"]) {
    await db.exec(`DROP TABLE IF EXISTS ${t}`);
  }
  // The marker rows too, or `applySchema` skips the module it is meant to apply.
  await db.prepare("DELETE FROM app_config WHERE key LIKE 'schema:%'").run().catch(() => undefined);
}

/** A pre-migration database with one row in each table. */
async function seedLegacy(): Promise<void> {
  await dropAll();
  for (const sql of LEGACY_DDL) await db.exec(sql);
  await db.batch([
    db
      .prepare("INSERT INTO plans (id, name, price_cents, currency, interval, entitlements_json, stripe_price_id, sort, active, created_at) VALUES (?, ?, ?, 'usd', 'month', '{}', ?, ?, 1, ?)")
      .bind("pro", "Pro", 4900, "price_legacy", 2, PAST_DUE_MS),
    db.prepare("INSERT INTO credit_packs (id, name, credits, price_cents, currency, sort, active) VALUES (?, ?, ?, ?, 'usd', ?, 1)").bind("pack_5k", "5,500 credits", 5500, 500, 1),
    db.prepare("INSERT INTO credit_ledger (id, tenant_id, delta, balance, reason, ref, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)").bind("led_1", "t1", -12, 988, "generate", PAST_DUE_MS),
    db
      .prepare("INSERT INTO subscriptions (tenant_id, plan_id, status, comp, current_period_end, past_due_at, suspend_at, delete_at, updated_at) VALUES (?, 'pro', 'past_due', 0, NULL, ?, NULL, ?, ?)")
      .bind("t1", PAST_DUE_MS, DELETE_MS, PAST_DUE_MS),
  ]);
}

const plan = () => db.prepare("SELECT * FROM plans WHERE id = 'pro'").first<Record<string, unknown>>();
const sub = () => db.prepare("SELECT * FROM subscriptions WHERE tenant_id = 't1'").first<Record<string, unknown>>();

describe("a pre-platform Scena database", () => {
  beforeEach(seedLegacy);

  it("moves cents to dollars and `sort` to `ord`, keeping the value", async () => {
    const applied = await reconcileLegacyBilling(db);
    expect(applied).toContain("plans.price_cents → price_usd_month");
    expect(applied).toContain("plans.sort → ord");

    const p = await plan();
    expect(p?.price_usd_month).toBe(49);
    expect(p?.ord).toBe(2);
    // The legacy columns are LEFT. Dropping a column on a live table to reclaim
    // four bytes a row is a risk taken for tidiness; nothing reads them now.
    expect(p?.price_cents).toBe(4900);
    // ⚠️ And the Stripe id survives, which is the whole reason this is a column
    // move rather than a drop-and-reseed. Losing it orphans the live Stripe
    // price every existing subscriber is billed against.
    expect(p?.stripe_price_id).toBe("price_legacy");
  });

  it("does the same for packs, and renames the ledger's timestamp", async () => {
    const applied = await reconcileLegacyBilling(db);
    expect(applied).toContain("credit_packs.price_cents → price_usd");
    expect(applied).toContain("credit_ledger.created_at → at");

    const pk = await db.prepare("SELECT * FROM credit_packs WHERE id = 'pack_5k'").first<Record<string, unknown>>();
    expect(pk?.price_usd).toBe(5);
    expect(pk?.ord).toBe(1);
    // Both are epoch milliseconds; this one really is only a rename.
    const led = await db.prepare("SELECT * FROM credit_ledger WHERE id = 'led_1'").first<Record<string, unknown>>();
    expect(led?.at).toBe(PAST_DUE_MS);
  });

  it("converts the subscription timestamps to the SAME BYTES `toISOString` writes", async () => {
    await reconcileLegacyBilling(db);
    const s = await sub();
    // Not "an ISO-ish string": the exact one. `past_due_at < ?` is compared
    // lexicographically in SQL against a value JavaScript produced, so a
    // format that merely parses is a ladder that fires on the wrong day.
    expect(s?.past_due_at).toBe(new Date(PAST_DUE_MS).toISOString());
    expect(s?.delete_at).toBe(new Date(DELETE_MS).toISOString());
    expect(s?.updated_at).toBe(new Date(PAST_DUE_MS).toISOString());
    // A NULL is left alone rather than becoming the epoch.
    expect(s?.current_period_end).toBeNull();
  });

  it("lets `BILLING_SCHEMA` apply afterwards — which it CANNOT before", async () => {
    /*
      The regression, in the order it happens.

      `credit_ledger` has `created_at` and no `at`, so the shared module's
      `CREATE INDEX … (tenant_id, at)` fails, `db.exec` throws the whole batch,
      and `applySchema` throws — every route that touches D1 then answers 500.
      This is the `AI_LEGACY_RESET` outage in a different table, and it is why
      the reconciler is called before the runner rather than inside it.
    */
    await expect(applySchema(db, [BILLING_SCHEMA])).rejects.toThrow(/no such column|at/i);

    await seedLegacy();
    await reconcileLegacyBilling(db);
    await expect(applySchema(db, [BILLING_SCHEMA])).resolves.toBeUndefined();
    // And the column the shared module ALTERs in arrives with it.
    expect(Object.keys((await sub()) ?? {})).toContain("adjustments_json");
  });

  it("is idempotent — a second run converts nothing twice", async () => {
    await reconcileLegacyBilling(db);
    const after = await sub();
    // The `typeof` guard is what makes this true: an ISO string is neither
    // 'integer' nor 'real', so the UPDATE matches no rows. Without it the
    // second run would read "2025-07-31T…" as an epoch and produce 1970.
    expect(await reconcileLegacyBilling(db)).toEqual([]);
    expect((await sub())?.past_due_at).toBe(after?.past_due_at);
    expect((await plan())?.price_usd_month).toBe(49);
  });
});

describe("a database that never had the legacy shape", () => {
  it("is left completely alone, in silence", async () => {
    await dropAll();
    await applySchema(db, [BILLING_SCHEMA]);
    // No legacy column exists, so every step is SKIPPED rather than attempted.
    // This is the reason the reconciler reads `pragma_table_info` instead of
    // being a `SchemaModule` full of backfills: those would each fail to PARSE
    // here and print an alarming warning about a column that is correctly
    // absent, on every fresh deployment and every test isolate.
    expect(await reconcileLegacyBilling(db)).toEqual([]);
  });

  it("skips a database with no billing tables at all", async () => {
    await dropAll();
    expect(await reconcileLegacyBilling(db)).toEqual([]);
  });
});
