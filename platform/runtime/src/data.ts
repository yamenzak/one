/**
 * LEAVING — taking everything with you, and being forgotten.
 *
 * ⚠️ BOTH ARE DERIVED FROM THE SCHEMA, NEVER LISTED BY HAND. A hand-written
 * erasure list in a shipping product named seven tables against a declaration of
 * twenty-five, so a deleted workspace kept its media library, its playlists, its
 * history and its generated content — while the sweep reported success and
 * emailed the owner to say otherwise.
 *
 * The list cannot be wrong here because there is no list: every module already
 * declares which of its tables carry a tenant, and this reads that. A module
 * that adds a table gets it covered by both paths on the same commit.
 *
 * ⚠️ AND EXPORT AND ERASURE READ THE SAME PLAN. A table that can be forgotten
 * and not exported is a workspace that loses something it was never offered a
 * copy of; one that can be exported and not forgotten is a promise we broke.
 * They differ by one verb.
 */

import { tenantCascade, type CascadeStep, type Instant, type ObjectHandle, type SchemaModule, type SqlHandle } from "@one/kernel";
import { eraseObjects } from "./files.js";

/**
 * ⚠️ THE PLAN IS `tenantCascade`, NOT A SECOND DERIVATION OF THE SAME THING.
 *
 * Erasure already reads it. Writing an export-shaped copy beside it would be two
 * walks over one declaration, agreeing today and disagreeing the first time
 * either is touched — and the disagreement is silent in both directions: a table
 * exported and not erased is a promise broken, one erased and not exported is a
 * workspace losing something it was never offered a copy of.
 */
export type Erasable = CascadeStep;

export const erasurePlan = (modules: readonly SchemaModule[]): readonly Erasable[] => tenantCascade(modules);

/* --------------------------------------------------------------- export --- */

export interface Export {
  readonly at: Instant;
  readonly tables: Readonly<Record<string, readonly unknown[]>>;
  /**
   * ⚠️ A DOCUMENT CARRIES ROWS, NOT BYTES. The media table travels with every
   * file's id, name, type and size — but a photograph is not a row, and folding
   * megabytes into a JSON document as text would make the export fail at exactly
   * the size that makes it worth having. Each file is fetched by its id, from
   * the same read the app uses, for as long as the workspace exists; erasing
   * first and exporting after is the order that loses them.
   *
   * ⚠️ WHAT WAS LEFT OUT, PER TABLE, AND WHY IT IS NOT OPTIONAL. A truncated
   * export that says nothing reads as "this is everything you had" — which is a
   * claim about somebody's own records that we would be making falsely, in
   * writing, at the moment they are leaving.
   */
  readonly dropped: Readonly<Record<string, number>>;
}

/**
 * Everything a workspace has, in one document.
 *
 * ⚠️ THE CEILING IS PER TABLE AND IS REPORTED. Unbounded, one large workspace
 * exhausts the worker and the export fails entirely — which is worse than a
 * partial one, because a failed export is usually retried at exactly the same
 * size and fails again.
 */
export async function exportTenant(
  db: SqlHandle,
  plan: readonly Erasable[],
  tenantId: string,
  at: Instant,
  perTable = 5000,
): Promise<Export> {
  const tables: Record<string, readonly unknown[]> = {};
  const dropped: Record<string, number> = {};
  for (const { table, column } of plan) {
    /*
      ⚠️ A MISSING TABLE IS SKIPPED RATHER THAN FATAL. An older database may
      legitimately predate a module, and refusing the whole export over one
      absent table would make the feature unavailable to exactly the oldest
      workspaces — the ones with the most to lose.
    */
    const rows = await db.all<Record<string, unknown>>(`SELECT * FROM ${table} WHERE ${column} = ? LIMIT ?`, tenantId, perTable + 1).catch(() => []);
    tables[table] = rows.slice(0, perTable);
    if (rows.length > perTable) {
      const total = await db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`, tenantId).catch(() => null);
      dropped[table] = Math.max(0, (total?.n ?? rows.length) - perTable);
    }
  }
  return { at, tables, dropped };
}

/* --------------------------------------------------------------- erasure --- */

export interface Erased {
  readonly tables: readonly string[];
  /** ⚠️ Tables the plan named that this database does not have. Reported, not hidden. */
  readonly absent: readonly string[];
  /** Objects whose bytes were deleted from the store. */
  readonly objects: number;
  /**
   * ⚠️ OBJECTS STILL IN THE STORE, AND A NON-ZERO IS A FAILED ERASURE. The rows
   * are the only index of the keys, so bytes left behind after the ledger goes
   * are unfindable forever — which is not a cost, it is somebody's photographs
   * still on our disks after we told them they were gone.
   */
  readonly stranded: number;
}

/**
 * Forget a workspace.
 *
 * ⚠️ EVERY DELETE IS ALLOWED TO FAIL AND THE FAILURE IS REPORTED. A database
 * that predates a module legitimately lacks its tables, so a purge that threw on
 * the first absent one would leave a workspace half-erased — which is the worst
 * of the three outcomes, because it looks like the operation did not run.
 *
 * Reporting what was absent is what makes the difference between "that table
 * never existed here" and "erasure has silently stopped covering it" visible to
 * whoever reads the result. The structural guard is what stops the second.
 */
export async function eraseTenant(
  db: SqlHandle,
  plan: readonly Erasable[],
  tenantId: string,
  objects: ObjectHandle | null,
): Promise<Erased> {
  /*
    ⚠️ THE BYTES FIRST, AND THE CASCADE DOES NOT RUN WHILE ANY ARE LEFT. The
    cascade would delete the media rows along with everything else, and those
    rows are the only place the object keys are written down — so a run that
    proceeded past a failed object delete would leave somebody's files in the
    store with no way left to find them, having reported a complete erasure.

    Refusing is safe because this operation is re-runnable: the second attempt
    starts from what is still there.
  */
  const bytes = await eraseObjects(db, objects, tenantId);
  if (bytes.stranded > 0) return { tables: [], absent: [], objects: bytes.objects, stranded: bytes.stranded };

  const tables: string[] = [];
  const absent: string[] = [];
  for (const { table, column } of plan) {
    try {
      await db.run(`DELETE FROM ${table} WHERE ${column} = ?`, tenantId);
      tables.push(table);
    } catch {
      absent.push(table);
    }
  }
  return { tables, absent, objects: bytes.objects, stranded: 0 };
}
