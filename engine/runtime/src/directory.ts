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

import type { AccountId, AppId, Residency, Shard, TenantId } from "@engine/kernel";
import { newAccountId, newTenantId, placeOn, refusePlacement } from "@engine/kernel";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

/* ----------------------------------------------------------------- schema --- */

export const DIRECTORY_SCHEMA: SchemaModule = {
  id: "directory",
  statements: [
    `CREATE TABLE IF NOT EXISTS account (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT, at TEXT NOT NULL);`,
    `CREATE TABLE IF NOT EXISTS shard (id TEXT PRIMARY KEY, residency TEXT NOT NULL, ceiling INTEGER NOT NULL, at TEXT NOT NULL);`,
    `CREATE TABLE IF NOT EXISTS shard_app (shard_id TEXT NOT NULL, app_id TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (shard_id, app_id));`,
    `CREATE TABLE IF NOT EXISTS tenant (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, country TEXT NOT NULL, shard_id TEXT NOT NULL, residency TEXT NOT NULL, at TEXT NOT NULL, closed_at TEXT);`,
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
  readonly closedAt: string | null;
}

const asTenant = (r: Record<string, unknown>): TenantRow => ({
  id: r.id as TenantId,
  slug: r.slug as string,
  name: r.name as string,
  country: r.country as string,
  shardId: r.shard_id as string,
  residency: r.residency as Residency,
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

/* ----------------------------------------------------------------- shards --- */

export async function addShard(
  db: Db, id: string, where: Residency, ceiling: number, now = new Date(),
): Promise<void> {
  await db.prepare(`INSERT INTO shard (id, residency, ceiling, at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET residency = excluded.residency, ceiling = excluded.ceiling`)
    .bind(id, where, ceiling, now.toISOString()).run();
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
    SELECT s.id, s.residency, s.ceiling,
           (SELECT COUNT(*) FROM tenant t WHERE t.shard_id = s.id AND t.closed_at IS NULL) AS tenants,
           (SELECT GROUP_CONCAT(a.app_id) FROM shard_app a WHERE a.shard_id = s.id) AS apps
    FROM shard s ORDER BY s.id`).all<{
      id: string; residency: string; ceiling: number; tenants: number; apps: string | null;
    }>();
  return rows.results.map((r) => ({
    id: r.id,
    where: r.residency as Residency,
    ceiling: r.ceiling,
    tenants: r.tenants,
    apps: (r.apps ?? "").split(",").filter(Boolean) as AppId[],
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
  await db.prepare(`INSERT INTO tenant (id, slug, name, country, shard_id, residency, at, closed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`)
    .bind(id, wants.slug, wants.name, wants.country.toUpperCase(), shard.id, wants.where, at).run();
  for (const app of wants.apps) {
    await db.prepare(`INSERT INTO tenant_app (tenant_id, app_id, at, disabled_at) VALUES (?, ?, ?, NULL)`)
      .bind(id, app, at).run();
  }

  return {
    tenant: {
      id, slug: wants.slug, name: wants.name, country: wants.country.toUpperCase(),
      shardId: shard.id, residency: wants.where, closedAt: null,
    },
    shard,
  };
}

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
