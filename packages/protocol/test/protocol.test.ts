import { describe, expect, it } from "vitest";
import {
  fixedOptionFor,
  MealBody,
  mealTypesIn,
  multiExerciseSingleBlocks,
  normalizeEquipment,
  normalizeMuscle,
  optionMacroTotals,
  prescribedSetsForDay,
  splitSingleBlocks,
  stripBodyForTemplate,
  WorkoutBody,
  type ExerciseSlot,
  type FoodLike,
  type WorkoutBlock,
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

describe("a `single` block holds one exercise", () => {
  const slot = (id: string): ExerciseSlot => ({ exerciseId: id, measurementMode: "reps", sets: [{ setType: "working", weightMode: "unspecified", reps: 10 }] });
  const body = (blocks: WorkoutBlock[]): WorkoutBody => ({ days: [{ name: "A", isRestDay: false, blocks }] });

  it("splits a multi-exercise single block into one block each, in order", () => {
    const { body: out, changed } = splitSingleBlocks(body([{ type: "single", slots: [slot("a"), slot("b"), slot("c")] }]));
    expect(changed).toBe(1);
    expect(out.days[0]!.blocks).toHaveLength(3);
    expect(out.days[0]!.blocks.map((b) => b.slots[0]!.exerciseId)).toEqual(["a", "b", "c"]);
    expect(out.days[0]!.blocks.every((b) => b.type === "single" && b.slots.length === 1)).toBe(true);
  });

  it("leaves supersets, circuits and HIIT alone — several slots is the point", () => {
    for (const type of ["superset", "circuit", "hiit"] as const) {
      const { body: out, changed } = splitSingleBlocks(body([{ type, rounds: 3, slots: [slot("a"), slot("b")] }]));
      expect(changed).toBe(0);
      expect(out.days[0]!.blocks).toHaveLength(1);
      expect(out.days[0]!.blocks[0]!.slots).toHaveLength(2);
    }
  });

  it("is a no-op on a body that already conforms, and says so", () => {
    const input = body([{ type: "single", slots: [slot("a")] }, { type: "superset", slots: [slot("b"), slot("c")] }]);
    const { body: out, changed } = splitSingleBlocks(input);
    expect(changed).toBe(0);
    expect(out).toEqual(input);
  });

  it("carries the block's own settings onto every piece", () => {
    const { body: out } = splitSingleBlocks(body([{ type: "single", restAfterBlockSec: 120, blockNotes: "slow", slots: [slot("a"), slot("b")] }]));
    expect(out.days[0]!.blocks.map((b) => b.restAfterBlockSec)).toEqual([120, 120]);
    expect(out.days[0]!.blocks.map((b) => b.blockNotes)).toEqual(["slow", "slow"]);
  });

  it("does not change what the day PRESCRIBES — the split is presentational", () => {
    const input = body([{ type: "single", slots: [slot("a"), slot("b"), slot("c")] }]);
    expect(prescribedSetsForDay(splitSingleBlocks(input).body.days[0]!)).toBe(prescribedSetsForDay(input.days[0]!));
  });

  it("counts what needs splitting without splitting it", () => {
    expect(multiExerciseSingleBlocks(body([{ type: "single", slots: [slot("a"), slot("b")] }, { type: "single", slots: [slot("c")] }]))).toBe(1);
  });
});

describe("a meal plan is a bank of options or a prescription", () => {
  it("defaults to options, so every plan written before the mode existed keeps its meaning", () => {
    const parsed = MealBody.parse({ mealOptions: [] });
    expect(parsed.mode).toBe("options");
  });

  it("round-trips a fixed plan", () => {
    expect(MealBody.parse({ mode: "fixed", mealOptions: [] }).mode).toBe("fixed");
  });

  it("reads the ONE option a fixed meal prescribes, and ignores a stray second", () => {
    const b = MealBody.parse({
      mode: "fixed",
      mealOptions: [
        { mealType: "lunch", mealName: "Chicken & rice", foods: [] },
        { mealType: "lunch", mealName: "left over from options mode", foods: [] },
      ],
    });
    expect(fixedOptionFor(b, "lunch")?.mealName).toBe("Chicken & rice");
    expect(fixedOptionFor(b, "dinner")).toBeUndefined();
  });

  it("lists the meals a body prescribes, in the caller's order", () => {
    const b = MealBody.parse({ mealOptions: [{ mealType: "dinner", foods: [] }, { mealType: "breakfast", foods: [] }] });
    expect(mealTypesIn(b, ["breakfast", "lunch", "dinner"])).toEqual(["breakfast", "dinner"]);
  });
});
