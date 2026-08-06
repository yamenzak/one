/**
 * Weather store & fetch service (BLUEPRINT §17) — a company-provided data
 * source. D1 CRUD for location sources, the cached normalized conditions, the
 * platform OpenWeather config, geocoding, and the cron-driven refresh.
 *
 * Weather is metered: each *real* OpenWeather One Call costs the tenant a fixed
 * number of credits (weather.credits_per_call, default 3). To keep spend
 * predictable and bounded to business hours, a location refreshes at most once
 * per hour and only inside its opening-hours window [open_hour, close_hour) in
 * its timezone — a shop open 08:00–20:00 makes 12 calls/day and is never billed
 * overnight. Screens read the cache only; they never trigger a billed fetch.
 *
 * A mock generator produces plausible conditions when no platform key is set,
 * so the widget is fully exercisable in dev (and is free — no real call, no
 * charge).
 */

import type { Env } from "./env.js";
import { ensureSchema, DEMO_TENANT } from "./db.js";
import { getConfig } from "./billing-store.js";
import { normalize, type WeatherData, type OneCall, type IconCode } from "./weather.js";

export interface WeatherSourceRow {
  id: string;
  tenant_id: string;
  label: string;
  lat: number;
  lon: number;
  refresh_sec: number;
  created_at: number;
  /** Opening-hours window (local, in `tz`): poll only when open_hour <= h < close_hour. */
  open_hour: number | null;
  close_hour: number | null;
  tz: string | null;
  units: string | null; // "metric" | "imperial" (per-location)
}

export interface WeatherConfig {
  apiKey: string;
  oneCallBase: string;
  /** OpenWeather One Call API version — "4.0" (current, modular) or "3.0"
   *  (legacy single-call). A key is subscribed to one version, not both. */
  oneCallVersion: "3.0" | "4.0";
  geoBase: string;
  /** Credits charged per real upstream call (admin-tunable). */
  creditsPerCall: number;
}

export async function weatherConfig(db: D1Database): Promise<WeatherConfig> {
  const cfg = await getConfig(db);
  const perCall = parseInt(cfg["weather.credits_per_call"] ?? "", 10);
  return {
    apiKey: cfg["weather.api_key"] ?? "",
    oneCallBase: cfg["weather.onecall_base"] ?? "https://api.openweathermap.org/data/3.0/onecall",
    oneCallVersion: (cfg["weather.onecall_version"] ?? "4.0") === "3.0" ? "3.0" : "4.0",
    geoBase: cfg["weather.geo_base"] ?? "https://api.openweathermap.org/geo/1.0/direct",
    creditsPerCall: Number.isFinite(perCall) && perCall >= 0 ? perCall : 3,
  };
}

/** Whether the platform OpenWeather key is configured (else we mock, for free). */
export const weatherConfigured = (c: WeatherConfig): boolean => c.apiKey.trim().length > 0;

/* ------------------------------ opening hours ---------------------------- */

/** Normalize a stored hour (0..24) with a fallback. */
function hourOr(v: number | null | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 24 ? Math.floor(n) : fallback;
}

/** Per-location units, defaulting to metric. */
export function unitsOf(s: Pick<WeatherSourceRow, "units">): "metric" | "imperial" {
  return s.units === "imperial" ? "imperial" : "metric";
}

/** The current local hour (0..23) in an IANA timezone (falls back to UTC). */
function localHour(tz: string | null | undefined, now: number): number {
  try {
    const s = new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone: tz || "UTC" }).format(new Date(now));
    const h = parseInt(s, 10);
    return Number.isFinite(h) ? h % 24 : new Date(now).getUTCHours();
  } catch {
    return new Date(now).getUTCHours();
  }
}

/**
 * Whether `now` falls inside the location's opening-hours window. open==close (or
 * the default 0–24) means always open; a close < open window is treated as
 * overnight (e.g. 20→06), so late venues still work.
 */
export function withinOpenHours(s: Pick<WeatherSourceRow, "open_hour" | "close_hour" | "tz">, now = Date.now()): boolean {
  const open = hourOr(s.open_hour, 0);
  const close = hourOr(s.close_hour, 24);
  if (open === close) return true; // always-on
  const h = localHour(s.tz, now);
  return close > open ? h >= open && h < close : h >= open || h < close; // normal | overnight
}

/** Calls/day a window implies (for the dashboard cost estimate). */
export function callsPerDay(s: Pick<WeatherSourceRow, "open_hour" | "close_hour">): number {
  const open = hourOr(s.open_hour, 0);
  const close = hourOr(s.close_hour, 24);
  if (open === close) return 24;
  return close > open ? close - open : 24 - open + close;
}

/* --------------------------------- CRUD ---------------------------------- */

export async function listSources(db: D1Database, tenantId = DEMO_TENANT): Promise<WeatherSourceRow[]> {
  await ensureSchema(db);
  return (await db.prepare("SELECT * FROM weather_sources WHERE tenant_id = ? ORDER BY created_at").bind(tenantId).all<WeatherSourceRow>()).results ?? [];
}

export async function getSource(db: D1Database, id: string): Promise<WeatherSourceRow | null> {
  await ensureSchema(db);
  return db.prepare("SELECT * FROM weather_sources WHERE id = ?").bind(id).first<WeatherSourceRow>();
}

export async function createSource(
  db: D1Database,
  s: { label: string; lat: number; lon: number; openHour?: number; closeHour?: number; tz?: string; units?: string; tenantId?: string },
): Promise<string> {
  await ensureSchema(db);
  const id = `wx_${randomHex(8)}`;
  await db
    .prepare("INSERT INTO weather_sources (id, tenant_id, label, lat, lon, refresh_sec, created_at, open_hour, close_hour, tz, units) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(
      id,
      s.tenantId ?? DEMO_TENANT,
      s.label || "Location",
      s.lat,
      s.lon,
      3600, // hourly — the opening-hours window bounds how many actually fire
      Date.now(),
      hourOr(s.openHour, 8),
      hourOr(s.closeHour, 20),
      (s.tz || "UTC").slice(0, 64),
      s.units === "imperial" ? "imperial" : "metric",
    )
    .run();
  return id;
}

/** Edit a location's label / opening-hours / timezone / units. */
export async function updateSource(
  db: D1Database,
  id: string,
  patch: { label?: string; openHour?: number; closeHour?: number; tz?: string; units?: string },
): Promise<void> {
  const cur = await getSource(db, id);
  if (!cur) return;
  await db
    .prepare("UPDATE weather_sources SET label = ?, open_hour = ?, close_hour = ?, tz = ?, units = ? WHERE id = ?")
    .bind(
      patch.label != null ? patch.label || "Location" : cur.label,
      patch.openHour != null ? hourOr(patch.openHour, 8) : hourOr(cur.open_hour, 8),
      patch.closeHour != null ? hourOr(patch.closeHour, 20) : hourOr(cur.close_hour, 20),
      (patch.tz != null ? patch.tz || "UTC" : cur.tz || "UTC").slice(0, 64),
      patch.units != null ? (patch.units === "imperial" ? "imperial" : "metric") : unitsOf(cur),
      id,
    )
    .run();
}

export async function deleteSource(db: D1Database, id: string): Promise<void> {
  await ensureSchema(db);
  await db.batch([
    db.prepare("DELETE FROM weather_sources WHERE id = ?").bind(id),
    db.prepare("DELETE FROM weather_cache WHERE source_id = ?").bind(id),
  ]);
}

/* -------------------------------- cache ---------------------------------- */

export async function readCache(db: D1Database, sourceId: string): Promise<WeatherData | null> {
  await ensureSchema(db);
  const row = await db.prepare("SELECT data_json, updated_at FROM weather_cache WHERE source_id = ?").bind(sourceId).first<{ data_json: string; updated_at: number }>();
  if (!row) return null;
  try {
    return JSON.parse(row.data_json) as WeatherData;
  } catch {
    return null;
  }
}

async function writeCache(db: D1Database, sourceId: string, data: WeatherData): Promise<void> {
  await db
    .prepare("INSERT INTO weather_cache (source_id, data_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(source_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at")
    .bind(sourceId, JSON.stringify(data), data.updatedAt)
    .run();
}

/* ------------------------------ geocoding -------------------------------- */

/** City name → coordinates via OpenWeather geocoding (or a small mock table). */
export async function geocode(db: D1Database, query: string): Promise<{ label: string; lat: number; lon: number } | null> {
  const cfg = await weatherConfig(db);
  if (!weatherConfigured(cfg)) return mockGeocode(query);
  try {
    const url = `${cfg.geoBase}?q=${encodeURIComponent(query)}&limit=1&appid=${cfg.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const arr = (await res.json()) as { name?: string; state?: string; country?: string; lat?: number; lon?: number }[];
    const g = arr[0];
    if (!g || g.lat == null || g.lon == null) return null;
    const label = [g.name, g.state, g.country].filter(Boolean).join(", ");
    return { label: label || query, lat: g.lat, lon: g.lon };
  } catch {
    return null;
  }
}

/* ------------------------------- refresh --------------------------------- */

/** Debit one metered weather call. Returns false (skip the fetch) if funds short. */
async function chargeCall(env: Env, tenantId: string, credits: number, ref: string): Promise<boolean> {
  if (credits <= 0) return true;
  try {
    const billing = env.BILLING.get(env.BILLING.idFromName(tenantId));
    await billing.bind(tenantId);
    const r = await billing.charge(credits, "weather.call", ref);
    return r.ok;
  } catch {
    // Billing unavailable — don't hard-fail the whole refresh; allow the call.
    return true;
  }
}

/** Give back a charged weather credit when the upstream fetch failed, so a
 *  tenant is never billed for a call that didn't return real data. Best-effort. */
async function refundCall(env: Env, tenantId: string, credits: number, ref: string): Promise<void> {
  if (credits <= 0) return;
  try {
    const billing = env.BILLING.get(env.BILLING.idFromName(tenantId));
    await billing.bind(tenantId);
    await billing.topUp(credits, "weather.refund", ref);
  } catch {
    /* billing unavailable — nothing to refund against */
  }
}

/**
 * Fetch + normalize + cache one location. With the platform key set this makes a
 * real, metered OpenWeather call (charged `creditsPerCall`); without a key it
 * mocks for free. If the tenant can't afford the call, the last cached reading
 * is kept (no fetch, no charge). Returns the data used (fresh, or last-good).
 */
export async function refreshSource(env: Env, source: WeatherSourceRow, now = Date.now()): Promise<WeatherData> {
  const cfg = await weatherConfig(env.DB);
  const units = unitsOf(source);
  if (!weatherConfigured(cfg)) {
    const data = mockWeather(source, units, now);
    await writeCache(env.DB, source.id, data);
    return data;
  }
  const paid = await chargeCall(env, source.tenant_id, cfg.creditsPerCall, source.id);
  if (!paid) {
    // Out of credits — serve the last cached reading, don't spend.
    const last = await readCache(env.DB, source.id);
    if (last) return last;
    const data = mockWeather(source, units, now);
    await writeCache(env.DB, source.id, data);
    return data;
  }
  let data: WeatherData;
  try {
    data = await fetchReal(cfg, source, units, now);
  } catch {
    // Upstream failed after we charged — refund the call and serve the last-good
    // reading (or mock), so the tenant isn't billed for a non-result.
    await refundCall(env, source.tenant_id, cfg.creditsPerCall, source.id);
    const last = await readCache(env.DB, source.id);
    data = last ?? mockWeather(source, units, now);
    await writeCache(env.DB, source.id, data);
    return data;
  }
  await writeCache(env.DB, source.id, data);
  return data;
}

/**
 * Cron sweep across ALL tenants: refetch every location that is inside its
 * opening-hours window and whose cache is at least an hour old. Each fetch is
 * metered against its tenant. Returns how many were refreshed.
 */
export async function refreshStale(env: Env, now = Date.now()): Promise<number> {
  await ensureSchema(env.DB);
  const sources = (await env.DB.prepare("SELECT * FROM weather_sources").all<WeatherSourceRow>()).results ?? [];
  let n = 0;
  for (const s of sources) {
    if (!withinOpenHours(s, now)) continue;
    const cached = await env.DB.prepare("SELECT updated_at FROM weather_cache WHERE source_id = ?").bind(s.id).first<{ updated_at: number }>();
    // 1-min slack so an on-the-hour cron reliably fires each hour.
    if (cached && now - cached.updated_at < s.refresh_sec * 1000 - 60_000) continue;
    await refreshSource(env, s, now).catch(() => undefined);
    n++;
  }
  return n;
}

async function fetchReal(cfg: WeatherConfig, source: WeatherSourceRow, units: "metric" | "imperial", now: number): Promise<WeatherData> {
  const raw = cfg.oneCallVersion === "4.0"
    ? await fetchOneCall4(cfg, source, units)
    : await fetchOneCall3(cfg, source, units);
  return normalize(raw, { label: source.label, units, now });
}

/** Legacy One Call 3.0: one call returns current + hourly + daily. */
async function fetchOneCall3(cfg: WeatherConfig, source: WeatherSourceRow, units: "metric" | "imperial"): Promise<OneCall> {
  const url = `${cfg.oneCallBase}?lat=${source.lat}&lon=${source.lon}&units=${units}&exclude=minutely,alerts&appid=${cfg.apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`onecall3 ${res.status}`);
  return (await res.json()) as OneCall;
}

/**
 * One Call 4.0 is modular: `/current` for now, `/timeline/1h` + `/timeline/1day`
 * for the forecast. Each endpoint returns `{ lat, lon, timezone, data: [...] }`.
 * `/current` yields exactly one record at `data[0]` whose fields match 3.0's
 * `current` object. We fetch current (required for temp/condition) and
 * best-effort the two timelines (if their quota/shape fails, current still
 * renders). We reassemble a 3.0-shaped OneCall so `normalize()` is unchanged.
 */
async function fetchOneCall4(cfg: WeatherConfig, source: WeatherSourceRow, units: "metric" | "imperial"): Promise<OneCall> {
  // Derive the version-less root from the configured base (respects a custom host).
  const root = cfg.oneCallBase.replace(/\/(3\.0|4\.0)\/onecall.*$/, "") || "https://api.openweathermap.org/data";
  const q = `lat=${source.lat}&lon=${source.lon}&units=${units}&appid=${cfg.apiKey}`;
  const curRes = await fetch(`${root}/4.0/onecall/current?${q}`);
  if (!curRes.ok) throw new Error(`onecall4 current ${curRes.status}`);
  const cur = (await curRes.json()) as { data?: Array<OneCall["current"]> };

  // Best-effort forecast — a quota error / empty payload must not break now.
  const timeline = async (step: string): Promise<Record<string, unknown>[]> => {
    try {
      const r = await fetch(`${root}/4.0/onecall/timeline/${step}?${q}`);
      if (!r.ok) return [];
      const j = (await r.json()) as { data?: unknown };
      // 4.0 timelines nest records under `data`; fall back to any array field.
      const arr = Array.isArray(j.data)
        ? (j.data as Record<string, unknown>[])
        : (Object.values(j).find((v) => Array.isArray(v)) as Record<string, unknown>[] | undefined);
      return arr ?? [];
    } catch { return []; }
  };
  const [hRows, dRows] = await Promise.all([timeline("1h"), timeline("1day")]);
  const wx = (v: unknown): { id?: number; description?: string; icon?: string }[] => (Array.isArray(v) ? v : []);

  const out: OneCall = {
    current: cur.data?.[0] ?? {},
    hourly: hRows.map((h) => ({ dt: num4(h.dt), temp: num4(h.temp), pop: num4(h.pop), weather: wx(h.weather) })),
    // Daily temp may be an object {min,max} (3.0-style) or flat min/max fields.
    daily: dRows.map((d) => ({
      dt: num4(d.dt),
      temp: d.temp && typeof d.temp === "object" ? (d.temp as { min?: number; max?: number }) : { min: num4((d as { min?: unknown }).min), max: num4((d as { max?: unknown }).max) },
      pop: num4(d.pop),
      weather: wx(d.weather),
    })),
  };
  return out;
}

const num4 = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);

/* --------------------------------- mock ---------------------------------- */

/** Deterministic, plausible conditions from the location + day, for dev. */
function mockWeather(source: WeatherSourceRow, units: "metric" | "imperial", now: number): WeatherData {
  const dayIx = Math.floor(now / 86_400_000);
  const seed = Math.abs(Math.round(source.lat * 100) + Math.round(source.lon * 100) + dayIx);
  const cycle: IconCode[] = ["clear-day", "partly-day", "cloudy", "rain", "drizzle", "overcast", "snow", "thunder", "mist"];
  const pick = (i: number): IconCode => cycle[(seed + i) % cycle.length]!;
  const baseC = 8 + (seed % 22); // 8..29 °C
  const toU = (c: number) => (units === "imperial" ? Math.round((c * 9) / 5 + 32) : Math.round(c));
  const cur = toU(baseC);
  const conditionOf: Record<IconCode, string> = {
    "clear-day": "Clear sky", "clear-night": "Clear", "partly-day": "Partly cloudy", "partly-night": "Partly cloudy",
    cloudy: "Scattered clouds", overcast: "Overcast", drizzle: "Light drizzle", rain: "Rain", thunder: "Thunderstorms",
    snow: "Snow", mist: "Mist", wind: "Windy",
  };
  return {
    label: source.label,
    units,
    updatedAt: now,
    mock: true,
    current: {
      temp: cur,
      feelsLike: cur - 1,
      hi: toU(baseC + 4),
      lo: toU(baseC - 5),
      condition: conditionOf[pick(0)],
      icon: pick(0),
      humidity: 40 + (seed % 45),
      wind: 2 + (seed % 8),
      pop: (seed % 10) / 10,
    },
    hourly: Array.from({ length: 12 }, (_, i) => ({
      dt: Math.floor(now / 1000) + (i + 1) * 3600,
      temp: toU(baseC + Math.round(3 * Math.sin(i / 2))),
      icon: pick(i),
      pop: ((seed + i) % 10) / 10,
    })),
    daily: Array.from({ length: 7 }, (_, i) => ({
      dt: Math.floor(now / 1000) + i * 86_400,
      hi: toU(baseC + 4 - (i % 3)),
      lo: toU(baseC - 5 - (i % 2)),
      icon: pick(i * 2),
      pop: ((seed + i * 3) % 10) / 10,
    })),
  };
}

function mockGeocode(query: string): { label: string; lat: number; lon: number } {
  // Deterministic pseudo-coords so a mock location is stable per name.
  let h = 0;
  for (const ch of query) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const lat = ((h % 12000) / 100) - 60; // -60..60
  const lon = (((h >> 4) % 36000) / 100) - 180; // -180..180
  return { label: query.trim() || "Location", lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 };
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}
