/**
 * WHERE SOMEBODY BELONGS, ACROSS EVERY PRODUCT — an index, and never a grant.
 *
 * ⚠️ THE HUB PROMISES "EVERYWHERE YOU BELONG" AND COULD ANSWER FOR ONE PRODUCT.
 * Memberships are REGIONAL and per-app by design: they are about one workspace's
 * people, and they live where that workspace's records live. So the worker
 * serving the hub can read its own product's and nothing else — and what it drew
 * was a list that looked complete and was short by every other product somebody
 * uses. Two screens made the same promise (the workspace list and the vault's
 * "who has seen this"), so they could each look complete while disagreeing.
 *
 * ⚠️ IT IS AN INDEX. IT ANSWERS "WHERE TO LOOK", NEVER "MAY THEY". Nothing that
 * decides access may read this table, and the reason is not caution: a global
 * row is written by one worker and trusted by another, so a stale or forged one
 * would be a membership nobody in that workspace granted. The regional row stays
 * authoritative for every permission question — this says only that there is one
 * worth resolving, in that product, in that region.
 *
 * ⚠️ AND IT IS DERIVED, WRITTEN AT THE SAME MOMENTS THE REAL ROW IS. A directory
 * populated by a sweep is a directory that is wrong for as long as the sweep's
 * interval, on the screen somebody opens right after being invited.
 */

import type { Instant, SchemaModule, SqlHandle, TenantId, UserId } from "@one/kernel";

/**
 * ⚠️ KEYED BY THE PAIR, so re-joining a workspace updates rather than duplicates
 * — and `app_id` is a column rather than part of the key because a workspace
 * belongs to exactly one product. It is here so the hub can group by product
 * without a second read per row.
 */
export const MEMBERSHIP_DIRECTORY_SCHEMA: SchemaModule = {
  id: "membership_directory",
  ddl: [
    `CREATE TABLE IF NOT EXISTS membership_directory (account_id TEXT NOT NULL, tenant_id TEXT NOT NULL, app_id TEXT NOT NULL, role TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (account_id, tenant_id));`,
    `CREATE INDEX IF NOT EXISTS idx_membership_directory_account ON membership_directory(account_id);`,
  ],
  /*
    ⚠️ SCOPED BOTH WAYS, because erasing either side must take it. A closed
    workspace leaving rows here puts a dead workspace on somebody's hub forever;
    a closed ACCOUNT leaving them keeps a record of where that person worked in
    the one store that outlives every product.
  */
  scoped: {
    tenantColumn: "tenant_id",
    tenantTables: ["membership_directory"],
    subjectTables: [{ table: "membership_directory", column: "account_id" }],
  },
};

export interface Belonging {
  readonly tenantId: string;
  readonly appId: string;
  readonly role: string;
}

/**
 * Record that somebody belongs here.
 *
 * ⚠️ IT SWALLOWS ITS OWN FAILURE, AND SAYS SO. This runs inside a sign-in and
 * inside an invitation; a directory write that threw would turn "the hub's list
 * is short" into "you cannot sign in", which is strictly worse. The regional row
 * is the one that matters and it is already written.
 */
export async function noteBelonging(
  db: SqlHandle | null, accountId: UserId, tenantId: TenantId, appId: string, role: string, at: Instant,
): Promise<void> {
  if (!db) return;
  try {
    await db.run(
      `INSERT INTO membership_directory (account_id, tenant_id, app_id, role, at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(account_id, tenant_id) DO UPDATE SET app_id = excluded.app_id, role = excluded.role, at = excluded.at`,
      accountId, tenantId, appId, role, at,
    );
  } catch (why) {
    console.error("belonging not recorded", accountId, tenantId, why);
  }
}

/**
 * Forget it.
 *
 * ⚠️ DELETED HERE WHILE THE REAL ROW IS ONLY REVOKED, and the asymmetry is the
 * design. "Who was in this workspace and when" is a question every investigation
 * starts from, so the regional row survives being revoked; this table answers
 * "where do I belong NOW", and a revoked membership left in it is a workspace on
 * somebody's hub that refuses them at the door.
 */
export async function forgetBelonging(
  db: SqlHandle | null, accountId: UserId, tenantId: TenantId,
): Promise<void> {
  if (!db) return;
  try {
    await db.run(`DELETE FROM membership_directory WHERE account_id = ? AND tenant_id = ?`, accountId, tenantId);
  } catch (why) {
    console.error("belonging not forgotten", accountId, tenantId, why);
  }
}

/** Everywhere this account belongs, whichever product serves it. */
export async function belongings(db: SqlHandle, accountId: UserId): Promise<readonly Belonging[]> {
  const rows = await db.all<{ tenant_id: string; app_id: string; role: string }>(
    `SELECT tenant_id, app_id, role FROM membership_directory WHERE account_id = ? ORDER BY at DESC LIMIT 200`,
    accountId,
  ).catch(() => []);
  return rows.map((r) => ({ tenantId: r.tenant_id, appId: r.app_id, role: r.role }));
}
