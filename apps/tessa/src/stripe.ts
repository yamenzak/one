/**
 * Tessa's Stripe client — re-exported from `@4dl/billing`.
 *
 * Nothing in that module is Tessa's: lane config (test/live, and the mismatch
 * detector that stops a live key paying out against a test catalog), webhook
 * signature verification, the catalog sync, and the id stash that survives a
 * lane swap. Kept as a local module so call sites keep one import path.
 */
export * from "@4dl/billing";

import { ensureCustomer as ensureCustomerFor, syncCatalog as syncCatalogFor, type StripeBranding } from "@4dl/billing";

/**
 * ⚠️ `metadataPrefix` becomes LIVE DATA the moment anything is sold.
 * `metadata[tessa_tenant]` is stamped on every Stripe customer, checkout session
 * and subscription this deployment creates, and the webhook handlers read it
 * back to find the tenant. Changing it later orphans every existing customer —
 * payments would succeed while nothing was activated. It stays `tessa`.
 */
export const STRIPE_BRANDING: StripeBranding = { metadataPrefix: "tessa", productPrefix: "Tessa" };

/**
 * This app's slug on the SHARED Stripe rail — the value of `metadata.app`.
 *
 * One Stripe account serves every 4DL app, so an event has to say which app it
 * belongs to. `@4dl/billing-rail` attributes on `metadata.app` first, then a
 * legacy `<prefix>_*` key, then the app's own `claims` lookup — and parks what
 * it cannot attribute rather than answering 200 with the id already claimed.
 *
 * Same permanence as `metadataPrefix`, and separate from it because the prefix
 * is a key SHAPE (`tessa_tenant`) while this is an explicit VALUE.
 */
export const TESSA_APP = "tessa";

export const ensureCustomer = (db: D1Database, secretKey: string, tenantId: string, email?: string) =>
  ensureCustomerFor(db, secretKey, tenantId, STRIPE_BRANDING, email);

export const syncCatalog = (db: D1Database, secretKey: string) => syncCatalogFor(db, secretKey, STRIPE_BRANDING);
