/**
 * Countdown widget core. Counts down to a target instant (clock-synced, so every
 * screen agrees), or counts *up* since one. Pure: the runtime ticks it against
 * the synced clock and re-renders the shared body HTML, so builder == player.
 */

import { type Style, type Config, str, num, bool } from "./types.js";
import { radiusValue, borderCss, shadowValue, fontFamilyValue } from "./render.js";

export const COUNTDOWN_VARIANTS: { id: string; label: string }[] = [
  { id: "blocks", label: "Blocks — boxed units" },
  { id: "inline", label: "Inline — 02:14:59" },
  { id: "stacked", label: "Stacked — big + labels" },
];

export interface CountdownParts {
  days: number; hours: number; minutes: number; seconds: number;
  /** True once a count-down target has passed (or false for count-up). */
  done: boolean;
}

/** Parse the target instant (a datetime-local or ISO string) to epoch ms, or 0. */
export function countdownTargetMs(config: Config): number {
  const t = str(config.target).trim();
  if (!t) return 0;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : 0;
}

/** Break the remaining (or elapsed, when counting up) time into day/hr/min/sec. */
export function countdownParts(targetMs: number, nowMs: number, countUp = false): CountdownParts {
  const signed = countUp ? nowMs - targetMs : targetMs - nowMs;
  const done = !countUp && targetMs > 0 && signed <= 0;
  let diff = Math.max(0, signed);
  const days = Math.floor(diff / 86_400_000); diff -= days * 86_400_000;
  const hours = Math.floor(diff / 3_600_000); diff -= hours * 3_600_000;
  const minutes = Math.floor(diff / 60_000); diff -= minutes * 60_000;
  const seconds = Math.floor(diff / 1000);
  return { days, hours, minutes, seconds, done };
}

const p2 = (n: number): string => String(n).padStart(2, "0");

/** The full inner HTML for a countdown node. `h` seeds proportional sizing. */
export function countdownBodyHtml(style: Style, config: Config, nowMs: number, h: number): string {
  const variant = str(config.variant, "blocks");
  const countUp = bool(config.countUp);
  const parts = countdownParts(countdownTargetMs(config), nowMs, countUp);
  const color = str(style.color, "var(--w-fg, #ffffff)");
  const font = fontFamilyValue(style, "sans");

  if (parts.done) {
    const doneText = str(config.doneText, "").trim();
    if (doneText) {
      const fs = num(style.fontSize, Math.round(h * 0.34));
      return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:${color};font-family:${font};font-weight:${str(style.fontWeight, "800")};font-size:${fs}px;text-align:center;padding:0 6%">${escapeHtml(doneText)}</div>`;
    }
  }

  const showDays = bool(config.showDays, true);
  const units: { v: number; label: string }[] = [];
  if (showDays) units.push({ v: parts.days, label: "Days" });
  units.push({ v: parts.hours, label: "Hours" }, { v: parts.minutes, label: "Minutes" }, { v: parts.seconds, label: "Seconds" });

  if (variant === "inline") {
    const seg = units.map((u) => p2(u.v)).join(str(config.separator, " : "));
    const fs = num(style.fontSize, Math.round(h * 0.5));
    return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:${color};font-family:${str(style.font) === "mono" ? "'JetBrains Mono',ui-monospace,monospace" : font};font-weight:${str(style.fontWeight, "700")};font-size:${fs}px;letter-spacing:${num(style.letterSpacing, 2)}px;font-variant-numeric:tabular-nums">${seg}</div>`;
  }

  // blocks / stacked: a row of unit cells, each a big number over a small label.
  const accent = str(style.accent ?? style.bg, "var(--w-surface, oklch(0.2 0.02 300 / 0.5))");
  const numFs = num(style.fontSize, Math.round(h * (variant === "stacked" ? 0.5 : 0.4)));
  const labFs = Math.max(9, Math.round(numFs * 0.24));
  const boxed = variant === "blocks";
  const cellCss = boxed
    ? `display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(numFs * 0.08)}px;background:${accent};border-radius:${Math.round(numFs * 0.16)}px;padding:${Math.round(numFs * 0.22)}px ${Math.round(numFs * 0.3)}px;min-width:${Math.round(numFs * 1.3)}px`
    : `display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(numFs * 0.06)}px`;
  const cells = units.map((u) =>
    `<div style="${cellCss}">`
    + `<div style="color:${color};font-family:${str(style.font) === "mono" ? "'JetBrains Mono',ui-monospace,monospace" : font};font-weight:${str(style.fontWeight, "800")};font-size:${numFs}px;line-height:1;font-variant-numeric:tabular-nums">${p2(u.v)}</div>`
    + `<div style="color:${color};opacity:0.6;font-family:${font};font-weight:600;font-size:${labFs}px;letter-spacing:0.08em;text-transform:uppercase">${u.label}</div>`
    + `</div>`,
  ).join("");
  return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;gap:${Math.round(numFs * 0.34)}px">${cells}</div>`;
}

/** Container chrome (backdrop, per-side radius/border, shadow) shared by both renderers. */
export function countdownContainerCss(style: Style): Record<string, string | number> {
  const css: Record<string, string | number> = {
    width: "100%", height: "100%", boxSizing: "border-box",
    borderRadius: radiusValue(style, 0),
    opacity: num(style.opacity, 1),
    overflow: "hidden",
  };
  const bg = style.panelBg;
  if (bg != null && str(bg)) css.background = str(bg);
  Object.assign(css, borderCss(style));
  const shadow = shadowValue(style);
  if (shadow) css.boxShadow = shadow;
  return css;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"));
}
