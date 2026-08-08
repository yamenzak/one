/**
 * WHAT A PLAN INCLUDES — this app's entitlement registry, on `@4dl/billing`'s
 * engine.
 *
 * The engine owns the resolution: merge a stored blob onto the free baseline,
 * apply grants (which RAISE a ceiling and never lower one), and zero everything
 * out for a suspended tenant. It cannot own the KEYS — `catalogItems` and
 * `locations` mean nothing to it, and a coaching app would have `clients` and
 * `staffSeats`.
 *
 * Two rules the shape enforces:
 *
 *   quotas    a number. `-1` is UNLIMITED, and it always wins a merge.
 *   features  a boolean. A feature nobody sells yet is `false` here, not absent
 *             — an absent key reads as "off" too, but only by accident, and the
 *             conformance test cannot see it.
 */

import { bindEntitlements, type EntitlementShape } from "@4dl/billing";

export interface AppEntitlements extends EntitlementShape {
  quotas: {
    /**
     * Everyone who works in the centre. Tessa has no customer role — nobody
     * outside the centre signs in — so unlike Kova, EVERY member consumes one.
     */
    staffSeats: number;
    /** Rooms, stores and theatres (the `locations` tree). */
    locations: number;
    /** Distinct catalog items — the TYPES of thing, not the stock on hand. */
    catalogItems: number;
    /** Megabytes in the media bucket: cycle evidence, label photos. `-1` = unlimited. */
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
 *
 * ⚠️ These numbers are NOT a tier anybody is sold. `free` is the PARKING STATE
 * of a centre that has not chosen a plan, and the route guard reports
 * `incomplete` for it on a deployment where Stripe is configured — so on a
 * charging deployment they are unreachable. They are left usable on purpose:
 * they are what a deployment with NO payment rail serves (a self-host, the
 * integration suite), and crippling them bricks exactly the configuration where
 * the gate correctly stands down.
 */
export const FREE: AppEntitlements = {
  quotas: { staffSeats: 2, locations: 2, catalogItems: 50, storageMb: 200 },
  features: { customDomain: false, ai: false },
  aiCredits: { monthlyGrant: 0 },
  trialDays: 0,
};

/** The ENGINE: resolve a stored blob onto FREE, layer grants, clamp on status. */
export const entitlements = bindEntitlements<AppEntitlements>(FREE);

/**
 * The D1 lookups live in `billing-store.ts`, next to the catalog whose shape
 * they read — `tenantEntitlements`, `hasFeature`, `withinQuota`. This file is
 * the REGISTRY only: the keys, and what a tenant gets with no plan at all.
 */

/**
 * WHAT EACH KEY IS CALLED, for the operator console's plan editor.
 *
 * Copy, and therefore the app's — `@4dl/billing`'s `planAdminRoutes` ships the
 * key LIST (it comes off the engine) and this ships the words. A key with no
 * entry here still renders, spelled as its raw key and labelled as new, because
 * an unlabelled setting is a nuisance and an invisible one is a setting nobody
 * knows is there.
 */
export const QUOTA_META: Record<string, { label: string; hint: string; unit?: string }> = {
  staffSeats: { label: "Staff seats", hint: "Everyone who signs in. Tessa has no customer role, so every member takes one." },
  locations: { label: "Locations", hint: "Rooms, stores and theatres in the locations tree." },
  catalogItems: { label: "Catalog items", hint: "Distinct types of instrument or consumable — not the stock on hand." },
  storageMb: { label: "Media storage", hint: "Cycle evidence and label photos.", unit: "MB" },
};

export const FEATURE_META: Record<string, { label: string; hint: string; reserved?: boolean }> = {
  customDomain: { label: "Custom domain", hint: "The centre reaches Tessa at its own address instead of a subdomain." },
  ai: { label: "AI suite", hint: "Label reading and the insight lanes. Metered against the credit balance." },
};
