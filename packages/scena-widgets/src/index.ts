/**
 * @scena/widgets — the pure widget core. Framework-agnostic style/shape/text/
 * ticker/stack math plus the type registry, shared byte-identically between the
 * player's DOM renderer and the dashboard's React preview so a widget looks the
 * same wherever it is drawn. No I/O, no DOM, no React — keep it that way.
 */

export * from "./types.js";
export * from "./render.js";
export * from "./ticker.js";
export * from "./stack.js";
export * from "./nowplaying.js";
export * from "./queue.js";
export * from "./board.js";
export * from "./weather.js";
export * from "./countdown.js";
export * from "./metric.js";
export * from "./menu.js";
export * from "./qr.js";
export * from "./cta.js";
export * from "./display.js";
export * from "./source.js";
export * from "./registry.js";
export * from "./ai-spec.js";
