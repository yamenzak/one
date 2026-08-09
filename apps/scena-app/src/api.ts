/** Dashboard API client. Talks to the Scena edge API (§2). */

// Relative by default: the dashboard is served same-origin with the API (one
// worker in prod; a Vite dev proxy locally), so the session cookie flows on
// every fetch with no per-request credentials wiring. VITE_API_BASE can still
// point at a separate origin if needed.
export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

/**
 * ONE DOOR OUT OF THIS MODULE, and the reason it exists is a 401.
 *
 * Every call in this file went through a bare `fetch`, which is what an app
 * written before the platform looks like. `@4dl/app-kit`'s `api` has a hook for
 * an expired session — `setUnauthorizedHandler`, which `SessionProvider`
 * installs in Kova and Tessa so a dead cookie drops the person back on the sign-in
 * screen. Scena had no equivalent, so an expired session did not LOOK expired:
 * every screen rendered its empty state, every save failed with a toast, and
 * nothing anywhere said "sign in again". The app was indistinguishable from an
 * app whose data had been deleted.
 *
 * The fix is a chokepoint rather than 167 rewritten call sites, deliberately.
 * `apiFetch` is `fetch`-shaped — same arguments, same Response — so adopting it
 * was a rename, and a rename is reviewable in a way 167 hand-edited calls are
 * not. What it buys beyond the hook is that there is now ONE place to put the
 * next cross-cutting concern, which is what the kit's `api` is for the other two
 * apps. Moving the rest of the way (typed `api.get`/`api.post`, `ApiError` with
 * its status and body) is mechanical from here and no longer urgent.
 *
 * ⚠️ `scripts/scena-fetch-chokepoint.test.mjs` fails on a bare `fetch` anywhere
 * in this SPA outside the two places that must have one. Without it the next
 * endpoint somebody adds goes back to bypassing the hook, silently, and the
 * symptom is a signed-out person looking at an empty dashboard.
 */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

/**
 * Called when any request comes back 401 — App.tsx installs a handler that
 * re-reads the session, which drops to the sign-in screen.
 *
 * Registered rather than imported so this module stays free of React: it is
 * imported by the worker-facing tests and by `brand-theme.ts`, and a component
 * import here would drag the whole tree into both.
 */
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null): void {
  onUnauthorized = fn;
}

/**
 * The two lanes a 401 must NOT be reported on.
 *
 * `/api/auth/*` — Better Auth's own endpoints self-report 401: a wrong OTP, a
 * sign-in before there is a session. That is an ANSWER, not an expiry, and
 * firing the global re-auth on it would reload the session on the login screen
 * on every mistyped code, forever.
 *
 * `/api/me` — ⚠️ THE RE-ENTRANCY GUARD. The handler's whole job is to re-read
 * the session, so it calls `getMe`, which comes back through here. Scena's route
 * guard makes `/api/me` public (it answers `{authenticated: false}` with a 200),
 * so today that terminates — but the loop it would otherwise be is unbounded and
 * self-inflicted, and one line in `route-guard.ts` is all that stands between
 * this and a browser tab spinning until it is closed. The handler must not be
 * able to trigger itself, whatever the server decides to answer.
 */
const isAuthPath = (url: string): boolean => url.includes("/api/auth/") || new URL(url, "http://x").pathname === "/api/me";

/**
 * The transport. Identical to `fetch` except that a 401 tells the app.
 *
 * It does not throw on a non-2xx: the call sites in this file each decide what a
 * failure means (`apiError` for the ones with a server message worth showing, a
 * bare status for the ones without), and changing that alongside the transport
 * would have made this a rewrite instead of a rename.
 */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401 && !isAuthPath(input)) onUnauthorized?.();
  return res;
}

/** Build an Error from a failed response, preferring the server's `{ error }`
 *  body (e.g. a plan-limit or validation message) over a bare status code, so
 *  callers can `toast.error(e.message)` and show something a human understands. */
export async function apiError(res: Response, fallback: string): Promise<Error> {
  const err = await (async () => {
    try {
      const body = (await res.clone().json()) as { error?: string };
      if (body?.error) return new Error(body.error);
    } catch { /* non-JSON body — fall through */ }
    return new Error(`${fallback} (${res.status})`);
  })();
  /*
    THE STATUS RIDES ALONG. `@4dl/app-kit`'s `ApiError` carries it, and the exit
    cards branch on it (409 = "you own a workspace, close it first"); a Scena
    caller that wants to tell 402 from 403 had nothing but the message text to
    match on, which is a translation away from breaking.
  */
  return Object.assign(err, { status: res.status });
}

/**
 * The `ErrorFormatter` every `@4dl/ui` lifecycle hook takes — `useLoad`,
 * `useAction`, `useConfirmedState`.
 *
 * It lives here rather than in each screen because three pages had already
 * written their own private copy and they had begun to disagree: `AdminDoor`'s
 * ignores the fallback it is handed and always says "That didn't go through."
 * `apiError` above has already unwrapped the server's `{ error }` into the
 * message, so the only job left is choosing between it and the caller's
 * sentence.
 */
export const errText = (e: unknown, fallback: string): string => (e instanceof Error && e.message ? e.message : fallback);

export interface LiveStatus {
  state: string;
  online: boolean;
  channelId?: string;
  manifestVersion?: number;
  lastSeen?: number;
  muted?: boolean;
  saverActive?: boolean;
  debugActive?: boolean;
}

export type CommandAction = "mute" | "unmute" | "refresh" | "screensaver.on" | "screensaver.off" | "switch_channel" | "debug.on" | "debug.off";

/** Send a remote command to a screen (§11); `at` (epoch ms) schedules it. */
export async function sendCommand(screenId: string, action: CommandAction, at?: number): Promise<{ id: string; scheduled: boolean }> {
  const res = await apiFetch(`${API_BASE}/api/screens/${screenId}/command`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, at }),
  });
  if (!res.ok) throw new Error(`command failed (${res.status})`);
  return (await res.json()) as { id: string; scheduled: boolean };
}

export interface Screen {
  id: string;
  tenant_id: string;
  name: string;
  channel_id: string | null;
  channel_name?: string | null;
  status: string;
  paired_at: number;
  last_seen: number;
  width: number | null;
  height: number | null;
  orientation: string | null;
  tags?: string[];
  live: LiveStatus | null;
}
/** Set a device's tags. */
export async function setScreenTags(id: string, tags: string[]): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/screens/${id}`, { method: "PUT", headers: jhead, body: JSON.stringify({ tags }) });
  if (!res.ok) throw new Error(`update failed (${res.status})`);
}

/** Fetch a channel's compiled manifest (the published snapshot the screens run).
 *  Unauthenticated/device-facing, so a relative fetch works same-origin. */
export async function getManifest(channelId: string): Promise<import("@scena/manifest").Manifest> {
  const res = await apiFetch(`${API_BASE}/api/manifest/${channelId}`);
  if (!res.ok) throw new Error(`manifest ${res.status}`);
  return (await res.json()) as import("@scena/manifest").Manifest;
}

export async function listScreens(): Promise<Screen[]> {
  const res = await apiFetch(`${API_BASE}/api/screens`);
  if (!res.ok) throw new Error(`listScreens ${res.status}`);
  return ((await res.json()) as { screens: Screen[] }).screens;
}

export async function getScreen(id: string): Promise<Screen> {
  const res = await apiFetch(`${API_BASE}/api/screens/${id}`);
  if (!res.ok) throw new Error(`getScreen ${res.status}`);
  return (await res.json()) as Screen;
}

export interface ClaimResult {
  screenId: string;
  channelId: string;
  screenDoId: string;
  name: string;
  /** True when a brand-new device got its own auto-provisioned display. */
  provisioned?: boolean;
  /** True when the sample scene was seeded onto it (only if requested). */
  seeded?: boolean;
}

import type { Widget } from "@scena/manifest";
import type { QueueState, RoomState, ScoreState } from "@scena/protocol";

export type BoardKind = "queue" | "room" | "score";

export interface QueueCounter { id: string; name: string }

export interface Board {
  id: string;
  kind: BoardKind;
  name: string;
  state: QueueState | RoomState | ScoreState | null;
  /** Queue boards only: the service desks (one station login each). */
  counters?: QueueCounter[];
  /** Present on the public live read — the workspace brand kit for kiosks/control apps. */
  branding?: WorkspaceBrand;
}

export async function createBoard(kind: BoardKind, name: string, config: unknown = {}): Promise<{ id: string; kind: string; name: string }> {
  const res = await apiFetch(`${API_BASE}/api/boards`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, name, config }),
  });
  if (!res.ok) throw await apiError(res, "createBoard");
  return (await res.json()) as { id: string; kind: string; name: string };
}

export async function listBoards(): Promise<Board[]> {
  const res = await apiFetch(`${API_BASE}/api/boards`);
  if (!res.ok) throw new Error(`listBoards ${res.status}`);
  return ((await res.json()) as { boards: Board[] }).boards;
}

export async function getBoard(id: string): Promise<Board> {
  const res = await apiFetch(`${API_BASE}/api/boards/${id}`);
  if (!res.ok) throw new Error(`getBoard ${res.status}`);
  return (await res.json()) as Board;
}

/** Public, token-gated live read for the kiosk + board surfaces (no session). */
export async function getBoardLive(id: string, token: string): Promise<Board> {
  const res = await apiFetch(`${API_BASE}/api/boards/${id}/live?token=${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error(`getBoardLive ${res.status}`);
  return (await res.json()) as Board;
}

/* ------------------- queue announcements (§boards · Google TTS) ----------- */

import type { TtsLanguage } from "@scena/protocol";

export interface AnnounceConfig {
  mode: "silent" | "chime" | "voice";
  template: string;
  languageCode: string;
  voice: string;
  rate: number;
  volumeDb: number;
  repeat: number;
}
export interface BoardAnnounce {
  config: AnnounceConfig;
  languages: TtsLanguage[];
}

export async function getBoardAnnounce(boardId: string): Promise<BoardAnnounce | null> {
  const res = await apiFetch(`${API_BASE}/api/boards/${boardId}/announce`);
  if (!res.ok) return null;
  return (await res.json()) as BoardAnnounce;
}

export async function setBoardAnnounce(boardId: string, patch: Partial<AnnounceConfig>): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/boards/${boardId}/announce`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
  if (!res.ok) throw await apiError(res, "setBoardAnnounce");
}

/** Generate a sample announcement in the current settings (returns a clip URL). */
export async function previewBoardAnnounce(boardId: string): Promise<{ ok?: boolean; url?: string; credits?: number; cached?: boolean; error?: string; detail?: string }> {
  const res = await apiFetch(`${API_BASE}/api/boards/${boardId}/announce/preview`, { method: "POST" });
  return (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; credits?: number; cached?: boolean; error?: string; detail?: string };
}

async function stationAction(boardId: string, action: string, body: Record<string, unknown>): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/boards/${boardId}/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${action} failed (${res.status})`);
}

/* --------------- session-authed board control (board users, §boards) ------ */
// A signed-in board user controls their board via the session cookie — no token.
export const callNextSession = (boardId: string, counter: number, categoryId?: string) => stationAction(boardId, "call", { counter, categoryId });
export const callNumberSession = (boardId: string, counter: number, number: number, categoryId?: string) => stationAction(boardId, "call-number", { counter, number, categoryId });
export const recallSession = (boardId: string) => stationAction(boardId, "recall", {});
export const setRoomStatusSession = (boardId: string, roomId: string, statusId: string) => stationAction(boardId, "room", { roomId, statusId });
/** Reset a queue or scoreboard (manual rollover). */
export const resetBoardSession = (boardId: string) => stationAction(boardId, "reset", {});
/** Scoreboard control (§boards). */
export const addScoreSession = (boardId: string, sideId: string, delta: number) => stationAction(boardId, "score", { sideId, delta });
export const setScorePeriodSession = (boardId: string, period: string) => stationAction(boardId, "score", { period });

/* ---------------------- board users / credentials (§boards) --------------- */
export interface BoardUser { id: string; kind: "coordinator" | "station"; stationId: string | null; label: string; username: string; password: string }

export async function getBoardUsers(boardId: string): Promise<BoardUser[]> {
  const res = await apiFetch(`${API_BASE}/api/boards/${boardId}/users`);
  if (!res.ok) return [];
  return ((await res.json()) as { users: BoardUser[] }).users ?? [];
}
export async function regenerateBoardUser(boardId: string, rid: string): Promise<string | null> {
  const res = await apiFetch(`${API_BASE}/api/boards/${boardId}/users/${rid}/regenerate`, { method: "POST" });
  if (!res.ok) return null;
  return ((await res.json()) as { password?: string }).password ?? null;
}
export async function deleteBoard(boardId: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/boards/${boardId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`deleteBoard ${res.status}`);
}

/* ------------------------ ticket issuer / categories (§20) ---------------- */

export interface QueueCategory { id: string; name: string; prefix: string }

/** Kiosk: issue a ticket in a category (kiosk-token gated). */
export async function issueTicket(boardId: string, token: string, categoryId?: string): Promise<{ ticket?: { prefix: string; number: number; label: string | null; ahead: number }; error?: string }> {
  const res = await apiFetch(`${API_BASE}/api/boards/${boardId}/issue`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, categoryId }) });
  return (await res.json().catch(() => ({}))) as { ticket?: { prefix: string; number: number; label: string | null; ahead: number }; error?: string };
}

/** Operator: mint a kiosk (issue-only) link for a queue board. */
export async function mintKiosk(boardId: string): Promise<{ token: string; kioskPath: string }> {
  const res = await apiFetch(`${API_BASE}/api/boards/${boardId}/kiosk`, { method: "POST" });
  if (!res.ok) throw new Error(`mintKiosk ${res.status}`);
  return (await res.json()) as { token: string; kioskPath: string };
}

/** Operator: set a queue board's service categories. */
export async function setBoardCategories(boardId: string, categories: QueueCategory[], prefix?: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/boards/${boardId}/categories`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ categories, prefix }) });
  if (!res.ok) throw await apiError(res, "setBoardCategories");
}

/** Set a queue board's counters (service desks). Returns the normalized counters
 *  and the refreshed logins (a new counter gets its own station sign-in). */
export async function setBoardCounters(boardId: string, counters: QueueCounter[]): Promise<{ counters: QueueCounter[]; users: BoardUser[] }> {
  const res = await apiFetch(`${API_BASE}/api/boards/${boardId}/counters`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ counters }) });
  if (!res.ok) throw await apiError(res, "setBoardCounters");
  return (await res.json()) as { counters: QueueCounter[]; users: BoardUser[] };
}

/** Set a room board's rooms + status palette. Returns the fresh room state and
 *  the reconciled logins (a new room gets its own station sign-in). */
export async function setBoardRooms(
  boardId: string,
  rooms: RoomState["rooms"],
  statuses: RoomState["statuses"],
): Promise<{ state: RoomState; users: BoardUser[] }> {
  const res = await apiFetch(`${API_BASE}/api/boards/${boardId}/rooms`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ rooms, statuses }) });
  if (!res.ok) throw await apiError(res, "setBoardRooms");
  return (await res.json()) as { state: RoomState; users: BoardUser[] };
}

/** Set a score board's sides (competitors) + optional title. Returns the fresh
 *  score state and the reconciled logins (a new side gets its own station). */
export async function setBoardSides(
  boardId: string,
  sides: { id: string; name: string; short: string; color: string }[],
  title?: string,
): Promise<{ state: ScoreState; users: BoardUser[] }> {
  const res = await apiFetch(`${API_BASE}/api/boards/${boardId}/sides`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ sides, title }) });
  if (!res.ok) throw await apiError(res, "setBoardSides");
  return (await res.json()) as { state: ScoreState; users: BoardUser[] };
}

export interface AnalyticsSummary {
  totalPlays: number;
  activeScreens: number;
  byContent: { contentId: string; plays: number; totalMs: number }[];
  byScreen: { screenId: string; name: string | null; plays: number }[];
  byDay: { day: string; plays: number }[];
}

export async function getAnalytics(): Promise<AnalyticsSummary> {
  const res = await apiFetch(`${API_BASE}/api/analytics/summary`);
  if (!res.ok) throw new Error(`getAnalytics ${res.status}`);
  return (await res.json()) as AnalyticsSummary;
}

export const analyticsCsvUrl = () => `${API_BASE}/api/analytics/export.csv`;

/* --------------------------------- channels ------------------------------- */

export interface Slide {
  id: string;
  channel_id: string;
  ord: number;
  type: "image" | "html";
  asset_hash: string | null;
  asset_url: string | null;
  html_body: string | null;
  duration_ms: number | null;
}
export interface Channel {
  id: string;
  name: string;
  default_duration_ms: number;
  transition: string;
  tags?: string[];
  slideCount?: number;
  slides?: Slide[];
  /** Composition refs — the reusable building blocks this channel plays. */
  slide_playlist_id?: string | null;
  music_playlist_id?: string | null;
  widget_profile_id?: string | null;
  ad_profile_id?: string | null;
}
/** One channel with its composition refs (and legacy inline slides). Used by the
 *  display studio to resolve a screen's slide/music/widget building blocks. */
export async function getChannel(id: string): Promise<Channel> {
  const res = await apiFetch(`${API_BASE}/api/channels/${id}`);
  if (!res.ok) throw new Error(`getChannel ${res.status}`);
  return (await res.json()) as Channel;
}
/** Rename a channel and/or set its tags. */
export async function updateChannel(id: string, patch: { name?: string; tags?: string[] }): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/channels/${id}`, { method: "PUT", headers: jhead, body: JSON.stringify(patch) });
  if (!res.ok) throw new Error(`update failed (${res.status})`);
}
/** Delete a channel; the API also unassigns it from every device that used it. */
export async function deleteChannel(id: string): Promise<{ unassigned?: number }> {
  const res = await apiFetch(`${API_BASE}/api/channels/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `delete failed (${res.status})`);
  }
  return (await res.json().catch(() => ({}))) as { unassigned?: number };
}
/** Whether a channel has unpublished changes (content diff vs the live version). */
export async function getChannelPublishState(id: string): Promise<{ dirty: boolean; liveVersion: number | null }> {
  const res = await apiFetch(`${API_BASE}/api/channels/${id}/publish-state`);
  if (!res.ok) return { dirty: false, liveVersion: null };
  return (await res.json()) as { dirty: boolean; liveVersion: number | null };
}
/** Set/clear the human label on a published version. */
export async function setVersionNote(id: string, version: number, note: string): Promise<void> {
  await apiFetch(`${API_BASE}/api/channels/${id}/versions/${version}`, { method: "PUT", headers: jhead, body: JSON.stringify({ note }) });
}

export const assetUrl = (url: string) => (url.startsWith("http") ? url : `${API_BASE}${url}`);

export async function listChannels(): Promise<Channel[]> {
  const res = await apiFetch(`${API_BASE}/api/channels`);
  if (!res.ok) throw new Error(`listChannels ${res.status}`);
  return ((await res.json()) as { channels: Channel[] }).channels;
}

/* ---------------------- reusable slide playlists (§4) -------------------- */

export interface SlidePlaylist {
  id: string;
  name: string;
  default_duration_ms: number | null;
  transition: string | null;
  created_at: number;
  tags?: string[];
  slideCount?: number;
}
export interface PlaylistSlide {
  id: string;
  playlist_id: string | null;
  ord: number;
  type: string;
  asset_hash: string | null;
  asset_url: string | null;
  html_body: string | null;
  duration_ms: number | null;
  fit: "contain" | "cover" | "fill" | null;
  clip_start_ms: number | null;
  loop: number | null;
}

const jhead = { "content-type": "application/json" };

export async function listSlidePlaylists(): Promise<SlidePlaylist[]> {
  return ((await (await apiFetch(`${API_BASE}/api/slide-playlists`)).json()) as { playlists: SlidePlaylist[] }).playlists;
}
export async function createSlidePlaylist(name: string): Promise<string> {
  return ((await (await apiFetch(`${API_BASE}/api/slide-playlists`, { method: "POST", headers: jhead, body: JSON.stringify({ name }) })).json()) as { id: string }).id;
}
export async function getSlidePlaylist(id: string): Promise<SlidePlaylist & { slides: PlaylistSlide[] }> {
  return (await (await apiFetch(`${API_BASE}/api/slide-playlists/${id}`)).json()) as SlidePlaylist & { slides: PlaylistSlide[] };
}
export async function updateSlidePlaylist(id: string, patch: { name?: string; defaultDurationMs?: number; transition?: string; tags?: string[] }): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/slide-playlists/${id}`, { method: "PUT", headers: jhead, body: JSON.stringify(patch) });
  if (!res.ok) throw new Error(`update failed (${res.status})`);
}
export async function deleteSlidePlaylist(id: string, alsoDeleteMedia = false): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/slide-playlists/${id}${alsoDeleteMedia ? "?media=1" : ""}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete failed (${res.status})`);
}
export async function addPlaylistSlide(id: string, slide: { type: string; assetHash?: string; assetUrl?: string; htmlBody?: string; durationMs?: number; fit?: string }): Promise<string> {
  return ((await (await apiFetch(`${API_BASE}/api/slide-playlists/${id}/slides`, { method: "POST", headers: jhead, body: JSON.stringify(slide) })).json()) as { id: string }).id;
}
export async function updatePlaylistSlide(id: string, slideId: string, patch: { durationMs?: number | null; fit?: string; htmlBody?: string; clipStartMs?: number | null; loop?: boolean }): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/slide-playlists/${id}/slides/${slideId}`, { method: "PUT", headers: jhead, body: JSON.stringify(patch) });
  if (!res.ok) throw new Error(`update failed (${res.status})`);
}
export async function deletePlaylistSlide(id: string, slideId: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/slide-playlists/${id}/slides/${slideId}`, { method: "DELETE" });
  if (!res.ok) throw await apiError(res, "deletePlaylistSlide");
}
export async function reorderPlaylistSlidesApi(id: string, order: string[]): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/slide-playlists/${id}/reorder`, { method: "POST", headers: jhead, body: JSON.stringify({ order }) });
  if (!res.ok) throw await apiError(res, "reorderPlaylistSlidesApi");
}

/* ---------------------- reusable music playlists (§16) ------------------- */

export interface MusicPlaylist {
  id: string; name: string; shuffle: number | null; created_at: number;
  tags?: string[]; trackCount?: number; totalMs?: number; genres?: string[];
}
export interface PlaylistTrack {
  id: string; playlist_id: string | null; ord: number; title: string;
  asset_hash: string; asset_url: string; duration_ms: number;
  artist: string | null; art_hash: string | null; art_url: string | null;
  album: string | null; vocal: string | null; genres: string[]; media_id: string | null; library_id: string | null;
}

export async function listMusicPlaylists(): Promise<MusicPlaylist[]> {
  return ((await (await apiFetch(`${API_BASE}/api/music-playlists`)).json()) as { playlists: MusicPlaylist[] }).playlists;
}
export async function createMusicPlaylist(name: string): Promise<string> {
  return ((await (await apiFetch(`${API_BASE}/api/music-playlists`, { method: "POST", headers: jhead, body: JSON.stringify({ name }) })).json()) as { id: string }).id;
}
export async function getMusicPlaylist(id: string): Promise<MusicPlaylist & { tracks: PlaylistTrack[] }> {
  return (await (await apiFetch(`${API_BASE}/api/music-playlists/${id}`)).json()) as MusicPlaylist & { tracks: PlaylistTrack[] };
}
export async function updateMusicPlaylist(id: string, patch: { name?: string; shuffle?: boolean; tags?: string[] }): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/music-playlists/${id}`, { method: "PUT", headers: jhead, body: JSON.stringify(patch) });
  if (!res.ok) throw new Error(`update failed (${res.status})`);
}
export async function deleteMusicPlaylist(id: string, alsoDeleteMedia = false): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/music-playlists/${id}${alsoDeleteMedia ? "?media=1" : ""}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete failed (${res.status})`);
}
export async function addPlaylistTrack(id: string, t: { title: string; assetHash: string; assetUrl: string; durationMs: number; artist?: string; album?: string; artHash?: string; artUrl?: string; genres?: string[]; vocal?: string; mediaId?: string }): Promise<string> {
  return ((await (await apiFetch(`${API_BASE}/api/music-playlists/${id}/tracks`, { method: "POST", headers: jhead, body: JSON.stringify(t) })).json()) as { id: string }).id;
}
export async function updatePlaylistTrack(id: string, trackId: string, patch: { title?: string; artist?: string; album?: string; genres?: string[]; vocal?: string | null; artHash?: string | null; artUrl?: string | null }): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/music-playlists/${id}/tracks/${trackId}`, { method: "PUT", headers: jhead, body: JSON.stringify(patch) });
  if (!res.ok) throw new Error(`update failed (${res.status})`);
}
export async function deletePlaylistTrack(id: string, trackId: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/music-playlists/${id}/tracks/${trackId}`, { method: "DELETE" });
  if (!res.ok) throw await apiError(res, "deletePlaylistTrack");
}
export async function reorderPlaylistTracksApi(id: string, order: string[]): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/music-playlists/${id}/reorder`, { method: "POST", headers: jhead, body: JSON.stringify({ order }) });
  if (!res.ok) throw await apiError(res, "reorderPlaylistTracksApi");
}
/** Add a public-library track into a music playlist by reference (quota-enforced). */
export async function addPublicTrackToPlaylist(id: string, libraryId: string): Promise<{ id?: string; mediaId?: string; error?: string; limit?: number; used?: number }> {
  const res = await apiFetch(`${API_BASE}/api/music-playlists/${id}/library/${libraryId}`, { method: "POST" });
  return (await res.json().catch(() => ({}))) as { id?: string; mediaId?: string; error?: string; limit?: number; used?: number };
}

/* ------------------------- reusable widget profiles ---------------------- */

export interface WidgetProfile { id: string; name: string; design_w: number | null; design_h: number | null; created_at: number; }

export async function listWidgetProfiles(): Promise<WidgetProfile[]> {
  return ((await (await apiFetch(`${API_BASE}/api/profiles`)).json()) as { profiles: WidgetProfile[] }).profiles;
}
export async function createWidgetProfile(name: string, opts: { designW?: number; designH?: number } = {}): Promise<string> {
  const res = await apiFetch(`${API_BASE}/api/profiles`, { method: "POST", headers: jhead, body: JSON.stringify({ name, ...opts }) });
  if (!res.ok) throw await apiError(res, "createWidgetProfile");
  return ((await res.json()) as { id: string }).id;
}
export async function getWidgetProfile(id: string): Promise<WidgetProfile & { widgets: unknown[] }> {
  return (await (await apiFetch(`${API_BASE}/api/profiles/${id}`)).json()) as WidgetProfile & { widgets: unknown[] };
}
export async function updateWidgetProfile(id: string, patch: { name?: string; designW?: number; designH?: number }): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/profiles/${id}`, { method: "PUT", headers: jhead, body: JSON.stringify(patch) });
  if (!res.ok) throw await apiError(res, "updateWidgetProfile");
}
export async function saveProfileWidgets(id: string, widgets: unknown[]): Promise<void> {
  // Surface failures — a silently-swallowed save let the builder believe a layout
  // was persisted when it wasn't (and a later save could then wipe good data).
  const res = await apiFetch(`${API_BASE}/api/profiles/${id}/widgets`, { method: "PUT", headers: jhead, body: JSON.stringify({ widgets }) });
  if (!res.ok) throw await apiError(res, "saveProfileWidgets");
}
export async function deleteWidgetProfile(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/profiles/${id}`, { method: "DELETE" });
  if (!res.ok) throw await apiError(res, "deleteWidgetProfile");
}

/* --------------------- channel composition + devices --------------------- */

export async function setChannelComposition(channelId: string, refs: { slidePlaylistId?: string | null; musicPlaylistId?: string | null; widgetProfileId?: string | null; adProfileId?: string | null }): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/channels/${channelId}/composition`, { method: "PUT", headers: jhead, body: JSON.stringify(refs) });
  if (!res.ok) throw await apiError(res, "setChannelComposition");
}
export async function setDeviceDimensions(id: string, dims: { width: number; height: number; orientation?: string }): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/screens/${id}/dimensions`, { method: "PUT", headers: jhead, body: JSON.stringify(dims) });
  if (!res.ok) throw await apiError(res, "setDeviceDimensions");
}
export async function setDeviceActiveChannel(id: string, channelId: string | null): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/screens/${id}/channel`, { method: "PUT", headers: jhead, body: JSON.stringify({ channelId }) });
  if (!res.ok) throw await apiError(res, "setDeviceActiveChannel");
}
export async function getDeviceChannels(id: string): Promise<string[]> {
  return ((await (await apiFetch(`${API_BASE}/api/screens/${id}/channels`)).json()) as { channelIds: string[] }).channelIds;
}
export async function setDeviceChannels(id: string, channelIds: string[]): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/screens/${id}/channels`, { method: "PUT", headers: jhead, body: JSON.stringify({ channelIds }) });
  if (!res.ok) throw await apiError(res, "setDeviceChannels");
}

/* -------------------------- per-device schedule (§13) -------------------- */

export type ScheduleKind = "channel" | "mute" | "saver";
export interface DeviceScheduleRule {
  id: string;
  kind: ScheduleKind;
  priority: number;
  days: number[];
  startMin: number;
  endMin: number;
  channelId: string | null;
  channelName?: string | null;
}
export interface DeviceScheduleData {
  tz: string;
  rules: DeviceScheduleRule[];
  channels: { id: string; name: string }[];
}

export async function getDeviceSchedule(id: string): Promise<DeviceScheduleData> {
  const res = await apiFetch(`${API_BASE}/api/screens/${id}/schedule`);
  if (!res.ok) throw new Error(`getDeviceSchedule ${res.status}`);
  return (await res.json()) as DeviceScheduleData;
}
export async function addDeviceScheduleRule(
  id: string,
  rule: { kind: ScheduleKind; days: number[]; startMin: number; endMin: number; channelId?: string | null; priority?: number },
): Promise<{ id?: string; error?: string }> {
  const res = await apiFetch(`${API_BASE}/api/screens/${id}/schedule/rules`, { method: "POST", headers: jhead, body: JSON.stringify(rule) });
  return (await res.json().catch(() => ({}))) as { id?: string; error?: string };
}
export async function deleteDeviceScheduleRule(id: string, ruleId: string): Promise<void> {
  await apiFetch(`${API_BASE}/api/screens/${id}/schedule/rules/${ruleId}`, { method: "DELETE" });
}
export async function setDeviceScheduleTz(id: string, tz: string): Promise<void> {
  await apiFetch(`${API_BASE}/api/screens/${id}/schedule`, { method: "PATCH", headers: jhead, body: JSON.stringify({ tz }) });
}
/** Rename a device. */
export async function renameScreen(id: string, name: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/screens/${id}`, { method: "PUT", headers: jhead, body: JSON.stringify({ name }) });
  if (!res.ok) throw new Error(`rename failed (${res.status})`);
}
/** Unpair a device: it stops playing and returns to a fresh pairing code. */
export async function unpairScreen(id: string): Promise<{ ok: boolean; code?: string }> {
  const res = await apiFetch(`${API_BASE}/api/screens/${id}/unpair`, { method: "POST" });
  if (!res.ok) throw new Error(`unpair failed (${res.status})`);
  return (await res.json()) as { ok: boolean; code?: string };
}
/** Permanently remove a device. The API rejects this unless it's unpaired. */
export async function removeScreen(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/screens/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `remove failed (${res.status})`);
  }
}

/** Upload media to R2 (content-addressed) and return its hash + url. */
export async function uploadAsset(file: File): Promise<{ hash: string; url: string }> {
  const res = await apiFetch(`${API_BASE}/api/assets`, { method: "PUT", headers: { "content-type": file.type || "application/octet-stream" }, body: file });
  if (!res.ok) throw new Error(`upload failed (${res.status})`);
  return (await res.json()) as { hash: string; url: string };
}

/* --------------------------------- branding ------------------------------ */

/** A brand logo variant (uploaded to the media library, referenced by URL). */
export type { BrandLogoRef as BrandLogo } from "./brand-theme.js";

/*
  THE WIRE TYPE IS `brand-theme.ts`'s, and it is `@4dl/ui`'s `Branding` plus
  Scena's four fields.

  It used to be declared here as a fourth, disagreeing shape — `theme` where the
  platform says `tokens`, bare token keys where the platform prefixes them, a
  radius in pixels where the platform uses rem, and no shadow, border weight or
  marks at all. Re-exported rather than re-declared so there is one definition
  the editor, the applier and the server all answer to.
*/
import type { WorkspaceBrand } from "./brand-theme.js";
export type { WorkspaceBrand };

export async function getBranding(): Promise<WorkspaceBrand> {
  return ((await (await apiFetch(`${API_BASE}/api/branding`)).json()) as { branding: WorkspaceBrand }).branding;
}
export async function setBranding(patch: Partial<WorkspaceBrand>): Promise<WorkspaceBrand> {
  const res = await apiFetch(`${API_BASE}/api/branding`, { method: "PUT", headers: jhead, body: JSON.stringify(patch) });
  if (!res.ok) throw new Error(`save failed (${res.status})`);
  return ((await res.json()) as { branding: WorkspaceBrand }).branding;
}

/* ------------------------------ media library ---------------------------- */

export type MediaKind = "image" | "gif" | "video" | "html" | "audio";
export type MediaSource = "upload" | "ai" | "public";

export interface Media {
  id: string;
  kind: MediaKind;
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
  tags?: string[];
  // Audio meta (kind === "audio").
  artist?: string | null;
  album?: string | null;
  genres?: string | null;
  vocal?: string | null;
  art_hash?: string | null;
  art_url?: string | null;
  source?: string | null;
  library_id?: string | null;
}

export function mediaKind(file: File): "image" | "gif" | "video" | "audio" {
  if (file.type === "image/gif") return "gif";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "image";
}

/** Read intrinsic dimensions (+ duration for video/audio) from a File, client-side.
 * Best-effort: resolves with whatever loads; never rejects. */
export function probeMedia(file: File, kind: "image" | "gif" | "video" | "audio"): Promise<{ width?: number; height?: number; durationMs?: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const done = (r: { width?: number; height?: number; durationMs?: number }) => { URL.revokeObjectURL(url); resolve(r); };
    if (kind === "video") {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => done({ width: v.videoWidth || undefined, height: v.videoHeight || undefined, durationMs: isFinite(v.duration) ? Math.round(v.duration * 1000) : undefined });
      v.onerror = () => done({});
      v.src = url;
    } else if (kind === "audio") {
      const a = new Audio();
      a.preload = "metadata";
      a.onloadedmetadata = () => done({ durationMs: isFinite(a.duration) ? Math.round(a.duration * 1000) : undefined });
      a.onerror = () => done({});
      a.src = url;
    } else {
      const img = new Image();
      img.onload = () => done({ width: img.naturalWidth || undefined, height: img.naturalHeight || undefined });
      img.onerror = () => done({});
      img.src = url;
    }
  });
}

/** Read a video's duration (ms) from its URL. Resolves 0 if it can't load. */
export function probeVideoDurationMs(url: string): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => resolve(isFinite(v.duration) ? Math.round(v.duration * 1000) : 0);
    v.onerror = () => resolve(0);
    v.src = url;
  });
}

/** Best-effort: sum a GIF's frame delays to get one full-loop duration (ms).
 * Returns 0 if the bytes aren't a parseable GIF. */
export function parseGifDurationMs(buf: ArrayBuffer): number {
  const b = new Uint8Array(buf);
  if (b.length < 14 || b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) return 0; // "GIF"
  const skipSubBlocks = (p: number): number => {
    while (p < b.length) { const n = b[p++]!; if (n === 0) break; p += n; }
    return p;
  };
  let i = 13;
  const packed = b[10]!;
  if (packed & 0x80) i += 3 * (2 << (packed & 7)); // global color table
  let total = 0;
  try {
    while (i < b.length) {
      const block = b[i++];
      if (block === 0x3b) break; // trailer
      if (block === 0x21) { // extension
        const label = b[i++];
        if (label === 0xf9) { // graphic control extension
          const bs = b[i++]!; // block size (4)
          const delay = b[i + 1]! | (b[i + 2]! << 8);
          total += delay * 10;
          i += bs; i++; // skip block + terminator
        } else { i = skipSubBlocks(i); }
      } else if (block === 0x2c) { // image descriptor
        const lp = b[i + 8]!; i += 9;
        if (lp & 0x80) i += 3 * (2 << (lp & 7)); // local color table
        i++; // LZW min code size
        i = skipSubBlocks(i);
      } else break;
    }
  } catch { return 0; }
  return total;
}

/** Fetch a GIF and return its single-loop duration in ms (0 if unknown). */
export async function fetchGifDurationMs(url: string): Promise<number> {
  try { return parseGifDurationMs(await (await apiFetch(url)).arrayBuffer()); }
  catch { return 0; }
}

export async function listMedia(kind?: string): Promise<Media[]> {
  const q = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  return ((await (await apiFetch(`${API_BASE}/api/media${q}`)).json()) as { media: Media[] }).media;
}
export interface MediaMetaInput {
  kind: string; name?: string; assetHash?: string; assetUrl?: string; htmlBody?: string; mime?: string; bytes?: number;
  width?: number; height?: number; durationMs?: number;
  artist?: string; album?: string; genres?: string[]; vocal?: string; artHash?: string; artUrl?: string; source?: MediaSource;
}
export async function registerMedia(m: MediaMetaInput): Promise<string> {
  const res = await apiFetch(`${API_BASE}/api/media`, { method: "POST", headers: jhead, body: JSON.stringify(m) });
  if (!res.ok) throw new Error(`register failed (${res.status})`);
  return ((await res.json()) as { id: string }).id;
}
export async function updateMedia(id: string, patch: { name?: string; tags?: string[]; htmlBody?: string; artist?: string; album?: string; genres?: string[]; vocal?: string | null; artHash?: string | null; artUrl?: string | null }): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/media/${id}`, { method: "PUT", headers: jhead, body: JSON.stringify(patch) });
  if (!res.ok) throw new Error(`update failed (${res.status})`);
}
export async function deleteMedia(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/media/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete failed (${res.status})`);
}

/** Upload a file to R2, probe it, and register it in the library. Returns the
 * new/existing media row's essentials so callers can turn it into a slide/track. */
export async function uploadToLibrary(file: File): Promise<{ id: string; kind: "image" | "gif" | "video" | "audio"; hash: string; url: string; width?: number; height?: number; durationMs?: number }> {
  const kind = mediaKind(file);
  const [{ hash, url }, dims] = await Promise.all([uploadAsset(file), probeMedia(file, kind)]);
  const id = await registerMedia({ kind, name: file.name.replace(/\.[^.]+$/, ""), assetHash: hash, assetUrl: url, mime: file.type, bytes: file.size, ...dims });
  return { id, kind, hash, url, ...dims };
}

export async function removeSlide(channelId: string, slideId: string): Promise<void> {
  await apiFetch(`${API_BASE}/api/channels/${channelId}/slides/${slideId}`, { method: "DELETE" });
}
export async function reorderSlides(channelId: string, order: string[]): Promise<void> {
  await apiFetch(`${API_BASE}/api/channels/${channelId}/reorder`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ order }) });
}
export async function publishChannel(channelId: string): Promise<{ nudged: number; version?: number }> {
  const res = await apiFetch(`${API_BASE}/api/channels/${channelId}/publish`, { method: "POST" });
  if (!res.ok) throw await apiError(res, "publish");
  return (await res.json()) as { nudged: number; version?: number };
}

/** Channels that reference a shared building block (slide/music playlist, widget
 *  or ad profile) — used to offer republishing them after an edit. */
export async function channelsUsingPlaylist(
  kind: "slide" | "music" | "widget" | "ad",
  id: string,
): Promise<{ id: string; name: string }[]> {
  const res = await apiFetch(`${API_BASE}/api/playlists/${kind}/${id}/channels`);
  if (!res.ok) return [];
  return ((await res.json()) as { channels?: { id: string; name: string }[] }).channels ?? [];
}

export async function createChannel(name: string): Promise<{ id: string }> {
  const res = await apiFetch(`${API_BASE}/api/channels`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
  if (!res.ok) throw await apiError(res, "createChannel");
  return (await res.json()) as { id: string };
}


/* --------------------------------- sources -------------------------------- */

export type SourceProvider = "manual" | "rss" | "api" | "gsheet";

/** A source's normalized data — a header row + string cells (§sources). */
export interface SourceDataset {
  columns: string[];
  rows: string[][];
}

export interface Feed {
  id: string;
  name: string;
  provider: SourceProvider;
  config: { url?: string; path?: string; sheetId?: string; gid?: string; headers?: Record<string, string>; count?: number };
  refreshSec?: number;
  itemCount?: number;
  items?: { id: string; title: string; link: string | null }[];
  dataset?: SourceDataset;
  updatedAt?: number;
  dataAt?: number | null;
}

export async function listFeeds(): Promise<Feed[]> {
  return ((await (await apiFetch(`${API_BASE}/api/feeds`)).json()) as { feeds: Feed[] }).feeds;
}
export async function getFeed(id: string): Promise<Feed> {
  return (await (await apiFetch(`${API_BASE}/api/feeds/${id}`)).json()) as Feed;
}
/** The normalized dataset a source produces (for a bound widget's preview). */
export async function getSourceData(id: string): Promise<SourceDataset> {
  const res = await apiFetch(`${API_BASE}/api/feeds/${id}/data`);
  if (!res.ok) return { columns: [], rows: [] };
  return ((await res.json()) as { dataset: SourceDataset }).dataset ?? { columns: [], rows: [] };
}
/** Dry-run a source's config (fetch + normalize) without saving — for the mapping UI. */
export async function previewSource(provider: SourceProvider, config: unknown): Promise<{ dataset?: SourceDataset; rowCount?: number; error?: string }> {
  const res = await apiFetch(`${API_BASE}/api/feeds/preview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, config }) });
  return (await res.json()) as { dataset?: SourceDataset; rowCount?: number; error?: string };
}
/** Create a source of any provider with its full config + fetch frequency. */
export async function createSource(input: { name: string; provider: SourceProvider; config?: unknown; refreshSec?: number }): Promise<{ id: string }> {
  const res = await apiFetch(`${API_BASE}/api/feeds`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  if (!res.ok) throw await apiError(res, "createSource");
  return (await res.json()) as { id: string };
}
export async function updateSource(id: string, patch: { name?: string; config?: unknown; refreshSec?: number }): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/feeds/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
  if (!res.ok) throw await apiError(res, "updateSource");
}
/** Legacy helper kept for the manual/rss quick-create path. */
export async function createFeed(name: string, provider: "manual" | "rss", url?: string): Promise<{ id: string }> {
  return createSource({ name, provider, config: url ? { url } : {} });
}
export async function addFeedItem(id: string, title: string, link?: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/feeds/${id}/items`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, link }) });
  if (!res.ok) throw await apiError(res, "addFeedItem");
}
export async function deleteFeedItem(id: string, itemId: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/feeds/${id}/items/${itemId}`, { method: "DELETE" });
  if (!res.ok) throw await apiError(res, "deleteFeedItem");
}
export async function refreshFeed(id: string): Promise<{ count?: number; error?: string }> {
  return (await (await apiFetch(`${API_BASE}/api/feeds/${id}/refresh`, { method: "POST" })).json()) as { count?: number; error?: string };
}
export async function deleteFeed(id: string): Promise<void> {
  await apiFetch(`${API_BASE}/api/feeds/${id}`, { method: "DELETE" });
}

/* --------------------------------- alerts --------------------------------- */

export interface AlertRow {
  id: string;
  screen_id: string;
  screen_name: string | null;
  type: string;
  message: string;
  at: number;
  resolved_at: number | null;
}
export interface AlertRule {
  id: string;
  type: string;
  threshold_sec: number;
  channel: string;
  target: string | null;
  enabled: number;
}

export async function listAlerts(): Promise<AlertRow[]> {
  return ((await (await apiFetch(`${API_BASE}/api/alerts`)).json()) as { alerts: AlertRow[] }).alerts;
}
export async function listAlertRules(): Promise<AlertRule[]> {
  return ((await (await apiFetch(`${API_BASE}/api/alerts/rules`)).json()) as { rules: AlertRule[] }).rules;
}
export async function addAlertRule(rule: { type: string; thresholdSec: number; channel: string; target?: string }): Promise<void> {
  await apiFetch(`${API_BASE}/api/alerts/rules`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(rule) });
}
export async function deleteAlertRule(id: string): Promise<void> {
  await apiFetch(`${API_BASE}/api/alerts/rules/${id}`, { method: "DELETE" });
}

export type OverrideTone = "alarm" | "warning" | "info" | "neutral" | "success";

export interface ActiveEmergency {
  id: string;
  title: string;
  body: string;
  tone?: OverrideTone;
  epoch: number;
  count: number;
}

/** Broadcast a full-screen takeover to the tenant's screens (§12) — an emergency
 *  or an everyday notice, depending on the tone. */
export async function broadcastEmergency(title: string, body: string, tone: OverrideTone = "alarm"): Promise<{ overrideId: string; count: number }> {
  const res = await apiFetch(`${API_BASE}/api/emergency`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, body, tone }),
  });
  if (!res.ok) throw new Error(`emergency failed (${res.status})`);
  return (await res.json()) as { overrideId: string; count: number };
}

export async function clearEmergency(): Promise<{ cleared: number }> {
  const res = await apiFetch(`${API_BASE}/api/emergency/clear`, { method: "POST" });
  if (!res.ok) throw new Error(`clear failed (${res.status})`);
  return (await res.json()) as { cleared: number };
}

export async function getActiveEmergency(): Promise<ActiveEmergency | null> {
  const res = await apiFetch(`${API_BASE}/api/emergency/active`);
  if (!res.ok) return null;
  return ((await res.json()) as { active: ActiveEmergency | null }).active;
}

/** Claim a pairing code (§6). A new device is auto-provisioned its own editable
 *  display; pass `sample` to also seed a starter scene so it lights up at once. */
export async function claimScreen(code: string, name: string, sample = false): Promise<ClaimResult> {
  const res = await apiFetch(`${API_BASE}/api/pair/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, name, sample }),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<ClaimResult> & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `claim failed (${res.status})`);
  return body as ClaimResult;
}

/** One-click "load a sample display" onto a screen (§ onboarding). */
export async function seedSampleDisplay(screenId: string): Promise<{ channelId: string | null }> {
  const res = await apiFetch(`${API_BASE}/api/screens/${screenId}/seed-sample`, { method: "POST" });
  if (!res.ok) throw await apiError(res, "seedSampleDisplay");
  return (await res.json()) as { channelId: string | null };
}

/** Create a display (channel + composed blocks) not yet bound to a screen — prep
 *  content ahead of pairing, then assign it as a screen's channel later. */
export async function createDisplay(name?: string, sample = false): Promise<{ channelId: string }> {
  const res = await apiFetch(`${API_BASE}/api/displays`, { method: "POST", headers: jhead, body: JSON.stringify({ name, sample }) });
  if (!res.ok) throw await apiError(res, "createDisplay");
  return (await res.json()) as { channelId: string };
}

/** Load a sample scene onto a display by channel (for a display not bound to a screen). */
export async function seedDisplayChannel(channelId: string): Promise<{ ok: boolean }> {
  const res = await apiFetch(`${API_BASE}/api/channels/${channelId}/seed-sample`, { method: "POST" });
  if (!res.ok) throw await apiError(res, "seedDisplayChannel");
  return (await res.json()) as { ok: boolean };
}

/* ------------------------- billing / AI / admin (§24, §25) --------------- */

export type Role = "owner" | "operator" | "receptionist" | "viewer" | "board_coordinator" | "board_station";

export interface Me {
  user: { id: string; email: string; name?: string | null; image?: string | null } | null;
  email: string | null;
  tenantId: string | null;
  role: Role | null;
  isAdmin: boolean;
  /** Set when the signed-in account is a board-scoped user (§boards): they're
   *  routed to their control surface, not the operator app. */
  board: { boardId: string; stationId: string | null; kind: string; label: string } | null;
  /** The tenant's effective plan gates — used to hide/disable features the plan
   *  doesn't include. The server enforces the same; this is for UX only. */
  features: Record<string, unknown> | null;
  quotas: Record<string, number> | null;
  /** The caller's effective permission grant (custom per-user, else role preset). */
  permissions: Record<string, string[]> | null;
  authenticated: boolean;
}

export async function getMe(): Promise<Me> {
  const res = await apiFetch(`${API_BASE}/api/me`);
  if (!res.ok) throw new Error(`getMe ${res.status}`);
  return (await res.json()) as Me;
}

/* ------------------------------ team / members --------------------------- */

export interface TenantMember {
  memberId: string;
  userId: string;
  role: Role;
  name: string;
  email: string | null;
  /** Effective per-user permission grant (custom if set, else the role preset). */
  permissions: Record<string, string[]>;
  createdAt: string | null;
}

/** An invitation that has been sent and not yet accepted. It RESERVES a seat. */
export interface PendingInvitation {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
}

export interface TeamState {
  members: TenantMember[];
  /** The workspace's canonical slug — its door. */
  loginSlug: string | null;
  roles: Role[];
}

export async function getTeam(): Promise<TeamState> {
  const res = await apiFetch(`${API_BASE}/api/members`);
  if (!res.ok) throw new Error(`getTeam ${res.status}`);
  return (await res.json()) as TeamState;
}

/**
 * The seat accounting, from `@4dl/auth`'s staff routes.
 *
 * Read from the SERVER rather than derived from `members.length`, because the
 * two are not the same number: board users are memberships that do not consume
 * a seat, and a pending invitation consumes one without being a membership at
 * all. A screen that counts rows tells an owner they have seats they cannot use,
 * or none when several are free.
 */
export interface StaffSeats {
  used: number;
  pending: number;
  /** `-1` is unlimited. Never compare it numerically. */
  max: number;
  remaining: number;
}

export interface StaffState {
  members: { id: string; userId: string; role: Role; name: string | null; email: string | null; createdAt: string }[];
  invitations: PendingInvitation[];
  seats: StaffSeats;
  roles: { name: Role; label: string; blurb: string; grant: Record<string, string[]> }[];
  catalog: Record<string, string[]>;
  canManage: boolean;
}

export async function getStaff(): Promise<StaffState> {
  const res = await apiFetch(`${API_BASE}/api/staff`);
  if (!res.ok) throw new Error(`getStaff ${res.status}`);
  return (await res.json()) as StaffState;
}

/**
 * Invite somebody by email. They sign in with a one-time code — there is no
 * password for an admin to choose, hand over, or later read back.
 *
 * The accept URL comes back even when the mail did not, which is what makes an
 * invitation survive a misconfigured mailer: the owner can pass the link on.
 */
export async function inviteStaff(input: { email: string; role: Role }): Promise<{ id: string; url: string; emailed: boolean; emailError: string | null }> {
  const res = await apiFetch(`${API_BASE}/api/staff/invite`, { method: "POST", headers: jhead, body: JSON.stringify(input) });
  const body = (await res.json()) as { id?: string; url?: string; emailed?: boolean; emailError?: string | null; error?: string };
  if (!res.ok) throw new Error(body.error ?? "Could not send the invitation");
  return { id: body.id ?? "", url: body.url ?? "", emailed: body.emailed ?? false, emailError: body.emailError ?? null };
}

export async function cancelInvitation(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/staff/invitations/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Could not cancel the invitation");
}

export async function setMemberRole(userId: string, role: Role): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/staff/${userId}/role`, { method: "PATCH", headers: jhead, body: JSON.stringify({ role }) });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Could not change role");
}

export async function revokeMember(userId: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/staff/${userId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Could not remove them");
}

/**
 * Narrow a member below their role. An empty grant clears the override.
 *
 * ⚠️ This can only ever REMOVE capability — the server intersects what is sent
 * here with the role's preset. Sending a power the role does not carry is not an
 * error and is not applied; it simply resolves to nothing.
 */
export async function setMemberPermissions(memberId: string, permissions: Record<string, string[]>): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/members/${memberId}/permissions`, { method: "POST", headers: jhead, body: JSON.stringify({ permissions }) });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Could not update permissions");
}

/** Public: resolve a typed workspace (slug or name) to its canonical login slug. */
export async function resolveWorkspace(q: string): Promise<{ slug: string; name: string } | null> {
  const res = await apiFetch(`${API_BASE}/api/org/resolve?q=${encodeURIComponent(q)}`);
  if (!res.ok) return null;
  return (await res.json()) as { slug: string; name: string };
}

/* ------------------------ admin: factory reset (nuke) --------------------- */
/** Email the admin a factory-reset code. */
export async function nukeRequest(): Promise<{ ok?: boolean; sentTo?: string; error?: string }> {
  const res = await apiFetch(`${API_BASE}/api/admin/nuke/request`, { method: "POST" });
  return (await res.json().catch(() => ({}))) as { ok?: boolean; sentTo?: string; error?: string };
}
/** Confirm the code + phrase → WIPES EVERYTHING. Returns wipe counts or an error. */
export async function nukeConfirm(otp: string, phrase: string): Promise<{ ok?: boolean; error?: string; tables?: number; kvKeys?: number; objects?: number }> {
  const res = await apiFetch(`${API_BASE}/api/admin/nuke/confirm`, { method: "POST", headers: jhead, body: JSON.stringify({ otp, phrase }) });
  return (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; tables?: number; kvKeys?: number; objects?: number };
}

export interface Balance {
  balance: number;
  held: number;
  available: number;
}

/**
 * A plan as the TENANT-facing `/api/billing` payload carries it — the raw row,
 * cents and all. Distinct from `AdminPlanRef` on purpose: the operator console's
 * catalog read speaks `@4dl/admin`'s contract (dollars, resolved entitlements)
 * and this one has not moved.
 */
export interface Plan {
  id: string;
  name: string;
  /**
   * ⚠️ DOLLARS, not cents, and `ord`, not `sort` — `@4dl/billing`'s column names
   * since the schema reconciliation. `currency` and `interval` are gone with
   * them: every Scena plan was always `usd`/`month`, which is why the shared
   * shape (`price_usd_month`) loses nothing by not having them.
   */
  price_usd_month: number;
  entitlements_json: string | null;
  stripe_price_id: string | null;
  active: number;
  ord: number;
}

/** A plan, as much of one as the promo picker needs to name it. */
export interface AdminPlanRef {
  id: string;
  name: string;
}

export interface Pack {
  id: string;
  name: string;
  credits: number;
  /** Dollars, as `plans.price_usd_month` is. */
  price_usd: number;
  stripe_price_id: string | null;
}

export interface Subscription {
  tenant_id: string;
  plan_id: string;
  status: string;
  comp: number;
  /** ISO-8601 text. These held epoch milliseconds before the reconciliation. */
  current_period_end: string | null;
  suspend_at: string | null;
  delete_at: string | null;
}

export interface LedgerEntry {
  id: string;
  delta: number;
  balance: number;
  reason: string;
  ref: string | null;
  /** Epoch milliseconds. `@4dl/billing` calls this column `at`. */
  at: number;
}

export interface Entitlements {
  quotas: Record<string, number>;
  features: Record<string, unknown>;
  aiCredits: { monthlyGrant: number };
}

export interface BillingState {
  subscription: Subscription;
  plan: Plan | null;
  entitlements: Entitlements;
  balance: Balance;
  plans: Plan[];
  packs: Pack[];
  ledger: LedgerEntry[];
  /** Media stored against the plan's `storageMb` ceiling. `limitBytes < 0` =
   *  unlimited. Optional so a client built against an older worker still
   *  renders rather than crashing on a missing field. */
  storage?: { usedBytes: number; limitBytes: number };
  stripeEnabled: boolean;
}

export async function getBilling(): Promise<BillingState> {
  const res = await apiFetch(`${API_BASE}/api/billing`);
  if (!res.ok) throw new Error(`getBilling ${res.status}`);
  return (await res.json()) as BillingState;
}

export interface Violation {
  type: string;
  resource: string;
  have?: number;
  max?: number;
  removeCount?: number;
  instances?: number;
  action?: string;
}

export interface DowngradeCheck {
  targetPlan: string;
  eligible: boolean;
  violations: Violation[];
}

export async function checkDowngrade(planId: string): Promise<DowngradeCheck> {
  const res = await apiFetch(`${API_BASE}/api/billing/downgrade/check`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ planId }),
  });
  if (!res.ok) throw await apiError(res, "downgrade");
  return (await res.json()) as DowngradeCheck;
}

export async function changePlan(planId: string): Promise<{ ok?: boolean; checkoutUrl?: string; blocked?: boolean; violations?: Violation[]; error?: string }> {
  const res = await apiFetch(`${API_BASE}/api/billing/change-plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ planId }),
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; checkoutUrl?: string; blocked?: boolean; violations?: Violation[]; error?: string };
  // 409 = downgrade blocked with violations; 402 = payments not available — both
  // are handled inline by the caller rather than thrown.
  if (res.status === 409 || res.status === 402) return body;
  if (!res.ok) throw new Error(body.error ?? `changePlan ${res.status}`);
  return body;
}

export async function buyPack(packId: string): Promise<{ checkoutUrl?: string; error?: string }> {
  const res = await apiFetch(`${API_BASE}/api/billing/checkout/pack`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ packId }),
  });
  return (await res.json().catch(() => ({}))) as { checkoutUrl?: string; error?: string };
}

export async function redeemPromo(code: string): Promise<{ ok?: boolean; kind?: string; credits?: number; planId?: string; balance?: Balance; error?: string }> {
  const res = await apiFetch(`${API_BASE}/api/billing/promo`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; kind?: string; credits?: number; planId?: string; balance?: Balance; error?: string };
  if (!res.ok) throw new Error(body.error ?? `redeem ${res.status}`);
  return body;
}

export interface AiModel {
  id: string;
  label: string;
  task: string;
  markup: number;
}

export async function listAiModels(): Promise<AiModel[]> {
  const res = await apiFetch(`${API_BASE}/api/ai/models`);
  if (!res.ok) throw new Error(`listAiModels ${res.status}`);
  return ((await res.json()) as { models: AiModel[] }).models;
}

export interface GenerateResult {
  ok: boolean;
  task: string;
  model: string;
  html?: string;
  assetUrl?: string;
  assetHash?: string;
  mime?: string;
  durationMs?: number;
  neurons: number;
  credits: number;
  cached: boolean;
  slideId?: string;
  /** For the layout task: the validated widget nodes to drop on the canvas. */
  widgets?: unknown[];
  error?: string;
  detail?: string;
  available?: number;
  needed?: number;
}

/** Generation can be slow (large models write a whole slide) — bound it and turn
 *  a dropped connection / timeout into a clear, structured error instead of an
 *  opaque "Failed to fetch" the callers would surface verbatim. */
const AI_TIMEOUT_MS = 210_000;

async function aiPost(path: string, req: unknown, task: string): Promise<GenerateResult> {
  try {
    const res = await apiFetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as GenerateResult;
    // A non-OK status with no ok/error field (e.g. a gateway 5xx) → normalize.
    if (!res.ok && body.error == null && body.ok == null) {
      return { ok: false, task, model: "", neurons: 0, credits: 0, cached: false, error: "generation_failed", detail: `server error (${res.status})` } as GenerateResult;
    }
    return body;
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === "TimeoutError";
    return {
      ok: false, task, model: "", neurons: 0, credits: 0, cached: false,
      error: "generation_failed",
      detail: timedOut ? "The model took too long — try a faster model or a shorter prompt." : "Couldn't reach the AI service — check your connection and try again.",
    } as GenerateResult;
  }
}

// modelId is optional — omit it and the API uses the tenant's default for the task.
export async function aiGenerate(req: { task: string; modelId?: string; prompt: string; options?: Record<string, unknown>; channelId?: string; addSlide?: boolean }): Promise<GenerateResult> {
  return aiPost("/api/ai/generate", req, req.task);
}

/** AI layout designer (§24): design a widget layout from scratch, or improve/
 *  extend the current canvas. Returns validated widget nodes to apply. */
export async function aiLayout(req: { prompt: string; widgets?: unknown[]; designW?: number; designH?: number; modelId?: string }): Promise<GenerateResult> {
  return aiPost("/api/ai/layout", req, "layout");
}

/** Per-task default model ids (keyed by task: text | image | tts | music). */
export type AiDefaults = Record<string, string>;

export async function getAiDefaults(): Promise<AiDefaults> {
  const res = await apiFetch(`${API_BASE}/api/ai/defaults`);
  if (!res.ok) return {};
  return ((await res.json()) as { defaults: AiDefaults }).defaults ?? {};
}

export async function setAiDefaults(defaults: AiDefaults): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/ai/defaults`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(defaults) });
  if (!res.ok) throw await apiError(res, "setAiDefaults");
}

/* ------------------------------- admin ----------------------------------- */

export async function getAdminConfig(): Promise<Record<string, string>> {
  const res = await apiFetch(`${API_BASE}/api/admin/config`);
  if (!res.ok) throw new Error(`getAdminConfig ${res.status}`);
  return ((await res.json()) as { config: Record<string, string> }).config;
}

export async function setAdminConfig(config: Record<string, string>): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/admin/config`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ config }),
  });
  if (!res.ok) throw await apiError(res, "setAdminConfig");
}

/*
  THE STRIPE PING AND CATALOG SYNC ARE `@4dl/admin`'s NOW — `PlatformStripeSection`
  reaches those routes through the `AdminApi` the console injects, which
  is why `admin-panels.conformance.test.ts` refuses a direct helper for one of
  those paths anywhere in this SPA. A second caller is a second answer to "what
  is configured", and the panel's two-lane model is the one that can tell an
  operator the stored catalog belongs to the other lane.
*/

/**
 * The plan list, for the ONE surface that still needs it here: the promo-code
 * dialog's "which plan does this apply to" picker.
 *
 * Editing a plan is `@4dl/admin`'s `PlatformPlansSection` and goes through the
 * package, which is why there is no `adminSavePlan` any more. `id` and `name`
 * are all this caller reads, and saying so keeps the SPA from re-declaring a
 * payload shape the server owns.
 */
export async function adminListPlans(): Promise<AdminPlanRef[]> {
  return ((await (await apiFetch(`${API_BASE}/api/admin/plans`)).json()) as { plans: AdminPlanRef[] }).plans;
}

/*
  THE AI MODEL CATALOG'S TYPES AND HELPERS ARE `@4dl/ai`'s NOW, rendered by
  `@4dl/admin`'s `PlatformAiSection` over `aiCatalogAdminRoutes`. `AdminModel`,
  `adminListModels`, `adminSaveModel`, `RateSyncProvider`, `ResyncResult` and
  `adminResyncModels` all went with it — a duplicate row shape in the browser is
  how the `cf_model` column survived three stages after the server stopped
  writing one.
*/

export interface PromoCode {
  code: string;
  kind: string;
  credits: number | null;
  plan_id: string | null;
  plan_months: number | null;
  max_redemptions: number | null;
  redeemed_count: number;
  per_tenant_limit: number | null;
  expires_at: number | null;
  note: string | null;
  active: number;
}

export async function adminListPromos(): Promise<PromoCode[]> {
  return ((await (await apiFetch(`${API_BASE}/api/admin/promos`)).json()) as { promos: PromoCode[] }).promos;
}

export async function adminCreatePromo(input: { code: string; kind: string; credits?: number; planId?: string; planMonths?: number; maxRedemptions?: number | null; perTenantLimit?: number | null; note?: string }): Promise<{ ok?: boolean; error?: string }> {
  const res = await apiFetch(`${API_BASE}/api/admin/promos`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  return (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
}

export async function adminTogglePromo(code: string): Promise<void> {
  await apiFetch(`${API_BASE}/api/admin/promos/${code}/toggle`, { method: "POST" });
}

export interface AdminTenant extends Subscription {
  balance: number;
}

export async function adminListTenants(): Promise<AdminTenant[]> {
  return ((await (await apiFetch(`${API_BASE}/api/admin/tenants`)).json()) as { tenants: AdminTenant[] }).tenants;
}

export interface EntitlementsShape {
  quotas: Record<string, number>;
  features: Record<string, boolean | string[]>;
  aiCredits: { monthlyGrant: number };
}
export interface TenantEntitlements {
  planId: string;
  plan: EntitlementsShape;
  overrides: { quotas?: Record<string, number>; features?: Record<string, boolean | string[]>; aiCredits?: { monthlyGrant: number } };
  effective: EntitlementsShape;
}

export async function adminGetTenantEntitlements(tenantId: string): Promise<TenantEntitlements> {
  return (await (await apiFetch(`${API_BASE}/api/admin/tenants/${tenantId}/entitlements`)).json()) as TenantEntitlements;
}

export async function adminSetTenantOverrides(tenantId: string, overrides: TenantEntitlements["overrides"]): Promise<void> {
  await apiFetch(`${API_BASE}/api/admin/tenants/${tenantId}/overrides`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ overrides }) });
}

export async function adminAdjustCredits(tenantId: string, mode: "add" | "set", credits: number): Promise<void> {
  await apiFetch(`${API_BASE}/api/admin/tenants/${tenantId}/credits`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, credits }) });
}

export async function adminTenantLifecycle(tenantId: string, action: "suspend" | "reactivate" | "delete"): Promise<void> {
  await apiFetch(`${API_BASE}/api/admin/tenants/${tenantId}/lifecycle`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
}

export async function adminSweep(): Promise<{ actions: { tenantId: string; from: string; to: string }[] }> {
  return (await (await apiFetch(`${API_BASE}/api/admin/lifecycle/sweep`, { method: "POST" })).json()) as { actions: { tenantId: string; from: string; to: string }[] };
}

/* --------------------------------- ads (§21) ----------------------------- */

/** A reusable ad rotation, bound by channels. */
export interface AdProfile {
  id: string;
  name: string;
  created_at: number;
  tags?: string[];
  adCount?: number;
  channelCount?: number;
}

export interface Ad {
  id: string;
  profile_id: string | null;
  name: string;
  kind: "audio" | "video" | "command";
  audio_url: string | null;
  video_url: string | null;
  html: string | null;
  duration_ms: number;
  every_min: number;
  mode: string;
  enabled: number;
}

export async function listAdProfiles(): Promise<AdProfile[]> {
  return ((await (await apiFetch(`${API_BASE}/api/ad-profiles`)).json()) as { profiles: AdProfile[] }).profiles;
}

export async function createAdProfile(name: string): Promise<string> {
  return ((await (await apiFetch(`${API_BASE}/api/ad-profiles`, { method: "POST", headers: jhead, body: JSON.stringify({ name }) })).json()) as { id: string }).id;
}

export async function getAdProfile(id: string): Promise<AdProfile & { ads: Ad[] }> {
  const res = await apiFetch(`${API_BASE}/api/ad-profiles/${id}`);
  if (!res.ok) throw new Error(`getAdProfile ${res.status}`);
  return (await res.json()) as AdProfile & { ads: Ad[] };
}

export async function updateAdProfile(id: string, patch: { name?: string; tags?: string[] }): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/ad-profiles/${id}`, { method: "PUT", headers: jhead, body: JSON.stringify(patch) });
  if (!res.ok) throw new Error(`update failed (${res.status})`);
}

export async function deleteAdProfile(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/ad-profiles/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete failed (${res.status})`);
}

export async function createAd(
  profileId: string,
  body: { name: string; kind: string; audioUrl?: string; videoUrl?: string; html?: string; durationMs: number; everyMin: number; hideBadge?: boolean; companionUrl?: string },
): Promise<{ id?: string; error?: string }> {
  const res = await apiFetch(`${API_BASE}/api/ad-profiles/${profileId}/ads`, {
    method: "POST",
    headers: jhead,
    body: JSON.stringify(body),
  });
  return (await res.json().catch(() => ({}))) as { id?: string; error?: string };
}

export async function toggleAd(adId: string): Promise<void> {
  await apiFetch(`${API_BASE}/api/ads/${adId}/toggle`, { method: "POST" });
}

export async function deleteAd(adId: string): Promise<void> {
  await apiFetch(`${API_BASE}/api/ads/${adId}`, { method: "DELETE" });
}

export async function playAd(adId: string): Promise<{ ok: boolean; screens: number; channels?: number }> {
  return (await (await apiFetch(`${API_BASE}/api/ads/${adId}/play`, { method: "POST" })).json()) as { ok: boolean; screens: number; channels?: number };
}

/* -------------------------------- music (§16) ---------------------------- */

export interface Track {
  id: string;
  channel_id: string;
  ord: number;
  title: string;
  asset_hash: string;
  asset_url: string;
  duration_ms: number;
  library_id?: string | null;
  artist?: string | null;
  art_hash?: string | null;
  art_url?: string | null;
}

export async function listTracks(channelId: string): Promise<Track[]> {
  const res = await apiFetch(`${API_BASE}/api/channels/${channelId}/tracks`);
  if (!res.ok) throw new Error(`listTracks ${res.status}`);
  return ((await res.json()) as { tracks: Track[] }).tracks;
}

export async function addTrack(channelId: string, body: { title: string; assetHash: string; assetUrl: string; durationMs: number; artist?: string; artHash?: string; artUrl?: string }): Promise<{ id?: string; error?: string }> {
  const res = await apiFetch(`${API_BASE}/api/channels/${channelId}/tracks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json().catch(() => ({}))) as { id?: string; error?: string };
}

export async function deleteTrack(channelId: string, trackId: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/channels/${channelId}/tracks/${trackId}`, { method: "DELETE" });
  if (!res.ok) throw await apiError(res, "deleteTrack");
}

export async function reorderTracks(channelId: string, order: string[]): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/channels/${channelId}/tracks/reorder`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order }),
  });
  if (!res.ok) throw await apiError(res, "reorderTracks");
}

/* ---------------------- licensed music library (§16 ext) ------------------ */

export interface LibraryTrack {
  id: string;
  genre: string;
  title: string;
  artist: string;
  asset_hash: string;
  asset_url: string;
  duration_ms: number;
  art_hash?: string | null;
  art_url?: string | null;
  vocal?: string | null;
}
export interface LibraryGenre {
  genre: string;
  count: number;
}
export interface LibraryBrowse {
  enabled: boolean;
  limit: number;
  used: number;
  genres: LibraryGenre[];
  tracks: LibraryTrack[];
}

/** Tenant: browse the licensed library (optionally by genre) + gating info. */
export async function browseLibrary(genre?: string): Promise<LibraryBrowse> {
  const res = await apiFetch(`${API_BASE}/api/library${genre ? `?genre=${encodeURIComponent(genre)}` : ""}`);
  if (!res.ok) return { enabled: false, limit: 0, used: 0, genres: [], tracks: [] };
  return (await res.json()) as LibraryBrowse;
}

/** Admin: the global catalog + genres. */
export async function adminListLibrary(): Promise<{ tracks: LibraryTrack[]; genres: LibraryGenre[] }> {
  const res = await apiFetch(`${API_BASE}/api/admin/library`);
  if (!res.ok) return { tracks: [], genres: [] };
  return (await res.json()) as { tracks: LibraryTrack[]; genres: LibraryGenre[] };
}

export async function adminAddLibraryTrack(body: { genre: string; title: string; artist: string; assetHash: string; assetUrl: string; durationMs: number; artHash?: string; artUrl?: string; vocal?: string }): Promise<{ id?: string; error?: string }> {
  const res = await apiFetch(`${API_BASE}/api/admin/library`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return (await res.json().catch(() => ({}))) as { id?: string; error?: string };
}

export async function adminUpdateLibraryTrack(id: string, patch: { genre?: string; title?: string; artist?: string; vocal?: string | null; artHash?: string | null; artUrl?: string | null }): Promise<{ ok?: boolean; error?: string }> {
  const res = await apiFetch(`${API_BASE}/api/admin/library/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
  return (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
}

export async function adminDeleteLibraryTrack(id: string): Promise<void> {
  await apiFetch(`${API_BASE}/api/admin/library/${id}`, { method: "DELETE" });
}

/* --------------------------- versions & rollback (§10) ------------------- */

export interface Version {
  id: string;
  channel_id: string;
  version: number;
  hash: string;
  note: string | null;
  published_by: string | null;
  created_at: number;
}

export async function listVersions(channelId: string): Promise<{ versions: Version[]; current: number | null }> {
  const res = await apiFetch(`${API_BASE}/api/channels/${channelId}/versions`);
  if (!res.ok) throw new Error(`listVersions ${res.status}`);
  return (await res.json()) as { versions: Version[]; current: number | null };
}

export async function rollbackVersion(channelId: string, version: number): Promise<{ ok: boolean; nudged?: number }> {
  const res = await apiFetch(`${API_BASE}/api/channels/${channelId}/rollback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ version }),
  });
  return (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; nudged?: number };
}

export async function publishChannelNote(channelId: string, note: string): Promise<{ version?: number; nudged?: number }> {
  const res = await apiFetch(`${API_BASE}/api/channels/${channelId}/publish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ note }),
  });
  return (await res.json().catch(() => ({}))) as { version?: number; nudged?: number };
}

/* ------------------------------- email (§23/§25) ------------------------- */
/*
  THE TEST SEND IS `@4dl/admin`'s — `PlatformEmailSection`, which this console
  has mounted since it moved to the `admin.` door. `sendTestEmail` was the
  second caller of the shared test-send route, from a form in the Stripe tab that
  also wrote the sender rows the shared panel owns: two screens answering "what
  is the sender" with no rule about which wins.
*/

/* -------------------------------- weather (§17) -------------------------- */

export interface WeatherConfig {
  /** Whether the platform OpenWeather key is set (else locations mock, for free). */
  hasKey: boolean;
  /** Credits charged per real weather fetch. */
  creditsPerCall: number;
}

export interface WeatherCurrent {
  temp: number;
  hi: number;
  lo: number;
  condition: string;
  icon: string;
  pop: number;
}

export interface WeatherLocation {
  id: string;
  label: string;
  lat: number;
  lon: number;
  refresh_sec: number;
  open_hour: number | null;
  close_hour: number | null;
  tz: string | null;
  units: string | null;
  current: WeatherCurrent | null;
  /** Server-computed projection from the opening-hours window. */
  callsPerDay: number;
  dailyCredits: number;
}

/** Single-screen playback mode (§7): free-run instead of multi-screen sync. */
export async function getPlayback(): Promise<{ freeRun: boolean }> {
  return (await (await apiFetch(`${API_BASE}/api/playback`)).json()) as { freeRun: boolean };
}
export async function setPlayback(freeRun: boolean): Promise<void> {
  await apiFetch(`${API_BASE}/api/playback`, { method: "PUT", headers: jhead, body: JSON.stringify({ freeRun }) });
}

export async function listWeatherLocations(): Promise<{ locations: WeatherLocation[]; creditsPerCall: number }> {
  return (await (await apiFetch(`${API_BASE}/api/weather`)).json()) as { locations: WeatherLocation[]; creditsPerCall: number };
}

export interface WeatherLocationInput {
  city?: string;
  label?: string;
  lat?: number;
  lon?: number;
  openHour?: number;
  closeHour?: number;
  tz?: string;
  units?: string;
}

export async function addWeatherLocation(body: WeatherLocationInput): Promise<{ id?: string; error?: string }> {
  const res = await apiFetch(`${API_BASE}/api/weather`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return (await res.json().catch(() => ({}))) as { id?: string; error?: string };
}

export async function updateWeatherLocation(id: string, body: { label?: string; openHour?: number; closeHour?: number; tz?: string; units?: string }): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/weather/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw await apiError(res, "updateWeatherLocation");
}

export async function deleteWeatherLocation(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/weather/${id}`, { method: "DELETE" });
  if (!res.ok) throw await apiError(res, "deleteWeatherLocation");
}

export async function refreshWeatherLocation(id: string): Promise<WeatherCurrent | null> {
  const res = await apiFetch(`${API_BASE}/api/weather/${id}/refresh`, { method: "POST" });
  return ((await res.json().catch(() => ({}))) as { current?: WeatherCurrent }).current ?? null;
}

/* ────────────────────────────── onboarding ──────────────────────────────────
 *
 * The two calls the first-run wizard makes, and both live under `/api/me/` for
 * one reason: the route guard's `isPersonal` lane is the only authenticated lane
 * that does not demand a tenancy, and the wizard runs on the SETUP door where
 * there is no workspace yet. See `apps/scena/src/onboarding-routes.ts`.
 */

export interface OnboardingPlan {
  id: string;
  name: string;
  priceCents: number;
  interval: string;
  trialDays: number;
  /** The raw blob — `planHighlights` turns it into the "what you get" lines,
   *  the same ones the Billing screen renders. */
  entitlementsJson: string;
}

export interface OnboardingPlansFeed {
  plans: OnboardingPlan[];
  /** False on a deployment with no Stripe keys — drives the wizard's degrade
   *  path, where the workspace is created and nothing is charged. */
  stripeEnabled: boolean;
  hasTenant: boolean;
  current: { planId: string; pendingPlanId: string | null; status: string } | null;
}

export async function getOnboardingPlans(): Promise<OnboardingPlansFeed> {
  const res = await apiFetch(`${API_BASE}/api/me/onboarding/plans`);
  if (!res.ok) throw await apiError(res, "Couldn't load the plans");
  return (await res.json()) as OnboardingPlansFeed;
}

export interface OnboardingPlanChoice {
  planId: string;
  planName: string;
  trialDays: number;
  stripeEnabled: boolean;
  /** `checkout` ⇒ send the owner to `checkoutUrl`. `pending` ⇒ the workspace is
   *  live on the free baseline with the choice recorded; nothing was charged. */
  billing: "checkout" | "pending";
  checkoutUrl?: string;
  /** Why it degraded, when Stripe is configured but could not mint a session. */
  detail?: string;
}

export async function chooseOnboardingPlan(planId: string): Promise<OnboardingPlanChoice> {
  const res = await apiFetch(`${API_BASE}/api/me/onboarding/plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ planId }),
  });
  if (!res.ok) throw await apiError(res, "Couldn't save your plan choice");
  return (await res.json()) as OnboardingPlanChoice;
}
