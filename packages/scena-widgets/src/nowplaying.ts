/**
 * "Now Playing" widget presentation (§16). The current track (title, artist,
 * cover art, progress) is resolved from the clock-synced music timeline by the
 * player runtime; this module is the pure variant metadata + container styling
 * both renderers share. Four variants: a compact bar, a card, a full panel with
 * an animated equalizer, and a minimal text line.
 */

import { type Css, type Style, type Config, str, num } from "./types.js";
import { radiusValue, borderCss, shadowValue, hasRadius } from "./render.js";

export type NowPlayingVariant = "bar" | "card" | "full" | "minimal";

export const NOWPLAYING_VARIANTS: { id: NowPlayingVariant; label: string }[] = [
  { id: "bar", label: "Bar — art + title, compact" },
  { id: "card", label: "Card — art, title, progress" },
  { id: "full", label: "Full — big art + equalizer" },
  { id: "minimal", label: "Minimal — text only" },
];

export function nowPlayingVariant(config: Config): NowPlayingVariant {
  const v = str(config.variant, "card");
  return (["bar", "card", "full", "minimal"] as const).includes(v as NowPlayingVariant) ? (v as NowPlayingVariant) : "card";
}

/** The card/panel container styling (colours, radius, backdrop). */
export function nowPlayingContainerCss(style: Style): Css {
  const css: Css = {
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    color: str(style.color, "var(--w-fg, #ffffff)"),
    fontFamily: str(style.font) === "mono" ? "var(--w-font-mono, 'JetBrains Mono', monospace)" : "var(--w-font, 'Hanken Grotesk', system-ui, sans-serif)",
    overflow: "hidden",
  };
  const bg = str(style.bg ?? style.fill, "var(--w-surface, oklch(0.16 0.02 300 / 0.72))");
  if (bg) css.background = bg;
  if (hasRadius(style)) css.borderRadius = radiusValue(style);
  css.opacity = num(style.opacity, 1);
  Object.assign(css, borderCss(style));
  const shadow = shadowValue(style);
  if (shadow) css.boxShadow = shadow;
  return css;
}

/** The accent colour used for the progress bar + equalizer. */
export function nowPlayingAccent(style: Style): string {
  return str(style.accent, "var(--w-accent, oklch(0.72 0.19 300))");
}

/** Elapsed fraction [0,1] for the progress bar. */
export function progressFraction(positionMs: number, durationMs: number): number {
  if (!(durationMs > 0)) return 0;
  return Math.min(1, Math.max(0, positionMs / durationMs));
}

/** m:ss for a millisecond value. */
export function clockTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The track a Now Playing widget draws. */
export interface NowPlayingMeta {
  title: string;
  artist: string;
  artUrl: string | null;
  durationMs: number;
}

const NP_SANS = "var(--w-font, 'Hanken Grotesk', system-ui, sans-serif)";
const NP_MONO = "var(--w-font-mono, 'JetBrains Mono', ui-monospace, monospace)";
const npEsc = (s: string): string => s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));

function npArt(meta: NowPlayingMeta, sizePx: number): string {
  const s = `${sizePx}px`, r = Math.round(sizePx * 0.08);
  if (meta.artUrl) return `<div style="width:${s};height:${s};flex:0 0 auto;border-radius:${r}px;background:center/cover no-repeat url('${meta.artUrl}');box-shadow:0 4px 16px oklch(0.1 0.02 300 / 0.5)"></div>`;
  return `<div style="width:${s};height:${s};flex:0 0 auto;border-radius:${r}px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg, var(--w-accent, oklch(0.55 0.18 300)), var(--w-accent-2, oklch(0.42 0.2 260)))"><svg width="45%" height="45%" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6" opacity="0.9"><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="19" cy="16" r="3"/></svg></div>`;
}

function npMeta(meta: NowPlayingMeta, titlePx: number): string {
  return `<div style="min-width:0;flex:1">
    <div style="font-size:${Math.round(titlePx * 0.34)}px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.6;margin-bottom:${Math.round(titlePx * 0.1)}px">Now playing</div>
    <div style="font-size:${titlePx}px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.1">${npEsc(meta.title)}</div>
    ${meta.artist ? `<div style="font-size:${Math.round(titlePx * 0.6)}px;opacity:0.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${npEsc(meta.artist)}</div>` : ""}
  </div>`;
}

function npProgress(accent: string, frac: number, posMs: number, durMs: number, h: number, label: boolean): string {
  const barH = Math.max(4, Math.round(h * 0.03));
  const bar = `<div style="width:100%;height:${barH}px;border-radius:99px;background:var(--w-surface-2, oklch(1 0 0 / 0.18));overflow:hidden"><div style="width:${(frac * 100).toFixed(1)}%;height:100%;background:${accent};transition:width 0.5s linear"></div></div>`;
  if (!label) return bar;
  return `<div style="display:flex;flex-direction:column;gap:${Math.round(h * 0.02)}px;width:100%">${bar}<div style="display:flex;justify-content:space-between;font-size:${Math.round(h * 0.05)}px;opacity:0.7;font-family:${NP_MONO}"><span>${clockTime(posMs)}</span><span>${clockTime(durMs)}</span></div></div>`;
}

function npEq(accent: string, h: number): string {
  const barW = Math.max(3, Math.round(h * 0.022));
  const bars = [0, 1, 2, 3, 4].map((i) => `<span style="display:inline-block;width:${barW}px;margin:0 ${Math.round(barW * 0.35)}px;background:${accent};border-radius:2px;height:${Math.round(h * 0.12)}px;animation:wxeq 0.9s ease-in-out ${i * 0.12}s infinite"></span>`).join("");
  return `<div style="display:flex;align-items:flex-end;height:${Math.round(h * 0.14)}px">${bars}</div>`;
}

/**
 * Now Playing body — design-px sized from `h`, so the builder preview and the
 * player draw it identically. The `wxeq` keyframes (equalizer) are injected by
 * the host (the player runtime and the dashboard stylesheet).
 */
export function nowPlayingBodyHtml(meta: NowPlayingMeta, variant: NowPlayingVariant, accent: string, posMs: number, durMs: number, h: number): string {
  const frac = progressFraction(posMs, durMs);
  const px = (f: number) => Math.round(h * f);
  const wrap = `width:100%;height:100%;box-sizing:border-box;display:flex;font-family:${NP_SANS}`;
  if (variant === "minimal") {
    return `<div style="${wrap};flex-direction:column;justify-content:center;padding:${px(0.08)}px ${px(0.1)}px;gap:${px(0.04)}px">${npMeta(meta, px(0.22))}${npProgress(accent, frac, posMs, durMs, h, false)}</div>`;
  }
  if (variant === "bar") {
    return `<div style="${wrap};align-items:center;gap:${px(0.08)}px;padding:${px(0.06)}px ${px(0.08)}px">${npArt(meta, px(0.64))}${npMeta(meta, px(0.16))}</div>`;
  }
  if (variant === "full") {
    return `<div style="${wrap};flex-direction:column;align-items:center;justify-content:center;gap:${px(0.035)}px;padding:${px(0.05)}px;text-align:center">
      ${npArt(meta, px(0.42))}
      <div style="display:flex;align-items:center;gap:${px(0.025)}px">${npEq(accent, h)}<div style="font-size:${px(0.09)}px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:${px(1.3)}px">${npEsc(meta.title)}</div></div>
      ${meta.artist ? `<div style="font-size:${px(0.05)}px;opacity:0.75">${npEsc(meta.artist)}</div>` : ""}
      <div style="width:80%">${npProgress(accent, frac, posMs, durMs, h, true)}</div>
    </div>`;
  }
  // card
  return `<div style="${wrap};align-items:center;gap:${px(0.06)}px;padding:${px(0.06)}px ${px(0.07)}px">
    ${npArt(meta, Math.round(h * 0.62))}
    <div style="display:flex;flex-direction:column;gap:${px(0.05)}px;min-width:0;flex:1">${npMeta(meta, px(0.18))}${npProgress(accent, frac, posMs, durMs, h, true)}</div>
  </div>`;
}
