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
  /**
   * ⚠️ BUMP THIS WHENEVER A STATEMENT BELOW CHANGES. Nothing detects intent.
   *
   * `4 → 5` adds `subject_subscriptions.overrides_json` — see the ALTER.
   *
   * `3 → 4` adds `subject_package_grants` — see its comment. Without it
   * `once_per_customer` was unenforceable on every repeat sale, because the
   * only record of "this customer got this package" was a single `package_id`
   * column that the EXTEND path never rewrote.
   *
   * `2 → 3` because the tenant payment rail added `purchase_intents` and
   * `tenant_payment_settings` (plus the `pay_link` ALTER) while leaving the
   * version at "2" — a version already applied in production. The marker row
   * short-circuits the whole module, so on every LIVE database those tables were
   * never created, and "Getting paid" answered HTTP 500 on both its panels.
   *
   * The direction of the failure is what makes it nasty: a FRESH database runs
   * the module in full, so every test and every Miniflare run had the tables and
   * was green. Only databases with history were broken — i.e. only production.
   */
  version: "5",
  ddl: [
    "CREATE TABLE IF NOT EXISTS packages (id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, description TEXT, one_time_price_cents INTEGER, monthly_price_cents INTEGER, installment_months INTEGER, currency TEXT DEFAULT 'usd', budgets_json TEXT, addons_json TEXT, flags_json TEXT, visibility TEXT DEFAULT 'private', restricted_subject_id TEXT, once_per_customer INTEGER DEFAULT 0, stripe_product_id TEXT, stripe_price_id TEXT, stripe_monthly_price_id TEXT, active INTEGER DEFAULT 1, created_at TEXT);",
    "CREATE INDEX IF NOT EXISTS idx_packages_tenant ON packages(tenant_id, active);",
    "CREATE TABLE IF NOT EXISTS subject_subscriptions (id TEXT PRIMARY KEY, tenant_id TEXT, subject_id TEXT, package_id TEXT, status TEXT DEFAULT 'active', payment_status TEXT DEFAULT 'none', budgets_json TEXT, addons_json TEXT, flags_json TEXT, source TEXT DEFAULT 'admin', installments_paid INTEGER, installments_total INTEGER, stripe_sub_id TEXT, stripe_checkout_id TEXT, started_at TEXT, updated_at TEXT, notes TEXT);",

    /**
     * A purchase the customer STARTED, before anyone knows whether it was paid.
     *
     * The tenant is paid on their own merchant account by their own provider, so
     * the platform is never in the money path and cannot ask "did this settle?".
     * It learns either from a signed notification or from the tenant saying so.
     * Both need somewhere to land, and that is this table.
     *
     * `id` IS the reference handed to the provider, which is why it is generated
     * to the narrowest shape any provider accepts (see `isValidReference`) — a
     * provider that dislikes it may drop it SILENTLY, leaving a customer who
     * paid with nothing connecting them to the payment. When that happens the
     * row simply stays `pending` and shows up on the tenant's reconciliation
     * list, which is the whole reason a pending row is written up front rather
     * than conjured when a webhook arrives.
     *
     * `external_id` is the provider's own id, and the idempotency key: a
     * provider that retries a delivery must not grant the package twice.
     */
    "CREATE TABLE IF NOT EXISTS purchase_intents (id TEXT PRIMARY KEY, tenant_id TEXT, subject_id TEXT, package_id TEXT, provider TEXT, status TEXT DEFAULT 'pending', amount_cents INTEGER, currency TEXT DEFAULT 'usd', external_id TEXT, checkout_url TEXT, created_at TEXT, settled_at TEXT, settled_by TEXT, note TEXT);",
    "CREATE INDEX IF NOT EXISTS idx_purchase_intents_tenant ON purchase_intents(tenant_id, status, created_at);",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_intents_external ON purchase_intents(tenant_id, external_id);",
    "CREATE INDEX IF NOT EXISTS idx_subject_subs ON subject_subscriptions(subject_id, status);",
    "CREATE INDEX IF NOT EXISTS idx_subject_subs_status ON subject_subscriptions(status);",
    "CREATE INDEX IF NOT EXISTS idx_subject_subs_stripe ON subject_subscriptions(stripe_sub_id);",
    "CREATE TABLE IF NOT EXISTS redemption_codes (id TEXT PRIMARY KEY, tenant_id TEXT, code TEXT, days_to_add INTEGER, target_feature TEXT DEFAULT 'all', max_uses INTEGER DEFAULT 1, used_count INTEGER DEFAULT 0, used_by_json TEXT, expires_at TEXT, active INTEGER DEFAULT 1, restricted_package_id TEXT, restricted_subject_id TEXT, created_by TEXT, created_at TEXT);",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_redemption_code ON redemption_codes(tenant_id, code);",
    "CREATE TABLE IF NOT EXISTS redemption_uses (code_id TEXT, subject_id TEXT, at TEXT, PRIMARY KEY (code_id, subject_id));",
    "CREATE TABLE IF NOT EXISTS promo_codes (id TEXT PRIMARY KEY, tenant_id TEXT, code TEXT, discount_type TEXT DEFAULT 'percent', percent_off INTEGER, amount_off_cents INTEGER, restricted_package_id TEXT, restricted_subject_id TEXT, scope TEXT DEFAULT 'tenant', max_redemptions INTEGER, redemption_count INTEGER DEFAULT 0, expires_at TEXT, active INTEGER DEFAULT 1, stripe_coupon_id TEXT, stripe_promo_id TEXT, created_by TEXT, created_at TEXT);",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_code ON promo_codes(tenant_id, code);",
    "CREATE TABLE IF NOT EXISTS addon_types (id TEXT PRIMARY KEY, tenant_id TEXT, slug TEXT, label TEXT, kind TEXT DEFAULT 'consultation', duration_minutes INTEGER, standalone_price_cents INTEGER, active INTEGER DEFAULT 1);",

    /**
     * How ONE tenant gets paid by its own customers.
     *
     * Its own table rather than columns on `tenant_settings`, because that table
     * belongs to `@4dl/tenancy` and this is commerce's concern — a deployment
     * that never sells anything should not carry the columns.
     *
     * `config_json` holds ONLY verification-grade credentials. `assertSafeConfig`
     * refuses anything whose key names a credential that can act on the tenant's
     * merchant account, and that rule is what keeps this table from becoming a
     * vault of live payment keys. See providers.ts.
     */
    "CREATE TABLE IF NOT EXISTS tenant_payment_settings (tenant_id TEXT PRIMARY KEY, provider TEXT DEFAULT 'manual', config_json TEXT, updated_at TEXT);",

    /**
     * EVERY package a customer was ever given, whatever absorbed its days.
     *
     * ── The bug this table exists to make impossible ────────────────────────
     *
     * Access QUEUES: a second purchase folds its budgets into the customer's
     * live subscription row rather than opening another. That is the right
     * behaviour for runway and it destroyed the only record of what was bought,
     * because the row keeps the FIRST package's `package_id` and nothing wrote
     * the second one anywhere.
     *
     * So `once_per_customer` — a real selling rule, an intro offer — asked
     * "is there a row with package_id = X" and got `no` forever. A customer with
     * any live access could be granted, or could buy, the same once-only package
     * without limit, each time stacking more days. That is where impossible day
     * counts came from: not the budget arithmetic, which is correct, but the
     * same package being applied over and over.
     *
     * An append-only ledger answers the question the rule actually asks. It is
     * also the history an owner needs to work out what happened to a customer,
     * which the subscription row could never show.
     *
     * `source` is how it arrived: admin | stripe | provider | manual | code.
     * `days_json` snapshots the specs applied, because a package's budgets can
     * be edited afterwards and the ledger must say what was granted THEN.
     */
    "CREATE TABLE IF NOT EXISTS subject_package_grants (id TEXT PRIMARY KEY, tenant_id TEXT, subject_id TEXT, package_id TEXT, subscription_id TEXT, source TEXT, days_json TEXT, actor_user_id TEXT, at TEXT);",
    "CREATE INDEX IF NOT EXISTS idx_pkg_grants_subject ON subject_package_grants(subject_id, package_id);",
    "CREATE INDEX IF NOT EXISTS idx_pkg_grants_tenant ON subject_package_grants(tenant_id, at);",
  ],
  alters: [
    "ALTER TABLE promo_codes ADD COLUMN restricted_subject_id TEXT",
    "ALTER TABLE promo_codes ADD COLUMN scope TEXT DEFAULT 'tenant'",
    "ALTER TABLE redemption_codes ADD COLUMN restricted_package_id TEXT",
    "ALTER TABLE redemption_codes ADD COLUMN restricted_subject_id TEXT",
    // The tenant's own checkout URL for THIS package, on their own provider.
    // Per-package because a hosted payment link is fixed-price, so one link
    // cannot serve a catalogue.
    "ALTER TABLE packages ADD COLUMN pay_link TEXT",
    /**
     * PER-SUBJECT capability overrides on ONE access row.
     *
     * `flags_json` beside it is a SNAPSHOT of the package's flags, copied whole
     * at grant time — so editing it to give one customer one extra capability
     * works and then nobody can tell which capabilities came with the package
     * and which a staff member decided. This column is the sparse diff: only the
     * keys somebody deliberately changed, so "reset to the package" is deleting
     * a key rather than reconstructing what the package used to say.
     *
     * The SHAPE is the app's — this package never reads it. It is stored here
     * because it belongs to the access row, and an app that sells no
     * capabilities simply leaves it null.
     */
    "ALTER TABLE subject_subscriptions ADD COLUMN overrides_json TEXT",
  ],
  scoped: {
    tenantColumn: "tenant_id",
    tenantTables: ["packages", "subject_subscriptions", "redemption_codes", "promo_codes", "addon_types", "purchase_intents", "tenant_payment_settings", "subject_package_grants"],
    // `redemption_uses` has no tenant column — it is keyed on (code_id,
    // subject_id) — so a tenant purge clears it through its codes, and a
    // subject purge through this one.
    subjectColumn: "subject_id",
    subjectTables: ["subject_subscriptions", "redemption_uses", "purchase_intents", "subject_package_grants"],
  },
};
