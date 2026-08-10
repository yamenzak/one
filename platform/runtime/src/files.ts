/**
 * FILES — and the one rule that makes storage accountable.
 *
 * ⚠️ THERE IS NO WRITE THAT SKIPS THE LEDGER, AND THIS IS THE ONLY MODULE THAT
 * MAY TOUCH THE OBJECT STORE. An object written behind the ledger is invisible
 * to the quota and invisible to erasure, forever, and nothing else would ever
 * notice: it costs money every month, it survives a workspace being forgotten,
 * and the only way to find it is to list a bucket by hand.
 *
 * A shipping product needed a guard script to enforce that rule across three
 * apps. Here it is a chokepoint by construction and a guard on top.
 *
 * ⚠️ THE KEY IS TENANT-PREFIXED, and that is the safe default rather than the
 * clever one. Content-addressing a key across tenants deduplicates the bucket
 * and makes erasure a question about who else is referencing the same bytes —
 * which is the right trade for a shared media library and the wrong one for
 * everybody else. An app that needs it can qualify its own keys; the platform
 * does not guess.
 */

import type { CollectionSpec, Instant, ObjectHandle, SchemaModule, SqlHandle } from "@one/kernel";
import { columnName, liveClause, tableNameFor } from "@one/kernel";
import { stripMetadata } from "./exif.js";

export const MEDIA_SCHEMA: SchemaModule = {
  id: "media",
  ddl: [
    `CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, object_key TEXT NOT NULL, name TEXT NOT NULL, content_type TEXT NOT NULL, bytes INTEGER NOT NULL, digest TEXT NOT NULL, purpose TEXT NOT NULL, stripped INTEGER NOT NULL, actor_id TEXT NOT NULL, at TEXT NOT NULL);`,
    /*
      ⚠️ ONE ROW PER SET OF BYTES PER WORKSPACE. The same file uploaded twice is
      one object and one row, so the quota counts what is stored rather than what
      was sent — and the second upload is free, which is what somebody retrying a
      flaky connection deserves.
    */
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_media_digest ON media(tenant_id, digest);`,
    `CREATE INDEX IF NOT EXISTS idx_media_tenant ON media(tenant_id, at);`,
  ],
  scoped: { tenantColumn: "tenant_id", tenantTables: ["media"] },
};

export interface MediaRow {
  readonly id: string;
  readonly name: string;
  readonly contentType: string;
  readonly bytes: number;
  readonly digest: string;
  readonly purpose: string;
  /** ⚠️ Whether metadata was actually removed, not whether we tried. */
  readonly stripped: boolean;
  readonly at: string;
}

const hex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

export const digestOf = async (body: ArrayBuffer): Promise<string> => hex(await crypto.subtle.digest("SHA-256", body));

/**
 * ⚠️ THE KEY IS DERIVED, NEVER SUPPLIED. A caller-chosen key is a caller-chosen
 * path, and a caller-chosen path is one that can start with another tenant's
 * prefix. Deriving it from the tenant and the content means there is nothing to
 * validate because there is nothing to pass.
 */
export const keyFor = (tenantId: string, digest: string): string => `${tenantId}/${digest}`;

/* --------------------------------------------------------------- storing --- */

export type Stored =
  | { readonly ok: true; readonly row: MediaRow; readonly fresh: boolean }
  | { readonly ok: false; readonly why: "too_large" | "no_room" };

export interface StoreInput {
  readonly db: SqlHandle;
  readonly objects: ObjectHandle;
  readonly tenantId: string;
  readonly actorId: string;
  readonly name: string;
  readonly contentType: string;
  readonly body: ArrayBuffer;
  /** A closed set the app declares — it is a path segment and a policy. */
  readonly purpose: string;
  readonly at: Instant;
  readonly maxBytes: number;
  /** Bytes this workspace may store in total. `-1` is unlimited. */
  readonly allowance: number;
}

/**
 * Store one file.
 *
 * ⚠️ THE ORDER IS STRIP → MEASURE → CHECK → WRITE OBJECT → WRITE LEDGER, and
 * every step of it is load-bearing.
 *
 * Stripping first, because the size that counts against a quota is the size that
 * is stored. Checking before the object, because an object written and then
 * refused is exactly the orphan this module exists to prevent. The ledger last,
 * because a row with no object renders as a broken image while an object with no
 * row is invisible forever — and of the two failures, the visible one is the one
 * somebody reports.
 */
export async function storeMedia(input: StoreInput): Promise<Stored> {
  const cleaned = stripMetadata(input.body, input.contentType);
  const bytes = cleaned.body.byteLength;
  if (bytes > input.maxBytes) return { ok: false, why: "too_large" };

  const digest = await digestOf(cleaned.body);
  const existing = await input.db.first<{ id: string }>(
    `SELECT id FROM media WHERE tenant_id = ? AND digest = ?`, input.tenantId, digest,
  );
  /*
    ⚠️ THE SAME BYTES AGAIN ARE FREE, AND THE QUOTA IS NOT CONSULTED. A retry
    after a dropped connection must not be refused for space the first attempt
    already took — and it is the same object, so it takes no more.
  */
  if (existing) {
    const row = await readMedia(input.db, input.tenantId, existing.id);
    if (row) return { ok: true, row, fresh: false };
  }

  /*
    ⚠️ THE INCOMING FILE IS COUNTED, NOT JUST WHAT IS ALREADY THERE. A ceiling
    checked as "are we full" admits one more file of any size, which for media is
    the difference between a limit and a suggestion.
  */
  if (input.allowance !== UNLIMITED_BYTES) {
    const used = await usedBytes(input.db, input.tenantId);
    if (used + bytes > input.allowance) return { ok: false, why: "no_room" };
  }

  const key = keyFor(input.tenantId, digest);
  await input.objects.put(key, cleaned.body, input.contentType);

  const id = `med_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  await input.db.run(
    `INSERT INTO media (id, tenant_id, object_key, name, content_type, bytes, digest, purpose, stripped, actor_id, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, input.tenantId, key, input.name, input.contentType, bytes, digest, input.purpose,
    cleaned.confident ? 1 : 0, input.actorId, input.at,
  );

  return {
    ok: true,
    fresh: true,
    row: { id, name: input.name, contentType: input.contentType, bytes, digest, purpose: input.purpose, stripped: cleaned.confident, at: input.at },
  };
}

export const UNLIMITED_BYTES = -1;

export async function usedBytes(db: SqlHandle, tenantId: string): Promise<number> {
  const row = await db.first<{ n: number }>(`SELECT COALESCE(SUM(bytes), 0) AS n FROM media WHERE tenant_id = ?`, tenantId);
  return row?.n ?? 0;
}

/* --------------------------------------------------------------- reading --- */

interface Row {
  id: string; name: string; content_type: string; bytes: number; digest: string;
  purpose: string; stripped: number; at: string; object_key: string;
}

const toRow = (r: Row): MediaRow => ({
  id: r.id, name: r.name, contentType: r.content_type, bytes: r.bytes,
  digest: r.digest, purpose: r.purpose, stripped: r.stripped === 1, at: r.at,
});

export async function readMedia(db: SqlHandle, tenantId: string, id: string): Promise<MediaRow | null> {
  const row = await db.first<Row>(`SELECT * FROM media WHERE tenant_id = ? AND id = ?`, tenantId, id);
  return row ? toRow(row) : null;
}

export async function listMedia(db: SqlHandle, tenantId: string, limit: number): Promise<readonly MediaRow[]> {
  const rows = await db.all<Row>(`SELECT * FROM media WHERE tenant_id = ? ORDER BY at DESC LIMIT ?`, tenantId, limit);
  return rows.map(toRow);
}

/**
 * The bytes, for somebody the gate already admitted.
 *
 * ⚠️ THERE IS NO PUBLIC URL, AND THAT IS THE POINT. A signed link is a
 * credential in a string: it survives being pasted into a message, a support
 * ticket and a browser history, and it cannot be revoked without rotating
 * everything. Reading through the app means the same permission and row-scope
 * checks that guard every other read guard this one, every time.
 */
export async function fetchMedia(
  db: SqlHandle,
  objects: ObjectHandle,
  tenantId: string,
  id: string,
): Promise<{ readonly row: MediaRow; readonly body: ArrayBuffer } | null> {
  const row = await db.first<Row>(`SELECT * FROM media WHERE tenant_id = ? AND id = ?`, tenantId, id);
  if (!row) return null;
  const body = await objects.get(row.object_key);
  if (!body) return null;
  return { row: toRow(row), body };
}

/* ------------------------------------------------------------ references --- */

/**
 * Why a record may not point at this file.
 *
 * ⚠️ `unknown` COVERS A DELETED FILE, A TYPO AND ANOTHER WORKSPACE'S ID, and it
 * says the same thing to all three on purpose. Distinguishing "not yours" from
 * "not there" tells whoever is guessing which ids exist, and neither answer is
 * one the caller can act on differently.
 */
export type MediaRefusal = "unknown" | "type" | "size";

/**
 * Whether a media field may hold this id.
 *
 * ⚠️ A DECLARED `accept` THAT NOTHING CHECKS IS A POLICY THAT DOES NOT EXIST. A
 * media field compiles to a text column, so without this a face can be set to a
 * twenty-megabyte video, to a file that was deleted last week, or to a string
 * somebody typed — and every one of those renders as a broken image on a screen
 * far away from the write that caused it.
 *
 * ⚠️ IT IS CHECKED AGAINST THE LEDGER, NEVER AGAINST THE VALUE. The type and the
 * size come from the row the upload wrote after stripping and measuring, which
 * is the only place either is a fact rather than a claim.
 */
export async function mediaRefused(
  db: SqlHandle,
  tenantId: string,
  id: string,
  field: { readonly accept: readonly string[]; readonly maxBytes: number },
): Promise<MediaRefusal | null> {
  const row = await db.first<{ content_type: string; bytes: number }>(
    `SELECT content_type, bytes FROM media WHERE tenant_id = ? AND id = ?`, tenantId, id,
  ).catch(() => null);
  if (!row) return "unknown";
  if (field.accept.length > 0 && !field.accept.includes(row.content_type)) return "type";
  if (field.maxBytes > 0 && row.bytes > field.maxBytes) return "size";
  return null;
}

/**
 * Every place a record can point at a file — derived, never listed.
 *
 * ⚠️ A HAND-WRITTEN LIST HERE IS THE SAME BUG AS A HAND-WRITTEN ERASURE LIST.
 * It would be right on the day it was written and wrong on the day somebody adds
 * a media field, and the failure is silent in the direction that matters: the
 * new field is simply not consulted, so deleting a file breaks it and nothing
 * anywhere reports that it did.
 */
export interface MediaUse {
  readonly collection: string;
  readonly field: string;
  readonly table: string;
  readonly column: string;
  readonly tenanted: boolean;
  readonly live: string;
}

export const mediaUses = (collections: readonly CollectionSpec[]): readonly MediaUse[] =>
  collections.flatMap((spec) =>
    Object.entries(spec.fields)
      .filter(([, f]) => f.kind === "media")
      .map(([name]) => ({
        collection: spec.id,
        field: name,
        table: tableNameFor(spec),
        column: columnName(name),
        tenanted: spec.scope.of !== "platform",
        live: liveClause(spec),
      })));

/**
 * What still points at this file.
 *
 * ⚠️ ARCHIVED ROWS DO NOT COUNT, and that is a decision rather than an oversight.
 * A soft-deleted record is not on anybody's screen, so counting it would hold a
 * workspace's storage against records it has already thrown away — permanently,
 * because an archived row is never coming back to release it.
 */
export async function usesOf(
  db: SqlHandle,
  tenantId: string,
  id: string,
  uses: readonly MediaUse[],
): Promise<readonly { readonly collection: string; readonly field: string; readonly count: number }[]> {
  const found: { collection: string; field: string; count: number }[] = [];
  for (const use of uses) {
    const where = use.tenanted ? `tenant_id = ? AND ${use.column} = ?` : `${use.column} = ?`;
    const binds = use.tenanted ? [tenantId, id] : [id];
    const row = await db.first<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${use.table} WHERE ${where}${use.live}`, ...binds,
    ).catch(() => null);
    if (row && row.n > 0) found.push({ collection: use.collection, field: use.field, count: row.n });
  }
  return found;
}

/**
 * Forget a workspace's stored bytes.
 *
 * ⚠️ THE OBJECTS GO BEFORE THE ROWS, WHICH IS THE OPPOSITE OF DELETING ONE FILE.
 * There the row goes first, because an orphaned object costs money and a row
 * pointing at nothing is a broken image somebody reports. Here the row is the
 * ONLY record of the key: delete it first and the bytes cannot be found again by
 * any means short of listing the bucket by hand.
 *
 * ⚠️ A ROW IS DROPPED ONLY WHEN ITS OBJECT IS GONE, so a store that refused one
 * delete leaves that row for the next run to retry rather than losing the key.
 */
export async function eraseObjects(
  db: SqlHandle,
  objects: ObjectHandle | null,
  tenantId: string,
  ceiling = OBJECT_CEILING,
): Promise<{ readonly objects: number; readonly stranded: number }> {
  const left = async (): Promise<number> =>
    (await db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM media WHERE tenant_id = ?`, tenantId).catch(() => null))?.n ?? 0;

  /*
    ⚠️ NO STORE AND NOTHING STORED IS FINE; NO STORE AND SOMETHING STORED IS NOT.
    A deployment with no object binding cannot delete what it cannot reach, and
    saying so is the difference between "there was nothing" and "we could not".
  */
  if (!objects) return { objects: 0, stranded: await left() };

  let gone = 0;
  let failed = 0;
  /*
    ⚠️ TAKEN IN PAGES UNTIL THERE ARE NONE, NOT ONE PAGE. A single bounded pass
    would delete the first five hundred objects and report a clean run, and the
    cascade behind it would then drop the rows naming every other one — which is
    exactly the leak this function exists to close, reintroduced by its own
    ceiling. What is left over when the ceiling IS reached is reported as
    stranded, which stops the cascade and leaves the work for the next run.
  */
  while (gone + failed < ceiling) {
    const rows = await db.all<{ id: string; object_key: string }>(
      `SELECT id, object_key FROM media WHERE tenant_id = ? LIMIT ?`,
      tenantId, Math.min(OBJECT_PAGE, ceiling - gone - failed),
    ).catch(() => []);
    if (rows.length === 0) break;

    let progressed = 0;
    for (const row of rows) {
      try {
        await objects.delete(row.object_key);
        await db.run(`DELETE FROM media WHERE tenant_id = ? AND id = ?`, tenantId, row.id);
        gone++;
        progressed++;
      } catch {
        failed++;
      }
    }
    /*
      ⚠️ A PAGE THAT DELETED NOTHING ENDS THE RUN. The rows that failed are still
      the first page of the next query, so without this the same objects are
      attempted over and over until the ceiling — which turns a store that is
      simply down into ten thousand calls to it.
    */
    if (progressed === 0) break;
  }
  return { objects: gone, stranded: await left() };
}

/** One page of deletes, and the most one run will attempt. */
const OBJECT_PAGE = 500;
export const OBJECT_CEILING = 10_000;

/* -------------------------------------------------------------- removing --- */

/**
 * Forget one file.
 *
 * ⚠️ THE LEDGER ROW GOES FIRST. If the object delete fails, an orphan remains in
 * the bucket — which is money and a cleanup job. If the row went last and the
 * delete succeeded, the row would point at nothing, which is a broken image on
 * somebody's screen and no way to tell it from a bug. Costing money is the
 * better failure.
 */
export async function forgetMedia(db: SqlHandle, objects: ObjectHandle, tenantId: string, id: string): Promise<boolean> {
  const row = await db.first<{ object_key: string }>(`SELECT object_key FROM media WHERE tenant_id = ? AND id = ?`, tenantId, id);
  if (!row) return false;
  await db.run(`DELETE FROM media WHERE tenant_id = ? AND id = ?`, tenantId, id);
  await objects.delete(row.object_key).catch(() => undefined);
  return true;
}
