import { describe, expect, it } from "vitest";
import {
  calorieAdherencePct,
  consistencyPct,
  currentStreak,
  goalProgress,
  longestStreak,
  presetRange,
  rangeStatus,
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

  it("range presets and range status", () => {
    expect(presetRange("7d", "2026-07-10")).toEqual({ start: "2026-07-04", end: "2026-07-10" });
    expect(rangeStatus(75, 70, 80)).toBe("in_range");
    expect(rangeStatus(65, 70, 80)).toBe("below");
    expect(rangeStatus(85, null, 80)).toBe("above");
    expect(rangeStatus(85, null, null)).toBe("in_range");
  });
});
