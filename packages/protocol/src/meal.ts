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
  /** AI-generated plated-meal photo (subtly branded) — the option card's hero. */
  imageUrl: z.string().max(400).nullish(),
  foods: z.array(MealFood).default([]),
});
export type MealOption = z.infer<typeof MealOption>;

/**
 * WHAT KIND OF MEAL PLAN THIS IS.
 *
 *   options  a BANK the client picks from — two or three lunches, choose one.
 *            The original model, and the default: every plan written before
 *            this field existed is one, and an absent value must keep meaning
 *            exactly what it meant.
 *   fixed    a PRESCRIPTION — breakfast IS this, lunch IS this. One option per
 *            meal, no choosing.
 *
 * Deliberately a mode on the SAME body rather than a second schema. A plan is
 * the same thing either way — meals, each with foods and portions — and the
 * difference is whether the client gets to choose. Two schemas would have
 * duplicated the macro math, the shopping list, the history sheet and the
 * template store, and would have made switching a plan from one to the other a
 * migration instead of a toggle.
 *
 * `fixed` is a CONSTRAINT, not a different shape: at most one option per meal
 * type. Nothing enforces that in the schema, because a plan that briefly holds
 * two while a coach is switching modes must still load rather than 400 — the
 * builder holds the invariant, and readers take the first.
 */
export const MealPlanMode = z.enum(["options", "fixed"]);
export type MealPlanMode = z.infer<typeof MealPlanMode>;

export const MealBody = z.object({
  mode: MealPlanMode.default("options"),
  customMealTypes: z.array(z.object({ label: z.string().min(1).max(40) })).default([]),
  /** Built-in meal types the coach removed from THIS plan (e.g. "pre_workout").
   *  Built-ins render by default; listing one here hides it. Custom types are
   *  removed by dropping them from customMealTypes instead. */
  hiddenMealTypes: z.array(z.string().max(40)).default([]),
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

/** The one option the client eats for this meal in a `fixed` plan — the first,
 *  because that is the invariant the builder keeps and the only sane reading of
 *  a plan that momentarily holds two. */
export function fixedOptionFor(body: MealBody, mealType: string): MealOption | undefined {
  return body.mealOptions.find((o) => o.mealType === mealType);
}

/** Meal types this body actually prescribes, in the caller's preferred order. */
export function mealTypesIn(body: MealBody, order: readonly string[]): string[] {
  const present = new Set(body.mealOptions.map((o) => o.mealType));
  return order.filter((t) => present.has(t));
}
