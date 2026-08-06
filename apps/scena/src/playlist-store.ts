/**
 * Reusable playlists (§4) — slide + music playlists as first-class, tenant-owned
 * entities that channels reference. Editing a playlist reflects on every channel
 * that composes it. Slides/tracks are keyed by playlist_id (channel_id is kept
 * for legacy channel-owned content, which the compiler still resolves).
 */
import { ensureSchema, DEMO_TENANT, sanitizeDurationMs } from "./db.js";

function rid(prefix: string): string {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return `${prefix}_${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export interface SlidePlaylistRow {
  id: string;
  tenant_id: string;
  name: string;
  default_duration_ms: number | null;
  transition: string | null;
  created_at: number;
  tags: string | null;
}
export interface MusicPlaylistRow {
  id: string;
  tenant_id: string;
  name: string;
  shuffle: number | null;
  created_at: number;
  tags: string | null;
}
export interface SlideRow {
  id: string;
  playlist_id: string | null;
  channel_id: string | null;
  ord: number;
  type: string;
  asset_hash: string | null;
  asset_url: string | null;
  html_body: string | null;
  duration_ms: number | null;
  fit: string | null;
  clip_start_ms: number | null;
  loop: number | null;
}
export interface TrackRow {
  id: string;
  playlist_id: string | null;
  channel_id: string | null;
  tenant_id: string;
  ord: number;
  title: string;
  asset_hash: string;
  asset_url: string;
  duration_ms: number;
  library_id: string | null;
  artist: string | null;
  art_hash: string | null;
  art_url: string | null;
  genres: string | null;
  vocal: string | null;
  album: string | null;
  media_id: string | null;
}

/* ----------------------------- slide playlists ---------------------------- */

export async function createSlidePlaylist(db: D1Database, name: string, tenantId = DEMO_TENANT): Promise<string> {
  await ensureSchema(db);
  const id = rid("sp");
  await db
    .prepare("INSERT INTO slide_playlists (id, tenant_id, name, default_duration_ms, transition, created_at) VALUES (?, ?, ?, 6000, 'fade', ?)")
    .bind(id, tenantId, name || "Slide playlist", Date.now())
    .run();
  return id;
}

export async function listSlidePlaylists(db: D1Database, tenantId = DEMO_TENANT): Promise<SlidePlaylistRow[]> {
  await ensureSchema(db);
  const r = await db.prepare("SELECT * FROM slide_playlists WHERE tenant_id = ? ORDER BY created_at DESC").bind(tenantId).all<SlidePlaylistRow>();
  return r.results ?? [];
}

export async function getSlidePlaylist(db: D1Database, id: string): Promise<SlidePlaylistRow | null> {
  await ensureSchema(db);
  return db.prepare("SELECT * FROM slide_playlists WHERE id = ?").bind(id).first<SlidePlaylistRow>();
}

export async function updateSlidePlaylist(db: D1Database, id: string, patch: { name?: string; defaultDurationMs?: number; transition?: string; tags?: string[] }): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.name !== undefined) { sets.push("name = ?"); vals.push(patch.name); }
  if (patch.defaultDurationMs !== undefined) { sets.push("default_duration_ms = ?"); vals.push(patch.defaultDurationMs); }
  if (patch.transition !== undefined) { sets.push("transition = ?"); vals.push(patch.transition); }
  if (patch.tags !== undefined) { sets.push("tags = ?"); vals.push(JSON.stringify(patch.tags)); }
  if (!sets.length) return;
  vals.push(id);
  await db.prepare(`UPDATE slide_playlists SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
}

export async function deleteSlidePlaylist(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM slides WHERE playlist_id = ?").bind(id).run();
  await db.prepare("DELETE FROM slide_playlists WHERE id = ?").bind(id).run();
  // Detach any channels that referenced it.
  await db.prepare("UPDATE channels SET slide_playlist_id = NULL WHERE slide_playlist_id = ?").bind(id).run();
}

export async function listPlaylistSlides(db: D1Database, playlistId: string): Promise<SlideRow[]> {
  await ensureSchema(db);
  const r = await db.prepare("SELECT * FROM slides WHERE playlist_id = ? ORDER BY ord").bind(playlistId).all<SlideRow>();
  return r.results ?? [];
}

export async function addPlaylistSlide(
  db: D1Database,
  playlistId: string,
  slide: { type: "image" | "gif" | "video" | "html"; assetHash?: string; assetUrl?: string; htmlBody?: string; durationMs?: number; fit?: string },
): Promise<string> {
  await ensureSchema(db);
  const id = rid("sl");
  const max = await db.prepare("SELECT COALESCE(MAX(ord), -1) AS m FROM slides WHERE playlist_id = ?").bind(playlistId).first<{ m: number }>();
  await db
    .prepare("INSERT INTO slides (id, playlist_id, channel_id, ord, type, asset_hash, asset_url, html_body, duration_ms, fit) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, playlistId, (max?.m ?? -1) + 1, slide.type, slide.assetHash ?? null, slide.assetUrl ?? null, slide.htmlBody ?? null, sanitizeDurationMs(slide.durationMs), slide.fit ?? null)
    .run();
  return id;
}

/** Per-slide overrides: duration (null → inherit playlist default), fit, and —
 * for HTML slides — the edited body. */
export async function updateSlide(db: D1Database, id: string, patch: { durationMs?: number | null; fit?: string; htmlBody?: string; clipStartMs?: number | null; loop?: boolean }, playlistId?: string): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.durationMs !== undefined) { sets.push("duration_ms = ?"); vals.push(sanitizeDurationMs(patch.durationMs)); }
  if (patch.fit !== undefined) { sets.push("fit = ?"); vals.push(patch.fit); }
  if (patch.htmlBody !== undefined) { sets.push("html_body = ?"); vals.push(patch.htmlBody); }
  if (patch.clipStartMs !== undefined) { sets.push("clip_start_ms = ?"); vals.push(patch.clipStartMs); }
  if (patch.loop !== undefined) { sets.push("loop = ?"); vals.push(patch.loop ? 1 : 0); }
  if (!sets.length) return;
  vals.push(id);
  // Scope to the playlist when known, so a slide is only editable via its own playlist.
  const scope = playlistId ? " AND playlist_id = ?" : "";
  if (playlistId) vals.push(playlistId);
  await db.prepare(`UPDATE slides SET ${sets.join(", ")} WHERE id = ?${scope}`).bind(...vals).run();
}

export async function reorderPlaylistSlides(db: D1Database, playlistId: string, orderedIds: string[]): Promise<void> {
  const stmt = db.prepare("UPDATE slides SET ord = ? WHERE id = ? AND playlist_id = ?");
  await db.batch(orderedIds.map((id, i) => stmt.bind(i, id, playlistId)));
}

/* ----------------------------- music playlists ---------------------------- */

export async function createMusicPlaylist(db: D1Database, name: string, tenantId = DEMO_TENANT): Promise<string> {
  await ensureSchema(db);
  const id = rid("mp");
  await db
    .prepare("INSERT INTO music_playlists (id, tenant_id, name, shuffle, created_at) VALUES (?, ?, ?, 0, ?)")
    .bind(id, tenantId, name || "Music playlist", Date.now())
    .run();
  return id;
}

export async function listMusicPlaylists(db: D1Database, tenantId = DEMO_TENANT): Promise<MusicPlaylistRow[]> {
  await ensureSchema(db);
  const r = await db.prepare("SELECT * FROM music_playlists WHERE tenant_id = ? ORDER BY created_at DESC").bind(tenantId).all<MusicPlaylistRow>();
  return r.results ?? [];
}

export async function getMusicPlaylist(db: D1Database, id: string): Promise<MusicPlaylistRow | null> {
  await ensureSchema(db);
  return db.prepare("SELECT * FROM music_playlists WHERE id = ?").bind(id).first<MusicPlaylistRow>();
}

export async function updateMusicPlaylist(db: D1Database, id: string, patch: { name?: string; shuffle?: boolean; tags?: string[] }): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.name !== undefined) { sets.push("name = ?"); vals.push(patch.name); }
  if (patch.shuffle !== undefined) { sets.push("shuffle = ?"); vals.push(patch.shuffle ? 1 : 0); }
  if (patch.tags !== undefined) { sets.push("tags = ?"); vals.push(JSON.stringify(patch.tags)); }
  if (!sets.length) return;
  vals.push(id);
  await db.prepare(`UPDATE music_playlists SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
}

export async function deleteMusicPlaylist(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM tracks WHERE playlist_id = ?").bind(id).run();
  await db.prepare("DELETE FROM music_playlists WHERE id = ?").bind(id).run();
  await db.prepare("UPDATE channels SET music_playlist_id = NULL WHERE music_playlist_id = ?").bind(id).run();
}

export async function listPlaylistTracks(db: D1Database, playlistId: string): Promise<TrackRow[]> {
  await ensureSchema(db);
  const r = await db.prepare("SELECT * FROM tracks WHERE playlist_id = ? ORDER BY ord").bind(playlistId).all<TrackRow>();
  return r.results ?? [];
}

export async function addPlaylistTrack(
  db: D1Database,
  playlistId: string,
  track: { title: string; assetHash: string; assetUrl: string; durationMs: number; tenantId?: string; libraryId?: string; artist?: string; artHash?: string; artUrl?: string; genres?: string[]; vocal?: string; album?: string; mediaId?: string },
): Promise<string> {
  await ensureSchema(db);
  const id = rid("tr");
  const max = await db.prepare("SELECT COALESCE(MAX(ord), -1) AS m FROM tracks WHERE playlist_id = ?").bind(playlistId).first<{ m: number }>();
  await db
    .prepare(
      "INSERT INTO tracks (id, tenant_id, playlist_id, channel_id, ord, title, asset_hash, asset_url, duration_ms, created_at, library_id, artist, art_hash, art_url, genres, vocal, album, media_id) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      track.tenantId ?? DEMO_TENANT,
      playlistId,
      (max?.m ?? -1) + 1,
      track.title || "Track",
      track.assetHash,
      track.assetUrl,
      Math.max(1000, Math.round(track.durationMs)),
      Date.now(),
      track.libraryId ?? null,
      track.artist ?? null,
      track.artHash ?? null,
      track.artUrl ?? null,
      track.genres && track.genres.length ? JSON.stringify(track.genres) : null,
      track.vocal ?? null,
      track.album ?? null,
      track.mediaId ?? null,
    )
    .run();
  return id;
}

/** Edit a playlist track's meta (title/artist/album/genres/vocal/art). Scoped to
 *  the owning playlist so a track id from another tenant's playlist can't be
 *  edited even when the caller owns the playlist named in the URL. */
export async function updatePlaylistTrack(
  db: D1Database,
  playlistId: string,
  trackId: string,
  patch: { title?: string; artist?: string; album?: string; genres?: string[]; vocal?: string | null; artHash?: string | null; artUrl?: string | null },
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.title !== undefined) { sets.push("title = ?"); vals.push(patch.title.slice(0, 200) || "Track"); }
  if (patch.artist !== undefined) { sets.push("artist = ?"); vals.push(patch.artist.slice(0, 200) || null); }
  if (patch.album !== undefined) { sets.push("album = ?"); vals.push(patch.album.slice(0, 200) || null); }
  if (patch.genres !== undefined) { sets.push("genres = ?"); vals.push(patch.genres.length ? JSON.stringify(patch.genres) : null); }
  if (patch.vocal !== undefined) { sets.push("vocal = ?"); vals.push(patch.vocal || null); }
  if (patch.artHash !== undefined) { sets.push("art_hash = ?"); vals.push(patch.artHash); }
  if (patch.artUrl !== undefined) { sets.push("art_url = ?"); vals.push(patch.artUrl); }
  if (!sets.length) return;
  vals.push(trackId, playlistId);
  await db.prepare(`UPDATE tracks SET ${sets.join(", ")} WHERE id = ? AND playlist_id = ?`).bind(...vals).run();
}

/** Delete a track from a specific playlist (scoped, so a foreign track id is a
 *  no-op even when the caller owns the playlist named in the URL). */
export async function deletePlaylistTrack(db: D1Database, playlistId: string, trackId: string): Promise<void> {
  await db.prepare("DELETE FROM tracks WHERE id = ? AND playlist_id = ?").bind(trackId, playlistId).run();
}

/** The audio asset hashes referenced by a playlist's tracks (for optional media
 *  cleanup when a playlist is deleted with the "also delete media" option). */
export async function playlistTrackHashes(db: D1Database, playlistId: string): Promise<string[]> {
  const r = await db.prepare("SELECT asset_hash FROM tracks WHERE playlist_id = ?").bind(playlistId).all<{ asset_hash: string }>();
  return (r.results ?? []).map((x) => x.asset_hash).filter(Boolean);
}

export async function reorderPlaylistTracks(db: D1Database, playlistId: string, orderedIds: string[]): Promise<void> {
  const stmt = db.prepare("UPDATE tracks SET ord = ? WHERE id = ? AND playlist_id = ?");
  await db.batch(orderedIds.map((id, i) => stmt.bind(i, id, playlistId)));
}
