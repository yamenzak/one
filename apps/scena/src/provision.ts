/**
 * One-shot display provisioning (§ onboarding).
 *
 * The authoring model is deliberately DRY — a channel *composes* reusable slide/
 * music playlists + a widget profile, and a device is *assigned* a channel. That
 * is the right shape at scale, but it makes a first display a six-page assembly
 * chore. These helpers collapse that: pairing a screen auto-creates its own
 * channel + empty playlists + widget profile, composes them, and binds the
 * channel to the device — so the operator lands on ONE editable "display" instead
 * of wiring the graph by hand. `seedSampleDisplay` fills it with a polished
 * starter scene in a single click (the built-in demo SVG slides + a self-contained
 * widget layer, no R2 upload), so a freshly paired screen can light up instantly.
 *
 * Everything here is a thin composition of the existing store primitives, so the
 * compiler / versioning / nudge path is unchanged — this is purely the wiring
 * newcomers shouldn't have to do themselves.
 */
import type { Widget } from "@scena/manifest";
import type { Env } from "./env.js";
import { getChannel, createChannel, setChannelComposition } from "./content.js";
import { createSlidePlaylist, createMusicPlaylist, addPlaylistSlide, listPlaylistSlides } from "./playlist-store.js";
import { createWidgetProfile, saveProfileWidgets } from "./profile-store.js";
import { setDeviceChannel } from "./db.js";
import { publishVersion } from "./versions.js";
import { DEMO_SLIDES } from "./demo.js";

/** Make `channelId` the device's active channel — both in D1 (so the dashboard
 *  lists it) and in the live ScreenDO (so the screen switches now). Best-effort
 *  on the DO: a screen that never came online just picks it up on next resolve. */
async function assignChannelToScreen(env: Env, screenId: string, channelId: string): Promise<void> {
  await setDeviceChannel(env.DB, screenId, channelId);
  try {
    await env.SCREEN.get(env.SCREEN.idFromString(screenId)).setDefaultChannel(channelId);
  } catch {
    /* screen not live as a DO yet — the D1 assignment applies when it resolves */
  }
}

/**
 * Create a display: a channel that composes a fresh (empty) slide playlist +
 * music playlist + widget profile, all named after it. Returns the new channel
 * id. This is a display the operator can edit as one thing — bound to a screen
 * or prepared ahead of pairing.
 */
export async function provisionDisplay(env: Env, name: string, tenantId: string): Promise<string> {
  const base = (name || "Display").slice(0, 60);
  const slidePlaylistId = await createSlidePlaylist(env.DB, `${base} — slides`, tenantId);
  const musicPlaylistId = await createMusicPlaylist(env.DB, `${base} — music`, tenantId);
  const widgetProfileId = await createWidgetProfile(env.DB, `${base} — widgets`, { tenantId });
  const channelId = await createChannel(env.DB, base, tenantId);
  await setChannelComposition(env.DB, channelId, { slidePlaylistId, musicPlaylistId, widgetProfileId });
  return channelId;
}

/**
 * Create a display and bind it to a screen as its active channel, so a paired
 * device lands on ONE editable display instead of assembling + binding the
 * pieces across pages. Returns the new channel id.
 */
export async function provisionDisplayForScreen(env: Env, screenId: string, name: string, tenantId: string): Promise<string> {
  const channelId = await provisionDisplay(env, name, tenantId);
  await assignChannelToScreen(env, screenId, channelId);
  return channelId;
}

/** A self-contained starter widget layer (no bindings needed): a digital clock
 *  and a small brand tag, positioned as corner chrome so they complement — never
 *  cover — the sample slides. Design space is 1920×1080 (the profile default). */
export const SAMPLE_WIDGETS: Widget[] = [
  {
    id: "sample-clock",
    type: "clock",
    rect: [1490, 908, 372, 116],
    rot: 0,
    z: 20,
    style: { color: "#ffffff", opacity: 0.95, fontSize: 68, font: "mono", fontWeight: "700" },
    config: { style: "digital", format: "HH:mm" },
  },
  {
    id: "sample-tag",
    type: "text",
    rect: [64, 936, 760, 80],
    rot: 0,
    z: 20,
    style: { color: "#ffffff", opacity: 0.82, fontSize: 40, fontWeight: "700", font: "sans", align: "left" },
    config: { text: "Powered by Scena", variant: "plain" },
  },
];

/**
 * Fill a channel's display with a polished starter scene — the built-in demo SVG
 * slides (served by the API, no R2 needed) plus the sample widget layer — and
 * publish it, so a paired screen shows real, clock-synced content in one click.
 * Slides are only seeded when the playlist is empty, so a repeat click can't
 * stack duplicates; the widget layer is (re)applied either way. No-op if the
 * channel has no composed playlists (an unprovisioned/legacy channel).
 */
export async function seedSampleDisplay(env: Env, channelId: string, origin: string): Promise<boolean> {
  const channel = await getChannel(env.DB, channelId);
  if (!channel || !channel.slide_playlist_id) return false;

  const existing = await listPlaylistSlides(env.DB, channel.slide_playlist_id);
  if (existing.length === 0) {
    for (const s of DEMO_SLIDES) {
      await addPlaylistSlide(env.DB, channel.slide_playlist_id, {
        type: "image",
        assetHash: `demo-${s.asset}`,
        assetUrl: `/api/demo/asset/${s.asset}.svg`,
        durationMs: s.durationMs,
      });
    }
  }
  if (channel.widget_profile_id) await saveProfileWidgets(env.DB, channel.widget_profile_id, SAMPLE_WIDGETS);

  await publishVersion(env, channelId, origin, { note: "Sample display", publishedBy: "Scena" });
  return true;
}
