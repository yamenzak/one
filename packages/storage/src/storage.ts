/**
 * R2 storage accounting (SPEC §3, §11) — the single write/delete path for the
 * MEDIA bucket, plus the per-tenant storage-quota gate.
 *
 * Every object we store funnels through `putMedia`: it enforces the tenant's
 * `storageMb` entitlement (throws `StorageQuotaError` when the incoming bytes
 * would exceed it), writes to R2 with consistent metadata, and records a row in
 * the `media_assets` ledger. Deletes go through `deleteMedia` / `purgePrefix`,
 * which drop the object AND tombstone the ledger row so live usage
 * (SUM(size_bytes) WHERE deleted_at IS NULL) stays accurate. There is otherwise
 * NO other place in the codebase that touches R2 — so nothing escapes accounting.
 */

import type { HasDb, HasMedia } from "@4dl/core";
import { newId, nowIso } from "@4dl/core";

/** Bindings this package reads. */
export type StorageBindings = HasDb & HasMedia;

/**
 * The tenant's byte ceiling, in MEGABYTES, or `-1` for unlimited.
 *
 * Injected rather than read, because a storage quota lives in a BILLING table
 * and an app that never bills its tenants still stores files. Omit it and
 * everything is unlimited — which is the correct default for an internal app,
 * and is why `@4dl/storage` does not depend on `@4dl/billing`.
 */
export type StorageQuota = (env: StorageBindings, tenantId: string) => Promise<number>;

export const UNLIMITED_STORAGE: StorageQuota = async () => -1;

/** Thrown by `putMedia` when a write would push the tenant over its storage
 *  quota. Callers translate it: a hard 413 for user uploads, a graceful skip
 *  (no image) for generated media. */
export class StorageQuotaError extends Error {
  constructor(
    public usedBytes: number,
    public limitBytes: number,
    public incomingBytes: number,
  ) {
    super("storage_quota_exceeded");
    this.name = "StorageQuotaError";
  }
}

const byteLength = (b: ArrayBuffer | Uint8Array): number => (b instanceof Uint8Array ? b.byteLength : b.byteLength);

/** Live bytes stored for a tenant (undeleted ledger rows). */
export async function tenantStorageBytes(db: D1Database, tenantId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COALESCE(SUM(size_bytes), 0) AS n FROM media_assets WHERE tenant_id = ? AND deleted_at IS NULL")
    .bind(tenantId)
    .first<{ n: number }>()
    .catch(() => null);
  return row?.n ?? 0;
}

/** Used + limit bytes for a tenant. `limitBytes < 0` means unlimited. */
export async function storageUsage(
  env: StorageBindings,
  tenantId: string,
  quota: StorageQuota = UNLIMITED_STORAGE,
): Promise<{ usedBytes: number; limitBytes: number }> {
  const [usedBytes, mb] = await Promise.all([tenantStorageBytes(env.DB, tenantId), quota(env, tenantId)]);
  return { usedBytes, limitBytes: mb < 0 ? -1 : mb * 1024 * 1024 };
}

export interface PutMediaInput {
  tenantId: string;
  key: string;
  /**
   * The ledger's identity for this object, when it differs from the R2 key.
   *
   * ⚠️ Only set this for a CONTENT-ADDRESSED key space, and then always.
   *
   * `media_assets.r2_key` is UNIQUE, which is exactly right when the key
   * carries the tenant (`t/<tenant>/…`, which is what Kova writes): one object,
   * one owner, one row, and a re-put updates it in place.
   *
   * Scena's keys are the SHA-256 of the bytes, deliberately — the manifest
   * references an asset by hash, the player caches it immutably forever, and the
   * public track library is one set of objects every workspace draws from. Two
   * workspaces uploading the same file therefore land on the same key, and with
   * `r2_key` as the conflict target the second upload would REWRITE the first
   * one's ledger row: the original owner's bytes would silently stop counting
   * against their quota and start counting against a stranger's.
   *
   * Qualifying the ledger row (`<tenantId>:<hash>`) keeps one row per tenant per
   * object, so usage stays per-tenant while the bucket still stores one copy.
   * The bucket is deduplicated; the accounting is not, which is the correct way
   * round — a workspace pays for what it references, not for what it happened to
   * be first to upload.
   *
   * Defaults to `key`, so an app with tenant-scoped keys never thinks about it.
   */
  ledgerKey?: string;
  bytes: ArrayBuffer | Uint8Array;
  contentType: string;
  /** progress | lab | avatar | brand | food | exercise | label | meal-snap | misc | ai | tts */
  purpose: string;
  /** Client-scoped assets (progress photos, lab files) carry the client id. */
  subjectId?: string | null;
  /** The user who created the object (for the media library's "yours" view). */
  ownerUserId?: string | null;
  /** Enforce the storage quota (throw when over). Default true. System-generated
   *  media that already pre-checked room (AI images, after credits are spent)
   *  passes false so it records + stores without failing mid-flow. */
  enforce?: boolean;
}

/** Upsert a ledger row for a stored object (idempotent on r2_key — a re-put of
 *  the same key, e.g. a regenerated TTS cue, updates size + un-tombstones). */
async function recordAsset(db: D1Database, input: PutMediaInput, sizeBytes: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO media_assets (id, tenant_id, subject_id, owner_user_id, r2_key, purpose, content_type, size_bytes, created_at, deleted_at, deleted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
       ON CONFLICT(r2_key) DO UPDATE SET size_bytes = excluded.size_bytes, content_type = excluded.content_type, purpose = excluded.purpose, subject_id = excluded.subject_id, owner_user_id = COALESCE(media_assets.owner_user_id, excluded.owner_user_id), deleted_at = NULL, deleted_by = NULL`,
    )
    .bind(newId("mda"), input.tenantId, input.subjectId ?? null, input.ownerUserId ?? null, input.ledgerKey ?? input.key, input.purpose, input.contentType, sizeBytes, nowIso())
    .run()
    .catch(() => undefined);
}

/**
 * Store an object in R2 with accounting. Enforces the tenant storage quota
 * (throws StorageQuotaError), writes the object with consistent httpMetadata +
 * customMetadata, and records the ledger row. THE only way to write to MEDIA.
 */
export async function putMedia(
  env: StorageBindings,
  input: PutMediaInput,
  /** Omitting this means UNLIMITED — so an app with a quota must pass it here,
   *  not only to `storageUsage`. Kova binds it once in its adapter. */
  quota: StorageQuota = UNLIMITED_STORAGE,
): Promise<{ key: string; sizeBytes: number }> {
  const sizeBytes = byteLength(input.bytes);
  if (input.enforce !== false) {
    const { usedBytes, limitBytes } = await storageUsage(env, input.tenantId, quota);
    if (limitBytes >= 0 && usedBytes + sizeBytes > limitBytes) {
      throw new StorageQuotaError(usedBytes, limitBytes, sizeBytes);
    }
  }
  await env.MEDIA.put(input.key, input.bytes, {
    httpMetadata: { contentType: input.contentType },
    customMetadata: {
      tenant: input.tenantId,
      purpose: input.purpose,
      ...(input.subjectId ? { subject: input.subjectId } : {}),
      ...(input.ownerUserId ? { uploadedBy: input.ownerUserId } : {}),
    },
  });
  await recordAsset(env.DB, input, sizeBytes);
  return { key: input.key, sizeBytes };
}

/** How a delete treats the two halves — the ledger row and the bytes. */
export interface DeleteMediaOptions {
  /** The ledger's identity for this object, when it is not the R2 key. See
   *  `PutMediaInput.ledgerKey`. */
  ledgerKey?: string;
  /**
   * Tombstone the ledger row but LEAVE the object in the bucket.
   *
   * Only meaningful in a content-addressed key space, where one object can be
   * referenced by more than one tenant. Passing `true` says "this tenant has
   * stopped referencing these bytes" — their quota is released, and somebody
   * else's slide keeps rendering. The caller decides, because only the app
   * knows what references its objects; the ledger is quota accounting, not a
   * reference count.
   */
  keepObject?: boolean;
}

/** Release one object: tombstone its ledger row and (unless the key is shared
 *  and still referenced) delete the bytes. Best-effort — never throws. */
export async function deleteMedia(
  env: StorageBindings,
  key: string,
  deletedBy?: string | null,
  opts: DeleteMediaOptions = {},
): Promise<void> {
  if (!opts.keepObject) await env.MEDIA.delete(key).catch(() => undefined);
  await env.DB
    .prepare("UPDATE media_assets SET deleted_at = ?, deleted_by = ? WHERE r2_key = ? AND deleted_at IS NULL")
    .bind(nowIso(), deletedBy ?? null, opts.ledgerKey ?? key)
    .run()
    .catch(() => undefined);
}

/**
 * Delete EVERY R2 object under a key prefix (paginated) and tombstone the
 * matching ledger rows. Used by the cascade purges (client / tenant / nuclear)
 * — it works off the real bucket listing, so it catches orphans and pre-ledger
 * objects the ledger never recorded. Returns the object count removed.
 */
export async function purgePrefix(env: StorageBindings, prefix: string): Promise<number> {
  let cursor: string | undefined;
  let removed = 0;
  // R2 delete accepts up to 1000 keys per call; list returns up to 1000.
  for (let guard = 0; guard < 10_000; guard++) {
    const listed = await env.MEDIA.list({ prefix, cursor, limit: 1000 });
    const keys = listed.objects.map((o) => o.key);
    if (keys.length) {
      await env.MEDIA.delete(keys).catch(() => undefined);
      removed += keys.length;
    }
    if (!listed.truncated) break;
    cursor = listed.cursor;
  }
  // Tombstone the ledger with substr(), NOT `LIKE 'prefix%'`.
  //
  // D1 enforces SQLITE_LIMIT_LIKE_PATTERN_LENGTH = 50 characters, and it raises
  // only when a row is actually tested — so an empty table passes and a populated
  // one throws `D1_ERROR: LIKE or GLOB pattern too complex` straight into the
  // catch below. A per-client prefix is `t/<32-char tenant>/c/<20-char client>/%`
  // = 59 chars, so this tombstone silently never ran for any real client purge:
  // the R2 objects went, the ledger rows stayed, and their bytes kept counting
  // against the tenant's storage quota forever. Tenant-wide (36) and the nuclear
  // `%` were both under the limit, which is why it hid.
  //
  // substr() also fixes a second latent bug: `_` is a LIKE single-char wildcard
  // and every generated id contains one, so the pattern was matching more keys
  // than intended.
  await env.DB
    .prepare("UPDATE media_assets SET deleted_at = ? WHERE substr(r2_key, 1, ?) = ? AND deleted_at IS NULL")
    .bind(nowIso(), prefix.length, prefix)
    .run()
    .catch((e) => console.error(`[purgePrefix] ledger tombstone failed for ${prefix}:`, e));
  return removed;
}
