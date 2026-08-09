/**
 * THE CATALOG STORE — the D1 reads and writes over `plans`, `subscriptions`
 * and `credit_packs`, and the four gates every route asks.
 *
 * `@4dl/billing` already owned the tables (`schema.ts`), the entitlement ENGINE
 * (`entitlements.ts`), the credit DO and the Stripe client. It did not own the
 * STORE, so both live apps wrote it: 817 lines across two files, 11 of 13
 * exports sharing a name, and the same `listPlans`, the same `withinQuota`, the
 * same version-stamped seeding written twice.
 *
 * ── The line to draw, and it is not "billing is shared" ─────────────────────
 *
 * **The catalog's CONTENTS are the product's. Its SHAPE is not.**
 *
 * One app sells a four-rung ladder because a solo trainer and a twelve-coach
 * studio are different businesses; the other sells one plan because a practice
 * with three treatment rooms and one with eight are not. That is a product
 * decision and it stays in the app, as a `CatalogSeed`. What both then need — the
 * ordered active-only list, the by-id lookup that must still resolve a retired
 * tier, the entitlement merge, the two ceilings — is identical, and is here.
 *
 * ── Two seams, and each exists because the apps genuinely differ ────────────
 *
 * `defaultSubscription` — what a tenant implicitly holds before a row exists.
 * One app says `free`/`active`, the other `free`/`incomplete`, and both are
 * deliberate: the second wants its gate to tell "never chose a plan" apart from
 * "cancelled", because nothing was taken from the first and there is no arrears
 * to settle. Hard-coding either would silently re-gate the other's tenants.
 *
 * `materialiseOnRead` — whether resolving entitlements for a tenant with no row
 * WRITES one. One app has always done this, from its `/api/context` hot path;
 * the other writes the row once at tenant creation instead. Dropping the write
 * would be tidier and is not this move's call to make: something downstream may
 * be relying on the row existing, and finding out in production is not a
 * refactor, it is an outage.
 *
 * ── The rule that costs money if it is lost ─────────────────────────────────
 *
 * A price change NULLS the Stripe id pair before writing the new price.
 * `syncCatalog` skips any plan that already has a `stripe_price_id`, so without
 * this a repriced plan keeps charging the OLD amount forever. Silent, and in the
 * direction nobody notices.
 */

import { getConfig, newId, nowIso, nowMs, setConfig } from "@4dl/core";
import type { bindEntitlements, EntitlementShape } from "./entitlements.js";

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
  /** The operator's absolute per-tenant setting — see the schema module. */
  adjustments_json: string | null;
}

export interface PackRow {
  id: string;
  name: string;
  credits: number;
  price_usd: number;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  ord: number;
  active: number;
}

/** A plan as an app DECLARES it. The Stripe ids are minted by `syncCatalog`. */
export type PlanSeed = Omit<PlanRow, "stripe_product_id" | "stripe_price_id">;
/**
 * A pack as an app DECLARES it, and the same omission for the same reason.
 *
 * `PackRow` carried no Stripe columns at all until an app needed to read one —
 * `credit_packs` has held both since the table shipped, `syncCatalog` writes
 * them and reads them back, and only the TYPE disagreed. A row type that is
 * quietly a subset of its table is worse than a wrong one: every consumer
 * compiles, and the fields simply are not there to be used.
 */
export type PackSeed = Omit<PackRow, "stripe_product_id" | "stripe_price_id">;

export interface CatalogSeed {
  /**
   * The plans this deployment ships. Reconciled to these values in full on every
   * version bump — name, price, entitlements, `ord` and `active`.
   */
  plans: PlanSeed[];
  /**
   * Retired tiers, kept so tenants already on them still resolve. Only `active`
   * and `ord` are written; their entitlements and price stay exactly as found,
   * because a grandfathered tenant keeps what they were sold. Nobody is migrated
   * off a retired tier by this code — that is a decision a person makes, per
   * tenant, and a table with a `storageMb` cut in it would put someone over
   * quota the moment it ran.
   */
  retired?: PlanSeed[];
  packs: PackSeed[];
  /**
   * Bumped when the seeds change in a way an EXISTING deployment must adopt.
   *
   * A plain `INSERT OR IGNORE` is not enough and this is the whole reason the
   * stamp exists: it is skipped the moment any plan row exists, so on a live
   * deployment a repriced plan — or three brand-new tiers — would never land.
   * The stamp makes the migration run once per value, so runtime admin edits
   * still survive every redeploy.
   */
  version: string;
}

/** The engine `bindEntitlements` returns. Named so a binding can be passed around. */
export type EntitlementEngine<E extends EntitlementShape> = ReturnType<typeof bindEntitlements<E>>;

export interface BillingStoreConfig<E extends EntitlementShape> {
  entitlements: EntitlementEngine<E>;
  catalog: CatalogSeed;
  /** What a tenant holds before a subscription row exists. See the header. */
  defaultSubscription: { plan_id: string; status: string };
  /** Whether a read for a tenant with no row WRITES one. See the header. */
  materialiseOnRead: boolean;
}

const PLAN_CATALOG_KEY = "plans.catalog_version";

export function bindBillingStore<E extends EntitlementShape>(cfg: BillingStoreConfig<E>) {
  const { entitlements, catalog } = cfg;

  /**
   * Bring the catalog to `catalog.version`. Idempotent and safe to run
   * concurrently from several isolates — every statement is an upsert or a
   * guarded UPDATE — and it never runs twice for the same version.
   */
  async function applyPlanCatalog(db: D1Database): Promise<void> {
    const stmts: D1PreparedStatement[] = [];
    const insert = (p: PlanSeed) =>
      db
        .prepare("INSERT OR IGNORE INTO plans (id, name, price_usd_month, entitlements_json, ord, active) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(p.id, p.name, p.price_usd_month, p.entitlements_json, p.ord, p.active);

    for (const p of catalog.plans) {
      stmts.push(insert(p));
      // (1) The money rule from the header: a moved price drops the stale Stripe
      //     ids so the next Sync recreates the product + price at the current
      //     amount. The orphaned Stripe price stays live, which is correct —
      //     whoever is subscribed to it keeps their price until they re-subscribe.
      stmts.push(
        db
          .prepare(
            "UPDATE plans SET stripe_product_id = NULL, stripe_price_id = NULL WHERE id = ? AND (price_usd_month IS NULL OR price_usd_month <> ?) AND (stripe_product_id IS NOT NULL OR stripe_price_id IS NOT NULL)",
          )
          .bind(p.id, p.price_usd_month),
      );
      // (2) Reconcile to the ship defaults. `active` is BOUND rather than
      //     hard-coded to 1: one app carries its parking state in this list at
      //     `active: 0`, and every row in the other's is 1, so binding it is
      //     identical for one and load-bearing for the other.
      stmts.push(
        db
          .prepare("UPDATE plans SET name = ?, price_usd_month = ?, entitlements_json = ?, ord = ?, active = ? WHERE id = ?")
          .bind(p.name, p.price_usd_month, p.entitlements_json, p.ord, p.active, p.id),
      );
    }

    for (const p of catalog.retired ?? []) {
      stmts.push(insert(p));
      // (3) Retire it, and nothing else.
      stmts.push(db.prepare("UPDATE plans SET active = 0, ord = ? WHERE id = ?").bind(p.ord, p.id));
    }

    stmts.push(
      ...catalog.packs.map((p) =>
        db
          .prepare("INSERT OR IGNORE INTO credit_packs (id, name, credits, price_usd, ord, active) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(p.id, p.name, p.credits, p.price_usd, p.ord, p.active),
      ),
    );
    await db.batch(stmts);
  }

  /**
   * Seed / migrate the catalog. The fast path is one indexed lookup of the
   * version stamp, so a hot request path does not re-attempt writes every load.
   *
   * No module-level guard: that would skip seeding into fresh per-test storage.
   */
  async function seedBilling(db: D1Database): Promise<void> {
    const stamp = await db
      .prepare("SELECT value FROM app_config WHERE key = ?")
      .bind(PLAN_CATALOG_KEY)
      .first<{ value: string }>()
      .catch(() => null);
    if (stamp?.value === catalog.version) return;
    try {
      await applyPlanCatalog(db);
    } catch {
      // A transient failure must NOT stamp the version, or the migration is
      // skipped forever and the catalog stays half-applied. Every statement is
      // idempotent, so leaving it unstamped simply retries.
      return;
    }
    await setConfig(db, PLAN_CATALOG_KEY, catalog.version).catch(() => undefined);
  }

  /**
   * The plans a tenant may CHOOSE — active only, so a retired tier is never
   * offered to anyone new. A tenant's OWN plan is resolved by id, never through
   * this: someone sitting on a retired tier must not become unresolvable.
   */
  async function listPlans(db: D1Database): Promise<PlanRow[]> {
    const r = await db.prepare("SELECT * FROM plans WHERE active = 1 ORDER BY ord").all<PlanRow>();
    return r.results ?? [];
  }

  async function listPacks(db: D1Database): Promise<PackRow[]> {
    const r = await db.prepare("SELECT * FROM credit_packs WHERE active = 1 ORDER BY ord").all<PackRow>();
    return r.results ?? [];
  }

  /**
   * Any plan by id, active or retired. See `listPlans` for why both exist.
   *
   * ⚠️ A failed read PROPAGATES — it is deliberately not caught into `null`.
   *
   * The two apps disagreed here and one of them was wrong. `null` means "no such
   * plan", which resolves to the free baseline; laundering a transient D1 error
   * into that silently downgrades a PAYING tenant to free entitlements and shows
   * them the finish-setting-up gate. A 500 on this path is visible and retried.
   * "The database was briefly unavailable" and "you have not bought anything"
   * must never be the same answer on the money path.
   */
  async function getPlan(db: D1Database, planId: string): Promise<PlanRow | null> {
    return db.prepare("SELECT * FROM plans WHERE id = ?").bind(planId).first<PlanRow>();
  }

  /** The row this tenant implicitly holds, before one is written. */
  const defaultRow = (tenantId: string): SubscriptionRow => ({
    tenant_id: tenantId,
    plan_id: cfg.defaultSubscription.plan_id,
    status: cfg.defaultSubscription.status,
    comp: 0,
    stripe_customer_id: null,
    stripe_sub_id: null,
    pending_plan_id: null,
    current_period_end: null,
    past_due_at: null,
    suspend_at: null,
    delete_at: null,
    overrides_json: null,
    adjustments_json: null,
  });

  /**
   * A plain read. Null when the tenant has never had a row — and, as with
   * `getPlan`, a failed read propagates rather than becoming that null. Same
   * reason: "no subscription" is a fact about the tenant, not about D1.
   */
  async function readSubscription(db: D1Database, tenantId: string): Promise<SubscriptionRow | null> {
    return db.prepare("SELECT * FROM subscriptions WHERE tenant_id = ?").bind(tenantId).first<SubscriptionRow>();
  }

  /**
   * Read, writing the default row when absent. Always resolves.
   *
   * Every tenant needs a row eventually: without one a standing resolver reads
   * null and cannot tell "never chose a plan" from "cancelled", and those need
   * different copy.
   */
  async function ensureSubscription(db: D1Database, tenantId: string): Promise<SubscriptionRow> {
    const row = await readSubscription(db, tenantId);
    if (row) return row;
    const fresh = defaultRow(tenantId);
    await db
      .prepare("INSERT OR IGNORE INTO subscriptions (tenant_id, plan_id, status, comp, updated_at) VALUES (?, ?, ?, 0, ?)")
      .bind(tenantId, fresh.plan_id, fresh.status, nowIso())
      .run()
      .catch(() => undefined);
    return fresh;
  }

  /**
   * A tenant's effective entitlements: the plan's blob merged onto the free
   * baseline, the tenant's overrides layered on, then CLAMPED by standing.
   *
   * The clamp is the one place delinquency bites capability, so a suspended
   * tenant falls back to free everywhere at once rather than in each gate
   * separately. Every `hasFeature` and `withinQuota` resolves through here.
   */
  async function tenantEntitlements(db: D1Database, tenantId: string): Promise<E> {
    const sub = cfg.materialiseOnRead ? await ensureSubscription(db, tenantId) : await readSubscription(db, tenantId);
    const planId = sub?.plan_id ?? cfg.defaultSubscription.plan_id;
    const plan = await getPlan(db, planId);
    // plan → grandfathering (raise-only) → the operator's adjustment (absolute,
    // either direction) → the suspension clamp. The order is the design: an
    // adjustment is the later word over a grant, and the clamp is the last word
    // over everything, so a suspended tenant cannot be adjusted back into
    // service by a stale row.
    const merged = entitlements.merge(entitlements.resolve(plan?.entitlements_json), sub?.overrides_json);
    const adjusted = entitlements.adjust(merged, sub?.adjustments_json);
    return entitlements.clamp(adjusted, sub?.status ?? cfg.defaultSubscription.status);
  }

  /** True when the tenant's plan (or a grant) includes `feature`. */
  async function hasFeature(db: D1Database, tenantId: string, feature: keyof E["features"]): Promise<boolean> {
    const ent = (await tenantEntitlements(db, tenantId)).features as Record<string, boolean>;
    return ent[feature as string] === true;
  }

  /**
   * Is ONE MORE of `quota` allowed? `-1` is unlimited.
   *
   * Note what this deliberately does NOT do: it never looks at rows that already
   * exist. Call it only on a CREATE. A tenant left over a lowered ceiling keeps
   * every existing row fully readable and writable; they simply cannot add
   * another. Nothing should ever archive, hide or brick an over-quota row —
   * retroactive enforcement turns a billing problem into a data-loss one.
   */
  async function withinQuota(
    db: D1Database,
    tenantId: string,
    quota: keyof E["quotas"],
    currentCount: number,
  ): Promise<{ ok: boolean; max: number }> {
    const quotas = (await tenantEntitlements(db, tenantId)).quotas as Record<string, number>;
    const max = quotas[quota as string] ?? 0;
    if (max < 0) return { ok: true, max };
    return { ok: currentCount < max, max };
  }

  /** Append-only D1 mirror of the credit DO's movements. The DO is authoritative. */
  async function appendLedger(
    db: D1Database,
    entry: { tenant_id: string; delta: number; balance: number; reason: string; ref: string | null },
  ): Promise<void> {
    await db
      .prepare("INSERT INTO credit_ledger (id, tenant_id, delta, balance, reason, ref, at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(newId("led"), entry.tenant_id, entry.delta, entry.balance, entry.reason, entry.ref, nowMs())
      .run();
  }

  return {
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
  };
}

// `app_config` is `@4dl/core`'s table, so its accessors live there. Re-exported
// because a route file's subject is "platform settings" and one import is the
// honest shape of that.
export { getConfig, setConfig };
