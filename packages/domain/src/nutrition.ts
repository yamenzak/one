/**
 * Nutrition target calculator (SPEC §8.2) — pure. Runs trainer-side; results
 * are persisted onto the ClientGoal and never recomputed at consumption time.
 *
 * BMR: Katch-McArdle when body-fat% is known, else Mifflin-St Jeor.
 * TDEE = BMR × activity multiplier. Calories = TDEE × goal adjustment.
 * Macros by dietary-approach split at 4/4/9 kcal/g. Water 35 ml/kg (rounded
 * to 50). Fiber 14 g / 1000 kcal. Returns a full `derivation` so the UI can
 * explain every number (ByShujaa parity).
 */

export type Gender = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "very_active";
export type PrimaryGoal = "lose_weight" | "build_muscle" | "maintain" | "improve_fitness";
export type DietaryApproach =
  | "balanced"
  | "high_protein"
  | "low_carb"
  | "keto"
  | "vegan"
  | "vegetarian";

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
};

export const GOAL_ADJUSTMENTS: Record<PrimaryGoal, number> = {
  lose_weight: -0.2,
  build_muscle: 0.15,
  maintain: 0,
  improve_fitness: 0,
};

/** % of calories as [protein, carbs, fat]. */
export const MACRO_SPLITS: Record<DietaryApproach, [number, number, number]> = {
  balanced: [0.3, 0.4, 0.3],
  high_protein: [0.4, 0.35, 0.25],
  low_carb: [0.35, 0.25, 0.4],
  keto: [0.25, 0.05, 0.7],
  vegan: [0.2, 0.55, 0.25],
  vegetarian: [0.25, 0.5, 0.25],
};

export interface CalculatorInputs {
  gender: Gender;
  /** Age in whole years (derive from DOB at the call site). */
  ageYears: number;
  heightCm: number;
  weightKg: number;
  bodyFatPercent?: number | null;
  activityLevel: ActivityLevel;
  primaryGoal: PrimaryGoal;
  dietaryApproach: DietaryApproach;
}

export interface NutritionTargets {
  targetCalories: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatG: number;
  targetFiberG: number;
  targetWaterMl: number;
  derivation: {
    bmrFormula: "katch_mcardle" | "mifflin_st_jeor";
    bmr: number;
    activityMultiplier: number;
    tdee: number;
    goalAdjustment: number;
    macroSplit: [number, number, number];
    leanBodyMassKg?: number;
  };
}

export type CalculatorError =
  | "missing_gender"
  | "missing_weight"
  | "missing_height"
  | "invalid_age"
  | "invalid_body_fat";

export function validateCalculatorInputs(i: Partial<CalculatorInputs>): CalculatorError[] {
  const errors: CalculatorError[] = [];
  if (i.gender !== "male" && i.gender !== "female") errors.push("missing_gender");
  if (!i.weightKg || i.weightKg <= 0) errors.push("missing_weight");
  if (!i.heightCm || i.heightCm <= 0) errors.push("missing_height");
  if (i.ageYears === undefined || i.ageYears < 13 || i.ageYears > 120) errors.push("invalid_age");
  if (i.bodyFatPercent != null && (i.bodyFatPercent <= 0 || i.bodyFatPercent >= 75)) {
    errors.push("invalid_body_fat");
  }
  return errors;
}

export function calculateNutritionTargets(i: CalculatorInputs): NutritionTargets {
  let bmr: number;
  let bmrFormula: NutritionTargets["derivation"]["bmrFormula"];
  let leanBodyMassKg: number | undefined;

  if (i.bodyFatPercent != null && i.bodyFatPercent > 0 && i.bodyFatPercent < 75) {
    leanBodyMassKg = i.weightKg * (1 - i.bodyFatPercent / 100);
    bmr = 370 + 21.6 * leanBodyMassKg;
    bmrFormula = "katch_mcardle";
  } else {
    bmr =
      10 * i.weightKg +
      6.25 * i.heightCm -
      5 * i.ageYears +
      (i.gender === "male" ? 5 : -161);
    bmrFormula = "mifflin_st_jeor";
  }

  const activityMultiplier = ACTIVITY_MULTIPLIERS[i.activityLevel];
  const tdee = bmr * activityMultiplier;
  const goalAdjustment = GOAL_ADJUSTMENTS[i.primaryGoal];
  const targetCalories = Math.round(tdee * (1 + goalAdjustment));

  const macroSplit = MACRO_SPLITS[i.dietaryApproach];
  const [pPct, cPct, fPct] = macroSplit;
  const targetProteinG = Math.round((targetCalories * pPct) / 4);
  const targetCarbsG = Math.round((targetCalories * cPct) / 4);
  const targetFatG = Math.round((targetCalories * fPct) / 9);

  const targetFiberG = Math.round((targetCalories / 1000) * 14);
  const targetWaterMl = Math.round((i.weightKg * 35) / 50) * 50;

  return {
    targetCalories,
    targetProteinG,
    targetCarbsG,
    targetFatG,
    targetFiberG,
    targetWaterMl,
    derivation: {
      bmrFormula,
      bmr: Math.round(bmr),
      activityMultiplier,
      tdee: Math.round(tdee),
      goalAdjustment,
      macroSplit,
      ...(leanBodyMassKg !== undefined ? { leanBodyMassKg: Math.round(leanBodyMassKg * 10) / 10 } : {}),
    },
  };
}
