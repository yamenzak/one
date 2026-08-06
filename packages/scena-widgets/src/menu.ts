/**
 * Menu / list widget core. Rows of "label … value" (a café price list, a room
 * directory, an agenda, a leaderboard) with an optional heading. Pure body-HTML
 * + container CSS shared byte-identically between the player and builder.
 */

import { type Style, type Config, str, num } from "./types.js";
import { radiusValue, borderCss, shadowValue, fillValue, fontFamilyValue } from "./render.js";

export const MENU_VARIANTS: { id: string; label: string }[] = [
  { id: "rows", label: "Rows — label … value" },
  { id: "leaders", label: "Leaders — dotted fill" },
  { id: "cards", label: "Cards — separated tiles" },
];

export interface MenuItem { label: string; value?: string; note?: string; }

export function menuItems(config: Config): MenuItem[] {
  const raw = config.items;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({ label: str(r.label), value: str(r.value), note: str(r.note) }));
}

/** Container chrome (fill/gradient, per-side radius/border, shadow, opacity). */
export function menuContainerCss(style: Style): Record<string, string | number> {
  const css: Record<string, string | number> = {
    width: "100%", height: "100%", boxSizing: "border-box",
    background: fillValue(style) ?? str(style.bg, "var(--w-surface, oklch(0.16 0.02 300 / 0.62))"),
    borderRadius: radiusValue(style, 20),
    opacity: num(style.opacity, 1),
    overflow: "hidden",
  };
  Object.assign(css, borderCss(style));
  const shadow = shadowValue(style);
  if (shadow) css.boxShadow = shadow;
  return css;
}

/** Inner HTML for the menu. `h` seeds proportional sizing. */
export function menuBodyHtml(style: Style, config: Config, h: number): string {
  const variant = str(config.variant, "rows");
  const items = menuItems(config);
  const color = str(style.color, "var(--w-fg, #ffffff)");
  const accent = str(style.accent, "var(--w-accent, oklch(0.78 0.14 85))");
  const font = fontFamilyValue(style, "sans");
  const title = escapeHtml(str(config.title, ""));

  // Size rows to fit: seed off height and the row count so a long list still fits.
  const rowN = Math.max(1, items.length + (title ? 1 : 0));
  const baseFs = num(style.fontSize, 0) || Math.round((h / rowN) * (variant === "cards" ? 0.34 : 0.42));
  const rowFs = Math.max(12, Math.min(baseFs, Math.round(h * 0.16)));
  const valFs = Math.round(rowFs * 1.02);
  const noteFs = Math.max(10, Math.round(rowFs * 0.6));
  const titleFs = Math.round(rowFs * 1.25);
  const gap = Math.round(rowFs * (variant === "cards" ? 0.5 : 0.42));

  const rows = items.map((it) => {
    const label = escapeHtml(it.label || "");
    const value = escapeHtml(it.value || "");
    const note = it.note ? escapeHtml(it.note) : "";
    const labelBlock = `<div style="min-width:0;display:flex;flex-direction:column;gap:${Math.round(noteFs * 0.2)}px">`
      + `<span style="font-weight:${str(style.fontWeight, "700")};font-size:${rowFs}px;color:${color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</span>`
      + (note ? `<span style="font-weight:500;font-size:${noteFs}px;color:${color};opacity:0.55;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${note}</span>` : "")
      + `</div>`;
    const valueBlock = value ? `<span style="flex:0 0 auto;font-weight:800;font-size:${valFs}px;color:${accent};font-variant-numeric:tabular-nums;margin-left:0.6em">${value}</span>` : "";

    if (variant === "cards") {
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:0.6em;background:var(--w-surface-2, oklch(1 0 0 / 0.06));border-radius:${Math.round(rowFs * 0.4)}px;padding:${Math.round(rowFs * 0.42)}px ${Math.round(rowFs * 0.7)}px">${labelBlock}${valueBlock}</div>`;
    }
    if (variant === "leaders") {
      return `<div style="display:flex;align-items:flex-end;gap:0.4em">`
        + `<div style="min-width:0;display:flex;flex-direction:column">`
        + `<span style="font-weight:${str(style.fontWeight, "700")};font-size:${rowFs}px;color:${color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</span>`
        + (note ? `<span style="font-weight:500;font-size:${noteFs}px;color:${color};opacity:0.55">${note}</span>` : "")
        + `</div>`
        + `<div style="flex:1;border-bottom:2px dotted ${color};opacity:0.35;margin-bottom:${Math.round(rowFs * 0.22)}px"></div>`
        + valueBlock
        + `</div>`;
    }
    // rows
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:0.6em">${labelBlock}${valueBlock}</div>`;
  }).join("");

  const titleHtml = title
    ? `<div style="font-weight:800;font-size:${titleFs}px;color:${color};letter-spacing:0.02em;padding-bottom:${Math.round(gap * 0.4)}px;border-bottom:2px solid ${accent};margin-bottom:${Math.round(gap * 0.2)}px">${title}</div>`
    : "";
  const body = items.length
    ? `<div style="display:flex;flex-direction:column;gap:${gap}px">${rows}</div>`
    : `<div style="opacity:0.5;color:${color};font-size:${rowFs}px">Add menu items →</div>`;

  return `<div style="width:100%;height:100%;box-sizing:border-box;padding:${Math.round(h * 0.07)}px ${Math.round(h * 0.09)}px;font-family:${font};display:flex;flex-direction:column;justify-content:${title ? "flex-start" : "center"};overflow:hidden">${titleHtml}${body}</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"));
}
