/**
 * The tables billing owns.
 *
 *   plans           the catalog a tenant can subscribe to. `entitlements_json`
 *                   is the blob the entitlement engine resolves.
 *   subscriptions   one row per tenant, and the ANCHOR of the dunning ladder:
 *                   `past_due_at` is written once at the first failed payment
 *                   and cleared on recovery, so every rung measures from one
 *                   stable timestamp rather than from the previous rung.
 *   credit_packs    purchasable bundles of metered units.
 *   credit_ledger   the append-only mirror of the credit DO's movements. The DO
 *                   is authoritative; this is the durable history behind it.
 *   stripe_events   webhook idempotency. A payment provider retries, and a
 *                   replayed `invoice.paid` that grants a second month of
 *                   credits is a real bug, not a theoretical one.
 *
 * Composes AFTER `@4dl/tenancy`: the Connect columns an app adds for the
 * tenant-to-customer rail live on `tenant_settings`, a row tenancy creates.
 */

import type { SchemaModule } from "@4dl/core";

export const BILLING_SCHEMA: SchemaModule = {
  id: "billing",
  version: "1",
  ddl: [
    "CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, name TEXT, price_usd_month REAL, entitlements_json TEXT, stripe_product_id TEXT, stripe_price_id TEXT, ord INTEGER, active INTEGER DEFAULT 1);",
    "CREATE TABLE IF NOT EXISTS subscriptions (tenant_id TEXT PRIMARY KEY, plan_id TEXT, status TEXT, comp INTEGER DEFAULT 0, stripe_customer_id TEXT, stripe_sub_id TEXT, pending_plan_id TEXT, current_period_end TEXT, past_due_at TEXT, suspend_at TEXT, delete_at TEXT, overrides_json TEXT, updated_at TEXT);",
    "CREATE INDEX IF NOT EXISTS idx_subs_status ON subscriptions(status);",
    "CREATE INDEX IF NOT EXISTS idx_subs_customer ON subscriptions(stripe_customer_id);",
    "CREATE TABLE IF NOT EXISTS credit_packs (id TEXT PRIMARY KEY, name TEXT, credits INTEGER, price_usd REAL, stripe_product_id TEXT, stripe_price_id TEXT, ord INTEGER, active INTEGER DEFAULT 1);",
    "CREATE TABLE IF NOT EXISTS credit_ledger (id TEXT PRIMARY KEY, tenant_id TEXT, delta INTEGER, balance INTEGER, reason TEXT, ref TEXT, at INTEGER);",
    "CREATE INDEX IF NOT EXISTS idx_ledger_tenant ON credit_ledger(tenant_id, at);",
    "CREATE TABLE IF NOT EXISTS stripe_events (id TEXT PRIMARY KEY, at INTEGER);",
  ],
  // `plans`, `credit_packs` and `stripe_events` are PLATFORM-wide, not a
  // tenant's, so they are deliberately absent from the cascade: purging one
  // tenant must not delete the catalog every other tenant is subscribed to.
  scoped: {
    tenantColumn: "tenant_id",
    tenantTables: ["subscriptions", "credit_ledger"],
  },
};
