/**
 * THE ACCOUNT'S OWN BILLING — one store, every product, read from every worker.
 *
 * ⚠️ IT IS IN THE GLOBAL DIRECTORY, AND THAT IS FORCED RATHER THAN CHOSEN. The
 * hub is served by one worker and the question it answers spans every product:
 * what am I on, what do I owe, how many credits have I left. A regional table
 * could only answer for the workspaces in its own region, and a hub that showed
 * three of somebody's four workspaces would be worse than no hub. It is also what
 * lets ONE webhook settle everything — whichever worker a payment notification
 * arrives at writes the same rows.
 *
 * ⚠️ THE ACCOUNT IS THE PAYER AND THE WORKSPACE IS WHAT WAS BOUGHT. A workspace
 * cannot be the payer because it does not exist when somebody decides to buy —
 * the purchase is what lets them make one. Everything strange-looking here
 * follows from that: a subscription with a null tenant is the ordinary state
 * between paying and creating, and the credit balance has no tenant column at
 * all.
 *
 * ⚠️ AND CREDITS ARE ONE BALANCE ACROSS EVERY PRODUCT. Somebody who buys credits
 * buys them once; a balance per workspace means running out in one while another
 * is full, and topping up the wrong one to fix it.
 */

import type { Instant, SchemaModule, SqlHandle, Overrides, Cohort } from "@one/kernel";
import {
  allocateCredits, creditBalance, grantRef, periodOf, claimable,
  type CreditBalance, type CreditShare, type PaymentStatus, type Subscription,
} from "@one/kernel";

/* --------------------------------------------------------------- storage --- */

export const ACCOUNT_BILLING_SCHEMA: SchemaModule = {
  /** ⚠️ Global: the payer is an account. A regional table could answer for three of somebody's four workspaces. */
  global: "money",
  id: "account_billing",
  after: ["identity"],
  ddl: [
    /*
      ⚠️ NOT KEYED ON THE ACCOUNT, AND NOT ON THE WORKSPACE EITHER. One account
      holds several — one per product, and a second in the same product for a
      second workspace. Keyed on either it would be one row overwriting another,
      and the overwrite is somebody's second studio silently taking over the
      first's plan.
    */
    `CREATE TABLE IF NOT EXISTS account_subscription (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, product_id TEXT NOT NULL, tenant_id TEXT, plan_id TEXT, pending_plan_id TEXT, status TEXT NOT NULL, provider_ref TEXT, trial_ends_at TEXT, past_due_at TEXT, closing_at TEXT, grandfathered_json TEXT NOT NULL DEFAULT '{}', adjusted_json TEXT NOT NULL DEFAULT '{}', started_at TEXT NOT NULL, updated_at TEXT NOT NULL);`,
    `CREATE INDEX IF NOT EXISTS idx_sub_account ON account_subscription(account_id);`,
    /*
      ⚠️ ONE WORKSPACE, ONE SUBSCRIPTION, ENFORCED BY THE INDEX RATHER THAN BY A
      CHECK IN A HANDLER. Two subscriptions pointing at one workspace is two
      plans' ceilings both true, and whichever the resolver reads first wins —
      which is a workspace whose limits change depending on row order.
    */
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_tenant ON account_subscription(tenant_id) WHERE tenant_id IS NOT NULL;`,
    /*
      ⚠️ THE LEDGER IS APPEND-ONLY AND THE BALANCE IS A SUM. There is no write
      that can be lost, no pair that can race to a wrong total, and no state a
      crash leaves halfway.

      ⚠️ `expires_at` IS ON THE CHARGE AS WELL AS THE GRANT. A charge drawn from
      a cohort carries that cohort's date, so the two leave the sum together —
      written unexpiring, the ledger goes NEGATIVE by whatever was spent the
      moment the grant lapses.
    */
    `CREATE TABLE IF NOT EXISTS account_credit (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL, expires_at TEXT, reason TEXT NOT NULL, ref TEXT, product_id TEXT, at TEXT NOT NULL);`,
    `CREATE INDEX IF NOT EXISTS idx_credit_account ON account_credit(account_id, kind, expires_at);`,
    /*
      ⚠️ THE UNIQUE REFERENCE IS THE IDEMPOTENCY, and it is what makes a monthly
      allowance arrive once. A provider redelivers, a sweep re-runs, an operator
      presses twice — every one of those grants a second month inside one month
      without it. Partial, so entries with no reference are unbounded.
    */
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ref ON account_credit(account_id, ref) WHERE ref IS NOT NULL;`,
  ],
};

/* ---------------------------------------------------------- subscriptions --- */

interface SubRow {
  id: string; account_id: string; product_id: string; tenant_id: string | null;
  plan_id: string | null; pending_plan_id: string | null; status: string; trial_ends_at: string | null;
  past_due_at: string | null; closing_at: string | null;
  grandfathered_json: string; adjusted_json: string;
}

const parseOverrides = (grandfathered: string, adjusted: string): Overrides => {
  /* ⚠️ Unreadable JSON is NO overrides, never a throw. A corrupt blob must not
     take every request for that workspace down with it — and the failure it
     causes instead is visible: somebody is on the plan's own numbers. */
  const read = (raw: string) => {
    try { const v: unknown = JSON.parse(raw); return v && typeof v === "object" ? v as Record<string, never> : {}; }
    catch { return {}; }
  };
  return { grandfathered: read(grandfathered), adjusted: read(adjusted) };
};

const toSub = (r: SubRow): Subscription => ({
  id: r.id,
  accountId: r.account_id,
  productId: r.product_id,
  tenantId: r.tenant_id,
  planId: r.plan_id,
  pendingPlanId: r.pending_plan_id,
  status: r.status as PaymentStatus,
  trialEndsAt: r.trial_ends_at as Instant | null,
  pastDueAt: r.past_due_at as Instant | null,
  closingAt: r.closing_at as Instant | null,
  overrides: parseOverrides(r.grandfathered_json, r.adjusted_json),
});

const COLUMNS = `id, account_id, product_id, tenant_id, plan_id, pending_plan_id, status, trial_ends_at, past_due_at, closing_at, grandfathered_json, adjusted_json`;

/** Everything one account holds, across every product. The hub's whole answer. */
export async function subscriptionsOf(global: SqlHandle, accountId: string): Promise<readonly Subscription[]> {
  const rows = await global.all<SubRow>(
    `SELECT ${COLUMNS} FROM account_subscription WHERE account_id = ? ORDER BY started_at LIMIT 200`, accountId,
  );
  return rows.map(toSub);
}

/**
 * What a workspace is on.
 *
 * ⚠️ NULL IS A REAL ANSWER AND IT IS NOT AN ERROR. A workspace made before this
 * rail existed, or by an operator, has no subscription — and the caller's job is
 * to serve it under the parking values rather than to fail. Throwing here would
 * make the platform's own history a 500.
 */
export async function subscriptionForTenant(global: SqlHandle, tenantId: string): Promise<Subscription | null> {
  const row = await global.first<SubRow>(`SELECT ${COLUMNS} FROM account_subscription WHERE tenant_id = ?`, tenantId);
  return row ? toSub(row) : null;
}

export async function subscriptionById(global: SqlHandle, id: string): Promise<Subscription | null> {
  const row = await global.first<SubRow>(`SELECT ${COLUMNS} FROM account_subscription WHERE id = ?`, id);
  return row ? toSub(row) : null;
}

export interface Started {
  readonly id: string;
  readonly status: PaymentStatus;
  readonly trialEndsAt: Instant | null;
}

/**
 * Begin one — on a trial, or awaiting a payment.
 *
 * ⚠️ IT IS NOT `active` UNTIL A PROVIDER SAYS SO. A trial is a state this
 * platform may grant itself because it costs nothing; being paid up is a claim
 * about money, and the only thing entitled to make it is the thing that took it.
 */
export async function startSubscription(
  global: SqlHandle,
  input: {
    readonly accountId: string; readonly productId: string; readonly planId: string;
    readonly trialEndsAt: Instant | null; readonly providerRef: string | null;
  },
  at: Instant,
): Promise<Started> {
  const id = `sub_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const status: PaymentStatus = input.trialEndsAt ? "trialing" : "none";
  await global.run(
    `INSERT INTO account_subscription (id, account_id, product_id, tenant_id, plan_id, status, provider_ref, trial_ends_at, started_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
    id, input.accountId, input.productId, input.planId, status, input.providerRef, input.trialEndsAt, at, at,
  );
  return { id, status, trialEndsAt: input.trialEndsAt };
}

/**
 * Point a subscription at the workspace it paid for.
 *
 * ⚠️ THE CONDITIONAL WRITE IS THE LOCK, AND IT IS NOT DEFENSIVENESS. Two setup
 * doors open in two tabs both read a claimable subscription, both create a
 * workspace, and both attach — one subscription paying for two, which the unique
 * index then refuses at a moment nobody is watching. Written as a guarded UPDATE
 * the second one simply finds nothing to claim and is told to buy again.
 */
export async function claimSubscription(
  global: SqlHandle, subscriptionId: string, tenantId: string, at: Instant,
): Promise<boolean> {
  await global.run(
    `UPDATE account_subscription SET tenant_id = ?, updated_at = ? WHERE id = ? AND tenant_id IS NULL`,
    tenantId, at, subscriptionId,
  );
  const row = await global.first<{ tenant_id: string | null }>(
    `SELECT tenant_id FROM account_subscription WHERE id = ?`, subscriptionId,
  );
  return row?.tenant_id === tenantId;
}

/** The one this account may attach a new workspace in this product to. */
export async function claimableFor(
  global: SqlHandle, accountId: string, productId: string, now: Instant,
): Promise<Subscription | null> {
  const all = await subscriptionsOf(global, accountId);
  return all.find((s) => claimable(s, productId, now)) ?? null;
}

/**
 * What a payment provider said, applied.
 *
 * ⚠️ `paid` CLEARS THE TRIAL'S ARREARS AS WELL AS THE CHARGE'S. A trial that ran
 * out and was then paid for is not still in arrears, and leaving `trial_ends_at`
 * in the past keeps the ladder reading it as unpaid forever — a workspace that
 * paid and stayed blocked.
 */
export async function applyToSubscription(
  global: SqlHandle,
  subscriptionId: string,
  kind: "paid" | "failed" | "cancelled" | "refunded" | "other",
  planId: string | null,
  at: Instant,
): Promise<void> {
  switch (kind) {
    case "paid":
      await global.run(
        `UPDATE account_subscription SET plan_id = COALESCE(?, plan_id), status = 'active', past_due_at = NULL, trial_ends_at = NULL, updated_at = ? WHERE id = ?`,
        planId, at, subscriptionId,
      );
      return;
    case "failed":
      await global.run(
        `UPDATE account_subscription SET status = 'past_due', past_due_at = COALESCE(past_due_at, ?), updated_at = ? WHERE id = ?`,
        at, at, subscriptionId,
      );
      return;
    case "cancelled":
      await global.run(`UPDATE account_subscription SET status = 'cancelled', updated_at = ? WHERE id = ?`, at, subscriptionId);
      return;
    case "refunded":
    case "other":
      return;
  }
}

/**
 * Record which plan this workspace means to be on.
 *
 * ⚠️ IT WRITES `pending_plan_id` AND NEVER `plan_id`, because choosing is not
 * paying — and it CREATES the row where there is none, which is the ordinary
 * state on a deployment with no payment provider. Without that, a self-host's
 * signup wizard has a plan step that saves into nothing and reports success.
 */
export async function choosePlanFor(
  global: SqlHandle,
  input: { readonly tenantId: string; readonly accountId: string; readonly productId: string; readonly planId: string },
  at: Instant,
): Promise<void> {
  const existing = await subscriptionForTenant(global, input.tenantId);
  if (existing) {
    await global.run(`UPDATE account_subscription SET pending_plan_id = ?, updated_at = ? WHERE id = ?`, input.planId, at, existing.id);
    return;
  }
  await global.run(
    `INSERT INTO account_subscription (id, account_id, product_id, tenant_id, plan_id, pending_plan_id, status, started_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, 'none', ?, ?)`,
    `sub_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
    input.accountId, input.productId, input.tenantId, input.planId, at, at,
  );
}

/**
 * Schedule this workspace's own closure, or call it off.
 *
 * ⚠️ IT CREATES A ROW WHERE THERE IS NONE. A workspace made on a deployment that
 * could not charge has no subscription at all, and its owner must still be able
 * to leave — an upsert here is what makes closing possible in exactly the state
 * where nothing was ever bought.
 */
export async function markClosing(
  global: SqlHandle, tenantId: string, closingAt: Instant | null, at: Instant,
): Promise<void> {
  const existing = await subscriptionForTenant(global, tenantId);
  if (existing) {
    await global.run(`UPDATE account_subscription SET closing_at = ?, updated_at = ? WHERE id = ?`, closingAt, at, existing.id);
    return;
  }
  if (closingAt === null) return;
  await global.run(
    `INSERT INTO account_subscription (id, account_id, product_id, tenant_id, status, closing_at, started_at, updated_at)
     VALUES (?, '', '', ?, 'none', ?, ?, ?)`,
    `sub_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`, tenantId, closingAt, at, at,
  );
}

/**
 * Put a workspace on a plan with no payment behind it.
 *
 * ⚠️ IT CREATES A ROW WHERE THERE IS NONE, because the workspaces an operator
 * comps are exactly the ones that never bought anything — a demonstration
 * account, a workspace made before this rail existed, a customer being made
 * whole. An update that found nothing to update would report success and change
 * nothing, on the one path whose whole purpose is to override the rules.
 *
 * ⚠️ AND THE ACCOUNT MAY BE UNKNOWN, which is honest rather than a gap. A
 * workspace with no subscription has no recorded payer; the comp attaches to the
 * workspace, and a top-up for it is refused until somebody's account is on it.
 */
export async function compSubscription(
  global: SqlHandle,
  input: { readonly tenantId: string; readonly productId: string; readonly planId: string },
  at: Instant,
): Promise<void> {
  const existing = await subscriptionForTenant(global, input.tenantId);
  if (existing) {
    await global.run(
      `UPDATE account_subscription SET plan_id = ?, status = 'active', past_due_at = NULL, trial_ends_at = NULL, updated_at = ? WHERE id = ?`,
      input.planId, at, existing.id,
    );
    return;
  }
  await global.run(
    `INSERT INTO account_subscription (id, account_id, product_id, tenant_id, plan_id, status, started_at, updated_at)
     VALUES (?, '', ?, ?, ?, 'active', ?, ?)`,
    `sub_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
    input.productId, input.tenantId, input.planId, at, at,
  );
}

/** One workspace's operator-set ceilings — absolute, either direction, per key. */
export async function setAdjustments(
  global: SqlHandle, tenantId: string, adjusted: Readonly<Record<string, unknown>>, at: Instant,
): Promise<void> {
  const existing = await subscriptionForTenant(global, tenantId);
  if (existing) {
    await global.run(
      `UPDATE account_subscription SET adjusted_json = ?, updated_at = ? WHERE id = ?`,
      JSON.stringify(adjusted), at, existing.id,
    );
    return;
  }
  await global.run(
    `INSERT INTO account_subscription (id, account_id, product_id, tenant_id, status, adjusted_json, started_at, updated_at)
     VALUES (?, '', '', ?, 'none', ?, ?, ?)`,
    `sub_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`, tenantId, JSON.stringify(adjusted), at, at,
  );
}

/** Find the subscription a provider's own reference belongs to. */
export async function subscriptionByProviderRef(global: SqlHandle, ref: string): Promise<Subscription | null> {
  const row = await global.first<SubRow>(`SELECT ${COLUMNS} FROM account_subscription WHERE provider_ref = ?`, ref);
  return row ? toSub(row) : null;
}

export async function rememberProviderRef(global: SqlHandle, subscriptionId: string, ref: string, at: Instant): Promise<void> {
  await global.run(
    `UPDATE account_subscription SET provider_ref = COALESCE(provider_ref, ?), updated_at = ? WHERE id = ?`,
    ref, at, subscriptionId,
  );
}

/* --------------------------------------------------------------- credits --- */

/**
 * ⚠️ COHORTS, NOT A TOTAL. Granted credits expire in batches and a spend must
 * come out of the batch that lapses soonest, so what is read is the shape the
 * allocation needs rather than a number it cannot allocate against.
 */
async function cohortsOf(global: SqlHandle, accountId: string): Promise<{ cohorts: readonly Cohort[]; purchased: number }> {
  const rows = await global.all<{ expires_at: string | null; left: number }>(
    `SELECT expires_at, SUM(amount) AS left FROM account_credit
     WHERE account_id = ? AND kind = 'granted' GROUP BY expires_at`, accountId,
  );
  const bought = await global.first<{ total: number | null }>(
    `SELECT SUM(amount) AS total FROM account_credit WHERE account_id = ? AND kind = 'purchased'`, accountId,
  );
  return {
    cohorts: rows.map((r) => ({ expiresAt: r.expires_at as Instant | null, left: r.left })),
    purchased: bought?.total ?? 0,
  };
}

export async function balanceFor(global: SqlHandle, accountId: string, now: Instant): Promise<CreditBalance> {
  const { cohorts, purchased } = await cohortsOf(global, accountId);
  return creditBalance(cohorts, purchased, now);
}

export interface Granted { readonly applied: boolean; readonly balance: number }

/**
 * Add credits.
 *
 * ⚠️ `applied: false` IS A SUCCESS, AND TELLING IT APART MATTERS. A redelivered
 * payment that was already granted is not an error — answering one makes a
 * provider retry forever — but a caller that reports "credits added" on the
 * strength of a 200 has to know whether any arrived.
 */
export async function grantCredits(
  global: SqlHandle,
  accountId: string,
  entry: {
    readonly kind: "granted" | "purchased"; readonly amount: number; readonly reason: string;
    readonly ref?: string; readonly expiresAt?: Instant | null; readonly productId?: string;
  },
  at: Instant,
): Promise<Granted> {
  const before = await global.first<{ n: number }>(`SELECT COUNT(*) AS n FROM account_credit WHERE account_id = ?`, accountId);
  await global.run(
    `INSERT OR IGNORE INTO account_credit (id, account_id, kind, amount, expires_at, reason, ref, product_id, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    crypto.randomUUID(), accountId, entry.kind, entry.amount,
    entry.kind === "granted" ? (entry.expiresAt ?? null) : null,
    entry.reason, entry.ref ?? null, entry.productId ?? null, at,
  );
  const after = await global.first<{ n: number }>(`SELECT COUNT(*) AS n FROM account_credit WHERE account_id = ?`, accountId);
  return { applied: (after?.n ?? 0) > (before?.n ?? 0), balance: (await balanceFor(global, accountId, at)).total };
}

/**
 * A period's allowance, granted once.
 *
 * ⚠️ THE EXPIRY IS THE END OF THE PERIOD AFTER THIS ONE, NOT OF THIS ONE.
 * Credits granted on the 28th that lapse on the 1st are three days of allowance
 * sold as a month, and the person who notices is the one who buys on the 28th.
 */
export async function grantAllowance(
  global: SqlHandle,
  input: { readonly accountId: string; readonly subscriptionId: string; readonly productId: string; readonly credits: number },
  at: Instant,
): Promise<Granted> {
  const period = periodOf(at);
  const [year, month] = period.split("-").map(Number) as [number, number];
  const expiresAt = new Date(Date.UTC(year, month, 1)).toISOString() as Instant;
  return grantCredits(global, input.accountId, {
    kind: "granted", amount: input.credits, reason: `allowance:${input.productId}`,
    ref: grantRef(input.subscriptionId, period), expiresAt, productId: input.productId,
  }, at);
}

export type CreditSpend =
  /**
   * ⚠️ `spent` IS WHAT CAME OUT OF WHICH COHORT, AND THE CALLER NEEDS IT. A
   * reserve is settled downwards far more often than not, and a refund that does
   * not know where the credits came from puts them back as `purchased` — turning
   * an expiring allowance into permanent credits on every generation.
   */
  | { readonly ok: true; readonly balance: number; readonly spent: readonly CreditShare[] }
  | { readonly ok: false; readonly short: number; readonly balance: number };

/**
 * Take credits, or refuse.
 *
 * ⚠️ THE CHECK IS PART OF THE WRITE. Reading a balance and then charging leaves
 * a window in which two requests both see enough and both proceed — and for
 * metered work the overspend is not a wrong number, it is a second call to a
 * provider the platform pays for. The guarded INSERT closes it however close
 * together the statements are written.
 *
 * ⚠️ THE GUARD IS ON THE TOTAL AND THE ALLOCATION IS COMPUTED BESIDE IT, which
 * is a deliberate and stated trade. Two spends at the same instant cannot
 * overspend — that is the invariant worth protecting, because it costs real
 * money — but they can disagree about which cohort paid, and the loser is
 * charged to `purchased` when a granted cohort had room. That is a reporting
 * inaccuracy of one call, self-correcting on the next; guarding each cohort
 * separately would mean a spend that is refused halfway through with some
 * entries already written, which is strictly worse.
 */
export async function spendCredits(
  global: SqlHandle,
  accountId: string,
  input: { readonly amount: number; readonly reason: string; readonly ref?: string; readonly productId?: string },
  at: Instant,
): Promise<CreditSpend> {
  if (input.amount <= 0) return { ok: true, balance: (await balanceFor(global, accountId, at)).total, spent: [] };

  const { cohorts, purchased } = await cohortsOf(global, accountId);
  const live = cohorts.filter((c) => c.expiresAt !== null && c.expiresAt > at);
  const plan = allocateCredits(live, purchased, input.amount);
  if (plan.short > 0) {
    return { ok: false, short: plan.short, balance: creditBalance(cohorts, purchased, at).total };
  }

  /*
    ⚠️ ONE GUARDED STATEMENT DECIDES, AND THE REST FOLLOW IT. The first share is
    written conditionally on the whole spend being covered; if it does not land,
    nothing else is written and the spend is refused. Writing every share
    conditionally would let a spend land partly.
  */
  const [first, ...rest] = plan.shares;
  if (!first) return { ok: true, balance: creditBalance(cohorts, purchased, at).total, spent: [] };

  const id = crypto.randomUUID();
  await global.run(
    `INSERT INTO account_credit (id, account_id, kind, amount, expires_at, reason, ref, product_id, at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE (SELECT COALESCE(SUM(amount), 0) FROM account_credit
            WHERE account_id = ? AND (kind = 'purchased' OR expires_at > ?)) >= ?`,
    id, accountId, first.kind, -first.amount, first.expiresAt, input.reason, input.ref ?? null, input.productId ?? null, at,
    accountId, at, input.amount,
  );
  const landed = await global.first<{ id: string }>(`SELECT id FROM account_credit WHERE id = ?`, id);
  if (!landed) return { ok: false, short: input.amount, balance: (await balanceFor(global, accountId, at)).total };

  for (const share of rest) {
    await global.run(
      `INSERT INTO account_credit (id, account_id, kind, amount, expires_at, reason, ref, product_id, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(), accountId, share.kind, -share.amount, share.expiresAt, input.reason, null, input.productId ?? null, at,
    );
  }
  return { ok: true, balance: (await balanceFor(global, accountId, at)).total, spent: plan.shares };
}

/**
 * Put back what a reserve did not use.
 *
 * ⚠️ IT GOES BACK TO THE COHORT IT CAME FROM, which is why the caller hands back
 * the shares it was charged. Refunded as `purchased`, an over-estimated reserve
 * on a granted spend quietly converts an expiring allowance into permanent
 * credits — every generation minting a little money.
 */
export async function refundCredits(
  global: SqlHandle,
  accountId: string,
  shares: readonly { readonly kind: "granted" | "purchased"; readonly expiresAt: Instant | null; readonly amount: number }[],
  reason: string,
  at: Instant,
): Promise<void> {
  for (const share of shares) {
    if (share.amount <= 0) continue;
    await global.run(
      `INSERT INTO account_credit (id, account_id, kind, amount, expires_at, reason, ref, product_id, at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
      crypto.randomUUID(), accountId, share.kind, share.amount, share.expiresAt, reason, at,
    );
  }
}

/** What the hub shows: every entry, newest first, with what it was for. */
export async function creditHistory(
  global: SqlHandle, accountId: string, limit: number,
): Promise<readonly { readonly kind: string; readonly amount: number; readonly reason: string; readonly productId: string | null; readonly at: string }[]> {
  const rows = await global.all<{ kind: string; amount: number; reason: string; product_id: string | null; at: string }>(
    `SELECT kind, amount, reason, product_id, at FROM account_credit WHERE account_id = ? ORDER BY at DESC LIMIT ?`,
    accountId, limit,
  );
  return rows.map((r) => ({ kind: r.kind, amount: r.amount, reason: r.reason, productId: r.product_id, at: r.at }));
}
