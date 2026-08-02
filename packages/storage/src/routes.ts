/**
 * UPLOAD, METER, READ — the three media routes, and the security lessons in them.
 *
 * `@4dl/storage` already owned the R2 put, the media ledger and the quota gate.
 * It did not own the ROUTES, so one app wrote them and the other had an R2
 * bucket with no user-facing way to put anything in it. What made this worth
 * sharing is not the plumbing — it is that four of the rules below are things
 * that went wrong in production, and none of them is obvious from a blank page.
 *
 * ── 1. `purpose` is a PATH SEGMENT the caller controls ──────────────────────
 *
 * It is spliced straight into the R2 key, so it must be a CLOSED SET, not free
 * text. Two things went wrong while it was unvalidated:
 *
 *   - `purpose=brand` put an arbitrary upload under the one publicly-readable
 *     prefix, which the read route serves unauthenticated with
 *     `cache-control: public` — free hosting of any image, pdf or mp4 on the
 *     tenant's white-label domain.
 *   - `purpose=c/<victim>/progress` forged a path into ANOTHER subject's key
 *     namespace, on the tenant's storage quota.
 *
 * `publicPurpose` is therefore separate from the set and gated on its own
 * predicate: it is the only prefix anyone can read without a session.
 *
 * ── 2. No `image/svg+xml`, ever ─────────────────────────────────────────────
 *
 * An SVG served same-origin can carry `<script>` and runs in the app's origin —
 * stored XSS with a friendly file picker in front of it. Raster images, pdf and
 * video only.
 *
 * ── 3. The size check is on the REAL bytes ──────────────────────────────────
 *
 * `file.size` is a client-supplied pre-check, useful for a fast refusal and
 * worth nothing as a limit. The quota gate weighs the buffer actually read.
 *
 * ── 4. Defence in depth on the way OUT ──────────────────────────────────────
 *
 * `nosniff`, a `default-src 'none'; sandbox` CSP, and `content-disposition:
 * attachment` for anything that is not an inline-safe raster. A crafted file
 * that gets past the type check still cannot execute as a document in the
 * origin.
 */

import { Hono } from "hono";
import type { Context, Env as HonoEnv } from "hono";
import { newId, type HasDb } from "@4dl/core";

/** The bindings these routes read: D1 for the ledger, R2 for the objects. */
export type MediaRouteEnv = { Bindings: HasDb & { MEDIA: R2Bucket } };

const mb = (bytes: number): number => Math.round((bytes / (1024 * 1024)) * 10) / 10;

/** Rule 2 — see the header. No SVG. */
const ALLOWED = /^(image\/(png|jpe?g|webp|gif)|application\/pdf|video\/(mp4|webm))$/;
const INLINE_SAFE = /^image\/(png|jpe?g|webp|gif)$/;

export interface MediaActor {
  tenantId: string;
  userId: string;
}

/** What a subject-scoped upload/read has to prove. */
export type SubjectAccess = { ok: true; subjectId: string } | { ok: false; response: Response };

export interface MediaRouteDeps<E extends MediaRouteEnv & HonoEnv> {
  actorOf: (c: Context<E>) => MediaActor | null;
  /**
   * The closed set of key prefixes an upload may name. Rule 1: anything not in
   * here is refused, because it becomes a path segment.
   */
  purposes: ReadonlySet<string>;
  /**
   * The one PUBLICLY-readable purpose, if the app has one (a logo on a login
   * screen, a PWA icon). Kept out of `purposes` deliberately so writing it needs
   * its own check — see `canWritePublic`.
   */
  publicPurpose?: string;
  /** May this caller write the public prefix? Typically owner-only. */
  canWritePublic?: (c: Context<E>) => boolean;
  /**
   * Row-level scope for subject-owned media. Absent means the app has no
   * per-subject media, and every key is tenant-scoped.
   */
  subjectAccess?: (c: Context<E>, subjectId: string) => Promise<SubjectAccess>;
  /** May this caller read the tenant's storage METER? Typically owner-only. */
  canReadUsage?: (c: Context<E>) => boolean;
  /** Write the object + ledger row, gated on the tenant's quota. */
  putMedia: (
    c: Context<E>,
    input: { tenantId: string; key: string; bytes: ArrayBuffer; contentType: string; purpose: string; subjectId: string | null; ownerUserId: string },
  ) => Promise<unknown>;
  /** Used vs. allowed bytes. `-1` is unlimited. */
  storageUsage: (c: Context<E>, tenantId: string) => Promise<{ usedBytes: number; limitBytes: number }>;
  /** Recognise the quota refusal so it becomes a 413 with numbers in it. */
  isQuotaError: (e: unknown) => e is { usedBytes: number; limitBytes: number };
  /** Per-file ceiling. Default 15 MB. */
  maxBytes?: number;
  /**
   * The key segment that marks a subject-scoped prefix: `t/<tenant>/<seg>/<id>/`.
   *
   * Configurable because it is baked into every key ever written and into the
   * purge sweep, so an app with live objects cannot change it. Default `s`; the
   * app that predates this package uses `c` and can therefore adopt these routes
   * without migrating a single key.
   */
  subjectSegment?: string;
}

export function mediaRoutes<E extends MediaRouteEnv & HonoEnv>(deps: MediaRouteDeps<E>) {
  const MAX_BYTES = deps.maxBytes ?? 15 * 1024 * 1024;
  const publicPrefix = deps.publicPurpose;
  const seg = deps.subjectSegment ?? "s";

  return new Hono<E>()
    /**
     * Upload a private asset; returns the storage key. Pass `subjectId` for
     * subject-owned media so reads are scope-gated through a per-subject key
     * prefix; tenant assets omit it.
     */
    .post("/media/upload", async (c) => {
      const actor = deps.actorOf(c);
      if (!actor) return c.json({ error: "unauthenticated" }, 401);

      const form = await c.req.formData().catch(() => null);
      const raw = form?.get("file");
      const purpose = String(form?.get("purpose") ?? "misc");

      // Rule 1 — the closed set, and the public prefix behind its own check.
      if (publicPrefix && purpose === publicPrefix) {
        if (!deps.canWritePublic?.(c)) return c.json({ error: "forbidden" }, 403);
      } else if (!deps.purposes.has(purpose)) {
        return c.json({ error: "invalid purpose" }, 400);
      }

      // Duck-typed File — workers-types does not expose the File constructor.
      const file = raw as { size?: number; type?: string; name?: string; arrayBuffer?: () => Promise<ArrayBuffer> } | null;
      if (!file || typeof file.arrayBuffer !== "function") return c.json({ error: "file required" }, 400);
      if ((file.size ?? 0) > MAX_BYTES) return c.json({ error: `file too large (${mb(MAX_BYTES)} MB max)` }, 413);
      if (!ALLOWED.test(file.type ?? "")) return c.json({ error: "unsupported type" }, 415);

      const ext = ((file.name ?? "").split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
      const rawSubject = form?.get("subjectId");
      const subjectId = rawSubject ? String(rawSubject) : null;

      let prefix = `t/${actor.tenantId}/${purpose}`;
      if (subjectId) {
        if (!deps.subjectAccess) return c.json({ error: "invalid purpose" }, 400);
        const access = await deps.subjectAccess(c, subjectId);
        if (!access.ok) return access.response;
        prefix = `t/${actor.tenantId}/${seg}/${access.subjectId}/${purpose}`;
      }
      const key = `${prefix}/${newId("m")}.${ext}`;

      // Rule 3 — weigh the bytes actually read, not the ones claimed.
      const bytes = await file.arrayBuffer();
      try {
        await deps.putMedia(c, {
          tenantId: actor.tenantId,
          key,
          bytes,
          contentType: file.type ?? "application/octet-stream",
          purpose,
          subjectId,
          ownerUserId: actor.userId,
        });
      } catch (e) {
        if (deps.isQuotaError(e)) {
          return c.json(
            {
              error: "storage_full",
              message: `Storage is full (${mb(e.usedBytes)} MB of ${mb(e.limitBytes)} MB used). Delete some media or upgrade the plan.`,
              usedMb: mb(e.usedBytes),
              limitMb: mb(e.limitBytes),
            },
            413,
          );
        }
        throw e;
      }
      return c.json({ key }, 201);
    })

    /**
     * The tenant's storage meter — used bytes against the plan's ceiling.
     *
     * Gated, because the meter reports a PLAN limit: that is the tenant's
     * business position, not a fact about the viewer's own files. Somebody
     * uploading into a full tenant still gets a clear 413 with numbers from the
     * route above; they do not need the ledger to learn the upload failed.
     */
    .get("/storage-usage", async (c) => {
      const actor = deps.actorOf(c);
      if (!actor) return c.json({ error: "unauthenticated" }, 401);
      if (deps.canReadUsage && !deps.canReadUsage(c)) return c.json({ error: "forbidden" }, 403);
      const { usedBytes, limitBytes } = await deps.storageUsage(c, actor.tenantId);
      return c.json({
        usedBytes,
        limitBytes,
        usedMb: mb(usedBytes),
        limitMb: limitBytes < 0 ? -1 : mb(limitBytes),
        unlimited: limitBytes < 0,
        pct: limitBytes > 0 ? Math.min(100, Math.round((usedBytes / limitBytes) * 100)) : 0,
      });
    })

    /**
     * Authed proxy read. Same-tenant callers only; subject-scoped keys are
     * additionally gated per subject, so holding a key is not access.
     */
    .get("/media/:key{.+}", async (c) => {
      const key = c.req.param("key");
      // The public prefix, if the app has one: served with no session so a login
      // screen, a storefront and a PWA icon can load it.
      const isPublic = !!publicPrefix && new RegExp(`^t/[^/]+/${publicPrefix}/`).test(key);
      if (!isPublic) {
        const actor = deps.actorOf(c);
        if (!actor) return c.json({ error: "unauthenticated" }, 401);
        // Tenant isolation: the key must belong to the caller's tenant.
        if (!key.startsWith(`t/${actor.tenantId}/`)) return c.json({ error: "forbidden" }, 403);
        const scoped = key.match(new RegExp(`^t/[^/]+/${seg}/([^/]+)/`));
        if (scoped && deps.subjectAccess) {
          const access = await deps.subjectAccess(c, scoped[1]!);
          if (!access.ok) return access.response;
        }
      }
      const obj = await c.env.MEDIA.get(key);
      if (!obj) return c.json({ error: "not found" }, 404);
      const ct = obj.httpMetadata?.contentType || "application/octet-stream";
      // Rule 4 — see the header.
      const headers = new Headers();
      headers.set("content-type", ct);
      headers.set("cache-control", isPublic ? "public, max-age=86400" : "private, max-age=3600");
      headers.set("x-content-type-options", "nosniff");
      headers.set("content-security-policy", "default-src 'none'; sandbox");
      if (!INLINE_SAFE.test(ct)) headers.set("content-disposition", "attachment");
      return new Response(obj.body, { headers });
    });
}
