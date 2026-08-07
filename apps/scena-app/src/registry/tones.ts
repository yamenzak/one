/**
 * SCENA'S ACCENT TONES — the class literals Tailwind has to SEE.
 *
 * ⚠️ **These must stay literal.** Tailwind generates a utility only if it finds
 * the class name in scanned source, and `@4dl/ui` builds `text-${tone}` by
 * concatenation at runtime — which a scanner cannot follow. Without this file
 * `toneText.boards` would resolve to a class Tailwind never emitted and the
 * colour would silently be missing. Do not "simplify" this into a loop or a
 * template string; that is the whole reason it exists.
 *
 * The token VALUES are in `../tokens.accents.css`.
 */

import type { Tone } from "@4dl/ui";

/** One tone per destination (`Shell.tsx`'s `TABS`). */
export const SCENA_TONES = ["fleet", "channel", "blocks", "boards", "insights"] as const;

export type ScenaTone = (typeof SCENA_TONES)[number];

/** Every accent class, spelled out so Tailwind emits them. */
export const ACCENT_CLASSES: Record<ScenaTone, { text: string; soft: string; fill: string }> = {
  fleet: { text: "text-fleet", soft: "bg-fleet-soft text-fleet", fill: "bg-fleet text-fleet-foreground" },
  channel: { text: "text-channel", soft: "bg-channel-soft text-channel", fill: "bg-channel text-channel-foreground" },
  blocks: { text: "text-blocks", soft: "bg-blocks-soft text-blocks", fill: "bg-blocks text-blocks-foreground" },
  boards: { text: "text-boards", soft: "bg-boards-soft text-boards", fill: "bg-boards text-boards-foreground" },
  insights: { text: "text-insights", soft: "bg-insights-soft text-insights", fill: "bg-insights text-insights-foreground" },
};

/** Narrow a string to a registered Scena tone, for the odd dynamic caller. */
export const isScenaTone = (t: Tone): t is ScenaTone => (SCENA_TONES as readonly string[]).includes(t);
