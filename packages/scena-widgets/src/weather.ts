/**
 * Weather widget rendering (§17) — the premium icon set + the variant layouts,
 * as pure string generators shared by the player runtime and the builder preview
 * so they draw byte-identically. Sizing is in design pixels from the node height
 * `h` (never vw), so it survives the builder's scaled stage.
 */

import { type Style, str, num } from "./types.js";
import { radiusValue, borderCss, shadowValue } from "./render.js";

export type IconCode =
  | "clear-day" | "clear-night" | "partly-day" | "partly-night"
  | "cloudy" | "overcast" | "drizzle" | "rain" | "thunder" | "snow" | "mist" | "wind";

export type WeatherVariant = "small" | "current" | "day" | "week";

export interface WeatherData {
  label: string;
  units: "metric" | "imperial";
  current: { temp: number; feelsLike: number; hi: number; lo: number; condition: string; icon: IconCode; humidity: number; wind: number; pop: number };
  hourly: { dt: number; temp: number; icon: IconCode; pop: number }[];
  daily: { dt: number; hi: number; lo: number; icon: IconCode; pop: number }[];
}

/** Re-express a forecast in a different unit system when a widget overrides its
 *  location's default (e.g. a US screen showing a European city in °F). Pure and
 *  shared, so the player and builder convert identically. `override` of "" or an
 *  unknown value leaves the data untouched. */
export function applyWeatherUnits(d: WeatherData, override: string): WeatherData {
  const target = override === "metric" || override === "imperial" ? override : d.units;
  if (target === d.units) return d;
  const t = target === "imperial" ? (c: number) => (c * 9) / 5 + 32 : (f: number) => ((f - 32) * 5) / 9;
  const w = target === "imperial" ? (v: number) => v * 2.23694 : (v: number) => v / 2.23694; // m/s ↔ mph
  const c = d.current;
  return {
    ...d, units: target,
    current: { ...c, temp: t(c.temp), feelsLike: t(c.feelsLike), hi: t(c.hi), lo: t(c.lo), wind: w(c.wind) },
    hourly: d.hourly.map((x) => ({ ...x, temp: t(x.temp) })),
    daily: d.daily.map((x) => ({ ...x, hi: t(x.hi), lo: t(x.lo) })),
  };
}

/* --------------------------------- icons ---------------------------------- */

const SUN = (id: string) => `<radialGradient id="${id}" cx="50%" cy="45%" r="60%"><stop offset="0%" stop-color="#FFE08A"/><stop offset="60%" stop-color="#FFB13C"/><stop offset="100%" stop-color="#FF9500"/></radialGradient>`;
const MOON = (id: string) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#F3F7FE"/><stop offset="100%" stop-color="#C9D6EC"/></linearGradient>`;
const CLOUD = (id: string) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FDFEFF"/><stop offset="100%" stop-color="#CDD6E4"/></linearGradient>`;
const CLOUDD = (id: string) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#C7CFDD"/><stop offset="100%" stop-color="#9AA5B7"/></linearGradient>`;

function sun(g: string): string {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const x1 = 32 + Math.cos(a) * 15, y1 = 32 + Math.sin(a) * 15;
    const x2 = 32 + Math.cos(a) * 22, y2 = 32 + Math.sin(a) * 22;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#FFB13C" stroke-width="3.2" stroke-linecap="round"/>`;
  }).join("");
  return `${rays}<circle cx="32" cy="32" r="12" fill="url(#${g})"/>`;
}
function moon(g: string): string { return `<path d="M40 20a16 16 0 1 0 8 22 13 13 0 0 1-8-22z" fill="url(#${g})"/>`; }
function cloud(g: string, dx = 0, dy = 0, s = 1): string {
  const t = (n: number) => n * s;
  return `<path transform="translate(${dx} ${dy})" d="M20 44 a${t(9)} ${t(9)} 0 0 1 ${t(1)}-${t(17.6)} a${t(12)} ${t(12)} 0 0 1 ${t(22.8)}-${t(2)} a${t(8)} ${t(8)} 0 0 1 ${t(1.2)} ${t(19.6)}z" fill="url(#${g})"/>`;
}
function drops(color: string, n: number): string {
  return Array.from({ length: n }, (_, i) => { const x = 22 + i * (20 / Math.max(1, n - 1)); return `<line x1="${x}" y1="48" x2="${x - 2}" y2="56" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`; }).join("");
}
function flakes(n: number): string {
  return Array.from({ length: n }, (_, i) => { const x = 23 + i * (18 / Math.max(1, n - 1)); return `<circle cx="${x}" cy="${51 + (i % 2) * 4}" r="2.2" fill="#E8F1FF"/>`; }).join("");
}

/** Render a normalized condition as an inline SVG string sized to `size` px. */
export function weatherIcon(code: IconCode, size = 64): string {
  // Deterministic gradient id (keyed on the condition) so the same widget renders
  // byte-identically in the player and the dashboard preview. Identical codes
  // yield identical gradients, so a shared id across instances is collision-safe.
  const id = `wx-${code}`;
  const s = (defs: string, body: string) => `<svg width="${size}" height="${size}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${body}</svg>`;
  switch (code) {
    case "clear-day": return s(SUN(id), sun(id));
    case "clear-night": return s(MOON(id), moon(id));
    case "partly-day": return s(SUN(id + "s") + CLOUD(id + "c"), `<g transform="translate(-6 -8) scale(0.8)">${sun(id + "s")}</g>${cloud(id + "c", 6, 8, 0.9)}`);
    case "partly-night": return s(MOON(id + "m") + CLOUD(id + "c"), `<g transform="translate(-4 -8) scale(0.8)">${moon(id + "m")}</g>${cloud(id + "c", 6, 8, 0.9)}`);
    case "cloudy": return s(CLOUD(id), cloud(id, 0, 2));
    case "overcast": return s(CLOUDD(id + "b") + CLOUD(id + "f"), `<g transform="translate(6 -6) scale(0.82)">${cloud(id + "b")}</g>${cloud(id + "f", 0, 6, 0.95)}`);
    case "drizzle": return s(CLOUD(id), `${cloud(id, 0, -4)}${drops("#7FB3F5", 3)}`);
    case "rain": return s(CLOUDD(id), `${cloud(id, 0, -4)}${drops("#4A90E2", 4)}`);
    case "thunder": return s(CLOUDD(id), `${cloud(id, 0, -6)}<path d="M33 44l-7 10h6l-3 9 11-13h-6l4-6z" fill="#FFCB2E" stroke="#F5A623" stroke-width="0.5"/>`);
    case "snow": return s(CLOUD(id), `${cloud(id, 0, -4)}${flakes(4)}`);
    case "mist": return s("", `<g stroke="#B8C2D4" stroke-width="3.4" stroke-linecap="round"><line x1="16" y1="26" x2="46" y2="26"/><line x1="20" y1="34" x2="50" y2="34"/><line x1="14" y1="42" x2="44" y2="42"/><line x1="22" y1="50" x2="48" y2="50"/></g>`);
    case "wind": return s("", `<g stroke="#9AA5B7" stroke-width="3.4" stroke-linecap="round" fill="none"><path d="M12 26h26a6 6 0 1 0-6-6"/><path d="M14 38h30a6 6 0 1 1-6 6"/></g>`);
  }
}

/* -------------------------------- layouts --------------------------------- */

const W_SANS = "var(--w-font, 'Hanken Grotesk', system-ui, sans-serif)";
const esc = (s: string): string => s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hourLabel = (dt: number): string => { const h = new Date(dt * 1000).getUTCHours(); const am = h < 12; const h12 = h % 12 === 0 ? 12 : h % 12; return `${h12}${am ? "a" : "p"}`; };

/** Container chrome for a weather widget (bg, radius, colour). */
export function weatherContainerCss(style: Style) {
  const css: Record<string, string | number> = {
    width: "100%", height: "100%", boxSizing: "border-box", overflow: "hidden",
    color: str(style.color, "var(--w-fg, #ffffff)"),
    background: str(style.bg ?? style.fill, "var(--w-surface, oklch(0.2 0.03 250 / 0.55))"),
    borderRadius: radiusValue(style, 20),
    opacity: num(style.opacity, 1),
    fontFamily: W_SANS,
  };
  Object.assign(css, borderCss(style));
  const shadow = shadowValue(style);
  if (shadow) css.boxShadow = shadow;
  return css;
}

/**
 * Weather body — design-px sized from `h`. `small` is an icon + temp; `current`
 * a rich card; `day` today + an hourly strip; `week` a seven-day row.
 */
export function weatherBodyHtml(variant: WeatherVariant, d: WeatherData, h: number): string {
  const px = (f: number) => Math.round(h * f);
  const deg = d.units === "imperial" ? "°F" : "°C";
  const c = d.current;
  const box = `width:100%;height:100%;box-sizing:border-box;color:inherit;font-family:${W_SANS};display:flex;overflow:hidden`;

  if (variant === "small") {
    return `<div style="${box};align-items:center;gap:${px(0.06)}px;justify-content:center;padding:${px(0.05)}px">
      <div style="width:${px(0.62)}px;height:${px(0.62)}px">${weatherIcon(c.icon, px(0.62))}</div>
      <div style="font-weight:800;font-size:${px(0.42)}px;line-height:1">${Math.round(c.temp)}<span style="font-size:0.5em;opacity:.7">${deg}</span></div>
    </div>`;
  }

  if (variant === "week") {
    const cols = d.daily.slice(0, 7).map((day, i) =>
      `<div style="flex:1;text-align:center;padding:0 ${px(0.005)}px">
        <div style="font-size:${px(0.075)}px;font-weight:700;opacity:.85">${i === 0 ? "Today" : DAYS[new Date(day.dt * 1000).getUTCDay()]}</div>
        <div style="margin:${px(0.03)}px auto;width:${px(0.24)}px">${weatherIcon(day.icon, px(0.24))}</div>
        <div style="font-weight:800;font-size:${px(0.095)}px">${Math.round(day.hi)}°</div>
        <div style="font-size:${px(0.07)}px;opacity:.6">${Math.round(day.lo)}°</div>
      </div>`).join("");
    return `<div style="${box};flex-direction:column;padding:${px(0.06)}px ${px(0.05)}px;gap:${px(0.04)}px">
      <div style="display:flex;align-items:baseline;gap:${px(0.04)}px">
        <div style="font-size:${px(0.07)}px;letter-spacing:.1em;text-transform:uppercase;opacity:.7">${esc(d.label)}</div>
        <div style="font-weight:800;font-size:${px(0.12)}px">${Math.round(c.temp)}${deg}</div>
        <div style="font-size:${px(0.075)}px;opacity:.8">${esc(c.condition)}</div>
      </div>
      <div style="display:flex;flex:1;align-items:center">${cols}</div>
    </div>`;
  }

  if (variant === "day") {
    const hours = d.hourly.slice(0, 8).map((hr) =>
      `<div style="flex:1;text-align:center">
        <div style="font-size:${px(0.05)}px;opacity:.7">${hourLabel(hr.dt)}</div>
        <div style="margin:${px(0.02)}px auto;width:${px(0.13)}px">${weatherIcon(hr.icon, px(0.13))}</div>
        <div style="font-weight:700;font-size:${px(0.06)}px">${Math.round(hr.temp)}°</div>
        <div style="font-size:${px(0.045)}px;opacity:.6">💧${Math.round(hr.pop * 100)}%</div>
      </div>`).join("");
    return `<div style="${box};flex-direction:column;padding:${px(0.05)}px ${px(0.055)}px;gap:${px(0.04)}px">
      <div style="display:flex;align-items:center;gap:${px(0.04)}px">
        <div style="width:${px(0.34)}px">${weatherIcon(c.icon, px(0.34))}</div>
        <div><div style="font-size:${px(0.055)}px;letter-spacing:.1em;text-transform:uppercase;opacity:.7">${esc(d.label)}</div>
          <div style="font-weight:800;font-size:${px(0.26)}px;line-height:1">${Math.round(c.temp)}<span style="font-size:0.45em;opacity:.75">${deg}</span></div></div>
        <div style="margin-left:auto;text-align:right;font-size:${px(0.06)}px;opacity:.85">${esc(c.condition)}<br/>H ${Math.round(c.hi)}° · L ${Math.round(c.lo)}°</div>
      </div>
      <div style="display:flex;gap:${px(0.01)}px;border-top:1px solid rgba(255,255,255,0.14);padding-top:${px(0.03)}px">${hours}</div>
    </div>`;
  }

  // current — a rich conditions card
  return `<div style="${box};flex-direction:column;justify-content:center;padding:${px(0.06)}px ${px(0.07)}px;gap:${px(0.02)}px">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="min-width:0">
        <div style="font-size:${px(0.055)}px;letter-spacing:.12em;text-transform:uppercase;opacity:.7">${esc(d.label)}</div>
        <div style="font-weight:800;font-size:${px(0.4)}px;line-height:1">${Math.round(c.temp)}<span style="font-size:0.42em;opacity:.75">${deg}</span></div>
        <div style="font-size:${px(0.08)}px;opacity:.9">${esc(c.condition)}</div>
      </div>
      <div style="width:${px(0.5)}px;flex-shrink:0">${weatherIcon(c.icon, px(0.5))}</div>
    </div>
    <div style="display:flex;gap:${px(0.06)}px;font-size:${px(0.055)}px;opacity:.85;margin-top:${px(0.02)}px;flex-wrap:wrap">
      <span>H ${Math.round(c.hi)}° · L ${Math.round(c.lo)}°</span><span>💧 ${Math.round(c.pop * 100)}%</span><span>${c.humidity}% hum</span><span>${c.wind} ${d.units === "imperial" ? "mph" : "m/s"}</span>
    </div>
  </div>`;
}
