/**
 * THE ONE GLOBAL STORE — every tenant, every product, every fact a cross-tenant
 * question filters on (D5).
 *
 * ⚠️ THE DIRECTORY ANSWERS, THE SHARD HOLDS. Once tenants are spread across
 * databases, "which workspaces are past due", "who is this person a member of"
 * and "what has this shard got on it" cannot be answered by asking every shard —
 * that walk gets slower with every shard added and times out at exactly the size
 * where it matters. Every such fact therefore lives here, and adding a new
 * cross-tenant question means adding a column here rather than a loop somewhere.
 *
 * ⚠️ THE MEMBERSHIP TABLE HERE IS AN INDEX AND NEVER A GRANT. It answers "which
 * workspaces does this person appear in" for the switcher and for erasure. What
 * somebody may DO is resolved in their tenant's own shard, from their role —
 * because a directory that granted access would be one row's corruption away
 * from granting it everywhere.
 */

import type {
  AccountId, AppId, CommercialAllowance, Kind, Presentation, PresentationRefusal,
  Residency, Shard, TenantId,
} from "@engine/kernel";
import {
  DEFAULT_PRESENTATION, allowanceLeft, mayBecome, newAccountId, newTenantId, placeOn,
  refuseCommercial, refusePlacement, refusePresentation,
} from "@engine/kernel";
import { openAccount } from "./wallet.js";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

/* ----------------------------------------------------------------- schema --- */

export const DIRECTORY_SCHEMA: SchemaModule = {
  id: "directory",
  statements: [
    /* ⚠️ `commercial_granted` IS A COUNT AN OPERATOR SETS, and the count of
       commercial workspaces this account has FOUNDED is what it is measured
       against — derived rather than stored, so the two can never disagree. */
    /* ⚠️ `presentation_json` IS ON THE ACCOUNT AND NOT ON A WORKSPACE, because
       how somebody reads a date follows the PERSON. Filed per workspace it
       would be the same choice made once per workspace, disagreeing with
       itself, and a new one would start by getting it wrong. */
    `CREATE TABLE IF NOT EXISTS account (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT, commercial_granted INTEGER NOT NULL DEFAULT 0, presentation_json TEXT, at TEXT NOT NULL);`,
    /* ⚠️ `dedicated_to` IS THE ISOLATION PROMISE, and it lives on the SHARD
       because every placement asks "may this workspace go here" — a fact held
       only on the arriving tenant cannot answer that about the database. */
    `CREATE TABLE IF NOT EXISTS shard (id TEXT PRIMARY KEY, residency TEXT NOT NULL, ceiling INTEGER NOT NULL, dedicated_to TEXT, at TEXT NOT NULL);`,
    `CREATE TABLE IF NOT EXISTS shard_app (shard_id TEXT NOT NULL, app_id TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (shard_id, app_id));`,
    /* ⚠️ `kind` AND `legal_name` ARE WHAT THE WORKSPACE IS, not what it bought —
       see `Kind`. `became_commercial_at` is the one-way door's timestamp, and
       its presence is the evidence that the transition happened rather than a
       column somebody could flip back without a trace. */
    /* ⚠️ `moving_to` IS WHY A MOVE IS SAFE. It is set before a single row is read
       and `locate` clamps `writable` from it, so the workspace cannot be written
       to while it is being copied — a copy taken from a live database loses
       every row written after the table was read, silently, and only for the
       customers unlucky enough to be working at the time. */
    `CREATE TABLE IF NOT EXISTS tenant (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, country TEXT NOT NULL, shard_id TEXT NOT NULL, residency TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'personal', legal_name TEXT, became_commercial_at TEXT, moving_to TEXT, at TEXT NOT NULL, closed_at TEXT);`,
    `CREATE INDEX IF NOT EXISTS ix_tenant_shard ON tenant (shard_id);`,
    `CREATE TABLE IF NOT EXISTS tenant_app (tenant_id TEXT NOT NULL, app_id TEXT NOT NULL, at TEXT NOT NULL, disabled_at TEXT, PRIMARY KEY (tenant_id, app_id));`,
    /* ⚠️ An index, never a grant — see the header. */
    `CREATE TABLE IF NOT EXISTS belongs (account_id TEXT NOT NULL, tenant_id TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (account_id, tenant_id));`,
    `CREATE INDEX IF NOT EXISTS ix_belongs_tenant ON belongs (tenant_id);`,
    /* ⚠️ AN INVITATION IS A CROSS-TENANT QUESTION, SO IT IS INDEXED HERE (D5).
       "Which workspaces invited this address" is asked once, at sign-in, by
       somebody who belongs to nothing yet — and the only other way to answer it
       is to search every shard for a row that is usually not there. */
    `CREATE TABLE IF NOT EXISTS invited (email TEXT NOT NULL, tenant_id TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (email, tenant_id));`,
  ],
};

/* ------------------------------------------------------------------- rows --- */

export interface TenantRow {
  readonly id: TenantId;
  readonly slug: string;
  readonly name: string;
  readonly country: string;
  readonly shardId: string;
  readonly residency: Residency;
  readonly kind: Kind;
  readonly legalName: string | null;
  /** ⚠️ The shard it is being copied to, while it is. Read-only until it clears. */
  readonly movingTo: string | null;
  readonly closedAt: string | null;
}

const asTenant = (r: Record<string, unknown>): TenantRow => ({
  id: r.id as TenantId,
  slug: r.slug as string,
  name: r.name as string,
  country: r.country as string,
  shardId: r.shard_id as string,
  residency: r.residency as Residency,
  /* ⚠️ A row written before the column existed reads null, and null is
     `personal` — the safe direction. Defaulting the other way would hand a brand
     and a dedicated shard to every workspace on the deployment at once. */
  kind: (r.kind as Kind | null) ?? "personal",
  legalName: (r.legal_name as string | null) ?? null,
  movingTo: (r.moving_to as string | null) ?? null,
  closedAt: (r.closed_at as string | null) ?? null,
});

/* --------------------------------------------------------------- accounts --- */

export async function upsertAccount(
  db: Db, email: string, name: string | null, now = new Date(),
): Promise<AccountId> {
  const at = now.toISOString();
  const found = await db.prepare(`SELECT id FROM account WHERE email = ?`).bind(email).first<{ id: string }>();
  if (found) return found.id as AccountId;
  const id = newAccountId(now);
  await db.prepare(`INSERT INTO account (id, email, name, at) VALUES (?, ?, ?, ?)`)
    .bind(id, email, name, at).run();
  return id;
}

/**
 * HOW THIS PERSON READS DATES, NUMBERS AND QUANTITIES.
 *
 * ⚠️ EVERY UNSET FIELD FALLS BACK TO `auto`, WHICH IS THE BROWSER'S ANSWER. A
 * stored blob written before a field existed is missing that key, and defaulting
 * it to anything but `auto` would silently pin somebody to a convention they
 * never chose — see `DEFAULT_PRESENTATION`.
 *
 * ⚠️ AND A CORRUPT BLOB READS AS DEFAULTS RATHER THAN THROWING. This is on the
 * path of `me.who`, which every door calls before it draws anything, so a parse
 * error here is a deployment where nobody can sign in.
 */
export async function presentationOf(db: Db, accountId: AccountId): Promise<Presentation> {
  const row = await db.prepare(`SELECT presentation_json FROM account WHERE id = ?`)
    .bind(accountId).first<{ presentation_json: string | null }>();
  return asPresentation(row?.presentation_json ?? null);
}

export const asPresentation = (stored: string | null): Presentation => {
  if (!stored) return DEFAULT_PRESENTATION;
  try { return presentationFrom(JSON.parse(stored)); }
  catch { return DEFAULT_PRESENTATION; }
};

/**
 * ⚠️ WHAT ARRIVED, OVER THE DEFAULTS, WITH NOTHING ELSE CARRIED THROUGH. A
 * spread of the whole body would store every stray key a caller sent — which is
 * how a settings blob becomes a place to park arbitrary data on somebody's
 * account, at their own request, forever.
 */
export const presentationFrom = (sent: unknown): Presentation => {
  const from = (sent ?? {}) as Record<string, unknown>;
  const word = (key: keyof Presentation): string =>
    (typeof from[key] === "string" ? from[key] : DEFAULT_PRESENTATION[key]);
  return {
    language: word("language"), region: word("region"), zone: word("zone"),
    dateOrder: word("dateOrder") as Presentation["dateOrder"],
    clock: word("clock") as Presentation["clock"],
    units: word("units") as Presentation["units"],
  };
};

/**
 * ⚠️ REFUSED BEFORE IT IS STORED. `Intl` throws on a tag it cannot parse, from
 * inside a render, on every screen showing a date — so an unchecked write is a
 * way for somebody to lock themselves out of the only screen that could undo it.
 */
export async function setPresentation(
  db: Db, accountId: AccountId, of: Presentation,
): Promise<readonly PresentationRefusal[]> {
  const no = refusePresentation(of);
  if (no.length) return no;
  await db.prepare(`UPDATE account SET presentation_json = ? WHERE id = ?`)
    .bind(JSON.stringify(of), accountId).run();
  return [];
}

/* ----------------------------------------------------------------- shards --- */

export async function addShard(
  db: Db, id: string, where: Residency, ceiling: number,
  dedicatedTo: TenantId | null = null, now = new Date(),
): Promise<void> {
  await db.prepare(`INSERT INTO shard (id, residency, ceiling, dedicated_to, at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET residency = excluded.residency, ceiling = excluded.ceiling,
      dedicated_to = excluded.dedicated_to`)
    .bind(id, where, ceiling, dedicatedTo, now.toISOString()).run();
}

/**
 * Every shard, with what it holds.
 *
 * ⚠️ ONE QUERY, AND THAT IS THE POINT OF THE WHOLE TABLE. The count comes from a
 * `GROUP BY` over the directory's own tenant rows rather than from asking each
 * shard how many it has — which is the fan-out D5 exists to prevent, and which
 * would be indistinguishable from this in behaviour right up until it is not.
 */
export async function shards(db: Db): Promise<readonly Shard[]> {
  const rows = await db.prepare(`
    SELECT s.id, s.residency, s.ceiling, s.dedicated_to,
           (SELECT COUNT(*) FROM tenant t WHERE t.shard_id = s.id AND t.closed_at IS NULL) AS tenants,
           (SELECT GROUP_CONCAT(a.app_id) FROM shard_app a WHERE a.shard_id = s.id) AS apps
    FROM shard s ORDER BY s.id`).all<{
      id: string; residency: string; ceiling: number; dedicated_to: string | null;
      tenants: number; apps: string | null;
    }>();
  return rows.results.map((r) => ({
    id: r.id,
    where: r.residency as Residency,
    ceiling: r.ceiling,
    tenants: r.tenants,
    apps: (r.apps ?? "").split(",").filter(Boolean) as AppId[],
    /* ⚠️ Absent rather than null: `refusePlacement` asks whether the shard is
       somebody's, and `undefined` is the only value that means "nobody's". */
    ...(r.dedicated_to ? { dedicatedTo: r.dedicated_to as TenantId } : {}),
  }));
}

/**
 * ⚠️ APPLYING AN APP'S SCHEMA TO A SHARD IS WHAT MAKES THE SHARD ABLE TO HOLD A
 * TENANT OF THAT APP, and the row here is the directory's record of it. The two
 * must happen together: a row without the tables is a placement rule that lies,
 * and tables without the row are a shard the placer will never use.
 */
export async function noteShardApp(
  db: Db, shardId: string, appId: AppId, now = new Date(),
): Promise<void> {
  await db.prepare(`INSERT INTO shard_app (shard_id, app_id, at) VALUES (?, ?, ?)
    ON CONFLICT(shard_id, app_id) DO NOTHING`).bind(shardId, appId, now.toISOString()).run();
}

/* ---------------------------------------------------------------- tenants --- */

export type CreateRefusal = "slug_taken" | "nowhere_to_put_it";

export interface Created {
  readonly tenant: TenantRow;
  readonly shard: Shard;
}

/**
 * Make a workspace and decide where its records live.
 *
 * ⚠️ NOTHING IS PROVISIONED. No worker, no database, no bucket, no domain, no
 * secret — a row here and a placement. That is the entire content of
 * "provisioning becomes a feature flag" (D1, D5), and it is why creating a
 * tenant is a single write rather than a workflow somebody has to run.
 *
 * ⚠️ AND IT REFUSES RATHER THAN IMPROVISING WHEN THERE IS NOWHERE TO PUT IT. The
 * alternative — putting them on any shard that has room — breaks the residency
 * promise or lands them where their app's tables do not exist, and both are
 * discovered later by the customer.
 */
export async function createTenant(
  db: Db,
  wants: {
    readonly slug: string; readonly name: string; readonly country: string;
    readonly where: Residency; readonly apps: readonly AppId[];
  },
  now = new Date(),
): Promise<Created | CreateRefusal> {
  const taken = await db.prepare(`SELECT id FROM tenant WHERE slug = ?`).bind(wants.slug).first();
  if (taken) return "slug_taken";

  const shard = placeOn(await shards(db), { where: wants.where, apps: wants.apps });
  if (!shard) return "nowhere_to_put_it";

  const id = newTenantId(now);
  const at = now.toISOString();
  /*
    ⚠️ EVERY WORKSPACE IS BORN PERSONAL, AND THAT IS NOT A DEFAULT TO ARGUE WITH.
    Becoming a business takes a legal name and a payment, and neither exists at
    the moment somebody picks an address — offering the choice here would mean
    either taking money inside a wizard or writing `commercial` on a row that has
    met neither condition, and the second is a one-way door opened by accident.
  */
  await db.prepare(`INSERT INTO tenant
      (id, slug, name, country, shard_id, residency, kind, legal_name, became_commercial_at, at, closed_at)
    VALUES (?, ?, ?, ?, ?, ?, 'personal', NULL, NULL, ?, NULL)`)
    .bind(id, wants.slug, wants.name, wants.country.toUpperCase(), shard.id, wants.where, at).run();
  for (const app of wants.apps) {
    await db.prepare(`INSERT INTO tenant_app (tenant_id, app_id, at, disabled_at) VALUES (?, ?, ?, NULL)`)
      .bind(id, app, at).run();
  }

  /*
    ⚠️ THE WALLET EXISTS FROM THE FIRST MINUTE, and it is not a convenience.
    Every credit path writes through `billing_account` — the hold, the
    settlement, the allowance — and each of them is an UPDATE, which on a missing
    row changes nothing and reports success. A workspace without one cannot be
    topped up, cannot be granted its month, and finds out at the moment somebody
    tries to spend.
  */
  await openAccount(db, id, "USD", now);

  return {
    tenant: {
      id, slug: wants.slug, name: wants.name, country: wants.country.toUpperCase(),
      shardId: shard.id, residency: wants.where,
      kind: "personal", legalName: null, movingTo: null, closedAt: null,
    },
    shard,
  };
}

/* ------------------------------------------------------ becoming a business --- */

/**
 * HOW MANY COMMERCIAL WORKSPACES THIS ACCOUNT MAY STILL MAKE.
 *
 * ⚠️ `used` IS COUNTED, NEVER DECREMENTED. A stored counter and a table of
 * workspaces are two records of one fact, and the day they disagree the
 * disagreement is silent — somebody is refused a workspace they were given, or
 * hands out one more than they were. The count here is a `SELECT`, so there is
 * only ever one fact.
 *
 * ⚠️ AND A CLOSED WORKSPACE STILL COUNTS. An allowance that came back on closing
 * would let somebody cycle one grant through any number of businesses, and the
 * records of each are still ours to hold until erasure.
 */
export async function commercialAllowance(
  db: Db, accountId: AccountId,
): Promise<CommercialAllowance> {
  const granted = await db.prepare(`SELECT commercial_granted AS n FROM account WHERE id = ?`)
    .bind(accountId).first<{ n: number }>();
  const used = await db.prepare(
    `SELECT COUNT(*) AS n FROM tenant t JOIN belongs b ON b.tenant_id = t.id
     WHERE b.account_id = ? AND t.kind = 'commercial'`).bind(accountId).first<{ n: number }>();
  return { granted: granted?.n ?? 0, used: used?.n ?? 0 };
}

/** ⚠️ An operator's write, and the only one. Absolute, never an increment. */
export async function setCommercialGrant(
  db: Db, accountId: AccountId, granted: number,
): Promise<void> {
  await db.prepare(`UPDATE account SET commercial_granted = ? WHERE id = ?`)
    .bind(Math.max(0, Math.trunc(granted)), accountId).run();
}

export type BecomeRefusal = "no_such_tenant" | "already" | "legal_name" | "unpaid";

/**
 * Make a workspace a business.
 *
 * ⚠️ ONE WAY, AND `mayBecome` IS ASKED RATHER THAN ASSUMED. The statement below
 * could only ever write `commercial`, so the check looks redundant — which is
 * exactly the reasoning that would let the next person add the other direction
 * beside it. The rule lives in the kernel and is asked here, so both halves are
 * one edit away from a failing test rather than one edit away from working.
 *
 * ⚠️ AND THE `WHERE` CARRIES THE KIND. Two people pressing the button at once
 * would otherwise both pass the read, both write, and both spend an allowance
 * for one workspace. Only the first statement matches.
 */
export async function becomeCommercial(
  db: Db,
  tenantId: TenantId,
  /**
   * ⚠️ NULL WHEN THE MONEY MOVED. An allowance is what somebody spends INSTEAD
   * of paying, so the paid lane has no founder to charge it to — the webhook
   * knows the workspace and the signed event, and nothing else. Making the
   * argument optional is what keeps one function for both lanes; two would be
   * two answers to what a business IS.
   */
  founder: AccountId | null,
  ask: { readonly legalName: string; readonly paid: boolean },
  now = new Date(),
): Promise<TenantRow | BecomeRefusal> {
  const tenant = await tenantById(db, tenantId);
  if (!tenant || tenant.closedAt) return "no_such_tenant";
  if (!mayBecome(tenant.kind, "commercial")) return "already";

  const allowance = founder
    ? await commercialAllowance(db, founder)
    : { granted: 0, used: 0 };
  const refusal = refuseCommercial(tenant, { ...ask, allowance });
  if (refusal) return refusal;

  const done = await db.prepare(
    `UPDATE tenant SET kind = 'commercial', legal_name = ?, became_commercial_at = ?
     WHERE id = ? AND kind = 'personal'`)
    .bind(ask.legalName.trim(), now.toISOString(), tenantId).run();
  /* ⚠️ A statement that matched nothing lost the race, and saying so is the
     difference between one business and one business billed twice. */
  if (done.meta?.changes === 0) return "already";

  return { ...tenant, kind: "commercial", legalName: ask.legalName.trim() };
}

/** What an account has left to spend, as a number a screen can print. */
export const commercialLeft = (a: CommercialAllowance): number => allowanceLeft(a);

export async function tenantBySlug(db: Db, slug: string): Promise<TenantRow | null> {
  const row = await db.prepare(`SELECT * FROM tenant WHERE slug = ?`).bind(slug).first();
  return row ? asTenant(row) : null;
}

export async function tenantById(db: Db, id: TenantId): Promise<TenantRow | null> {
  const row = await db.prepare(`SELECT * FROM tenant WHERE id = ?`).bind(id).first();
  return row ? asTenant(row) : null;
}

/**
 * ⚠️ WHAT A TENANT NEEDS IS EVERY APP IT HAS EVER HAD, disabled ones included.
 * Their records are still there — turning a product off is not deleting it — so
 * a move that dropped the schema would strand data nobody asked to remove,
 * readable again the day the product comes back on, in a database that cannot
 * read it.
 */
export async function appsOfTenant(db: Db, id: TenantId): Promise<readonly AppId[]> {
  const rows = await db.prepare(`SELECT app_id FROM tenant_app WHERE tenant_id = ?`)
    .bind(id).all<{ app_id: string }>();
  return rows.results.map((r) => r.app_id as AppId);
}

export async function liveAppsOfTenant(db: Db, id: TenantId): Promise<readonly AppId[]> {
  const rows = await db.prepare(`SELECT app_id FROM tenant_app WHERE tenant_id = ? AND disabled_at IS NULL`)
    .bind(id).all<{ app_id: string }>();
  return rows.results.map((r) => r.app_id as AppId);
}

/* ------------------------------------------------------------ enablement --- */

export type EnableRefusal = "shard_cannot_hold_it" | "no_such_tenant";

/**
 * Switch a product on for a workspace.
 *
 * ⚠️ THE SCHEMA COMES FIRST, AND THE ROW ONLY IF IT LANDED. The other order —
 * write the enablement, apply the tables on the next request — is a window in
 * which the product is switched on and every one of its reads answers "no such
 * table". It is a small window and it is the customer's first minute with the
 * product.
 *
 * ⚠️ THE SHARD IS PASSED IN RATHER THAN LOOKED UP, because resolving a shard id
 * to a binding is the caller's job and doing it here would make this module know
 * about `env`. `shardFor` is that lookup.
 */
export async function enableApp(
  directory: Db, shard: Db, tenantId: TenantId, app: AppId, schema: SchemaModule,
  apply: (db: Db, modules: readonly SchemaModule[]) => Promise<unknown>,
  now = new Date(),
): Promise<null | EnableRefusal> {
  const tenant = await tenantById(directory, tenantId);
  if (!tenant) return "no_such_tenant";

  await apply(shard, [schema]);
  await noteShardApp(directory, tenant.shardId, app, now);
  await directory.prepare(`INSERT INTO tenant_app (tenant_id, app_id, at, disabled_at) VALUES (?, ?, ?, NULL)
    ON CONFLICT(tenant_id, app_id) DO UPDATE SET disabled_at = NULL`)
    .bind(tenantId, app, now.toISOString()).run();
  return null;
}

/**
 * ⚠️ TURNED OFF IS NOT REMOVED. What ends is reachability; the records stay, the
 * schema stays applied, and the shard still counts the app when deciding whether
 * it could hold this tenant.
 */
export async function disableApp(
  directory: Db, tenantId: TenantId, app: AppId, now = new Date(),
): Promise<void> {
  await directory.prepare(`UPDATE tenant_app SET disabled_at = ? WHERE tenant_id = ? AND app_id = ?`)
    .bind(now.toISOString(), tenantId, app).run();
}

/* ------------------------------------------------------------ membership --- */

export async function noteBelonging(
  db: Db, accountId: AccountId, tenantId: TenantId, now = new Date(),
): Promise<void> {
  await db.prepare(`INSERT INTO belongs (account_id, tenant_id, at) VALUES (?, ?, ?)
    ON CONFLICT(account_id, tenant_id) DO NOTHING`).bind(accountId, tenantId, now.toISOString()).run();
}

/**
 * ⚠️ EVERYBODY IN ONE WORKSPACE, FOR THE ONE CALLER THAT NEEDS ALL OF THEM. The
 * sweep removes each membership through `forgetBelonging`, the same write a
 * person leaving goes through — a `DELETE … WHERE tenant_id` here would be a
 * second way to stop being a member, and the two would drift the first time one
 * of them learned to do something else as well.
 */
/**
 * ⚠️ THE STAMP THAT ENDS A WORKSPACE, AND IT IS WHAT MAKES THE SWEEP FINITE.
 * Erasure deletes rows; without a mark saying it happened, the same workspace is
 * past its date tomorrow and every day after, so it is swept forever and every
 * run reports "1 erased" — a job whose record says it did something useful every
 * night while doing nothing at all. Every read that lists workspaces already
 * excludes a closed one, so this is the state the rest of the platform expects.
 */
export async function closeTenant(db: Db, tenantId: TenantId, now = new Date()): Promise<void> {
  await db.prepare(`UPDATE tenant SET closed_at = ? WHERE id = ? AND closed_at IS NULL`)
    .bind(now.toISOString(), tenantId).run();
}

export async function membersOfTenant(db: Db, tenantId: TenantId): Promise<readonly AccountId[]> {
  const rows = await db.prepare(`SELECT account_id FROM belongs WHERE tenant_id = ?`)
    .bind(tenantId).all<{ account_id: string }>();
  return rows.results.map((r) => r.account_id as AccountId);
}

export async function forgetBelonging(db: Db, accountId: AccountId, tenantId: TenantId): Promise<void> {
  await db.prepare(`DELETE FROM belongs WHERE account_id = ? AND tenant_id = ?`)
    .bind(accountId, tenantId).run();
}

/**
 * ⚠️ THE APP SWITCHER AND THE ERASURE SWEEP ASK THIS SAME QUESTION, and both
 * would otherwise have to visit every shard to answer it. One person, one query,
 * however many databases the deployment has grown to.
 */
export async function tenantsOf(db: Db, accountId: AccountId): Promise<readonly TenantRow[]> {
  const rows = await db.prepare(`
    SELECT t.* FROM tenant t JOIN belongs b ON b.tenant_id = t.id
    WHERE b.account_id = ? AND t.closed_at IS NULL ORDER BY t.at`).bind(accountId).all();
  return rows.results.map(asTenant);
}

/* ---------------------------------------------------------------- moving --- */

export type MoveRefusal = "no_such_tenant" | "no_such_shard" | ReturnType<typeof refusePlacement>;

/**
 * ⚠️ A MOVE IS REFUSED BY THE SAME RULE THAT PLACED IT, and asking is the whole
 * point. A tenant moved to a shard whose schema does not cover its apps answers
 * "no such table" on every request — after a move that reported success — and
 * nothing about the move itself looked wrong.
 *
 * ⚠️ THIS DECIDES; IT DOES NOT CARRY THE RECORDS. Copying rows between databases
 * is its own path with its own failure modes, and conflating "may this go there"
 * with "put it there" is how the check ends up skipped in the hurry.
 */
/* ⚠️ AND IT IS THE ONLY GATE ON A MOVE. `beginMove` asks this before it stamps
   a workspace read-only, so a shard whose schema does not cover the workspace's
   apps is refused here rather than discovered as "no such table" on every
   request after a move that reported success. */
export async function mayMove(
  db: Db, tenantId: TenantId, toShard: string,
): Promise<MoveRefusal | null> {
  const tenant = await tenantById(db, tenantId);
  if (!tenant) return "no_such_tenant";
  const shard = (await shards(db)).find((s) => s.id === toShard);
  if (!shard) return "no_such_shard";
  return refusePlacement(shard, { where: tenant.residency, apps: await appsOfTenant(db, tenantId) });
}

/* ----------------------------------------------------------- invitations --- */

export async function noteInvitation(
  db: Db, email: string, tenantId: TenantId, now = new Date(),
): Promise<void> {
  await db.prepare(`INSERT INTO invited (email, tenant_id, at) VALUES (?, ?, ?)
    ON CONFLICT(email, tenant_id) DO NOTHING`).bind(email, tenantId, now.toISOString()).run();
}

/** ⚠️ One query for somebody who belongs to nothing yet — see the schema note. */
export async function invitationsFor(db: Db, email: string): Promise<readonly TenantRow[]> {
  const rows = await db.prepare(`
    SELECT t.* FROM tenant t JOIN invited i ON i.tenant_id = t.id
    WHERE i.email = ? AND t.closed_at IS NULL`).bind(email).all();
  return rows.results.map(asTenant);
}

/**
 * ⚠️ FORGOTTEN ONCE IT IS CLAIMED, because an invitation index that outlives the
 * invitation is a list of addresses with no purpose — and it would re-claim on
 * every later sign-in, quietly undoing a removal.
 */
export async function forgetInvitation(db: Db, email: string, tenantId: TenantId): Promise<void> {
  await db.prepare(`DELETE FROM invited WHERE email = ? AND tenant_id = ?`).bind(email, tenantId).run();
}
