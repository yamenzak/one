import { describe, expect, it } from "vitest";
import { calculateNutritionTargets, validateCalculatorInputs, scaleFood, servingsToQuantity } from "../src/nutrition.js";

describe("portion scaling", () => {
  const food = { servingSize: 100, calories: 200, proteinG: 20, carbsG: 10, fatG: 8 };
  it("scales macros by quantity / serving size", () => {
    expect(scaleFood(food, 100)).toEqual({ calories: 200, proteinG: 20, carbsG: 10, fatG: 8 });
    expect(scaleFood(food, 50)).toEqual({ calories: 100, proteinG: 10, carbsG: 5, fatG: 4 });
    expect(scaleFood(food, 250)).toEqual({ calories: 500, proteinG: 50, carbsG: 25, fatG: 20 });
  });
  it("rounds calories to whole and macros to 0.1g", () => {
    expect(scaleFood({ servingSize: 100, calories: 233, proteinG: 2.5, carbsG: 10, fatG: 4 }, 150))
      .toEqual({ calories: 350, proteinG: 3.8, carbsG: 15, fatG: 6 });
  });
  it("yields zeroes (never NaN) for a non-positive serving size", () => {
    expect(scaleFood({ servingSize: 0, calories: 200, proteinG: 20, carbsG: 10, fatG: 8 }, 100))
      .toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });
  it("converts serving multipliers to a gram quantity", () => {
    expect(servingsToQuantity(30, 2)).toBe(60);
    expect(servingsToQuantity(100, 0.5)).toBe(50);
  });
});

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
