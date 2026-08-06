/**
 * The screen ⇄ ScreenDO wire protocol (BLUEPRINT §6, §7, §9, §11).
 *
 * Two message families flow over one hibernatable WebSocket:
 *   - screen → server (ClientMessage): pairing hello, clock-sync ping, telemetry
 *   - server → screen (ServerMessage): pairing state, clock-sync pong, manifest
 *     nudges, commands, interrupts
 *
 * Zod schemas double as runtime validators at the socket boundary — a screen is
 * an untrusted client, so every inbound frame is parsed before it is trusted.
 */

import { z } from "zod";

export const PROTOCOL_VERSION = 1;

/* ----------------------------- client → server ---------------------------- */

/** First frame after connect: the screen announces itself. */
export const HelloMsg = z.object({
  type: z.literal("hello"),
  protocol: z.literal(PROTOCOL_VERSION),
  /** Present when re-connecting an already-claimed screen (device token). */
  screenId: z.string().optional(),
  userAgent: z.string().optional(),
  /** The device's own detected resolution (physical px), so the operator sees
   *  the real display size and dimensions auto-populate (§13). */
  w: z.number().int().positive().optional(),
  h: z.number().int().positive().optional(),
});

/** NTP-style clock sync request (§7). `tSend` is the screen's monotonic time. */
export const SyncPingMsg = z.object({
  type: z.literal("sync.ping"),
  tSend: z.number(),
});

/** A heartbeat re-arms the ScreenDO dead-man's-switch (§23). */
export const HeartbeatMsg = z.object({
  type: z.literal("heartbeat"),
  /** Screen-synced timestamp; lets the server see clock drift. */
  syncedNow: z.number(),
  /** Currently rendered content id, for the live fleet view (§23). */
  contentId: z.string().optional(),
  cacheReady: z.boolean().optional(),
});

/** Buffered proof-of-play events, flushed periodically / on reconnect (§22). */
export const PlayoutEventsMsg = z.object({
  type: z.literal("playout.events"),
  events: z.array(
    z.object({
      eventId: z.string(),
      contentId: z.string(),
      kind: z.enum(["slide", "ad", "widget", "queue_call"]),
      ts: z.number(),
      durationMs: z.number().optional(),
    }),
  ),
});

export const ClientMessage = z.discriminatedUnion("type", [
  HelloMsg,
  SyncPingMsg,
  HeartbeatMsg,
  PlayoutEventsMsg,
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

/* ----------------------------- server → client ---------------------------- */

export const PairingState = z.enum(["pairing", "claimed", "assigned"]);
export type PairingState = z.infer<typeof PairingState>;

/** Sent right after connect (and on any pairing transition, §6). */
export const PairingMsg = z.object({
  type: z.literal("pairing"),
  state: PairingState,
  /** The human-visible pairing code, shown while `state === "pairing"`. */
  code: z.string().optional(),
  screenId: z.string().optional(),
});

/** Clock-sync reply: echo of `tSend` plus the server's wall-clock (§7). */
export const SyncPongMsg = z.object({
  type: z.literal("sync.pong"),
  tSend: z.number(),
  tServer: z.number(),
});

/** "A new manifest is live" nudge (§9). The screen background-fetches it. */
export const ManifestMsg = z.object({
  type: z.literal("manifest"),
  channelId: z.string(),
  version: z.number().int(),
  hash: z.string(),
  /** Where to fetch the manifest JSON from (R2-backed). */
  url: z.string(),
});

/** Remote command (§11). `at: null` = apply now; else fire at that epoch.
 *  `unpair` is a *deauthorization*: the screen wipes its cached channel + assets
 *  and returns to pairing — it is issued only by the unpair/remove path (§6), not
 *  the operator command endpoint, so a paid screen is never freed while the
 *  physical device keeps playing stale content off its cache. */
export const CommandMsg = z.object({
  type: z.literal("cmd"),
  id: z.string(),
  action: z.enum(["mute", "unmute", "refresh", "screensaver.on", "screensaver.off", "switch_channel", "debug.on", "debug.off", "unpair"]),
  at: z.number().nullable(),
  channelId: z.string().optional(),
  issuedBy: z.string().optional(),
  expiresAt: z.number().optional(),
});

/** An ad interrupt's content (§21). Rendered for its stamped window then lifted. */
export const AdPayload = z.object({
  /** audio ducks/pauses music over the running slides; video/command take over
   *  the slide area for the interrupt's duration. */
  kind: z.enum(["audio", "video", "command"]),
  name: z.string().optional(),
  audioUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  /** For a command interrupt: a self-contained HTML slide forced for the window. */
  html: z.string().optional(),
  /** Duck the music bed while an audio ad plays. */
  duck: z.boolean().default(true),
  /** Audio ads only: suppress the on-screen "Advertisement" badge so the scene
   *  stays visually unchanged while the audio plays. */
  hideBadge: z.boolean().default(false),
  /** Audio ads only: an optional still creative shown full-bleed for the ad's
   *  window so a visual pairs with the voiceover (without producing a video). */
  companionUrl: z.string().optional(),
});
export type AdPayload = z.infer<typeof AdPayload>;

/**
 * Stamped interrupt (§12, §21). An ad or emergency is an *event*, not a function
 * of time: the DO stamps a start-epoch + duration and every screen renders the
 * interrupt as a function of that stamped epoch, so screens stay locked through
 * it (the same trick as queue calls in §20).
 */
export const InterruptMsg = z.object({
  type: z.literal("interrupt"),
  id: z.string(),
  role: z.enum(["ad", "emergency"]),
  startEpoch: z.number(),
  durationMs: z.number(),
  /** Manifest url for the interrupt content (emergency channel / ad asset). */
  url: z.string().optional(),
  /** Ad content (present when role === "ad"). */
  ad: AdPayload.optional(),
  priority: z.number().int().default(0),
});
export type InterruptMsg = z.infer<typeof InterruptMsg>;

/**
 * Emergency override (§12): a one-click, high-priority full-screen takeover that
 * trumps the timeline, dayparting, screen saver, and ads. Held until cleared.
 * Connected-only by nature — state this plainly; it is not a life-safety system.
 */
export const EmergencyMsg = z.object({
  type: z.literal("emergency"),
  id: z.string(),
  title: z.string(),
  body: z.string().default(""),
  /** Visual treatment on the screen — a full-screen takeover isn't always an
   *  emergency (it may be a "closed" / "back soon" / "welcome" notice). Drives
   *  the background + icon. Defaults to `alarm` for back-compat. */
  tone: z.enum(["alarm", "warning", "info", "neutral", "success"]).default("alarm"),
  /** When the takeover began, for in-phase rendering across screens (§21). */
  epoch: z.number().int(),
});

/** Lift an interrupt / emergency all-clear (§12). */
export const ClearMsg = z.object({
  type: z.literal("clear"),
  id: z.string(),
});

export const ServerMessage = z.discriminatedUnion("type", [
  PairingMsg,
  SyncPongMsg,
  ManifestMsg,
  CommandMsg,
  InterruptMsg,
  EmergencyMsg,
  ClearMsg,
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

/* ------------------------------- helpers ---------------------------------- */

export function encode(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}

/** Parse + validate an inbound client frame. Throws on malformed input. */
export function decodeClient(raw: string): ClientMessage {
  return ClientMessage.parse(JSON.parse(raw));
}

/** Parse + validate an inbound server frame. Throws on malformed input. */
export function decodeServer(raw: string): ServerMessage {
  return ServerMessage.parse(JSON.parse(raw));
}
