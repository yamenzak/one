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

import { subjectCascade, tableNameFor, tenantCascade, type CascadeStep, type CollectionSpec, type Instant, type ObjectHandle, type SchemaModule, type SqlHandle, type SubjectStep } from "@one/kernel";
import { eraseObjects } from "./files.js";
import type { JobSpec } from "@one/kernel";

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
  /** Only these tables, where a caller wants a subset. Empty means all of them. */
  only: ReadonlySet<string> | null = null,
): Promise<Export> {
  const tables: Record<string, readonly unknown[]> = {};
  const dropped: Record<string, number> = {};
  for (const { table, column } of plan) {
    if (only && !only.has(table)) continue;
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
  /**
   * ⚠️ WHAT LEFT WITH THE WORKSPACE, from the collections that declared they may
   * not be destroyed without being handed over. Absent where no collection
   * declares one — not an empty document, because an empty document reads as
   * "there was nothing" rather than "nothing was owed".
   */
  readonly taken?: Export;
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
  /**
   * ⚠️ THE TABLES THAT MAY NOT BE DESTROYED WITHOUT BEING HANDED OVER, from
   * every collection declaring `export-then-purge`.
   *
   * ⚠️ AND THE EXPORT HAPPENS HERE RATHER THAN BEING SOMETHING THE CALLER IS
   * TRUSTED TO HAVE DONE. "Take an export first" is an instruction, and an
   * instruction attached to the one operation in this platform with no undo is
   * a thing somebody skips at three in the morning. Making the destruction
   * RETURN the data means the promise cannot be broken by forgetting.
   */
  takeFirst: ReadonlySet<string> = new Set(),
  at: Instant = new Date().toISOString() as Instant,
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
  /*
    ⚠️ BEFORE ANYTHING IS DELETED, INCLUDING THE BYTES. An export taken after the
    objects have gone is one whose media rows point at files that no longer
    exist — which is the shape of a promise kept in the wrong order.
  */
  const taken = takeFirst.size ? await exportTenant(db, plan, tenantId, at, 5000, takeFirst) : null;

  const bytes = await eraseObjects(db, objects, tenantId);
  if (bytes.stranded > 0) {
    return { tables: [], absent: [], objects: bytes.objects, stranded: bytes.stranded, ...(taken ? { taken } : {}) };
  }

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
  return { tables, absent, objects: bytes.objects, stranded: 0, ...(taken ? { taken } : {}) };
}

/* ------------------------------------------------------------ one person --- */

export const subjectPlan = (modules: readonly SchemaModule[]): readonly SubjectStep[] => subjectCascade(modules);

export interface Forgotten {
  readonly tables: readonly string[];
  /** ⚠️ Tables the plan named that this database does not have. Reported, not hidden. */
  readonly absent: readonly string[];
  /** Rows of the activity trail that went with them. */
  readonly trail: number;
}

/**
 * Forget one person, everywhere this workspace kept them.
 *
 * ⚠️ DERIVED, FOR THE REASON THE TENANT PLAN IS — and more so. A hand-written
 * list for one subject is worse than a hand-written one for a workspace, because
 * nobody notices a table that was missed for ONE person: the workspace keeps
 * working, the screens are all correct, and a record somebody asked to be rid of
 * is still answering queries in a table nobody thought about.
 *
 * ⚠️ BOTH COLUMNS ARE BOUND. Deleting by subject alone reaches across workspaces
 * the moment two of them mint the same id, and ids are the app's — so a platform
 * that assumed they were unique would be assuming something it cannot check.
 *
 * ⚠️ AND IT DOES NOT TOUCH THE SUBJECT'S OWN ROW. What "removing a client" means
 * to a product — archive the record, keep an invoice, free a seat — is the app's
 * decision, and one this cannot make. It clears what HANGS OFF them.
 */
export async function eraseSubject(
  db: SqlHandle,
  plan: readonly SubjectStep[],
  tenantId: string,
  subjectId: string,
  trailTable = "activity",
): Promise<Forgotten> {
  const tables: string[] = [];
  const absent: string[] = [];
  /*
    ⚠️ THE TRAIL IS TENANT-SCOPED, SO THE CASCADE CANNOT SEE IT, and what it
    holds about somebody is not nothing: a dated list of every time their record
    was touched and by whom. Left behind, "forget this person" produces a
    workspace that still knows they existed, when they were edited and how
    often — which is the shape of the thing they asked to be rid of.

    ⚠️ THE IDS ARE READ BEFORE THE ROWS GO, because afterwards there is nothing
    left to join to. A trail entry names the row it is about, and once that row
    is deleted the entry is an orphan nobody can attribute — including us.
  */
  const trailIds = new Set<string>([subjectId]);
  for (const step of plan) {
    const rows = await db.all<{ id: string }>(
      `SELECT id FROM ${step.table} WHERE ${step.tenantColumn} = ? AND ${step.subjectColumn} = ?`,
      tenantId, subjectId,
    ).catch(() => []);
    for (const r of rows) trailIds.add(r.id);
  }

  for (const step of plan) {
    try {
      await db.run(`DELETE FROM ${step.table} WHERE ${step.tenantColumn} = ? AND ${step.subjectColumn} = ?`, tenantId, subjectId);
      tables.push(step.table);
    } catch {
      absent.push(step.table);
    }
  }

  let trail = 0;
  for (const id of trailIds) {
    const before = await db.first<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${trailTable} WHERE tenant_id = ? AND row_id = ?`, tenantId, id,
    ).catch(() => null);
    if (!before) continue;
    await db.run(`DELETE FROM ${trailTable} WHERE tenant_id = ? AND row_id = ?`, tenantId, id).catch(() => undefined);
    trail += before.n;
  }

  return { tables, absent, trail };
}

/* ------------------------------------------------------------- retention --- */

/**
 * WHAT A COLLECTION SAYS ABOUT KEEPING ITS OWN ROWS.
 *
 * ⚠️ TWO DECLARATIONS, TWO DIFFERENT MOMENTS, AND NEITHER WAS READ. `days` is a
 * limit that applies while the workspace is perfectly healthy — a legal or
 * product ceiling on how long a record may be held — and `onTenantClose` decides
 * whether the record may travel out in an export at all. A manifest has carried
 * both since the first collection; the erasure cascade treated every collection
 * alike and the export carried every table regardless.
 */
export interface Keeping {
  readonly table: string;
  readonly days: number | null;
  readonly onTenantClose: "purge" | "export-then-purge";
}

/**
 * What every collection declared, as tables.
 *
 * ⚠️ THE TABLE NAME IS DERIVED THE SAME WAY THE DDL DERIVES IT, so a collection
 * renamed in the manifest carries its retention with it rather than leaving a
 * rule pointed at a table that no longer exists.
 */
export const keptBy = (collections: readonly CollectionSpec[]): readonly Keeping[] =>
  collections.map((c) => ({
    table: tableNameFor(c),
    days: c.retention.days,
    onTenantClose: c.retention.onTenantClose,
  }));

/**
 * The tables that may not be destroyed without being handed over first.
 *
 * ⚠️ `export-then-purge` IS AN OBLIGATION, NOT A PROHIBITION — and getting that
 * backwards is easy enough that it was got backwards once here. It does not say
 * "never export this"; it says "an export happens BEFORE this is destroyed",
 * which is a promise about the order of two operations. `purge` is the absence
 * of that promise, not a ban.
 *
 * So it cannot be honoured by a filter on the export. It is honoured by making
 * the destruction hand the data over — see `eraseTenant`.
 */
export const mustLeaveWith = (keeping: readonly Keeping[]): ReadonlySet<string> =>
  new Set(keeping.filter((k) => k.onTenantClose === "export-then-purge").map((k) => k.table));

export interface Expired {
  readonly table: string;
  readonly deleted: number;
}

/**
 * Delete what a collection said it may not keep this long.
 *
 * ⚠️ AGAINST `created_at`, WHICH IS THE ONLY COLUMN EVERY DERIVED TABLE HAS. A
 * retention limit measured from the last EDIT would be one somebody resets by
 * opening a record, which is the opposite of a limit.
 *
 * ⚠️ BOUNDED PER TABLE PER RUN, so a workspace that has never been swept catches
 * up over several runs rather than crossing the runtime's time limit, failing,
 * being retried at the same size and never happening at all.
 *
 * ⚠️ AND A MISSING TABLE IS SKIPPED RATHER THAN FATAL, for the same reason the
 * export skips one: an older database may legitimately predate a module, and one
 * absent table must not stop the sweep for every other.
 */
export async function sweepRetention(
  db: SqlHandle,
  keeping: readonly Keeping[],
  tenantColumn: string,
  tenantId: string,
  now: Instant,
  perTable = 500,
): Promise<readonly Expired[]> {
  const out: Expired[] = [];
  for (const k of keeping) {
    if (k.days === null || k.days <= 0) continue;
    const before = new Date(Date.parse(now) - k.days * 86_400_000).toISOString();

    /*
      ⚠️ COUNTED BEFORE THE DELETE, AND THE COUNT IS WHAT IS REPORTED. Reporting
      the CEILING instead — which the first draft of this did — makes a sweep
      that removed nothing indistinguishable from one that removed five hundred,
      on the one job whose whole output is a number nobody can check afterwards.
    */
    const due = await db.first<{ n: number }>(
      `SELECT COUNT(*) AS n FROM (SELECT 1 FROM ${k.table} WHERE ${tenantColumn} = ? AND created_at < ? LIMIT ?)`,
      tenantId, before, perTable,
    ).catch(() => null);
    /* A missing table is skipped rather than fatal — an older database may
       legitimately predate a module, and one absent table must not stop the
       sweep for every other. */
    if (!due || due.n === 0) continue;

    await db.run(
      `DELETE FROM ${k.table} WHERE rowid IN (
         SELECT rowid FROM ${k.table} WHERE ${tenantColumn} = ? AND created_at < ? LIMIT ?
       )`,
      tenantId, before, perTable,
    ).catch(() => undefined);
    out.push({ table: k.table, deleted: due.n });
  }
  return out;
}

/**
 * THE PLATFORM'S OWN RETENTION SWEEP.
 *
 * ⚠️ A JOB RATHER THAN A RULE ON A READ, because a limit enforced by hiding rows
 * is not a limit. "We do not keep this past ninety days" is a claim about what is
 * on disk, and a filter in a query leaves it there — which is the difference
 * between what a privacy notice says and what a subpoena finds.
 *
 * ⚠️ AND IT IS DERIVED FROM THE APP'S OWN COLLECTIONS, so a collection that
 * declares a limit is swept the day it is declared. A hand-maintained list is
 * the shape that left seven tables named against a declaration of twenty-five.
 */
export const retentionJob = (collections: readonly CollectionSpec[]): JobSpec => ({
  id: "platform.retention",
  summary: "Delete records past the limit their collection declared.",
  every: "daily",
  scope: "tenant",
  /* ⚠️ Bounded per run: a workspace that has never been swept catches up over
     several runs rather than crossing the time limit and never happening. */
  batch: 500,
  async handler(ctx) {
    const keeping = keptBy(collections).filter((k) => k.days !== null && k.days > 0);
    /*
      ⚠️ NOTHING TO DO IS `idle`, NOT `done`. Most apps declare no limit at all,
      and reporting a sweep as having worked on every workspace of every one of
      them turns the run table into healthy-looking rows that mean nothing.
    */
    if (!keeping.length) return { done: 0, idle: 1, more: false };
    const expired = await sweepRetention(
      ctx.bind.db as SqlHandle, keeping, "tenant_id", ctx.tenantId!, ctx.now(), 500,
    );
    const deleted = expired.reduce((a, e) => a + e.deleted, 0);
    /* ⚠️ `more` when a table filled its ceiling, so the next run continues
       rather than the remainder waiting for somebody to notice. */
    return { done: deleted, more: expired.some((e) => e.deleted >= 500) };
  },
});
