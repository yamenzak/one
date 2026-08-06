/**
 * Media Library (§4b) — a tenant-owned catalog of every asset the operator
 * uploads or generates: images, GIFs, video, and HTML sandboxes. Slides copy
 * the hash/body they reference into the `slides` table, so a media entry is the
 * durable source: deleting a playlist (or a slide) never removes library
 * content, and the same asset can be reused across many playlists.
 *
 * Bytes live in R2 (content-addressed by hash, shared + deduped); this table is
 * the human-facing metadata + organization layer (name, tags, dimensions).
 */
import { ensureSchema, DEMO_TENANT } from "./db.js";

function rid(prefix: string): string {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return `${prefix}_${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export type MediaKind = "image" | "gif" | "video" | "html" | "audio";
/** Where a library asset came from — drives the licensing badge (§4b). */
export type MediaSource = "upload" | "ai" | "public";

export interface MediaRow {
  id: string;
  tenant_id: string;
  kind: string;
  name: string;
  asset_hash: string | null;
  asset_url: string | null;
  html_body: string | null;
  mime: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  created_at: number;
  tags: string | null;
  // Audio meta (kind === "audio"); null for other kinds.
  artist: string | null;
  album: string | null;
  genres: string | null;
  vocal: string | null;
  art_hash: string | null;
  art_url: string | null;
  // Provenance for licensing + the public-library link.
  source: string | null;
  library_id: string | null;
}

export interface NewMedia {
  kind: MediaKind;
  name: string;
  assetHash?: string;
  assetUrl?: string;
  htmlBody?: string;
  mime?: string;
  bytes?: number;
  width?: number;
  height?: number;
  durationMs?: number;
  artist?: string;
  album?: string;
  genres?: string[];
  vocal?: string;
  artHash?: string;
  artUrl?: string;
  source?: MediaSource;
  libraryId?: string;
}

/** Register a library entry. Media with a hash dedupes per tenant: re-uploading
 * identical bytes returns the existing row instead of a duplicate card. */
export async function createMedia(db: D1Database, tenantId: string, m: NewMedia): Promise<string> {
  await ensureSchema(db);
  if (m.assetHash) {
    const existing = await db
      .prepare("SELECT id FROM media WHERE tenant_id = ? AND asset_hash = ? LIMIT 1")
      .bind(tenantId, m.assetHash)
      .first<{ id: string }>();
    if (existing) return existing.id;
  }
  const id = rid("md");
  await db
    .prepare(
      "INSERT INTO media (id, tenant_id, kind, name, asset_hash, asset_url, html_body, mime, bytes, width, height, duration_ms, created_at, artist, album, genres, vocal, art_hash, art_url, source, library_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      tenantId,
      m.kind,
      (m.name || "Untitled").slice(0, 120),
      m.assetHash ?? null,
      m.assetUrl ?? null,
      m.htmlBody ?? null,
      m.mime ?? null,
      m.bytes ?? null,
      m.width ?? null,
      m.height ?? null,
      m.durationMs ?? null,
      Date.now(),
      m.artist ?? null,
      m.album ?? null,
      m.genres ? JSON.stringify(m.genres) : null,
      m.vocal ?? null,
      m.artHash ?? null,
      m.artUrl ?? null,
      m.source ?? "upload",
      m.libraryId ?? null,
    )
    .run();
  return id;
}

export async function listMedia(db: D1Database, tenantId = DEMO_TENANT, kind?: string): Promise<MediaRow[]> {
  await ensureSchema(db);
  const r = kind
    ? await db.prepare("SELECT * FROM media WHERE tenant_id = ? AND kind = ? ORDER BY created_at DESC").bind(tenantId, kind).all<MediaRow>()
    : await db.prepare("SELECT * FROM media WHERE tenant_id = ? ORDER BY created_at DESC").bind(tenantId).all<MediaRow>();
  return r.results ?? [];
}

export async function getMedia(db: D1Database, id: string): Promise<MediaRow | null> {
  await ensureSchema(db);
  return db.prepare("SELECT * FROM media WHERE id = ?").bind(id).first<MediaRow>();
}

export async function updateMedia(
  db: D1Database,
  id: string,
  patch: { name?: string; tags?: string[]; htmlBody?: string; artist?: string; album?: string; genres?: string[]; vocal?: string | null; artHash?: string | null; artUrl?: string | null },
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.name !== undefined) { sets.push("name = ?"); vals.push(patch.name.slice(0, 120)); }
  if (patch.tags !== undefined) { sets.push("tags = ?"); vals.push(JSON.stringify(patch.tags)); }
  if (patch.htmlBody !== undefined) { sets.push("html_body = ?"); vals.push(patch.htmlBody.slice(0, 200_000)); }
  if (patch.artist !== undefined) { sets.push("artist = ?"); vals.push(patch.artist.slice(0, 200) || null); }
  if (patch.album !== undefined) { sets.push("album = ?"); vals.push(patch.album.slice(0, 200) || null); }
  if (patch.genres !== undefined) { sets.push("genres = ?"); vals.push(patch.genres.length ? JSON.stringify(patch.genres) : null); }
  if (patch.vocal !== undefined) { sets.push("vocal = ?"); vals.push(patch.vocal || null); }
  if (patch.artHash !== undefined) { sets.push("art_hash = ?"); vals.push(patch.artHash); }
  if (patch.artUrl !== undefined) { sets.push("art_url = ?"); vals.push(patch.artUrl); }
  if (!sets.length) return;
  vals.push(id);
  await db.prepare(`UPDATE media SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
}

/** Library rows for a set of asset hashes (used when a playlist delete opts to
 * remove its media from the library too). */
export async function mediaByHashes(db: D1Database, tenantId: string, hashes: string[]): Promise<MediaRow[]> {
  const uniq = [...new Set(hashes.filter(Boolean))];
  if (!uniq.length) return [];
  const q = uniq.map(() => "?").join(",");
  const r = await db.prepare(`SELECT * FROM media WHERE tenant_id = ? AND asset_hash IN (${q})`).bind(tenantId, ...uniq).all<MediaRow>();
  return r.results ?? [];
}

/** Remove a library entry. The R2 bytes stay (content-addressed + possibly
 * referenced by live slides); this only drops the catalog card. */
export async function deleteMedia(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM media WHERE id = ?").bind(id).run();
}
