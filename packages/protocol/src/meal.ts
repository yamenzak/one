/**
 * Meal plan body schema (SPEC §8.4) — the bank-of-options model, shared by
 * plans and templates. Stored as `body_json`.
 */

import { z } from "zod";

export const BUILTIN_MEAL_TYPES = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "pre_workout",
  "post_workout",
  "free",
] as const;

export const MealFood = z.object({
  foodId: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().max(20).default("g"),
  notes: z.string().max(300).nullish(),
});
export type MealFood = z.infer<typeof MealFood>;

export const MealOption = z.object({
  /** Built-in key or a tenant custom type label-key. */
  mealType: z.string().min(1).max(40),
  mealName: z.string().max(120).default(""),
  isFree: z.boolean().default(false),
  freeMealMaxCalories: z.number().int().positive().nullish(),
  notes: z.string().max(1000).nullish(),
  foods: z.array(MealFood).default([]),
});
export type MealOption = z.infer<typeof MealOption>;

export const MealBody = z.object({
  customMealTypes: z.array(z.object({ label: z.string().min(1).max(40) })).default([]),
  mealOptions: z.array(MealOption).default([]),
});
export type MealBody = z.infer<typeof MealBody>;

/** A client's private weekly arrangement of the options bank. */
export const ArrangementSlot = z.object({
  weekday: z.number().int().min(0).max(6), // 0 = Monday
  mealType: z.string().min(1).max(40),
  /** Index into MealBody.mealOptions (options carry no ids of their own). */
  optionIndex: z.number().int().min(0),
});
export const Arrangement = z.object({
  mealPlanId: z.string().min(1),
  slots: z.array(ArrangementSlot).default([]),
});
export type Arrangement = z.infer<typeof Arrangement>;

/** Per-100g/serving macro fields carried on foods + computed on entries. */
export const Macros = z.object({
  proteinG: z.number().min(0).default(0),
  carbsG: z.number().min(0).default(0),
  fatG: z.number().min(0).default(0),
  fiberG: z.number().min(0).default(0),
  sugarG: z.number().min(0).default(0),
  sodiumMg: z.number().min(0).default(0),
});
export type Macros = z.infer<typeof Macros>;

export interface OptionMacroTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface FoodLike {
  id: string;
  servingSize: number;
  caloriesPerServing: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Live macro totals for a meal option (free meals contribute their cap). */
export function optionMacroTotals(option: MealOption, foods: Map<string, FoodLike>): OptionMacroTotals {
  if (option.isFree) {
    return { calories: option.freeMealMaxCalories ?? 0, proteinG: 0, carbsG: 0, fatG: 0 };
  }
  const t: OptionMacroTotals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const mf of option.foods) {
    const f = foods.get(mf.foodId);
    if (!f || f.servingSize <= 0) continue;
    const factor = mf.quantity / f.servingSize;
    t.calories += f.caloriesPerServing * factor;
    t.proteinG += f.proteinG * factor;
    t.carbsG += f.carbsG * factor;
    t.fatG += f.fatG * factor;
  }
  return {
    calories: Math.round(t.calories),
    proteinG: Math.round(t.proteinG * 10) / 10,
    carbsG: Math.round(t.carbsG * 10) / 10,
    fatG: Math.round(t.fatG * 10) / 10,
  };
}
