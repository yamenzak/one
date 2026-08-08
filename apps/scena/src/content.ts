/**
 * Channels + slide playlists (BLUEPRINT §4, §5, §15) and the manifest compiler.
 *
 * D1 is the authoring source of truth for channels and slides; the compiler
 * turns that relational model — plus the KV widget layer (§17) and the
 * ChannelDO epoch (§1) — into the immutable manifest the screens run. This
 * replaces the hardcoded demo builder: the "demo" channel is now seeded into D1
 * and edited like any other.
 */

import { parseManifest, widgetThemeCss, type Manifest } from "@scena/manifest";
import { getBranding, manifestBrand } from "./branding-store.js";
import { ensureSchema, DEMO_TENANT, sanitizeDurationMs } from "./db.js";
import { DEMO_CHANNEL_ID, DEMO_SLIDES, DEFAULT_WIDGETS } from "./demo.js";
import { loadWidgets, getVersion } from "./channels.js";
import { listTracks } from "./music-store.js";
import { listPlaylistSlides, listPlaylistTracks, getSlidePlaylist } from "./playlist-store.js";
import { getProfileWidgets } from "./profile-store.js";
import { getConfigValue, tenantEntitlements } from "./billing-store.js";
import type { Features } from "./entitlements.js";
import type { Env } from "./env.js";

/** Strip/normalize widgets the tenant's plan doesn't include, at compile time —
 *  so a screen can never render a gated feature even if it was saved (via the AI
 *  designer, a template, or a crafted API call). The builder keeps the widget, so
 *  it reappears on upgrade; the *compiled* manifest just omits it. */
/** Per-tenant key for the multi-screen-sync (free-run) toggle in app_config.
 *  Keyed by tenant so one workspace's playback preference can't affect another. */
export const playbackFreeRunKey = (tenantId: string): string => `playback.freeRun:${tenantId}`;

export function gateWidgets<T>(widgets: T, f: Features): T {
  if (!Array.isArray(widgets)) return widgets;
  const gated = (widgets as Array<Record<string, unknown>>)
    .filter((w) => {
      if (w?.type === "html" && !f.htmlSandbox) return false;
      if (w?.type === "stack" && !f.widgetStack) return false;
      // A plan without the feature excludes the widget entirely.
      if (w?.type === "ticker" && !f.ticker) return false;
      if (w?.type === "weather" && !f.weather) return false;
      return true;
    })
    .map((w) => {
      const cfg = (w?.config ?? {}) as Record<string, unknown>;
      // Downgrade the analog clock to digital when analog isn't in the plan.
      if (w?.type === "clock" && cfg.variant === "analog" && !f.clockAnalog) {
        return { ...w, config: { ...cfg, variant: "digital" } };
      }
      return w;
    });
  return gated as unknown as T;
}

export interface ChannelRow {
  id: string;
  tenant_id: string;
  name: string;
  default_duration_ms: number;
  transition: string;
  created_at: number;
  // Reusable-entity references (null → legacy channel-owned content).
  slide_playlist_id: string | null;
  music_playlist_id: string | null;
  widget_profile_id: string | null;
  ad_profile_id: string | null;
  tags: string | null;
}

/** Rename a channel and/or set its tags. */
export async function updateChannel(db: D1Database, id: string, patch: { name?: string; tags?: string[] }): Promise<void> {
  await ensureSchema(db);
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.name !== undefined) { sets.push("name = ?"); vals.push(patch.name); }
  if (patch.tags !== undefined) { sets.push("tags = ?"); vals.push(JSON.stringify(patch.tags)); }
  if (!sets.length) return;
  vals.push(id);
  await db.prepare(`UPDATE channels SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
}

/** Device ids currently pointing at a channel (their active channel). */
export async function screenIdsOnChannel(db: D1Database, channelId: string): Promise<string[]> {
  await ensureSchema(db);
  const r = await db.prepare("SELECT id FROM screens WHERE channel_id = ?").bind(channelId).all<{ id: string }>();
  return (r.results ?? []).map((x) => x.id);
}

/** Delete a channel: unassign it from every device, drop carried links + version
 *  history + the channel row. Reusable playlists/profiles it referenced stay. */
export async function deleteChannel(db: D1Database, id: string): Promise<void> {
  await ensureSchema(db);
  await db.batch([
    db.prepare("UPDATE screens SET channel_id = NULL WHERE channel_id = ?").bind(id),
    db.prepare("DELETE FROM device_channels WHERE channel_id = ?").bind(id),
    db.prepare("DELETE FROM manifest_versions WHERE channel_id = ?").bind(id),
    db.prepare("DELETE FROM channels WHERE id = ?").bind(id),
  ]);
}

export interface SlideRow {
  id: string;
  channel_id: string;
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

/** Create the demo channel + seed its slides on first use, so the editor has
 *  real rows to manipulate instead of a hardcoded constant. */
export async function ensureDemoChannel(db: D1Database): Promise<void> {
  await ensureSchema(db);
  const existing = await db.prepare("SELECT id FROM channels WHERE id = ?").bind(DEMO_CHANNEL_ID).first();
  if (existing) return;
  await db
    .prepare("INSERT INTO channels (id, tenant_id, name, default_duration_ms, transition, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(DEMO_CHANNEL_ID, DEMO_TENANT, "Lobby loop", 6000, "fade", Date.now())
    .run();
  const stmt = db.prepare(
    "INSERT INTO slides (id, channel_id, ord, type, asset_hash, asset_url, html_body, duration_ms) VALUES (?, ?, ?, 'image', ?, ?, NULL, ?)",
  );
  await db.batch(
    DEMO_SLIDES.map((s, i) => stmt.bind(s.id, DEMO_CHANNEL_ID, i, `demo-${s.asset}`, `/api/demo/asset/${s.asset}.svg`, s.durationMs)),
  );
}

/** Create a new (empty) channel. It compiles to a placeholder until it has slides. */
export async function createChannel(db: D1Database, name: string, tenantId = DEMO_TENANT): Promise<string> {
  await ensureSchema(db);
  const id = `ch_${randomHex(6)}`;
  await db
    .prepare("INSERT INTO channels (id, tenant_id, name, default_duration_ms, transition, created_at) VALUES (?, ?, ?, 6000, 'fade', ?)")
    .bind(id, tenantId, name || "Channel", Date.now())
    .run();
  return id;
}

/** Set a channel's reusable-entity references. Pass null to detach; omit to keep. */
export async function setChannelComposition(
  db: D1Database,
  channelId: string,
  refs: { slidePlaylistId?: string | null; musicPlaylistId?: string | null; widgetProfileId?: string | null; adProfileId?: string | null },
): Promise<void> {
  await ensureSchema(db);
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (refs.slidePlaylistId !== undefined) { sets.push("slide_playlist_id = ?"); vals.push(refs.slidePlaylistId); }
  if (refs.musicPlaylistId !== undefined) { sets.push("music_playlist_id = ?"); vals.push(refs.musicPlaylistId); }
  if (refs.widgetProfileId !== undefined) { sets.push("widget_profile_id = ?"); vals.push(refs.widgetProfileId); }
  if (refs.adProfileId !== undefined) { sets.push("ad_profile_id = ?"); vals.push(refs.adProfileId); }
  if (!sets.length) return;
  vals.push(channelId);
  await db.prepare(`UPDATE channels SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
}

export async function listChannels(db: D1Database, tenantId = DEMO_TENANT): Promise<ChannelRow[]> {
  await ensureDemoChannel(db);
  const res = await db.prepare("SELECT * FROM channels WHERE tenant_id = ? ORDER BY created_at").bind(tenantId).all<ChannelRow>();
  return res.results ?? [];
}

export async function getChannel(db: D1Database, id: string): Promise<ChannelRow | null> {
  await ensureDemoChannel(db);
  return db.prepare("SELECT * FROM channels WHERE id = ?").bind(id).first<ChannelRow>();
}

/** The channels that reference a shared building block (slide/music playlist,
 *  widget or ad profile), so a save can offer to republish exactly those — the
 *  screens that will otherwise stay stale until someone hits Channels ▸ Publish. */
export async function channelsUsingPlaylist(
  db: D1Database,
  kind: "slide" | "music" | "widget" | "ad",
  refId: string,
  tenantId = DEMO_TENANT,
): Promise<{ id: string; name: string }[]> {
  // Fixed column whitelist keyed by `kind` — never interpolate caller input.
  const col = { slide: "slide_playlist_id", music: "music_playlist_id", widget: "widget_profile_id", ad: "ad_profile_id" }[kind];
  if (!col || !refId) return [];
  const res = await db
    .prepare(`SELECT id, name FROM channels WHERE tenant_id = ? AND ${col} = ? ORDER BY name`)
    .bind(tenantId, refId)
    .all<{ id: string; name: string }>();
  return res.results ?? [];
}

export async function listSlides(db: D1Database, channelId: string): Promise<SlideRow[]> {
  await ensureDemoChannel(db);
  const res = await db.prepare("SELECT * FROM slides WHERE channel_id = ? ORDER BY ord").bind(channelId).all<SlideRow>();
  return res.results ?? [];
}

export async function addSlide(
  db: D1Database,
  channelId: string,
  slide: { type: "image" | "html"; assetHash?: string; assetUrl?: string; htmlBody?: string; durationMs?: number },
): Promise<string> {
  const max = await db.prepare("SELECT COALESCE(MAX(ord), -1) AS m FROM slides WHERE channel_id = ?").bind(channelId).first<{ m: number }>();
  const id = `sl_${randomHex(8)}`;
  await db
    .prepare("INSERT INTO slides (id, channel_id, ord, type, asset_hash, asset_url, html_body, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, channelId, (max?.m ?? -1) + 1, slide.type, slide.assetHash ?? null, slide.assetUrl ?? null, slide.htmlBody ?? null, sanitizeDurationMs(slide.durationMs))
    .run();
  return id;
}

export async function updateSlideDuration(db: D1Database, id: string, durationMs: number | null, channelId?: string): Promise<void> {
  const dur = sanitizeDurationMs(durationMs);
  // Scope by channel when known so a slide can only be edited via its own channel.
  if (channelId) await db.prepare("UPDATE slides SET duration_ms = ? WHERE id = ? AND channel_id = ?").bind(dur, id, channelId).run();
  else await db.prepare("UPDATE slides SET duration_ms = ? WHERE id = ?").bind(dur, id).run();
}

export async function deleteSlide(db: D1Database, id: string, scope?: { channelId?: string; playlistId?: string }): Promise<void> {
  // Scope the delete to the parent that owns the slide (channel or playlist), so a
  // slide id can only be removed through the parent the caller was authorized on.
  if (scope?.channelId) await db.prepare("DELETE FROM slides WHERE id = ? AND channel_id = ?").bind(id, scope.channelId).run();
  else if (scope?.playlistId) await db.prepare("DELETE FROM slides WHERE id = ? AND playlist_id = ?").bind(id, scope.playlistId).run();
  else await db.prepare("DELETE FROM slides WHERE id = ?").bind(id).run();
}

/** Persist a new slide order (array of slide ids in the desired sequence). */
export async function reorderSlides(db: D1Database, channelId: string, orderedIds: string[]): Promise<void> {
  const stmt = db.prepare("UPDATE slides SET ord = ? WHERE id = ? AND channel_id = ?");
  await db.batch(orderedIds.map((id, i) => stmt.bind(i, id, channelId)));
}

/**
 * Compile a channel into the manifest the screens run (§5). Pulls slides from
 * D1, the widget layer from KV, and the epoch anchor from the ChannelDO; sets
 * cycleMs to the true sum of slide durations so the timeline stays exact.
 */
export async function compileManifest(env: Env, channelId: string, origin: string): Promise<Manifest | null> {
  const channel = await getChannel(env.DB, channelId);
  if (!channel) return null;

  // Resolve content through the channel's references, falling back to legacy
  // channel-owned rows when a reference is null (§4 reusable entities).
  const slidePlaylist = channel.slide_playlist_id ? await getSlidePlaylist(env.DB, channel.slide_playlist_id) : null;
  const slides = channel.slide_playlist_id
    ? await listPlaylistSlides(env.DB, channel.slide_playlist_id)
    : await listSlides(env.DB, channelId);
  const def = slidePlaylist?.default_duration_ms || channel.default_duration_ms || 6000;
  const transition = slidePlaylist?.transition || channel.transition || "fade";

  // image/gif/video reference an R2 asset by hash; html carries an inline body.
  const items = slides.map((s) => ({
    id: s.id,
    type: (s.type === "html" ? "html" : s.type === "video" ? "video" : s.type === "gif" ? "gif" : "image") as "image" | "gif" | "html" | "video",
    hash: s.type !== "html" ? (s.asset_hash ?? undefined) : undefined,
    htmlBody: s.type === "html" ? (s.html_body ?? "") : undefined,
    durationMs: s.duration_ms ?? def,
    fit: s.fit ?? undefined,
    clipStartMs: s.clip_start_ms ?? undefined,
    loop: s.loop == null ? undefined : s.loop === 1,
  }));
  const cycleMs = items.reduce((sum, it) => sum + (it.durationMs ?? def), 0) || def;

  // Music timeline (§16): concatenated tracks (from the referenced music
  // playlist, else legacy channel tracks), plus their R2 assets by hash.
  const tracks = channel.music_playlist_id
    ? await listPlaylistTracks(env.DB, channel.music_playlist_id)
    : await listTracks(env.DB, channelId);
  const music = { shuffle: false, items: tracks.map((t) => ({ id: t.id, hash: t.asset_hash, title: t.title, artist: t.artist ?? undefined, art: t.art_hash ?? undefined, durationMs: t.duration_ms })) };
  const trackAssets = [
    ...tracks.map((t) => ({ hash: t.asset_hash, mime: "audio/*", bytes: 0, url: absolute(origin, t.asset_url) })),
    // Cover-art assets, so the Now Playing widget resolves them by hash (§16).
    ...tracks.filter((t) => t.art_hash && t.art_url).map((t) => ({ hash: t.art_hash as string, mime: "image/*", bytes: 0, url: absolute(origin, t.art_url as string) })),
  ];

  const assets = [
    ...slides
      .filter((s) => (s.type === "image" || s.type === "gif" || s.type === "video") && s.asset_hash && s.asset_url)
      .map((s) => ({ hash: s.asset_hash as string, mime: s.type === "video" ? "video/*" : "image/*", bytes: 0, url: absolute(origin, s.asset_url as string) })),
    ...trackAssets,
  ];

  // Widgets from the referenced profile, else the legacy per-channel KV layer.
  const rawWidgets = channel.widget_profile_id
    ? await getProfileWidgets(env.DB, channel.widget_profile_id)
    : (await loadWidgets(env.PAIRING, channelId)) ?? DEFAULT_WIDGETS;
  // Enforce the tenant's plan at compile time: strip/downgrade widgets the plan
  // doesn't include (html, stacks, analog clock) so a plan change takes effect
  // on screen even if the stored profile still carries premium widgets.
  const ent = await tenantEntitlements(env.DB, channel.tenant_id);
  const widgets = gateWidgets(rawWidgets, ent.features);
  const version = (await getVersion(env.PAIRING, channelId)) + 1;
  const epoch = await env.CHANNEL.get(env.CHANNEL.idFromName(channelId)).getEpoch();
  // Single-screen mode (§7) is the default — each screen free-runs on its own
  // clock. Frame-accurate multi-screen sync is a premium feature; without it (or
  // when an admin forces free-run globally) the manifest ships solo. A channel
  // with one screen (or none yet) also ships solo regardless of plan: there is no
  // peer to stay in phase with, so paying the per-frame video seek/slew cost — and
  // exposing slide boundaries to live clock wobble — is pure downside on a lone screen.
  const loneChannel = (await screenIdsOnChannel(env.DB, channelId)).length <= 1;
  const soloScreen = loneChannel || !ent.features.multiScreenSync || (await getConfigValue(env.DB, playbackFreeRunKey(channel.tenant_id))) === "1";
  // Brand widget-theme (§6): the `--w-*` token block the player injects so
  // widgets follow the tenant's brand on screen.
  const theme = widgetThemeCss(manifestBrand(await getBranding(env.DB, channel.tenant_id)));

  // Guard: an empty channel has no timeline — surface it as a single placeholder.
  if (items.length === 0) {
    return parseManifest({
      version,
      channelId,
      role: "content",
      dimensions: { w: 1920, h: 1080, orientation: "landscape", rotation: 0 },
      epoch: { t0: epoch.t0, cycleMs: 6000 },
      slides: { transitionDefault: channel.transition || "fade", durationDefaultMs: def, shuffle: false, items: [{ id: "empty", type: "html", htmlBody: "<div style='width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#111;color:#666;font:600 3vw sans-serif'>Empty channel</div>", durationMs: 6000 }] },
      music,
      widgets,
      fonts: [],
      assets: trackAssets,
      soloScreen,
      theme,
    });
  }

  return parseManifest({
    version,
    channelId,
    role: "content",
    dimensions: { w: 1920, h: 1080, orientation: "landscape", rotation: 0 },
    epoch: { t0: epoch.t0, cycleMs },
    slides: { transitionDefault: channel.transition || "fade", durationDefaultMs: def, shuffle: false, items },
    music,
    widgets: widgets ?? [],
    fonts: [],
    assets,
    soloScreen,
    theme,
  });
}

function absolute(origin: string, url: string): string {
  return url.startsWith("http") ? url : `${origin}${url}`;
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}
