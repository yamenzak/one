import { describe, expect, it } from "vitest";
import {
  calorieAdherencePct,
  consistencyPct,
  currentStreak,
  goalProgress,
  longestStreak,
  MAX_RANGE_DAYS,
  presetRange,
  rangeStatus,
  resolveRange,
  resolveGoalTimeline,
  seriesDelta,
  wellnessIndex,
} from "../src/progress.js";

describe("progress aggregates", () => {
  it("streak has a one-day grace when today is not yet logged", () => {
    const logged = new Set(["2026-07-07", "2026-07-08", "2026-07-09"]);
    expect(currentStreak(logged, "2026-07-10")).toBe(3); // grace
    expect(currentStreak(logged, "2026-07-09")).toBe(3); // today logged
    expect(currentStreak(logged, "2026-07-12")).toBe(0); // gap too big
  });

  it("longest streak scans runs correctly", () => {
    const logged = new Set(["2026-07-01", "2026-07-02", "2026-07-04", "2026-07-05", "2026-07-06"]);
    expect(longestStreak(logged)).toBe(3);
  });

  it("consistency = logged / days-in-range", () => {
    const logged = new Set(["2026-07-08", "2026-07-10"]);
    expect(consistencyPct(logged, "2026-07-08", "2026-07-11")).toBe(50);
  });

  it("calorie adherence counts logged days within ±10% of target", () => {
    const daily = new Map([
      ["2026-07-08", 2000], // within (target 2000)
      ["2026-07-09", 2199], // within (<= +10%)
      ["2026-07-10", 2500], // out
    ]);
    expect(calorieAdherencePct(daily, 2000)).toBe(67);
    expect(calorieAdherencePct(daily, null)).toBeNull();
    expect(calorieAdherencePct(new Map(), 2000)).toBeNull();
  });

  it("adherence grades each day against a per-day target resolver", () => {
    const daily = new Map([
      ["2026-07-08", 2000], // graded vs 2000 → within
      ["2026-07-09", 2000], // graded vs 2500 → out (below band)
      ["2026-07-10", 1500], // no target that day → ungraded, not a miss
    ]);
    const target = (d: string) => (d < "2026-07-09" ? 2000 : d < "2026-07-10" ? 2500 : null);
    expect(calorieAdherencePct(daily, target)).toBe(50); // 1 of 2 graded days
  });

  it("resolveGoalTimeline picks the goal in force on each day (later-created wins same day)", () => {
    const resolve = resolveGoalTimeline([
      { start: "2026-06-01", createdAt: "2026-06-01T10:00:00Z", targets: { targetCalories: 2200 } },
      { start: "2026-07-01", createdAt: "2026-07-01T09:00:00Z", targets: { targetCalories: 1900 } },
      { start: "2026-07-01", createdAt: "2026-07-01T18:00:00Z", targets: { targetCalories: 1850 } },
    ]);
    expect(resolve("2026-05-15")).toBeNull(); // before any goal
    expect(resolve("2026-06-15")?.targetCalories).toBe(2200);
    expect(resolve("2026-07-01")?.targetCalories).toBe(1850); // same-day: later created wins
    expect(resolve("2026-08-01")?.targetCalories).toBe(1850); // latest carries forward
  });

  it("wellness index inverts stress around neutral 3 and clamps 1..5", () => {
    expect(wellnessIndex({ mood: 4, energy: 4, sleepQuality: 4, stress: 3 })).toBe(4);
    expect(wellnessIndex({ mood: 5, energy: 5, sleepQuality: 5, stress: 1 })).toBe(5); // clamped
    expect(wellnessIndex({ mood: 4, energy: 4, sleepQuality: 4, stress: 5 })).toBe(3.5);
    expect(wellnessIndex({ mood: 4, energy: 4, sleepQuality: 4 })).toBeNull();
  });

  it("series delta and goal progress", () => {
    expect(seriesDelta([80, 79, 78])).toEqual({ first: 80, last: 78, delta: -2, pct: -2.5 });
    expect(seriesDelta([80])).toBeNull();
    expect(goalProgress(76, 80, 70)!.pct).toBe(40);
    expect(goalProgress(76, 80, 70)!.direction).toBe("down");
    expect(goalProgress(80, 80, 80)).toBeNull();
  });

  it("resolveRange prefers a valid custom window and clamps it", () => {
    const today = "2026-07-10";
    // A well-formed pair wins over the preset.
    expect(resolveRange({ range: "7d", start: "2026-05-01", end: "2026-05-31" }, today))
      .toEqual({ start: "2026-05-01", end: "2026-05-31" });
    // Never past today.
    expect(resolveRange({ start: "2026-07-01", end: "2026-12-31" }, today))
      .toEqual({ start: "2026-07-01", end: today });
    // Never longer than the ceiling.
    const wide = resolveRange({ start: "2020-01-01", end: today }, today);
    expect(wide.end).toBe(today);
    expect(wide.start).toBe("2025-07-09");
    expect(Math.round((Date.parse(wide.end) - Date.parse(wide.start)) / 86_400_000)).toBe(MAX_RANGE_DAYS);
  });

  it("resolveRange falls back to the preset on anything malformed", () => {
    const today = "2026-07-10";
    const thirty = { start: "2026-06-11", end: today };
    // Half a pair, an inverted pair, a junk date, an unknown preset — a bad
    // query string is the caller's mistake, and a 500 would make it look like
    // ours.
    expect(resolveRange({ range: "30d", start: "2026-06-01" }, today)).toEqual(thirty);
    expect(resolveRange({ start: "2026-06-30", end: "2026-06-01" }, today)).toEqual(thirty);
    expect(resolveRange({ start: "yesterday", end: "today" }, today)).toEqual(thirty);
    expect(resolveRange({ range: "all-time" }, today)).toEqual(thirty);
    expect(resolveRange({}, today)).toEqual(thirty);
    expect(resolveRange({ range: "7d" }, today)).toEqual({ start: "2026-07-04", end: today });
  });

  it("range presets and range status", () => {
    expect(presetRange("7d", "2026-07-10")).toEqual({ start: "2026-07-04", end: "2026-07-10" });
    expect(rangeStatus(75, 70, 80)).toBe("in_range");
    expect(rangeStatus(65, 70, 80)).toBe("below");
    expect(rangeStatus(85, null, 80)).toBe("above");
    expect(rangeStatus(85, null, null)).toBe("in_range");
  });
});
