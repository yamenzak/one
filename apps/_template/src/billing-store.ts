/**
 * THE CATALOG — what this app sells, and the store around it.
 *
 * The STORE is `@4dl/billing`'s `bindBillingStore`: the ordered active-only
 * list, the by-id lookup that must still resolve a RETIRED tier (a tenant
 * grandfathered onto one still has to be able to read their own plan), the
 * version-stamped seeding, the entitlement merge and the two ceilings. All of
 * that was written twice, identically, in two apps before it moved.
 *
 * What can never be shared is below: how many tiers there are, what they cost,
 * and what a tier includes.
 *
 * ── The two knobs that decide how a tenant with NO row behaves ──────────────
 *
 * `defaultSubscription` is the parking state, and its `status` is the one to
 * think about rather than copy. It is read by the host gate, so a status the
 * dunning ladder treats as delinquent will hold a brand-new tenant read-only
 * before they have done anything wrong. Tessa shipped exactly that: its default
 * was `{ status: "incomplete" }`, the gate's fail-open branch returned the
 * stored status verbatim, and the moment the onboarding wizard materialised the
 * row a fresh workspace went read-only on a deployment with no Stripe at all.
 * `active` is the safe answer, and the gate reports "has not paid" from the
 * PLAN, not from this.
 *
 * `materialiseOnRead: false` means a read never writes. Turning it on makes
 * every entitlement lookup a potential INSERT — including one from a request
 * that is about to be refused — which is how a table of rows for tenants that
 * never existed appears.
 *
 * ⚠️ **Editing a plan's numbers here is not enough**: bump `version`. The
 * catalog is version-stamped, and an unbumped edit is invisible on every
 * deployment that already seeded — the operator console shows the old numbers
 * and nothing anywhere says why.
 */

import { bindBillingStore, type CatalogSeed, type PlanSeed } from "@4dl/billing";
import { entitlements, type AppEntitlements, FREE } from "./entitlements.js";

export type { PackRow, PlanRow, SubscriptionRow } from "@4dl/billing";

const j = (e: AppEntitlements): string => JSON.stringify(e);

/**
 * ONE paid plan, which is the honest starting shape.
 *
 * A ladder is a real product decision and not a default: Kova sells four rungs
 * because a solo trainer and a twelve-coach studio are genuinely different
 * businesses, and Tessa sells one because a practice with three treatment rooms
 * and one with eight run the identical loop. Start with one and add a rung when
 * you can say what makes the second customer different — not before.
 */
const PRO: AppEntitlements = {
  quotas: { staffSeats: 10, subjects: -1, storageMb: 20_000 },
  features: { customDomain: true, ai: true },
  aiCredits: { monthlyGrant: 2_000 },
  /** A trial is editable from the operator console (Platform admin → Plans). */
  trialDays: 14,
};

/**
 * ⚠️ `free` IS THE PARKING STATE, not a tier anybody is sold.
 *
 * It carries `active: 0`, so it never appears on a pricing page, and its
 * entitlements are deliberately usable rather than crippled: they are what a
 * deployment with NO payment rail serves — a self-host, the integration suite,
 * anything before Stripe is configured — and crippling them bricks exactly the
 * configuration where the "has not paid" gate correctly stands down.
 */
const PLANS: PlanSeed[] = [
  { id: "free", name: "Free", price_usd_month: 0, entitlements_json: j(FREE), ord: 0, active: 0 },
  { id: "pro", name: "Pro", price_usd_month: 39, entitlements_json: j(PRO), ord: 1, active: 1 },
];

/**
 * Credit packs — the anchor is **1 credit = $0.001**.
 *
 * `@4dl/ai` prices a Workers AI neuron at $0.000011 with a 3× markup, so
 * 1 credit ≈ 30 neurons. Recompute the monthly grant above when a provider
 * reprices: the rates are the only thing that moves it.
 */
const CATALOG: CatalogSeed = {
  /** ⚠️ Bump on ANY edit above, or the change never reaches a seeded deployment. */
  version: "1",
  plans: PLANS,
  packs: [
    { id: "credits_5k", name: "5,000 credits", credits: 5_000, price_usd: 5, ord: 0, active: 1 },
    { id: "credits_25k", name: "25,000 credits", credits: 25_000, price_usd: 20, ord: 1, active: 1 },
  ],
};

export const {
  seedBilling,
  listPlans,
  listPacks,
  getPlan,
  readSubscription,
  ensureSubscription,
  tenantEntitlements,
  hasFeature,
  withinQuota,
  appendLedger,
} = bindBillingStore<AppEntitlements>({
  entitlements,
  catalog: CATALOG,
  defaultSubscription: { plan_id: "free", status: "active" },
  materialiseOnRead: false,
});

// `app_config` is `@4dl/core`'s table, so its accessors live there. Re-exported
// because a route file's subject is "platform settings" and one import is the
// honest shape of that.
export { getConfig, setConfig } from "@4dl/billing";
