/**
 * Platform billing store (SPEC §5) — plans, tenant subscriptions, credit
 * packs, config, and the D1 mirror of the DO credit ledger. Seed data is
 * admin-editable at runtime; these are the ship defaults.
 */

import { resolveEntitlements, mergeOverrides, clampEntitlementsForStatus, type Entitlements } from "@kova/domain";
import { newId, nowIso, nowMs } from "./ids.js";
import { j } from "./db.js";

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
export const DEFAULT_PLANS: Omit<PlanRow, "stripe_product_id" | "stripe_price_id">[] = [
  {
    id: "solo",
    name: "Solo",
    price_usd_month: 4.99,
    ord: 1,
    active: 1,
    entitlements_json: j({
      quotas: { staffSeats: 1, activeClients: 1, templates: 25, storageMb: 250 },
      features: { externalSearch: true, aiSuite: true },
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
export const GRANDFATHERED_PLANS: Omit<PlanRow, "stripe_product_id" | "stripe_price_id">[] = [
  {
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
 */
export const PLAN_CATALOG_VERSION = "2";
const PLAN_CATALOG_KEY = "plans.catalog_version";

/**
 * Bring the plan catalog to `PLAN_CATALOG_VERSION`. Idempotent and safe to run
 * concurrently from several isolates (every statement is an upsert or a guarded
 * UPDATE), and it never runs twice for the same version.
 *
 * Three rules, in this order:
 *
 * 1. **A price change invalidates the Stripe price id.** `syncCatalog` skips any
 *    plan row that already has a `stripe_price_id`, so a repriced plan would keep
 *    charging the OLD amount forever — a silent money bug. Null the id pair out
 *    *before* writing the new price, so the next "Sync catalog" recreates the
 *    product + price at the current amount. (The orphaned Stripe price stays
 *    live, which is correct: tenants already subscribed to it keep their price
 *    until they re-subscribe.)
 * 2. **Live plans are reconciled to the ship defaults** (name/price/quotas/
 *    features/grant/trial/ord/active).
 * 3. **Retired plans are only deactivated.** `active = 0` + `ord`, never their
 *    entitlements or price — grandfathered tenants must keep exactly what they
 *    have. Nobody is migrated off a retired tier by this code.
 */
async function applyPlanCatalog(db: D1Database): Promise<void> {
  const stmts: D1PreparedStatement[] = [];
  const insert = (p: Omit<PlanRow, "stripe_product_id" | "stripe_price_id">) =>
    db
      .prepare(
        "INSERT OR IGNORE INTO plans (id, name, price_usd_month, entitlements_json, ord, active) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(p.id, p.name, p.price_usd_month, p.entitlements_json, p.ord, p.active);

  for (const p of DEFAULT_PLANS) {
    stmts.push(insert(p));
    // (1) price moved → drop the stale Stripe ids so the next Sync recreates them.
    stmts.push(
      db
        .prepare(
          "UPDATE plans SET stripe_product_id = NULL, stripe_price_id = NULL WHERE id = ? AND (price_usd_month IS NULL OR price_usd_month <> ?) AND (stripe_product_id IS NOT NULL OR stripe_price_id IS NOT NULL)",
        )
        .bind(p.id, p.price_usd_month),
    );
    // (2) reconcile the row to the ship defaults.
    stmts.push(
      db
        .prepare("UPDATE plans SET name = ?, price_usd_month = ?, entitlements_json = ?, ord = ?, active = 1 WHERE id = ?")
        .bind(p.name, p.price_usd_month, p.entitlements_json, p.ord, p.id),
    );
  }
  for (const p of GRANDFATHERED_PLANS) {
    stmts.push(insert(p));
    // (3) retire it — nothing else. Entitlements and price stay as found.
    stmts.push(db.prepare("UPDATE plans SET active = 0, ord = ? WHERE id = ?").bind(p.ord, p.id));
  }
  stmts.push(
    ...DEFAULT_PACKS.map((p) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO credit_packs (id, name, credits, price_usd, ord, active) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(p.id, p.name, p.credits, p.price_usd, p.ord, p.active),
    ),
  );
  await db.batch(stmts);
}

/** Seed / migrate the billing catalog. The fast path is a single indexed lookup
 *  of the version stamp (same cost as the old `SELECT 1 FROM plans`), so the
 *  /api/context hot path doesn't re-attempt writes on every load. No
 *  module-level guard — that would skip seeding into fresh per-test storage. */
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
    // skipped forever and the catalog stays half-applied. Leave it unstamped so
    // the next call retries; every statement is idempotent.
    return;
  }
  await setConfig(db, PLAN_CATALOG_KEY, PLAN_CATALOG_VERSION).catch(() => undefined);
}

/** The plans a tenant may CHOOSE — active only, so retired tiers are never
 *  offered to anyone new. Backs `GET /billing`'s picker, `check-downgrade`,
 *  `checkout-plan` and `plan-intent`. A grandfathered tenant's own plan is
 *  resolved by id (`getPlan` / `tenantEntitlements`), not through this. */
export async function listPlans(db: D1Database): Promise<PlanRow[]> {
  const r = await db.prepare("SELECT * FROM plans WHERE active = 1 ORDER BY ord").all<PlanRow>();
  return r.results ?? [];
}

/** Any plan by id, active or grandfathered. Use this — never `listPlans` — when
 *  resolving a plan a tenant is ALREADY on, or an admin comp/support action; a
 *  tenant sitting on a retired tier must not become unresolvable. */
export async function getPlan(db: D1Database, planId: string): Promise<PlanRow | null> {
  return db.prepare("SELECT * FROM plans WHERE id = ?").bind(planId).first<PlanRow>();
}

export async function listPacks(db: D1Database): Promise<PackRow[]> {
  const r = await db.prepare("SELECT * FROM credit_packs WHERE active = 1 ORDER BY ord").all<PackRow>();
  return r.results ?? [];
}

export async function getSubscription(db: D1Database, tenantId: string): Promise<SubscriptionRow> {
  const row = await db
    .prepare("SELECT * FROM subscriptions WHERE tenant_id = ?")
    .bind(tenantId)
    .first<SubscriptionRow>();
  if (row) return row;
  // Every tenant implicitly starts on the free plan.
  const fresh: SubscriptionRow = {
    tenant_id: tenantId,
    plan_id: "free",
    status: "active",
    comp: 0,
    stripe_customer_id: null,
    stripe_sub_id: null,
    pending_plan_id: null,
    current_period_end: null,
    past_due_at: null,
    suspend_at: null,
    delete_at: null,
    overrides_json: null,
  };
  await db
    .prepare(
      "INSERT OR IGNORE INTO subscriptions (tenant_id, plan_id, status, comp, updated_at) VALUES (?, 'free', 'active', 0, ?)",
    )
    .bind(tenantId, nowIso())
    .run()
    .catch(() => undefined);
  return fresh;
}

/** Resolve a tenant's effective entitlements: plan blob + per-tenant overrides,
 *  then CLAMPED by subscription status — a suspended/canceled/unpaid tenant
 *  falls back to free (see `clampEntitlementsForStatus`). This clamp is the one
 *  place delinquency bites: every `hasFeature`/`withinQuota` gate and the
 *  client-flag intersection resolve through here, so the passthrough is total. */
export async function tenantEntitlements(db: D1Database, tenantId: string): Promise<Entitlements> {
  const sub = await getSubscription(db, tenantId);
  const plan = await db
    .prepare("SELECT entitlements_json FROM plans WHERE id = ?")
    .bind(sub.plan_id)
    .first<{ entitlements_json: string | null }>();
  const resolved = mergeOverrides(resolveEntitlements(plan?.entitlements_json), sub.overrides_json);
  return clampEntitlementsForStatus(resolved, sub.status);
}

/** True when the tenant's plan (or a gift) includes `feature`. The single gate
 *  helper every capability route calls — keeps the 403 shape uniform. */
export async function hasFeature(
  db: D1Database,
  tenantId: string,
  feature: keyof Entitlements["features"],
): Promise<boolean> {
  const ent = await tenantEntitlements(db, tenantId);
  return ent.features[feature];
}

/** Count of a tenant's usage against a quota ceiling. `-1` ceilings are
 *  unlimited; returns whether ONE MORE of `resource` is allowed.
 *
 *  Note what this deliberately does NOT do: it never looks at rows that already
 *  exist. Every call site (`POST /clients`, the self-signup pending-client
 *  reserve in `otp-guard.ts`, staff invite/accept in `auth.ts`, template create
 *  in `plan-routes.ts`) consults it only on a CREATE. So a tenant left over a
 *  lowered ceiling — e.g. an existing `solo` tenant holding 25 clients after the
 *  v2 catalog cut `solo.activeClients` to 1 — keeps every client fully readable
 *  and writable; they simply cannot add another until they upgrade or archive.
 *  Nothing archives, hides or bricks over-quota rows, and no path re-checks a
 *  ceiling retroactively. Verified by `plan-catalog.test.ts`. */
export async function withinQuota(
  db: D1Database,
  tenantId: string,
  quota: keyof Entitlements["quotas"],
  currentCount: number,
): Promise<{ ok: boolean; max: number }> {
  const ent = await tenantEntitlements(db, tenantId);
  const max = ent.quotas[quota];
  if (max < 0) return { ok: true, max }; // unlimited
  return { ok: currentCount < max, max };
}

/** Append-only D1 mirror of the DO ledger (invoices/history). */
export async function appendLedger(
  db: D1Database,
  entry: { tenant_id: string; delta: number; balance: number; reason: string; ref: string | null },
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO credit_ledger (id, tenant_id, delta, balance, reason, ref, at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(newId("led"), entry.tenant_id, entry.delta, entry.balance, entry.reason, entry.ref, nowMs())
    .run();
}

export async function getConfig(db: D1Database): Promise<Record<string, string>> {
  const r = await db.prepare("SELECT key, value FROM app_config").all<{ key: string; value: string }>();
  return Object.fromEntries((r.results ?? []).map((row) => [row.key, row.value]));
}

export async function setConfig(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare("INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, value)
    .run();
}
