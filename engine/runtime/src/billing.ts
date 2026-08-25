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
import {
  allowanceFor, snapshotDowngrade, standingFor, walk, type SubStatus,
} from "@engine/kernel";
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
    /*
      ⚠️ AND `storage_milli` IS A DEBT IN THOUSANDTHS OF A CREDIT, which is not
      fussiness. Storage over the included amount is charged daily and the daily
      figure is usually a fraction of a credit — rounded down it is free for
      ever, rounded up it is thirty times the price. An accumulator is the only
      arithmetic that is neither.
    */
    `CREATE TABLE IF NOT EXISTS billing_account (tenant_id TEXT PRIMARY KEY, customer_ref TEXT, currency TEXT NOT NULL, granted INTEGER, bought INTEGER, held INTEGER NOT NULL, auto_pack TEXT, auto_below INTEGER, auto_at TEXT, auto_error TEXT, storage_milli INTEGER, granted_at TEXT, at TEXT NOT NULL);`,
    /*
      ⚠️ AND THE CUSTOMER REFERENCE IS INDEXED BECAUSE STRIPE READS BY IT. An
      event that carries no workspace of ours is attributed by asking which
      account holds this customer, and that read is on the money path — where a
      slow answer is a webhook Stripe times out and retries, and a retry is the
      same payment arriving twice. Every other column here is reached by the
      primary key; this one is reached from outside.
    */
    `CREATE INDEX IF NOT EXISTS ix_billing_customer ON billing_account (customer_ref);`,
    /* ⚠️ AND ONE PER PRODUCT THEY HAVE SWITCHED ON. */
    /* ⚠️ `comped_at` IS A PLAN NOBODY IS PAYING FOR, and it is a column rather
       than a derivation. "No customer record" would nearly answer it and would
       be wrong the first time a paying workspace's checkout half-completed —
       and what hangs off it is whether the monthly allowance is granted by
       Stripe or by our own clock. A guess is not good enough for that. */
    `CREATE TABLE IF NOT EXISTS subscription (tenant_id TEXT NOT NULL, app_id TEXT NOT NULL, plan_id TEXT NOT NULL, status TEXT NOT NULL, at TEXT NOT NULL, past_due_at TEXT, trial_ends_at TEXT, comped_at TEXT, overrides_json TEXT, adjustments_json TEXT, PRIMARY KEY (tenant_id, app_id));`,
    `CREATE INDEX IF NOT EXISTS ix_subscription_due ON subscription (status, past_due_at);`,
    `CREATE TABLE IF NOT EXISTS credit_ledger (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, app_id TEXT, at TEXT NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL, ref TEXT);`,
    `CREATE INDEX IF NOT EXISTS ix_credit_ledger_tenant ON credit_ledger (tenant_id, at);`,
  ],
  /*
    ⚠️ WHEN A GIVEN PLAN STOPS BEING GIVEN, AND IT IS ON THE SUBSCRIPTION RATHER
    THAN ON THE GIFT. A gift's own term decides whether it may still be SPENT; the
    workspace it was spent on has to know when its tier ends — and asking the
    ledger would mean asking which of a person's gifts comped this workspace,
    which nothing records and which a second workspace makes ambiguous.

    ⚠️ NULL IS OPEN-ENDED, WHICH IS EVERY COMP MADE BEFORE THIS COLUMN AND MOST
    OF THEM AFTER. Friends and family have no term; a year of cash and a
    fortnight of demo do.

    ⚠️ DECLARED RATHER THAN ALTERED — `columns` is reconciled against the live
    table and a raw `ALTER` is not; see `refuseSql`.
  */
  columns: { subscription: { comped_until: "TEXT" } },
};

/* --------------------------------------------------------------- the rows --- */

export interface SubRow {
  readonly tenantId: TenantId;
  readonly appId: AppId;
  readonly planId: string;
  readonly status: SubStatus;
  readonly pastDueAt: Instant | null;
  /** ⚠️ Set when an operator granted this plan. Cleared the moment money moves. */
  readonly compedAt: Instant | null;
  /** ⚠️ When the gift behind it ends. Null is open-ended — see the schema. */
  readonly compedUntil: Instant | null;
  readonly overrides: Readonly<Record<string, Allowance>>;
  readonly adjustments: Readonly<Record<string, Allowance>>;
}

const asSub = (r: Record<string, unknown>): SubRow => ({
  tenantId: r.tenant_id as TenantId,
  appId: r.app_id as AppId,
  planId: r.plan_id as string,
  status: r.status as SubStatus,
  pastDueAt: (r.past_due_at as Instant | null) ?? null,
  compedAt: (r.comped_at as Instant | null) ?? null,
  compedUntil: (r.comped_until as Instant | null) ?? null,
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
 * ⚠️ THE MEMBERSHIP OF A WHOLE PAGE OF WORKSPACES, IN ONE READ. `within` is a
 * statement selecting the ids — `newestTenants` — rather than a list of them,
 * because a bound parameter per workspace is a second ceiling to hit and this
 * screen has already hit one. A workspace that never subscribed is absent from
 * the map, which is what `null` meant one at a time.
 */
export async function subscriptionsIn(
  db: Db, appId: AppId, within: string,
): Promise<Map<TenantId, SubRow>> {
  const rows = await db.prepare(
    `SELECT * FROM subscription WHERE app_id = ? AND tenant_id IN (${within})`)
    .bind(appId).all<Record<string, unknown>>();
  return new Map(rows.results.map((r) => {
    const sub = asSub(r);
    return [sub.tenantId, sub] as const;
  }));
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
    `INSERT INTO subscription (tenant_id, app_id, plan_id, status, at, past_due_at, trial_ends_at, comped_at, overrides_json, adjustments_json)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, '{}', '{}')
     ON CONFLICT(tenant_id, app_id) DO UPDATE SET plan_id = excluded.plan_id, status = excluded.status,
       comped_at = NULL`)
    .bind(tenantId, appId, planId, status, now.toISOString()).run();
}

/**
 * A PLAN AN OPERATOR GRANTED, THAT NOBODY IS PAYING FOR.
 *
 * ⚠️ IT IS A SECOND WRITER OF `plan_id`, AND THE RULE IT LOOKS LIKE IT BREAKS IS
 * NOT THE RULE. "Only a signed event may stamp a plan" exists so a WORKSPACE
 * cannot grant itself one — every path a customer can reach opens a page Stripe
 * owns and waits. An operator stands outside every workspace (D18), reaches this
 * only through the console door, and leaves a dated row saying so.
 *
 * ⚠️ AND THE STAMP IS WHAT MAKES THE MONTHLY CLOCK POSSIBLE. A comped workspace
 * has no Stripe subscription, so no `invoice.paid` ever arrives — and the
 * allowance is granted from that event and nowhere else. Without this column the
 * comp would grant one month's credits and silently never grant another.
 *
 * ⚠️ A REAL PAYMENT CLEARS IT, in `subscribe` above. A workspace that starts
 * paying must stop being renewed by our own clock as well as Stripe's, or it
 * gets its allowance twice on two different days of the month.
 */
export async function compPlan(
  db: Db, tenantId: TenantId, appId: AppId, planId: string, now = new Date(),
  /**
   * ⚠️ WHEN IT ENDS, AND ABSENT IS FOR EVER. A comp made by hand has no term —
   * an operator putting somebody on a tier decides when to take them off it. A
   * comp made from a gift carries the gift's, so a year of cash is a year rather
   * than a tier somebody keeps because nothing was watching.
   */
  until: string | null = null,
): Promise<void> {
  const at = now.toISOString();
  await db.prepare(
    `INSERT INTO subscription (tenant_id, app_id, plan_id, status, at, past_due_at, trial_ends_at, comped_at, comped_until, overrides_json, adjustments_json)
     VALUES (?, ?, ?, 'active', ?, NULL, NULL, ?, ?, '{}', '{}')
     ON CONFLICT(tenant_id, app_id) DO UPDATE SET plan_id = excluded.plan_id,
       status = 'active', past_due_at = NULL, comped_at = excluded.comped_at,
       comped_until = excluded.comped_until`)
    .bind(tenantId, appId, planId, at, at, until).run();
}

/**
 * ⚠️ EVERY COMPED WORKSPACE, FOR THE CLOCK THAT RENEWS THEM. Asked of the
 * directory rather than by walking shards (D5) — this is the cross-workspace
 * question the whole split exists to make answerable in one statement.
 */
export async function compedSubscriptions(
  db: Db,
): Promise<readonly {
  readonly tenantId: TenantId; readonly planId: string; readonly until: string | null;
}[]> {
  const rows = await db.prepare(
    `SELECT tenant_id, plan_id, comped_until FROM subscription
     WHERE comped_at IS NOT NULL AND status = 'active'`)
    .all<{ tenant_id: string; plan_id: string; comped_until: string | null }>();
  return rows.results.map((r) => ({
    tenantId: r.tenant_id as TenantId, planId: r.plan_id,
    /* ⚠️ THE TERM TRAVELS WITH THE ROW, because the pass that renews these is
       also the one that has to END the ones whose term has passed — see
       `sweepAllowances`. Asked separately it would be a second query per comped
       workspace on a nightly walk over all of them. */
    until: r.comped_until ?? null,
  }));
}

/**
 * A GIVEN PLAN'S TERM HAS PASSED, SO THE WORKSPACE GOES BACK TO THE LOBBY.
 *
 * ⚠️ THE LOBBY AND NOT A LOCKED DOOR. Parking is where a workspace lands before
 * it ever paid and after a trial ends; it is the difference between "your year
 * is up, here is how to keep it" and a product that stops. The records stay, the
 * balance stays, and the tier is what lapses.
 *
 * ⚠️ AND IT CLEARS BOTH STAMPS. A row left `comped_at` with a parking plan would
 * read as a workspace somebody was given the free tier, which is a sentence with
 * nothing behind it — and `compedSubscriptions` would carry it for ever.
 */
export async function endComp(
  db: Db, tenantId: TenantId, appId: AppId, parkingId: string, now = new Date(),
): Promise<boolean> {
  const done = await db.prepare(
    `UPDATE subscription SET plan_id = ?, comped_at = NULL, comped_until = NULL, at = ?
     WHERE tenant_id = ? AND app_id = ? AND comped_at IS NOT NULL`)
    .bind(parkingId, now.toISOString(), tenantId, appId).run();
  return (done.meta?.changes ?? 0) > 0;
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
 * has no arrears — dating one would start the countdown to erasure over a
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
    credits: allowanceFor(plan, sub?.adjustments ?? {}, sub?.overrides ?? {}),
    entitlements: walk(plan, of.keys, sub?.overrides ?? {}, sub?.adjustments ?? {}, standing),
  };
}

/**
 * ⚠️ GRANDFATHERING RATCHETS UP; AN OPERATOR'S ADJUSTMENT DOES NOT. They shared
 * one blob in an earlier platform and "give this workspace ten seats" became a
 * one-way door — the only way back discarded the grandfathering with it. Two
 * columns, because they want opposite rules.
 */
export async function grandfather(
  db: Db, tenantId: TenantId, appId: AppId, was: Readonly<Record<string, Allowance>>,
): Promise<void> {
  const sub = await subscriptionFor(db, tenantId, appId);
  if (!sub) return;
  /* ⚠️ WHAT IS ALREADY HELD WINS, because grandfathering only ratchets up. A
     workspace narrowed twice keeps the FIRST, highest number it was sold — the
     second edit must not overwrite the promise the first one made. */
  const merged = { ...was, ...sub.overrides };
  await db.prepare(`UPDATE subscription SET overrides_json = ? WHERE tenant_id = ? AND app_id = ?`)
    .bind(JSON.stringify(merged), tenantId, appId).run();
}

/**
 * A PLAN IS EDITED, AND EVERYBODY ALREADY ON IT KEEPS WHAT THEY WERE SOLD.
 *
 * ⚠️ THIS IS THE ONE STEP AN EDITABLE CATALOGUE CANNOT SHIP WITHOUT. Narrowing a
 * tier changes what every existing customer has, without anybody telling them,
 * and the first they hear of it is a refusal on an ordinary Tuesday. There is no
 * error, no failing test and no screen that would show it — the numbers simply
 * become smaller.
 *
 * ⚠️ ONLY THE NARROWINGS ARE WRITTEN — see `snapshotDowngrade`. An edit that
 * RAISES a limit should reach existing customers; snapshotting that too would
 * freeze them below the tier they are on, for ever, as a reward for being early.
 *
 * ⚠️ AND IT RUNS BEFORE THE EDIT LANDS, ALWAYS. Afterwards the old numbers are
 * gone and there is nothing left to snapshot — which is a mistake with no
 * symptom, because the write still succeeds and the rows it should have written
 * simply do not exist.
 *
 * ⚠️ IT IS THE DIRECTORY'S QUESTION, ASKED ONCE (D5). "Which workspaces are on
 * this plan" answered by walking shards is the fan-out the whole split exists to
 * avoid, and this runs while somebody is waiting for a form to save.
 */
export async function holdEveryoneOn(
  db: Db, planId: string, was: PlanSpec, now: PlanSpec,
): Promise<number> {
  const kept = snapshotDowngrade(was, now);
  /* ⚠️ AN EDIT THAT TOOK NOTHING WRITES NOTHING. A raise, a rename or a price
     change leaves every existing customer exactly where they were, and stamping
     an empty snapshot on every subscription would make the next reader think a
     narrowing had happened. */
  if (!Object.keys(kept).length) return 0;

  const rows = await db.prepare(
    `SELECT tenant_id FROM subscription WHERE plan_id = ? AND app_id = ?`)
    .bind(planId, MEMBERSHIP).all<{ tenant_id: string }>();

  for (const row of rows.results) {
    await grandfather(db, row.tenant_id as TenantId, MEMBERSHIP, kept);
  }
  return rows.results.length;
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
