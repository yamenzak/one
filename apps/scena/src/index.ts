/**
 * Scena edge API (BLUEPRINT §2, §6, §9) — Hono router + Durable Object exports.
 *
 * Slice surface:
 *   POST /api/screen/new         reserve a ScreenDO, mint a pairing code
 *   GET  /api/screen/ws?d=<id>   WebSocket upgrade → ScreenDO (hibernatable)
 *   POST /api/pair/claim         operator claims a code → binds the demo channel
 *   GET  /api/manifest/:channel  compiled manifest (epoch from ChannelDO)
 *   GET  /api/demo/asset/:name   demo slide SVG
 *   GET  /api/screen/:id/status  fleet-view status
 */

import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env.js";
import { type AppEnv, type AppContext, sessionMiddleware, tenantOf, owns } from "./auth-context.js";
import { routeGuard } from "./route-guard.js";
import { domainRoutes, domainAdminRoutes, orgCreateGuard, orgUpdateGuard } from "./domain-routes.js";
import { maintenanceMiddleware } from "@4dl/tenancy";
import { contentHash, parseManifest, type Manifest } from "@scena/manifest";
import { demoAssetSvg, DEFAULT_WIDGETS } from "./demo.js";
import { provisionDisplay, provisionDisplayForScreen, seedSampleDisplay } from "./provision.js";
import { registerScreen, listScreens, getScreen, parseTags, DEMO_TENANT } from "./db.js";
import {
  saveWidgets,
  loadWidgets,
  getVersion,
  listChannelScreens,
} from "./channels.js";
import {
  createBoard,
  listBoards,
  getBoard,
  updateBoardConfig,
  mintStation,
  stationCanControl,
} from "./board-store.js";
import { syncBoardUsers, deleteBoardUsers, boardUserCanControl, listBoardUsers, regenerateBoardUserPassword } from "./board-users.js";
import { readAnnounce, setAnnounceConfig, announceClip } from "./announce-store.js";
import { summary, exportCsv } from "./analytics.js";
import {
  listChannels,
  getChannel,
  channelsUsingPlaylist,
  createChannel,
  updateChannel,
  deleteChannel,
  screenIdsOnChannel,
  listSlides,
  addSlide,
  updateSlideDuration,
  deleteSlide,
  reorderSlides,
  compileManifest,
} from "./content.js";
import { createFeed, updateFeed, listFeeds, getFeed, deleteFeed, listItems, addItem, deleteItem, refreshRss, refreshSource as refreshFeedSource, computeDataset, getDataset, refreshStaleSources, type FeedRow } from "./feeds.js";
import { listRules as listAlertRules, addRule as addAlertRule, deleteRule as deleteAlertRule, listAlerts } from "./alerts.js";
import { registerBilling } from "./billing-routes.js";
import { registerContentRoutes } from "./content-routes.js";
import { getBranding } from "./branding-store.js";
import { registerMemberRoutes } from "./member-routes.js";
import { grantAll, lifecycleSweep, isSuspended, tenantEntitlements, callerEmail } from "./billing-service.js";
import { publishVersion, currentManifest, rollbackTo, currentVersion, listVersions, getVersionManifest, publishState, setVersionNote } from "./versions.js";
import { createAd, listAds, getAd, setAdEnabled, deleteAd, enabledAdSchedules, listAdProfiles, createAdProfile, getAdProfile, updateAdProfile, deleteAdProfile, channelsUsingAdProfile } from "./ad-store.js";
import { listTracks, addTrack, deleteTrack, reorderTracks } from "./music-store.js";
import { listLibrary, listGenres, getLibraryTrack, countLibraryUsage, canAddLibraryTrack } from "./library-store.js";
import { weatherConfig, weatherConfigured, callsPerDay, geocode, listSources, getSource, createSource, updateSource, deleteSource, refreshSource, readCache, refreshStale, withinOpenHours } from "./weather-store.js";

export { ScreenDO } from "./screen-do.js";
export { ChannelDO } from "./channel-do.js";
export { QueueDO, RoomBoardDO, ScoreDO } from "./board-do.js";
export { TenantBillingDO } from "./billing-do.js";

const app = new Hono<AppEnv>();

/** Parse stored JSON (our own writes) without letting one malformed row throw a
 *  whole list route. Returns `fallback` on empty/invalid input. */
function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// Player + dashboard are separate origins in dev; reflect the caller origin and
// allow credentials so the Better Auth session cookie flows cross-origin. Once
// consolidated to one worker (same origin), CORS is a no-op. Better Auth's own
// trustedOrigins/CSRF guard remains the real protection.
app.use(
  "/api/*",
  cors({ origin: (o) => o ?? "*", credentials: true, allowHeaders: ["content-type"], allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"] }),
);

/*
  ⚠️ MOUNTED ON `*`, NOT `/api/*`.

  The guard's first act is to classify the HOST, and `/health` is one of the
  paths it decides about — so it has to reach the middleware. Under `/api/*` the
  probe would bypass the wall entirely, which is harmless for `/health` and
  would not be for the next non-API path somebody adds.

  The order is the security property and is not negotiable: identity resolves
  the host BEFORE the session is read, so a session pointed at a workspace the
  caller does not belong to grants nothing.
*/
app.use("*", sessionMiddleware);

/*
  The maintenance switch, resolved once per request and read by BOTH the guard
  (which refuses on it) and `/api/host` (which reports it). Between the session
  and the guard because the guard's gate 1b needs it and the probe needs the
  same value the guard used.
*/
app.use("*", maintenanceMiddleware() as unknown as MiddlewareHandler<AppEnv>);

// The auth boundary: six gates, in order. See route-guard.ts.
app.use("*", routeGuard);

/*
  THE SLUG GUARDS sit in FRONT of Better Auth's own organization endpoints.

  Better Auth will happily store whatever slug it is sent — the create call is a
  plain POST — so without these a workspace could claim `admin`, `setup`, `play`
  or `autodiscover` and be served that origin. They also provision the
  subdomain, without which a new workspace has no address at all.
*/
app.use("/api/auth/organization/create", orgCreateGuard as unknown as MiddlewareHandler<AppEnv>);
app.use("/api/auth/organization/update", orgUpdateGuard as unknown as MiddlewareHandler<AppEnv>);

// Better Auth handler: sign-up/in, magic-link, Google, organization + member
// management all live under /api/auth/*.
app.on(["POST", "GET"], "/api/auth/*", (c) => c.get("auth").handler(c.req.raw));

app.get("/health", (c) => c.json({ ok: true, service: "scena-api" }));

/**
 * `/api/host` — the ONE public read the pre-auth client makes, and the custom-
 * domain surface behind it. Both are `@4dl/tenancy`'s, which is why this app
 * does not hand-write a host probe: the door classification, the whole-gate
 * spread and the 404-vs-network distinction are decisions the package already
 * made correctly.
 */
app.route("/api", domainRoutes);
app.route("/api", domainAdminRoutes);

registerBilling(app);
registerContentRoutes(app);
registerMemberRoutes(app);

/** Step 1 of pairing (§6): reserve a ScreenDO and mint a single-use code. */
app.post("/api/screen/new", async (c) => {
  const id = c.env.SCREEN.newUniqueId();
  const doId = id.toString();
  const code = mintCode();

  // 24h TTL: a pairing code sits on a screen through setup — 10 minutes was long
  // enough to expire mid-install and read as an "invalid code" when claimed.
  await c.env.PAIRING.put(`pair:${code}`, doId, { expirationTtl: 86_400 });
  await c.env.SCREEN.get(id).init(code);

  return c.json({ code, screenDoId: doId, wsPath: `/api/screen/ws?d=${doId}` });
});

/** WebSocket upgrade, forwarded to the reserved ScreenDO. */
app.get("/api/screen/ws", (c) => {
  const doId = c.req.query("d");
  if (!doId) return c.text("missing screen id", 400);
  let id: DurableObjectId;
  try {
    id = c.env.SCREEN.idFromString(doId);
  } catch {
    return c.text("bad screen id", 400);
  }
  return c.env.SCREEN.get(id).fetch(c.req.raw);
});

/** Step 3 of pairing (§6): operator submits the code from the dashboard. */
app.post("/api/pair/claim", async (c) => {
  const body = await c.req
    .json<{ code?: string; name?: string; sample?: boolean }>()
    .catch(() => ({}) as { code?: string; name?: string; sample?: boolean });
  const code = (body.code ?? "").trim().toUpperCase();
  if (!code) return c.json({ error: "missing code" }, 400);

  // Resolve the code first so we can tell a *re-pair* (a device already on this
  // tenant, e.g. one that was unpaired) from a genuinely new device.
  const doId = await c.env.PAIRING.get(`pair:${code}`);
  if (!doId) return c.json({ error: "invalid or expired code" }, 404);

  // Plan limit: only count it against the quota for a NEW device. Re-pairing an
  // existing row (its screen id IS the DO id) must not be blocked by the limit —
  // otherwise an unpaired screen can't be paired again without deleting it first.
  const existing = await getScreen(c.env.DB, doId);
  const isRepair = !!existing && existing.tenant_id === tenantOf(c);
  if (!isRepair) {
    const pEnt = await tenantEntitlements(c.env.DB, tenantOf(c));
    const pairedNow = await c.env.DB.prepare("SELECT COUNT(*) n FROM screens WHERE tenant_id = ?").bind(tenantOf(c)).first<{ n: number }>();
    if (pEnt.quotas.pairedDevices >= 0 && (pairedNow?.n ?? 0) >= pEnt.quotas.pairedDevices) return c.json({ error: `plan limit reached (${pEnt.quotas.pairedDevices} screen${pEnt.quotas.pairedDevices === 1 ? "" : "s"})` }, 403);
  }

  const id = c.env.SCREEN.idFromString(doId);
  const result = await c.env.SCREEN.get(id).claim();
  await c.env.PAIRING.delete(`pair:${code}`); // single-use

  // Record the screen in the authoring store so the dashboard can list it (§4),
  // (The ScreenDO indexes the screen under its active channel during claim, §13.)
  const name = (body.name ?? "").trim() || `Screen ${code}`;
  await registerScreen(c.env.DB, { id: doId, name, channelId: result.channelId, tenantId: tenantOf(c) });

  // Onboarding (§ auto-wire): a NEW device gets its own editable display —
  // a channel composing fresh playlists + a widget profile, bound to the screen —
  // instead of the shared read-only demo channel, so the operator can just add
  // content here rather than assembling and binding the graph across pages. A
  // re-pair keeps whatever the device was already showing.
  let channelId = result.channelId;
  let seeded = false;
  if (!isRepair) {
    channelId = await provisionDisplayForScreen(c.env, doId, name, tenantOf(c));
    // Optionally light it up immediately with a sample scene (demo flow).
    if (body.sample) seeded = await seedSampleDisplay(c.env, channelId, new URL(c.req.url).origin);
  }

  return c.json({ ...result, channelId, screenDoId: doId, name, provisioned: !isRepair, seeded });
});

/** One-click "load a sample display" (§ onboarding) — fill this screen's display
 *  with a polished starter scene and publish it, so it lights up immediately. If
 *  the screen is still on the shared demo channel (or unprovisioned), give it its
 *  own editable channel first so the content is actually the operator's to edit. */
app.post("/api/screens/:id/seed-sample", async (c) => {
  const screen = await getScreen(c.env.DB, c.req.param("id"));
  if (!owns(c, screen)) return c.json({ error: "not found" }, 404);
  let channelId = screen!.channel_id;
  const owned = channelId ? await getChannel(c.env.DB, channelId) : null;
  if (!owned || owned.tenant_id !== tenantOf(c)) {
    channelId = await provisionDisplayForScreen(c.env, screen!.id, screen!.name, tenantOf(c));
  }
  const seeded = await seedSampleDisplay(c.env, channelId!, new URL(c.req.url).origin);
  return c.json({ ok: seeded, channelId });
});

/** The tenant's fleet: D1 identity merged with live ScreenDO status (§23). */
app.get("/api/screens", async (c) => {
  const rows = await listScreens(c.env.DB, tenantOf(c));
  // Resolve channel names once so each device card can show its channel (not
  // just a bare id) — the grid badge reads channel_name.
  const nameOf = new Map((await listChannels(c.env.DB, tenantOf(c))).map((ch) => [ch.id, ch.name]));
  const screens = await Promise.all(
    rows.map(async (row) => {
      const live = await liveStatus(c, row.id);
      return { ...row, tags: parseTags(row.tags), channel_name: row.channel_id ? nameOf.get(row.channel_id) ?? null : null, live };
    }),
  );
  return c.json({ screens });
});

/** One screen: D1 row + live status. */
app.get("/api/screens/:id", async (c) => {
  const row = await getScreen(c.env.DB, c.req.param("id"));
  if (!owns(c, row)) return c.json({ error: "not found" }, 404);
  return c.json({ ...row, tags: parseTags(row!.tags), live: await liveStatus(c, row!.id) });
});

/** The compiled manifest for a channel (§5) — built from D1 slides + widgets. */
app.get("/api/manifest/:channelId", async (c) => {
  const channelId = c.req.param("channelId");
  const origin = new URL(c.req.url).origin;
  // Suspension gate (§25): a non-paying tenant's screens fall back to a holding
  // card until reactivated. Device-facing route (no session), so resolve the
  // owning tenant from the channel row.
  const owner = (await getChannel(c.env.DB, channelId))?.tenant_id ?? DEMO_TENANT;
  if (await isSuspended(c.env.DB, owner)) {
    c.header("Cache-Control", "no-store");
    return c.json(suspendedManifest(channelId));
  }
  // Serve the currently-pointed version snapshot (§10), not a live recompile —
  // screens run published versions, and rollback just repoints.
  const manifest = await currentManifest(c.env, channelId, origin);
  if (!manifest) return c.json({ error: "unknown channel" }, 404);
  c.header("Cache-Control", "no-store");
  return c.json(manifest);
});

// Tenant ownership for every channel sub-resource (widgets, slides, versions,
// publish, rollback, tracks, ads, library). One guard covers them all; a
// channel that isn't the caller's tenant's reads as 404. (Top-level
// /api/channels and /api/channels/:id are threaded/checked individually.)
app.use("/api/channels/:id/*", async (c, next) => {
  const ch = await getChannel(c.env.DB, c.req.param("id"));
  if (!owns(c, ch)) return c.json({ error: "not found" }, 404);
  await next();
});

/** Load a channel's widget layer for the builder (§17). */
app.get("/api/channels/:id/widgets", async (c) => {
  const channelId = c.req.param("id");
  const widgets = (await loadWidgets(c.env.PAIRING, channelId)) ?? DEFAULT_WIDGETS;
  return c.json({ channelId, widgets, version: await getVersion(c.env.PAIRING, channelId) });
});

/** Publish a channel's widget layer and nudge its screens to refetch (§9). */
app.put("/api/channels/:id/widgets", async (c) => {
  const channelId = c.req.param("id");
  const body = await c.req.json<{ widgets?: unknown }>().catch(() => ({}) as { widgets?: unknown });
  try {
    await saveWidgets(c.env.PAIRING, channelId, body.widgets ?? []);
  } catch {
    return c.json({ error: "invalid widget layer" }, 400);
  }

  // Publishing the widget layer snapshots a new manifest version (§10), then
  // nudges the fleet to refetch the pointed snapshot (§9).
  const published = await publishVersion(c.env, channelId, new URL(c.req.url).origin, {
    note: "Widget layer update",
    publishedBy: callerEmail(c.env, c.req.raw),
  });
  const nudged = await nudgeChannel(c, channelId);
  return c.json({ channelId, version: published?.version ?? null, nudged });
});

/** Load a sample scene onto a display directly (channel-scoped, for a display not
 *  bound to a screen). Ownership is enforced by the /api/channels/:id/* guard. */
app.post("/api/channels/:id/seed-sample", async (c) => {
  const seeded = await seedSampleDisplay(c.env, c.req.param("id"), new URL(c.req.url).origin);
  return c.json({ ok: seeded });
});

/* ---------------------------- channels & slides (§4,§5,§15) --------------- */

/** Create a new channel. */
app.post("/api/channels", async (c) => {
  const cEnt = await tenantEntitlements(c.env.DB, tenantOf(c));
  const cap = cEnt.quotas.channelsPerProfile * cEnt.quotas.profiles; // total channels the plan allows
  const chNow = await c.env.DB.prepare("SELECT COUNT(*) n FROM channels WHERE tenant_id = ?").bind(tenantOf(c)).first<{ n: number }>();
  if (cap >= 0 && (chNow?.n ?? 0) >= cap) return c.json({ error: `plan limit reached (${cap} channel${cap === 1 ? "" : "s"})` }, 403);
  const body = await c.req.json<{ name?: string }>().catch(() => ({}) as { name?: string });
  const id = await createChannel(c.env.DB, (body.name ?? "").trim() || "New channel", tenantOf(c));
  return c.json({ id });
});

/** Create a display (§ onboarding) — a channel with fresh, composed slide/music/
 *  widget blocks — editable as one thing in the Studio and bound to a screen now
 *  or later. Optionally seed a starter scene. Prep content ahead of pairing. */
app.post("/api/displays", async (c) => {
  const cEnt = await tenantEntitlements(c.env.DB, tenantOf(c));
  const cap = cEnt.quotas.channelsPerProfile * cEnt.quotas.profiles;
  const chNow = await c.env.DB.prepare("SELECT COUNT(*) n FROM channels WHERE tenant_id = ?").bind(tenantOf(c)).first<{ n: number }>();
  if (cap >= 0 && (chNow?.n ?? 0) >= cap) return c.json({ error: `plan limit reached (${cap} channel${cap === 1 ? "" : "s"})` }, 403);
  const body = await c.req.json<{ name?: string; sample?: boolean }>().catch(() => ({}) as { name?: string; sample?: boolean });
  const channelId = await provisionDisplay(c.env, (body.name ?? "").trim() || "New display", tenantOf(c));
  let seeded = false;
  if (body.sample) seeded = await seedSampleDisplay(c.env, channelId, new URL(c.req.url).origin);
  return c.json({ channelId, seeded });
});

/** List the tenant's channels with their slide counts. */
app.get("/api/channels", async (c) => {
  const rows = await listChannels(c.env.DB, tenantOf(c));
  const channels = await Promise.all(
    rows.map(async (ch) => ({ ...ch, tags: parseTags(ch.tags), slideCount: (await listSlides(c.env.DB, ch.id)).length })),
  );
  return c.json({ channels });
});

/** One channel with its ordered slides. */
app.get("/api/channels/:id", async (c) => {
  const channel = await getChannel(c.env.DB, c.req.param("id"));
  if (!owns(c, channel)) return c.json({ error: "not found" }, 404);
  return c.json({ ...channel, slides: await listSlides(c.env.DB, channel!.id) });
});

/** Add a slide (image references an uploaded asset; html carries inline body). */
app.post("/api/channels/:id/slides", async (c) => {
  const channelId = c.req.param("id");
  if (!(await getChannel(c.env.DB, channelId))) return c.json({ error: "no such channel" }, 404);
  const body = await c.req
    .json<{ type?: string; assetHash?: string; assetUrl?: string; htmlBody?: string; durationMs?: number }>()
    .catch(() => ({}) as Record<string, never>);
  const type = body.type === "html" ? "html" : "image";
  if (type === "image" && !body.assetHash) return c.json({ error: "image slide needs an asset" }, 400);
  const id = await addSlide(c.env.DB, channelId, {
    type,
    assetHash: body.assetHash,
    assetUrl: body.assetUrl,
    htmlBody: body.htmlBody,
    durationMs: body.durationMs,
  });
  return c.json({ id });
});

/** Update a slide's duration. */
app.patch("/api/channels/:id/slides/:slideId", async (c) => {
  const body = await c.req.json<{ durationMs?: number | null }>().catch(() => ({}) as { durationMs?: number | null });
  await updateSlideDuration(c.env.DB, c.req.param("slideId"), body.durationMs ?? null, c.req.param("id"));
  return c.json({ ok: true });
});

/** Delete a slide. */
app.delete("/api/channels/:id/slides/:slideId", async (c) => {
  await deleteSlide(c.env.DB, c.req.param("slideId"), { channelId: c.req.param("id") });
  return c.json({ ok: true });
});

/** Reorder a channel's slides (body: ordered slide ids). */
app.post("/api/channels/:id/reorder", async (c) => {
  const body = await c.req.json<{ order?: string[] }>().catch(() => ({}) as { order?: string[] });
  await reorderSlides(c.env.DB, c.req.param("id"), body.order ?? []);
  return c.json({ ok: true });
});

/** Publish channel content: snapshot a new manifest version (§10) + nudge (§9). */
app.post("/api/channels/:id/publish", async (c) => {
  const channelId = c.req.param("id");
  const body = await c.req.json<{ note?: string }>().catch(() => ({}) as { note?: string });
  const published = await publishVersion(c.env, channelId, new URL(c.req.url).origin, {
    note: (body.note ?? "").trim() || "Published",
    publishedBy: callerEmail(c.env, c.req.raw),
  });
  if (!published) return c.json({ error: "unknown channel" }, 404);
  const nudged = await nudgeChannel(c, channelId);
  return c.json({ ...published, nudged });
});

/** Is there anything to publish? (content diff vs the live version, §10). */
app.get("/api/channels/:id/publish-state", async (c) => {
  return c.json(await publishState(c.env, c.req.param("id"), new URL(c.req.url).origin));
});

/** Which channels use a shared building block — drives the "also publish?" prompt
 *  after editing a slide/music playlist, widget profile or ad profile. */
app.get("/api/playlists/:kind/:id/channels", async (c) => {
  const kind = c.req.param("kind");
  if (kind !== "slide" && kind !== "music" && kind !== "widget" && kind !== "ad") return c.json({ error: "bad kind" }, 400);
  const channels = await channelsUsingPlaylist(c.env.DB, kind, c.req.param("id"), tenantOf(c));
  return c.json({ channels });
});

/** Rename a channel and/or set its tags. */
app.put("/api/channels/:id", async (c) => {
  const channelId = c.req.param("id");
  const ch = await getChannel(c.env.DB, channelId);
  if (!ch || ch.tenant_id !== tenantOf(c)) return c.json({ error: "not found" }, 404);
  const b = await c.req.json<{ name?: string; tags?: string[] }>().catch(() => ({}) as { name?: string; tags?: string[] });
  const patch: { name?: string; tags?: string[] } = {};
  if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim().slice(0, 80);
  if (Array.isArray(b.tags)) patch.tags = b.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 24);
  await updateChannel(c.env.DB, channelId, patch);
  return c.json({ ok: true });
});

/** Delete a channel + unassign it from every device (reverting them to fallback). */
app.delete("/api/channels/:id", async (c) => {
  const channelId = c.req.param("id");
  if (channelId === "demo") return c.json({ error: "The demo channel can't be deleted." }, 400);
  const ch = await getChannel(c.env.DB, channelId);
  if (!ch || ch.tenant_id !== tenantOf(c)) return c.json({ error: "not found" }, 404);
  // Revert every device on this channel to its fallback (demo) + nudge, before
  // the row disappears.
  const affected = await screenIdsOnChannel(c.env.DB, channelId);
  await Promise.all(
    affected.map(async (sid) => {
      try { await c.env.SCREEN.get(c.env.SCREEN.idFromString(sid)).setDefaultChannel(null); } catch { /* dead DO */ }
    }),
  );
  await deleteChannel(c.env.DB, channelId);
  await c.env.PAIRING.delete(`manifest:cur:${channelId}`).catch(() => {}); // version pointer
  return c.json({ ok: true, unassigned: affected.length });
});

/* --------------------------- versions & rollback (§10) -------------------- */

/** A channel's version history (newest first) + the live pointer. */
app.get("/api/channels/:id/versions", async (c) => {
  const channelId = c.req.param("id");
  return c.json({ versions: await listVersions(c.env.DB, channelId), current: await currentVersion(c.env, channelId) });
});

/** A specific version's full manifest, for preview/diff. */
app.get("/api/channels/:id/versions/:v", async (c) => {
  const manifest = await getVersionManifest(c.env.DB, c.req.param("id"), Number(c.req.param("v")));
  if (!manifest) return c.json({ error: "no such version" }, 404);
  return c.json(manifest);
});

/** Label (rename) a published version (§10). */
app.put("/api/channels/:id/versions/:v", async (c) => {
  const b = await c.req.json<{ note?: string }>().catch(() => ({}) as { note?: string });
  await setVersionNote(c.env.DB, c.req.param("id"), Number(c.req.param("v")), (b.note ?? "").trim().slice(0, 120));
  return c.json({ ok: true });
});

/** Roll the channel back to an earlier version + nudge (§10). Instant on screens. */
app.post("/api/channels/:id/rollback", async (c) => {
  const channelId = c.req.param("id");
  const body = await c.req.json<{ version?: number }>().catch(() => ({}) as { version?: number });
  const result = await rollbackTo(c.env, channelId, Number(body.version));
  if (!result.ok) return c.json({ error: "no such version" }, 404);
  const nudged = await nudgeChannel(c, channelId);
  return c.json({ ...result, nudged });
});

/* ------------------------------- media (R2, §2) --------------------------- */

/** Upload a media asset; stored in R2 by content hash (immutable, dedup). */
app.put("/api/assets", async (c) => {
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) return c.json({ error: "empty body" }, 400);
  const hash = await contentHash(bytes);
  const mime = c.req.header("content-type") ?? "application/octet-stream";
  // Content-addressed: re-putting identical bytes under the same hash is a no-op.
  await c.env.MEDIA.put(hash, bytes, { httpMetadata: { contentType: mime } });
  return c.json({ hash, url: `/api/assets/${hash}`, mime, bytes: bytes.byteLength });
});

/** Serve a content-addressed asset from R2 (immutable). */
app.get("/api/assets/:hash", async (c) => {
  const obj = await c.env.MEDIA.get(c.req.param("hash"));
  if (!obj) return c.text("not found", 404);
  return c.body(obj.body, 200, {
    "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: obj.httpEtag,
  });
});

/** Demo slide assets (stand-in for R2-served, content-hashed media). */
app.get("/api/demo/asset/:name", (c) => {
  const name = c.req.param("name").replace(/\.svg$/, "");
  const svg = demoAssetSvg(name);
  if (!svg) return c.text("not found", 404);
  return c.body(svg, 200, {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "public, max-age=31536000, immutable",
  });
});

/** Fleet-view status for one screen (§23). */
app.get("/api/screen/:doId/status", async (c) => {
  let id: DurableObjectId;
  try {
    id = c.env.SCREEN.idFromString(c.req.param("doId"));
  } catch {
    return c.json({ error: "bad screen id" }, 400);
  }
  return c.json(await c.env.SCREEN.get(id).status());
});

/** Remote command to a screen (§11): mute/refresh/screensaver/switch, now or scheduled. */
app.post("/api/screens/:id/command", async (c) => {
  // Scope the command to the caller's tenant — the DO id alone must not authorize
  // control of another tenant's screen.
  const row = await getScreen(c.env.DB, c.req.param("id"));
  if (!owns(c, row)) return c.json({ error: "not found" }, 404);
  let id: DurableObjectId;
  try {
    id = c.env.SCREEN.idFromString(c.req.param("id"));
  } catch {
    return c.json({ error: "bad screen id" }, 400);
  }
  const body = await c.req
    .json<{ action?: string; at?: number; channelId?: string }>()
    .catch(() => ({}) as { action?: string; at?: number; channelId?: string });
  const allowed = ["mute", "unmute", "refresh", "screensaver.on", "screensaver.off", "switch_channel", "debug.on", "debug.off"] as const;
  if (!allowed.includes(body.action as (typeof allowed)[number])) return c.json({ error: "unknown action" }, 400);
  const result = await c.env.SCREEN.get(id).command(body.action as (typeof allowed)[number], body.at ?? null, body.channelId);
  return c.json(result);
});

/* --------------------------------- feeds (§19) ---------------------------- */

const SOURCE_PROVIDERS = new Set(["manual", "rss", "api", "gsheet"]);

app.post("/api/feeds", async (c) => {
  const fEnt = await tenantEntitlements(c.env.DB, tenantOf(c));
  const usedFeeds = await c.env.DB.prepare("SELECT COUNT(*) n FROM feeds WHERE tenant_id = ?").bind(tenantOf(c)).first<{ n: number }>();
  if (fEnt.quotas.feeds >= 0 && (usedFeeds?.n ?? 0) >= fEnt.quotas.feeds) return c.json({ error: fEnt.quotas.feeds === 0 ? "data sources not in plan" : `plan limit reached (${fEnt.quotas.feeds} sources)` }, 403);
  const body = await c.req.json<{ name?: string; provider?: string; config?: unknown; refreshSec?: number }>().catch(() => ({}) as Record<string, never>);
  const provider = (SOURCE_PROVIDERS.has(body.provider ?? "") ? body.provider : "manual") as "manual" | "rss" | "api" | "gsheet";
  const id = await createFeed(c.env.DB, { name: (body.name ?? "").trim() || "Source", provider, config: body.config, refreshSec: body.refreshSec, minRefreshSec: fEnt.quotas.feedRefreshMinSec, tenantId: tenantOf(c) });
  // Prime the cache so the source has data the moment it's bound.
  const feed = await getFeed(c.env.DB, id);
  if (feed) {
    if (provider === "rss") await refreshRss(c.env.DB, feed).catch(() => 0);
    else if (provider === "api" || provider === "gsheet") await refreshFeedSource(c.env.DB, feed).catch(() => 0);
  }
  return c.json({ id });
});

/** Dry-run: fetch + normalize a source's config without saving, so the builder
 *  can preview columns/rows while the operator maps fields. */
app.post("/api/feeds/preview", async (c) => {
  const body = await c.req.json<{ provider?: string; config?: unknown }>().catch(() => ({}) as Record<string, never>);
  const provider = (SOURCE_PROVIDERS.has(body.provider ?? "") ? body.provider : "manual") as string;
  const probe: FeedRow = { id: "preview", tenant_id: tenantOf(c), name: "preview", provider, config_json: JSON.stringify(body.config ?? {}), refresh_sec: 900, updated_at: Date.now() };
  try {
    const ds = await computeDataset(c.env.DB, probe);
    return c.json({ dataset: { columns: ds.columns, rows: ds.rows.slice(0, 50) }, rowCount: ds.rows.length });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "fetch failed" }, 502);
  }
});

app.get("/api/feeds", async (c) => {
  const feeds = await listFeeds(c.env.DB, tenantOf(c));
  const withCounts = await Promise.all(feeds.map(async (f) => {
    const tabular = f.provider === "api" || f.provider === "gsheet";
    const rowCount = tabular
      ? (safeJson<{ rows?: unknown[] }>(f.data_json, {}).rows?.length ?? 0)
      : (await listItems(c.env.DB, f.id)).length;
    // A single malformed config/data row must not 500 the whole list.
    return { id: f.id, name: f.name, provider: f.provider, config: safeJson<unknown>(f.config_json, {}), refreshSec: f.refresh_sec, itemCount: rowCount, updatedAt: f.updated_at, dataAt: f.data_at ?? null };
  }));
  return c.json({ feeds: withCounts });
});

app.get("/api/feeds/:id", async (c) => {
  const feed = await getFeed(c.env.DB, c.req.param("id"));
  if (!owns(c, feed)) return c.json({ error: "not found" }, 404);
  const tabular = feed!.provider === "api" || feed!.provider === "gsheet";
  return c.json({
    id: feed!.id, name: feed!.name, provider: feed!.provider, config: safeJson<unknown>(feed!.config_json, {}), refreshSec: feed!.refresh_sec,
    items: tabular ? [] : await listItems(c.env.DB, feed!.id),
    dataset: tabular ? await getDataset(c.env.DB, feed!.id) : undefined,
    dataAt: feed!.data_at ?? null,
  });
});

app.put("/api/feeds/:id", async (c) => {
  const feed = await getFeed(c.env.DB, c.req.param("id"));
  if (!owns(c, feed)) return c.json({ error: "not found" }, 404);
  const body = await c.req.json<{ name?: string; config?: unknown; refreshSec?: number }>().catch(() => ({}) as Record<string, never>);
  const fuEnt = await tenantEntitlements(c.env.DB, tenantOf(c));
  await updateFeed(c.env.DB, feed!.id, { name: body.name, config: body.config, refreshSec: body.refreshSec, minRefreshSec: fuEnt.quotas.feedRefreshMinSec });
  if (feed!.provider === "api" || feed!.provider === "gsheet") {
    const updated = await getFeed(c.env.DB, feed!.id);
    if (updated) await refreshFeedSource(c.env.DB, updated).catch(() => 0);
  }
  return c.json({ ok: true });
});

/** Items only — polled by ticker/text widgets on screens (manual/rss). */
app.get("/api/feeds/:id/items", async (c) => c.json({ items: await listItems(c.env.DB, c.req.param("id")) }));

/** Normalized {columns,rows} dataset — polled by source-bound widgets on screens. */
app.get("/api/feeds/:id/data", async (c) => c.json({ dataset: await getDataset(c.env.DB, c.req.param("id")) }));

app.post("/api/feeds/:id/items", async (c) => {
  const feed = await getFeed(c.env.DB, c.req.param("id"));
  if (!owns(c, feed)) return c.json({ error: "not found" }, 404);
  const body = await c.req.json<{ title?: string; link?: string }>().catch(() => ({}) as { title?: string; link?: string });
  if (!body.title?.trim()) return c.json({ error: "title required" }, 400);
  await addItem(c.env.DB, c.req.param("id"), body.title.trim(), body.link);
  return c.json({ ok: true });
});

app.delete("/api/feeds/:id/items/:itemId", async (c) => {
  const feed = await getFeed(c.env.DB, c.req.param("id"));
  if (!owns(c, feed)) return c.json({ error: "not found" }, 404);
  await deleteItem(c.env.DB, c.req.param("id"), c.req.param("itemId"));
  return c.json({ ok: true });
});

app.post("/api/feeds/:id/refresh", async (c) => {
  const feed = await getFeed(c.env.DB, c.req.param("id"));
  if (!feed || !owns(c, feed)) return c.json({ error: "not found" }, 404);
  try {
    const count = feed.provider === "rss" ? await refreshRss(c.env.DB, feed)
      : feed.provider === "api" || feed.provider === "gsheet" ? await refreshFeedSource(c.env.DB, feed)
      : 0;
    return c.json({ count });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "refresh failed" }, 502);
  }
});

app.delete("/api/feeds/:id", async (c) => {
  const feed = await getFeed(c.env.DB, c.req.param("id"));
  if (!owns(c, feed)) return c.json({ error: "not found" }, 404);
  await deleteFeed(c.env.DB, c.req.param("id"));
  return c.json({ ok: true });
});

/* ------------------------------ music (§16) ------------------------------- */

/** A channel's ordered music playlist. */
app.get("/api/channels/:id/tracks", async (c) => c.json({ tracks: await listTracks(c.env.DB, c.req.param("id")) }));

/** Add a track (audio already uploaded to R2 via /api/assets). */
app.post("/api/channels/:id/tracks", async (c) => {
  const channelId = c.req.param("id");
  if (!(await getChannel(c.env.DB, channelId))) return c.json({ error: "no such channel" }, 404);
  const body = await c.req
    .json<{ title?: string; assetHash?: string; assetUrl?: string; durationMs?: number; artist?: string; artHash?: string; artUrl?: string }>()
    .catch(() => ({}) as Record<string, never>);
  if (!body.assetHash || !body.assetUrl) return c.json({ error: "track needs an uploaded asset" }, 400);
  if (!(body.durationMs && body.durationMs > 0)) return c.json({ error: "track needs a duration" }, 400);
  const id = await addTrack(c.env.DB, channelId, { title: (body.title ?? "").trim() || "Track", assetHash: body.assetHash, assetUrl: body.assetUrl, durationMs: body.durationMs, artist: body.artist, artHash: body.artHash, artUrl: body.artUrl });
  await nudgeChannel(c, channelId); // music timeline changed — refetch
  return c.json({ id });
});

/** Delete a track + republish. */
app.delete("/api/channels/:id/tracks/:trackId", async (c) => {
  await deleteTrack(c.env.DB, c.req.param("trackId"), c.req.param("id"));
  await nudgeChannel(c, c.req.param("id"));
  return c.json({ ok: true });
});

/** Reorder a channel's tracks (body: ordered ids) + republish. */
app.post("/api/channels/:id/tracks/reorder", async (c) => {
  const body = await c.req.json<{ order?: string[] }>().catch(() => ({}) as { order?: string[] });
  await reorderTracks(c.env.DB, c.req.param("id"), body.order ?? []);
  await nudgeChannel(c, c.req.param("id"));
  return c.json({ ok: true });
});

/* -------------------- licensed music library (§16 ext) -------------------- */

/** Browse the admin-curated library (feature-gated). Returns gating info too so
 *  the UI can show the plan limit and what's left. */
app.get("/api/library", async (c) => {
  const ent = await tenantEntitlements(c.env.DB, tenantOf(c));
  if (!ent.features.musicLibrary) return c.json({ enabled: false, limit: 0, used: 0, genres: [], tracks: [] });
  const genre = c.req.query("genre") || undefined;
  const [tracks, genres, used] = await Promise.all([
    listLibrary(c.env.DB, genre),
    listGenres(c.env.DB),
    countLibraryUsage(c.env.DB, tenantOf(c)),
  ]);
  return c.json({ enabled: true, limit: ent.quotas.libraryTracks, used, genres, tracks });
});

/** Add a library track into a channel's playlist by reference (quota-enforced). */
app.post("/api/channels/:id/library/:libraryId", async (c) => {
  const channelId = c.req.param("id");
  const libraryId = c.req.param("libraryId");
  const ent = await tenantEntitlements(c.env.DB, tenantOf(c));
  if (!ent.features.musicLibrary) return c.json({ error: "music library not in plan" }, 403);
  if (!(await getChannel(c.env.DB, channelId))) return c.json({ error: "no such channel" }, 404);
  const lib = await getLibraryTrack(c.env.DB, libraryId);
  if (!lib) return c.json({ error: "no such library track" }, 404);

  const used = await countLibraryUsage(c.env.DB, tenantOf(c));
  const already = (await listTracks(c.env.DB, channelId)).some((t) => t.library_id === libraryId);
  // A track already counted anywhere for this tenant doesn't re-consume the cap.
  const alreadyUsedByTenant = used > 0 && (await tenantUsesLibrary(c.env.DB, libraryId, tenantOf(c)));
  if (!canAddLibraryTrack(used, ent.quotas.libraryTracks, alreadyUsedByTenant)) {
    return c.json({ error: "library limit reached", limit: ent.quotas.libraryTracks, used }, 402);
  }
  const id = await addTrack(c.env.DB, channelId, {
    title: lib.title,
    artist: lib.artist || undefined,
    assetHash: lib.asset_hash,
    assetUrl: lib.asset_url,
    durationMs: lib.duration_ms,
    artHash: lib.art_hash ?? undefined,
    artUrl: lib.art_url ?? undefined,
    libraryId,
  });
  await nudgeChannel(c, channelId); // music timeline changed — refetch
  return c.json({ id, alreadyOnChannel: already });
});

/** Whether the tenant already references a given library track anywhere. */
async function tenantUsesLibrary(db: D1Database, libraryId: string, tenantId: string): Promise<boolean> {
  const row = await db.prepare("SELECT 1 FROM tracks WHERE tenant_id = ? AND library_id = ? LIMIT 1").bind(tenantId, libraryId).first();
  return !!row;
}

/* ------------------------------- ads (§21) -------------------------------- */

/** Re-configure the ChannelDO's ad rotation from the current enabled ads. */
async function syncChannelAds(env: Env, channelId: string): Promise<void> {
  const schedules = await enabledAdSchedules(env.DB, channelId);
  await env.CHANNEL.get(env.CHANNEL.idFromName(channelId)).setAds(channelId, schedules);
}

/** Re-sync every channel that binds a profile (ads are shared via the profile). */
async function syncProfileChannels(env: Env, profileId: string): Promise<void> {
  const channelIds = await channelsUsingAdProfile(env.DB, profileId);
  await Promise.all(channelIds.map((id) => syncChannelAds(env, id)));
}

/* --- ad profiles: reusable rotations bound by channels --- */
app.get("/api/ad-profiles", async (c) => c.json({ profiles: await listAdProfiles(c.env.DB, tenantOf(c)) }));

app.post("/api/ad-profiles", async (c) => {
  const apEnt = await tenantEntitlements(c.env.DB, tenantOf(c));
  if (!apEnt.features.ads) return c.json({ error: "ads not in plan" }, 403);
  const body = await c.req.json<{ name?: string }>().catch(() => ({}) as { name?: string });
  const id = await createAdProfile(c.env.DB, (body.name ?? "").trim() || "Ad profile", tenantOf(c));
  return c.json({ id });
});

app.get("/api/ad-profiles/:id", async (c) => {
  const p = await getAdProfile(c.env.DB, c.req.param("id"));
  if (!p || p.tenant_id !== tenantOf(c)) return c.json({ error: "not found" }, 404);
  const tags = p.tags ? (JSON.parse(p.tags) as string[]) : [];
  return c.json({ ...p, tags, ads: await listAds(c.env.DB, p.id) });
});

app.put("/api/ad-profiles/:id", async (c) => {
  const p = await getAdProfile(c.env.DB, c.req.param("id"));
  if (!p || p.tenant_id !== tenantOf(c)) return c.json({ error: "not found" }, 404);
  const body = await c.req.json<{ name?: string; tags?: string[] }>().catch(() => ({}) as { name?: string; tags?: string[] });
  await updateAdProfile(c.env.DB, p.id, body);
  return c.json({ ok: true });
});

app.delete("/api/ad-profiles/:id", async (c) => {
  const p = await getAdProfile(c.env.DB, c.req.param("id"));
  if (!p || p.tenant_id !== tenantOf(c)) return c.json({ error: "not found" }, 404);
  await deleteAdProfile(c.env.DB, p.id);
  await syncProfileChannels(c.env, p.id); // detached channels drop the rotation
  return c.json({ ok: true });
});

/** List a profile's ads. */
app.get("/api/ad-profiles/:id/ads", async (c) => {
  const p = await getAdProfile(c.env.DB, c.req.param("id"));
  if (!p || p.tenant_id !== tenantOf(c)) return c.json({ error: "not found" }, 404);
  return c.json({ ads: await listAds(c.env.DB, p.id) });
});

/** Create an ad in a profile (§21). Gated behind the ads feature (§25). */
app.post("/api/ad-profiles/:id/ads", async (c) => {
  const ent = await tenantEntitlements(c.env.DB, tenantOf(c));
  if (!ent.features.ads) return c.json({ error: "ads not in plan" }, 403);
  const p = await getAdProfile(c.env.DB, c.req.param("id"));
  if (!p || p.tenant_id !== tenantOf(c)) return c.json({ error: "not found" }, 404);
  const body = await c.req
    .json<{ name?: string; kind?: string; audioUrl?: string; videoUrl?: string; html?: string; durationMs?: number; everyMin?: number; hideBadge?: boolean; companionUrl?: string }>()
    .catch(() => ({}) as Record<string, never>);
  const kind = body.kind === "video" ? "video" : body.kind === "command" ? "command" : "audio";
  const id = await createAd(c.env.DB, {
    profileId: p.id,
    tenantId: tenantOf(c),
    name: (body.name ?? "").trim() || "Ad",
    kind,
    audioUrl: body.audioUrl,
    videoUrl: body.videoUrl,
    html: body.html,
    durationMs: body.durationMs ?? 8000,
    everyMin: body.everyMin ?? 10,
    hideBadge: body.hideBadge,
    companionUrl: body.companionUrl,
  });
  await syncProfileChannels(c.env, p.id);
  return c.json({ id });
});

/** Toggle an ad on/off (re-arms every channel bound to its profile). */
app.post("/api/ads/:adId/toggle", async (c) => {
  const ad = await getAd(c.env.DB, c.req.param("adId"));
  if (!ad || !owns(c, ad)) return c.json({ error: "not found" }, 404);
  await setAdEnabled(c.env.DB, ad.id, ad.enabled !== 1);
  if (ad.profile_id) await syncProfileChannels(c.env, ad.profile_id);
  return c.json({ ok: true, enabled: ad.enabled !== 1 });
});

/** Delete an ad. */
app.delete("/api/ads/:adId", async (c) => {
  const ad = await getAd(c.env.DB, c.req.param("adId"));
  if (!ad || !owns(c, ad)) return c.json({ error: "not found" }, 404);
  await deleteAd(c.env.DB, ad.id);
  if (ad.profile_id) await syncProfileChannels(c.env, ad.profile_id);
  return c.json({ ok: true });
});

/** Play an ad now: epoch-stamp + fan out to every screen on every channel that
 *  binds the ad's profile, immediately. */
app.post("/api/ads/:adId/play", async (c) => {
  const ad = await getAd(c.env.DB, c.req.param("adId"));
  if (!ad || !owns(c, ad)) return c.json({ error: "not found" }, 404);
  const channelIds = ad.profile_id ? await channelsUsingAdProfile(c.env.DB, ad.profile_id) : [];
  const counts = await Promise.all(
    channelIds.map((cid) => c.env.CHANNEL.get(c.env.CHANNEL.idFromName(cid)).playNow(cid, ad.id).then((r) => Math.max(0, r.screens)).catch(() => 0)),
  );
  const screens = counts.reduce((a, b) => a + b, 0);
  return c.json({ ok: true, screens, channels: channelIds.length });
});

/* ------------------------------ weather (§17) ----------------------------- */
// Weather is a company-provided, metered data source (see Sources). The
// platform OpenWeather key lives in admin config; each real fetch costs
// weather.credits_per_call and only fires hourly within a location's
// opening-hours window. Screens read the cache; they never trigger a fetch.

/** Weather availability + price, for the Sources UI (no secrets returned). */
app.get("/api/weather/config", async (c) => {
  const cfg = await weatherConfig(c.env.DB);
  return c.json({ hasKey: weatherConfigured(cfg), creditsPerCall: cfg.creditsPerCall });
});

/** City → coordinates (for the "add location" flow). */
app.post("/api/weather/geocode", async (c) => {
  const body = await c.req.json<{ q?: string }>().catch(() => ({}) as { q?: string });
  if (!body.q?.trim()) return c.json({ error: "query required" }, 400);
  const g = await geocode(c.env.DB, body.q.trim());
  if (!g) return c.json({ error: "not found" }, 404);
  return c.json(g);
});

/** The tenant's weather locations + a cached preview + projected daily cost. */
app.get("/api/weather", async (c) => {
  const cfg = await weatherConfig(c.env.DB);
  const sources = await listSources(c.env.DB, tenantOf(c));
  const locations = await Promise.all(
    sources.map(async (s) => ({ ...s, current: (await readCache(c.env.DB, s.id))?.current ?? null, callsPerDay: callsPerDay(s), dailyCredits: callsPerDay(s) * cfg.creditsPerCall })),
  );
  return c.json({ locations, creditsPerCall: cfg.creditsPerCall });
});

/** Add a location (by coordinates, or a city name we geocode). Fetches once. */
app.post("/api/weather", async (c) => {
  const wEnt = await tenantEntitlements(c.env.DB, tenantOf(c));
  if (!wEnt.features.weather.length) return c.json({ error: "weather not in plan" }, 403);
  const body = await c.req.json<{ label?: string; lat?: number; lon?: number; city?: string; openHour?: number; closeHour?: number; tz?: string; units?: string }>().catch(() => ({}) as Record<string, never>);
  let label = (body.label ?? "").trim();
  let lat = body.lat;
  let lon = body.lon;
  if ((lat == null || lon == null) && body.city?.trim()) {
    const g = await geocode(c.env.DB, body.city.trim());
    if (!g) return c.json({ error: "could not locate that place" }, 404);
    lat = g.lat;
    lon = g.lon;
    if (!label) label = g.label;
  }
  if (lat == null || lon == null) return c.json({ error: "coordinates or a city are required" }, 400);
  const id = await createSource(c.env.DB, { label: label || "Location", lat, lon, openHour: body.openHour, closeHour: body.closeHour, tz: body.tz, units: body.units, tenantId: tenantOf(c) });
  const src = await getSource(c.env.DB, id);
  if (src) await refreshSource(c.env, src).catch(() => undefined);
  return c.json({ id });
});

/** Edit a location's label / opening-hours / timezone / units. */
app.patch("/api/weather/:id", async (c) => {
  const src = await getSource(c.env.DB, c.req.param("id"));
  if (!owns(c, src)) return c.json({ error: "not found" }, 404);
  const body = await c.req.json<{ label?: string; openHour?: number; closeHour?: number; tz?: string; units?: string }>().catch(() => ({}) as Record<string, never>);
  await updateSource(c.env.DB, src!.id, body);
  return c.json({ ok: true });
});

app.delete("/api/weather/:id", async (c) => {
  if (!owns(c, await getSource(c.env.DB, c.req.param("id")))) return c.json({ error: "not found" }, 404);
  await deleteSource(c.env.DB, c.req.param("id"));
  return c.json({ ok: true });
});

/** Manual refresh — a user-initiated metered fetch (charged like the cron). */
app.post("/api/weather/:id/refresh", async (c) => {
  const src = await getSource(c.env.DB, c.req.param("id"));
  if (!owns(c, src)) return c.json({ error: "not found" }, 404);
  // This spends credits (chargeCall), so gate it on the plan like the create route.
  const wrEnt = await tenantEntitlements(c.env.DB, tenantOf(c));
  if (!wrEnt.features.weather.length) return c.json({ error: "weather not in plan" }, 403);
  const data = await refreshSource(c.env, src!);
  return c.json({ ok: true, current: data.current });
});

/** Cached conditions for a location — polled by the weather widget on screens.
 *  Cache-only: never triggers a billed fetch (the cron owns refreshing, gated to
 *  opening hours), so screen polling can't drive spend or bypass the window. */
app.get("/api/weather/:id/current", async (c) => {
  const id = c.req.param("id");
  const src = await getSource(c.env.DB, id);
  if (!src) return c.json({ error: "not found" }, 404);
  // Self-heal on read so a screen is never blank waiting on the (in-hours,
  // hourly, deploy-only) cron: prime the cache the first time it's requested,
  // and refresh it at most hourly while the location is within opening hours.
  // refreshSource meters + honors affordability, and mocks for free with no key.
  let data = await readCache(c.env.DB, id);
  const ageMs = data ? Date.now() - data.updatedAt : Infinity;
  if (!data || (ageMs > 3_600_000 && withinOpenHours(src))) {
    data = await refreshSource(c.env, src).catch(() => data);
  }
  if (!data) return c.json({ error: "no data" }, 503);
  c.header("Cache-Control", "no-store");
  return c.json(data);
});

/* ------------------------------ alerts (§23) ------------------------------ */

app.get("/api/alerts", async (c) => c.json({ alerts: await listAlerts(c.env.DB, tenantOf(c)) }));
app.get("/api/alerts/rules", async (c) => c.json({ rules: await listAlertRules(c.env.DB, tenantOf(c)) }));

app.post("/api/alerts/rules", async (c) => {
  const body = await c.req.json<{ type?: string; thresholdSec?: number; channel?: string; target?: string }>().catch(() => ({}) as Record<string, never>);
  const channel = body.channel === "webhook" ? "webhook" : body.channel === "email" ? "email" : "dashboard";
  // Gate the delivery channel on the plan's allowed alert channels (§ alerting).
  const aEnt = await tenantEntitlements(c.env.DB, tenantOf(c));
  if (!aEnt.features.alerting.includes(channel)) {
    return c.json({ error: `${channel} alerts aren't included in your plan`, allowed: aEnt.features.alerting }, 403);
  }
  const id = await addAlertRule(c.env.DB, tenantOf(c), {
    type: body.type ?? "offline",
    thresholdSec: body.thresholdSec ?? 90,
    channel,
    target: body.target,
  });
  return c.json({ id });
});

app.delete("/api/alerts/rules/:id", async (c) => {
  await deleteAlertRule(c.env.DB, c.req.param("id"), tenantOf(c));
  return c.json({ ok: true });
});

/* ------------------------------ live boards (§20) ------------------------- */

/** Create a queue or room board. */
/** Normalize a queue board's counters: stable `c<number>` ids (that number is
 *  what the announcement's {counter} slot reads and what a station calls to),
 *  unique, at least one, capped. New/invalid ids get the next free number. */
function sanitizeCounters(input: unknown): { id: string; name: string }[] {
  const arr = Array.isArray(input) ? input : [];
  const used = new Set<number>();
  const out: { id: string; name: string }[] = [];
  let next = 1;
  for (const raw of arr.slice(0, 24)) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const idStr = typeof r.id === "string" ? r.id : "";
    let n = /^c\d+$/.test(idStr) ? parseInt(idStr.slice(1), 10) : NaN;
    if (!Number.isFinite(n) || used.has(n)) { while (used.has(next)) next++; n = next; }
    used.add(n);
    const name = (typeof r.name === "string" ? r.name : "").trim() || `Counter ${n}`;
    out.push({ id: `c${n}`, name });
  }
  return out.length ? out : [{ id: "c1", name: "Counter 1" }];
}

/** Normalize a room board's status palette: a slug id (from the id or label),
 *  a non-empty label, a colour, unique ids, capped, at least one. */
function sanitizeStatuses(input: unknown): { id: string; label: string; color: string }[] {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const arr = Array.isArray(input) ? input : [];
  const used = new Set<string>();
  const out: { id: string; label: string; color: string }[] = [];
  for (const raw of arr.slice(0, 16)) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const label = (typeof r.label === "string" ? r.label : "").trim() || "Status";
    let id = slug(typeof r.id === "string" ? r.id : "") || slug(label) || "status";
    const base = id; let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    const color = (typeof r.color === "string" ? r.color : "").trim() || "oklch(0.6 0.02 300)";
    out.push({ id, label, color });
  }
  return out.length ? out : [{ id: "ready", label: "Ready", color: "oklch(0.68 0.16 155)" }];
}

/** Normalize a room board's rooms: a stable id, a name, a status that exists in
 *  the palette (new/invalid rooms start at the first status), unique, capped. */
function sanitizeRooms(input: unknown, statuses: { id: string }[]): { id: string; name: string; status: string }[] {
  const arr = Array.isArray(input) ? input : [];
  const valid = new Set(statuses.map((s) => s.id));
  const fallback = statuses[0]?.id ?? "ready";
  const used = new Set<string>();
  const out: { id: string; name: string; status: string }[] = [];
  let next = 1;
  for (const raw of arr.slice(0, 64)) {
    const r = (raw ?? {}) as Record<string, unknown>;
    let id = (typeof r.id === "string" ? r.id : "").trim();
    if (!id || used.has(id)) { while (used.has(`r${next}`)) next++; id = `r${next++}`; }
    used.add(id);
    const name = (typeof r.name === "string" ? r.name : "").trim() || id;
    const status = typeof r.status === "string" && valid.has(r.status) ? r.status : fallback;
    out.push({ id, name, status });
  }
  return out.length ? out : [{ id: "r1", name: "Room 1", status: fallback }];
}

/** Normalize a score board's sides: a stable id, a name, an optional short code +
 *  colour, unique ids, capped, at least two (a match needs two competitors). */
function sanitizeSides(input: unknown): { id: string; name: string; short: string; color: string; score: number }[] {
  const arr = Array.isArray(input) ? input : [];
  const used = new Set<string>();
  const out: { id: string; name: string; short: string; color: string; score: number }[] = [];
  let next = 1;
  for (const raw of arr.slice(0, 8)) {
    const r = (raw ?? {}) as Record<string, unknown>;
    let id = (typeof r.id === "string" ? r.id : "").trim();
    if (!id || used.has(id)) { while (used.has(`s${next}`)) next++; id = `s${next++}`; }
    used.add(id);
    const name = (typeof r.name === "string" ? r.name : "").trim() || id;
    const short = (typeof r.short === "string" ? r.short : "").trim().slice(0, 6);
    const color = (typeof r.color === "string" ? r.color : "").trim();
    // Score is preserved by id inside ScoreDO.configure; new sides start at 0.
    out.push({ id, name, short, color, score: 0 });
  }
  while (out.length < 2) { const id = `s${next++}`; out.push({ id, name: out.length === 0 ? "Home" : "Away", short: "", color: "", score: 0 }); }
  return out;
}

/** The stored counters of a queue board (defaulting to one). */
function queueCounters(configJson: string): { id: string; name: string }[] {
  try { return sanitizeCounters((JSON.parse(configJson) as { counters?: unknown }).counters); }
  catch { return [{ id: "c1", name: "Counter 1" }]; }
}

app.post("/api/boards", async (c) => {
  const bEnt = await tenantEntitlements(c.env.DB, tenantOf(c));
  if (!bEnt.features.roomQueueManagement) return c.json({ error: "live boards not in plan" }, 403);
  const usedBoards = await c.env.DB.prepare("SELECT COUNT(*) n FROM boards WHERE tenant_id = ?").bind(tenantOf(c)).first<{ n: number }>();
  if (bEnt.quotas.liveBoards >= 0 && (usedBoards?.n ?? 0) >= bEnt.quotas.liveBoards) return c.json({ error: `plan limit reached (${bEnt.quotas.liveBoards} live boards)` }, 403);
  const body = await c.req
    .json<{ kind?: string; name?: string; config?: unknown }>()
    .catch(() => ({}) as { kind?: string; name?: string; config?: unknown });
  const kind = body.kind === "room" ? "room" : body.kind === "score" ? "score" : "queue";
  const id = `bd_${randomHex(8)}`;
  const name = (body.name ?? "").trim() || (kind === "queue" ? "Queue" : kind === "room" ? "Rooms" : "Scoreboard");
  // Every board has at least one controllable option so it gets a station user:
  // a queue defaults to one counter, a room to its rooms, a scoreboard to its sides.
  const config = { ...((body.config ?? {}) as Record<string, unknown>) };
  if (kind === "queue" && !Array.isArray(config.counters)) config.counters = [{ id: "c1", name: "Counter 1" }];
  if (kind === "score" && !Array.isArray(config.sides)) {
    config.sides = [{ id: "home", name: "Home", short: "HOME" }, { id: "away", name: "Away", short: "AWAY" }];
  }
  await createBoard(c.env.DB, { id, kind, name, config, tenantId: tenantOf(c) });

  if (kind === "queue") {
    const cfg = config as { prefix?: string; categories?: import("@scena/protocol").QueueCategory[] };
    await c.env.QUEUE.get(c.env.QUEUE.idFromName(id)).init({ prefix: cfg.prefix, categories: cfg.categories });
  } else if (kind === "room") {
    const cfg = config as Parameters<import("./board-do.js").RoomBoardDO["init"]>[0];
    await c.env.ROOM.get(c.env.ROOM.idFromName(id)).init(cfg);
  } else {
    const cfg = config as Parameters<import("./board-do.js").ScoreDO["init"]>[0];
    await c.env.SCORE.get(c.env.SCORE.idFromName(id)).init(cfg);
  }
  // Provision the coordinator + one station user per option (§boards).
  const board = await getBoard(c.env.DB, id);
  if (board) await syncBoardUsers(c.env.DB, tenantOf(c), board);
  return c.json({ id, kind, name });
});

/** Delete a board + all of its auto-provisioned users (§boards). */
app.delete("/api/boards/:id", async (c) => {
  const row = await getBoard(c.env.DB, c.req.param("id"));
  if (!owns(c, row)) return c.json({ error: "not found" }, 404);
  await deleteBoardUsers(c.env.DB, row!.id);
  await c.env.DB.prepare("DELETE FROM boards WHERE id = ?").bind(row!.id).run();
  return c.json({ ok: true });
});

/** Operator: the board's auto-issued logins (coordinator + per-station), so the
 *  admin can hand them out. Reconciles to the current options first (§boards). */
app.get("/api/boards/:id/users", async (c) => {
  const row = await getBoard(c.env.DB, c.req.param("id"));
  if (!owns(c, row)) return c.json({ error: "not found" }, 404);
  await syncBoardUsers(c.env.DB, tenantOf(c), row!);
  const users = (await listBoardUsers(c.env.DB, row!.id)).map((u) => ({ id: u.id, kind: u.kind, stationId: u.station_id, label: u.label, username: u.username }));
  return c.json({ users });
});

/** Operator: regenerate one board user's password. */
app.post("/api/boards/:id/users/:rid/regenerate", async (c) => {
  const row = await getBoard(c.env.DB, c.req.param("id"));
  if (!owns(c, row)) return c.json({ error: "not found" }, 404);
  const password = await regenerateBoardUserPassword(c.env.DB, row!.id, c.req.param("rid"));
  if (!password) return c.json({ error: "not found" }, 404);
  return c.json({ password });
});

/** List the tenant's boards with their live state. */
app.get("/api/boards", async (c) => {
  const rows = await listBoards(c.env.DB, tenantOf(c));
  const boards = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      state: await boardState(c, row.id, row.kind),
      counters: row.kind === "queue" ? queueCounters(row.config_json) : undefined,
    })),
  );
  return c.json({ boards });
});

/** One board: config + live state. */
app.get("/api/boards/:id", async (c) => {
  const row = await getBoard(c.env.DB, c.req.param("id"));
  if (!owns(c, row)) return c.json({ error: "not found" }, 404);
  return c.json({ id: row!.id, kind: row!.kind, name: row!.name, state: await boardState(c, row!.id, row!.kind) });
});

/** Public, token-gated live read (§boards) — the kiosk + any board-scoped
 *  surface fetch name + live state without an operator session. A valid kiosk /
 *  station token (or a signed-in board user) grants the board. */
app.get("/api/boards/:id/live", async (c) => {
  const boardId = c.req.param("id");
  const row = await getBoard(c.env.DB, boardId);
  if (!row) return c.json({ error: "no such board" }, 404);
  if (!(await canControlBoard(c, boardId, c.req.query("token")))) return c.json({ error: "unauthorized" }, 403);
  // Include the brand kit so token-gated surfaces (kiosk / control apps) follow
  // the workspace brand without a session.
  return c.json({ id: row.id, kind: row.kind, name: row.name, state: await boardState(c, row.id, row.kind), branding: await getBranding(c.env.DB, row.tenant_id) });
});

/** WebSocket subscribe for screens (§20). Routed to the board DO. */
app.get("/api/boards/:id/subscribe", async (c) => {
  const row = await getBoard(c.env.DB, c.req.param("id"));
  if (!row) return c.text("no such board", 404);
  const id = row.id;
  if (row.kind === "queue") return c.env.QUEUE.get(c.env.QUEUE.idFromName(id)).fetch(c.req.raw);
  if (row.kind === "score") return c.env.SCORE.get(c.env.SCORE.idFromName(id)).fetch(c.req.raw);
  return c.env.ROOM.get(c.env.ROOM.idFromName(id)).fetch(c.req.raw);
});

/** Mint a board-scoped Station token (§20). */
app.post("/api/boards/:id/station", async (c) => {
  const row = await getBoard(c.env.DB, c.req.param("id"));
  if (!owns(c, row)) return c.json({ error: "no such board" }, 404);
  const body = await c.req.json<{ name?: string }>().catch(() => ({}) as { name?: string });
  const token = await mintStation(c.env.PAIRING, [row!.id], (body.name ?? "").trim() || "Front desk");
  return c.json({ token, controlPath: `/station?token=${token}&board=${row!.id}` });
});

/** Station action: call the next number (queue). Token must grant the board. */
app.post("/api/boards/:id/call", async (c) => {
  const boardId = c.req.param("id");
  const body = await c.req.json<{ counter?: number; token?: string; categoryId?: string }>().catch(() => ({}) as { counter?: number; token?: string; categoryId?: string });
  if (!(await canControlBoard(c, boardId, body.token))) return c.json({ error: "unauthorized" }, 403);
  const state = await c.env.QUEUE.get(c.env.QUEUE.idFromName(boardId)).call(Math.max(1, Math.floor(body.counter ?? 1)), body.categoryId ?? null);
  return c.json({ state });
});

/** Station action: call a SPECIFIC token number (call-by-token). */
app.post("/api/boards/:id/call-number", async (c) => {
  const boardId = c.req.param("id");
  const body = await c.req.json<{ counter?: number; number?: number; token?: string; categoryId?: string }>().catch(() => ({}) as { counter?: number; number?: number; token?: string; categoryId?: string });
  if (!(await canControlBoard(c, boardId, body.token))) return c.json({ error: "unauthorized" }, 403);
  if (!(body.number && body.number > 0)) return c.json({ error: "number required" }, 400);
  const state = await c.env.QUEUE.get(c.env.QUEUE.idFromName(boardId)).callNumber(Math.max(1, Math.floor(body.counter ?? 1)), Math.floor(body.number), body.categoryId ?? null);
  return c.json({ state });
});

/** Operator: update a queue board's categories / default prefix. */
app.put("/api/boards/:id/categories", async (c) => {
  const boardId = c.req.param("id");
  const row = await getBoard(c.env.DB, boardId);
  if (!owns(c, row) || row!.kind !== "queue") return c.json({ error: "no such queue board" }, 404);
  const body = await c.req.json<{ prefix?: string; categories?: import("@scena/protocol").QueueCategory[] }>().catch(() => ({}) as Record<string, never>);
  const categories = (body.categories ?? []).map((cat, i) => ({ id: cat.id || `cat_${i}_${randomHex(3)}`, name: (cat.name ?? "").trim() || `Service ${i + 1}`, prefix: (cat.prefix ?? "").trim().toUpperCase().slice(0, 3) || "A" }));
  // Persist to config so a fresh DO re-seeds them, and push into the live DO.
  await updateBoardConfig(c.env.DB, boardId, { prefix: body.prefix, categories });
  const state = await c.env.QUEUE.get(c.env.QUEUE.idFromName(boardId)).configure({ prefix: body.prefix, categories });
  return c.json({ state });
});

/** Operator: set a queue board's counters (service desks). Each counter gets its
 *  own station login; adding one provisions it, removing one retires it. */
app.put("/api/boards/:id/counters", async (c) => {
  const boardId = c.req.param("id");
  const row = await getBoard(c.env.DB, boardId);
  if (!owns(c, row) || row!.kind !== "queue") return c.json({ error: "no such queue board" }, 404);
  const body = await c.req.json<{ counters?: unknown }>().catch(() => ({}) as Record<string, never>);
  const counters = sanitizeCounters(body.counters);
  await updateBoardConfig(c.env.DB, boardId, { counters });
  // Reconcile station logins to the new counter set (adds/drops as needed).
  const fresh = await getBoard(c.env.DB, boardId);
  await syncBoardUsers(c.env.DB, tenantOf(c), fresh!);
  const users = (await listBoardUsers(c.env.DB, boardId)).map((u) => ({ id: u.id, kind: u.kind, stationId: u.station_id, label: u.label, username: u.username }));
  return c.json({ counters, users });
});

/** Operator: set a room board's rooms + status palette. Each room gets its own
 *  station login; adding one provisions it, removing one retires it. The status
 *  palette (label + colour per status) is fully custom per board. */
app.put("/api/boards/:id/rooms", async (c) => {
  const boardId = c.req.param("id");
  const row = await getBoard(c.env.DB, boardId);
  if (!owns(c, row) || row!.kind !== "room") return c.json({ error: "no such room board" }, 404);
  const body = await c.req.json<{ rooms?: unknown; statuses?: unknown }>().catch(() => ({}) as Record<string, never>);
  const statuses = sanitizeStatuses(body.statuses);
  const rooms = sanitizeRooms(body.rooms, statuses);
  await updateBoardConfig(c.env.DB, boardId, { rooms, statuses });
  const state = await c.env.ROOM.get(c.env.ROOM.idFromName(boardId)).configure({ rooms, statuses });
  // Reconcile station logins to the new room set (adds/drops as needed).
  const fresh = await getBoard(c.env.DB, boardId);
  await syncBoardUsers(c.env.DB, tenantOf(c), fresh!);
  const users = (await listBoardUsers(c.env.DB, boardId)).map((u) => ({ id: u.id, kind: u.kind, stationId: u.station_id, label: u.label, username: u.username }));
  return c.json({ state, users });
});

/** Operator: set a score board's sides (competitors) + optional title. Each side
 *  gets its own station login; adding one provisions it, removing one retires it. */
app.put("/api/boards/:id/sides", async (c) => {
  const boardId = c.req.param("id");
  const row = await getBoard(c.env.DB, boardId);
  if (!owns(c, row) || row!.kind !== "score") return c.json({ error: "no such score board" }, 404);
  const body = await c.req.json<{ sides?: unknown; title?: string }>().catch(() => ({}) as Record<string, never>);
  const sides = sanitizeSides(body.sides);
  const title = typeof body.title === "string" ? body.title.slice(0, 120) : undefined;
  await updateBoardConfig(c.env.DB, boardId, { sides, ...(title !== undefined ? { title } : {}) });
  const state = await c.env.SCORE.get(c.env.SCORE.idFromName(boardId)).configure({ sides, title });
  // Reconcile station logins to the new side set.
  const fresh = await getBoard(c.env.DB, boardId);
  await syncBoardUsers(c.env.DB, tenantOf(c), fresh!);
  const users = (await listBoardUsers(c.env.DB, boardId)).map((u) => ({ id: u.id, kind: u.kind, stationId: u.station_id, label: u.label, username: u.username }));
  return c.json({ state, users });
});

/** Kiosk: issue a ticket in a category. Gated by a kiosk token (issue-only). */
app.post("/api/boards/:id/issue", async (c) => {
  const boardId = c.req.param("id");
  const body = await c.req.json<{ token?: string; categoryId?: string }>().catch(() => ({}) as { token?: string; categoryId?: string });
  if (!(await canControlBoard(c, boardId, body.token))) return c.json({ error: "unauthorized" }, 403);
  const ticket = await c.env.QUEUE.get(c.env.QUEUE.idFromName(boardId)).issueTicket(body.categoryId ?? null);
  return c.json({ ticket });
});

/** Mint a kiosk token (issue-only, board-scoped) + its take-a-ticket link. */
app.post("/api/boards/:id/kiosk", async (c) => {
  const row = await getBoard(c.env.DB, c.req.param("id"));
  if (!owns(c, row) || row!.kind !== "queue") return c.json({ error: "no such queue board" }, 404);
  const token = await mintStation(c.env.PAIRING, [row!.id], "Kiosk");
  return c.json({ token, kioskPath: `/kiosk?token=${token}&board=${row!.id}` });
});

/** Station action: re-announce the current number. */
app.post("/api/boards/:id/recall", async (c) => {
  const boardId = c.req.param("id");
  const body = await c.req.json<{ token?: string }>().catch(() => ({}) as { token?: string });
  if (!(await canControlBoard(c, boardId, body.token))) return c.json({ error: "unauthorized" }, 403);
  const state = await c.env.QUEUE.get(c.env.QUEUE.idFromName(boardId)).recall();
  return c.json({ state });
});

/* ------------------ queue announcements (§boards · Google TTS) ------------ */

/** The board's announce config + the voice catalog (operator settings panel). */
app.get("/api/boards/:id/announce", async (c) => {
  if (!owns(c, await getBoard(c.env.DB, c.req.param("id")))) return c.json({ error: "no such board" }, 404);
  const a = await readAnnounce(c.env.DB, c.req.param("id"));
  if (!a) return c.json({ error: "no such board" }, 404);
  return c.json({ config: a.config, languages: a.languages });
});

/** Update announce settings (mode / template / language / voice / prosody). */
app.put("/api/boards/:id/announce", async (c) => {
  const boardId = c.req.param("id");
  if (!owns(c, await getBoard(c.env.DB, boardId))) return c.json({ error: "no such board" }, 404);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const config: Record<string, unknown> = {};
  if (body.mode === "silent" || body.mode === "chime" || body.mode === "voice") config.mode = body.mode;
  if (typeof body.template === "string") config.template = body.template;
  if (typeof body.languageCode === "string") config.languageCode = body.languageCode;
  if (typeof body.voice === "string") config.voice = body.voice;
  if (typeof body.rate === "number") config.rate = body.rate;
  if (typeof body.volumeDb === "number") config.volumeDb = body.volumeDb;
  if (typeof body.repeat === "number") config.repeat = body.repeat;
  await setAnnounceConfig(c.env.DB, boardId, config as Partial<import("@scena/protocol").AnnounceConfig>);
  return c.json({ ok: true });
});

/** Preview: generate a sample announcement in the current settings (operator).
 *  Credit-metered like any generation; cached so repeats are free. */
app.post("/api/boards/:id/announce/preview", async (c) => {
  const row = await getBoard(c.env.DB, c.req.param("id"));
  if (!owns(c, row)) return c.json({ error: "no such board" }, 404);
  const ent = await tenantEntitlements(c.env.DB, tenantOf(c));
  if (!ent.features.aiGeneration) return c.json({ error: "voice generation not in plan" }, 403);
  const r = await announceClip(c.env, row!, { ticket: "A42", counter: "3" });
  return c.json(r, r.ok ? 200 : 502);
});

/** Public: the spoken clip for the board's CURRENT call. The player fetches this
 *  on each new call and plays a single MP3. Bounded to the live serving number
 *  (not arbitrary input), so it can't be abused to drain credits. */
app.get("/api/boards/:id/announce/clip", async (c) => {
  const boardId = c.req.param("id");
  const row = await getBoard(c.env.DB, boardId);
  if (!row || row.kind !== "queue") return c.json({ error: "no such queue board" }, 404);
  const config = (await readAnnounce(c.env.DB, boardId))?.config;
  if (!config || config.mode !== "voice") return c.json({ error: "voice off" }, 409);
  // Voice announcements are an AI generation — gate the serving path on the plan
  // just like the preview, so a downgraded tenant degrades to chime rather than
  // silently generating (and being billed for) TTS it no longer has the feature for.
  const ent = await tenantEntitlements(c.env.DB, row.tenant_id);
  if (!ent.features.aiGeneration) return c.json({ error: "voice off" }, 409);
  const state = await c.env.QUEUE.get(c.env.QUEUE.idFromName(boardId)).state();
  if (state.serving == null) return c.json({ error: "nothing serving" }, 409);
  const ticket = `${state.prefix}${state.serving}`;
  const counter = state.counter != null ? String(state.counter) : "";
  const r = await announceClip(c.env, row, { ticket, counter });
  if (!r.ok) return c.json(r, 502);
  return c.json({ ok: true, url: r.url, epoch: state.epoch, repeat: config.repeat, volumeDb: config.volumeDb });
});

/** Station action: flip a room's status. */
app.post("/api/boards/:id/room", async (c) => {
  const boardId = c.req.param("id");
  const body = await c.req
    .json<{ roomId?: string; statusId?: string; token?: string }>()
    .catch(() => ({}) as { roomId?: string; statusId?: string; token?: string });
  if (!(await canControlBoard(c, boardId, body.token, body.roomId))) return c.json({ error: "unauthorized" }, 403);
  const state = await c.env.ROOM.get(c.env.ROOM.idFromName(boardId)).setStatus(body.roomId ?? "", body.statusId ?? "");
  return c.json({ state });
});

/** Control action: reset a queue (manual rollover — clears every series). Any
 *  board user of the queue may reset it; the daily rollover does this too. */
app.post("/api/boards/:id/reset", async (c) => {
  const boardId = c.req.param("id");
  const body = await c.req.json<{ token?: string }>().catch(() => ({}) as { token?: string });
  if (!(await canControlBoard(c, boardId, body.token))) return c.json({ error: "unauthorized" }, 403);
  const row = await getBoard(c.env.DB, boardId);
  if (!row) return c.json({ error: "no such board" }, 404);
  if (row.kind === "queue") return c.json({ state: await c.env.QUEUE.get(c.env.QUEUE.idFromName(boardId)).reset() });
  if (row.kind === "score") return c.json({ state: await c.env.SCORE.get(c.env.SCORE.idFromName(boardId)).reset() });
  return c.json({ error: "not resettable" }, 400);
});

/** Control action: drive a scoreboard. A side's station user adjusts only its
 *  own side (sideId acts as the station); the coordinator drives any side plus
 *  the period label. Accepts { sideId, delta } or { sideId, value }, { period }. */
app.post("/api/boards/:id/score", async (c) => {
  const boardId = c.req.param("id");
  const body = await c.req
    .json<{ token?: string; sideId?: string; delta?: number; value?: number; period?: string }>()
    .catch(() => ({}) as { token?: string; sideId?: string; delta?: number; value?: number; period?: string });
  const stub = c.env.SCORE.get(c.env.SCORE.idFromName(boardId));
  // Setting the period is a whole-board action → require coordinator scope (no
  // station id). Score changes are scoped to the side being changed.
  if (typeof body.period === "string" && body.sideId == null) {
    if (!(await canControlBoard(c, boardId, body.token))) return c.json({ error: "unauthorized" }, 403);
    return c.json({ state: await stub.setPeriod(body.period) });
  }
  if (!body.sideId) return c.json({ error: "sideId required" }, 400);
  if (!(await canControlBoard(c, boardId, body.token, body.sideId))) return c.json({ error: "unauthorized" }, 403);
  if (typeof body.value === "number") return c.json({ state: await stub.setScore(body.sideId, body.value) });
  return c.json({ state: await stub.addScore(body.sideId, body.delta ?? 1) });
});

/* ---------------------------- analytics (§22) ----------------------------- */

/** Proof-of-play + uptime summary for the tenant. */
app.get("/api/analytics/summary", async (c) => {
  const aEnt = await tenantEntitlements(c.env.DB, tenantOf(c));
  if (!aEnt.features.proofOfPlay) return c.json({ enabled: false });
  return c.json(await summary(c.env.DB, tenantOf(c)));
});

/** Proof-of-play export (CSV) — the artifact advertisers/compliance want (§22). */
app.get("/api/analytics/export.csv", async (c) => {
  const xEnt = await tenantEntitlements(c.env.DB, tenantOf(c));
  if (!xEnt.features.proofOfPlay) return c.json({ error: "proof-of-play not in plan" }, 403);
  const csv = await exportCsv(c.env.DB, tenantOf(c));
  return c.body(csv, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="scena-proof-of-play.csv"',
  });
});

/* --------------------------- emergency override (§12) --------------------- */

const emergencyKey = (tenantId: string) => `emergency:active:${tenantId}`;

/** Broadcast a full-screen takeover to a tenant's screens (or a chosen set). */
app.post("/api/emergency", async (c) => {
  const body = await c.req
    .json<{ title?: string; body?: string; tone?: string; screenIds?: string[] }>()
    .catch(() => ({}) as { title?: string; body?: string; tone?: string; screenIds?: string[] });
  const title = (body.title ?? "").trim();
  if (!title) return c.json({ error: "title required" }, 400);
  const TONES = ["alarm", "warning", "info", "neutral", "success"] as const;
  const tone = (TONES as readonly string[]).includes(body.tone ?? "") ? (body.tone as (typeof TONES)[number]) : "alarm";

  // Only ever target THIS tenant's screens. A caller-supplied set is intersected
  // with the tenant's own fleet, so passing another tenant's screen DO id can't
  // push a takeover onto their displays; omitted ⇒ the whole fleet.
  const own = (await listScreens(c.env.DB, tenantOf(c))).map((s) => s.id);
  const targets = body.screenIds?.length ? body.screenIds.filter((id) => own.includes(id)) : own;
  const payload = { id: `emg_${randomHex(6)}`, title, body: (body.body ?? "").trim(), tone, epoch: Date.now() };

  // Fan out to every target. Open sockets make delivery near-instant; offline
  // screens keep playing cached content and pick it up on reconnect (§12).
  await Promise.all(
    targets.map(async (doId) => {
      try {
        await c.env.SCREEN.get(c.env.SCREEN.idFromString(doId)).override(payload);
      } catch {
        /* unreachable screen — skip */
      }
    }),
  );

  await c.env.PAIRING.put(emergencyKey(tenantOf(c)), JSON.stringify({ ...payload, count: targets.length }));
  return c.json({ overrideId: payload.id, count: targets.length });
});

/** All-clear: lift the override on every screen; they resync normal playout. */
app.post("/api/emergency/clear", async (c) => {
  const targets = (await listScreens(c.env.DB, tenantOf(c))).map((s) => s.id);
  await Promise.all(
    targets.map(async (doId) => {
      try {
        await c.env.SCREEN.get(c.env.SCREEN.idFromString(doId)).clearOverride();
      } catch {
        /* skip */
      }
    }),
  );
  await c.env.PAIRING.delete(emergencyKey(tenantOf(c)));
  return c.json({ cleared: targets.length });
});

/** The active override, for the dashboard banner. */
app.get("/api/emergency/active", async (c) => {
  const raw = await c.env.PAIRING.get(emergencyKey(tenantOf(c)));
  return c.json({ active: raw ? JSON.parse(raw) : null });
});

/**
 * May the caller control this board? Two credentials are accepted (§boards):
 * a signed-in board user (coordinator → any station; station → its own, when a
 * `stationId` is given), or — for backward compatibility — a legacy station
 * token. Board users are the going-forward model; tokens are being retired.
 */
async function canControlBoard(c: AppContext, boardId: string, token?: string, stationId?: string): Promise<boolean> {
  const userId = c.get("user")?.id;
  if (userId && (await boardUserCanControl(c.env.DB, userId, boardId, stationId ?? null))) return true;
  return stationCanControl(c.env.PAIRING, token ?? "", boardId);
}

/** Best-effort live state from a board DO. */
async function boardState(c: { env: Env }, boardId: string, kind: string): Promise<unknown> {
  try {
    if (kind === "queue") return await c.env.QUEUE.get(c.env.QUEUE.idFromName(boardId)).state();
    if (kind === "score") return await c.env.SCORE.get(c.env.SCORE.idFromName(boardId)).state();
    return await c.env.ROOM.get(c.env.ROOM.idFromName(boardId)).state();
  } catch {
    return null;
  }
}

/** Fan a manifest nudge to every screen subscribed to a channel (§9). */
async function nudgeChannel(c: { env: Env }, channelId: string): Promise<number> {
  const screens = await listChannelScreens(c.env.PAIRING, channelId);
  await Promise.all(
    screens.map(async (doId) => {
      try {
        await c.env.SCREEN.get(c.env.SCREEN.idFromString(doId)).nudge();
      } catch {
        /* screen DO gone — skip */
      }
    }),
  );
  return screens.length;
}

/** Best-effort live status from a screen's DO; null if it can't be reached. */
async function liveStatus(
  c: { env: Env },
  doId: string,
): Promise<Awaited<ReturnType<import("./screen-do.js").ScreenDO["status"]>> | null> {
  try {
    const id = c.env.SCREEN.idFromString(doId);
    return await c.env.SCREEN.get(id).status();
  } catch {
    return null;
  }
}

/** Holding card shown on a suspended tenant's screens (§25). */
function suspendedManifest(channelId: string): Manifest {
  return parseManifest({
    version: 1,
    channelId,
    role: "content",
    dimensions: { w: 1920, h: 1080, orientation: "landscape", rotation: 0 },
    epoch: { t0: 0, cycleMs: 6000 },
    slides: {
      transitionDefault: "fade",
      durationDefaultMs: 6000,
      shuffle: false,
      items: [
        {
          id: "suspended",
          type: "html",
          htmlBody:
            "<div style='width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#0b0b0f;color:#9aa;font:600 2.2vw system-ui,sans-serif'>This screen is temporarily unavailable</div>",
          durationMs: 6000,
        },
      ],
    },
    music: { items: [] },
    widgets: [],
    fonts: [],
    assets: [],
  });
}

/** 4-char pairing code from an unambiguous alphabet (no 0/O/1/I). */
function mintCode(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return code;
}

/** Random lowercase-hex id of `bytes` bytes. */
function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Cron entry (§19): periodically refresh RSS feeds so tickers stay current
 * without an operator republish. Won't fire under local `wrangler dev`, but is
 * wired for production; the feed refresh endpoint drives it manually meanwhile.
 */
async function scheduled(event: ScheduledController, env: Env): Promise<void> {
  // Sources (§sources): refresh RSS feeds + API/Sheet datasets across all
  // tenants, honoring each source's refresh interval (skip ones still fresh).
  const now = Date.now();
  const rss = (await env.DB.prepare("SELECT * FROM feeds WHERE provider = 'rss'").all<FeedRow>()).results ?? [];
  for (const f of rss) {
    // Key on data_at (last fetch), not updated_at (config-edit time) — otherwise
    // editing a feed makes the cron skip refreshing its (possibly empty) data.
    if (f.data_at && now - f.data_at < f.refresh_sec * 1000) continue;
    await refreshRss(env.DB, f).catch(() => 0);
  }
  await refreshStaleSources(env.DB).catch(() => 0);
  // Weather (§17): refetch each location at most hourly, only inside its
  // opening-hours window, metering each real call against its tenant.
  await refreshStale(env).catch(() => 0);

  // Daily 00:10 UTC tick (§25): drop monthly credit grants and advance the
  // payment lifecycle (past_due → suspended → auto-deletion).
  if (event.cron === "10 0 * * *") {
    await grantAll(env).catch(() => 0);
    await lifecycleSweep(env).catch(() => []);
  }
}

export default { fetch: app.fetch, scheduled };
