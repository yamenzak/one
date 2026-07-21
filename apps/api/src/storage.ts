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

import type { Env } from "./env.js";
import { tenantEntitlements } from "./billing-store.js";
import { newId, nowIso } from "./ids.js";

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
export async function storageUsage(env: Env, tenantId: string): Promise<{ usedBytes: number; limitBytes: number }> {
  const [usedBytes, ent] = await Promise.all([tenantStorageBytes(env.DB, tenantId), tenantEntitlements(env.DB, tenantId)]);
  const mb = ent.quotas.storageMb;
  return { usedBytes, limitBytes: mb < 0 ? -1 : mb * 1024 * 1024 };
}

export interface PutMediaInput {
  tenantId: string;
  key: string;
  bytes: ArrayBuffer | Uint8Array;
  contentType: string;
  /** progress | lab | avatar | brand | food | exercise | label | meal-snap | misc | ai | tts */
  purpose: string;
  /** Client-scoped assets (progress photos, lab files) carry the client id. */
  clientId?: string | null;
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
      `INSERT INTO media_assets (id, tenant_id, client_id, owner_user_id, r2_key, purpose, content_type, size_bytes, created_at, deleted_at, deleted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
       ON CONFLICT(r2_key) DO UPDATE SET size_bytes = excluded.size_bytes, content_type = excluded.content_type, purpose = excluded.purpose, client_id = excluded.client_id, owner_user_id = COALESCE(media_assets.owner_user_id, excluded.owner_user_id), deleted_at = NULL, deleted_by = NULL`,
    )
    .bind(newId("mda"), input.tenantId, input.clientId ?? null, input.ownerUserId ?? null, input.key, input.purpose, input.contentType, sizeBytes, nowIso())
    .run()
    .catch(() => undefined);
}

/**
 * Store an object in R2 with accounting. Enforces the tenant storage quota
 * (throws StorageQuotaError), writes the object with consistent httpMetadata +
 * customMetadata, and records the ledger row. THE only way to write to MEDIA.
 */
export async function putMedia(env: Env, input: PutMediaInput): Promise<{ key: string; sizeBytes: number }> {
  const sizeBytes = byteLength(input.bytes);
  if (input.enforce !== false) {
    const { usedBytes, limitBytes } = await storageUsage(env, input.tenantId);
    if (limitBytes >= 0 && usedBytes + sizeBytes > limitBytes) {
      throw new StorageQuotaError(usedBytes, limitBytes, sizeBytes);
    }
  }
  await env.MEDIA.put(input.key, input.bytes, {
    httpMetadata: { contentType: input.contentType },
    customMetadata: {
      tenant: input.tenantId,
      purpose: input.purpose,
      ...(input.clientId ? { client: input.clientId } : {}),
      ...(input.ownerUserId ? { uploadedBy: input.ownerUserId } : {}),
    },
  });
  await recordAsset(env.DB, input, sizeBytes);
  return { key: input.key, sizeBytes };
}

/** Delete one object + tombstone its ledger row. Best-effort (never throws). */
export async function deleteMedia(env: Env, key: string, deletedBy?: string | null): Promise<void> {
  await env.MEDIA.delete(key).catch(() => undefined);
  await env.DB
    .prepare("UPDATE media_assets SET deleted_at = ?, deleted_by = ? WHERE r2_key = ? AND deleted_at IS NULL")
    .bind(nowIso(), deletedBy ?? null, key)
    .run()
    .catch(() => undefined);
}

/**
 * Delete EVERY R2 object under a key prefix (paginated) and tombstone the
 * matching ledger rows. Used by the cascade purges (client / tenant / nuclear)
 * — it works off the real bucket listing, so it catches orphans and pre-ledger
 * objects the ledger never recorded. Returns the object count removed.
 */
export async function purgePrefix(env: Env, prefix: string): Promise<number> {
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
  await env.DB
    .prepare("UPDATE media_assets SET deleted_at = ? WHERE r2_key LIKE ? AND deleted_at IS NULL")
    .bind(nowIso(), `${prefix}%`)
    .run()
    .catch(() => undefined);
  return removed;
}
