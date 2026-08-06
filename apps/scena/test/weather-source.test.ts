import { describe, it, expect } from "vitest";
import { withinOpenHours, callsPerDay, unitsOf } from "../src/weather-store.js";

// A fixed noon-UTC instant so timezone math is deterministic.
const NOON_UTC = Date.UTC(2026, 0, 15, 12, 0, 0); // 2026-01-15 12:00Z

describe("weather opening-hours window", () => {
  it("a normal daytime window includes the local hour it covers", () => {
    // 12:00 UTC, window 08–20 in UTC → open.
    expect(withinOpenHours({ open_hour: 8, close_hour: 20, tz: "UTC" }, NOON_UTC)).toBe(true);
    // Same instant is 07:00 in New York (UTC-5 in January) → before opening.
    expect(withinOpenHours({ open_hour: 8, close_hour: 20, tz: "America/New_York" }, NOON_UTC)).toBe(false);
  });

  it("an overnight window (close < open) wraps past midnight", () => {
    const at23 = Date.UTC(2026, 0, 15, 23, 0, 0);
    expect(withinOpenHours({ open_hour: 20, close_hour: 6, tz: "UTC" }, at23)).toBe(true); // 23:00 ≥ 20
    expect(withinOpenHours({ open_hour: 20, close_hour: 6, tz: "UTC" }, NOON_UTC)).toBe(false); // 12:00 outside
  });

  it("open == close (or the 0–24 default) means always open", () => {
    expect(withinOpenHours({ open_hour: 0, close_hour: 0, tz: "UTC" }, NOON_UTC)).toBe(true);
    expect(withinOpenHours({ open_hour: 0, close_hour: 24, tz: "UTC" }, NOON_UTC)).toBe(true);
    // Null columns (legacy rows) fall back to 0–24 → always open.
    expect(withinOpenHours({ open_hour: null, close_hour: null, tz: null }, NOON_UTC)).toBe(true);
  });

  it("a bad timezone falls back to UTC rather than throwing", () => {
    expect(withinOpenHours({ open_hour: 8, close_hour: 20, tz: "Not/AZone" }, NOON_UTC)).toBe(true);
  });
});

describe("weather calls-per-day (cost projection)", () => {
  it("counts one call per hour the window spans", () => {
    expect(callsPerDay({ open_hour: 8, close_hour: 20 })).toBe(12); // 8→20
    expect(callsPerDay({ open_hour: 0, close_hour: 24 })).toBe(24); // all day
    expect(callsPerDay({ open_hour: 22, close_hour: 4 })).toBe(6); // overnight 22→04
    expect(callsPerDay({ open_hour: 9, close_hour: 9 })).toBe(24); // equal → always-on
    expect(callsPerDay({ open_hour: null, close_hour: null })).toBe(24); // legacy default
  });
});

describe("weather per-location units", () => {
  it("defaults to metric and honors an imperial override", () => {
    expect(unitsOf({ units: null })).toBe("metric");
    expect(unitsOf({ units: "metric" })).toBe("metric");
    expect(unitsOf({ units: "imperial" })).toBe("imperial");
    expect(unitsOf({ units: "garbage" })).toBe("metric");
  });
});
