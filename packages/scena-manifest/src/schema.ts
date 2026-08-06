/**
 * The manifest schema (BLUEPRINT §5) — the compiled playout artifact.
 *
 * One Zod schema is the single source of truth; all TS types are derived from
 * it (§29.2). The dashboard compiles the relational D1 model into one of these,
 * content-hashes it, and stores it immutably in R2. Screens run exactly this.
 */

import { z } from "zod";

export const Orientation = z.enum(["landscape", "portrait"]);
export type Orientation = z.infer<typeof Orientation>;

export const ChannelRole = z.enum(["content", "screensaver", "emergency"]);
export type ChannelRole = z.infer<typeof ChannelRole>;

export const SlideType = z.enum(["image", "gif", "video", "html"]);
export type SlideType = z.infer<typeof SlideType>;

/** A content-addressed asset hash (hex). Empty is not allowed. */
const AssetHash = z.string().min(1);

export const Dimensions = z.object({
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  orientation: Orientation,
  /** Panel rotation applied by the renderer as a CSS transform (§17). */
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
});
export type Dimensions = z.infer<typeof Dimensions>;

/** The synced-clock anchor (§1). Every screen derives position(t) from this. */
export const Epoch = z.object({
  t0: z.number().int(),
  cycleMs: z.number().int().positive(),
});
export type Epoch = z.infer<typeof Epoch>;

export const Slide = z
  .object({
    id: z.string().min(1),
    type: SlideType,
    /** Present for image/gif/video; null/absent for inline html. */
    hash: AssetHash.nullable().optional(),
    /** Inline sandboxed HTML document body (html slides only). */
    htmlBody: z.string().nullable().optional(),
    /** null → inherit the playlist default; a value wins over the default. */
    durationMs: z.number().int().positive().nullable().optional(),
    /** Video/gif default to playing once then advancing. */
    playOnce: z.boolean().optional(),
    transition: z.string().optional(),
    /** How media fills the 16:9 frame: contain (letterbox) · cover (crop) · fill (stretch). Default contain. */
    fit: z.enum(["contain", "cover", "fill"]).optional(),
    /** Video: seek offset (trim start) in ms — the slide plays from here. */
    clipStartMs: z.number().int().nonnegative().optional(),
    /** Video/gif: loop within the slide window (true) vs play once (false). */
    loop: z.boolean().optional(),
  })
  .refine((s) => (s.type === "html" ? s.htmlBody != null : s.hash != null), {
    message: "html slides need htmlBody; media slides need a hash",
  });
export type Slide = z.infer<typeof Slide>;

export const Track = z.object({
  id: z.string().min(1),
  hash: AssetHash,
  title: z.string().optional(),
  artist: z.string().optional(),
  /** Optional cover-art asset hash (resolved via manifest.assets), for the
   *  Now Playing widget (§16). */
  art: AssetHash.optional(),
  durationMs: z.number().int().positive(),
});
export type Track = z.infer<typeof Track>;

export const SlidePlaylist = z.object({
  transitionDefault: z.string().default("fade"),
  durationDefaultMs: z.number().int().positive().default(8000),
  shuffle: z.boolean().default(false),
  items: z.array(Slide),
});
export type SlidePlaylist = z.infer<typeof SlidePlaylist>;

export const MusicPlaylist = z.object({
  shuffle: z.boolean().default(false),
  items: z.array(Track),
});
export type MusicPlaylist = z.infer<typeof MusicPlaylist>;

/** [x, y, w, h] in the profile's base-canvas coordinate space. */
const Rect = z.tuple([z.number(), z.number(), z.number(), z.number()]);

/** A widget's on-screen visibility cycle (§17): always on, or shown for a
 *  stretch every so often so a promo/CTA shares the canvas rather than owning it.
 *  KEEP IN SYNC with the TS `DisplaySchedule`/`DisplayAnim` in
 *  packages/widgets/src/display.ts (the dashboard's builder/types.ts has a
 *  compile-time guard that fails the build if these drift). */
export const DisplaySchedule = z.object({
  mode: z.enum(["always", "interval"]).optional(),
  showSec: z.number().optional(),
  everySec: z.number().optional(),
  anim: z.enum(["fade", "rise", "drop", "slideL", "slideR", "zoom", "pop", "blur"]).optional(),
});
export type DisplaySchedule = z.infer<typeof DisplaySchedule>;

export const Widget = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  rect: Rect,
  rot: z.number().default(0),
  z: z.number().int().default(0),
  /** How the content responds to resize (§17): scale as a unit vs. reflow. */
  scaleMode: z.enum(["uniform", "reflow"]).optional(),
  /** Visibility cycle (§17): absent = always on screen. */
  display: DisplaySchedule.optional(),
  style: z.record(z.string(), z.unknown()).default({}),
  config: z.record(z.string(), z.unknown()).default({}),
});
export type Widget = z.infer<typeof Widget>;

export const FontRef = z.object({
  family: z.string().min(1),
  hash: AssetHash,
});

/** Everything a screen must pre-cache before first paint (§8). */
export const AssetRef = z.object({
  hash: AssetHash,
  mime: z.string(),
  bytes: z.number().int().nonnegative(),
  url: z.string(),
});
export type AssetRef = z.infer<typeof AssetRef>;

export const Manifest = z.object({
  version: z.number().int().nonnegative(),
  channelId: z.string().min(1),
  role: ChannelRole,
  dimensions: Dimensions,
  epoch: Epoch,
  slides: SlidePlaylist,
  music: MusicPlaylist,
  widgets: z.array(Widget).default([]),
  fonts: z.array(FontRef).default([]),
  assets: z.array(AssetRef).default([]),
  /** Brand widget-theme CSS (§6): a `:root { --w-*: … }` block the player
   *  injects so widgets follow the tenant's brand on screen. Empty ⇒ defaults. */
  theme: z.string().default(""),
  /** Single-screen mode (§7): the clock still schedules content, but the player
   *  seeks once per slide/track then free-runs media (no continuous drift
   *  correction). Multi-screen sync off — lighter, artifact-free for one TV. */
  soloScreen: z.boolean().default(false),
});
export type Manifest = z.infer<typeof Manifest>;

/** Parse + validate unknown JSON into a Manifest, throwing on any violation. */
export function parseManifest(input: unknown): Manifest {
  return Manifest.parse(input);
}

/** Non-throwing variant. */
export function safeParseManifest(input: unknown): ReturnType<typeof Manifest.safeParse> {
  return Manifest.safeParse(input);
}
