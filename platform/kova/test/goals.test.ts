/**
 * THE ARITHMETIC THAT IS WRONG IN HALF THE CASES.
 *
 * Half of all goals in a coaching product count DOWNWARDS, and the obvious
 * formula is silently backwards for every one of them.
 */

import { describe, expect, it } from "vitest";
import { daysLeft, progressOf } from "../src/goals.js";

describe("a goal that counts upwards", () => {
  it("is measured from the baseline towards the target", () => {
    expect(progressOf({ start: 60, current: 70, target: 80 })).toMatchObject({ direction: "up", done: 0.5, moved: 10, reached: false });
  });

  it("has covered nothing before anybody moves", () => {
    expect(progressOf({ start: 60, current: 60, target: 80 }).done).toBe(0);
  });

  it("reports what is left in the same units", () => {
    expect(progressOf({ start: 60, current: 70, target: 80 }).toGo).toBe(10);
  });
});

describe("a goal that counts downwards", () => {
  /*
    ⚠️ THE NAIVE `current / target` SAYS SOMEBODY AT 90 KG AIMING FOR 75 IS 120%
    DONE BEFORE THEY HAVE LOST A GRAM — and that somebody who GAINED is doing
    better. Measuring from the baseline is the only formula that reads correctly
    in both directions, and it is why a goal records where somebody started.
  */
  it("is measured the same way, and is not 120% done on day one", () => {
    const dayOne = progressOf({ start: 90, current: 90, target: 75 });
    expect(dayOne).toMatchObject({ direction: "down", done: 0, reached: false });
  });

  it("counts losing as progress", () => {
    expect(progressOf({ start: 90, current: 82.5, target: 75 }).done).toBe(0.5);
  });

  /* ⚠️ And moving the wrong way is not progress, however the sign works out. */
  it("counts gaining as none, rather than as negative progress on a bar", () => {
    const wrongWay = progressOf({ start: 90, current: 94, target: 75 });
    expect(wrongWay.done).toBe(0);
    expect(wrongWay.moved).toBe(4);
  });
});

describe("reaching it", () => {
  /*
    ⚠️ REACHED MEANS PAST IT, NOT EQUAL TO IT. Somebody aiming for 75 who gets to
    74 has reached it; an equality check leaves them at 99% for overshooting.
  */
  it("is reached on arrival and stays reached past it", () => {
    expect(progressOf({ start: 90, current: 75, target: 75 }).reached).toBe(true);
    expect(progressOf({ start: 90, current: 74, target: 75 })).toMatchObject({ reached: true, done: 1, toGo: 0 });
  });

  /*
    ⚠️ A TARGET EQUAL TO THE BASELINE IS "HOLD", not a division by zero. Keeping
    a weight is a real goal, and it is reached while somebody is still there.
  */
  it("holds a weight rather than dividing by nothing", () => {
    expect(progressOf({ start: 80, current: 80, target: 80 })).toMatchObject({ direction: "hold", reached: true, done: 1 });
    expect(progressOf({ start: 80, current: 83, target: 80 })).toMatchObject({ direction: "hold", reached: false, done: 0, toGo: 3 });
  });
});

describe("how long is left", () => {
  it("counts whole days to the date", () => {
    expect(daysLeft("2026-08-11", "2026-08-18")).toBe(7);
    expect(daysLeft("2026-08-11", "2026-08-11")).toBe(0);
  });

  /*
    ⚠️ NEGATIVE IS OVERDUE AND IS NOT CLAMPED. "0 days left" and "11 days late"
    are different things to say to somebody, and a product that clamps says the
    gentler one forever.
  */
  it("goes negative rather than resting at zero", () => {
    expect(daysLeft("2026-08-22", "2026-08-11")).toBe(-11);
  });

  it("answers nothing rather than NaN for a date it cannot read", () => {
    expect(daysLeft("2026-08-11", "soon")).toBe(0);
  });
});
