/**
 * Bridge from the declarative manifest to the pure @scena/timeline engine.
 *
 * The manifest stores authoring intent (durations may be null = "inherit the
 * playlist default"); the engine needs concrete positive durations. This module
 * resolves that intent into timeline items. It is the one place duration
 * inheritance is applied, so the compiler and player never disagree.
 */

import { buildTimeline, type Timeline, type TimelineItem } from "@scena/timeline";
import type { Manifest } from "./schema.js";

/** Resolve a slide's effective on-screen duration in ms. */
export function resolveSlideDurationMs(
  slide: Manifest["slides"]["items"][number],
  defaultMs: number,
): number {
  if (slide.durationMs != null) return slide.durationMs;
  return defaultMs;
}

/**
 * Build the slide timeline for a manifest. `channelId` seeds the shuffle so a
 * shuffled playlist is deterministic and identical on every screen (§1).
 */
export function slideTimeline(manifest: Manifest): Timeline {
  const { slides, epoch, channelId } = manifest;
  const items: TimelineItem[] = slides.items.map((s) => ({
    id: s.id,
    durationMs: resolveSlideDurationMs(s, slides.durationDefaultMs),
  }));
  return buildTimeline(items, epoch.t0, {
    shuffle: slides.shuffle,
    seed: `${channelId}:slides`,
  });
}

/** Build the music timeline for a manifest (concatenated tracks, §16). */
export function musicTimeline(manifest: Manifest): Timeline | null {
  const { music, epoch, channelId } = manifest;
  if (music.items.length === 0) return null;
  const items: TimelineItem[] = music.items.map((t) => ({
    id: t.id,
    durationMs: t.durationMs,
  }));
  return buildTimeline(items, epoch.t0, {
    shuffle: music.shuffle,
    seed: `${channelId}:music`,
  });
}
