/**
 * THE THREE MEDIA ROUTES — upload, the storage meter, the authed read.
 *
 * All three are `@4dl/storage`'s. What is the app's is the closed `purpose` set,
 * because a purpose is a PATH SEGMENT: it becomes part of the R2 key, so an
 * open set is an open namespace inside the tenant's own prefix.
 *
 * ── Why the read is AUTHED, and what the one public prefix is for ───────────
 *
 * A tenant's uploads are its own. `GET /api/media/:key` resolves the ledger row,
 * checks the caller belongs to that tenant, and only then streams the object —
 * which is the whole reason the bucket has no public binding.
 *
 * `publicPurpose` is the single exception, and it exists because a logo has to
 * render on a SIGN-IN screen, where by definition there is no session. It is
 * owner-only to write, because an unguarded public prefix is free file hosting
 * on the tenant's own domain.
 *
 * ── `subjectAccess` is absent, deliberately ────────────────────────────────
 *
 * Every key here is tenant-scoped. Without a `subjectAccess` check the package
 * REFUSES a `subjectId` in the form rather than silently honouring it — so an
 * app that grows subject-scoped media has to add the check to get the feature,
 * which is the correct order.
 */

import { mediaRoutes as sharedMediaRoutes } from "@4dl/storage";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { CREATOR_ROLE } from "./access.js";
import { StorageQuotaError, putMedia, storageUsage } from "./storage.js";
import type { Env } from "./env.js";

/** What a tenant may attach, and nothing else. Rename these to the product's. */
const PURPOSES = new Set(["document", "photo", "misc"]);

/** The one publicly-readable prefix: the tenant's logo, on a login screen. */
const BRAND = "brand";

export const mediaRoutes = sharedMediaRoutes<AppEnv>({
  actorOf: (c) => {
    const who = requireTenant(c);
    return who ? { tenantId: who.tenantId, userId: who.userId } : null;
  },
  purposes: PURPOSES,
  publicPurpose: BRAND,
  canWritePublic: (c) => c.get("role") === CREATOR_ROLE,
  // The storage METER reports a plan ceiling — the tenant's business position,
  // not a fact about the viewer's files.
  canReadUsage: (c) => c.get("role") === CREATOR_ROLE,
  putMedia: (c, input) => putMedia(c.env as Env, input),
  storageUsage: (c, tenantId) => storageUsage(c.env as Env, tenantId),
  isQuotaError: (e): e is StorageQuotaError => e instanceof StorageQuotaError,
});
