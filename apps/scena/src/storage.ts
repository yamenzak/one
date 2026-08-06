/**
 * Scena's binding of `@4dl/storage` — THE only module that may touch `MEDIA`.
 *
 * Before this file every R2 write in the app was a bare `env.MEDIA.put(hash,
 * bytes)`, in three places, and there was no ledger at all. Three things
 * followed, and all three were live:
 *
 *   • **No quota, and nothing that could enforce one.** R2 has no queryable
 *     metadata, so nothing in the product could answer "how much is this
 *     workspace storing?" — which is why the plan catalog had no storage line
 *     to sell. A free workspace could upload video until the bucket bill did
 *     the complaining.
 *   • **No provenance.** An object carried no tenant, no purpose and no
 *     uploader, so a workspace's erasure could not find its files without
 *     walking the whole bucket. `@4dl/purge` derives erasure from each module's
 *     `scoped` declaration; with no rows there was nothing to derive from.
 *   • **No accounting on delete.** `MEDIA.delete()` straight to the bucket in
 *     `content-routes.ts` — which is only invisible while there is nothing
 *     counting.
 *
 * ── The key space is CONTENT-ADDRESSED, and that is not being changed ───────
 *
 * An object's key is the SHA-256 of its bytes. That is load-bearing three times
 * over: the compiled manifest references an asset by hash, the player caches
 * `/api/assets/<hash>` immutably for months offline, and `library_tracks` is a
 * platform-wide catalog every workspace draws from. Tenant-prefixing the key
 * would break all three, so the ledger row is qualified instead
 * (`<tenantId>:<hash>` — see `ledgerKey` in `@4dl/storage`): one row per tenant
 * per object, one copy in the bucket. The bucket deduplicates; the accounting
 * does not, which is the right way round — a workspace pays for what it
 * references, not for what it happened to be first to upload.
 */

import {
  deleteMedia as deleteMediaAsset,
  putMedia as putMediaAsset,
  storageUsage as storageUsageFor,
  StorageQuotaError,
  type PutMediaInput,
  type StorageBindings,
  type StorageQuota,
} from "@4dl/storage";
import { contentHash } from "@scena/manifest";
import { tenantEntitlements } from "./billing-store.js";
import type { Env } from "./env.js";

export { StorageQuotaError };

/**
 * The ledger's identity for a content-addressed object.
 *
 * A colon, because a tenant id is `t_<hex>` and a hash is hex — neither can
 * contain one, so the qualifier can never be ambiguous with either half.
 */
export const ledgerKeyFor = (tenantId: string, hash: string): string => `${tenantId}:${hash}`;

/**
 * The workspace's storage ceiling in MEGABYTES, from its plan.
 *
 * Injected rather than read inside `@4dl/storage`, because a quota lives in a
 * billing table and that package must not depend on billing. Bound ONCE here
 * and passed at every call site below, because `@4dl/storage`'s default is
 * UNLIMITED — a resolver passed to `storageUsage` but not to `putMedia` reports
 * a limit on the usage screen while enforcing nothing on the write path, which
 * is the failure its README names explicitly.
 */
const quota: StorageQuota = async (_env, tenantId) => {
  const ent = await tenantEntitlements((_env as unknown as Env).DB, tenantId);
  return ent.quotas.storageMb ?? -1;
};

/** Used + limit bytes for a workspace (`limitBytes < 0` = unlimited). */
export function storageUsage(env: Env, tenantId: string): Promise<{ usedBytes: number; limitBytes: number }> {
  return storageUsageFor(env as unknown as StorageBindings, tenantId, quota);
}

/**
 * Store bytes, content-addressed, with accounting. Returns the hash — the key,
 * and what every manifest, slide and library row references.
 *
 * Throws `StorageQuotaError` when the write would push the workspace over its
 * plan's ceiling. `enforce: false` is for media the platform has ALREADY been
 * paid for — a generated asset, after its credits are spent — where failing
 * mid-flow would take the money and withhold the result.
 */
export async function storeAsset(
  env: Env,
  bytes: ArrayBuffer | Uint8Array,
  contentType: string,
  meta: { tenantId: string; purpose: PutMediaInput["purpose"]; ownerUserId?: string | null; enforce?: boolean },
): Promise<string> {
  const buf = bytes instanceof Uint8Array ? (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer) : bytes;
  const hash = await contentHash(buf);
  await putMediaAsset(
    env as unknown as StorageBindings,
    {
      tenantId: meta.tenantId,
      key: hash,
      ledgerKey: ledgerKeyFor(meta.tenantId, hash),
      bytes: buf,
      contentType,
      purpose: meta.purpose,
      ownerUserId: meta.ownerUserId ?? null,
      enforce: meta.enforce,
    },
    quota,
  );
  return hash;
}

/**
 * Release a workspace's claim on an object.
 *
 * `stillReferenced` is the caller's answer to "does anything else point at
 * these bytes?", and it is asked ACROSS tenants on purpose. The key is the
 * content hash, so two workspaces that uploaded the same file share one object;
 * deleting it because one of them tidied up would blank a slide in the other.
 * The ledger row is tombstoned either way, so the quota is released either way.
 */
export function releaseAsset(env: Env, tenantId: string, hash: string, stillReferenced: boolean, deletedBy?: string | null): Promise<void> {
  return deleteMediaAsset(env as unknown as StorageBindings, hash, deletedBy ?? null, {
    ledgerKey: ledgerKeyFor(tenantId, hash),
    keepObject: stillReferenced,
  });
}
