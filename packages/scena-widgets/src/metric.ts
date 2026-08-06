/**
 * Metric / stat-tile widget core. A big value with a label, optional caption and
 * a trend delta (up / down / flat) — the KPI card for a lobby or ops board. Pure
 * body-HTML + container CSS shared byte-identically by the player and builder.
 */

import { type Style, type Config, str, num } from "./types.js";
import { radiusValue, borderCss, shadowValue, fillValue, fontFamilyValue } from "./render.js";

export const METRIC_VARIANTS: { id: string; label: string }[] = [
  { id: "card", label: "Card — value over label" },
  { id: "sideLabel", label: "Side label — label · value" },
  { id: "ring", label: "Ring — value in a progress ring" },
];

export type Trend = "up" | "down" | "flat" | "none";

export function metricTrend(config: Config): Trend {
  const t = str(config.trend, "none");
  return (["up", "down", "flat", "none"] as const).includes(t as Trend) ? (t as Trend) : "none";
}

/** Trend colour: green up / red down / muted flat, unless overridden. Down being
 *  "good" (e.g. wait time) is handled by the operator picking the arrow. */
function trendColor(trend: Trend, style: Style): string {
  if (trend === "up") return str(style.upColor, "oklch(0.78 0.16 150)");
  if (trend === "down") return str(style.downColor, "oklch(0.7 0.19 25)");
  return str(style.color, "var(--w-fg, #ffffff)");
}

const ARROW: Record<Trend, string> = { up: "▲", down: "▼", flat: "▬", none: "" };

/** Container chrome (fill/gradient, per-side radius/border, shadow, opacity). */
export function metricContainerCss(style: Style): Record<string, string | number> {
  const css: Record<string, string | number> = {
    width: "100%", height: "100%", boxSizing: "border-box",
    background: fillValue(style) ?? str(style.bg, "var(--w-surface, oklch(0.18 0.02 300 / 0.55))"),
    borderRadius: radiusValue(style, 20),
    opacity: num(style.opacity, 1),
    overflow: "hidden",
  };
  Object.assign(css, borderCss(style));
  const shadow = shadowValue(style);
  if (shadow) css.boxShadow = shadow;
  return css;
}

/** Inner HTML for the metric. `h` seeds proportional sizing. */
export function metricBodyHtml(style: Style, config: Config, h: number): string {
  const variant = str(config.variant, "card");
  const color = str(style.color, "var(--w-fg, #ffffff)");
  const accent = str(style.accent, "var(--w-accent, oklch(0.72 0.19 300))");
  const font = fontFamilyValue(style, "sans");
  const label = escapeHtml(str(config.label, "Metric"));
  const value = escapeHtml(str(config.value, "0"));
  const unit = escapeHtml(str(config.unit, ""));
  const caption = escapeHtml(str(config.caption, ""));
  const delta = escapeHtml(str(config.delta, ""));
  const trend = metricTrend(config);
  const tc = trendColor(trend, style);

  const valFs = num(style.fontSize, Math.round(h * (variant === "sideLabel" ? 0.4 : 0.34)));
  const labFs = Math.max(11, Math.round(valFs * 0.3));
  const unitFs = Math.round(valFs * 0.42);
  const capFs = Math.max(10, Math.round(valFs * 0.24));

  const valueHtml =
    `<span style="font-weight:${str(style.fontWeight, "800")};font-size:${valFs}px;line-height:1;color:${color};font-variant-numeric:tabular-nums">${value}</span>`
    + (unit ? `<span style="font-weight:600;font-size:${unitFs}px;color:${color};opacity:0.7;margin-left:0.14em">${unit}</span>` : "");
  const labelHtml = `<div style="font-weight:600;font-size:${labFs}px;letter-spacing:0.05em;text-transform:uppercase;color:${color};opacity:0.62">${label}</div>`;
  const deltaHtml = trend !== "none" || delta
    ? `<div style="display:inline-flex;align-items:center;gap:0.3em;font-weight:700;font-size:${capFs + 2}px;color:${tc}">${ARROW[trend]}${delta ? `<span>${delta}</span>` : ""}</div>`
    : "";
  const captionHtml = caption ? `<div style="font-weight:500;font-size:${capFs}px;color:${color};opacity:0.5">${caption}</div>` : "";

  if (variant === "ring") {
    const pct = Math.max(0, Math.min(100, num(config.percent, 66)));
    const r = 42, circ = 2 * Math.PI * r;
    const dash = (pct / 100) * circ;
    const ring = `<svg viewBox="0 0 100 100" style="position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)">`
      + `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-opacity="0.14" stroke-width="8"/>`
      + `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${accent}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${dash} ${circ}"/>`
      + `</svg>`;
    return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:${font};box-sizing:border-box;padding:6%">`
      + `<div style="position:relative;width:${Math.round(h * 0.78)}px;height:${Math.round(h * 0.78)}px;max-width:100%;max-height:100%;display:flex;align-items:center;justify-content:center">${ring}`
      + `<div style="display:flex;flex-direction:column;align-items:center;gap:0.1em">${valueHtml}${labelHtml}</div>`
      + `</div></div>`;
  }

  if (variant === "sideLabel") {
    return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:space-between;gap:1em;font-family:${font};box-sizing:border-box;padding:0 7%">`
      + `<div style="display:flex;flex-direction:column;gap:0.2em">${labelHtml}${captionHtml}</div>`
      + `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.2em"><div style="display:flex;align-items:baseline">${valueHtml}</div>${deltaHtml}</div>`
      + `</div>`;
  }

  // card
  return `<div style="width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;gap:0.28em;font-family:${font};box-sizing:border-box;padding:0 8%">`
    + `${labelHtml}`
    + `<div style="display:flex;align-items:baseline;flex-wrap:wrap">${valueHtml}</div>`
    + `<div style="display:flex;align-items:center;gap:0.7em">${deltaHtml}${captionHtml}</div>`
    + `</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"));
}
