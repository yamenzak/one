/**
 * ONE WORKSPACE, SEVERAL PRODUCTS, ONE BILL.
 *
 * ⚠️ THIS IS THE PRODUCT ARGUMENT THE WHOLE INVERSION IS FOR (D1). A business
 * with three of our products has one customer record, one payment method, one
 * balance and one invoice with three lines — not three workspaces, three cards
 * and three renewal dates arriving on three different days. The previous
 * platform could not express it: a subscription belonged to a product, so a
 * customer of two products was two customers.
 *
 * ⚠️ SO THE SUBSCRIPTION IS PER APP AND THE ACCOUNT IS PER TENANT. The plan a
 * workspace is on is a fact about a product; the card, the balance and the
 * invoice are facts about the business. Conflating them is what makes the second
 * product a second bill.
 *
 * ⚠️ AND THE ENTITLEMENT WALK LIVES IN THE KERNEL, resolved on every request.
 * Two implementations of "what does this tenant have" is how a screen comes to
 * promise what a route refuses — and the screen is the one people believe.
 */

import type { Allowance, AppId, EntitlementDef, Instant, PlanSpec, Resolved, Standing, TenantId } from "@engine/kernel";
import { standingFor, walk, type SubStatus } from "@engine/kernel";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

/* ----------------------------------------------------------------- schema --- */

export const BILLING_SCHEMA: SchemaModule = {
  id: "billing",
  statements: [
    /*
      ⚠️ ONE PER BUSINESS. The card and the balance are theirs, not a product's.

      ⚠️ AND THE BALANCE IS TWO COLUMNS, BECAUSE THEY OBEY OPPOSITE RULES.
      `granted` is the month's allowance and is SET on renewal; `bought` was paid
      for with a card and is never reset. One number would make the renewal
      either confiscate what somebody bought or carry an allowance forward for
      ever, and there is no third behaviour a single column can have.
    */
    /*
      ⚠️ AND THE AUTO-TOP-UP IS FOUR COLUMNS ON THE SAME ROW, not a setting. It
      is an instruction to charge a card without anybody present, so it belongs
      beside the card — `auto_at` is the cooldown that stops a burst of refusals
      becoming a burst of charges, and `auto_error` is why the last attempt did
      not work, which is the one thing a customer needs and a log cannot give
      them.
    */
    `CREATE TABLE IF NOT EXISTS billing_account (tenant_id TEXT PRIMARY KEY, customer_ref TEXT, currency TEXT NOT NULL, granted INTEGER, bought INTEGER, held INTEGER NOT NULL, auto_pack TEXT, auto_below INTEGER, auto_at TEXT, auto_error TEXT, at TEXT NOT NULL);`,
    /* ⚠️ AND ONE PER PRODUCT THEY HAVE SWITCHED ON. */
    `CREATE TABLE IF NOT EXISTS subscription (tenant_id TEXT NOT NULL, app_id TEXT NOT NULL, plan_id TEXT NOT NULL, status TEXT NOT NULL, at TEXT NOT NULL, past_due_at TEXT, trial_ends_at TEXT, overrides_json TEXT, adjustments_json TEXT, PRIMARY KEY (tenant_id, app_id));`,
    `CREATE INDEX IF NOT EXISTS ix_subscription_due ON subscription (status, past_due_at);`,
    `CREATE TABLE IF NOT EXISTS credit_ledger (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, app_id TEXT, at TEXT NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL, ref TEXT);`,
    `CREATE INDEX IF NOT EXISTS ix_credit_ledger_tenant ON credit_ledger (tenant_id, at);`,
  ],
};

/* --------------------------------------------------------------- the rows --- */

export interface SubRow {
  readonly tenantId: TenantId;
  readonly appId: AppId;
  readonly planId: string;
  readonly status: SubStatus;
  readonly pastDueAt: Instant | null;
  readonly overrides: Readonly<Record<string, Allowance>>;
  readonly adjustments: Readonly<Record<string, Allowance>>;
}

const asSub = (r: Record<string, unknown>): SubRow => ({
  tenantId: r.tenant_id as TenantId,
  appId: r.app_id as AppId,
  planId: r.plan_id as string,
  status: r.status as SubStatus,
  pastDueAt: (r.past_due_at as Instant | null) ?? null,
  overrides: JSON.parse((r.overrides_json as string | null) ?? "{}") as Record<string, Allowance>,
  adjustments: JSON.parse((r.adjustments_json as string | null) ?? "{}") as Record<string, Allowance>,
});

/**
 * ⚠️ A WORKSPACE THAT NEVER CHOSE LANDS ON THE PARKING PLAN, AND THAT IS NOT
 * ARREARS. `incomplete` is where a signup sits for its first minute; reading it
 * as a verdict holds a brand-new workspace read-only over an invoice that never
 * existed, which is precisely what a previous platform shipped.
 */
export async function subscriptionFor(
  db: Db, tenantId: TenantId, appId: AppId,
): Promise<SubRow | null> {
  const row = await db.prepare(
    `SELECT * FROM subscription WHERE tenant_id = ? AND app_id = ?`).bind(tenantId, appId).first();
  return row ? asSub(row) : null;
}

/**
 * ⚠️ THE FOUR WRITES BELOW ARE THE LADDER, AND ONLY A VERIFIED EVENT DRIVES
 * THEM. Nothing here is reachable from a route a caller can press: a workspace
 * that could write its own subscription row is a workspace that can grant itself
 * a plan, and the whole of the payment design is that the money moving is the
 * only thing that stamps one.
 */
export async function subscribe(
  db: Db, tenantId: TenantId, appId: AppId, planId: string, status: SubStatus, now = new Date(),
): Promise<void> {
  await db.prepare(
    `INSERT INTO subscription (tenant_id, app_id, plan_id, status, at, past_due_at, trial_ends_at, overrides_json, adjustments_json)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, '{}', '{}')
     ON CONFLICT(tenant_id, app_id) DO UPDATE SET plan_id = excluded.plan_id, status = excluded.status`)
    .bind(tenantId, appId, planId, status, now.toISOString()).run();
}

/** ⚠️ The anchor every rung of the ladder is measured from. Set once, cleared on payment. */
export async function markPastDue(
  db: Db, tenantId: TenantId, appId: AppId, now = new Date(),
): Promise<void> {
  await db.prepare(
    `UPDATE subscription SET status = 'past_due', past_due_at = COALESCE(past_due_at, ?)
     WHERE tenant_id = ? AND app_id = ?`).bind(now.toISOString(), tenantId, appId).run();
}

export async function markPaid(db: Db, tenantId: TenantId, appId: AppId): Promise<void> {
  await db.prepare(
    `UPDATE subscription SET status = 'active', past_due_at = NULL WHERE tenant_id = ? AND app_id = ?`)
    .bind(tenantId, appId).run();
}

/**
 * ⚠️ CANCELLED IS NOT PAST DUE, AND THE ANCHOR IS WHY. `past_due_at` is what
 * every rung of the ladder is measured from, and a workspace that CHOSE to stop
 * has no arrears — dating one would start a 37-day countdown to erasure over a
 * decision nobody disputed. The row keeps its records and its plan history; what
 * ends is the charge.
 */
export async function markCancelled(
  db: Db, tenantId: TenantId, appId: AppId,
): Promise<void> {
  await db.prepare(
    `UPDATE subscription SET status = 'cancelled', past_due_at = NULL
     WHERE tenant_id = ? AND app_id = ?`).bind(tenantId, appId).run();
}

/* ------------------------------------------------------------- resolution --- */

export interface Held {
  readonly standing: Standing;
  readonly entitlements: readonly Resolved[];
  readonly planId: string;
  /** ⚠️ Granted each month, and SET rather than added — see `PlanSpec.credits`. */
  readonly credits: number;
}

/**
 * ⚠️ THE MEMBERSHIP IS THE WORKSPACE'S, SO ITS ROW IS FILED UNDER NO APP. One
 * plan covers every product a workspace has switched on, because the seats, the
 * storage and the wallet are one roster, one bucket and one balance — a row per
 * product would be N answers to one question, and the strictest-standing rule
 * already closes the whole workspace over any one of them.
 *
 * ⚠️ THE COLUMN STAYS. A workspace can hold a product it stopped using, the
 * enablement row is where that lives, and dropping a column from a billing table
 * later is not free.
 */
export const MEMBERSHIP = "" as AppId;

/**
 * What a workspace has, for one product, right now.
 *
 * ⚠️ ONE CALL, ONE WALK, EVERY READER. The gate uses it, the screens use it, the
 * shelf uses it. The order inside `walk` is plan → grandfathered → adjusted →
 * clamped, and the clamp is last so a workspace we have stopped serving cannot
 * be adjusted back into service by a well-meaning operator edit.
 */
export async function heldBy(
  db: Db,
  tenantId: TenantId,
  of: {
    readonly plans: readonly PlanSpec[];
    readonly keys: Readonly<Record<string, EntitlementDef>>;
  },
  now: Instant,
  charging: boolean,
): Promise<Held> {
  const sub = await subscriptionFor(db, tenantId, MEMBERSHIP);
  const parking = of.plans.find((p) => p.parking) ?? null;
  const plan = of.plans.find((p) => p.id === sub?.planId) ?? parking;
  const standing = standingFor(sub, now, { charging });

  return {
    standing,
    planId: plan?.id ?? "",
    /* ⚠️ WHAT THE MONTH GRANTS, BESIDE WHAT THE PLAN ALLOWS. Every reader that
       asks what a workspace HAS also has to say what it may spend, and two
       lookups is two answers. */
    credits: plan?.credits ?? 0,
    entitlements: walk(plan, of.keys, sub?.overrides ?? {}, sub?.adjustments ?? {}, standing),
  };
}

/**
 * ⚠️ GRANDFATHERING RATCHETS UP; AN OPERATOR'S ADJUSTMENT DOES NOT. They shared
 * one blob in an earlier platform and "give this workspace ten seats" became a
 * one-way door — the only way back discarded the grandfathering with it. Two
 * columns, because they want opposite rules.
 */
/* DEFER(engine-45) stage:45 — nothing EDITS a plan. Grandfathering is what holds
   an existing workspace at what it was sold when a plan is narrowed, and the
   plans are declarations in a manifest today — so there is no edit for it to
   catch, and the day there is, forgetting this silently downgrades everybody. */
export async function grandfather(
  db: Db, tenantId: TenantId, appId: AppId, was: Readonly<Record<string, Allowance>>,
): Promise<void> {
  const sub = await subscriptionFor(db, tenantId, appId);
  if (!sub) return;
  const merged = { ...was, ...sub.overrides };
  await db.prepare(`UPDATE subscription SET overrides_json = ? WHERE tenant_id = ? AND app_id = ?`)
    .bind(JSON.stringify(merged), tenantId, appId).run();
}

export async function adjust(
  db: Db, tenantId: TenantId, appId: AppId, key: string, value: Allowance | null,
  now = new Date(),
): Promise<void> {
  /*
    ⚠️ A WORKSPACE THAT NEVER CHOSE A PLAN HAS NO ROW, AND AN ADJUSTMENT MUST
    STILL LAND. Returning early answered the console 200 and changed nothing —
    a silent no-op on the one write the operator has. The row is materialised
    on the parking plan as `incomplete`, which `standingFor` reads exactly as
    "no row at all": mid-signup, not a debtor, nothing gated.
  */
  const existing = await subscriptionFor(db, tenantId, appId);
  if (!existing) {
    await db.prepare(
      `INSERT INTO subscription (tenant_id, app_id, plan_id, status, at, past_due_at, trial_ends_at, overrides_json, adjustments_json)
       VALUES (?, ?, '', 'incomplete', ?, NULL, NULL, '{}', '{}')
       ON CONFLICT(tenant_id, app_id) DO NOTHING`)
      .bind(tenantId, appId, now.toISOString()).run();
  }
  const sub = existing ?? await subscriptionFor(db, tenantId, appId);
  if (!sub) return;
  const next = { ...sub.adjustments };
  /* ⚠️ `null` clears one key rather than resetting everything — which is the
     whole reason this is not the same column as the grandfathering. */
  if (value === null) delete next[key]; else next[key] = value;
  await db.prepare(`UPDATE subscription SET adjustments_json = ? WHERE tenant_id = ? AND app_id = ?`)
    .bind(JSON.stringify(next), tenantId, appId).run();
}

/* --------------------------------------------------------------- the bill --- */

export interface Line {
  readonly appId: AppId;
  readonly planId: string;
  readonly price: number;
  readonly currency: string;
}

/**
 * ⚠️ ONE INVOICE, ONE MEMBERSHIP LINE — the thing the whole inversion is for. A
 * business with three of our products pays once and reads one document, rather
 * than receiving three emails on three days from what looks like three
 * companies. What varies per period is metered and arrives as its own lines.
 *
 * ⚠️ AND A PARKING PLAN IS NOT A LINE. Charging nothing is not a line item; it
 * is the absence of one, and printing "Free — €0.00" on an invoice is noise on
 * the one document people actually read.
 */
export async function billFor(
  db: Db,
  tenantId: TenantId,
  plans: readonly PlanSpec[],
  /** ⚠️ What the meters drew this period, already priced — see `metered.ts`. */
  metered: readonly Line[] = [],
): Promise<{ readonly lines: readonly Line[]; readonly total: number; readonly currency: string }> {
  const lines: Line[] = [];
  const sub = await subscriptionFor(db, tenantId, MEMBERSHIP);
  const plan = sub ? plans.find((p) => p.id === sub.planId) : undefined;
  if (plan && plan.price > 0) {
    lines.push({ appId: MEMBERSHIP, planId: plan.id, price: plan.price, currency: plan.currency });
  }
  lines.push(...metered);
  const currency = lines[0]?.currency ?? "USD";
  /*
    ⚠️ A MIXED-CURRENCY BILL IS NOT SUMMED, IT IS REFUSED — by leaving the
    offending lines out of the total rather than adding euros to dirhams and
    printing a number that means nothing. A workspace whose products are priced
    in different currencies is a catalogue mistake, and it should look like one.
  */
  const total = lines.filter((l) => l.currency === currency).reduce((n, l) => n + l.price, 0);
  return { lines, total, currency };
}

export const mixedCurrencies = (lines: readonly Line[]): boolean =>
  new Set(lines.map((l) => l.currency)).size > 1;
