/**
 * WHAT A PLAN INCLUDES — this app's entitlement registry, on `@4dl/billing`'s
 * engine.
 *
 * The engine owns the resolution: merge a stored blob onto the free baseline,
 * apply grants (which RAISE a ceiling and never lower one), and zero everything
 * out for a suspended tenant. It cannot own the KEYS — `staffSeats` and
 * `subjects` mean nothing to it, and a warehouse app would have `locations` and
 * `skus`.
 *
 * Two rules the shape enforces:
 *
 *   quotas    a number. `-1` is UNLIMITED, and it always wins a merge.
 *   features  a boolean. A feature nobody sells yet is `false` here, not absent
 *             — an absent key reads as "off" too, but only by accident, and the
 *             conformance test cannot see it.
 */

import { bindEntitlements, type EntitlementShape, type PlanKeyMeta } from "@4dl/billing";

export interface AppEntitlements extends EntitlementShape {
  quotas: {
    /** Owner + staff. The customer role does not consume one. */
    staffSeats: number;
    /** The individuals a tenant may have on its books. */
    subjects: number;
    /** Megabytes in the media bucket. `-1` = unlimited. */
    storageMb: number;
  };
  features: {
    /** Bring-your-own domain (Cloudflare for SaaS). */
    customDomain: boolean;
    /** The AI suite. */
    ai: boolean;
  };
  aiCredits: { monthlyGrant: number };
  trialDays: number;
}

/**
 * The FREE baseline — what a tenant gets with no plan row at all.
 *
 * Every key must appear. The engine merges a stored blob ONTO this, key by key,
 * so a key missing here can never be set by a plan.
 */
export const FREE: AppEntitlements = {
  quotas: { staffSeats: 1, subjects: 5, storageMb: 100 },
  features: { customDomain: false, ai: false },
  aiCredits: { monthlyGrant: 0 },
  trialDays: 0,
};

/** The ENGINE: resolve a stored blob onto FREE, layer grants, clamp on status. */
export const entitlements = bindEntitlements<AppEntitlements>(FREE);

/**
 * COPY FOR THE PLAN EDITOR — `@4dl/admin`'s `PlatformPlansSection` renders these.
 *
 * The key LIST is derived from the engine above, so a quota added to
 * `AppEntitlements` appears in the operator console on its own. What cannot be
 * derived is what the key MEANS, which is why the labels are here rather than in
 * the panel: a shared panel that hard-coded them would be a shared panel with
 * one product's vocabulary in it.
 *
 * A key with no entry still renders, spelled as its key — so forgetting one is
 * ugly rather than broken, and `reserved: true` marks a key that is declared and
 * deliberately not yet enforced (`scripts/entitlement-enforcement.test.mjs`
 * checks that claim, per app, and pins the list so it cannot quietly grow).
 */
export const PLAN_QUOTA_META: Record<string, PlanKeyMeta> = {
  staffSeats: { label: "Team seats", hint: "Owner + staff. A customer does not consume one.", unit: "people" },
  subjects: { label: "Records", hint: "The individuals a tenant may have on its books.", unit: "subjects" },
  storageMb: { label: "Storage", hint: "Megabytes in the media bucket. −1 is unlimited.", unit: "MB" },
};

export const PLAN_FEATURE_META: Record<string, PlanKeyMeta> = {
  customDomain: { label: "Custom domain", hint: "Bring your own domain, with a certificate we manage." },
  ai: { label: "AI suite", hint: "Metered generation. Credits are the other half of what a plan buys." },
};

/*
  THE D1 LOOKUPS ARE `billing-store.ts`'s — `bindBillingStore`, not three
  hand-written queries.

  What was here: `tenantEntitlements`, `hasFeature` and `withinQuota`, each a
  short function over `subscriptions` and `plans`. They read correctly and they
  were the wrong thing to ship in a template, because the package's versions
  carry three rules a re-implementation does not arrive with:

    A FAILED READ IS NOT AN ANSWER. These caught D1 errors into `null`, which
    resolves to the free baseline — so a transient failure silently downgrades a
    PAYING tenant and shows them the finish-setting-up gate. The package lets the
    error propagate: a 500 is visible and retried.

    A RETIRED PLAN STILL RESOLVES. `listPlans` is active-only, but `getPlan` is
    not, because a tenant grandfathered onto a withdrawn tier must still be able
    to read what they hold.

    THE PARKING ROW'S STATUS IS A DECISION. See `billing-store.ts` — Tessa's
    default of `incomplete` held brand-new workspaces read-only on a deployment
    with no Stripe at all.

  Import them from `./billing-store.js`.
*/
