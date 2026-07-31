/**
 * Media library (SPEC §11) — a role-scoped view of everything a person can see
 * in the MEDIA bucket, backed by the `media_assets` ledger.
 *
 *  - client: their own uploads + anything filed under their client record; they
 *    may delete their own.
 *  - trainer / assistant: their own uploads + the media of clients they can
 *    reach (assignment-scoped), READ-ONLY.
 *  - owner: every asset in the studio; may delete anything.
 *
 * Deleting removes the R2 object, tombstones the ledger row (so the storage
 * meter drops), and scrubs the obvious D1 references (avatar, lab file, library
 * images) so a deleted file doesn't leave a dangling link.
 */

import { Hono } from "hono";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { visibleClientIds, clientForUser } from "./clients.js";
import { deleteMedia } from "./storage.js";

interface AssetRow {
  id: string;
  r2_key: string;
  purpose: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
  subject_id: string | null;
  owner_user_id: string | null;
  client_name: string | null;
  owner_name: string | null;
}

const IMAGE = /^image\//;

export const mediaLibraryRoutes = new Hono<AppEnv>()
  // List the media visible to the caller (newest first, undeleted only).
  .get("/media-library", async (c) => {
    const who = requireTenant(c)!;
    const role = c.get("role") ?? "client";
    const isOwner = role === "owner";
    const scope = await visibleClientIds(c); // "all" (owner/assistant) | assigned ids | own
    const mine = role === "client" ? await clientForUser(c.env.DB, who.tenantId, who.userId) : null;

    const base =
      `SELECT a.id, a.r2_key, a.purpose, a.content_type, a.size_bytes, a.created_at, a.subject_id, a.owner_user_id,
              cl.display_name AS client_name, u.name AS owner_name
       FROM media_assets a
       LEFT JOIN clients cl ON cl.id = a.subject_id
       LEFT JOIN "user" u ON u.id = a.owner_user_id
       WHERE a.tenant_id = ? AND a.deleted_at IS NULL`;

    let rows: AssetRow[];
    if (scope === "all") {
      rows = (await c.env.DB.prepare(`${base} ORDER BY a.created_at DESC LIMIT 1000`).bind(who.tenantId).all<AssetRow>()).results ?? [];
    } else {
      // Trainer / client: own uploads OR assets filed under a client they can see.
      const clientIds = new Set<string>(scope);
      if (mine) clientIds.add(mine.id);
      const ids = [...clientIds];
      const ph = ids.map(() => "?").join(",");
      const clientClause = ids.length ? ` OR a.subject_id IN (${ph})` : "";
      rows = (await c.env.DB.prepare(`${base} AND (a.owner_user_id = ?${clientClause}) ORDER BY a.created_at DESC LIMIT 1000`).bind(who.tenantId, who.userId, ...ids).all<AssetRow>()).results ?? [];
    }

    const items = rows.map((r) => {
      const ownedByMe = r.owner_user_id === who.userId || (!!mine && r.subject_id === mine.id);
      return {
        id: r.id,
        url: `/api/media/${r.r2_key}`,
        purpose: r.purpose,
        contentType: r.content_type,
        isImage: IMAGE.test(r.content_type),
        sizeBytes: r.size_bytes,
        createdAt: r.created_at,
        clientId: r.subject_id,
        clientName: r.client_name,
        ownerName: r.owner_name,
        mine: ownedByMe,
        // Owner deletes anything; a client deletes their own; coaches are read-only.
        canDelete: isOwner || (role === "client" && ownedByMe),
      };
    });
    return c.json({ items, canManage: isOwner || role === "client" });
  })

  // Delete one asset (owner: any; client: own). Coaches are read-only.
  .delete("/media-library/:id", async (c) => {
    const who = requireTenant(c)!;
    const role = c.get("role") ?? "client";
    const asset = await c.env.DB
      .prepare("SELECT id, r2_key, purpose, subject_id, owner_user_id FROM media_assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL")
      .bind(c.req.param("id"), who.tenantId)
      .first<{ id: string; r2_key: string; purpose: string; subject_id: string | null; owner_user_id: string | null }>();
    if (!asset) return c.json({ error: "not found" }, 404);

    const mine = role === "client" ? await clientForUser(c.env.DB, who.tenantId, who.userId) : null;
    const ownedByMe = asset.owner_user_id === who.userId || (!!mine && asset.subject_id === mine.id);
    const allowed = role === "owner" || (role === "client" && ownedByMe);
    if (!allowed) return c.json({ error: "forbidden" }, 403);

    await deleteMedia(c.env, asset.r2_key, who.userId);
    await scrubReferences(c.env.DB, asset.r2_key);
    return c.json({ ok: true });
  });

/** Null out the common D1 columns that point at a now-deleted object so the app
 *  doesn't render a dead link. Best-effort per column; embedded refs inside JSON
 *  blobs (check-in photos, plan images) are left to 404 gracefully. */
async function scrubReferences(db: D1Database, key: string): Promise<void> {
  const url = `/api/media/${key}`;
  const stmts = [
    db.prepare("UPDATE clients SET avatar_url = NULL WHERE avatar_url = ?").bind(url),
    db.prepare("UPDATE lab_tests SET file_key = NULL WHERE file_key = ?").bind(key),
    db.prepare("UPDATE foods SET image_url = NULL WHERE image_url = ?").bind(url),
    db.prepare("UPDATE exercises SET thumb_url = NULL WHERE thumb_url = ?").bind(url),
    db.prepare("UPDATE exercises SET thumb2_url = NULL WHERE thumb2_url = ?").bind(url),
    db.prepare("UPDATE exercises SET video_url = NULL WHERE video_url = ?").bind(url),
    db.prepare("UPDATE food_entries SET image_url = NULL WHERE image_url = ?").bind(url),
  ];
  await db.batch(stmts).catch(() => undefined);
}
