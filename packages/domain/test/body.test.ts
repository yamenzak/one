import { describe, it, expect } from "vitest";
import { calculateBMR, calculateBMI, classifyBMI, ageFromDob, goalStaleness, profileGaps } from "../src/body.js";

describe("calculateBMR", () => {
  const base = { weightKg: 80, heightCm: 180, ageYears: 30, gender: "male" as const };

  it("Mifflin-St Jeor when body-fat is unknown (matches the nutrition calculator)", () => {
    const r = calculateBMR(base)!;
    expect(r.formula).toBe("mifflin_st_jeor");
    expect(r.bmr).toBe(10 * 80 + 6.25 * 180 - 5 * 30 + 5); // 1780
  });

  it("Katch-McArdle when body-fat is known", () => {
    const r = calculateBMR({ ...base, bodyFatPercent: 20 })!;
    expect(r.formula).toBe("katch_mcardle");
    expect(r.leanBodyMassKg).toBe(64);
    expect(r.bmr).toBe(Math.round(370 + 21.6 * 64)); // 1752
  });

  it("female offset", () => {
    expect(calculateBMR({ ...base, gender: "female" })!.bmr).toBe(10 * 80 + 6.25 * 180 - 5 * 30 - 161);
  });

  it("null when a required input is missing", () => {
    expect(calculateBMR({ ...base, heightCm: 0 })).toBeNull();
    expect(calculateBMR({ ...base, ageYears: 0 })).toBeNull();
  });
});

describe("calculateBMI + classify", () => {
  it("kg/m² to one decimal", () => {
    expect(calculateBMI(80, 180)).toBe(24.7);
    expect(calculateBMI(0, 180)).toBeNull();
  });
  it("WHO bands", () => {
    expect(classifyBMI(17)).toBe("underweight");
    expect(classifyBMI(22)).toBe("normal");
    expect(classifyBMI(27)).toBe("overweight");
    expect(classifyBMI(32)).toBe("obese");
  });
});

describe("ageFromDob", () => {
  it("whole years at a reference date", () => {
    expect(ageFromDob("1990-06-15", new Date("2026-06-15T00:00:00"))).toBe(36);
    expect(ageFromDob("1990-06-16", new Date("2026-06-15T00:00:00"))).toBe(35); // birthday not yet reached
    expect(ageFromDob(null)).toBeNull();
    expect(ageFromDob("nonsense")).toBeNull();
  });
});

describe("goalStaleness", () => {
  it("flags a large weight drift", () => {
    const s = goalStaleness({ goalWeightKg: 90, currentWeightKg: 84 });
    expect(s.stale).toBe(true);
    expect(s.weightDeltaKg).toBe(-6);
    expect(s.reason).toContain("kg");
  });
  it("stable within threshold", () => {
    expect(goalStaleness({ goalWeightKg: 90, currentWeightKg: 88.5 }).stale).toBe(false);
  });
  it("flags a large BMR drift even when weight is unknown", () => {
    expect(goalStaleness({ goalBmr: 1800, currentBmr: 1650 }).stale).toBe(true);
  });
  it("no data → not stale", () => {
    expect(goalStaleness({}).stale).toBe(false);
  });
});

describe("profileGaps", () => {
  it("lists everything when empty", () => {
    const gaps = profileGaps({});
    expect(gaps).toContain("gender");
    expect(gaps).toContain("height");
    expect(gaps).toContain("goal");
    expect(gaps).toContain("workoutLocation");
  });
  it("empty when complete", () => {
    const gaps = profileGaps({
      gender: "male",
      dateOfBirth: "1990-01-01",
      heightCm: 180,
      prefs: { targetWeightKg: 80, primaryGoal: "maintain", activityLevel: "moderate", workoutsPerWeek: 4, mealsPerDay: 3, workoutLocation: "gym" },
    });
    expect(gaps).toEqual([]);
  });
});
