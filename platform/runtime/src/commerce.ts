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
