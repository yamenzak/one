/**
 * Kova's Stripe client — re-exported from `@4dl/billing`.
 *
 * Nothing in that module is Kova's: lane config (test/live, and the mismatch
 * detector that stops a live key paying out against a test catalog), webhook
 * signature verification, the catalog sync, and the id stash that survives a
 * lane swap. Kept as a local module so the ~15 call sites keep their import
 * path, and so a future Kova-specific helper has an obvious home.
 */
export * from "@4dl/billing";


import { ensureCustomer as ensureCustomerFor, syncCatalog as syncCatalogFor, type StripeBranding } from "@4dl/billing";

/**
 * ⚠️ `metadataPrefix` is LIVE DATA. `metadata[kova_tenant]` is stamped on every
 * Stripe customer, checkout session and subscription this deployment has ever
 * created, and the webhook handlers read it back to find the tenant. Changing it
 * orphans every existing customer — payments would succeed while nothing is
 * activated. It stays `kova`.
 */
export const STRIPE_BRANDING: StripeBranding = { metadataPrefix: "kova", productPrefix: "Kova" };

export const ensureCustomer = (db: D1Database, secretKey: string, tenantId: string, email?: string) =>
  ensureCustomerFor(db, secretKey, tenantId, STRIPE_BRANDING, email);

export const syncCatalog = (db: D1Database, secretKey: string) => syncCatalogFor(db, secretKey, STRIPE_BRANDING);
