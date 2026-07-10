import { describe, expect, it } from "vitest";
import { calculateNutritionTargets, validateCalculatorInputs } from "../src/nutrition.js";

describe("nutrition calculator", () => {
  const base = {
    gender: "male" as const,
    ageYears: 30,
    heightCm: 180,
    weightKg: 80,
    activityLevel: "moderate" as const,
    primaryGoal: "maintain" as const,
    dietaryApproach: "balanced" as const,
  };

  it("uses Mifflin-St Jeor without body fat", () => {
    const t = calculateNutritionTargets(base);
    // 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(t.derivation.bmrFormula).toBe("mifflin_st_jeor");
    expect(t.derivation.bmr).toBe(1780);
    expect(t.derivation.tdee).toBe(Math.round(1780 * 1.55));
    expect(t.targetCalories).toBe(Math.round(1780 * 1.55));
  });

  it("uses Katch-McArdle when body fat is known", () => {
    const t = calculateNutritionTargets({ ...base, bodyFatPercent: 20 });
    // LBM = 64; BMR = 370 + 21.6*64 = 1752.4
    expect(t.derivation.bmrFormula).toBe("katch_mcardle");
    expect(t.derivation.leanBodyMassKg).toBe(64);
    expect(t.derivation.bmr).toBe(1752);
  });

  it("female Mifflin constant is −161", () => {
    const t = calculateNutritionTargets({ ...base, gender: "female" });
    expect(t.derivation.bmr).toBe(10 * 80 + 6.25 * 180 - 5 * 30 - 161);
  });

  it("applies goal adjustments (lose −20%, build +15%)", () => {
    const lose = calculateNutritionTargets({ ...base, primaryGoal: "lose_weight" });
    const build = calculateNutritionTargets({ ...base, primaryGoal: "build_muscle" });
    const maintain = calculateNutritionTargets(base);
    expect(lose.targetCalories).toBe(Math.round(maintain.derivation.tdee * 0.8));
    expect(build.targetCalories).toBe(Math.round(maintain.derivation.tdee * 1.15));
  });

  it("splits macros by approach at 4/4/9 and derives water + fiber", () => {
    const t = calculateNutritionTargets({ ...base, dietaryApproach: "high_protein" });
    expect(t.targetProteinG).toBe(Math.round((t.targetCalories * 0.4) / 4));
    expect(t.targetFatG).toBe(Math.round((t.targetCalories * 0.25) / 9));
    expect(t.targetWaterMl).toBe(2800); // 80kg * 35 = 2800, already a multiple of 50
    expect(t.targetFiberG).toBe(Math.round((t.targetCalories / 1000) * 14));
  });

  it("validates inputs with typed errors", () => {
    expect(validateCalculatorInputs({})).toContain("missing_gender");
    expect(validateCalculatorInputs({ ...base, ageYears: 12 })).toContain("invalid_age");
    expect(validateCalculatorInputs({ ...base, bodyFatPercent: 90 })).toContain("invalid_body_fat");
    expect(validateCalculatorInputs(base)).toHaveLength(0);
  });
});
