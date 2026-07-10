import { describe, expect, it } from "vitest";
import {
  MealBody,
  optionMacroTotals,
  prescribedSetsForDay,
  stripBodyForTemplate,
  WorkoutBody,
  type FoodLike,
} from "../src/index.js";

describe("workout body schema", () => {
  const body = WorkoutBody.parse({
    days: [
      {
        name: "Push A",
        blocks: [
          {
            type: "single",
            slots: [{ exerciseId: "bench", sets: [{}, {}, {}] }],
          },
          {
            type: "superset",
            rounds: 3,
            slots: [
              { exerciseId: "curl", sets: [{}] },
              { exerciseId: "ext", sets: [{}] },
            ],
          },
        ],
      },
    ],
  });

  it("counts prescribed sets with group rounds", () => {
    // single: 3 sets; superset: 2 slots × 1 set × 3 rounds = 6 -> 9
    expect(prescribedSetsForDay(body.days[0]!)).toBe(9);
  });

  it("template export strips absolute + dropset weights, keeps progressions", () => {
    const withWeights = WorkoutBody.parse({
      days: [
        {
          blocks: [
            {
              slots: [
                {
                  exerciseId: "squat",
                  sets: [
                    { weightMode: "absolute", weightValue: 120 },
                    { weightMode: "percent_1rm", percent1rm: 80 },
                    { weightMode: "dropset", weightValue: 100 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const stripped = stripBodyForTemplate(withWeights);
    const sets = stripped.days[0]!.blocks[0]!.slots[0]!.sets;
    expect(sets[0]).toMatchObject({ weightMode: "unspecified", weightValue: null });
    expect(sets[1]).toMatchObject({ weightMode: "percent_1rm", percent1rm: 80 });
    expect(sets[2]).toMatchObject({ weightMode: "unspecified", weightValue: null });
  });

  it("rejects more than 7 days", () => {
    expect(() => WorkoutBody.parse({ days: Array.from({ length: 8 }, () => ({})) })).toThrow();
  });
});

describe("meal body schema", () => {
  const foods = new Map<string, FoodLike>([
    ["rice", { id: "rice", servingSize: 100, caloriesPerServing: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 }],
    ["chicken", { id: "chicken", servingSize: 100, caloriesPerServing: 165, proteinG: 31, carbsG: 0, fatG: 3.6 }],
  ]);

  it("computes live option macros scaled by quantity/servingSize", () => {
    const body = MealBody.parse({
      mealOptions: [
        {
          mealType: "lunch",
          mealName: "Chicken & rice",
          foods: [
            { foodId: "rice", quantity: 200 },
            { foodId: "chicken", quantity: 150 },
          ],
        },
      ],
    });
    const t = optionMacroTotals(body.mealOptions[0]!, foods);
    expect(t.calories).toBe(Math.round(130 * 2 + 165 * 1.5));
    expect(t.proteinG).toBeCloseTo(2.7 * 2 + 31 * 1.5, 1);
  });

  it("free meals contribute their calorie cap and zero macros", () => {
    const body = MealBody.parse({
      mealOptions: [{ mealType: "free", isFree: true, freeMealMaxCalories: 600 }],
    });
    expect(optionMacroTotals(body.mealOptions[0]!, foods)).toEqual({
      calories: 600,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
    });
  });
});
