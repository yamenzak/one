/**
 * Reusable-entity routes (§4 restructure): slide/music playlists, widget
 * profiles, channel composition, and device dimensions/channels. Registered
 * onto the main Hono app. Tenant-scoped + ownership-checked; RBAC gating is
 * applied centrally in route-guard (content / screen permissions).
 */
import type { Hono } from "hono";
import { type AppEnv, tenantOf, owns } from "./auth-context.js";
import {
  createSlidePlaylist, listSlidePlaylists, getSlidePlaylist, updateSlidePlaylist, deleteSlidePlaylist,
  listPlaylistSlides, addPlaylistSlide, reorderPlaylistSlides, updateSlide,
  createMusicPlaylist, listMusicPlaylists, getMusicPlaylist, updateMusicPlaylist, deleteMusicPlaylist,
  listPlaylistTracks, addPlaylistTrack, updatePlaylistTrack, deletePlaylistTrack, reorderPlaylistTracks, playlistTrackHashes,
} from "./playlist-store.js";
import { getLibraryTrack, countLibraryUsage, canAddLibraryTrack } from "./library-store.js";
import { tenantEntitlements } from "./billing-service.js";
import {
  createWidgetProfile, listWidgetProfiles, getWidgetProfile, getProfileWidgets, saveProfileWidgets, updateWidgetProfile, deleteWidgetProfile,
} from "./profile-store.js";
import { getChannel, listChannels, setChannelComposition, deleteSlide, playbackFreeRunKey } from "./content.js";
import { enabledAdSchedules } from "./ad-store.js";
import { getDeviceSchedule, addDeviceRule, deleteDeviceRule, deleteDeviceRules, setDeviceTz, countTenantScheduleRules, type RuleKind } from "./device-schedule-store.js";
import { getScreen, setDeviceDimensions, setDeviceChannel, setDeviceChannels, listDeviceChannels, markScreenUnpaired, deleteScreen, renameScreen, parseTags } from "./db.js";
import { createMedia, listMedia, getMedia, updateMedia, deleteMedia, mediaByHashes, type MediaKind } from "./media-store.js";
import { getBranding, setBranding } from "./branding-store.js";
import { getConfigValue, setConfig } from "./billing-store.js";
import type { Env } from "./env.js";

/** Allowed media-fit values (mirrors the manifest Slide.fit enum). */
const FITS = new Set(["contain", "cover", "fill"]);
/** Allowed slide transitions (mirrors the player + dashboard picker). */
const TRANSITIONS = new Set(["fade", "none", "slide", "zoom", "flip"]);
/** Allowed media-library kinds. */
const MEDIA_KINDS = new Set(["image", "gif", "video", "html", "audio"]);
/** Allowed provenance sources (drives the licensing badge). */
const MEDIA_SOURCES = new Set(["upload", "ai", "public"]);
/** Allowed vocal classifications for audio. */
const VOCALS = new Set(["vocal", "instrumental"]);
function defaultName(kind: string): string {
  return kind === "html" ? "HTML slide" : kind === "video" ? "Video" : kind === "gif" ? "GIF" : kind === "audio" ? "Track" : "Image";
}
function cleanGenres(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.map((g) => String(g).trim()).filter(Boolean).slice(0, 12) : undefined;
}
/** Distinct genres across a playlist's tracks (parsed from each track's JSON). */
function summarizeGenres(tracks: { genres: string | null }[]): string[] {
  const set = new Set<string>();
  for (const t of tracks) for (const g of parseTags(t.genres)) set.add(g);
  return [...set].sort().slice(0, 12);
}
/** Whether a tenant already references a public-library track anywhere. */
async function tenantUsesLibraryTrack(db: D1Database, libraryId: string, tenantId: string): Promise<boolean> {
  const row = await db.prepare("SELECT 1 FROM tracks WHERE tenant_id = ? AND library_id = ? LIMIT 1").bind(tenantId, libraryId).first();
  return !!row;
}

/** Mint a short, unambiguous pairing code (mirrors the reserve route). */
function mintCode(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  let code = "";
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return code;
}

/**
 * Push the operator's channel choice into the live ScreenDO so it switches now
 * (§13 default channel). Persisting the assignment in D1 alone leaves the device
 * on the demo channel it was bound to at claim, since the DO resolves its channel
 * from the schedule + defaultChannelId — not from the D1 tables. Best-effort: a
 * bad id or an unreachable DO leaves the persisted assignment intact.
 */
async function pushDefaultChannel(env: Env, screenId: string, channelId: string | null): Promise<void> {
  try {
    await env.SCREEN.get(env.SCREEN.idFromString(screenId)).setDefaultChannel(channelId ?? null);
  } catch {
    /* screen never came online as a DO, or bad id — nothing to nudge */
  }
}

/** Re-evaluate a device's schedule now (after a rule/tz change), so the live
 *  screen swaps channel / mutes / sleeps immediately. Best-effort. */
async function refreshScreenSchedule(env: Env, screenId: string): Promise<void> {
  try {
    await env.SCREEN.get(env.SCREEN.idFromString(screenId)).refreshSchedule();
  } catch {
    /* screen offline as a DO — the new rules apply when it next resolves */
  }
}

export function registerContentRoutes(app: Hono<AppEnv>): void {
  /* --------------------------- slide playlists --------------------------- */
  app.get("/api/slide-playlists", async (c) => {
    const rows = await listSlidePlaylists(c.env.DB, tenantOf(c));
    const playlists = await Promise.all(
      rows.map(async (p) => ({ ...p, tags: parseTags(p.tags), slideCount: (await listPlaylistSlides(c.env.DB, p.id)).length })),
    );
    return c.json({ playlists });
  });

  app.post("/api/slide-playlists", async (c) => {
    const b = await c.req.json<{ name?: string }>().catch(() => ({}) as never);
    return c.json({ id: await createSlidePlaylist(c.env.DB, (b.name ?? "").trim() || "Slide playlist", tenantOf(c)) });
  });

  app.get("/api/slide-playlists/:id", async (c) => {
    const p = await getSlidePlaylist(c.env.DB, c.req.param("id"));
    if (!owns(c, p)) return c.json({ error: "not found" }, 404);
    return c.json({ ...p, tags: parseTags(p!.tags), slides: await listPlaylistSlides(c.env.DB, p!.id) });
  });

  app.put("/api/slide-playlists/:id", async (c) => {
    const p = await getSlidePlaylist(c.env.DB, c.req.param("id"));
    if (!owns(c, p)) return c.json({ error: "not found" }, 404);
    const b = await c.req.json<{ name?: string; defaultDurationMs?: number; transition?: string; tags?: string[] }>().catch(() => ({}) as never);
    const patch: { name?: string; defaultDurationMs?: number; transition?: string; tags?: string[] } = {};
    if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim().slice(0, 80);
    if (typeof b.defaultDurationMs === "number") patch.defaultDurationMs = Math.max(300, Math.min(600_000, Math.round(b.defaultDurationMs)));
    if (typeof b.transition === "string" && TRANSITIONS.has(b.transition)) patch.transition = b.transition;
    if (Array.isArray(b.tags)) patch.tags = b.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 24);
    await updateSlidePlaylist(c.env.DB, p!.id, patch);
    return c.json({ ok: true });
  });

  app.delete("/api/slide-playlists/:id", async (c) => {
    const p = await getSlidePlaylist(c.env.DB, c.req.param("id"));
    if (!owns(c, p)) return c.json({ error: "not found" }, 404);
    // Optionally hard-delete the slides' media from the library + R2 as well.
    if (c.req.query("media") === "1") {
      const slides = await listPlaylistSlides(c.env.DB, p!.id);
      const hashes = slides.map((s) => s.asset_hash).filter((h): h is string => !!h);
      const rows = await mediaByHashes(c.env.DB, tenantOf(c), hashes);
      for (const m of rows) {
        await deleteMedia(c.env.DB, m.id);
        if (m.asset_hash) await c.env.MEDIA.delete(m.asset_hash).catch(() => undefined);
      }
    }
    await deleteSlidePlaylist(c.env.DB, p!.id);
    return c.json({ ok: true });
  });

  /* ----------------------------- media library --------------------------- */

  app.get("/api/media", async (c) => {
    const kind = c.req.query("kind");
    const rows = await listMedia(c.env.DB, tenantOf(c), MEDIA_KINDS.has(kind ?? "") ? kind : undefined);
    return c.json({ media: rows.map((m) => ({ ...m, tags: parseTags(m.tags) })) });
  });

  app.post("/api/media", async (c) => {
    const b = await c.req.json<{ kind?: string; name?: string; assetHash?: string; assetUrl?: string; htmlBody?: string; mime?: string; bytes?: number; width?: number; height?: number; durationMs?: number; artist?: string; album?: string; genres?: unknown; vocal?: string; artHash?: string; artUrl?: string; source?: string }>().catch(() => ({}) as never);
    const kind = (MEDIA_KINDS.has(b.kind ?? "") ? b.kind : "image") as MediaKind;
    if (kind === "html" ? !b.htmlBody : !b.assetHash) return c.json({ error: `${kind} media needs ${kind === "html" ? "a body" : "an uploaded asset"}` }, 400);
    const id = await createMedia(c.env.DB, tenantOf(c), {
      kind, name: (b.name ?? "").trim() || defaultName(kind),
      assetHash: b.assetHash, assetUrl: b.assetUrl, htmlBody: b.htmlBody, mime: b.mime,
      bytes: b.bytes, width: b.width, height: b.height, durationMs: b.durationMs,
      artist: b.artist, album: b.album, genres: cleanGenres(b.genres),
      vocal: VOCALS.has(b.vocal ?? "") ? b.vocal : undefined,
      artHash: b.artHash, artUrl: b.artUrl,
      source: MEDIA_SOURCES.has(b.source ?? "") ? (b.source as "upload" | "ai" | "public") : "upload",
    });
    return c.json({ id });
  });

  app.put("/api/media/:id", async (c) => {
    const m = await getMedia(c.env.DB, c.req.param("id"));
    if (!owns(c, m)) return c.json({ error: "not found" }, 404);
    const b = await c.req.json<{ name?: string; tags?: string[]; htmlBody?: string; artist?: string; album?: string; genres?: unknown; vocal?: string | null; artHash?: string | null; artUrl?: string | null }>().catch(() => ({}) as never);
    const patch: Parameters<typeof updateMedia>[2] = {};
    if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim();
    if (Array.isArray(b.tags)) patch.tags = b.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 24);
    if (typeof b.htmlBody === "string") patch.htmlBody = b.htmlBody;
    if (typeof b.artist === "string") patch.artist = b.artist;
    if (typeof b.album === "string") patch.album = b.album;
    const genres = cleanGenres(b.genres);
    if (genres) patch.genres = genres;
    if (b.vocal === null || (typeof b.vocal === "string" && (b.vocal === "" || VOCALS.has(b.vocal)))) patch.vocal = b.vocal || null;
    if (b.artHash !== undefined) patch.artHash = b.artHash;
    if (b.artUrl !== undefined) patch.artUrl = b.artUrl;
    await updateMedia(c.env.DB, m!.id, patch);
    return c.json({ ok: true });
  });

  app.delete("/api/media/:id", async (c) => {
    const m = await getMedia(c.env.DB, c.req.param("id"));
    if (!owns(c, m)) return c.json({ error: "not found" }, 404);
    await deleteMedia(c.env.DB, m!.id);
    // Hard delete: remove the R2 object too, unless another library entry still
    // points at the same content-addressed bytes.
    if (m!.asset_hash) {
      const others = await c.env.DB.prepare("SELECT 1 FROM media WHERE tenant_id = ? AND asset_hash = ? LIMIT 1").bind(tenantOf(c), m!.asset_hash).first();
      if (!others) await c.env.MEDIA.delete(m!.asset_hash).catch(() => undefined);
    }
    return c.json({ ok: true });
  });

  /* -------------------------------- branding ----------------------------- */

  app.get("/api/branding", async (c) => c.json({ branding: await getBranding(c.env.DB, tenantOf(c)) }));

  app.put("/api/branding", async (c) => {
    const patch = await c.req.json<Record<string, unknown>>().catch(() => ({}));
    return c.json({ branding: await setBranding(c.env.DB, tenantOf(c), patch) });
  });

  /* ------------------------- playback preferences ------------------------ */
  // Multi-screen sync: keep screens sharing a channel frame-aligned. Off (the
  // free-run default) each screen plays on its own clock. Frame-accurate sync is
  // a premium grant — a tenant without it is always free-run and can't turn it on.
  app.get("/api/playback", async (c) => c.json({ freeRun: (await getConfigValue(c.env.DB, playbackFreeRunKey(tenantOf(c)))) === "1" }));
  app.put("/api/playback", async (c) => {
    const b = await c.req.json<{ freeRun?: boolean }>().catch(() => ({}) as { freeRun?: boolean });
    // Enforce the grant server-side (the UI also disables the control): without
    // multiScreenSync, sync can't be enabled, so free-run is forced on.
    const ent = await tenantEntitlements(c.env.DB, tenantOf(c));
    const freeRun = ent.features.multiScreenSync ? !!b.freeRun : true;
    await setConfig(c.env.DB, { [playbackFreeRunKey(tenantOf(c))]: freeRun ? "1" : "0" });
    return c.json({ freeRun });
  });

  app.post("/api/slide-playlists/:id/slides", async (c) => {
    const p = await getSlidePlaylist(c.env.DB, c.req.param("id"));
    if (!owns(c, p)) return c.json({ error: "not found" }, 404);
    const spEnt = await tenantEntitlements(c.env.DB, tenantOf(c));
    if (spEnt.quotas.slidesPerPlaylist >= 0) {
      const used = (await listPlaylistSlides(c.env.DB, p!.id)).length;
      if (used >= spEnt.quotas.slidesPerPlaylist) return c.json({ error: `plan limit reached (${spEnt.quotas.slidesPerPlaylist} slides per playlist)` }, 403);
    }
    const b = await c.req.json<{ type?: string; assetHash?: string; assetUrl?: string; htmlBody?: string; durationMs?: number; fit?: string }>().catch(() => ({}) as never);
    const type = b.type === "html" ? "html" : b.type === "video" ? "video" : b.type === "gif" ? "gif" : "image";
    // Raw-HTML slides are the same capability as the HTML-sandbox widget — gate on it.
    if (type === "html" && !spEnt.features.htmlSandbox) return c.json({ error: "custom HTML isn't in your plan" }, 403);
    if (type !== "html" && !b.assetHash) return c.json({ error: `${type} slide needs an uploaded asset` }, 400);
    const fit = FITS.has(b.fit ?? "") ? b.fit : undefined;
    return c.json({ id: await addPlaylistSlide(c.env.DB, p!.id, { type, assetHash: b.assetHash, assetUrl: b.assetUrl, htmlBody: b.htmlBody, durationMs: b.durationMs, fit }) });
  });

  // Per-slide overrides: duration (null → inherit playlist default) and fit.
  app.put("/api/slide-playlists/:id/slides/:slideId", async (c) => {
    const p = await getSlidePlaylist(c.env.DB, c.req.param("id"));
    if (!owns(c, p)) return c.json({ error: "not found" }, 404);
    const b = await c.req.json<{ durationMs?: number | null; fit?: string; htmlBody?: string; clipStartMs?: number | null; loop?: boolean }>().catch(() => ({}) as never);
    const patch: { durationMs?: number | null; fit?: string; htmlBody?: string; clipStartMs?: number | null; loop?: boolean } = {};
    if ("durationMs" in b) patch.durationMs = b.durationMs == null ? null : Math.max(300, Math.min(600_000, Math.round(b.durationMs)));
    if (b.fit !== undefined && FITS.has(b.fit)) patch.fit = b.fit;
    if (typeof b.htmlBody === "string") patch.htmlBody = b.htmlBody.slice(0, 200_000);
    if ("clipStartMs" in b) patch.clipStartMs = b.clipStartMs == null ? null : Math.max(0, Math.round(b.clipStartMs));
    if (typeof b.loop === "boolean") patch.loop = b.loop;
    await updateSlide(c.env.DB, c.req.param("slideId"), patch, p!.id);
    return c.json({ ok: true });
  });

  app.post("/api/slide-playlists/:id/reorder", async (c) => {
    const p = await getSlidePlaylist(c.env.DB, c.req.param("id"));
    if (!owns(c, p)) return c.json({ error: "not found" }, 404);
    const b = await c.req.json<{ order?: string[] }>().catch(() => ({}) as never);
    await reorderPlaylistSlides(c.env.DB, p!.id, b.order ?? []);
    return c.json({ ok: true });
  });

  app.delete("/api/slide-playlists/:id/slides/:slideId", async (c) => {
    const p = await getSlidePlaylist(c.env.DB, c.req.param("id"));
    if (!owns(c, p)) return c.json({ error: "not found" }, 404);
    await deleteSlide(c.env.DB, c.req.param("slideId"), { playlistId: p!.id });
    return c.json({ ok: true });
  });

  /* --------------------------- music playlists --------------------------- */
  app.get("/api/music-playlists", async (c) => {
    const rows = await listMusicPlaylists(c.env.DB, tenantOf(c));
    const playlists = await Promise.all(
      rows.map(async (p) => {
        const tracks = await listPlaylistTracks(c.env.DB, p.id);
        return { ...p, tags: parseTags(p.tags), trackCount: tracks.length, totalMs: tracks.reduce((s, t) => s + t.duration_ms, 0), genres: summarizeGenres(tracks) };
      }),
    );
    return c.json({ playlists });
  });

  app.post("/api/music-playlists", async (c) => {
    const b = await c.req.json<{ name?: string }>().catch(() => ({}) as never);
    return c.json({ id: await createMusicPlaylist(c.env.DB, (b.name ?? "").trim() || "Music playlist", tenantOf(c)) });
  });

  app.get("/api/music-playlists/:id", async (c) => {
    const p = await getMusicPlaylist(c.env.DB, c.req.param("id"));
    if (!owns(c, p)) return c.json({ error: "not found" }, 404);
    const tracks = await listPlaylistTracks(c.env.DB, p!.id);
    return c.json({ ...p, tags: parseTags(p!.tags), tracks: tracks.map((t) => ({ ...t, genres: parseTags(t.genres) })) });
  });

  app.put("/api/music-playlists/:id", async (c) => {
    const p = await getMusicPlaylist(c.env.DB, c.req.param("id"));
    if (!owns(c, p)) return c.json({ error: "not found" }, 404);
    const b = await c.req.json<{ name?: string; shuffle?: boolean; tags?: string[] }>().catch(() => ({}) as never);
    const patch: { name?: string; shuffle?: boolean; tags?: string[] } = {};
    if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim().slice(0, 80);
    if (typeof b.shuffle === "boolean") patch.shuffle = b.shuffle;
    if (Array.isArray(b.tags)) patch.tags = b.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 24);
    await updateMusicPlaylist(c.env.DB, p!.id, patch);
    return c.json({ ok: true });
  });

  app.delete("/api/music-playlists/:id", async (c) => {
    const p = await getMusicPlaylist(c.env.DB, c.req.param("id"));
    if (!owns(c, p)) return c.json({ error: "not found" }, 404);
    // Optionally hard-delete the tracks' audio media from the library + R2 too.
    if (c.req.query("media") === "1") {
      const hashes = await playlistTrackHashes(c.env.DB, p!.id);
      const rows = await mediaByHashes(c.env.DB, tenantOf(c), hashes);
      for (const m of rows) {
        await deleteMedia(c.env.DB, m.id);
        if (m.asset_hash) await c.env.MEDIA.delete(m.asset_hash).catch(() => undefined);
      }
    }
    await deleteMusicPlaylist(c.env.DB, p!.id);
    return c.json({ ok: true });
  });

  app.post("/api/music-playlists/:id/tracks", async (c) => {
    const p = await getMusicPlaylist(c.env.DB, c.req.param("id"));
    if (!owns(c, p)) return c.json({ error: "not found" }, 404);
    const b = await c.req.json<{ title?: string; assetHash?: string; assetUrl?: string; durationMs?: number; artist?: string; album?: string; artHash?: string; artUrl?: string; genres?: unknown; vocal?: string; mediaId?: string }>().catch(() => ({}) as never);
    if (!b.assetHash || !b.assetUrl) return c.json({ error: "track needs an uploaded asset" }, 400);
    if (!(b.durationMs && b.durationMs > 0)) return c.json({ error: "track needs a duration" }, 400);
    return c.json({ id: await addPlaylistTrack(c.env.DB, p!.id, {
      title: (b.title ?? "").trim() || "Track", assetHash: b.assetHash, assetUrl: b.assetUrl, durationMs: b.durationMs, tenantId: tenantOf(c),
      artist: b.artist, album: b.album, artHash: b.artHash, artUrl: b.artUrl,
      genres: cleanGenres(b.genres), vocal: VOCALS.has(b.vocal ?? "") ? b.vocal : undefined, mediaId: b.mediaId,
    }) });
  });

  // Edit a track's meta (title/artist/album/genres/vocal/art).
  app.put("/api/music-playlists/:id/tracks/:trackId", async (c) => {
    const p = await getMusicPlaylist(c.env.DB, c.req.param("id"));
    if (!owns(c, p)) return c.json({ error: "not found" }, 404);
    const b = await c.req.json<{ title?: string; artist?: string; album?: string; genres?: unknown; vocal?: string | null; artHash?: string | null; artUrl?: string | null }>().catch(() => ({}) as never);
    const patch: Parameters<typeof updatePlaylistTrack>[3] = {};
    if (typeof b.title === "string") patch.title = b.title;
    if (typeof b.artist === "string") patch.artist = b.artist;
    if (typeof b.album === "string") patch.album = b.album;
    const genres = cleanGenres(b.genres);
    if (genres) patch.genres = genres;
    if (b.vocal === null || (typeof b.vocal === "string" && (b.vocal === "" || VOCALS.has(b.vocal)))) patch.vocal = b.vocal || null;
    if (b.artHash !== undefined) patch.artHash = b.artHash;
    if (b.artUrl !== undefined) patch.artUrl = b.artUrl;
    await updatePlaylistTrack(c.env.DB, p!.id, c.req.param("trackId"), patch);
    return c.json({ ok: true });
  });

  // Add a public-library track into a playlist by reference (feature + quota gated).
  app.post("/api/music-playlists/:id/library/:libraryId", async (c) => {
    const p = await getMusicPlaylist(c.env.DB, c.req.param("id"));
    if (!owns(c, p)) return c.json({ error: "not found" }, 404);
    const ent = await tenantEntitlements(c.env.DB, tenantOf(c));
    if (!ent.features.musicLibrary) return c.json({ error: "public library not in plan" }, 403);
    const lib = await getLibraryTrack(c.env.DB, c.req.param("libraryId"));
    if (!lib) return c.json({ error: "no such library track" }, 404);
    const used = await countLibraryUsage(c.env.DB, tenantOf(c));
    const already = await tenantUsesLibraryTrack(c.env.DB, lib.id, tenantOf(c));
    if (!canAddLibraryTrack(used, ent.quotas.libraryTracks, already)) {
      return c.json({ error: "library limit reached", limit: ent.quotas.libraryTracks, used }, 402);
    }
    // Mirror into the tenant's media library (source=public) so it shows there,
    // badged licensed — deduped by hash if already imported.
    const mediaId = await createMedia(c.env.DB, tenantOf(c), {
      kind: "audio", name: lib.title, assetHash: lib.asset_hash, assetUrl: lib.asset_url, durationMs: lib.duration_ms,
      artist: lib.artist || undefined, genres: lib.genre ? [lib.genre] : undefined, vocal: lib.vocal ?? undefined,
      artHash: lib.art_hash ?? undefined, artUrl: lib.art_url ?? undefined, source: "public", libraryId: lib.id,
    });
    const id = await addPlaylistTrack(c.env.DB, p!.id, {
      title: lib.title, artist: lib.artist || undefined, assetHash: lib.asset_hash, assetUrl: lib.asset_url, durationMs: lib.duration_ms,
      artHash: lib.art_hash ?? undefined, artUrl: lib.art_url ?? undefined, genres: lib.genre ? [lib.genre] : undefined,
      vocal: lib.vocal ?? undefined, tenantId: tenantOf(c), libraryId: lib.id, mediaId,
    });
    return c.json({ id, mediaId });
  });

  app.post("/api/music-playlists/:id/reorder", async (c) => {
    const p = await getMusicPlaylist(c.env.DB, c.req.param("id"));
    if (!owns(c, p)) return c.json({ error: "not found" }, 404);
    const b = await c.req.json<{ order?: string[] }>().catch(() => ({}) as never);
    await reorderPlaylistTracks(c.env.DB, p!.id, b.order ?? []);
    return c.json({ ok: true });
  });

  app.delete("/api/music-playlists/:id/tracks/:trackId", async (c) => {
    const p = await getMusicPlaylist(c.env.DB, c.req.param("id"));
    if (!owns(c, p)) return c.json({ error: "not found" }, 404);
    await deletePlaylistTrack(c.env.DB, p!.id, c.req.param("trackId"));
    return c.json({ ok: true });
  });

  /* ---------------------------- widget profiles -------------------------- */
  app.get("/api/profiles", async (c) => c.json({ profiles: await listWidgetProfiles(c.env.DB, tenantOf(c)) }));

  app.post("/api/profiles", async (c) => {
    const prEnt = await tenantEntitlements(c.env.DB, tenantOf(c));
    const prNow = await c.env.DB.prepare("SELECT COUNT(*) n FROM widget_profiles WHERE tenant_id = ?").bind(tenantOf(c)).first<{ n: number }>();
    if (prEnt.quotas.profiles >= 0 && (prNow?.n ?? 0) >= prEnt.quotas.profiles) return c.json({ error: `plan limit reached (${prEnt.quotas.profiles} widget profile${prEnt.quotas.profiles === 1 ? "" : "s"})` }, 403);
    const b = await c.req.json<{ name?: string; designW?: number; designH?: number; widgets?: unknown }>().catch(() => ({}) as never);
    return c.json({ id: await createWidgetProfile(c.env.DB, (b.name ?? "").trim() || "Widget profile", { tenantId: tenantOf(c), designW: b.designW, designH: b.designH, widgets: b.widgets }) });
  });

  app.get("/api/profiles/:id", async (c) => {
    const p = await getWidgetProfile(c.env.DB, c.req.param("id"));
    if (!owns(c, p)) return c.json({ error: "not found" }, 404);
    return c.json({ ...p, widgets: await getProfileWidgets(c.env.DB, p!.id) });
  });

  app.put("/api/profiles/:id", async (c) => {
    const p = await getWidgetProfile(c.env.DB, c.req.param("id"));
    if (!owns(c, p)) return c.json({ error: "not found" }, 404);
    const b = await c.req.json<{ name?: string; designW?: number; designH?: number }>().catch(() => ({}) as never);
    await updateWidgetProfile(c.env.DB, p!.id, b);
    return c.json({ ok: true });
  });

  app.put("/api/profiles/:id/widgets", async (c) => {
    const p = await getWidgetProfile(c.env.DB, c.req.param("id"));
    if (!owns(c, p)) return c.json({ error: "not found" }, 404);
    const b = await c.req.json<{ widgets?: unknown }>().catch(() => ({}) as never);
    await saveProfileWidgets(c.env.DB, p!.id, b.widgets ?? []);
    return c.json({ ok: true });
  });

  app.delete("/api/profiles/:id", async (c) => {
    const p = await getWidgetProfile(c.env.DB, c.req.param("id"));
    if (!owns(c, p)) return c.json({ error: "not found" }, 404);
    await deleteWidgetProfile(c.env.DB, p!.id);
    return c.json({ ok: true });
  });

  /* -------------------------- channel composition ------------------------ */
  // Set which reusable playlists/profile a channel composes (null = detach).
  app.put("/api/channels/:id/composition", async (c) => {
    const ch = await getChannel(c.env.DB, c.req.param("id"));
    if (!owns(c, ch)) return c.json({ error: "not found" }, 404);
    const b = await c.req.json<{ slidePlaylistId?: string | null; musicPlaylistId?: string | null; widgetProfileId?: string | null; adProfileId?: string | null }>().catch(() => ({}) as never);
    await setChannelComposition(c.env.DB, ch!.id, b);
    // Binding/unbinding an ad profile changes the channel's rotation — re-arm the DO.
    if (b.adProfileId !== undefined) {
      const schedules = await enabledAdSchedules(c.env.DB, ch!.id);
      await c.env.CHANNEL.get(c.env.CHANNEL.idFromName(ch!.id)).setAds(ch!.id, schedules);
    }
    return c.json({ ok: true });
  });

  /* --------------------------- device settings --------------------------- */
  // The player reports its detected resolution on pair/boot; the operator can
  // also assign the active channel and the multi-channel set.
  app.put("/api/screens/:id/dimensions", async (c) => {
    const s = await getScreen(c.env.DB, c.req.param("id"));
    if (!owns(c, s)) return c.json({ error: "not found" }, 404);
    const b = await c.req.json<{ width?: number; height?: number; orientation?: string }>().catch(() => ({}) as never);
    if (!(b.width && b.height)) return c.json({ error: "width + height required" }, 400);
    await setDeviceDimensions(c.env.DB, s!.id, { width: b.width, height: b.height, orientation: b.orientation });
    return c.json({ ok: true });
  });

  app.put("/api/screens/:id/channel", async (c) => {
    const s = await getScreen(c.env.DB, c.req.param("id"));
    if (!owns(c, s)) return c.json({ error: "not found" }, 404);
    const b = await c.req.json<{ channelId?: string | null }>().catch(() => ({}) as never);
    await setDeviceChannel(c.env.DB, s!.id, b.channelId ?? null);
    await pushDefaultChannel(c.env, s!.id, b.channelId ?? null);
    return c.json({ ok: true });
  });

  app.get("/api/screens/:id/channels", async (c) => {
    const s = await getScreen(c.env.DB, c.req.param("id"));
    if (!owns(c, s)) return c.json({ error: "not found" }, 404);
    return c.json({ channelIds: await listDeviceChannels(c.env.DB, s!.id) });
  });

  app.put("/api/screens/:id/channels", async (c) => {
    const s = await getScreen(c.env.DB, c.req.param("id"));
    if (!owns(c, s)) return c.json({ error: "not found" }, 404);
    const b = await c.req.json<{ channelIds?: string[] }>().catch(() => ({}) as never);
    const channelIds = Array.isArray(b.channelIds) ? b.channelIds : [];
    await setDeviceChannels(c.env.DB, s!.id, channelIds);
    // Mirror the primary channel onto the screen row + switch the live device.
    await setDeviceChannel(c.env.DB, s!.id, channelIds[0] ?? null);
    await pushDefaultChannel(c.env, s!.id, channelIds[0] ?? null);
    return c.json({ ok: true });
  });

  /* --------------------- per-device schedule (§13) ---------------------- */
  // Each device is scheduled independently across three tracks: channel
  // dayparting, mute windows, and screensaver/wake windows.

  app.get("/api/screens/:id/schedule", async (c) => {
    const s = await getScreen(c.env.DB, c.req.param("id"));
    if (!owns(c, s)) return c.json({ error: "not found" }, 404);
    const [sched, channels] = await Promise.all([getDeviceSchedule(c.env.DB, s!.id), listChannels(c.env.DB, tenantOf(c))]);
    const nameOf = new Map(channels.map((ch) => [ch.id, ch.name]));
    return c.json({
      tz: sched.tz,
      rules: sched.rules.map((r) => ({ ...r, channelName: r.channelId ? nameOf.get(r.channelId) ?? r.channelId : null })),
      channels: channels.map((ch) => ({ id: ch.id, name: ch.name })),
    });
  });

  app.post("/api/screens/:id/schedule/rules", async (c) => {
    const s = await getScreen(c.env.DB, c.req.param("id"));
    if (!owns(c, s)) return c.json({ error: "not found" }, 404);
    const schEnt = await tenantEntitlements(c.env.DB, tenantOf(c));
    if (!schEnt.features.dayparting) return c.json({ error: "scheduling not in plan" }, 403);
    if (schEnt.quotas.scheduleRules >= 0) {
      const used = await countTenantScheduleRules(c.env.DB, tenantOf(c));
      if (used >= schEnt.quotas.scheduleRules) return c.json({ error: `plan limit reached (${schEnt.quotas.scheduleRules} schedule rules)` }, 403);
    }
    const b = await c.req.json<{ kind?: string; days?: number[]; startMin?: number; endMin?: number; channelId?: string; priority?: number }>().catch(() => ({}) as never);
    const kind = (b.kind === "mute" || b.kind === "saver" ? b.kind : "channel") as RuleKind;
    const days = Array.isArray(b.days) ? b.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [];
    const startMin = Number(b.startMin);
    const endMin = Number(b.endMin);
    if (!days.length) return c.json({ error: "pick at least one day" }, 400);
    if (!Number.isInteger(startMin) || !Number.isInteger(endMin) || startMin < 0 || endMin < 0 || startMin >= 1440 || endMin > 1440) return c.json({ error: "invalid time window" }, 400);
    // Channel dayparts are within a day; mute/saver windows may wrap past midnight.
    if (kind === "channel") {
      if (endMin <= startMin) return c.json({ error: "end must be after start" }, 400);
      if (!b.channelId) return c.json({ error: "pick a channel" }, 400);
    } else if (endMin === startMin) {
      return c.json({ error: "window can't be empty" }, 400);
    }
    const id = await addDeviceRule(c.env.DB, s!.id, { kind, days, startMin, endMin, channelId: kind === "channel" ? b.channelId : null, priority: b.priority });
    await refreshScreenSchedule(c.env, s!.id);
    return c.json({ id });
  });

  app.delete("/api/screens/:id/schedule/rules/:ruleId", async (c) => {
    const s = await getScreen(c.env.DB, c.req.param("id"));
    if (!owns(c, s)) return c.json({ error: "not found" }, 404);
    await deleteDeviceRule(c.env.DB, s!.id, c.req.param("ruleId"));
    await refreshScreenSchedule(c.env, s!.id);
    return c.json({ ok: true });
  });

  app.patch("/api/screens/:id/schedule", async (c) => {
    const s = await getScreen(c.env.DB, c.req.param("id"));
    if (!owns(c, s)) return c.json({ error: "not found" }, 404);
    const b = await c.req.json<{ tz?: string }>().catch(() => ({}) as never);
    await setDeviceTz(c.env.DB, s!.id, (b.tz ?? "").trim() || "UTC");
    await refreshScreenSchedule(c.env, s!.id);
    return c.json({ ok: true });
  });

  // Rename a device and/or set its tags.
  app.put("/api/screens/:id", async (c) => {
    const s = await getScreen(c.env.DB, c.req.param("id"));
    if (!owns(c, s)) return c.json({ error: "not found" }, 404);
    const b = await c.req.json<{ name?: string; tags?: string[] }>().catch(() => ({}) as never);
    const patch: { name?: string; tags?: string[] } = {};
    if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim().slice(0, 80);
    if (Array.isArray(b.tags)) patch.tags = b.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 24);
    await renameScreen(c.env.DB, s!.id, patch);
    return c.json({ ok: true });
  });

  // Unpair: the device stops playing and returns to a fresh pairing code. The
  // record stays (as "unpaired") so it can then be removed or re-paired.
  app.post("/api/screens/:id/unpair", async (c) => {
    const s = await getScreen(c.env.DB, c.req.param("id"));
    if (!owns(c, s)) return c.json({ error: "not found" }, 404);
    const code = mintCode();
    await c.env.PAIRING.put(`pair:${code}`, s!.id, { expirationTtl: 86_400 });
    try {
      await c.env.SCREEN.get(c.env.SCREEN.idFromString(s!.id)).unpair(code);
    } catch {
      /* DO unreachable — the D1 state below still marks it unpaired */
    }
    await setDeviceChannels(c.env.DB, s!.id, []);
    await markScreenUnpaired(c.env.DB, s!.id);
    return c.json({ ok: true, code });
  });

  // Remove: permanently delete a device — but only once it's unpaired, so an
  // active screen can never be deleted out from under playout (§ guardrail).
  app.delete("/api/screens/:id", async (c) => {
    const s = await getScreen(c.env.DB, c.req.param("id"));
    if (!owns(c, s)) return c.json({ error: "not found" }, 404);
    let state: string | undefined;
    let code: string | undefined;
    try {
      const st = await c.env.SCREEN.get(c.env.SCREEN.idFromString(s!.id)).status();
      state = st.state;
      code = st.code;
    } catch {
      /* DO unreachable — treat as removable (a dead device) */
    }
    if (state === "assigned") {
      return c.json({ error: "Unpair the device before removing it." }, 409);
    }
    // Kill the claimable code so a removed device can't be re-claimed to resurrect it.
    if (code) await c.env.PAIRING.delete(`pair:${code}`).catch(() => {});
    await deleteDeviceRules(c.env.DB, s!.id).catch(() => {}); // drop its schedule rules
    await deleteScreen(c.env.DB, s!.id);
    return c.json({ ok: true });
  });
}
