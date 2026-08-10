/**
 * COPYING A WEEK, AND WHAT A GROUP MEANS.
 *
 * ⚠️ PURE, SO THE ARITHMETIC IS THE PART UNDER TEST rather than the route around
 * it. A progression that is wrong by one rep is wrong in every week of every
 * block a studio ever writes, and it is not the kind of wrong anybody notices
 * from a screen.
 */

import { describe, expect, it } from "vitest";
import { progressWeek, roundsOf, weekAt, type Week } from "../src/plans.js";

const week: Week = {
  days: [{
    name: "Lower",
    movements: [
      { movement: "squat", sets: 3, reps: 5, load: 100 },
      { movement: "hinge", sets: 3, reps: 8 },
      { movement: "carry", note: "as far as feels right" },
    ],
  }],
};

describe("repeating a week", () => {
  it("moves the load by a percentage and the reps by a count", () => {
    const next = progressWeek(week, { loadPercent: 2.5, repsAdded: 1 });
    const [squat, hinge] = next.days![0]!.movements!;
    expect(squat).toMatchObject({ load: 102.5, reps: 6 });
    expect(hinge).toMatchObject({ reps: 9 });
  });

  /*
    ⚠️ ONLY WHAT WAS PRESCRIBED MOVES. Inventing a load from a percentage of
    nothing puts a number in front of somebody who was told to judge it by feel.
  */
  it("adds nothing to what was not there", () => {
    const next = progressWeek(week, { loadPercent: 10, repsAdded: 2 });
    expect(next.days![0]!.movements![1]).not.toHaveProperty("load");
    expect(next.days![0]!.movements![2]).not.toHaveProperty("reps");
    expect(next.days![0]!.movements![2]!.note).toBe("as far as feels right");
  });

  /*
    ⚠️ AND A LOAD IS ROUNDED TO SOMETHING LOADABLE. 62.4 kg is not a weight
    anybody can put on a bar, and a plan full of them reads as a machine's output
    rather than a coach's.
  */
  it("rounds to something that can go on a bar", () => {
    const next = progressWeek({ days: [{ movements: [{ movement: "squat", load: 60 }] }] }, { loadPercent: 4 });
    expect(next.days![0]!.movements![0]!.load).toBe(62.5);
  });

  it("never takes reps below one", () => {
    const next = progressWeek(week, { repsAdded: -20 });
    expect(next.days![0]!.movements![0]!.reps).toBe(1);
  });

  it("copies a week unchanged when nothing was asked for", () => {
    expect(progressWeek(week, {})).toEqual(week);
  });

  /*
    ⚠️ ONE-BASED, because that is what a coach says. Off by one is a week copied
    from the wrong place, which reads as correct until the block does not build.
  */
  it("counts weeks the way people do", () => {
    const weeks = [{ days: [{ name: "one" }] }, { days: [{ name: "two" }] }];
    expect(weekAt(weeks, 1)!.days![0]!.name).toBe("one");
    expect(weekAt(weeks, 2)!.days![0]!.name).toBe("two");
    expect(weekAt(weeks, 3)).toBeNull();
    expect(weekAt(weeks, 0)).toBeNull();
  });
});

/* --------------------------------------------------------------- rounds --- */

describe("what a group means", () => {
  /*
    ⚠️ AN ITEM WITH NO GROUP IS ITS OWN ROUND. A day of ordinary sets and a day
    of supersets are then the same shape to whatever logs them, which is what
    stops the player having two modes.
  */
  it("makes an ungrouped day one round per movement, in order", () => {
    expect(roundsOf(week.days![0]!).map((r) => r.map((i) => i.movement))).toEqual([["squat"], ["hinge"], ["carry"]]);
  });

  it("puts a superset together, where it was written", () => {
    const day = {
      movements: [
        { movement: "bench", group: "A" },
        { movement: "row", group: "A" },
        { movement: "curl" },
      ],
    };
    expect(roundsOf(day).map((r) => r.map((i) => i.movement))).toEqual([["bench", "row"], ["curl"]]);
  });

  /*
    ⚠️ AND A GROUP KEEPS ITS PLACE RATHER THAN MOVING TO THE END. A circuit
    written between two other movements is done between them; reordering it would
    change a session a coach designed.
  */
  it("keeps a group where it was written, not where it finished", () => {
    const day = {
      movements: [
        { movement: "squat" },
        { movement: "bench", group: "A" },
        { movement: "curl" },
        { movement: "row", group: "A" },
      ],
    };
    expect(roundsOf(day).map((r) => r.map((i) => i.movement))).toEqual([["squat"], ["bench", "row"], ["curl"]]);
  });
});
