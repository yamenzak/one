/**
 * THE CATALOG — what Kova sells (SPEC §5).
 *
 * The STORE around it is `@4dl/billing`'s `bindBillingStore`: the ordered
 * active-only list, the by-id lookup that must still resolve a grandfathered
 * tier, the version-stamped catalog migration, the entitlement merge, the two
 * ceilings and the ledger mirror. All of it was written twice, near-identically,
 * in this app and in Tessa — 817 lines with 11 of 13 exports sharing a name.
 *
 * What stays here is what could never be shared: how many tiers there are, what
 * they cost, and what a tier includes. Seed data is admin-editable at runtime;
 * these are the ship defaults.
 */

import { bindBillingStore, getConfig, setConfig, type PackRow, type PlanSeed } from "@4dl/billing";
import { entitlementsEngine, type Entitlements } from "@kova/domain";
import { j } from "./db.js";

export type { PackRow, PlanRow, SubscriptionRow } from "@4dl/billing";

/**
 * ── Monthly AI credit grants: how these four numbers were derived ────────────
 *
 * Anchors (all already in the code, none invented here):
 *   `DEFAULT_PACKS` below       1 credit = $0.001  (1,000 credits = $1)
 *   `credits.ts`                1 neuron = $0.000011, default markup 3×
 *   ⇒ credits = ceil(neurons × 0.011/1000 × 3 × 1000) = ceil(neurons × 0.033)
 *   ⇒ **1 credit ≈ 30.3 neurons**
 *
 * Real per-action cost, from the `DEFAULT_MODELS` rates in `ai.ts` and the
 * `maxOutputTokens` each route actually passes (recompute these when a provider
 * reprices — that is the only thing that moves the grants):
 *
 * | action (feature)          | lane / model                    | tokens in→out | neurons | credits |
 * |---------------------------|---------------------------------|---------------|---------|---------|
 * | workout plan (draft-plan) | text · llama-3.3-70b 26.7k/205k | 4,000 → 2,000 |   516   | **18**  |
 * | meal plan (draft-meal)    | text · llama-3.3-70b            | 3,000 → 1,200 |   326   | **11**  |
 * | meal photo (snap-meal)    | vision · gemini-2.0-flash 9k/36k| 1,700 →   250 |    24   | **1** (2 held) |
 * | label / lab photo         | vision · gemini-2.0-flash       | 2,350 →   800 |    50   | **2**   |
 * | NL food log (parse-food)  | text-small · llama-3.2-3b 4.6k/30k| 600 →   200 |     9   | **1**   |
 * | check-in / coach note     | text-small · llama-3.2-3b       | 1,500 →   300 |    16   | **1**   |
 * | library image             | image · gemini-2.5-flash-image  | 3,545 n/image |  3,550  | **118** |
 *
 * (Vision holds 2 credits because the reserve budgets `IMAGE_TOKEN_EST` = 2,048
 * image tokens as a true upper bound; settle bills the real 1. Images are the
 * only genuinely expensive action — one is worth ~118 meal photos.)
 *
 * **One standard coached client-month** — the bundle a real client generates:
 *   1 workout draft (18) + 1 meal draft (11) + 20 meal photos (40)
 *   + 15 NL food logs (15) + 4 weekly check-ins (4) + 3 coach notes (3)
 *   = **91 credits ≈ $0.09 of AI at retail**.
 *
 * Grants are sized off that bundle and held to 10–12.5% of the subscription, so
 * AI is a feature of the plan and not its substance (packs cover heavy months):
 *
 *   solo   500 cr = $0.50 = 10.0% of $4.99   — 1 client, ~5 standard months of
 *                                              headroom (≈ 20 plan drafts + 60
 *                                              meal photos = 480)
 *   light  3,000  = $3.00 = 12.0% of $24.99  — 30 clients × 91 = 2,730
 *   pro    6,000  = $6.00 = 12.0% of $49.99  — ≈ 66 client-months, i.e. ⅔ of a
 *                                              100-client roster on AI monthly
 *   max    15,000 = $15.00 = 12.5% of $119.99 — ≈ 165 client-months, plus room
 *                                              for a 20-image content batch (2,360)
 */

/**
 * The live catalog (SPEC §5). Generic tier names on purpose: "Studio" is
 * business-side vocabulary for a tenant, not a plan name.
 *
 * `staffSeats` COUNTS THE OWNER (the documented meaning in `Quotas`), so Solo is
 * one person coaching one client and Light is one coach with up to 30.
 *
 * No plan here enables a `reserved: true` feature (`chat`, `integrations`) —
 * those do not exist, and `plan-catalog.test.ts` enforces it.
 */
export const DEFAULT_PLANS: PlanSeed[] = [
  {
    /**
     * The id stays `solo` on purpose — it is stamped into Stripe metadata
     * (`kova_plan`) on every product and subscription ever created, and renaming
     * it would orphan all of them. Only the NAME and the shape change.
     *
     * It used to be "Solo", one coach and **one client**, which is not a trainer
     * plan at all — no trainer has one client. It was a self-coaching plan
     * wearing trainer clothes, and it was the only tier that did not fit a
     * product built out of staff seats, a Connect rail and client packages.
     * Worse, the free baseline carried THREE clients, so the cheapest paid tier
     * bought you less than not paying.
     *
     * Three clients at the same price makes it the first rung of a B2B ladder: a
     * trainer's first few clients, priced so the step up to Light is a real
     * business decision rather than a correction of ours.
     */
    id: "solo",
    name: "Starter",
    price_usd_month: 4.99,
    ord: 1,
    active: 1,
    entitlements_json: j({
      quotas: { staffSeats: 1, activeClients: 3, templates: 25, storageMb: 250 },
      features: { externalSearch: true, aiSuite: true },
      // 3 clients x 91 credits = 273 of a standard month against a 500 grant, so
      // the ceiling still holds the 10% rule ($0.50 of $4.99) with headroom.
      aiCredits: { monthlyGrant: 500 },
      trialDays: 30,
    }),
  },
  {
    id: "light",
    name: "Light",
    price_usd_month: 24.99,
    ord: 2,
    active: 1,
    entitlements_json: j({
      quotas: { staffSeats: 1, activeClients: 30, templates: 200, storageMb: 1_000 },
      features: { externalSearch: true, aiSuite: true, commerce: true, bfCamera: true },
      aiCredits: { monthlyGrant: 3_000 },
      trialDays: 30,
    }),
  },
  {
    id: "pro",
    name: "Pro",
    price_usd_month: 49.99,
    ord: 3,
    active: 1,
    entitlements_json: j({
      quotas: { staffSeats: 5, activeClients: 100, templates: -1, storageMb: 10_000 },
      features: {
        externalSearch: true,
        aiSuite: true,
        commerce: true,
        bfCamera: true,
        supplementsLabs: true,
        frontDesk: true,
        branding: true,
      },
      aiCredits: { monthlyGrant: 6_000 },
      trialDays: 0,
    }),
  },
  {
    id: "max",
    name: "Max",
    price_usd_month: 119.99,
    ord: 4,
    active: 1,
    entitlements_json: j({
      quotas: { staffSeats: -1, activeClients: -1, templates: -1, storageMb: 100_000 },
      features: {
        externalSearch: true,
        aiSuite: true,
        commerce: true,
        bfCamera: true,
        supplementsLabs: true,
        frontDesk: true,
        branding: true,
      },
      aiCredits: { monthlyGrant: 15_000 },
      trialDays: 0,
    }),
  },
];

/**
 * Retired tiers, kept as **grandfathered rows with `active = 0`**.
 *
 * They still resolve for tenants already on them (`tenantEntitlements` looks the
 * plan up by id, not by `active`), but they are never offered to anyone new:
 * `listPlans` — which backs `GET /billing`'s picker, `check-downgrade`,
 * `checkout-plan` and `plan-intent` — filters `active = 1`.
 *
 * Nobody is auto-migrated. Moving `studio` → `pro` would cut storage 25 GB →
 * 10 GB and could put a live tenant over quota, so the rows stay put and a human
 * decides per tenant.
 *
 * `free` is retired as a *purchasable* tier but stays the implicit unsubscribed
 * baseline: `getSubscription` still stamps `plan_id = 'free'` for a brand-new
 * tenant and `customer.subscription.deleted` still falls back to it. The 30-day
 * trials on Solo/Light are what replaced it as an *evaluation* path.
 *
 * These definitions are the FRESH-DB shape only. On an existing deployment the
 * catalog migration touches nothing but `active`/`ord` on these three ids — see
 * `applyPlanCatalog`. That is why `chat`/`integrations` are absent here (a fresh
 * DB must never ship a plan enabling a feature that does not exist) while a
 * production row that already carries them keeps them until an admin edits it.
 * Both are inert: `RESERVED_FEATURES` is unenforced by construction.
 */
export const GRANDFATHERED_PLANS: PlanSeed[] = [
  {
    /**
     * NOT A TIER — the parking state of a tenant that has never chosen a plan.
     *
     * It is unpurchasable (`active: 0`) but every new tenant is stamped onto it
     * by `getSubscription`, and `customer.subscription.deleted` falls back to it.
     * That made it the most-used row in the table and, until now, a genuinely
     * usable free product: three clients, indefinitely, fully writable, on a row
     * that also carried `status: 'active'` — and MORE clients than the cheapest
     * paid tier, so not paying was the better deal.
     *
     * ── The fix is the GATE, and only the gate ──────────────────────────────
     *
     * `statusOf` reports `incomplete` for a tenant with no paid plan, and the
     * route guard turns that into read-only. These quotas are deliberately NOT a
     * second enforcement of the same rule.
     *
     * They were, briefly, and it was wrong: zeroing them bricks the one
     * configuration where the gate correctly stands down. A deployment with no
     * Stripe keys — a self-hosted install, anything before DEPLOY.md §10, the
     * whole E2E suite — cannot take a payment, so gating "has not paid" there
     * would strand every studio; `statusOf` fails open. Crippled quotas would
     * then brick it anyway, one layer further down, for a deployment that had
     * deliberately chosen not to charge.
     *
     * So this row is what a NON-CHARGING deployment serves. On a charging one it
     * is unreachable: the gate fires first, every time.
     */
    id: "free",
    name: "Free",
    price_usd_month: 0,
    ord: 0,
    active: 0,
    entitlements_json: j({
      quotas: { staffSeats: 1, activeClients: 3, templates: 5, storageMb: 250 },
      features: { externalSearch: true },
      aiCredits: { monthlyGrant: 0 },
      trialDays: 0,
    }),
  },
  {
    id: "studio",
    name: "Studio (retired)",
    price_usd_month: 79,
    ord: 90,
    active: 0,
    entitlements_json: j({
      quotas: { staffSeats: 4, activeClients: 100, templates: -1, storageMb: 25_000 },
      features: {
        commerce: true,
        aiSuite: true,
        bfCamera: true,
        externalSearch: true,
        supplementsLabs: true,
        frontDesk: true,
        branding: true,
      },
      aiCredits: { monthlyGrant: 2500 },
      trialDays: 0,
    }),
  },
  {
    id: "team",
    name: "Team (retired)",
    price_usd_month: 199,
    ord: 91,
    active: 0,
    entitlements_json: j({
      quotas: { staffSeats: 15, activeClients: 400, templates: -1, storageMb: 100_000 },
      features: {
        commerce: true,
        aiSuite: true,
        bfCamera: true,
        externalSearch: true,
        supplementsLabs: true,
        frontDesk: true,
        branding: true,
      },
      aiCredits: { monthlyGrant: 10_000 },
      trialDays: 0,
    }),
  },
];

/** Scena-parity credit packs: 1 credit = $0.001, volume bonuses upward. */
export const DEFAULT_PACKS: PackRow[] = [
  { id: "pack_1k", name: "1,000 credits", credits: 1_000, price_usd: 1, ord: 0, active: 1 },
  { id: "pack_5k", name: "5,500 credits", credits: 5_500, price_usd: 5, ord: 1, active: 1 },
  { id: "pack_25k", name: "30,000 credits", credits: 30_000, price_usd: 25, ord: 2, active: 1 },
  { id: "pack_100k", name: "130,000 credits", credits: 130_000, price_usd: 100, ord: 3, active: 1 },
];

/**
 * Bump when `DEFAULT_PLANS` / `GRANDFATHERED_PLANS` change in a way an EXISTING
 * deployment must adopt. Stamped in `app_config` under `plans.catalog_version`;
 * `seedBilling` runs the catalog migration exactly once per stamp value.
 *
 * A plain `INSERT OR IGNORE` seed is not enough here: it is skipped entirely once
 * any plan row exists, so on the live deployment a repriced `solo` (or the three
 * brand-new tiers) would never land. A version stamp gets the migration to run
 * once — and only once, so runtime admin edits still survive every redeploy.
 *
 *   v1 → the original free/solo/studio/team ladder (unstamped)
 *   v2 → solo/light/pro/max + trials; free/studio/team grandfathered inactive
 *   v3 → PURE B2B: `solo` becomes "Starter" at 3 clients. One client is not a
 *        trainer plan, and the free baseline carried three — so the cheapest
 *        paid tier bought you LESS than not paying. The unpaid state is now
 *        gated (`statusOf` → `incomplete`) rather than re-priced; `free`'s own
 *        entitlements are untouched, because they are what a deployment with no
 *        payment rail serves.
 */
export const PLAN_CATALOG_VERSION = "3";

const store = bindBillingStore<Entitlements>({
  entitlements: entitlementsEngine,
  catalog: {
    plans: DEFAULT_PLANS,
    retired: GRANDFATHERED_PLANS,
    packs: DEFAULT_PACKS,
    version: PLAN_CATALOG_VERSION,
  },
  /**
   * Every studio implicitly starts on the free plan, ACTIVE.
   *
   * Not `incomplete`: Kova's unpaid state is decided by `statusOf` reading the
   * plan id, not by this status, and writing `incomplete` here would put a
   * second, differently-shaped copy of that rule in the row itself.
   */
  defaultSubscription: { plan_id: "free", status: "active" },
  /**
   * Reading a studio's entitlements MATERIALISES its row. This has always been
   * true here — `/api/context` is what creates the row for most studios — and
   * changing it is not this move's call: something downstream may rely on the
   * row existing, and finding that out in production is an outage, not a
   * refactor.
   */
  materialiseOnRead: true,
});

export const {
  seedBilling,
  listPlans,
  listPacks,
  getPlan,
  tenantEntitlements,
  hasFeature,
  withinQuota,
  appendLedger,
} = store;

/** Always resolves — a studio with no row is stamped onto `free` and returned. */
export const getSubscription = store.ensureSubscription;

// `app_config` is core's table (the schema runner bootstraps it), so its
// accessors live there. Re-exported from here because ~20 call sites import them
// from this module and their subject is still "platform settings".
export { getConfig, setConfig };
