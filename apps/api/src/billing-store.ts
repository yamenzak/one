/**
 * Platform billing store (SPEC §5) — plans, tenant subscriptions, credit
 * packs, config, and the D1 mirror of the DO credit ledger. Seed data is
 * admin-editable at runtime; these are the ship defaults.
 */

import { resolveEntitlements, mergeOverrides, type Entitlements } from "@mossa/domain";
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

/** SPEC §5 seed plans (prices are launch placeholders, admin-tunable). */
export const DEFAULT_PLANS: Omit<PlanRow, "stripe_product_id" | "stripe_price_id">[] = [
  {
    id: "free",
    name: "Free",
    price_usd_month: 0,
    ord: 0,
    active: 1,
    entitlements_json: j({
      quotas: { staffSeats: 1, activeClients: 3, templates: 5, storageMb: 250 },
      features: { externalSearch: true },
      aiCredits: { monthlyGrant: 0 },
    }),
  },
  {
    id: "solo",
    name: "Solo",
    price_usd_month: 29,
    ord: 1,
    active: 1,
    entitlements_json: j({
      quotas: { staffSeats: 1, activeClients: 25, templates: 50, storageMb: 5000 },
      features: { commerce: true, aiSuite: true, bfCamera: true, externalSearch: true },
      aiCredits: { monthlyGrant: 500 },
    }),
  },
  {
    id: "studio",
    name: "Studio",
    price_usd_month: 79,
    ord: 2,
    active: 1,
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
        chat: true,
      },
      aiCredits: { monthlyGrant: 2500 },
    }),
  },
  {
    id: "team",
    name: "Team",
    price_usd_month: 199,
    ord: 3,
    active: 1,
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
        integrations: true,
        chat: true,
      },
      aiCredits: { monthlyGrant: 10_000 },
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

/** Idempotent seed: INSERT OR IGNORE so admin edits survive redeploys. Runs on
 *  demand with no module-level guard, so it stays correct across isolated
 *  per-test storage (a leaked guard would skip seeding into a fresh frame). */
export async function seedBilling(db: D1Database): Promise<void> {
  const stmts = [
    ...DEFAULT_PLANS.map((p) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO plans (id, name, price_usd_month, entitlements_json, ord, active) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(p.id, p.name, p.price_usd_month, p.entitlements_json, p.ord, p.active),
    ),
    ...DEFAULT_PACKS.map((p) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO credit_packs (id, name, credits, price_usd, ord, active) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(p.id, p.name, p.credits, p.price_usd, p.ord, p.active),
    ),
  ];
  await db.batch(stmts).catch(() => undefined);
}

export async function listPlans(db: D1Database): Promise<PlanRow[]> {
  const r = await db.prepare("SELECT * FROM plans WHERE active = 1 ORDER BY ord").all<PlanRow>();
  return r.results ?? [];
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

/** Resolve a tenant's effective entitlements: plan blob + per-tenant overrides. */
export async function tenantEntitlements(db: D1Database, tenantId: string): Promise<Entitlements> {
  const sub = await getSubscription(db, tenantId);
  const plan = await db
    .prepare("SELECT entitlements_json FROM plans WHERE id = ?")
    .bind(sub.plan_id)
    .first<{ entitlements_json: string | null }>();
  return mergeOverrides(resolveEntitlements(plan?.entitlements_json), sub.overrides_json);
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
 *  unlimited; returns whether one more of `resource` is allowed. */
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
