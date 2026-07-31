/**
 * OBJECT STORAGE, bound to the plan's `storageMb` quota.
 *
 * `@4dl/storage` defaults to UNLIMITED because a storage ceiling lives in a
 * billing table and an app that never bills still stores files. That default is
 * also a trap — omitting the resolver silently disables enforcement rather than
 * failing — so the binding happens exactly ONCE, here, and every call site
 * imports from this module rather than from the package.
 */

import {
  putMedia as put,
  storageUsage as usage,
  type PutMediaInput,
  type StorageBindings,
  type StorageQuota,
} from "@4dl/storage";
import { tenantEntitlements } from "./entitlements.js";

export { StorageQuotaError, deleteMedia, purgePrefix, tenantStorageBytes } from "@4dl/storage";
export type { PutMediaInput };

const quota: StorageQuota = async (env, tenantId) =>
  (await tenantEntitlements(env.DB, tenantId)).quotas.storageMb;

export const storageUsage = (env: StorageBindings, tenantId: string) => usage(env, tenantId, quota);
export const putMedia = (env: StorageBindings, input: PutMediaInput) => put(env, input, quota);
