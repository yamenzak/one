/**
 * Weather source (BLUEPRINT §17 weather widget). Weather is a *server-side
 * source*, like feeds (§19): the tenant configures a location once, the server
 * fetches OpenWeather **One Call** on a cron, and screens read the cached
 * result. That keeps the API key off the screens and turns a whole fleet into
 * one upstream call per location per hour, regardless of screen count.
 *
 * This module is the pure part: normalizing the One Call payload into the
 * compact shape the widget renders, and mapping OpenWeather condition/icon
 * codes onto our own premium icon set. Both are unit-tested; the network fetch
 * and the mock live below and lean on these.
 */

/** Our normalized icon codes — one clean SVG per code in the player. */
export type IconCode =
  | "clear-day"
  | "clear-night"
  | "partly-day"
  | "partly-night"
  | "cloudy"
  | "overcast"
  | "drizzle"
  | "rain"
  | "thunder"
  | "snow"
  | "mist"
  | "wind";

export interface CurrentWeather {
  temp: number;
  feelsLike: number;
  hi: number;
  lo: number;
  condition: string;
  icon: IconCode;
  humidity: number;
  wind: number;
  pop: number; // chance of precipitation 0..1 (from today's daily)
}

export interface HourPoint {
  /** Unix seconds. */
  dt: number;
  temp: number;
  icon: IconCode;
  pop: number;
}

export interface DayPoint {
  dt: number;
  hi: number;
  lo: number;
  icon: IconCode;
  pop: number;
}

export interface WeatherData {
  label: string;
  units: "metric" | "imperial";
  updatedAt: number;
  /** True when this is fabricated placeholder weather (no platform OpenWeather
   *  key configured) rather than a real fetch — surfaced in the debug overlay so
   *  "why is it 28° when it's 14°" has an obvious answer. */
  mock?: boolean;
  current: CurrentWeather;
  hourly: HourPoint[]; // next ~12h
  daily: DayPoint[]; // next 7 days
}

/**
 * Map an OpenWeather icon code (e.g. "10d") — with the condition id as a
 * tiebreaker — onto our icon set. The OWM icon code already encodes day/night
 * via its trailing d/n, which is why we prefer it over the condition id.
 */
export function mapIcon(owmIcon: string | undefined, conditionId?: number): IconCode {
  const night = typeof owmIcon === "string" && owmIcon.endsWith("n");
  const base = (owmIcon ?? "").slice(0, 2);
  switch (base) {
    case "01":
      return night ? "clear-night" : "clear-day";
    case "02":
      return night ? "partly-night" : "partly-day";
    case "03":
      return "cloudy";
    case "04":
      return "overcast";
    case "09":
      return "drizzle";
    case "10":
      return "rain";
    case "11":
      return "thunder";
    case "13":
      return "snow";
    case "50":
      return "mist";
  }
  // Fall back to the numeric condition group when the icon code is missing.
  if (conditionId != null) {
    if (conditionId >= 200 && conditionId < 300) return "thunder";
    if (conditionId >= 300 && conditionId < 400) return "drizzle";
    if (conditionId >= 500 && conditionId < 600) return "rain";
    if (conditionId >= 600 && conditionId < 700) return "snow";
    if (conditionId >= 700 && conditionId < 800) return "mist";
    if (conditionId === 800) return night ? "clear-night" : "clear-day";
    if (conditionId > 800) return conditionId <= 802 ? (night ? "partly-night" : "partly-day") : "overcast";
  }
  return "cloudy";
}

/** Shape of the One Call fields we consume (loosely typed — upstream JSON). */
export interface OneCall {
  current?: { dt?: number; temp?: number; feels_like?: number; humidity?: number; wind_speed?: number; weather?: { id?: number; description?: string; icon?: string }[] };
  hourly?: { dt?: number; temp?: number; pop?: number; weather?: { id?: number; icon?: string }[] }[];
  daily?: { dt?: number; temp?: { min?: number; max?: number }; pop?: number; weather?: { id?: number; icon?: string }[] }[];
}

const round = (n: number | undefined): number => Math.round(n ?? 0);

/** Normalize a One Call payload into the compact widget shape. Pure. */
export function normalize(raw: OneCall, opts: { label: string; units: "metric" | "imperial"; now: number }): WeatherData {
  const c = raw.current ?? {};
  const today = raw.daily?.[0];
  const cw = c.weather?.[0] ?? {};
  return {
    label: opts.label,
    units: opts.units,
    updatedAt: opts.now,
    current: {
      temp: round(c.temp),
      feelsLike: round(c.feels_like),
      hi: round(today?.temp?.max),
      lo: round(today?.temp?.min),
      condition: cap(cw.description ?? ""),
      icon: mapIcon(cw.icon, cw.id),
      humidity: round(c.humidity),
      wind: round(c.wind_speed),
      pop: clamp01(today?.pop),
    },
    hourly: (raw.hourly ?? []).slice(0, 12).map((h) => ({
      dt: h.dt ?? 0,
      temp: round(h.temp),
      icon: mapIcon(h.weather?.[0]?.icon, h.weather?.[0]?.id),
      pop: clamp01(h.pop),
    })),
    daily: (raw.daily ?? []).slice(0, 7).map((d) => ({
      dt: d.dt ?? 0,
      hi: round(d.temp?.max),
      lo: round(d.temp?.min),
      icon: mapIcon(d.weather?.[0]?.icon, d.weather?.[0]?.id),
      pop: clamp01(d.pop),
    })),
  };
}

function clamp01(n: number | undefined): number {
  if (n == null) return 0;
  return Math.max(0, Math.min(1, n));
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
