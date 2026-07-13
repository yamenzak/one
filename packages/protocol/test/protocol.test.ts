import { describe, expect, it } from "vitest";
import {
  MealBody,
  normalizeEquipment,
  normalizeMuscle,
  optionMacroTotals,
  prescribedSetsForDay,
  stripBodyForTemplate,
  WorkoutBody,
  type FoodLike,
} from "../src/index.js";

describe("taxonomy normalization (AI auto-fill tolerance)", () => {
  it("folds anatomical + plural + synonym muscle names onto slugs", () => {
    expect(normalizeMuscle("Quadriceps")).toBe("quads");
    expect(normalizeMuscle("gluteus maximus")).toBe("glutes");
    expect(normalizeMuscle("pecs")).toBe("chest");
    expect(normalizeMuscle("deltoids")).toBe("shoulders");
    expect(normalizeMuscle("rear deltoid")).toBe("rear delts");
    expect(normalizeMuscle("latissimus dorsi")).toBe("lats");
    expect(normalizeMuscle("core")).toBe("abs");
    expect(normalizeMuscle("hamstring")).toBe("hamstrings");
    expect(normalizeMuscle("calf")).toBe("calves");
    expect(normalizeMuscle("quads")).toBe("quads"); // already-canonical passes through
    expect(normalizeMuscle("banana")).toBeNull();
  });

  it("folds equipment synonyms onto slugs", () => {
    expect(normalizeEquipment("body weight")).toBe("bodyweight");
    expect(normalizeEquipment("dumbbells")).toBe("dumbbell");
    expect(normalizeEquipment("resistance bands")).toBe("resistance band");
    expect(normalizeEquipment("EZ curl bar")).toBe("ez bar");
    expect(normalizeEquipment("chin-up bar")).toBe("pull-up bar");
    expect(normalizeEquipment("cable")).toBe("cable");
    expect(normalizeEquipment("spaceship")).toBeNull();
  });
});

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
