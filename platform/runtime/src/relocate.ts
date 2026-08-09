/**
 * MOVING A TENANT — and it is not a region feature, it is six.
 *
 * The same operation is a region change, the GDPR export, a per-tenant backup, a
 * clone for support, an evacuation from a degraded region, and the per-tenant
 * cutover a migration needs. Building it once, early, means none of those is a
 * bespoke script written under pressure against live customer data.
 *
 * ⚠️ IT IS THE ERASURE CASCADE WITH `SELECT` INSTEAD OF `DELETE`. That is not a
 * neat observation, it is the safety property: a table that cannot be forgotten
 * by one cannot be forgotten by the other, so the guard that proves the cascade
 * complete proves this complete too. A hand-written table list would drift from
 * the schema in silence, and the symptom would be a workspace that arrived in
 * its new region with its media library missing.
 */

import type { Instant, SchemaModule, SqlHandle } from "@one/kernel";
import { tenantCascade } from "@one/kernel";

export interface TableCount { readonly table: string; readonly rows: number }

export interface Verification {
  readonly ok: boolean;
  readonly source: readonly TableCount[];
  readonly target: readonly TableCount[];
  /** Tables whose counts differ. Empty when the copy is faithful. */
  readonly mismatched: readonly string[];
}

export type Relocation =
  | { readonly ok: true; readonly copied: readonly TableCount[]; readonly verification: Verification }
  | { readonly ok: false; readonly why: string; readonly verification?: Verification };

/**
 * Copy one tenant's rows from one regional store to another.
 *
 * ⚠️ THE SOURCE IS NEVER TOUCHED. Every step here is re-runnable and the source
 * remains bootable throughout — the only non-idempotent step in a relocation is
 * the single directory write that follows, and it is deliberately not part of
 * this function. Somebody must still be able to change their mind after the copy
 * and before the flip.
 *
 * ⚠️ AND THE WINDOW IS `readOnly`, NOT DUAL-WRITE. Reads are served for the
 * whole operation, which is the rule this platform keeps at every rung of every
 * ladder; a few minutes read-only for something a tenant asked for and can
 * schedule is honest, and dual-write across regions is neither cheap nor
 * verifiable.
 */
export async function copyTenant(
  from: SqlHandle, to: SqlHandle, modules: readonly SchemaModule[], tenantId: string,
): Promise<Relocation> {
  const steps = tenantCascade(modules);
  if (!steps.length) return { ok: false, why: "no table declares a tenant scope — nothing would be copied" };

  const copied: TableCount[] = [];
  for (const step of steps) {
    const rows = await from.all<Record<string, unknown>>(`SELECT * FROM ${step.table} WHERE ${step.column} = ?`, tenantId);
    for (const row of rows) {
      const names = Object.keys(row);
      /*
        ⚠️ `INSERT OR REPLACE`, so the copy is re-runnable. A relocation that
        half-completed and could not be retried would leave an operator choosing
        between a partial target and a manual clean-up, on somebody's live data.
      */
      await to.run(
        `INSERT OR REPLACE INTO ${step.table} (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`,
        ...names.map((n) => row[n]),
      );
    }
    copied.push({ table: step.table, rows: rows.length });
  }

  const verification = await verifyTenant(from, to, modules, tenantId);
  return verification.ok
    ? { ok: true, copied, verification }
    : { ok: false, why: `counts differ: ${verification.mismatched.join(", ")}`, verification };
}

/**
 * ⚠️ VERIFY BEFORE THE FLIP, ALWAYS, AND BY COUNTING RATHER THAN BY TRUSTING.
 *
 * The directory write is the point of no return for every request that follows
 * it. A copy that reported success and left a table behind would send a
 * workspace to a region that is missing part of it — and the part missing is
 * whichever table nobody thought to check.
 */
export async function verifyTenant(
  from: SqlHandle, to: SqlHandle, modules: readonly SchemaModule[], tenantId: string,
): Promise<Verification> {
  const steps = tenantCascade(modules);
  const count = async (db: SqlHandle, table: string, column: string): Promise<number> => {
    const row = await db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`, tenantId);
    return row?.n ?? 0;
  };

  const source: TableCount[] = [];
  const target: TableCount[] = [];
  const mismatched: string[] = [];
  for (const step of steps) {
    const a = await count(from, step.table, step.column);
    const b = await count(to, step.table, step.column);
    source.push({ table: step.table, rows: a });
    target.push({ table: step.table, rows: b });
    if (a !== b) mismatched.push(step.table);
  }
  return { ok: mismatched.length === 0, source, target, mismatched };
}

/**
 * Remove the source copy, AFTER the flip and after a cooling period.
 *
 * ⚠️ SEPARATE, AND DELIBERATELY AWKWARD TO REACH. Deleting as part of the move
 * would make the whole operation irreversible at its least tested moment. The
 * source staying bootable is what turns a bad relocation into an inconvenience.
 */
export async function dropSourceCopy(
  from: SqlHandle, modules: readonly SchemaModule[], tenantId: string, confirmedAt: Instant,
): Promise<{ readonly deleted: readonly TableCount[]; readonly at: Instant }> {
  const deleted: TableCount[] = [];
  for (const step of tenantCascade(modules)) {
    const before = await from.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${step.table} WHERE ${step.column} = ?`, tenantId);
    await from.run(`DELETE FROM ${step.table} WHERE ${step.column} = ?`, tenantId);
    deleted.push({ table: step.table, rows: before?.n ?? 0 });
  }
  return { deleted, at: confirmedAt };
}

/* ------------------------------------------------------------ relocatable --- */

/**
 * What a durable actor must be able to do before it may hold a tenant's state.
 *
 * ⚠️ THIS IS A CONTRACT FROM THE FIRST ACTOR, not a retrofit. Durable storage
 * cannot be relocated across jurisdictions and a jurisdiction-scoped namespace
 * mints different ids for the same name, so a move is: seal, export, recreate,
 * import, verify, repoint. Every actor written before the rule exists is one
 * that has to be rewritten to obey it.
 *
 * ⚠️ `seal` IS NOT CEREMONY. An actor holding a balance that is moved wrongly
 * either mints value or destroys it, silently, on the money path. The source
 * must refuse further writes and must never be reopened — a state machine on the
 * object, not a discipline in a script.
 */
export interface Relocatable {
  seal(): Promise<{ readonly hash: string }>;
  exportState(): Promise<Uint8Array>;
  importState(bytes: Uint8Array): Promise<void>;
}
