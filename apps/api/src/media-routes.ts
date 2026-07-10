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
import { newId } from "./ids.js";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED = /^(image\/(png|jpe?g|webp|gif|svg\+xml)|application\/pdf|video\/(mp4|webm))$/;

export const mediaRoutes = new Hono<AppEnv>()
  // Upload a private asset. Returns the storage key.
  .post("/media/upload", async (c) => {
    const who = requireTenant(c)!;
    const form = await c.req.formData().catch(() => null);
    const raw = form?.get("file");
    const purpose = String(form?.get("purpose") ?? "misc"); // progress | lab | avatar | misc
    // Duck-typed File (workers-types doesn't expose the File constructor).
    const file = raw as { size?: number; type?: string; name?: string; arrayBuffer?: () => Promise<ArrayBuffer> } | null;
    if (!file || typeof file.arrayBuffer !== "function") return c.json({ error: "file required" }, 400);
    if ((file.size ?? 0) > MAX_BYTES) return c.json({ error: "file too large (15 MB max)" }, 413);
    if (!ALLOWED.test(file.type ?? "")) return c.json({ error: "unsupported type" }, 415);

    const ext = ((file.name ?? "").split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = `t/${who.tenantId}/${purpose}/${newId("m")}.${ext}`;
    await c.env.MEDIA.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type ?? "application/octet-stream" },
      customMetadata: { tenant: who.tenantId, uploadedBy: who.userId, purpose },
    });
    return c.json({ key }, 201);
  })

  // Authed proxy read. Only same-tenant callers; the route guard already
  // requires an authenticated member, and we re-check the tenant prefix.
  .get("/media/:key{.+}", async (c) => {
    const who = requireTenant(c);
    if (!who) return c.json({ error: "unauthenticated" }, 401);
    const key = c.req.param("key");
    // Tenant isolation: the key must belong to the caller's tenant.
    if (!key.startsWith(`t/${who.tenantId}/`)) return c.json({ error: "forbidden" }, 403);
    const obj = await c.env.MEDIA.get(key);
    if (!obj) return c.json({ error: "not found" }, 404);
    const headers = new Headers();
    if (obj.httpMetadata?.contentType) headers.set("content-type", obj.httpMetadata.contentType);
    headers.set("cache-control", "private, max-age=3600");
    return new Response(obj.body, { headers });
  });
