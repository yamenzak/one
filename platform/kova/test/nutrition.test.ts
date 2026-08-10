/**
 * THE PURE LAYER, EXHAUSTIVELY — because it is the half of a nutrition product
 * that is wrong in ways nobody notices until somebody acts on the number.
 *
 * None of this needs a database, a request or a manifest, which is the property
 * the layer exists for.
 */

import { describe, expect, it } from "vitest";
import { NOTHING, against, energyOf, overDays, portionOf, totalOf } from "../src/nutrition.js";

const food = (over: Partial<{ per: number; protein: number; carbs: number; fat: number; fibre: number }> = {}) =>
  ({ per: 100, protein: 0, carbs: 0, fat: 0, fibre: 0, ...over });

describe("energy is derived and never stored", () => {
  it("uses Atwater's factors", () => {
    expect(energyOf({ protein: 10, carbs: 20, fat: 5, fibre: 0 })).toBe(10 * 4 + 20 * 4 + 5 * 9);
  });

  /*
    ⚠️ FIBRE AT TWO, NOT FOUR. It is a carbohydrate by measurement and mostly not
    absorbed, so counting it at four overstates every high-fibre day — and the
    person acting on that number is eating less than they think they should.
  */
  it("counts fibre at two, taken out of the carbohydrate it is part of", () => {
    const withFibre = energyOf({ protein: 0, carbs: 30, fat: 0, fibre: 10 });
    expect(withFibre).toBe((30 - 10) * 4 + 10 * 2);
    expect(withFibre).toBeLessThan(energyOf({ protein: 0, carbs: 30, fat: 0, fibre: 0 }));
  });

  it("is nothing for nothing", () => {
    expect(energyOf(NOTHING)).toBe(0);
  });
});

describe("a portion is scaled by the food's own basis", () => {
  /*
    ⚠️ THE BASIS TRAVELS WITH THE FOOD. A tin declares per 100 g and an egg
    declares per egg; assuming 100 everywhere is how a product tells somebody one
    egg was 620 calories.
  */
  it("scales from a per-100 basis", () => {
    expect(portionOf(food({ protein: 20 }), 150)).toMatchObject({ protein: 30 });
  });

  it("scales from a per-item basis", () => {
    const egg = food({ per: 1, protein: 6, fat: 5 });
    expect(portionOf(egg, 2)).toMatchObject({ protein: 12, fat: 10 });
    expect(energyOf(portionOf(egg, 1))).toBe(6 * 4 + 5 * 9);
  });

  /*
    ⚠️ A BASIS OF ZERO IS NOT A DIVISION TO ATTEMPT. `Infinity` in a macro column
    poisons every total computed from it, permanently and silently — the same
    argument the platform's number shape makes about `NaN`.
  */
  it("refuses to divide by a basis of zero", () => {
    expect(portionOf(food({ per: 0, protein: 20 }), 150)).toEqual(NOTHING);
    expect(portionOf(food({ per: -100, protein: 20 }), 150)).toEqual(NOTHING);
  });

  it("treats a portion of nothing as nothing", () => {
    expect(portionOf(food({ protein: 20 }), 0)).toEqual(NOTHING);
  });
});

describe("a day adds up", () => {
  it("sums every macro", () => {
    const total = totalOf([
      { protein: 10, carbs: 5, fat: 1, fibre: 1 },
      { protein: 20, carbs: 15, fat: 4, fibre: 2 },
    ]);
    expect(total).toEqual({ protein: 30, carbs: 20, fat: 5, fibre: 3 });
  });

  it("sums an empty day to nothing rather than to undefined", () => {
    expect(totalOf([])).toEqual(NOTHING);
  });
});

describe("how a day is going", () => {
  it("reports what is left and how full the bar is", () => {
    expect(against(120, 200)).toEqual({ eaten: 120, target: 200, left: 80, filled: 0.6 });
  });

  /*
    ⚠️ `left` IS SIGNED AND `filled` IS CLAMPED, and that is why they are two
    fields. A single number cannot say both "you are 300 over" and "draw the bar
    full", and a product that clamps the first tells somebody they are exactly on
    target while they are not.
  */
  it("says how far over, while the bar stays full", () => {
    expect(against(500, 200)).toMatchObject({ left: -300, filled: 1 });
  });

  /* No target is not a target of zero — nothing is over and nothing is filled. */
  it("says nothing at all when nothing was asked for", () => {
    expect(against(500, 0)).toEqual({ eaten: 500, target: 0, left: 0, filled: 0 });
  });
});

describe("a week is averaged over the days somebody recorded", () => {
  /*
    ⚠️ DIVIDED BY THE DAYS WITH ENTRIES, NOT BY SEVEN. Dividing by seven turns "I
    logged three days carefully" into "you ate 800 calories a day" — wrong,
    alarming, and produced by a product that mistook silence for abstinence.
  */
  it("ignores the days with nothing in them", () => {
    const week = overDays([
      { protein: 100, carbs: 200, fat: 60, fibre: 20 },
      NOTHING,
      { protein: 200, carbs: 300, fat: 80, fibre: 30 },
      NOTHING,
    ]);
    expect(week.days).toBe(2);
    expect(week.mean).toMatchObject({ protein: 150, carbs: 250, fat: 70 });
  });

  it("reports nothing, over no days, for a week with no entries", () => {
    expect(overDays([NOTHING, NOTHING])).toEqual({ mean: NOTHING, days: 0 });
  });

  /* ⚠️ The count travels with the average so a reader can see what it is worth. */
  it("carries how many days it is an average of", () => {
    expect(overDays([{ protein: 1, carbs: 0, fat: 0, fibre: 0 }]).days).toBe(1);
  });
});
