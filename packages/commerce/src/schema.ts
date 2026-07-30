/**
 * The tables commerce owns — a tenant selling timed access to its own customers.
 *
 *   packages            what is for sale: a price, and the budgets + capability
 *                       flags a purchase grants.
 *   subject_subscriptions one row per customer's live access. `budgets_json` is
 *                       the runway; days DERIVE from `expiresAt` at read time,
 *                       so there is no counter to drift and no cron to run.
 *   redemption_codes    prepaid access, redeemed once per customer.
 *   redemption_uses     which customer used which code — the once-per-customer
 *                       enforcement, keyed on the pair.
 *   promo_codes         discounts applied in our own code (no provider coupons).
 *   addon_types         consumable balances sold alongside access.
 *
 * The subject column is `subject_id`, and the table is `subject_subscriptions`.
 * Both said `client` until the last moment before the first deploy, which was
 * the only window in which renaming them was free — after that a rename is a
 * migration over every tenant's purchase history, for a cosmetic gain, and the
 * names would have been frozen for every app that ever consumes this package.
 *
 * ⚠️ **The rename is NOT a migration.** Bumping the version creates the new
 * tables; it does not move rows out of the old ones, and nothing here drops
 * them. On a database that already held `client_subscriptions`, the old table
 * survives with its data and the app reads the new, empty one. That is correct
 * for a fresh deploy and WRONG for anything else — which is exactly how the E2E
 * suite found it, running against a persisted local D1 where the marker said
 * "commerce is applied" and every purchase query then hit `no such table`.
 */

import type { SchemaModule } from "@4dl/core";

export const COMMERCE_SCHEMA: SchemaModule = {
  id: "commerce",
  version: "2",
  ddl: [
    "CREATE TABLE IF NOT EXISTS packages (id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, description TEXT, one_time_price_cents INTEGER, monthly_price_cents INTEGER, installment_months INTEGER, currency TEXT DEFAULT 'usd', budgets_json TEXT, addons_json TEXT, flags_json TEXT, visibility TEXT DEFAULT 'private', restricted_subject_id TEXT, once_per_customer INTEGER DEFAULT 0, stripe_product_id TEXT, stripe_price_id TEXT, stripe_monthly_price_id TEXT, active INTEGER DEFAULT 1, created_at TEXT);",
    "CREATE INDEX IF NOT EXISTS idx_packages_tenant ON packages(tenant_id, active);",
    "CREATE TABLE IF NOT EXISTS subject_subscriptions (id TEXT PRIMARY KEY, tenant_id TEXT, subject_id TEXT, package_id TEXT, status TEXT DEFAULT 'active', payment_status TEXT DEFAULT 'none', budgets_json TEXT, addons_json TEXT, flags_json TEXT, source TEXT DEFAULT 'admin', installments_paid INTEGER, installments_total INTEGER, stripe_sub_id TEXT, stripe_checkout_id TEXT, started_at TEXT, updated_at TEXT, notes TEXT);",
    "CREATE INDEX IF NOT EXISTS idx_subject_subs ON subject_subscriptions(subject_id, status);",
    "CREATE INDEX IF NOT EXISTS idx_subject_subs_status ON subject_subscriptions(status);",
    "CREATE INDEX IF NOT EXISTS idx_subject_subs_stripe ON subject_subscriptions(stripe_sub_id);",
    "CREATE TABLE IF NOT EXISTS redemption_codes (id TEXT PRIMARY KEY, tenant_id TEXT, code TEXT, days_to_add INTEGER, target_feature TEXT DEFAULT 'all', max_uses INTEGER DEFAULT 1, used_count INTEGER DEFAULT 0, used_by_json TEXT, expires_at TEXT, active INTEGER DEFAULT 1, restricted_package_id TEXT, restricted_subject_id TEXT, created_by TEXT, created_at TEXT);",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_redemption_code ON redemption_codes(tenant_id, code);",
    "CREATE TABLE IF NOT EXISTS redemption_uses (code_id TEXT, subject_id TEXT, at TEXT, PRIMARY KEY (code_id, subject_id));",
    "CREATE TABLE IF NOT EXISTS promo_codes (id TEXT PRIMARY KEY, tenant_id TEXT, code TEXT, discount_type TEXT DEFAULT 'percent', percent_off INTEGER, amount_off_cents INTEGER, restricted_package_id TEXT, restricted_subject_id TEXT, scope TEXT DEFAULT 'tenant', max_redemptions INTEGER, redemption_count INTEGER DEFAULT 0, expires_at TEXT, active INTEGER DEFAULT 1, stripe_coupon_id TEXT, stripe_promo_id TEXT, created_by TEXT, created_at TEXT);",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_code ON promo_codes(tenant_id, code);",
    "CREATE TABLE IF NOT EXISTS addon_types (id TEXT PRIMARY KEY, tenant_id TEXT, slug TEXT, label TEXT, kind TEXT DEFAULT 'consultation', duration_minutes INTEGER, standalone_price_cents INTEGER, active INTEGER DEFAULT 1);",
  ],
  alters: [
    "ALTER TABLE promo_codes ADD COLUMN restricted_subject_id TEXT",
    "ALTER TABLE promo_codes ADD COLUMN scope TEXT DEFAULT 'tenant'",
    "ALTER TABLE redemption_codes ADD COLUMN restricted_package_id TEXT",
    "ALTER TABLE redemption_codes ADD COLUMN restricted_subject_id TEXT",
  ],
  scoped: {
    tenantColumn: "tenant_id",
    tenantTables: ["packages", "subject_subscriptions", "redemption_codes", "promo_codes", "addon_types"],
    // `redemption_uses` has no tenant column — it is keyed on (code_id,
    // subject_id) — so a tenant purge clears it through its codes, and a
    // subject purge through this one.
    subjectColumn: "subject_id",
    subjectTables: ["subject_subscriptions", "redemption_uses"],
  },
};
