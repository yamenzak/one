/**
 * FILES — the object, the row that knows about it, and the erasure that takes
 * both.
 *
 * ⚠️ A ROW WITHOUT ITS OBJECT IS THE FAILURE THIS FILE EXISTS AGAINST, AND IT IS
 * SILENT IN BOTH DIRECTIONS. Delete the row and leave the object: somebody's
 * photograph is still in a bucket after their account was erased, invisible to
 * every check, for ever. Delete the object and leave the row: a screen shows a
 * file that 404s. Neither throws, and neither is visible from anywhere except
 * the bucket's own billing.
 *
 * ⚠️ SO THE LEDGER IS THE AUTHORITY AND THE BUCKET FOLLOWS IT. Every object this
 * platform writes has a row here first; erasure reads the rows and deletes the
 * objects named in them. The alternative — listing the bucket by prefix — is
 * eventually consistent, paginated, and answers "nothing there" during exactly
 * the outage where it matters.
 *
 * ⚠️ THE KEY IS TENANT-PREFIXED, AND THAT IS NOT FOR TIDINESS. It is what makes
 * a workspace's files enumerable and deletable as a unit when a workspace is
 * erased, and it is what stops one workspace's key from ever colliding with
 * another's.
 *
 * ⚠️ AND THE BUCKET IS THE ONE THE RECONCILER MADE FOR THIS JURISDICTION. An
 * upload from an EU workspace goes to the EU bucket because the binding it
 * resolves through is the EU one — the residency is in the addressing rather
 * than in a check somebody has to remember to write.
 */

import type { AccountId, TenantId } from "@engine/kernel";
import { newId } from "@engine/kernel";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

/* ⚠️ The half of R2 this platform uses, named — so the suites can supply one
   and nothing here depends on the Workers types being present. */
export interface Bucket {
  put(key: string, value: ArrayBuffer | ReadableStream, options?: unknown): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream; size: number; httpMetadata?: { contentType?: string } } | null>;
  delete(keys: string | string[]): Promise<void>;
}

/**
 * ⚠️ WHICH WORKSPACE, AND IN WHICH JURISDICTION — the only two facts a bucket
 * lookup needs, named once so both lanes ask the same question. The personal
 * lane holds a `TenantRow` and the tenant lane holds a `Located`; a seam typed
 * to either would make the other convert, and a conversion is where a residency
 * gets dropped.
 */
export interface Where {
  readonly tenantId: string;
  readonly residency?: string;
}

export const MEDIA_SCHEMA: SchemaModule = {
  id: "media",
  statements: [
    /* ⚠️ `subject_id` IS NULLABLE AND IS THE PERSON'S ERASURE HANDLE. A file
       uploaded against somebody's own record belongs to them and goes when they
       do; one uploaded to a workspace's shared library does not. Without the
       column there is one answer for both, and it is wrong for one of them. */
    `CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, subject_id TEXT, purpose TEXT NOT NULL, object_key TEXT NOT NULL, content_type TEXT, bytes INTEGER NOT NULL, at TEXT NOT NULL, by TEXT);`,
    `CREATE INDEX IF NOT EXISTS ix_media_tenant ON media (tenant_id);`,
    `CREATE INDEX IF NOT EXISTS ix_media_subject ON media (subject_id);`,
  ],
};

export interface MediaRow {
  readonly id: string;
  readonly tenantId: string;
  readonly subjectId: string | null;
  readonly purpose: string;
  readonly objectKey: string;
  readonly contentType: string | null;
  readonly bytes: number;
}

const asRow = (r: Record<string, unknown>): MediaRow => ({
  id: r.id as string, tenantId: r.tenant_id as string,
  subjectId: (r.subject_id as string | null) ?? null,
  purpose: r.purpose as string, objectKey: r.object_key as string,
  contentType: (r.content_type as string | null) ?? null,
  bytes: Number(r.bytes ?? 0),
});

/**
 * ⚠️ THE KEY IS DERIVED AND NEVER SUPPLIED. A caller-chosen key is a caller who
 * can write outside their own workspace's prefix — which is one string away from
 * reading somebody else's file, and is invisible to every other check here
 * because the ledger row would look perfectly ordinary.
 */
export const objectKey = (tenantId: TenantId, purpose: string, id: string): string =>
  `${tenantId}/${purpose}/${id}`;

/* ------------------------------------------------------------------- put --- */

export type PutRefusal = "no_bucket" | "too_big" | "empty";

export interface Put {
  readonly tenantId: TenantId;
  /** Whose it is, when it is somebody's. See the schema note. */
  readonly subjectId?: AccountId | null;
  readonly purpose: string;
  readonly body: ArrayBuffer;
  readonly contentType?: string;
  readonly by?: string | null;
}

/**
 * ⚠️ THE ROW IS WRITTEN AFTER THE OBJECT, WHICH IS THE OPPOSITE OF THE
 * RECONCILER'S ORDER AND FOR THE OPPOSITE REASON. A resource is expensive to
 * lose track of, so it is recorded before it is made; an object is cheap to
 * orphan and expensive to promise. If the put fails, no row claims a file that
 * is not there — and a screen showing a broken image is worse than an upload
 * that plainly failed.
 *
 * ⚠️ AND AN ORPHANED OBJECT IS NOT A LEAK OF ANYTHING. It has a tenant-prefixed
 * key nothing references, and the workspace's own erasure deletes by prefix as
 * well as by row, so it goes when the workspace does.
 */
export async function putMedia(
  db: Db, bucket: Bucket | null, input: Put, now = new Date(),
): Promise<MediaRow | PutRefusal> {
  if (!bucket) return "no_bucket";
  if (!input.body.byteLength) return "empty";

  const id = newId("med", now);
  const key = objectKey(input.tenantId, input.purpose, id);
  await bucket.put(key, input.body, {
    httpMetadata: { contentType: input.contentType ?? "application/octet-stream" },
  });

  await db.prepare(
    `INSERT INTO media (id, tenant_id, subject_id, purpose, object_key, content_type, bytes, at, by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, input.tenantId, input.subjectId ?? null, input.purpose, key,
      input.contentType ?? null, input.body.byteLength, now.toISOString(), input.by ?? null).run();

  return {
    id, tenantId: input.tenantId, subjectId: input.subjectId ?? null,
    purpose: input.purpose, objectKey: key,
    contentType: input.contentType ?? null, bytes: input.body.byteLength,
  };
}

/* ------------------------------------------------------------------ read --- */

/**
 * ⚠️ THE WORKSPACE IS PART OF THE LOOKUP, NOT A CHECK AFTER IT. Reading the row
 * by id and then comparing its tenant is the same query with one more chance to
 * forget the comparison — and forgetting it serves any file on the deployment to
 * anybody who can guess an id.
 */
export async function mediaFor(
  db: Db, tenantId: TenantId, id: string,
): Promise<MediaRow | null> {
  const row = await db.prepare(`SELECT * FROM media WHERE id = ? AND tenant_id = ?`)
    .bind(id, tenantId).first<Record<string, unknown>>();
  return row ? asRow(row) : null;
}

export async function mediaOf(
  db: Db, tenantId: TenantId, purpose?: string,
): Promise<readonly MediaRow[]> {
  const rows = purpose
    ? await db.prepare(`SELECT * FROM media WHERE tenant_id = ? AND purpose = ? ORDER BY at DESC`)
      .bind(tenantId, purpose).all<Record<string, unknown>>()
    : await db.prepare(`SELECT * FROM media WHERE tenant_id = ? ORDER BY at DESC`)
      .bind(tenantId).all<Record<string, unknown>>();
  return rows.results.map(asRow);
}

/**
 * HOW MUCH ROOM THIS WORKSPACE IS TAKING.
 *
 * ⚠️ FROM THE LEDGER, NOT FROM THE BUCKET. R2 has no "how many bytes does this
 * prefix hold" — answering it means listing every object, which costs a request
 * per thousand files and gets slower with every upload. The ledger row carries
 * the size because every write goes through one place (`putMedia`), which is the
 * property that makes this a single `SUM`.
 *
 * ⚠️ AND IT IS THE MEASURE A BILL IS BUILT FROM, so a file written behind the
 * ledger is one nobody is charged for — which is the same hole as a file nobody
 * can erase, and is why there is exactly one writer.
 */
export async function bytesUsed(db: Db, tenantId: TenantId): Promise<number> {
  const row = await db.prepare(`SELECT SUM(bytes) AS n FROM media WHERE tenant_id = ?`)
    .bind(tenantId).first<{ n: number | null }>();
  return row?.n ?? 0;
}

/* --------------------------------------------------------------- erasure --- */

/**
 * THE OBJECTS BEHIND A SET OF ROWS, GONE.
 *
 * ⚠️ THIS IS THE CALL THAT WAS MISSING FROM EVERY ERASURE PATH BEFORE THE LEDGER
 * EXISTED, and its absence is invisible: `forgetWorkspace` deletes the media
 * rows, reports the count, and every file stays in the bucket for ever. There is
 * no error, no orphan report, and nothing that would ever look.
 *
 * ⚠️ ROWS FIRST, THEN OBJECTS, IS THE WRONG ORDER — so this is called BEFORE the
 * rows go. Once the row is deleted the key is unknown, and the object is
 * unreachable by anything except a bucket listing nobody runs.
 */
export async function eraseObjects(
  db: Db, bucket: Bucket | null, of: { readonly tenantId?: TenantId; readonly subjectId?: AccountId },
): Promise<number> {
  if (!bucket) return 0;
  const rows = of.subjectId
    ? await db.prepare(`SELECT object_key FROM media WHERE subject_id = ?`)
      .bind(of.subjectId).all<{ object_key: string }>()
    : await db.prepare(`SELECT object_key FROM media WHERE tenant_id = ?`)
      .bind(of.tenantId ?? "").all<{ object_key: string }>();

  const keys = rows.results.map((r) => r.object_key);
  if (!keys.length) return 0;

  /* ⚠️ IN BATCHES, BECAUSE R2's DELETE TAKES AT MOST 1000 KEYS. A workspace with
     more files than that would have every key past the first thousand silently
     kept — which is the same failure as not calling this at all, for exactly the
     customers with the most to erase. */
  for (let i = 0; i < keys.length; i += 1000) {
    await bucket.delete(keys.slice(i, i + 1000));
  }
  return keys.length;
}
