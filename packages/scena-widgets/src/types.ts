/**
 * Shared, framework-agnostic widget types. A `Css` dict uses camelCase keys and
 * string|number values — exactly what both `Object.assign(el.style, …)` (player,
 * vanilla DOM) and React's `style={…}` prop accept — so one computed style flows
 * unchanged into either renderer.
 */

export type Css = Record<string, string | number>;
export type Style = Record<string, unknown>;
export type Config = Record<string, unknown>;

/**
 * How a widget's content responds when its box is resized (§17 scaling model):
 *  - "uniform" — the content is authored at an intrinsic size and the whole
 *    composition scales together (like an SVG viewBox), so nothing ever crops
 *    and type/padding/radius scale proportionally. Best for clocks, hero text,
 *    shapes, cards.
 *  - "reflow" — the content fills the box with a fluid layout (flex/grid) and
 *    reflows; internal sizes are box-relative. Best for tickers, boards, panels.
 */
export type ScaleMode = "uniform" | "reflow";

/** Every widget kind the builder can author and the player can paint. */
export type WidgetType =
  | "text"
  | "clock"
  | "date"
  | "box"
  | "circle"
  | "triangle"
  | "line"
  | "image"
  | "logo"
  | "ticker"
  | "stack"
  | "nowplaying"
  | "weather"
  | "queue_caller"
  | "room_board"
  | "room_status"
  | "scoreboard"
  | "countdown"
  | "metric"
  | "menu"
  | "qr"
  | "cta"
  | "html";

export const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : v == null ? fallback : String(v));
export const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
};
export const bool = (v: unknown, fallback = false): boolean => (typeof v === "boolean" ? v : v == null ? fallback : v === "true" || v === 1);
