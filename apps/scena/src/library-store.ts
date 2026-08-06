/**
 * Admin-curated music library (§16 extension).
 *
 * A *global*, licensed catalog the operator uploads once — not tenant-scoped —
 * organised by genre. A tenant browses it and adds a track into one of their
 * channel playlists by reference: the same R2 audio (by content hash) is pointed
 * at from a normal `tracks` row tagged with `library_id`, so it plays through the
 * unchanged clock-synced music timeline and we can count/limit library usage.
 */

import { ensureSchema } from "./db.js";

export interface LibraryTrackRow {
  id: string;
  genre: string;
  title: string;
  artist: string;
  asset_hash: string;
  asset_url: string;
  duration_ms: number;
  created_at: number;
  art_hash: string | null;
  art_url: string | null;
  vocal: string | null;
}

export async function listLibrary(db: D1Database, genre?: string): Promise<LibraryTrackRow[]> {
  await ensureSchema(db);
  const res = genre
    ? await db.prepare("SELECT * FROM library_tracks WHERE genre = ? ORDER BY created_at DESC").bind(genre).all<LibraryTrackRow>()
    : await db.prepare("SELECT * FROM library_tracks ORDER BY genre, created_at DESC").all<LibraryTrackRow>();
  return res.results ?? [];
}

/** Distinct genres with a track count, for the browser's genre rail. */
export async function listGenres(db: D1Database): Promise<{ genre: string; count: number }[]> {
  await ensureSchema(db);
  const res = await db.prepare("SELECT genre, COUNT(*) AS count FROM library_tracks GROUP BY genre ORDER BY genre").all<{ genre: string; count: number }>();
  return res.results ?? [];
}

export async function getLibraryTrack(db: D1Database, id: string): Promise<LibraryTrackRow | null> {
  await ensureSchema(db);
  return db.prepare("SELECT * FROM library_tracks WHERE id = ?").bind(id).first<LibraryTrackRow>();
}

export async function createLibraryTrack(
  db: D1Database,
  t: { genre: string; title: string; artist: string; assetHash: string; assetUrl: string; durationMs: number; artHash?: string; artUrl?: string; vocal?: string },
): Promise<string> {
  await ensureSchema(db);
  const id = `lib_${randomHex(8)}`;
  await db
    .prepare("INSERT INTO library_tracks (id, genre, title, artist, asset_hash, asset_url, duration_ms, created_at, art_hash, art_url, vocal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, t.genre.trim() || "Uncategorized", t.title.trim() || "Untitled", t.artist.trim(), t.assetHash, t.assetUrl, Math.max(1000, Math.round(t.durationMs)), Date.now(), t.artHash ?? null, t.artUrl ?? null, t.vocal ?? null)
    .run();
  return id;
}

/**
 * Update a library track's metadata (title / artist / genre / type / cover art).
 * The audio asset itself is immutable (content-addressed) so it isn't touched —
 * the edit dialog reuses the create form for everything except the audio file.
 */
export async function updateLibraryTrack(
  db: D1Database,
  id: string,
  patch: { genre?: string; title?: string; artist?: string; vocal?: string | null; artHash?: string | null; artUrl?: string | null },
): Promise<void> {
  await ensureSchema(db);
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.genre !== undefined) { sets.push("genre = ?"); vals.push(patch.genre.trim() || "Uncategorized"); }
  if (patch.title !== undefined) { sets.push("title = ?"); vals.push(patch.title.trim() || "Untitled"); }
  if (patch.artist !== undefined) { sets.push("artist = ?"); vals.push(patch.artist.trim()); }
  if (patch.vocal !== undefined) { sets.push("vocal = ?"); vals.push(patch.vocal || null); }
  if (patch.artHash !== undefined) { sets.push("art_hash = ?"); vals.push(patch.artHash || null); }
  if (patch.artUrl !== undefined) { sets.push("art_url = ?"); vals.push(patch.artUrl || null); }
  if (!sets.length) return;
  vals.push(id);
  await db.prepare(`UPDATE library_tracks SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
}

export async function deleteLibraryTrack(db: D1Database, id: string): Promise<void> {
  await ensureSchema(db);
  await db.prepare("DELETE FROM library_tracks WHERE id = ?").bind(id).run();
}

/** How many distinct library tracks a tenant is currently using (across channels). */
export async function countLibraryUsage(db: D1Database, tenantId: string): Promise<number> {
  await ensureSchema(db);
  const row = await db
    .prepare("SELECT COUNT(DISTINCT library_id) AS n FROM tracks WHERE tenant_id = ? AND library_id IS NOT NULL")
    .bind(tenantId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Whether a tenant may add another *distinct* library track, given their current
 * usage and plan limit. `limit < 0` means unlimited; `0` means the feature is off
 * for this plan. Re-adding a track already in use never counts against the cap.
 */
export function canAddLibraryTrack(used: number, limit: number, alreadyUsed: boolean): boolean {
  if (alreadyUsed) return true;
  if (limit < 0) return true;
  return used < limit;
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}
