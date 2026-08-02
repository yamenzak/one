/**
 * THE CATALOG — what Tessa sells.
 *
 * The STORE around it is `@4dl/billing`'s `bindBillingStore`: the ordered
 * active-only list, the by-id lookup that must still resolve a retired tier, the
 * version-stamped seeding, the entitlement merge and the two ceilings. All of
 * that was written twice, identically, in two apps. What could never be shared
 * is below — how many tiers there are, what they cost, and what a tier includes.
 *
 * ── ONE paid plan, deliberately ──────────────────────────────────────────────
 *
 * Kova sells a four-rung ladder because a solo trainer and a twelve-coach studio
 * are genuinely different businesses. A sterile-supply centre is not: a practice
 * with three treatment rooms and one with eight run the same loop, receive the
 * same stock and answer to the same regulator. A ladder would make a clinic
 * choose a tier by counting rooms, and then re-choose it every time they opened
 * one — friction that buys nobody anything.
 *
 * So: one plan, sized so a normal practice never hits a ceiling, and AI credits
 * as the thing that scales with use. That is the honest axis — a centre that
 * reads 400 labels a month genuinely costs more to serve than one that reads 40.
 *
 * ⚠️ **The price is a starting position, not a finding.** $39/month is set here
 * because something has to be, and it is defensible against what the product
 * replaces (a paper Freigabe log and a spreadsheet). It is admin-editable at
 * runtime — Platform admin → Plans — and changing it here bumps the catalog
 * version below, which is what makes an existing deployment adopt it.
 */

import { bindBillingStore, getConfig, setConfig, type PackRow, type PlanSeed } from "@4dl/billing";
import { entitlements, type AppEntitlements, FREE } from "./entitlements.js";

export type { PackRow, PlanRow, SubscriptionRow } from "@4dl/billing";

const j = (e: AppEntitlements): string => JSON.stringify(e);

/**
 * ── Sizing the monthly credit grant ─────────────────────────────────────────
 *
 * Anchor, from `DEFAULT_PACKS` below: **1 credit = $0.001**. `@4dl/ai`'s
 * `credits.ts` prices a Workers AI neuron at $0.000011 with a 3× markup, so
 * 1 credit ≈ 30 neurons. Recompute this table when a provider reprices — the
 * rates are the only thing that moves the grant.
 *
 * | action                    | lane   | credits |
 * |---------------------------|--------|---------|
 * | read-label (photo → GS1)  | vision |  2      |
 * | summarise-document        | text   | 11      |
 * | recall-narrative          | text   | 11      |
 * | reorder-advisor           | text   | 18      |
 *
 * A busy centre's month: 150 label reads (300) + 4 advisor runs (72)
 * + 10 document summaries (110) + 5 recall narratives (55) ≈ **540 credits**,
 * about $0.54 of AI at retail.
 *
 * The grant is **2,000** — roughly 3.7× that, and ~5% of the subscription. Sized
 * so nobody meets the ceiling doing ordinary work, and packs cover the month a
 * centre digitises a back room.
 */
const PRACTICE: AppEntitlements = {
  quotas: {
    // Ten is above the staff a single reprocessing centre puts on the system,
    // so the ceiling is not a thing a growing practice bumps into weekly.
    staffSeats: 10,
    locations: 25,
    // Unlimited. A catalog ceiling would make a centre choose which instruments
    // to track, which defeats the trace the product exists to produce.
    catalogItems: -1,
    storageMb: 5_000,
  },
  features: { customDomain: true, ai: true },
  aiCredits: { monthlyGrant: 2_000 },
  trialDays: 14,
};

/** The one plan a centre can buy. */
export const DEFAULT_PLANS: PlanSeed[] = [
  { id: "practice", name: "Practice", price_usd_month: 39, entitlements_json: j(PRACTICE), ord: 1, active: 1 },
];

/**
 * `free` is the PARKING STATE, not a tier: it is what a centre sits on before it
 * chooses, and `host-context.ts`'s `statusOf` turns that into a read-only gate
 * where Stripe is configured. Declared as RETIRED so it is inserted on a fresh
 * database, held at `active = 0` so the picker never offers it, and never
 * reconciled afterwards — exactly what a grandfathered row wants.
 */
export const RETIRED_PLANS: PlanSeed[] = [
  { id: "free", name: "No plan yet", price_usd_month: 0, entitlements_json: j(FREE), ord: 0, active: 0 },
];

/**
 * Credit packs. 1 credit = $0.001 at the smallest pack, with volume bonuses
 * upward — the same anchor Kova uses, because the underlying model costs are the
 * same and two apps on one Stripe account quoting different credit values would
 * be indefensible the first time somebody ran both.
 */
export const DEFAULT_PACKS: PackRow[] = [
  { id: "pack_1k", name: "1,000 credits", credits: 1_000, price_usd: 1, ord: 0, active: 1 },
  { id: "pack_5k", name: "5,500 credits", credits: 5_500, price_usd: 5, ord: 1, active: 1 },
  { id: "pack_25k", name: "30,000 credits", credits: 30_000, price_usd: 25, ord: 2, active: 1 },
];

/**
 * Bump when the seeds above change in a way an EXISTING deployment must adopt.
 * Stamped in `app_config`; the migration runs once per stamp value, so runtime
 * admin edits survive every redeploy.
 *
 *   v1 → one paid plan (`practice`) + `free` as the parking state
 */
export const PLAN_CATALOG_VERSION = "1";

const store = bindBillingStore<AppEntitlements>({
  entitlements,
  catalog: { plans: DEFAULT_PLANS, retired: RETIRED_PLANS, packs: DEFAULT_PACKS, version: PLAN_CATALOG_VERSION },
  /**
   * A centre with no row has not chosen a plan — `incomplete`, not `active`.
   * The gate needs the two apart: nothing was taken from a centre that never
   * subscribed and there is no arrears to settle, so the copy cannot be shared.
   */
  defaultSubscription: { plan_id: "free", status: "incomplete" },
  /**
   * Tessa writes the row once, at tenant creation (`ensureSubscription`), rather
   * than materialising it from whatever happens to read first.
   */
  materialiseOnRead: false,
});

export const {
  seedBilling,
  listPlans,
  listPacks,
  getPlan,
  ensureSubscription,
  tenantEntitlements,
  hasFeature,
  withinQuota,
} = store;

/** A plain read — null for a centre that has never had a row. */
export const getSubscription = store.readSubscription;

/** Config read-through, re-exported so route files have one import for billing state. */
export { getConfig, setConfig };
