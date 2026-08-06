import { describe, it, expect } from "vitest";
import { mapIcon, normalize, type OneCall } from "../src/weather.js";

describe("weather icon mapping", () => {
  it("maps OWM icon codes (day/night aware)", () => {
    expect(mapIcon("01d")).toBe("clear-day");
    expect(mapIcon("01n")).toBe("clear-night");
    expect(mapIcon("02d")).toBe("partly-day");
    expect(mapIcon("02n")).toBe("partly-night");
    expect(mapIcon("03d")).toBe("cloudy");
    expect(mapIcon("04n")).toBe("overcast");
    expect(mapIcon("09d")).toBe("drizzle");
    expect(mapIcon("10d")).toBe("rain");
    expect(mapIcon("11d")).toBe("thunder");
    expect(mapIcon("13d")).toBe("snow");
    expect(mapIcon("50d")).toBe("mist");
  });

  it("falls back to the condition id when the icon is missing", () => {
    expect(mapIcon(undefined, 212)).toBe("thunder");
    expect(mapIcon(undefined, 321)).toBe("drizzle");
    expect(mapIcon(undefined, 502)).toBe("rain");
    expect(mapIcon(undefined, 601)).toBe("snow");
    expect(mapIcon(undefined, 741)).toBe("mist");
    expect(mapIcon(undefined, 800)).toBe("clear-day");
    expect(mapIcon("50n", 800)).toBe("mist"); // icon wins over id
    expect(mapIcon(undefined, 804)).toBe("overcast");
  });
});

describe("weather normalize", () => {
  const raw: OneCall = {
    current: { dt: 100, temp: 21.4, feels_like: 20.1, humidity: 55, wind_speed: 3.2, weather: [{ id: 800, description: "clear sky", icon: "01d" }] },
    hourly: Array.from({ length: 48 }, (_, i) => ({ dt: 100 + i * 3600, temp: 20 + i, pop: 0.1, weather: [{ id: 802, icon: "03d" }] })),
    daily: [
      { dt: 100, temp: { min: 14.6, max: 27.2 }, pop: 0.4, weather: [{ id: 500, icon: "10d" }] },
      ...Array.from({ length: 7 }, (_, i) => ({ dt: 200 + i, temp: { min: 12, max: 24 }, pop: 0.2, weather: [{ id: 801, icon: "02d" }] })),
    ],
  };

  it("builds the compact current/hourly/daily shape with rounding", () => {
    const w = normalize(raw, { label: "Cairo", units: "metric", now: 999 });
    expect(w.label).toBe("Cairo");
    expect(w.updatedAt).toBe(999);
    expect(w.current.temp).toBe(21); // rounded
    expect(w.current.hi).toBe(27); // from daily[0].max
    expect(w.current.lo).toBe(15);
    expect(w.current.condition).toBe("Clear sky"); // capitalized
    expect(w.current.icon).toBe("clear-day");
    expect(w.current.pop).toBe(0.4);
  });

  it("caps hourly at 12 and daily at 7", () => {
    const w = normalize(raw, { label: "Cairo", units: "metric", now: 0 });
    expect(w.hourly).toHaveLength(12);
    expect(w.daily).toHaveLength(7);
    expect(w.daily[0]!.icon).toBe("rain");
    expect(w.daily[1]!.icon).toBe("partly-day");
  });

  it("tolerates a missing/empty payload", () => {
    const w = normalize({}, { label: "Nowhere", units: "imperial", now: 5 });
    expect(w.current.temp).toBe(0);
    expect(w.hourly).toEqual([]);
    expect(w.daily).toEqual([]);
    expect(w.units).toBe("imperial");
  });
});
