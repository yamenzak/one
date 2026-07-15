/**
 * Body composition math (SPEC §8.2) — pure. BMI + BMR are recomputed every time
 * a weight / body-fat entry lands (the API stores the snapshot on the
 * measurement), so the coach always reads a live basal rate and the system can
 * detect when a goal has gone stale (the body has drifted far enough from the
 * numbers the goal was built on that its macro targets no longer fit).
 *
 * BMR here is the SAME derivation the nutrition calculator uses — Katch-McArdle
 * when body-fat% is known, else Mifflin-St Jeor — extracted so both paths agree.
 */

import type { ActivityLevel, DietaryApproach, Gender, PrimaryGoal } from "./nutrition.js";

/** Human labels for the preference enums — shared by client settings + coach. */
export const PRIMARY_GOAL_LABELS: Record<PrimaryGoal, string> = {
  lose_weight: "Lose weight",
  build_muscle: "Build muscle",
  maintain: "Maintain",
  improve_fitness: "Improve fitness",
};
export const ACTIVITY_LEVEL_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary",
  light: "Lightly active",
  moderate: "Moderately active",
  very_active: "Very active",
};
export const DIETARY_APPROACH_LABELS: Record<DietaryApproach, string> = {
  balanced: "Balanced",
  high_protein: "High protein",
  low_carb: "Low carb",
  keto: "Keto",
  vegan: "Vegan",
  vegetarian: "Vegetarian",
};

export type BmrFormula = "katch_mcardle" | "mifflin_st_jeor";
export type BmiCategory = "underweight" | "normal" | "overweight" | "obese";

/** Basal metabolic rate (kcal/day) + which formula produced it. Returns null
 *  when a required input is missing or out of range — the caller decides what to
 *  show ("add your height to see your BMR"). */
export function calculateBMR(i: {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  gender: Gender;
  bodyFatPercent?: number | null;
}): { bmr: number; formula: BmrFormula; leanBodyMassKg?: number } | null {
  if (!(i.weightKg > 0) || !(i.heightCm > 0) || !(i.ageYears > 0)) return null;
  if (i.bodyFatPercent != null && i.bodyFatPercent > 0 && i.bodyFatPercent < 75) {
    const leanBodyMassKg = i.weightKg * (1 - i.bodyFatPercent / 100);
    return { bmr: Math.round(370 + 21.6 * leanBodyMassKg), formula: "katch_mcardle", leanBodyMassKg: Math.round(leanBodyMassKg * 10) / 10 };
  }
  const bmr = 10 * i.weightKg + 6.25 * i.heightCm - 5 * i.ageYears + (i.gender === "male" ? 5 : -161);
  return { bmr: Math.round(bmr), formula: "mifflin_st_jeor" };
}

/** Body-mass index (kg/m²), one decimal. Null unless both inputs are positive. */
export function calculateBMI(weightKg: number, heightCm: number): number | null {
  if (!(weightKg > 0) || !(heightCm > 0)) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

/** WHO adult BMI bands. */
export function classifyBMI(bmi: number): BmiCategory {
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "normal";
  if (bmi < 30) return "overweight";
  return "obese";
}

export const BMI_CATEGORY_LABELS: Record<BmiCategory, string> = {
  underweight: "Underweight",
  normal: "Healthy",
  overweight: "Overweight",
  obese: "Obese",
};

/** Age in whole years from an ISO date-of-birth (YYYY-MM-DD), at `on` (default
 *  today). Null when DOB is absent/unparseable. Kept here so BMR callers derive
 *  age the same way everywhere. */
export function ageFromDob(dob: string | null | undefined, on: Date = new Date()): number | null {
  if (!dob) return null;
  const d = new Date(`${dob}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  let age = on.getFullYear() - d.getFullYear();
  const m = on.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

/**
 * Whether an active goal has gone stale relative to the body it was built for.
 * A goal is stale when the client's current weight (or basal rate) has moved
 * far enough from the snapshot the goal was calculated with that its macro
 * targets are no longer trustworthy — the coach should recalculate.
 *
 * Thresholds: >4 kg (or >5%) weight drift, or >6% BMR drift. Returns the deltas
 * so the UI can explain *why* ("−5.2 kg since this goal — recalculate").
 */
export function goalStaleness(i: {
  goalWeightKg?: number | null;
  currentWeightKg?: number | null;
  goalBmr?: number | null;
  currentBmr?: number | null;
}): { stale: boolean; weightDeltaKg: number | null; weightDeltaPct: number | null; bmrDeltaPct: number | null; reason: string | null } {
  let weightDeltaKg: number | null = null;
  let weightDeltaPct: number | null = null;
  let bmrDeltaPct: number | null = null;

  if (i.goalWeightKg != null && i.goalWeightKg > 0 && i.currentWeightKg != null && i.currentWeightKg > 0) {
    weightDeltaKg = Math.round((i.currentWeightKg - i.goalWeightKg) * 10) / 10;
    weightDeltaPct = Math.round((weightDeltaKg / i.goalWeightKg) * 1000) / 10;
  }
  if (i.goalBmr != null && i.goalBmr > 0 && i.currentBmr != null && i.currentBmr > 0) {
    bmrDeltaPct = Math.round(((i.currentBmr - i.goalBmr) / i.goalBmr) * 1000) / 10;
  }

  const bigWeight = weightDeltaKg != null && (Math.abs(weightDeltaKg) >= 4 || (weightDeltaPct != null && Math.abs(weightDeltaPct) >= 5));
  const bigBmr = bmrDeltaPct != null && Math.abs(bmrDeltaPct) >= 6;
  const stale = bigWeight || bigBmr;

  let reason: string | null = null;
  if (stale && weightDeltaKg != null && bigWeight) {
    reason = `${weightDeltaKg > 0 ? "+" : ""}${weightDeltaKg} kg since this goal was set — its targets may no longer fit.`;
  } else if (stale && bmrDeltaPct != null) {
    reason = `Basal rate shifted ${bmrDeltaPct > 0 ? "+" : ""}${bmrDeltaPct}% — consider recalculating.`;
  }
  return { stale, weightDeltaKg, weightDeltaPct, bmrDeltaPct, reason };
}

// ── Client preferences (the settings-managed profile) ───────────────────────

export type WorkoutLocation = "home" | "gym" | "hybrid" | "outdoor";

export const WORKOUT_LOCATION_LABELS: Record<WorkoutLocation, string> = {
  home: "Home",
  gym: "Gym",
  hybrid: "Hybrid",
  outdoor: "Outdoor",
};

/** The preference bundle stored on the client (metric; display-converted in UI). */
export interface ClientPreferences {
  targetWeightKg?: number | null;
  workoutsPerWeek?: number | null;
  mealsPerDay?: number | null;
  workoutLocation?: WorkoutLocation | null;
  primaryGoal?: import("./nutrition.js").PrimaryGoal | null;
  activityLevel?: import("./nutrition.js").ActivityLevel | null;
  dietaryApproach?: import("./nutrition.js").DietaryApproach | null;
  limitations?: string | null;
}

/**
 * Which profile fields still need filling for the client to have a coachable
 * profile (drives the Today "complete your profile" prompt). Height/gender/DOB
 * live on the client row; the rest on preferences. Weight is logged, not a
 * preference, so it's excluded here.
 */
export function profileGaps(i: {
  gender?: string | null;
  dateOfBirth?: string | null;
  heightCm?: number | null;
  prefs?: ClientPreferences | null;
}): string[] {
  const p = i.prefs ?? {};
  const gaps: string[] = [];
  if (!i.gender) gaps.push("gender");
  if (!i.dateOfBirth) gaps.push("dateOfBirth");
  if (!(i.heightCm && i.heightCm > 0)) gaps.push("height");
  if (!(p.targetWeightKg && p.targetWeightKg > 0)) gaps.push("targetWeight");
  if (!p.primaryGoal) gaps.push("goal");
  if (!p.activityLevel) gaps.push("activityLevel");
  if (!(p.workoutsPerWeek && p.workoutsPerWeek > 0)) gaps.push("workoutsPerWeek");
  if (!(p.mealsPerDay && p.mealsPerDay > 0)) gaps.push("mealsPerDay");
  if (!p.workoutLocation) gaps.push("workoutLocation");
  return gaps;
}
