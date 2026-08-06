/**
 * Billing store (BLUEPRINT §24, §25) — D1 access for plans, subscriptions,
 * credit ledger, packs, promo codes, the Workers AI rate table, and the
 * admin-editable key/value config. Pure DB glue; the credit *authority* lives
 * in the single-threaded TenantBillingDO. Mirrors the store conventions in
 * db.ts / content.ts (ensureSchema first, `XxxRow` interfaces, DEMO_TENANT).
 */

import { getConfig as coreGetConfig, type ConfigSource } from "@4dl/core";
import { ensureSchema, DEMO_TENANT } from "./db.js";
import { DEFAULT_PLANS, DEFAULT_PACKS, DEFAULT_MODELS, CONFIG_DEFAULTS } from "./billing-seed.js";
import { resolveEntitlements, mergeOverrides, clampForStatus, type Entitlements } from "./entitlements.js";

export interface PlanRow {
  id: string;
  name: string;
  price_cents: number;
  currency: string;
  interval: string;
  entitlements_json: string;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  sort: number;
  active: number;
}

export interface SubscriptionRow {
  tenant_id: string;
  plan_id: string;
  status: string; // active | trialing | past_due | suspended | canceled
  comp: number; // 1 = comped (promo/gift/demo) — exempt from dunning
  stripe_customer_id: string | null;
  stripe_sub_id: string | null;
  pending_plan_id: string | null;
  current_period_end: number | null;
  past_due_at: number | null;
  suspend_at: number | null;
  delete_at: number | null;
  updated_at: number;
  /** Admin-set per-tenant entitlement gifts, layered on top of the plan (§25). */
  overrides_json: string | null;
}

export interface PackRow {
  id: string;
  name: string;
  credits: number;
  price_cents: number;
  currency: string;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  sort: number;
  active: number;
}

export interface ModelRow {
  id: string;
  label: string;
  task: string;
  cf_model: string;
  input_rate: number | null;
  output_rate: number | null;
  unit_rate: number | null;
  unit_kind: string | null;
  markup: number;
  enabled: number;
  sort: number;
}

export interface PromoRow {
  code: string;
  kind: string; // credits | plan
  credits: number | null;
  plan_id: string | null;
  plan_months: number | null;
  max_redemptions: number | null;
  redeemed_count: number;
  per_tenant_limit: number | null;
  expires_at: number | null;
  note: string | null;
  active: number;
  created_at: number;
}

let seeded: Promise<void> | null = null;

/** Seed the default catalog + config + a starting subscription once per isolate. */
export async function ensureBilling(db: D1Database): Promise<void> {
  await ensureSchema(db);
  if (!seeded) {
    seeded = seed(db).catch((err) => {
      seeded = null;
      throw err;
    });
  }
  return seeded;
}

/** Reset the once-per-isolate seed cache and re-run the seed. Used by the admin
 *  factory-reset (nuke) after it wipes every table, to restore the default plan
 *  catalog + config so the platform is immediately usable again. */
export async function forceReseedBilling(db: D1Database): Promise<void> {
  seeded = null;
  return ensureBilling(db);
}

async function seed(db: D1Database): Promise<void> {
  const now = Date.now();
  const stmts: D1PreparedStatement[] = [];

  for (const p of DEFAULT_PLANS) {
    stmts.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO plans (id, name, price_cents, currency, interval, entitlements_json, sort, active, created_at) VALUES (?, ?, ?, 'usd', ?, ?, ?, 1, ?)",
        )
        .bind(p.id, p.name, p.priceCents, p.interval, JSON.stringify(p.entitlements), p.sort, now),
    );
  }
  for (const pk of DEFAULT_PACKS) {
    stmts.push(
      db
        .prepare("INSERT OR IGNORE INTO credit_packs (id, name, credits, price_cents, currency, sort, active) VALUES (?, ?, ?, ?, 'usd', ?, 1)")
        .bind(pk.id, pk.name, pk.credits, pk.priceCents, pk.sort),
    );
  }
  for (const m of DEFAULT_MODELS) {
    stmts.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO ai_models (id, label, task, cf_model, input_rate, output_rate, unit_rate, unit_kind, markup, enabled, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
        )
        .bind(m.id, m.label, m.task, m.cfModel, m.inputRate, m.outputRate, m.unitRate, m.unitKind, m.markup, m.sort),
    );
  }
  for (const [key, value] of Object.entries(CONFIG_DEFAULTS)) {
    stmts.push(db.prepare("INSERT OR IGNORE INTO app_config (key, value, updated_at) VALUES (?, ?, ?)").bind(key, value, now));
  }
  // The single demo tenant ships as a comped Pro account (a built-in "sales
  // demo" grant, §25) so AI generation + credits work out of the box; comp=1
  // exempts it from dunning. New tenants would instead start on 'free'.
  stmts.push(
    db
      .prepare(
        "INSERT OR IGNORE INTO subscriptions (tenant_id, plan_id, status, comp, current_period_end, updated_at) VALUES (?, 'pro', 'active', 1, NULL, ?)",
      )
      .bind(DEMO_TENANT, now),
  );
  await db.batch(stmts);
}

/* ------------------------------- config ---------------------------------- */

/**
 * CONFIG READS THE APP'S OWN ROWS FIRST, THEN THE PLATFORM'S.
 *
 * This was a bare `SELECT key, value FROM app_config`. It still is, underneath —
 * `@4dl/core`'s `getConfig` reads the same table — but it now falls THROUGH to a
 * shared KV bound with the same id into every 4DL worker.
 *
 * That matters to Scena more than to most: it authenticates against ONE Google
 * account (`gemini.ts`), ONE Stripe account, and one Turnstile widget, and every
 * one of those keys was a per-app copy that had to be re-pasted on rotation or
 * quietly kept the old value. `SHARED_CONFIG_KEYS` in `@4dl/core` is the
 * allow-list, enforced on read AND write.
 *
 * **Non-empty wins, not present wins.** Every consumer here already reads `""`
 * as unconfigured, so a blank local row falls through rather than masking the
 * shared value. The consequence to know: you cannot switch a shared key off for
 * one app by blanking it — give that app its own value, or do not share the key.
 *
 * **Unbound changes nothing.** No `PLATFORM_CONFIG` binding, no behaviour
 * change, which is what `wrangler dev` and the whole test suite run.
 *
 * `src` is a `ConfigSource`: pass `c.env` to get the merge, or a bare D1 handle
 * where the bindings are not to hand (the DOs) and get local-only.
 */
export async function getConfig(src: ConfigSource): Promise<Record<string, string>> {
  const db = "prepare" in src ? src : src.DB;
  await ensureBilling(db);
  return { ...CONFIG_DEFAULTS, ...(await coreGetConfig(src)) };
}

export async function getConfigValue(src: ConfigSource, key: string): Promise<string> {
  const cfg = await getConfig(src);
  return cfg[key] ?? "";
}

/**
 * Writes go to the APP's `app_config`, never to the shared store.
 *
 * The shared store is written from the operator console (`@4dl/admin`), which is
 * the one surface that knows it is editing something every product reads. A
 * product route writing there would let one app silently re-key another.
 */
export async function setConfig(db: D1Database, entries: Record<string, string>): Promise<void> {
  await ensureBilling(db);
  const now = Date.now();
  const stmts = Object.entries(entries).map(([key, value]) =>
    db.prepare("INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(key, value, now),
  );
  if (stmts.length) await db.batch(stmts);
}

/* -------------------------------- plans ---------------------------------- */

export async function listPlans(db: D1Database): Promise<PlanRow[]> {
  await ensureBilling(db);
  const res = await db.prepare("SELECT * FROM plans ORDER BY sort").all<PlanRow>();
  return res.results ?? [];
}

export async function getPlan(db: D1Database, id: string): Promise<PlanRow | null> {
  await ensureBilling(db);
  return db.prepare("SELECT * FROM plans WHERE id = ?").bind(id).first<PlanRow>();
}

export async function upsertPlan(db: D1Database, p: Partial<PlanRow> & { id: string }): Promise<void> {
  await ensureBilling(db);
  const existing = await getPlan(db, p.id);
  if (existing) {
    await db
      .prepare("UPDATE plans SET name = ?, price_cents = ?, interval = ?, entitlements_json = ?, sort = ?, active = ? WHERE id = ?")
      .bind(
        p.name ?? existing.name,
        p.price_cents ?? existing.price_cents,
        p.interval ?? existing.interval,
        p.entitlements_json ?? existing.entitlements_json,
        p.sort ?? existing.sort,
        p.active ?? existing.active,
        p.id,
      )
      .run();
  } else {
    await db
      .prepare("INSERT INTO plans (id, name, price_cents, currency, interval, entitlements_json, sort, active, created_at) VALUES (?, ?, ?, 'usd', ?, ?, ?, 1, ?)")
      .bind(p.id, p.name ?? p.id, p.price_cents ?? 0, p.interval ?? "month", p.entitlements_json ?? "{}", p.sort ?? 99, Date.now())
      .run();
  }
}

export async function setPlanStripe(db: D1Database, id: string, productId: string, priceId: string): Promise<void> {
  await db.prepare("UPDATE plans SET stripe_product_id = ?, stripe_price_id = ? WHERE id = ?").bind(productId, priceId, id).run();
}

/* ---------------------------- subscriptions ------------------------------ */

export async function getSubscription(db: D1Database, tenantId = DEMO_TENANT): Promise<SubscriptionRow> {
  await ensureBilling(db);
  const row = await db.prepare("SELECT * FROM subscriptions WHERE tenant_id = ?").bind(tenantId).first<SubscriptionRow>();
  if (row) return row;
  // Defensive: materialize a Free subscription if seeding raced.
  await db.prepare("INSERT OR IGNORE INTO subscriptions (tenant_id, plan_id, status, comp, updated_at) VALUES (?, 'free', 'active', 0, ?)").bind(tenantId, Date.now()).run();
  return (await db.prepare("SELECT * FROM subscriptions WHERE tenant_id = ?").bind(tenantId).first<SubscriptionRow>())!;
}

export async function updateSubscription(db: D1Database, tenantId: string, patch: Partial<SubscriptionRow>): Promise<void> {
  await ensureBilling(db);
  const cur = await getSubscription(db, tenantId);
  const next = { ...cur, ...patch, updated_at: Date.now() };
  await db
    .prepare(
      `UPDATE subscriptions SET plan_id = ?, status = ?, comp = ?, stripe_customer_id = ?, stripe_sub_id = ?,
        pending_plan_id = ?, current_period_end = ?, past_due_at = ?, suspend_at = ?, delete_at = ?, updated_at = ?
       WHERE tenant_id = ?`,
    )
    .bind(
      next.plan_id,
      next.status,
      next.comp,
      next.stripe_customer_id,
      next.stripe_sub_id,
      next.pending_plan_id,
      next.current_period_end,
      next.past_due_at,
      next.suspend_at,
      next.delete_at,
      next.updated_at,
      tenantId,
    )
    .run();
}

/**
 * The tenant's EFFECTIVE entitlements: plan → override → clamp.
 *
 * ⚠️ THE CLAMP IS NEW, and its absence was a real hole rather than an omission.
 *
 * This read "a suspended tenant keeps its plan's feature shape but playout is
 * gated elsewhere". The second half describes the HOST gate, which closes an
 * origin — a different question from what a tenant may DO. So a suspended
 * workspace resolved its full paid entitlements at every call site that asks
 * about capability: the AI generator's `aiGeneration` check, the ads module, the
 * music library, the compile-time widget gate. The host gate refuses WRITES, so
 * the practical exposure was reads and the manifest — but the manifest is the
 * artifact a screen replays offline for weeks, which is exactly the thing a
 * downgrade has to strip.
 *
 * `clampForStatus` applies the free baseline once, here, so every gate inherits
 * it with no per-caller bookkeeping. `emergencyOverride` is `true` in that
 * baseline on purpose — see `entitlements.ts`.
 */
export async function tenantEntitlements(db: D1Database, tenantId = DEMO_TENANT): Promise<Entitlements> {
  const sub = await getSubscription(db, tenantId);
  const plan = await getPlan(db, sub.plan_id);
  // Layer any admin-granted per-tenant overrides on top of the plan (§25).
  const granted = mergeOverrides(resolveEntitlements(plan?.entitlements_json), sub.overrides_json);
  // A comped tenant is exempt: the whole point of comping is that the status
  // does not decide, an operator does.
  return sub.comp ? granted : clampForStatus(granted, sub.status);
}

/**
 * Is one more of `quota` within the tenant's plan?
 *
 * `-1` means unlimited, and the comparison is `currentCount < max` — a ceiling,
 * not a retroactive sweep. A tenant that DOWNGRADES below its current usage
 * keeps every existing row fully readable and writable; it simply cannot add
 * another. Nothing here should ever archive, hide or brick an over-quota row:
 * retroactive enforcement turns a billing problem into a data-loss one.
 */
export async function withinQuota(
  db: D1Database,
  tenantId: string,
  quota: keyof Entitlements["quotas"],
  currentCount: number,
): Promise<{ ok: boolean; max: number }> {
  const quotas = (await tenantEntitlements(db, tenantId)).quotas as unknown as Record<string, number>;
  const max = quotas[quota as string] ?? 0;
  if (max < 0) return { ok: true, max };
  return { ok: currentCount < max, max };
}

/** Admin: set a tenant's entitlement override blob (a partial Entitlements). */
export async function setTenantOverrides(db: D1Database, tenantId: string, json: string | null): Promise<void> {
  await getSubscription(db, tenantId); // ensure the row exists
  await db.prepare("UPDATE subscriptions SET overrides_json = ?, updated_at = ? WHERE tenant_id = ?").bind(json, Date.now(), tenantId).run();
}

export async function listSubscriptions(db: D1Database): Promise<SubscriptionRow[]> {
  await ensureBilling(db);
  const res = await db.prepare("SELECT * FROM subscriptions ORDER BY updated_at DESC").all<SubscriptionRow>();
  return res.results ?? [];
}

/* ------------------------------- packs ----------------------------------- */

export async function listPacks(db: D1Database): Promise<PackRow[]> {
  await ensureBilling(db);
  const res = await db.prepare("SELECT * FROM credit_packs WHERE active = 1 ORDER BY sort").all<PackRow>();
  return res.results ?? [];
}

export async function getPack(db: D1Database, id: string): Promise<PackRow | null> {
  await ensureBilling(db);
  return db.prepare("SELECT * FROM credit_packs WHERE id = ?").bind(id).first<PackRow>();
}

export async function setPackStripe(db: D1Database, id: string, productId: string, priceId: string): Promise<void> {
  await db.prepare("UPDATE credit_packs SET stripe_product_id = ?, stripe_price_id = ? WHERE id = ?").bind(productId, priceId, id).run();
}

/* ---------------------------- AI model rates ----------------------------- */

export async function listModels(db: D1Database, onlyEnabled = false): Promise<ModelRow[]> {
  await ensureBilling(db);
  const sql = onlyEnabled ? "SELECT * FROM ai_models WHERE enabled = 1 ORDER BY sort" : "SELECT * FROM ai_models ORDER BY sort";
  const res = await db.prepare(sql).all<ModelRow>();
  return res.results ?? [];
}

export async function getModel(db: D1Database, id: string): Promise<ModelRow | null> {
  await ensureBilling(db);
  return db.prepare("SELECT * FROM ai_models WHERE id = ?").bind(id).first<ModelRow>();
}

/**
 * The tenant's default model for a task. Prefers the tenant's own override
 * (`ai.default_model.<task>:<tenantId>`), then the platform default
 * (`ai.default_model.<task>`, admin-set), and validates it's still an enabled
 * model for that task; otherwise falls back to the first enabled model (by sort)
 * so a disabled/removed default never wedges a generator. The per-tenant key
 * keeps one workspace's model choice from silently changing another's. Returns
 * null only when the catalog has nothing for the task.
 */
export async function defaultModelForTask(db: D1Database, task: string, tenantId?: string): Promise<ModelRow | null> {
  const enabled = (await listModels(db, true)).filter((m) => m.task === task);
  if (enabled.length === 0) return null;
  const cfg = await getConfig(db);
  const pref = (tenantId ? cfg[`ai.default_model.${task}:${tenantId}`] : "") || cfg[`ai.default_model.${task}`] || "";
  return enabled.find((m) => m.id === pref) ?? enabled[0]!;
}

export async function upsertModel(db: D1Database, m: Partial<ModelRow> & { id: string }): Promise<void> {
  await ensureBilling(db);
  const cur = await getModel(db, m.id);
  if (cur) {
    await db
      .prepare("UPDATE ai_models SET label = ?, task = ?, cf_model = ?, input_rate = ?, output_rate = ?, unit_rate = ?, unit_kind = ?, markup = ?, enabled = ?, sort = ? WHERE id = ?")
      .bind(m.label ?? cur.label, m.task ?? cur.task, m.cf_model ?? cur.cf_model, m.input_rate ?? cur.input_rate, m.output_rate ?? cur.output_rate, m.unit_rate ?? cur.unit_rate, m.unit_kind ?? cur.unit_kind, m.markup ?? cur.markup, m.enabled ?? cur.enabled, m.sort ?? cur.sort, m.id)
      .run();
  } else {
    await db
      .prepare("INSERT INTO ai_models (id, label, task, cf_model, input_rate, output_rate, unit_rate, unit_kind, markup, enabled, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(m.id, m.label ?? m.id, m.task ?? "text", m.cf_model ?? "", m.input_rate ?? null, m.output_rate ?? null, m.unit_rate ?? null, m.unit_kind ?? null, m.markup ?? 3, m.enabled ?? 1, m.sort ?? 99)
      .run();
  }
}

/**
 * Re-sync the built-in catalog: upsert every DEFAULT_MODELS entry so new models
 * appear and existing rates/labels refresh — while preserving each model's
 * enabled flag (never re-enable something an admin turned off). Returns how many
 * rows were newly added vs updated.
 */
export async function resyncModels(db: D1Database): Promise<{ added: number; updated: number }> {
  await ensureBilling(db);
  let added = 0, updated = 0;
  for (const m of DEFAULT_MODELS) {
    const existed = await getModel(db, m.id);
    await upsertModel(db, {
      id: m.id, label: m.label, task: m.task, cf_model: m.cfModel,
      input_rate: m.inputRate, output_rate: m.outputRate, unit_rate: m.unitRate, unit_kind: m.unitKind,
      markup: m.markup, sort: m.sort,
      // new models come in enabled; existing keep whatever the admin set
      ...(existed ? {} : { enabled: 1 }),
    });
    existed ? updated++ : added++;
  }
  return { added, updated };
}

/* ------------------------------ ledger ----------------------------------- */

export interface LedgerRow {
  id: string;
  tenant_id: string;
  delta: number;
  balance: number;
  reason: string;
  ref: string | null;
  created_at: number;
}

/** Mirror a DO ledger entry to D1 for invoices/history (append-only). */
export async function appendLedger(db: D1Database, entry: Omit<LedgerRow, "id" | "created_at"> & { id?: string; created_at?: number }): Promise<void> {
  await ensureBilling(db);
  await db
    .prepare("INSERT OR IGNORE INTO credit_ledger (id, tenant_id, delta, balance, reason, ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(entry.id ?? `led_${randomHex(10)}`, entry.tenant_id, entry.delta, entry.balance, entry.reason, entry.ref ?? null, entry.created_at ?? Date.now())
    .run();
}

export async function listLedger(db: D1Database, tenantId = DEMO_TENANT, limit = 100): Promise<LedgerRow[]> {
  await ensureBilling(db);
  const res = await db.prepare("SELECT * FROM credit_ledger WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?").bind(tenantId, limit).all<LedgerRow>();
  return res.results ?? [];
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}
