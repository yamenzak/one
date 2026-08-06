/**
 * Live-board widget rendering (§20) — the *look* of a Queue Caller and a Room
 * Status board, as pure HTML string generators so the player runtime and the
 * builder preview draw them byte-identically (the same trick as `clockBodyHtml`).
 *
 * Sizing is in design pixels derived from the node height `h` (never vw/vh),
 * because the builder renders the scene at design scale inside a transformed
 * stage — viewport units would size against the dashboard window, not the
 * design space, and break WYSIWYG. The player scales the whole scene, so design
 * px map 1:1 to what the operator laid out.
 */

import { type Css, type Style, str, num } from "./types.js";
import { radiusValue, borderCss, shadowValue } from "./render.js";

/** Minimal queue state the renderer needs (kept protocol-free so this stays pure). */
export interface QueueData {
  prefix: string;
  serving: number | null;
  counter: number | null;
  label?: string | null;
  recent: { number: number; counter: number | null; prefix?: string }[];
}

/** Minimal room state the renderer needs. `since` (ms) lets the player flash a
 *  cell / door when its status last changed. */
export interface RoomData {
  statuses: { id: string; label: string; color: string }[];
  rooms: { id: string; name: string; status: string; since?: number }[];
}

/** Minimal scoreboard state the renderer needs (protocol-free). */
export interface ScoreData {
  sides: { id: string; name: string; short?: string; score: number; color?: string }[];
  period?: string;
  title?: string;
}

export const QUEUE_VARIANT_IDS = ["solo", "recent", "grid", "strip"] as const;
export const SCORE_VARIANT_IDS = ["classic", "stacked"] as const;
/** Scoreboard layout options for the builder's variant picker. */
export const SCORE_VARIANTS: { id: string; label: string }[] = [
  { id: "classic", label: "Head-to-head" },
  { id: "stacked", label: "Stacked list" },
];

const SANS = "var(--w-font, 'Hanken Grotesk', system-ui, sans-serif)";
const MONO = "var(--w-font-mono, 'JetBrains Mono', ui-monospace, monospace)";

/** Board frame chrome (background, radius, colour) — shared by both surfaces.
 *  Font sizing lives in the body HTML (absolute px from `h`), so no base font. */
export function boardContainerCss(style: Style): Css {
  const css: Css = {
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    overflow: "hidden",
    color: str(style.color, "var(--w-fg, #ffffff)"),
    background: str(style.bg ?? style.fill, "var(--w-surface, oklch(0.18 0.02 300 / 0.72))"),
    borderRadius: radiusValue(style, 18),
    opacity: num(style.opacity, 1),
  };
  Object.assign(css, borderCss(style));
  const shadow = shadowValue(style);
  if (shadow) css.boxShadow = shadow;
  return css;
}

const ticket = (prefix: string, n: number): string => `${prefix}${String(n).padStart(3, "0")}`;
const esc = (s: string): string => s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));

/**
 * Queue caller body. `id="qnum"` marks the current number so the player can
 * flash it on an epoch change; the builder simply ignores that hook.
 */
export function queueBodyHtml(q: QueueData, variant: string, h: number): string {
  const px = (f: number) => Math.round(h * f);
  const number = q.serving === null ? "—" : ticket(q.prefix, q.serving);
  const sub = `${q.label ? `${esc(q.label)} · ` : ""}${q.counter !== null ? `Counter ${q.counter}` : ""}`;
  const prev = q.recent.slice(1); // recent[0] is the current call

  if (variant === "grid") {
    const tiles = q.recent.slice(0, 6).map((r, i) => {
      const cur = i === 0;
      return `<div style="border-radius:${px(0.018)}px;padding:${px(0.03)}px ${px(0.035)}px;display:flex;flex-direction:column;gap:${px(0.008)}px;background:${cur ? "var(--w-accent, oklch(0.62 0.19 300 / 0.9))" : "var(--w-surface-2, oklch(1 0 0 / 0.07))"}">
        <div style="font-family:${MONO};font-weight:700;font-size:${px(0.075)}px;line-height:1">${ticket(r.prefix ?? q.prefix, r.number)}</div>
        <div style="font-size:${px(0.03)}px;opacity:0.8">${r.counter !== null ? `Counter ${r.counter}` : ""}</div>
      </div>`;
    }).join("");
    return `<div style="width:100%;height:100%;box-sizing:border-box;padding:${px(0.045)}px;display:flex;flex-direction:column;color:inherit;font-family:${SANS}">
      <div style="font-size:${px(0.05)}px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.6;margin-bottom:${px(0.04)}px">Now serving <span id="qnum" style="font-family:${MONO};font-weight:700;margin-left:0.4em">${number}</span></div>
      <div style="flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:${px(0.025)}px;align-content:start">${tiles}</div>
    </div>`;
  }

  let history = "";
  if (variant === "recent" && prev.length) {
    const rows = prev.slice(0, 5).map((r) =>
      `<div style="display:flex;justify-content:space-between;gap:1em;font-size:${px(0.045)}px;opacity:0.72;padding:${px(0.01)}px 0;border-top:1px solid oklch(1 0 0 / 0.12)"><span style="font-family:${MONO};font-weight:700">${ticket(r.prefix ?? q.prefix, r.number)}</span><span>${r.counter !== null ? `Counter ${r.counter}` : ""}</span></div>`,
    ).join("");
    history = `<div style="margin-top:${px(0.04)}px;width:min(84%, ${px(0.9)}px)"><div style="font-size:${px(0.032)}px;letter-spacing:0.1em;text-transform:uppercase;opacity:0.5;margin-bottom:${px(0.015)}px">Previously called</div>${rows}</div>`;
  } else if (variant === "strip" && prev.length) {
    const chips = prev.slice(0, 6).map((r) =>
      `<span style="font-family:${MONO};font-weight:700;font-size:${px(0.06)}px;opacity:0.55;margin:0 0.4em">${ticket(r.prefix ?? q.prefix, r.number)}</span>`,
    ).join("");
    history = `<div style="margin-top:${px(0.03)}px;display:flex;align-items:center;flex-wrap:wrap;justify-content:center">${chips}</div>`;
  }

  return `<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:inherit;font-family:${SANS};text-align:center;box-sizing:border-box;padding:${px(0.04)}px">
    <div style="font-size:${px(0.055)}px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.7">Now serving</div>
    <div id="qnum" style="font-family:${MONO};font-weight:700;font-size:${px(0.3)}px;line-height:1;margin:${px(0.01)}px 0">${number}</div>
    <div style="font-size:${px(0.06)}px;opacity:0.85">${sub}</div>
    ${history}
  </div>`;
}

/** Room status board body — a responsive grid of coloured room cells. */
export function roomBodyHtml(r: RoomData, h: number): string {
  const px = (f: number) => Math.round(h * f);
  const colorOf = (id: string) => r.statuses.find((s) => s.id === id)?.color ?? "oklch(0.5 0 0)";
  const labelOf = (id: string) => r.statuses.find((s) => s.id === id)?.label ?? id;
  const cells = r.rooms.map((room) =>
    `<div data-room="${esc(room.id)}" style="border-radius:${px(0.016)}px;padding:${px(0.02)}px ${px(0.024)}px;background:${colorOf(room.status)};color:#0a0a0a;display:flex;flex-direction:column;justify-content:center;min-height:0">
      <div style="font-weight:800;font-size:${px(0.055)}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(room.name)}</div>
      <div style="font-size:${px(0.035)}px;opacity:0.8">${esc(labelOf(room.status))}</div>
    </div>`,
  ).join("");
  return `<div style="width:100%;height:100%;display:grid;gap:${px(0.02)}px;padding:${px(0.025)}px;box-sizing:border-box;grid-template-columns:repeat(auto-fit,minmax(${px(0.22)}px,1fr));align-content:start;font-family:${SANS}">${cells}</div>`;
}

/**
 * Single-room "door tablet" body — a full-bleed panel filled with one room's
 * status colour, its name + status label centred. `id="doorpanel"` marks it so
 * the player can flash it when the status changes (the "flashes green when the
 * clinic is set to ready" use case, §boards). Falls back to the first room.
 */
export function roomStatusBodyHtml(r: RoomData, roomId: string, h: number): string {
  const px = (f: number) => Math.round(h * f);
  const room = r.rooms.find((rm) => rm.id === roomId) ?? r.rooms[0];
  const st = room ? r.statuses.find((s) => s.id === room.status) : undefined;
  const bg = st?.color ?? "oklch(0.5 0 0)";
  const label = st?.label ?? room?.status ?? "—";
  const name = room?.name ?? "Room";
  return `<div id="doorpanel" style="width:100%;height:100%;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${px(0.03)}px;background:${bg};color:#0a0a0a;font-family:${SANS};text-align:center;padding:${px(0.06)}px">
    <div style="font-weight:800;font-size:${px(0.13)}px;line-height:1;opacity:0.92">${esc(name)}</div>
    <div style="font-weight:900;font-size:${px(0.24)}px;line-height:1;letter-spacing:-0.01em">${esc(label)}</div>
  </div>`;
}

/**
 * Scoreboard body — the sides' scores with a period/clock line. `data-side`
 * marks each score so the player can flash the one that changed. `classic` is a
 * side-by-side HOME – AWAY; `stacked` lists sides vertically (many competitors).
 */
export function scoreBodyHtml(s: ScoreData, variant: string, h: number): string {
  const px = (f: number) => Math.round(h * f);
  const period = s.period ? `<div style="font-family:${MONO};font-size:${px(0.06)}px;opacity:0.75;letter-spacing:0.04em">${esc(s.period)}</div>` : "";
  const title = s.title ? `<div style="font-size:${px(0.05)}px;text-transform:uppercase;letter-spacing:0.14em;opacity:0.6">${esc(s.title)}</div>` : "";

  if (variant === "stacked") {
    const rows = s.sides.map((side) =>
      `<div style="display:flex;align-items:center;justify-content:space-between;gap:1em;padding:${px(0.018)}px ${px(0.03)}px;border-top:1px solid oklch(1 0 0 / 0.12)">
        <span style="font-weight:800;font-size:${px(0.075)}px;${side.color ? `color:${side.color}` : ""}">${esc(side.short || side.name)}</span>
        <span data-side="${esc(side.id)}" style="font-family:${MONO};font-weight:800;font-size:${px(0.1)}px;font-variant-numeric:tabular-nums">${side.score}</span>
      </div>`,
    ).join("");
    return `<div style="width:100%;height:100%;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;gap:${px(0.01)}px;color:#fff;font-family:${SANS};padding:${px(0.04)}px">
      <div style="display:flex;flex-direction:column;align-items:center;gap:${px(0.008)}px;margin-bottom:${px(0.02)}px">${title}${period}</div>${rows}</div>`;
  }

  // classic — side-by-side, big numbers, a dash between two teams.
  const cols = s.sides.map((side, i) =>
    `${i > 0 ? `<div style="font-size:${px(0.16)}px;opacity:0.4;font-weight:300">–</div>` : ""}
     <div style="display:flex;flex-direction:column;align-items:center;gap:${px(0.012)}px;flex:1;min-width:0">
       <div style="font-weight:800;font-size:${px(0.07)}px;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;${side.color ? `color:${side.color}` : "opacity:0.9"}">${esc(side.short || side.name)}</div>
       <div data-side="${esc(side.id)}" style="font-family:${MONO};font-weight:800;font-size:${px(0.3)}px;line-height:1;font-variant-numeric:tabular-nums">${side.score}</div>
     </div>`,
  ).join("");
  return `<div style="width:100%;height:100%;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${px(0.02)}px;color:#fff;font-family:${SANS};padding:${px(0.04)}px">
    <div style="display:flex;flex-direction:column;align-items:center;gap:${px(0.006)}px">${title}${period}</div>
    <div style="display:flex;align-items:center;justify-content:center;gap:${px(0.03)}px;width:100%">${cols}</div>
  </div>`;
}
