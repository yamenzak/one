/**
 * THE CATALOG — what Tessa sells, and the D1 reads around it.
 *
 * `@4dl/billing` owns the tables (`plans`, `subscriptions`, `credit_packs`),
 * the entitlement engine and the Stripe client. It cannot own THIS: how many
 * tiers there are, what they cost and what a tier includes are product
 * decisions, and every app's are different.
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

import { getConfig, setConfig } from "@4dl/core";
import { entitlements, type AppEntitlements, FREE } from "./entitlements.js";

export interface PlanRow {
  id: string;
  name: string;
  price_usd_month: number;
  entitlements_json: string | null;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  ord: number;
  active: number;
}

export interface SubscriptionRow {
  tenant_id: string;
  plan_id: string;
  status: string;
  comp: number;
  stripe_customer_id: string | null;
  stripe_sub_id: string | null;
  pending_plan_id: string | null;
  current_period_end: string | null;
  past_due_at: string | null;
  suspend_at: string | null;
  delete_at: string | null;
  overrides_json: string | null;
}

export interface PackRow {
  id: string;
  name: string;
  credits: number;
  price_usd: number;
  ord: number;
  active: number;
}

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

/**
 * The plans that exist.
 *
 * `free` is the PARKING STATE, not a tier: it is what a centre sits on before it
 * chooses, and `host-context.ts`'s `statusOf` turns that into a read-only gate
 * where Stripe is configured. It is listed here (and `active = 0`) so it is
 * never offered in the picker while still resolving for a tenant already on it.
 */
export const DEFAULT_PLANS: Omit<PlanRow, "stripe_product_id" | "stripe_price_id">[] = [
  { id: "free", name: "No plan yet", price_usd_month: 0, entitlements_json: j(FREE), ord: 0, active: 0 },
  { id: "practice", name: "Practice", price_usd_month: 39, entitlements_json: j(PRACTICE), ord: 1, active: 1 },
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
 * Bump when `DEFAULT_PLANS` / `DEFAULT_PACKS` change in a way an EXISTING
 * deployment must adopt. Stamped in `app_config`; the migration runs once per
 * stamp value, so runtime admin edits survive every redeploy.
 *
 * A plain `INSERT OR IGNORE` is not enough — it is skipped once any plan row
 * exists, so a repriced plan would never land on a live deployment.
 *
 *   v1 → one paid plan (`practice`) + `free` as the parking state
 */
export const PLAN_CATALOG_VERSION = "1";
const PLAN_CATALOG_KEY = "plans.catalog_version";

async function applyPlanCatalog(db: D1Database): Promise<void> {
  const stmts: D1PreparedStatement[] = [];
  for (const p of DEFAULT_PLANS) {
    stmts.push(
      db
        .prepare("INSERT OR IGNORE INTO plans (id, name, price_usd_month, entitlements_json, ord, active) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(p.id, p.name, p.price_usd_month, p.entitlements_json, p.ord, p.active),
    );
    /**
     * A price change invalidates the Stripe price id.
     *
     * `syncCatalog` skips any plan that already has one, so a repriced plan
     * would keep charging the OLD amount forever — a silent money bug. Null the
     * pair out BEFORE writing the new price, so the next "Sync catalog"
     * recreates product + price at the current amount. The orphaned Stripe price
     * stays live, which is correct: whoever is already subscribed to it keeps
     * their price until they re-subscribe.
     */
    stmts.push(
      db
        .prepare("UPDATE plans SET stripe_product_id = NULL, stripe_price_id = NULL WHERE id = ? AND (price_usd_month IS NULL OR price_usd_month <> ?) AND (stripe_product_id IS NOT NULL OR stripe_price_id IS NOT NULL)")
        .bind(p.id, p.price_usd_month),
    );
    stmts.push(
      db
        .prepare("UPDATE plans SET name = ?, price_usd_month = ?, entitlements_json = ?, ord = ?, active = ? WHERE id = ?")
        .bind(p.name, p.price_usd_month, p.entitlements_json, p.ord, p.active, p.id),
    );
  }
  stmts.push(
    ...DEFAULT_PACKS.map((p) =>
      db
        .prepare("INSERT OR IGNORE INTO credit_packs (id, name, credits, price_usd, ord, active) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(p.id, p.name, p.credits, p.price_usd, p.ord, p.active),
    ),
  );
  await db.batch(stmts);
}

/**
 * Seed / migrate the catalog. The fast path is one indexed lookup of the version
 * stamp, so the `/api/context` hot path does not re-attempt writes every load.
 *
 * No module-level guard: that would skip seeding into fresh per-test storage.
 */
export async function seedBilling(db: D1Database): Promise<void> {
  const stamp = await db
    .prepare("SELECT value FROM app_config WHERE key = ?")
    .bind(PLAN_CATALOG_KEY)
    .first<{ value: string }>()
    .catch(() => null);
  if (stamp?.value === PLAN_CATALOG_VERSION) return;
  try {
    await applyPlanCatalog(db);
  } catch {
    // A transient failure must NOT stamp the version, or the migration is
    // skipped forever and the catalog stays half-applied. Every statement is
    // idempotent, so leaving it unstamped simply retries.
    return;
  }
  await setConfig(db, PLAN_CATALOG_KEY, PLAN_CATALOG_VERSION).catch(() => undefined);
}

/** The plans a centre may CHOOSE. Active only, so the parking state is never offered. */
export async function listPlans(db: D1Database): Promise<PlanRow[]> {
  const r = await db.prepare("SELECT * FROM plans WHERE active = 1 ORDER BY ord").all<PlanRow>();
  return r.results ?? [];
}

export async function listPacks(db: D1Database): Promise<PackRow[]> {
  const r = await db.prepare("SELECT * FROM credit_packs WHERE active = 1 ORDER BY ord").all<PackRow>();
  return r.results ?? [];
}

export async function getPlan(db: D1Database, id: string): Promise<PlanRow | null> {
  return db.prepare("SELECT * FROM plans WHERE id = ?").bind(id).first<PlanRow>().catch(() => null);
}

export async function getSubscription(db: D1Database, tenantId: string): Promise<SubscriptionRow | null> {
  return db.prepare("SELECT * FROM subscriptions WHERE tenant_id = ?").bind(tenantId).first<SubscriptionRow>().catch(() => null);
}

/**
 * Every tenant has a subscription row, even before it pays.
 *
 * Without one, `statusOf` reads null and the gate cannot tell "never chose a
 * plan" from "cancelled" — and the two need different copy, because nothing was
 * taken from the first and there is no arrears to settle.
 */
export async function ensureSubscription(db: D1Database, tenantId: string): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO subscriptions (tenant_id, plan_id, status) VALUES (?, 'free', 'incomplete')")
    .bind(tenantId)
    .run()
    .catch(() => undefined);
}

/**
 * The resolved entitlements for a tenant: the plan's blob merged onto FREE, the
 * tenant's overrides layered on, then clamped by standing.
 *
 * `clamp` is the one place delinquency bites, so a suspended centre falls back
 * to FREE everywhere at once rather than in each gate separately.
 */
export async function tenantEntitlements(db: D1Database, tenantId: string): Promise<AppEntitlements> {
  const sub = await getSubscription(db, tenantId);
  const plan = sub?.plan_id ? await getPlan(db, sub.plan_id) : null;
  const resolved = entitlements.merge(entitlements.resolve(plan?.entitlements_json), sub?.overrides_json);
  return entitlements.clamp(resolved, sub?.status ?? "active");
}

/** True when the tenant's plan (or a grant) includes `feature`. */
export async function hasFeature(db: D1Database, tenantId: string, feature: keyof AppEntitlements["features"]): Promise<boolean> {
  return (await tenantEntitlements(db, tenantId)).features[feature];
}

/**
 * Is ONE MORE of `quota` allowed? `-1` is unlimited.
 *
 * Note what this deliberately does NOT do: it never looks at rows that already
 * exist. Call it only on a CREATE. A centre left over a lowered ceiling keeps
 * every existing row fully readable and writable; they simply cannot add
 * another. Nothing should ever archive, hide or brick an over-quota row — a
 * quarantined lot that vanished because a card expired is a patient-safety
 * problem, not a billing one.
 */
export async function withinQuota(
  db: D1Database,
  tenantId: string,
  quota: keyof AppEntitlements["quotas"],
  currentCount: number,
): Promise<{ ok: boolean; max: number }> {
  const max = (await tenantEntitlements(db, tenantId)).quotas[quota];
  if (max < 0) return { ok: true, max };
  return { ok: currentCount < max, max };
}

/** Config read-through, re-exported so route files have one import for billing state. */
export { getConfig, setConfig };
