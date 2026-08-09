/**
 * WHAT THIS APP CALLS ITSELF IN STRIPE.
 *
 * Two strings, and one of them is permanent.
 *
 * ⚠️ `metadataPrefix` BECOMES LIVE DATA THE MOMENT ANYTHING IS SOLD.
 * `metadata[<prefix>_tenant]` is stamped on every customer, subscription, price
 * and checkout session this app creates, and `@4dl/billing-rail` reads it back
 * to decide which of several apps on ONE Stripe account an incoming event
 * belongs to. Changing it later orphans everything already sold: the events
 * still arrive, the lookup finds nothing, payments succeed and nothing is
 * activated. Pick it once, before the first sale, and never touch it again.
 *
 * `productPrefix` is cosmetic — it is what a buyer reads on their receipt and on
 * their card statement, so it is worth spelling the way the marketing site does.
 * `syncCatalog` pushes a rename to Stripe on every run, so this one CAN change.
 *
 * There is deliberately nothing else in this file. The Stripe CLIENT, the webhook
 * verification, the two-lane credential store, the catalog sync and the console
 * routes are all `@4dl/billing`'s — an app that starts writing `fetch` against
 * api.stripe.com here has taken on the part of this that is genuinely hard.
 */

import type { StripeBranding } from "@4dl/billing";

export const STRIPE_BRANDING: StripeBranding = { metadataPrefix: "template", productPrefix: "Template" };
