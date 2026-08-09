/**
 * Billing store (BLUEPRINT §24, §25) — D1 access for plans, subscriptions,
 * credit ledger, packs, promo codes, the Workers AI rate table, and the
 * admin-editable key/value config. Pure DB glue; the credit *authority* lives
 * in the single-threaded TenantBillingDO. Mirrors the store conventions in
 * db.ts / content.ts (ensureSchema first, `XxxRow` interfaces, DEMO_TENANT).
 */

import { getConfig as coreGetConfig, nowIso, type ConfigSource } from "@4dl/core";
import { DEFAULT_SEED_MARKUP, lanesFor, seedAiModels, type AiModelRow } from "@4dl/ai";
import { bindBillingStore, LADDER_OWNED, type PackRow, type PackSeed, type PlanRow, type PlanSeed, type SubscriptionRow } from "@4dl/billing";
import { ensureSchema, DEMO_TENANT } from "./db.js";
// `billing-seed.js` is imported for the plan/pack/config seeds AND for its
// module-load side effect: it is where Scena hands `@4dl/ai` its lanes and its
// curated floor, and `seedAiModels` below reads both.
import { DEFAULT_PLANS, DEFAULT_PACKS, CONFIG_DEFAULTS, SCENA_CATALOG_VERSION } from "./billing-seed.js";
import { entitlementEngine, resolveEntitlements, mergeOverrides, clampForStatus, type Entitlements } from "./entitlements.js";

/**
 * ⚠️ THE THREE ROW TYPES ARE `@4dl/billing`'s NOW, and re-exported rather than
 * redeclared so a column added to the package's row cannot go missing from this
 * app's view of it.
 *
 * What changed, and it is worth knowing because the old names are all over the
 * git history: `price_cents INTEGER` + `currency` + `interval` became
 * `price_usd_month REAL` (every Scena plan was `usd`/`month`, so the two extra
 * columns were generality nothing used); `sort` became `ord`; and the five
 * subscription timestamps hold ISO-8601 TEXT where they held epoch
 * milliseconds. `billing-reconcile.ts` moves an existing database across.
 *
 * `subscriptions` also GAINS `adjustments_json` — the operator's absolute
 * per-tenant setting, which Scena has never had. `overrides_json` alone meant
 * "give this workspace two more screens" was a one-way door: the grant blob is
 * raise-only by design, so the only way back down was discarding it whole,
 * grandfathering included.
 */
export type { PackRow, PlanRow, SubscriptionRow };

/**
 * A row of `@4dl/ai`'s `ai_models`.
 *
 * ⚠️ `id` IS THE PROVIDER PATH (`@cf/deepgram/aura-1`, `gemini-2.5-flash`), not
 * a slug. There used to be a `cf_model` column holding the path beside a short
 * `id`, and that one difference is what kept Scena off the shared catalog: two
 * tables named `ai_models` keying differently cannot be the same table, and a
 * `CREATE TABLE IF NOT EXISTS` silently gives you whichever shape ran first.
 *
 * Re-exported as `AiModelRow` from `@4dl/ai` — declared here as an alias rather
 * than a second interface so a column added to the package's row cannot go
 * missing from this app's view of it.
 */
export type ModelRow = AiModelRow & {
  /** The order an operator reads the catalog in. Null for a synced row. */
  sort: number | null;
};

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

/**
 * THE SHARED CATALOG STORE, bound to Scena's registry and Scena's catalog.
 *
 * `@4dl/billing` owns the tables, the entitlement engine, the credit DO and the
 * Stripe client, and now owns the reads and writes over `plans`,
 * `subscriptions` and `credit_packs` here too. What stays in this file is what
 * is genuinely Scena's: the CONTENTS of the catalog (four rungs, because a
 * single screen in a café and a forty-screen retail estate are different
 * businesses), the promo codes, the AI model rows, and the two subscription
 * writers that carry Scena-specific rules — `getSubscription`'s demo default and
 * `updateSubscription`'s ladder guard.
 *
 * `materialiseOnRead: true` matches what this app has always done: a read for a
 * workspace with no row writes one. `defaultSubscription` is `free`/`active`
 * rather than `free`/`incomplete` — the PARKING row, not a verdict. Tessa parked
 * on `incomplete` and its gate read the parking default as a fact, holding every
 * workspace read-only on a deployment with no Stripe at all.
 */
const store = bindBillingStore<Entitlements>({
  entitlements: entitlementEngine,
  catalog: {
    plans: DEFAULT_PLANS.map(
      (p): PlanSeed => ({
        id: p.id,
        name: p.name,
        // Every Scena plan is billed monthly in USD, which is what made the
        // `currency` + `interval` columns droppable rather than a loss.
        price_usd_month: p.priceCents / 100,
        entitlements_json: JSON.stringify(p.entitlements),
        ord: p.sort,
        // `active` was hardcoded to 1 in the loop this replaces, which is the
        // whole reason `free` was a product rather than a parking state — the
        // seed offered it for sale no matter what the catalog said.
        active: p.active === false ? 0 : 1,
      }),
    ),
    packs: DEFAULT_PACKS.map((pk): PackSeed => ({ id: pk.id, name: pk.name, credits: pk.credits, price_usd: pk.priceCents / 100, ord: pk.sort, active: 1 })),
    version: SCENA_CATALOG_VERSION,
  },
  defaultSubscription: { plan_id: "free", status: "active" },
  materialiseOnRead: true,
});

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

  /*
    ⚠️ THE CATALOG SEED IS `@4dl/billing`'s, AND THE DIFFERENCE IS NOT COSMETIC.

    What was here was one `INSERT OR IGNORE` per plan, per pack, forever. That
    is fine on an empty database and does NOTHING on a populated one — so a
    repriced plan, a renamed tier, a widened entitlement or a newly-added rung
    never reached a deployment that had already booted once. The catalog in this
    repo and the catalog customers were being charged against could disagree
    indefinitely, and nothing anywhere reported it.

    `seedBilling` is version-stamped: it reconciles name, price, entitlements,
    order and `active` to the declared values on every bump of
    `SCENA_CATALOG_VERSION`, and skips entirely otherwise, so an operator's
    runtime edits still survive a redeploy. It also carries the money rule this
    app had no equivalent of — a price change NULLS the Stripe id pair, because
    `syncCatalog` skips any plan that already has one and a repriced plan would
    otherwise keep charging the old amount forever.
  */
  await store.seedBilling(db);

  const stmts: D1PreparedStatement[] = [];
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
      .bind(DEMO_TENANT, nowIso()),
  );
  await db.batch(stmts);
  /*
    THE MODEL CATALOG IS `@4dl/ai`'s SEED, NOT A LOOP HERE.

    This used to be one more `INSERT OR IGNORE` per row, with `enabled` hardcoded
    to 1. Two things came free with the swap and neither is cosmetic:

      • `enabled` follows RUNNABILITY. A lane the app has no code path for is
        catalogued off instead of being offered to a workspace as a pickable
        model that fails at call time.
      • a lane gets an ELECTED default — the cheapest enabled model in it —
        rather than none at all, which is what forty rows with `is_default = 0`
        gave `defaultModelForTask` to break ties on.

    And it prefers a catalog the platform has already parsed from the two pricing
    pages over the floor, when a shared config store is bound. `ensureBilling`
    has only the database, so that path opens on the first admin visit or sync
    (both of which pass `env`); the floor is what a fresh deployment meters
    against until then. Deliberately last: the batch above is what creates the
    demo subscription the AI features are gated on.
  */
  await seedAiModels(db);
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

/**
 * The plan catalog.
 *
 * `onlySellable` is what every SIGN-UP and UPGRADE surface passes, and it is not
 * cosmetic: `free` is a parking state, not a tier, and a retired plan still has
 * to resolve for the workspaces sitting on it. Both would otherwise appear in
 * the wizard as things a person could choose.
 *
 * The operator console passes nothing and sees everything, which is the point of
 * having the flag rather than deleting the rows.
 */
export async function listPlans(db: D1Database, onlySellable = false): Promise<PlanRow[]> {
  await ensureBilling(db);
  const where = onlySellable ? " WHERE active = 1 AND price_usd_month > 0" : "";
  const res = await db.prepare(`SELECT * FROM plans${where} ORDER BY ord`).all<PlanRow>();
  return res.results ?? [];
}

export async function getPlan(db: D1Database, id: string): Promise<PlanRow | null> {
  await ensureBilling(db);
  return store.getPlan(db, id);
}

/*
  `upsertPlan` AND `setPlanStripe` ARE GONE, and so is `setPackStripe` below.

  Both writers moved out with their only callers. The plan EDITOR is
  `@4dl/billing`'s `planAdminRoutes` — which carries the grandfathering and the
  reprice id null-out this app's version never had — and the Stripe id writes
  belong to `@4dl/billing`'s `syncCatalog`, which replaced Scena's copy the day
  `price_cents` became `price_usd_month`. Nothing here should write `plans`
  again; if a new surface needs to, it wants one of those two.
*/

/* ---------------------------- subscriptions ------------------------------ */

export async function getSubscription(db: D1Database, tenantId = DEMO_TENANT): Promise<SubscriptionRow> {
  await ensureBilling(db);
  const row = await db.prepare("SELECT * FROM subscriptions WHERE tenant_id = ?").bind(tenantId).first<SubscriptionRow>();
  if (row) return row;
  // Defensive: materialize a Free subscription if seeding raced.
  await db.prepare("INSERT OR IGNORE INTO subscriptions (tenant_id, plan_id, status, comp, updated_at) VALUES (?, 'free', 'active', 0, ?)").bind(tenantId, nowIso()).run();
  return (await db.prepare("SELECT * FROM subscriptions WHERE tenant_id = ?").bind(tenantId).first<SubscriptionRow>())!;
}

/**
 * `unlessLadderOwned` — the clamp that stops a payment webhook stalling the
 * dunning ladder, or reviving a workspace its owner asked us to close.
 *
 * Scena's ladder escalates by SELECTING on the previous rung's status
 * (`past_due` → `suspended` → deleted), and `closing` is an owner decision
 * carrying its own `delete_at`. A late `invoice.paid` writing `active`
 * unconditionally — which is what this did — breaks the chain permanently and
 * fails SAFE, so nothing anywhere reports it: the workspace is simply never
 * suspended, never purged, and its storage never reclaimed. `closing` is the
 * sharper half, because `scheduleTenantClose` cancels the Stripe subscription
 * and Stripe fires the cancellation straight back at us.
 *
 * The guard is in the SQL rather than a read-then-check above the call, because
 * this function is a read-modify-write and the check would race with the sweep.
 * `LADDER_OWNED` is `@4dl/billing`'s list, shared with the other apps' handlers
 * so the two cannot drift.
 */
export async function updateSubscription(
  db: D1Database,
  tenantId: string,
  patch: Partial<SubscriptionRow>,
  opts?: { unlessLadderOwned?: boolean },
): Promise<void> {
  await ensureBilling(db);
  const cur = await getSubscription(db, tenantId);
  const next = { ...cur, ...patch, updated_at: nowIso() };
  await db
    .prepare(
      `UPDATE subscriptions SET plan_id = ?, status = ?, comp = ?, stripe_customer_id = ?, stripe_sub_id = ?,
        pending_plan_id = ?, current_period_end = ?, past_due_at = ?, suspend_at = ?, delete_at = ?, updated_at = ?
       WHERE tenant_id = ?${opts?.unlessLadderOwned ? ` AND status NOT IN (${LADDER_OWNED})` : ""}`,
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
  await db.prepare("UPDATE subscriptions SET overrides_json = ?, updated_at = ? WHERE tenant_id = ?").bind(json, nowIso(), tenantId).run();
}

export async function listSubscriptions(db: D1Database): Promise<SubscriptionRow[]> {
  await ensureBilling(db);
  const res = await db.prepare("SELECT * FROM subscriptions ORDER BY updated_at DESC").all<SubscriptionRow>();
  return res.results ?? [];
}

/* ------------------------------- packs ----------------------------------- */

export async function listPacks(db: D1Database): Promise<PackRow[]> {
  await ensureBilling(db);
  return store.listPacks(db);
}

export async function getPack(db: D1Database, id: string): Promise<PackRow | null> {
  await ensureBilling(db);
  return db.prepare("SELECT * FROM credit_packs WHERE id = ?").bind(id).first<PackRow>();
}

/* ---------------------------- AI model rates ----------------------------- */

export async function listModels(db: D1Database, onlyEnabled = false): Promise<ModelRow[]> {
  await ensureBilling(db);
  /*
    `COALESCE(sort, 9999)`, not `ORDER BY sort`.

    The curated floor ranks its forty rows; a row the pricing-page sync
    discovers has no `sort` at all, and SQLite sorts a NULL FIRST in ASC — so a
    bare `ORDER BY sort` puts every newly-discovered model above the whole
    curated catalog, which is exactly backwards from what an operator scanning
    this list wants.
  */
  const where = onlyEnabled ? " WHERE enabled = 1" : "";
  const res = await db.prepare(`SELECT * FROM ai_models${where} ORDER BY COALESCE(sort, 9999), task, label`).all<ModelRow>();
  return res.results ?? [];
}

export async function getModel(db: D1Database, id: string): Promise<ModelRow | null> {
  await ensureBilling(db);
  return db.prepare("SELECT * FROM ai_models WHERE id = ?").bind(id).first<ModelRow>();
}

/**
 * The workspace's default model for a lane.
 *
 * Prefers the workspace's own override (`ai.default_model.<task>:<tenantId>`),
 * then the platform default (`ai.default_model.<task>`, operator-set), then the
 * lane's ELECTED default (`is_default`, the cheapest enabled model in the lane),
 * and only then the first row by sort. The per-tenant key keeps one workspace's
 * choice from silently changing another's. Returns null only when the catalog
 * has nothing for the lane.
 *
 * ⚠️ TWO THINGS HERE ARE NOT OPTIONAL, and both were wrong before the catalog
 * moved to `@4dl/ai`:
 *
 *   `lanesFor` — a catalog holding both providers stores text-to-speech under
 *   `tts` (Cloudflare's page) AND `speech` (Google's). Filtering on one name
 *   made every Gemini voice invisible to a `tts` request, which surfaces as
 *   "the model I picked in settings is not being used" and nothing else.
 *
 *   `is_default` — the fallback used to be "the first enabled row by sort",
 *   which ignored the election entirely. So the operator console could show one
 *   model as a lane's default while the generator used another, with no
 *   disagreement visible anywhere.
 */
export async function defaultModelForTask(db: D1Database, task: string, tenantId?: string): Promise<ModelRow | null> {
  const lanes = new Set(lanesFor(task));
  const enabled = (await listModels(db, true)).filter((m) => lanes.has(m.task));
  if (enabled.length === 0) return null;
  const cfg = await getConfig(db);
  const pref = (tenantId ? cfg[`ai.default_model.${task}:${tenantId}`] : "") || cfg[`ai.default_model.${task}`] || "";
  return enabled.find((m) => m.id === pref) ?? enabled.find((m) => m.is_default === 1) ?? enabled[0]!;
}

/**
 * Operator edit of one catalog row.
 *
 * RATES, LABEL, LANE, MARKUP, ON/OFF AND ORDER — never `id`, because the id is
 * the string the provider answers to. A row whose id could be edited would be a
 * row that stops resolving at the provider and starts looking, from the console,
 * exactly like a model that is merely broken.
 */
export async function upsertModel(db: D1Database, m: Partial<ModelRow> & { id: string }): Promise<void> {
  await ensureBilling(db);
  const cur = await getModel(db, m.id);
  if (cur) {
    await db
      .prepare("UPDATE ai_models SET label = ?, task = ?, provider = ?, input_rate = ?, output_rate = ?, unit_rate = ?, unit_kind = ?, markup = ?, enabled = ?, is_default = ?, sort = ? WHERE id = ?")
      .bind(m.label ?? cur.label, m.task ?? cur.task, m.provider ?? cur.provider, m.input_rate ?? cur.input_rate, m.output_rate ?? cur.output_rate, m.unit_rate ?? cur.unit_rate, m.unit_kind ?? cur.unit_kind, m.markup ?? cur.markup, m.enabled ?? cur.enabled, m.is_default ?? cur.is_default, m.sort ?? cur.sort, m.id)
      .run();
  } else {
    await db
      .prepare("INSERT INTO ai_models (id, label, task, provider, input_rate, output_rate, unit_rate, unit_kind, markup, enabled, is_default, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(m.id, m.label ?? m.id, m.task ?? "text", m.provider ?? providerOf(m.id), m.input_rate ?? null, m.output_rate ?? null, m.unit_rate ?? null, m.unit_kind ?? null, m.markup ?? DEFAULT_SEED_MARKUP, m.enabled ?? 1, m.is_default ?? 0, m.sort ?? null)
      .run();
  }
}

/**
 * Which provider answers to an id, from the id itself.
 *
 * A last resort for an insert that did not say. Only Workers AI paths start
 * `@cf/`, and everything else in this catalog is Google's — a rule that holds
 * because the id IS the provider path, which is the point of the migration.
 */
export const providerOf = (id: string): string => (id.startsWith("@cf/") ? "workers-ai" : "google");

/* ------------------------------ ledger ----------------------------------- */

export interface LedgerRow {
  id: string;
  tenant_id: string;
  delta: number;
  balance: number;
  reason: string;
  ref: string | null;
  /**
   * ⚠️ `at`, not `created_at` — `@4dl/billing`'s column, and epoch MILLISECONDS
   * unlike the subscription's five ISO timestamps.
   *
   * The difference is deliberate on the package's side: a ledger row is an event
   * stamp nothing compares in SQL, while `past_due_at` anchors a ladder whose
   * every rung is a `<` against a value JavaScript produced.
   */
  at: number;
}

/**
 * Mirror a DO ledger entry to D1 for invoices/history (append-only).
 *
 * `INSERT OR IGNORE`, not `INSERT`: the shared store's `appendLedger` mints its
 * own id, and this one lets the CALLER supply one so a retried settle re-writes
 * the same row instead of adding a second. That is why this stays Scena's.
 */
export async function appendLedger(db: D1Database, entry: Omit<LedgerRow, "id" | "at"> & { id?: string; at?: number }): Promise<void> {
  await ensureBilling(db);
  await db
    .prepare("INSERT OR IGNORE INTO credit_ledger (id, tenant_id, delta, balance, reason, ref, at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(entry.id ?? `led_${randomHex(10)}`, entry.tenant_id, entry.delta, entry.balance, entry.reason, entry.ref ?? null, entry.at ?? Date.now())
    .run();
}

export async function listLedger(db: D1Database, tenantId = DEMO_TENANT, limit = 100): Promise<LedgerRow[]> {
  await ensureBilling(db);
  const res = await db.prepare("SELECT * FROM credit_ledger WHERE tenant_id = ? ORDER BY at DESC LIMIT ?").bind(tenantId, limit).all<LedgerRow>();
  return res.results ?? [];
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}
