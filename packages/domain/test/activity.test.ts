import { describe, expect, it } from "vitest";
import {
  ACTIVITIES,
  ACTIVITY_CATEGORY_META,
  activitiesByCategory,
  activityByKey,
  activityTrack,
  estimateBurnedCalories,
  hrFactor,
} from "../src/activity.js";

describe("activity catalog", () => {
  it("every entry has a positive MET and a known category", () => {
    const cats = new Set(ACTIVITY_CATEGORY_META.map((c) => c.key));
    for (const a of ACTIVITIES) {
      expect(a.met, a.key).toBeGreaterThan(0);
      expect(cats.has(a.category), a.key).toBe(true);
      expect(a.label.length).toBeGreaterThan(0);
    }
  });

  it("has unique keys", () => {
    const keys = ACTIVITIES.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps `other` last so activityByKey falls back to it", () => {
    expect(ACTIVITIES[ACTIVITIES.length - 1]!.key).toBe("other");
    expect(activityByKey("does-not-exist").key).toBe("other");
    expect(activityByKey("running").met).toBe(9.8);
  });

  it("includes the newly-added common workouts + sports", () => {
    const keys = new Set(ACTIVITIES.map((a) => a.key));
    for (const k of ["push_ups", "pull_ups", "jump_rope", "swimming_laps", "kickboxing", "spinning"]) {
      expect(keys.has(k), k).toBe(true);
    }
  });

  it("assigns a natural measurement track per activity", () => {
    expect(activityTrack("push_ups")).toBe("reps");
    expect(activityTrack("pull_ups")).toBe("reps");
    expect(activityTrack("running")).toBe("distance");
    expect(activityTrack("swimming")).toBe("distance");
    expect(activityTrack("yoga")).toBe("duration");
    expect(activityTrack("unknown")).toBe("duration");
  });

  it("groups by category in order, covering every activity exactly once", () => {
    const groups = activitiesByCategory();
    // category order preserved
    expect(groups.map((g) => g.key)).toEqual(ACTIVITY_CATEGORY_META.filter((c) => groups.some((g) => g.key === c.key)).map((c) => c.key));
    const flat = groups.flatMap((g) => g.activities);
    expect(flat.length).toBe(ACTIVITIES.length);
    for (const g of groups) expect(g.activities.length).toBeGreaterThan(0);
  });
});

describe("estimateBurnedCalories", () => {
  it("computes MET × kg × hours × HR factor", () => {
    // 6 MET, 80 kg, 60 min, no HR → 6*80*1 = 480
    expect(estimateBurnedCalories({ met: 6, weightKg: 80, durationMin: 60 })).toBe(480);
    // half an hour → half
    expect(estimateBurnedCalories({ met: 6, weightKg: 80, durationMin: 30 })).toBe(240);
  });

  it("applies the HR intensity bands", () => {
    expect(hrFactor(null)).toBe(1);
    expect(hrFactor(100)).toBe(0.85);
    expect(hrFactor(160)).toBe(1.3);
    expect(estimateBurnedCalories({ met: 6, weightKg: 80, durationMin: 60, avgHrBpm: 160 })).toBe(Math.round(480 * 1.3));
  });

  it("returns 0 on non-positive inputs", () => {
    expect(estimateBurnedCalories({ met: 0, weightKg: 80, durationMin: 60 })).toBe(0);
    expect(estimateBurnedCalories({ met: 6, weightKg: 0, durationMin: 60 })).toBe(0);
    expect(estimateBurnedCalories({ met: 6, weightKg: 80, durationMin: 0 })).toBe(0);
  });
});
