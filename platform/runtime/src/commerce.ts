/**
 * THE SUBSCRIPTION — what a workspace is on, what it was sold, and where on the
 * ladder it stands.
 *
 * The arithmetic is `@one/kernel`'s and pure. This is the storage, the ladder's
 * clock, and the one function every request calls to turn a row into a `Caller`.
 *
 * ⚠️ NOTHING HERE DECIDES THE LADDER'S SHAPE. A payment provider reports facts —
 * a charge failed, a subscription was cancelled — and the ladder decides what
 * that means over time. Keeping those apart is what lets the same rungs run on a
 * deployment with no provider at all, which is every self-host and every test.
 */

import {
  NO_OVERRIDES,
  type Allowance,
  type Instant,
  type Overrides,
  type SchemaModule,
  type SqlHandle,
  type FlagDef,
  type PackageSpec,
  type Runway,
  type StandingState,
  extendBudget,
  heldEntitlements,
  resolveCustomerFlags,
  runwayFor,
} from "@one/kernel";

/* --------------------------------------------------------------- storage --- */

export const COMMERCE_SCHEMA: SchemaModule = {
  id: "commerce",
  ddl: [
    /*
      ⚠️ ONE ROW PER WORKSPACE, AND IT MAY NOT EXIST. A workspace that has never
      chosen anything has no row, and that is a state rather than a gap to fill
      in with defaults on write — see `standingFor` for why materialising one
      eagerly is how a parking DEFAULT gets read as a verdict.
    */
    `CREATE TABLE IF NOT EXISTS subscription (tenant_id TEXT PRIMARY KEY, plan_id TEXT, pending_plan_id TEXT, status TEXT NOT NULL, provider_ref TEXT, trial_ends_at TEXT, past_due_at TEXT, closing_at TEXT, grandfathered_json TEXT NOT NULL DEFAULT '{}', adjusted_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL);`,
    /*
      ⚠️ THE GRANT LEDGER, APPEND-ONLY, AND IT IS WHAT ANSWERS "AGAIN?".
      A repeat purchase folds into the row that is already open, so the open
      row's own package id is only ever the package that OPENED it. Asking that
      row whether a package was bought before answers no forever for everything
      after the first, and a strictly-once package stacks without limit.
    */
    /*
      ⚠️ THE OFFER IS DATA, NOT MANIFEST. A plan is what the platform sells and
      is the same for every workspace, so it belongs in the manifest; a package
      is what ONE workspace sells its own customers, so it is a row they own and
      edit. Only the capability KEYS are the app's, and those come from
      `access.customerFlags`.
    */
    `CREATE TABLE IF NOT EXISTS customer_package (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, price_minor INTEGER NOT NULL, price_currency TEXT NOT NULL, flags_json TEXT NOT NULL DEFAULT '{}', budgets_json TEXT NOT NULL DEFAULT '{}', once_per_customer INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);`,
    `CREATE INDEX IF NOT EXISTS idx_package_tenant ON customer_package(tenant_id);`,
    /*
      ⚠️ THE SNAPSHOT IS COPIED WHOLE AT GRANT TIME AND THE OVERRIDES ARE A DIFF.
      One masks later edits to the offer on purpose — a customer keeps what they
      were sold — and the other is the sparse per-customer exception where `null`
      means "back to the package". Storing both as snapshots would make clearing
      an exception indistinguishable from withdrawing everything.
    */
    `CREATE TABLE IF NOT EXISTS subject_access (tenant_id TEXT NOT NULL, subject_id TEXT NOT NULL, package_id TEXT, flags_json TEXT NOT NULL DEFAULT '{}', overrides_json TEXT NOT NULL DEFAULT '{}', budgets_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL, PRIMARY KEY (tenant_id, subject_id));`,
    `CREATE TABLE IF NOT EXISTS package_grant (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, subject_id TEXT NOT NULL, package_id TEXT NOT NULL, ref TEXT, at TEXT NOT NULL);`,
    /*
      ⚠️ AN INTENT, NOT A PAYMENT. The workspace is paid on ITS OWN provider and
      this platform is never in the money path — so what is recorded here is that
      somebody said they wanted to buy something, and separately that somebody
      with authority said it was paid for. Storing a payment would be storing a
      claim we cannot check.
    */
    `CREATE TABLE IF NOT EXISTS customer_purchase (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, subject_id TEXT NOT NULL, package_id TEXT NOT NULL, amount_minor INTEGER NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL, ref TEXT, settled_by TEXT, opened_at TEXT NOT NULL, settled_at TEXT);`,
    `CREATE INDEX IF NOT EXISTS idx_purchase_open ON customer_purchase(tenant_id, status, opened_at);`,
    /*
      ⚠️ ONE ROW PER WORKSPACE, AND THE SECRET IN IT MAY ONLY VERIFY. A stored
      credential that could CHARGE would make this database a vault of live
      merchant keys, which is a worse liability than anything it would save.
      `safeConfig` is what keeps it to a signing secret.
    */
    `CREATE TABLE IF NOT EXISTS tenant_payments (tenant_id TEXT PRIMARY KEY, provider TEXT NOT NULL, checkout_url TEXT, verify_secret TEXT, updated_at TEXT NOT NULL);`,
    `CREATE INDEX IF NOT EXISTS idx_grant_subject ON package_grant(tenant_id, subject_id);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_grant_ref ON package_grant(tenant_id, ref) WHERE ref IS NOT NULL;`,
  ],
  scoped: { tenantColumn: "tenant_id", tenantTables: ["subscription", "customer_package", "subject_access", "package_grant"] },
};

/** What the provider last told us, as a fact rather than as a verdict. */
export type PaymentStatus = "none" | "trialing" | "active" | "past_due" | "cancelled";

export interface Subscription {
  readonly planId: string | null;
  /**
   * ⚠️ CHOOSING A PLAN NEVER GRANTS IT. Only a settled payment may write
   * `planId`, so the signup wizard records an intention here and a deployment
   * with no payment rail can still complete it without selling anything.
   */
  readonly pendingPlanId: string | null;
  readonly status: PaymentStatus;
  readonly trialEndsAt: Instant | null;
  readonly pastDueAt: Instant | null;
  readonly closingAt: Instant | null;
  readonly overrides: Overrides;
}

/**
 * ⚠️ THE SHAPE OF A WORKSPACE THAT HAS NEVER CHOSEN ANYTHING, and it is a VALUE
 * rather than a row. Materialising one on first read would put a parking default
 * into storage where the next reader takes it for a decision — which is exactly
 * how an ordinary write came to answer 402 on a deployment with no payment
 * provider at all.
 */
export const PARKED: Subscription = {
  planId: null, pendingPlanId: null, status: "none",
  trialEndsAt: null, pastDueAt: null, closingAt: null, overrides: NO_OVERRIDES,
};

interface Row {
  plan_id: string | null; pending_plan_id: string | null; status: string;
  trial_ends_at: string | null; past_due_at: string | null; closing_at: string | null;
  grandfathered_json: string; adjusted_json: string;
}

const parseOverrides = (text: string): Readonly<Record<string, Allowance>> => {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" ? (value as Record<string, Allowance>) : {};
  } catch {
    /* A malformed override blob must not take the workspace down with it. */
    return {};
  }
};

export async function readSubscription(db: SqlHandle, tenantId: string): Promise<Subscription> {
  const row = await db.first<Row>(
    `SELECT plan_id, pending_plan_id, status, trial_ends_at, past_due_at, closing_at, grandfathered_json, adjusted_json FROM subscription WHERE tenant_id = ?`,
    tenantId,
  );
  if (!row) return PARKED;
  return {
    planId: row.plan_id,
    pendingPlanId: row.pending_plan_id,
    status: row.status as PaymentStatus,
    trialEndsAt: row.trial_ends_at as Instant | null,
    pastDueAt: row.past_due_at as Instant | null,
    closingAt: row.closing_at as Instant | null,
    overrides: {
      grandfathered: parseOverrides(row.grandfathered_json),
      adjusted: parseOverrides(row.adjusted_json) as Readonly<Record<string, Allowance | null>>,
    },
  };
}

export async function choosePlan(db: SqlHandle, tenantId: string, planId: string, at: Instant): Promise<void> {
  await db.run(
    `INSERT INTO subscription (tenant_id, pending_plan_id, status, updated_at) VALUES (?, ?, 'none', ?)
     ON CONFLICT(tenant_id) DO UPDATE SET pending_plan_id = excluded.pending_plan_id, updated_at = excluded.updated_at`,
    tenantId, planId, at,
  );
}

/* ---------------------------------------------------------------- ladder --- */

/** How long each rung lasts, from the moment the charge first failed. */
export const LADDER = { graceDays: 7, readOnlyDays: 30, blockedDays: 37 } as const;

const DAY_MS = 86_400_000;
const daysSince = (from: Instant, now: Instant): number => (Date.parse(now) - Date.parse(from)) / DAY_MS;

/**
 * WHERE A WORKSPACE STANDS, from what the provider said and how long ago.
 *
 * ⚠️ THE PARKING STATE IS NOT A VERDICT, AND THIS IS WHERE THAT GOES WRONG.
 *
 * A workspace with no row and a workspace whose row says "never started paying"
 * are the same situation, and the honest answer for both is `active` — because
 * the alternative is a deployment with no payment provider at all holding every
 * workspace read-only over a bill nobody could have paid. A shipping product
 * returned the stored status verbatim here, which meant the moment anything
 * materialised the row, the parking DEFAULT was read as a decision and an
 * ordinary write started answering 402.
 *
 * The gate for "has not paid" belongs where payment is actually possible, and
 * `chargeable` is that question asked once by the caller rather than assumed
 * here. Fail closed on their non-payment; fail open on ours.
 */
export function standingFor(sub: Subscription, now: Instant, chargeable: boolean): StandingState {
  if (sub.closingAt) return { standing: "closing", reason: "closing", nextAt: sub.closingAt };

  if (sub.status === "past_due" && sub.pastDueAt) {
    const days = daysSince(sub.pastDueAt, now);
    const at = (d: number) => new Date(Date.parse(sub.pastDueAt!) + d * DAY_MS).toISOString() as Instant;
    if (days < LADDER.graceDays) return { standing: "grace", reason: "arrears", nextAt: at(LADDER.graceDays) };
    if (days < LADDER.readOnlyDays) return { standing: "read_only", reason: "arrears", nextAt: at(LADDER.readOnlyDays) };
    return { standing: "blocked", reason: "arrears", nextAt: at(LADDER.blockedDays) };
  }

  if (sub.status === "cancelled") return { standing: "read_only", reason: "suspended" };

  /*
    ⚠️ THE UNFINISHED SIGNUP IS ITS OWN REASON, not a share of `suspended`.
    Nothing was taken from them and there is no arrears to settle, so the copy
    cannot be the same sentence — and the wizard's own writes have to survive
    it or the state is inescapable.
  */
  if (!sub.planId && chargeable) return { standing: "read_only", reason: "setup" };

  return { standing: "active", reason: "ok" };
}

/* ----------------------------------------------------------- grant ledger --- */

/**
 * Record that a package was actually applied.
 *
 * ⚠️ EVERY PATH THAT APPLIES A PACKAGE MUST CALL THIS — the staff grant that
 * opens a row AND the one that extends it, both provider lanes, and the manual
 * confirmation. It is the only record of what was applied, so a path that skips
 * it makes a once-only package repeatable through exactly that path.
 */
export async function recordGrant(
  db: SqlHandle,
  tenantId: string,
  subjectId: string,
  packageId: string,
  at: Instant,
  ref?: string,
): Promise<void> {
  await db.run(
    `INSERT OR IGNORE INTO package_grant (id, tenant_id, subject_id, package_id, ref, at) VALUES (?, ?, ?, ?, ?, ?)`,
    crypto.randomUUID(), tenantId, subjectId, packageId, ref ?? null, at,
  );
}

export async function priorGrants(db: SqlHandle, tenantId: string, subjectId: string): Promise<readonly string[]> {
  const rows = await db.all<{ package_id: string }>(
    `SELECT package_id FROM package_grant WHERE tenant_id = ? AND subject_id = ?`,
    tenantId, subjectId,
  );
  return rows.map((r) => r.package_id);
}

/* -------------------------------------------------------- the other rail --- */

/** What one workspace sells its own customers. A row they own, not a manifest entry. */
export interface StoredPackage extends PackageSpec {
  readonly tenantId: string;
}

const json = (text: string): Record<string, never> => {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" ? (value as Record<string, never>) : {};
  } catch {
    return {};
  }
};

interface PackageRow {
  id: string; tenant_id: string; name: string; price_minor: number; price_currency: string;
  flags_json: string; budgets_json: string; once_per_customer: number;
}

const toPackage = (r: PackageRow): StoredPackage => ({
  id: r.id,
  tenantId: r.tenant_id,
  name: r.name,
  price: { minor: r.price_minor, currency: r.price_currency },
  flags: json(r.flags_json),
  budgets: json(r.budgets_json),
  oncePerCustomer: r.once_per_customer === 1,
});

export async function listPackages(db: SqlHandle, tenantId: string): Promise<readonly StoredPackage[]> {
  const rows = await db.all<PackageRow>(`SELECT * FROM customer_package WHERE tenant_id = ? ORDER BY name`, tenantId);
  return rows.map(toPackage);
}

export async function readPackage(db: SqlHandle, tenantId: string, id: string): Promise<StoredPackage | null> {
  const row = await db.first<PackageRow>(`SELECT * FROM customer_package WHERE tenant_id = ? AND id = ?`, tenantId, id);
  return row ? toPackage(row) : null;
}

export async function savePackage(db: SqlHandle, tenantId: string, pkg: Omit<StoredPackage, "tenantId">, at: Instant): Promise<void> {
  await db.run(
    `INSERT INTO customer_package (id, tenant_id, name, price_minor, price_currency, flags_json, budgets_json, once_per_customer, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, price_minor = excluded.price_minor, price_currency = excluded.price_currency,
       flags_json = excluded.flags_json, budgets_json = excluded.budgets_json, once_per_customer = excluded.once_per_customer, updated_at = excluded.updated_at`,
    pkg.id, tenantId, pkg.name, pkg.price.minor, pkg.price.currency,
    JSON.stringify(pkg.flags), JSON.stringify(pkg.budgets), pkg.oncePerCustomer ? 1 : 0, at,
  );
}

/** What one customer holds: the package that opened the row, the snapshot, the diff, the days. */
export interface SubjectAccess {
  readonly packageId: string | null;
  readonly snapshot: Readonly<Record<string, boolean>>;
  readonly overrides: Readonly<Record<string, boolean | null>>;
  readonly budgets: Readonly<Record<string, Instant>>;
}

export const NO_ACCESS: SubjectAccess = { packageId: null, snapshot: {}, overrides: {}, budgets: {} };

export async function readAccess(db: SqlHandle, tenantId: string, subjectId: string): Promise<SubjectAccess> {
  const row = await db.first<{ package_id: string | null; flags_json: string; overrides_json: string; budgets_json: string }>(
    `SELECT package_id, flags_json, overrides_json, budgets_json FROM subject_access WHERE tenant_id = ? AND subject_id = ?`,
    tenantId, subjectId,
  );
  if (!row) return NO_ACCESS;
  return {
    packageId: row.package_id,
    snapshot: json(row.flags_json),
    overrides: json(row.overrides_json),
    budgets: json(row.budgets_json),
  };
}

/**
 * Every customer's runway in one read.
 *
 * ⚠️ ONE QUERY FOR THE WHOLE ROSTER, NOT ONE PER PERSON. "Whose access is about
 * to run out" is a question asked of everybody at once, and a read that fans out
 * per customer gets slower exactly as a workspace succeeds. `readAccess` is the
 * per-person answer and is the wrong shape for this.
 *
 * Customers with no access at all are ABSENT rather than present with zero:
 * nothing of theirs is running out, because they hold nothing.
 */
export async function runwayAcross(
  db: SqlHandle, tenantId: string, at: Instant,
): Promise<ReadonlyMap<string, Runway>> {
  const rows = await db.all<{ subject_id: string; budgets_json: string }>(
    `SELECT subject_id, budgets_json FROM subject_access WHERE tenant_id = ?`, tenantId,
  );
  return new Map(rows.map((r) => [r.subject_id, runwayFor(json(r.budgets_json) as never, at)]));
}

/**
 * Apply a package to a customer.
 *
 * ⚠️ A REPEAT PURCHASE FOLDS INTO THE ROW THAT IS ALREADY OPEN, so the row's own
 * `package_id` is only ever the package that OPENED it — and that is why the
 * grant ledger is written here rather than inferred from the row later. Days
 * QUEUE onto whatever is already running; the capability snapshot is taken from
 * the package as it stands today.
 */
export async function applyPackage(
  db: SqlHandle,
  tenantId: string,
  subjectId: string,
  pkg: StoredPackage,
  at: Instant,
  ref?: string,
): Promise<{ readonly daysAdded: number; readonly budgets: Readonly<Record<string, Instant>> }> {
  const current = await readAccess(db, tenantId, subjectId);
  const budgets: Record<string, Instant> = { ...current.budgets };
  let daysAdded = 0;
  for (const [scope, days] of Object.entries(pkg.budgets)) {
    budgets[scope] = extendBudget(budgets[scope] ?? null, at, days);
    daysAdded += days;
  }
  await db.run(
    /*
      ⚠️ `package_id` IS ABSENT FROM THE UPDATE CLAUSE, AND THAT IS THE MECHANISM.
      The row keeps the package that OPENED it; a repeat purchase folds in and
      leaves the column alone. Which is why the column can never answer "has this
      customer bought X before" — the grant ledger written below is what does.
    */
    `INSERT INTO subject_access (tenant_id, subject_id, package_id, flags_json, overrides_json, budgets_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, subject_id) DO UPDATE SET flags_json = excluded.flags_json, budgets_json = excluded.budgets_json, updated_at = excluded.updated_at`,
    tenantId, subjectId, pkg.id,
    JSON.stringify({ ...current.snapshot, ...pkg.flags }),
    JSON.stringify(current.overrides), JSON.stringify(budgets), at,
  );
  await recordGrant(db, tenantId, subjectId, pkg.id, at, ref);
  return { daysAdded, budgets };
}

/**
 * The sparse per-customer exception a workspace sets by hand.
 *
 * ⚠️ A DIFF, AND `null` ON A KEY MEANS "BACK TO THE PACKAGE". That only works
 * because it is a diff: a replacement set would freeze somebody at whatever the
 * package said the day the exception was written, so editing the package would
 * reach everybody except the people somebody had taken the trouble to think
 * about.
 *
 * ⚠️ AND IT CANNOT WIDEN A LAPSED BUDGET OR THE WORKSPACE'S OWN PLAN. Both gates
 * run AFTER the merge — see `explainCustomerFlags` — so this is an exception
 * within what was sold, never a way around what was paid for.
 */
export async function setOverrides(
  db: SqlHandle,
  tenantId: string,
  subjectId: string,
  changes: Readonly<Record<string, boolean | null>>,
  at: Instant,
): Promise<void> {
  const current = await readAccess(db, tenantId, subjectId);
  const next: Record<string, boolean | null> = { ...current.overrides };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  await db.run(
    `INSERT INTO subject_access (tenant_id, subject_id, package_id, flags_json, overrides_json, budgets_json, updated_at)
     VALUES (?, ?, NULL, '{}', ?, '{}', ?)
     ON CONFLICT(tenant_id, subject_id) DO UPDATE SET overrides_json = excluded.overrides_json, updated_at = excluded.updated_at`,
    tenantId, subjectId, JSON.stringify(next), at,
  );
}

/**
 * Set what is left of one scope, in days, by hand.
 *
 * ⚠️ THE ONE WRITE IN THIS ECONOMY WITH NO PRICE BEHIND IT, which is exactly why
 * it is separate from a grant: a repair is not a purchase, it must not appear in
 * the grant ledger as one, and somebody has to be able to correct a mistake
 * without inventing a package to do it with.
 *
 * Zero ENDS the scope rather than removing it — "they have none left" and "they
 * never had this" are different facts, and a screen that cannot tell them apart
 * shows a lapsed customer as one who never bought.
 */
export async function setRemainingDays(
  db: SqlHandle,
  tenantId: string,
  subjectId: string,
  scope: string,
  days: number,
  at: Instant,
): Promise<Readonly<Record<string, Instant>>> {
  const current = await readAccess(db, tenantId, subjectId);
  const budgets: Record<string, Instant> = { ...current.budgets };
  budgets[scope] = new Date(Date.parse(at) + Math.max(0, days) * 86_400_000).toISOString() as Instant;
  await db.run(
    `INSERT INTO subject_access (tenant_id, subject_id, package_id, flags_json, overrides_json, budgets_json, updated_at)
     VALUES (?, ?, NULL, '{}', '{}', ?, ?)
     ON CONFLICT(tenant_id, subject_id) DO UPDATE SET budgets_json = excluded.budgets_json, updated_at = excluded.updated_at`,
    tenantId, subjectId, JSON.stringify(budgets), at,
  );
  return budgets;
}

/**
 * What a customer has actually been given, in order.
 *
 * ⚠️ THE LEDGER, NOT THE LIVE ROW. A repeat purchase folds into the row already
 * open, so the row remembers only the package that opened it — the ledger is the
 * only place "what have they bought from us" has an answer.
 */
export async function grantsFor(
  db: SqlHandle, tenantId: string, subjectId: string,
): Promise<readonly { readonly packageId: string; readonly at: Instant; readonly ref: string | null }[]> {
  const rows = await db.all<{ package_id: string; at: string; ref: string | null }>(
    `SELECT package_id, at, ref FROM package_grant WHERE tenant_id = ? AND subject_id = ? ORDER BY at DESC LIMIT 200`,
    tenantId, subjectId,
  );
  return rows.map((r) => ({ packageId: r.package_id, at: r.at as Instant, ref: r.ref }));
}

/* -------------------------------------------------------- being paid --- */

/**
 * HOW A WORKSPACE TAKES MONEY FROM ITS OWN CUSTOMERS.
 *
 * ⚠️ `manual` IS THE DEFAULT AND IS NOT A SECOND-CLASS LANE. It works in every
 * country on day one, needs no account anywhere, and every automated provider
 * degrades to it — which is the property that makes this abstraction survivable.
 * A design where the automated path is the real one and the manual path is a
 * fallback ends up with two settlement routes that disagree.
 */
export interface PaymentSetup {
  readonly provider: "manual" | "link";
  /** Where the customer is sent to pay. The workspace owns this page, not us. */
  readonly checkoutUrl: string | null;
  /** Whether a signing secret is stored. ⚠️ Never the secret itself. */
  readonly verifies: boolean;
}

/**
 * ⚠️ A STORED CREDENTIAL MAY VERIFY, NEVER ACT.
 *
 * A signing secret checks that a notification came from the workspace's own
 * provider. An API key would let this platform CHARGE somebody's customers,
 * which is a liability nothing here needs to take on — so a value that looks
 * like one is refused rather than stored.
 */
export function credentialProblem(secret: string): string | null {
  const looksLikeAKey = /^(sk_|rk_|pk_live|api[-_]?key|bearer\s)/i.test(secret.trim());
  return looksLikeAKey ? "that looks like an API key; only a signing secret belongs here" : null;
}

export async function readPayments(db: SqlHandle, tenantId: string): Promise<PaymentSetup> {
  const row = await db.first<{ provider: string; checkout_url: string | null; verify_secret: string | null }>(
    `SELECT provider, checkout_url, verify_secret FROM tenant_payments WHERE tenant_id = ?`, tenantId,
  );
  if (!row) return { provider: "manual", checkoutUrl: null, verifies: false };
  return {
    provider: row.provider === "link" ? "link" : "manual",
    checkoutUrl: row.checkout_url,
    verifies: Boolean(row.verify_secret),
  };
}

/** ⚠️ Read only where it is used — never returned to a caller. */
export async function verifySecretOf(db: SqlHandle, tenantId: string): Promise<string | null> {
  const row = await db.first<{ verify_secret: string | null }>(
    `SELECT verify_secret FROM tenant_payments WHERE tenant_id = ?`, tenantId,
  );
  return row?.verify_secret ?? null;
}

export async function savePayments(
  db: SqlHandle,
  tenantId: string,
  setup: { readonly provider: "manual" | "link"; readonly checkoutUrl: string | null; readonly verifySecret: string | null },
  at: Instant,
): Promise<void> {
  await db.run(
    `INSERT INTO tenant_payments (tenant_id, provider, checkout_url, verify_secret, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id) DO UPDATE SET provider = excluded.provider, checkout_url = excluded.checkout_url,
       verify_secret = COALESCE(excluded.verify_secret, tenant_payments.verify_secret), updated_at = excluded.updated_at`,
    tenantId, setup.provider, setup.checkoutUrl, setup.verifySecret, at,
  );
}

/* --------------------------------------------------------- purchases --- */

export interface Purchase {
  readonly id: string;
  readonly subjectId: string;
  readonly packageId: string;
  readonly amount: { readonly minor: number; readonly currency: string };
  readonly status: "open" | "settled" | "cancelled";
  readonly ref: string | null;
  readonly openedAt: Instant;
  readonly settledAt: Instant | null;
}

const toPurchase = (r: {
  id: string; subject_id: string; package_id: string; amount_minor: number; currency: string;
  status: string; ref: string | null; opened_at: string; settled_at: string | null;
}): Purchase => ({
  id: r.id, subjectId: r.subject_id, packageId: r.package_id,
  amount: { minor: r.amount_minor, currency: r.currency },
  status: r.status === "settled" ? "settled" : r.status === "cancelled" ? "cancelled" : "open",
  ref: r.ref, openedAt: r.opened_at as Instant, settledAt: (r.settled_at as Instant | null) ?? null,
});

const PURCHASE_COLUMNS = `id, subject_id, package_id, amount_minor, currency, status, ref, opened_at, settled_at`;

export async function openPurchase(
  db: SqlHandle, tenantId: string, subjectId: string, pkg: PackageSpec, at: Instant,
): Promise<Purchase> {
  const id = `pur_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  await db.run(
    `INSERT INTO customer_purchase (id, tenant_id, subject_id, package_id, amount_minor, currency, status, opened_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
    id, tenantId, subjectId, pkg.id, pkg.price.minor, pkg.price.currency, at,
  );
  return {
    id, subjectId, packageId: pkg.id, amount: { minor: pkg.price.minor, currency: pkg.price.currency },
    status: "open", ref: null, openedAt: at, settledAt: null,
  };
}

export async function readPurchase(db: SqlHandle, tenantId: string, id: string): Promise<Purchase | null> {
  const row = await db.first<Parameters<typeof toPurchase>[0]>(
    `SELECT ${PURCHASE_COLUMNS} FROM customer_purchase WHERE tenant_id = ? AND id = ?`, tenantId, id,
  );
  return row ? toPurchase(row) : null;
}

export async function purchasesFor(
  db: SqlHandle, tenantId: string, subjectId: string | null,
): Promise<readonly Purchase[]> {
  const rows = subjectId
    ? await db.all<Parameters<typeof toPurchase>[0]>(
        `SELECT ${PURCHASE_COLUMNS} FROM customer_purchase WHERE tenant_id = ? AND subject_id = ? ORDER BY opened_at DESC LIMIT 200`,
        tenantId, subjectId)
    : await db.all<Parameters<typeof toPurchase>[0]>(
        `SELECT ${PURCHASE_COLUMNS} FROM customer_purchase WHERE tenant_id = ? ORDER BY opened_at DESC LIMIT 200`, tenantId);
  return rows.map(toPurchase);
}

/**
 * Mark an intent paid, exactly once.
 *
 * ⚠️ THE UPDATE IS THE LOCK. A provider that redelivers a success, or a coach
 * pressing confirm twice, must not grant the package again — so settling is a
 * conditional write on `status = 'open'` and the caller applies the package only
 * when it changed a row. Checking first and writing after is the same bug with
 * more steps.
 */
export async function settlePurchase(
  db: SqlHandle, tenantId: string, id: string, by: string, ref: string | null, at: Instant,
): Promise<boolean> {
  await db.run(
    `UPDATE customer_purchase SET status = 'settled', settled_at = ?, settled_by = ?, ref = ? WHERE tenant_id = ? AND id = ? AND status = 'open'`,
    at, by, ref, tenantId, id,
  );
  const row = await db.first<{ settled_at: string | null; settled_by: string | null }>(
    `SELECT settled_at, settled_by FROM customer_purchase WHERE tenant_id = ? AND id = ?`, tenantId, id,
  );
  return row?.settled_at === at && row?.settled_by === by;
}

/**
 * What one customer may do, resolved for the gate.
 *
 * ⚠️ THE SAME WALK THE CAPABILITIES SCREEN USES, projected. Two implementations
 * of "what may this customer do" is how a screen comes to promise what a route
 * refuses — and the screen is the half people look at, so the disagreement is
 * always discovered from the wrong end.
 */
export async function customerFlagsFor(
  db: SqlHandle,
  tenantId: string,
  subjectId: string,
  declared: Readonly<Record<string, FlagDef>>,
  entitlements: Readonly<Record<string, Allowance>>,
  at: Instant,
): Promise<ReadonlySet<string>> {
  const access = await readAccess(db, tenantId, subjectId);
  const pkg = access.packageId ? await readPackage(db, tenantId, access.packageId) : null;
  return resolveCustomerFlags({
    declared,
    pkg,
    snapshot: access.snapshot,
    overrides: access.overrides,
    runway: runwayFor(access.budgets, at),
    tenantHolds: heldEntitlements(entitlements),
  });
}

/* ----------------------------------------------------------- settlement --- */

/**
 * What a payment event does to a subscription.
 *
 * ⚠️ ONLY THIS PATH MAY WRITE `plan_id`. Choosing a plan records an intention;
 * a settled payment is the only thing that grants one. Collapsing the two is how
 * a signup wizard comes to hand out the paid tier to anybody who reaches step
 * two — and it looks exactly like a working wizard until somebody checks.
 *
 * ⚠️ AND `past_due_at` IS SET ONCE. The ladder is anchored on when the charge
 * FIRST failed; re-stamping it on every retry means a workspace never advances
 * past the first rung however long it stays unpaid, and the ladder is decorative.
 */
export async function applyPayment(
  db: SqlHandle,
  tenantId: string,
  event: { readonly kind: "paid" | "failed" | "cancelled" | "refunded" | "other"; readonly planId: string | null },
  at: Instant,
): Promise<void> {
  const ensure = `INSERT INTO subscription (tenant_id, status, updated_at) VALUES (?, 'none', ?) ON CONFLICT(tenant_id) DO NOTHING`;
  await db.run(ensure, tenantId, at);

  switch (event.kind) {
    case "paid":
      await db.run(
        `UPDATE subscription SET plan_id = COALESCE(?, plan_id, pending_plan_id), pending_plan_id = NULL, status = 'active', past_due_at = NULL, updated_at = ? WHERE tenant_id = ?`,
        event.planId, at, tenantId,
      );
      return;
    case "failed":
      await db.run(
        `UPDATE subscription SET status = 'past_due', past_due_at = COALESCE(past_due_at, ?), updated_at = ? WHERE tenant_id = ?`,
        at, at, tenantId,
      );
      return;
    case "cancelled":
      await db.run(`UPDATE subscription SET status = 'cancelled', updated_at = ? WHERE tenant_id = ?`, at, tenantId);
      return;
    case "refunded":
    case "other":
      return;
  }
}
