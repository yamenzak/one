/**
 * Media (SPEC §3, §11) — R2 upload + authed proxy. Progress photos and lab
 * files are PRIVATE by default: never public-bucket, always served through an
 * assignment-checked proxy. Keys are tenant-prefixed (t/<tenant>/…).
 *
 * Upload returns a key; the client stores the key (e.g. on a lab test or a
 * check-in photo) and reads it back only through /api/media/:key which
 * re-checks access.
 */

import { Hono } from "hono";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { requireClientAccess } from "./clients.js";
import { putMedia, StorageQuotaError, storageUsage } from "./storage.js";
import { newId } from "./ids.js";

const mb = (bytes: number): number => Math.round((bytes / (1024 * 1024)) * 10) / 10;

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
// No image/svg+xml: an SVG served same-origin can carry <script> and run in the
// app's origin (stored XSS). Raster images + pdf + video only.
const ALLOWED = /^(image\/(png|jpe?g|webp|gif)|application\/pdf|video\/(mp4|webm))$/;
const INLINE_SAFE = /^image\/(png|jpe?g|webp|gif)$/;

// `purpose` is spliced straight into the R2 key, so it is a path segment the
// caller controls — it MUST be a closed set, not free text. Two things went wrong
// while it was unvalidated: `purpose=brand` put a client's arbitrary upload under
// t/<tenant>/brand/… , which route-guard + the read proxy both serve PUBLICLY and
// unauthenticated with `cache-control: public` (free hosting of any image/pdf/mp4
// on the studio's white-label domain), and `purpose=c/<victim>/progress` forged a
// path into another client's key namespace on the tenant's storage quota.
const PURPOSES = new Set(["progress", "lab", "avatar", "food", "exercise", "label", "meal-snap", "misc"]);
// `brand` is the one publicly-readable prefix, so it is not in the general set:
// only the owner (the white-label/branding surface, settings:manage) may write it.
const BRAND_PURPOSE = "brand";

export const mediaRoutes = new Hono<AppEnv>()
  // Upload a private asset. Returns the storage key. Pass `clientId` for
  // client-owned media (progress photos, lab files) so reads are assignment-
  // gated via a per-client key prefix; tenant assets (avatars, branding) omit it.
  .post("/media/upload", async (c) => {
    const who = requireTenant(c)!;
    const form = await c.req.formData().catch(() => null);
    const raw = form?.get("file");
    const purpose = String(form?.get("purpose") ?? "misc");
    if (purpose === BRAND_PURPOSE) {
      if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    } else if (!PURPOSES.has(purpose)) {
      return c.json({ error: "invalid purpose" }, 400);
    }
    // Duck-typed File (workers-types doesn't expose the File constructor).
    const file = raw as { size?: number; type?: string; name?: string; arrayBuffer?: () => Promise<ArrayBuffer> } | null;
    if (!file || typeof file.arrayBuffer !== "function") return c.json({ error: "file required" }, 400);
    if ((file.size ?? 0) > MAX_BYTES) return c.json({ error: "file too large (15 MB max)" }, 413);
    if (!ALLOWED.test(file.type ?? "")) return c.json({ error: "unsupported type" }, 415);

    const ext = ((file.name ?? "").split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    // Client-scoped key when a clientId is supplied — but only after confirming
    // the uploader may act for that client.
    const clientId = form?.get("clientId") ? String(form.get("clientId")) : null;
    let prefix = `t/${who.tenantId}/${purpose}`;
    if (clientId) {
      const access = await requireClientAccess(c, clientId);
      if ("response" in access) return access.response;
      prefix = `t/${who.tenantId}/c/${access.client.id}/${purpose}`;
    }
    const key = `${prefix}/${newId("m")}.${ext}`;
    // Measure the REAL bytes (client-supplied file.size is only a pre-check) and
    // gate on the tenant's storage quota before writing.
    const bytes = await file.arrayBuffer();
    try {
      await putMedia(c.env, { tenantId: who.tenantId, key, bytes, contentType: file.type ?? "application/octet-stream", purpose, subjectId: clientId, ownerUserId: who.userId });
    } catch (e) {
      if (e instanceof StorageQuotaError) {
        return c.json({ error: "storage_full", message: `Your studio's ${mb(e.limitBytes)} MB storage is full (${mb(e.usedBytes)} MB used). Delete some media or upgrade your plan.`, usedMb: mb(e.usedBytes), limitMb: mb(e.limitBytes) }, 413);
      }
      throw e;
    }
    return c.json({ key }, 201);
  })

  // The tenant's storage meter — used bytes vs the plan's storageMb ceiling.
  // Drives the media-library header + the storage-full nudges.
  .get("/storage-usage", async (c) => {
    // Owner-only. The meter reports a PLAN limit, so it is the studio's business
    // position, not a fact about the viewer's own files. A client uploading into a
    // full studio still gets a clear 413 from the upload route — they do not need
    // the ledger to be told the upload failed.
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    const who = requireTenant(c)!;
    const { usedBytes, limitBytes } = await storageUsage(c.env, who.tenantId);
    return c.json({ usedBytes, limitBytes, usedMb: mb(usedBytes), limitMb: limitBytes < 0 ? -1 : mb(limitBytes), unlimited: limitBytes < 0, pct: limitBytes > 0 ? Math.min(100, Math.round((usedBytes / limitBytes) * 100)) : 0 });
  })

  // Authed proxy read. Same-tenant callers only; client-scoped keys are
  // additionally gated per client assignment (a client / non-assigned trainer
  // must not read another client's photos or lab files just by holding the key).
  .get("/media/:key{.+}", async (c) => {
    const key = c.req.param("key");
    // Brand assets (logo, app icon) are public — served without a session so the
    // login screen, storefront, favicon, and PWA-install icons can load them.
    const isBrand = /^t\/[^/]+\/brand\//.test(key);
    if (!isBrand) {
      const who = requireTenant(c);
      if (!who) return c.json({ error: "unauthenticated" }, 401);
      // Tenant isolation: the key must belong to the caller's tenant.
      if (!key.startsWith(`t/${who.tenantId}/`)) return c.json({ error: "forbidden" }, 403);
      const scoped = key.match(/^t\/[^/]+\/c\/([^/]+)\//);
      if (scoped) {
        const access = await requireClientAccess(c, scoped[1]!);
        if ("response" in access) return access.response;
      }
    }
    const obj = await c.env.MEDIA.get(key);
    if (!obj) return c.json({ error: "not found" }, 404);
    const ct = obj.httpMetadata?.contentType || "application/octet-stream";
    const headers = new Headers();
    headers.set("content-type", ct);
    headers.set("cache-control", isBrand ? "public, max-age=86400" : "private, max-age=3600");
    // Defence-in-depth: never sniff, sandbox on direct navigation, and force a
    // download for anything that isn't an inline-safe raster image so a crafted
    // file can't execute as a document in our origin.
    headers.set("x-content-type-options", "nosniff");
    headers.set("content-security-policy", "default-src 'none'; sandbox");
    if (!INLINE_SAFE.test(ct)) headers.set("content-disposition", "attachment");
    return new Response(obj.body, { headers });
  });
