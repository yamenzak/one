/**
 * Music subsystem store (BLUEPRINT §16).
 *
 * A channel's music is an ordered list of tracks concatenated into the
 * clock-synced music timeline (§1) — so, like slides, every screen resolves the
 * same track at the same seek offset from the shared epoch. Audio is stored in
 * R2 by content hash (uploaded via /api/assets); this table keeps the ordering,
 * title, and duration the compiler needs to build the timeline.
 */

import { ensureSchema, DEMO_TENANT } from "./db.js";

export interface TrackRow {
  id: string;
  tenant_id: string;
  channel_id: string;
  ord: number;
  title: string;
  asset_hash: string;
  asset_url: string;
  duration_ms: number;
  created_at: number;
  library_id: string | null;
  artist: string | null;
  art_hash: string | null;
  art_url: string | null;
}

export async function listTracks(db: D1Database, channelId: string): Promise<TrackRow[]> {
  await ensureSchema(db);
  const res = await db.prepare("SELECT * FROM tracks WHERE channel_id = ? ORDER BY ord").bind(channelId).all<TrackRow>();
  return res.results ?? [];
}

export async function addTrack(
  db: D1Database,
  channelId: string,
  track: { title: string; assetHash: string; assetUrl: string; durationMs: number; tenantId?: string; libraryId?: string; artist?: string; artHash?: string; artUrl?: string },
): Promise<string> {
  await ensureSchema(db);
  const max = await db.prepare("SELECT COALESCE(MAX(ord), -1) AS m FROM tracks WHERE channel_id = ?").bind(channelId).first<{ m: number }>();
  const id = `trk_${randomHex(8)}`;
  await db
    .prepare("INSERT INTO tracks (id, tenant_id, channel_id, ord, title, asset_hash, asset_url, duration_ms, created_at, library_id, artist, art_hash, art_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, track.tenantId ?? DEMO_TENANT, channelId, (max?.m ?? -1) + 1, track.title || "Track", track.assetHash, track.assetUrl, Math.max(1000, Math.round(track.durationMs)), Date.now(), track.libraryId ?? null, track.artist ?? null, track.artHash ?? null, track.artUrl ?? null)
    .run();
  return id;
}

export async function deleteTrack(db: D1Database, id: string, channelId?: string): Promise<void> {
  await ensureSchema(db);
  // Scope to the channel when known so a track is only removable via its own channel.
  if (channelId) await db.prepare("DELETE FROM tracks WHERE id = ? AND channel_id = ?").bind(id, channelId).run();
  else await db.prepare("DELETE FROM tracks WHERE id = ?").bind(id).run();
}

export async function reorderTracks(db: D1Database, channelId: string, orderedIds: string[]): Promise<void> {
  await ensureSchema(db);
  const stmt = db.prepare("UPDATE tracks SET ord = ? WHERE id = ? AND channel_id = ?");
  await db.batch(orderedIds.map((id, i) => stmt.bind(i, id, channelId)));
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}
