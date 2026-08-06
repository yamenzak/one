/**
 * Display scheduling (§17) — a per-widget visibility cycle that ships to *every*
 * widget type. A widget is either always on screen, or shown for a stretch and
 * then hidden on a repeating cycle ("show for 10s every 60s"), so a call-to-
 * action or promo can share the canvas with the main content instead of
 * permanently occupying it. Evaluated against the synced wall clock, so the same
 * widget flips on and off in lockstep across every screen playing the channel.
 */

import { num } from "./types.js";

/** How a timed widget transitions on and off screen.
 *  KEEP IN SYNC with the Zod `DisplaySchedule.anim` enum in
 *  packages/manifest/src/schema.ts (a compile-time guard in the dashboard's
 *  builder/types.ts fails the build if these two drift). */
export type DisplayAnim = "fade" | "rise" | "drop" | "slideL" | "slideR" | "zoom" | "pop" | "blur";

export interface DisplaySchedule {
  /** "always" (or unset) = permanently visible; "interval" = the on/off cycle. */
  mode?: "always" | "interval";
  /** Visible seconds within each cycle. */
  showSec?: number;
  /** Full cycle length in seconds (visible + hidden). */
  everySec?: number;
  /** Entry/exit motion when the cycle flips it on/off (default "rise"). */
  anim?: DisplayAnim;
}

/** The animation choices, in menu order, for the editor. */
export const DISPLAY_ANIMS: { id: DisplayAnim; label: string }[] = [
  { id: "rise", label: "Rise up" },
  { id: "fade", label: "Fade" },
  { id: "zoom", label: "Zoom in" },
  { id: "pop", label: "Pop" },
  { id: "drop", label: "Drop down" },
  { id: "slideL", label: "Slide ←" },
  { id: "slideR", label: "Slide →" },
  { id: "blur", label: "Blur in" },
];

/** The off-screen pose for an animation — the transform/filter a widget sits at
 *  while hidden, eased to/from neutral (empty) when shown. Opacity is handled
 *  separately so each widget keeps its own. */
export function displayPose(anim: DisplayAnim | undefined, visible: boolean): { transform: string; filter: string } {
  if (visible) return { transform: "", filter: "" };
  switch (anim) {
    case "fade": return { transform: "", filter: "" };
    case "drop": return { transform: "translateY(-7%)", filter: "" };
    case "slideL": return { transform: "translateX(9%)", filter: "" };
    case "slideR": return { transform: "translateX(-9%)", filter: "" };
    case "zoom": return { transform: "scale(0.9)", filter: "" };
    case "pop": return { transform: "scale(0.55)", filter: "" };
    case "blur": return { transform: "scale(1.04)", filter: "blur(16px)" };
    case "rise":
    default: return { transform: "translateY(7%)", filter: "" };
  }
}

/** Easing + duration for an entry or exit — expo-out settling in, quicker out. */
export function displayEase(visible: boolean): { ms: number; ease: string } {
  return visible ? { ms: 720, ease: "cubic-bezier(0.16, 1, 0.3, 1)" } : { ms: 460, ease: "cubic-bezier(0.4, 0, 1, 1)" };
}

/** Clamp a raw schedule to sane, self-consistent numbers. */
function normalize(d: DisplaySchedule): { show: number; every: number } {
  const show = Math.max(1, Math.round(num(d.showSec, 10)));
  const every = Math.max(show, Math.round(num(d.everySec, 60)));
  return { show, every };
}

/** Is a widget visible right now under its schedule? `nowMs` is the synced wall
 *  clock so every screen agrees. An "always"/absent schedule is always visible;
 *  an interval whose cycle isn't longer than its on-time is effectively always
 *  on (nothing to hide). */
export function displayVisible(d: DisplaySchedule | undefined, nowMs: number): boolean {
  if (!d || d.mode !== "interval") return true;
  const { show, every } = normalize(d);
  if (every <= show) return true;
  const pos = (((nowMs / 1000) % every) + every) % every;
  return pos < show;
}

/** A short human summary for the editor, e.g. "Shown 10s every 60s". */
export function displaySummary(d: DisplaySchedule | undefined): string {
  if (!d || d.mode !== "interval") return "Always on screen";
  const { show, every } = normalize(d);
  return `Shown ${show}s every ${every}s (hidden ${every - show}s)`;
}
