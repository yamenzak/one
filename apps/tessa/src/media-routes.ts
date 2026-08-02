/**
 * MEDIA — Tessa's binding of `@4dl/storage`'s routes.
 *
 * Tessa has bound an R2 bucket since it shipped and written to it from exactly
 * one place: `@4dl/ai`'s media hook, for the vision lane. There was no way for a
 * person to upload anything, which left one concrete hole — `/cycles/:id/end`
 * accepts an `evidenceKey` for the autoclave's printout, and nothing could
 * produce a key. The photo of the printout is the primary physical evidence a
 * load passed; an inspector asks for it by name.
 *
 * The routes bring their own security lessons (a closed `purpose` set, no SVG,
 * the real-bytes size check, the response hardening) — read the package header
 * before touching any of them.
 *
 * ── What is Tessa's ─────────────────────────────────────────────────────────
 *
 * The PURPOSES, and there are few on purpose. Every one is a path segment, so
 * the set is the security boundary, and TESSA.md Rule 1 keeps anything about a
 * person out of this app entirely — there is no avatar, no patient photo, and no
 * subject-scoped media at all. Every key here is tenant-scoped, which is why no
 * `subjectAccess` is supplied: without it a `subjectId` in the form is refused
 * rather than silently honoured.
 */

import { mediaRoutes as sharedMediaRoutes } from "@4dl/storage";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { CREATOR_ROLE } from "./access.js";
import { StorageQuotaError, putMedia, storageUsage } from "./storage.js";
import type { Env } from "./env.js";

/**
 * What a centre may attach, and nothing else.
 *
 *   evidence  the autoclave printout, photographed. The physical proof behind a
 *             cycle's `physical_ok`, and what an inspection asks to see.
 *   document  a procedure or a datasheet, for the AI summariser.
 *   misc      everything that is genuinely neither.
 */
const PURPOSES = new Set(["evidence", "document", "misc"]);

/** The one publicly-readable prefix: the centre's logo, on a login screen. */
const BRAND = "brand";

export const mediaRoutes = sharedMediaRoutes<AppEnv>({
  actorOf: (c) => {
    const who = requireTenant(c);
    return who ? { tenantId: who.tenantId, userId: who.userId } : null;
  },
  purposes: PURPOSES,
  publicPurpose: BRAND,
  // Owner-only, because this prefix is served with no session at all. An
  // unguarded public prefix is free hosting on the centre's own domain.
  canWritePublic: (c) => c.get("role") === CREATOR_ROLE,
  // The storage METER reports a plan ceiling — the centre's business position,
  // not a fact about the viewer's files.
  canReadUsage: (c) => c.get("role") === CREATOR_ROLE,
  putMedia: (c, input) => putMedia(c.env as Env, input),
  storageUsage: (c, tenantId) => storageUsage(c.env as Env, tenantId),
  isQuotaError: (e): e is StorageQuotaError => e instanceof StorageQuotaError,
});
