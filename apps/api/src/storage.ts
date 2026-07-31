/**
 * Kova's media storage — `@4dl/storage`, bound to the plan's `storageMb` quota.
 *
 * The package deliberately defaults to UNLIMITED: a storage ceiling lives in a
 * billing table, and an app that never bills its tenants still stores files.
 * That default is also a trap — omitting the resolver silently disables
 * enforcement rather than failing — so the binding happens exactly once, here,
 * and every call site imports from this module.
 */

import {
  putMedia as put,
  storageUsage as usage,
  type PutMediaInput,
  type StorageBindings,
  type StorageQuota,
} from "@4dl/storage";
import { tenantEntitlements } from "./billing-store.js";

export { StorageQuotaError, deleteMedia, purgePrefix, tenantStorageBytes } from "@4dl/storage";
export type { PutMediaInput };

/** Megabytes the tenant's plan allows, or -1 for unlimited. */
const kovaQuota: StorageQuota = async (env, tenantId) =>
  (await tenantEntitlements(env.DB, tenantId)).quotas.storageMb;

export const storageUsage = (env: StorageBindings, tenantId: string) => usage(env, tenantId, kovaQuota);

export const putMedia = (env: StorageBindings, input: PutMediaInput) => put(env, input, kovaQuota);
