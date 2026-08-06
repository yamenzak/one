/**
 * Ticker presentation math. Four variants share one feed binding:
 *  - scroll   — a continuous marquee (the classic news crawl)
 *  - ribbon   — a crawl of rounded item chips (premium, magazine-style)
 *  - headline — one item at a time, cross-faded
 *  - list     — a vertical stack of the latest items
 * The scroll/fade animation itself lives in the player runtime; here we compute
 * the container look, the optional breaking-news badge, the separator (glyph,
 * custom text, or an uploaded image), spacing, direction, and crawl speed.
 */

import { type Css, type Style, type Config, str, num } from "./types.js";
import { radiusValue, borderCss, shadowValue } from "./render.js";
import { colIndex, type SourceDataset } from "./source.js";

export type TickerVariant = "scroll" | "ribbon" | "headline" | "list";

/** Which source column drives the crawl (default the conventional "title", which
 *  is column 0 for RSS/manual sources). Any source column works — an API's
 *  headline field, a Sheet's message column, a price ticker, … */
export function tickerColumn(config: Config): string {
  return str(config.column, "title");
}

/** Extract the headline strings for the ticker from a source's dataset. Every
 *  provider works: RSS/manual expose a `title` column, api/gsheet any column. */
export function tickerTitles(dataset: SourceDataset, config: Config): string[] {
  if (!dataset.rows.length) return [];
  const col = colIndex(dataset, tickerColumn(config));
  return dataset.rows.map((r) => r[col] ?? "").filter((s) => s.trim() !== "");
}

export const TICKER_VARIANTS: { id: TickerVariant; label: string }[] = [
  { id: "scroll", label: "Scroll — continuous crawl" },
  { id: "ribbon", label: "Ribbon — crawling chips" },
  { id: "headline", label: "Headline — one at a time" },
  { id: "list", label: "List — latest stacked" },
];

export function tickerVariant(config: Config): TickerVariant {
  const v = str(config.variant, "scroll");
  return (["scroll", "ribbon", "headline", "list"] as const).includes(v as TickerVariant) ? (v as TickerVariant) : "scroll";
}

/** Separator presets — a glyph, custom text, or an uploaded image between items. */
export const TICKER_SEPARATORS: { id: string; label: string; text: string }[] = [
  { id: "bullet", label: "Bullet  •", text: "•" },
  { id: "diamond", label: "Diamond  ◆", text: "◆" },
  { id: "dot", label: "Middot  ·", text: "·" },
  { id: "pipe", label: "Pipe  |", text: "|" },
  { id: "slash", label: "Slash  /", text: "/" },
  { id: "star", label: "Star  ★", text: "★" },
  { id: "dash", label: "Dash  —", text: "—" },
  { id: "arrow", label: "Arrow  →", text: "→" },
  { id: "custom", label: "Custom text…", text: "" },
  { id: "image", label: "Uploaded image…", text: "" },
];

/** The strip container styling (colours, type, per-side radius/border, shadow). */
export function tickerContainerCss(style: Style, h: number): Css {
  const css: Css = {
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    background: str(style.bg ?? style.fill, "var(--w-surface, oklch(0.15 0.01 300 / 0.72))"),
    color: str(style.color, "var(--w-fg, #ffffff)"),
    fontFamily: str(style.font) === "mono" ? "var(--w-font-mono, 'JetBrains Mono', monospace)" : "var(--w-font, 'Hanken Grotesk', system-ui, sans-serif)",
    fontSize: `${num(style.fontSize, Math.round(h * 0.4))}px`,
    fontWeight: str(style.fontWeight, "600"),
    letterSpacing: `${num(style.letterSpacing, 0)}px`,
    opacity: num(style.opacity, 1),
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    borderRadius: radiusValue(style, 0),
  };
  Object.assign(css, borderCss(style));
  const shadow = shadowValue(style);
  if (shadow) css.boxShadow = shadow;
  return css;
}

export interface TickerBadge {
  text: string;
  color: string;
  textColor: string;
}

/** The leading "BREAKING" pill, when the operator enables one. */
export function tickerBadge(config: Config): TickerBadge | null {
  const text = str(config.badge).trim();
  if (!text) return null;
  return { text, color: str(config.badgeColor, "var(--w-accent, oklch(0.55 0.22 25))"), textColor: str(config.badgeTextColor, "#ffffff") };
}

/** The between-items separator text (glyph or custom), padded for breathing room.
 *  Empty when an image separator is selected (that's drawn as an element). */
export function tickerSeparator(config: Config): string {
  const kind = str(config.separatorKind, "custom");
  if (kind === "image") return "";
  if (kind !== "custom") {
    const preset = TICKER_SEPARATORS.find((s) => s.id === kind);
    if (preset && preset.text) return ` ${preset.text} `;
  }
  return str(config.separator, "  •  ");
}

/** URL of an uploaded/linked separator image, or "" when not using one. */
export function tickerSeparatorImage(config: Config): string {
  return str(config.separatorKind) === "image" ? str(config.separatorImage) : "";
}

/** Crawl direction — the crawl usually runs right-to-left; "right" reverses it. */
export function tickerDirection(style: Style): "left" | "right" {
  return str(style.direction, "left") === "right" ? "right" : "left";
}

/** Extra spacing (in em) added between items, on top of the separator. */
export function tickerGapEm(style: Style): number {
  return Math.max(0, num(style.gap, 0));
}

/** Crawl speed in px/s (scroll/ribbon variants). Design-pixel units, so the crawl
 *  runs at the same visual rate on any screen regardless of resolution. */
export function tickerSpeed(style: Style): number {
  return Math.max(20, num(style.speed, 90));
}

export function tickerDwellMs(config: Config): number {
  return Math.max(1500, num(config.dwellMs, 4500));
}
