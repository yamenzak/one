/**
 * WHAT A COACH IS SHOWN, AND THE FOUR WAYS IT LIES QUIETLY.
 *
 * A heavier set called the better one. A person with no programme shown at zero
 * per cent. Somebody who joined on Tuesday listed as having gone silent. And a
 * person waiting on a reply buried under people who never wrote.
 */

import { describe, expect, it } from "vitest";
import { consistency, expectedOver } from "@one/kernel";
import {
  QUIET_DAYS, RELIABLE_REPS, bestOf, estimatedMax, needing, prescribedPerWeek, watchesFor,
} from "../src/reading.js";

const facts = (over: Partial<Parameters<typeof watchesFor>[0]> = {}) => ({
  quietFor: 0, unansweredFor: null, overdueBy: null, endingIn: null, joinedAgo: 365, ...over,
});

/* -------------------------------------------------------------- strength --- */

describe("a heavier set is not a better set", () => {
  /*
    ⚠️ 80 × 1 AND 70 × 8 ARE NOT COMPARABLE BY LOAD. A "best" that sorts on
    weight alone tells somebody their hardest session was their easiest.
  */
  it("puts different rep ranges on one axis", () => {
    expect(estimatedMax({ load: 70, reps: 8 }).value).toBeGreaterThan(estimatedMax({ load: 80, reps: 1 }).value);
  });

  /* ⚠️ One rep IS the maximum. No estimate, and no inflation of a real number. */
  it("does not inflate a single", () => {
    expect(estimatedMax({ load: 100, reps: 1 })).toEqual({ value: 100, beyond: false });
  });

  /*
    ⚠️ THE ESTIMATE DEGRADES, AND SAYS SO. Past about twelve reps the formula
    flatters high-rep work badly, and a product that stays silent claims somebody's
    twenty-rep set was a record.
  */
  it("says when the rep count is past where it is trustworthy", () => {
    expect(estimatedMax({ load: 40, reps: RELIABLE_REPS }).beyond).toBe(false);
    expect(estimatedMax({ load: 40, reps: RELIABLE_REPS + 1 }).beyond).toBe(true);
  });

  it("treats a set of nothing as nothing rather than dividing", () => {
    expect(estimatedMax({ load: 0, reps: 5 }).value).toBe(0);
    expect(estimatedMax({ load: 100, reps: 0 }).value).toBe(0);
  });
});

describe("the best set of a group", () => {
  /*
    ⚠️ IT RETURNS THE SET, NOT THE ESTIMATE. A coach wants "100 × 5", which is
    what happened — showing the estimate instead tells somebody they lifted a
    number they never touched.
  */
  it("returns what actually happened, chosen by what it was worth", () => {
    const best = bestOf([{ load: 100, reps: 5 }, { load: 110, reps: 1 }, { load: 90, reps: 3 }])!;
    expect(best.of).toEqual({ load: 100, reps: 5 });
    expect(best.estimate.value).toBeGreaterThan(110);
  });

  it("ignores sets that were never done", () => {
    expect(bestOf([{ load: 0, reps: 0 }, { load: 60, reps: 5 }])!.of).toEqual({ load: 60, reps: 5 });
  });

  it("has no best when there is nothing", () => {
    expect(bestOf([])).toBeNull();
    expect(bestOf([{ load: 0, reps: 3 }])).toBeNull();
  });
});

/* ----------------------------------------------------------- consistency --- */

describe("how much of what was asked for happened", () => {
  it("reports a fraction of what was expected", () => {
    expect(consistency(3, 4)).toEqual({ done: 3, expected: 4, ratio: 0.75 });
  });

  /*
    ⚠️ NOTHING EXPECTED IS NOT ZERO PER CENT. A person with no programme has not
    failed to follow one, and showing them at 0% accuses somebody of missing
    sessions nobody prescribed.
  */
  it("says nothing at all when nothing was asked for", () => {
    expect(consistency(0, 0).ratio).toBeNull();
    expect(consistency(5, 0).ratio).toBeNull();
  });

  it("does not go past full when somebody did extra", () => {
    expect(consistency(6, 4).ratio).toBe(1);
  });
});

describe("how much a programme actually asks for", () => {
  const week = (days: number) => ({ days: Array.from({ length: days }, () => ({ movements: [{}] })) });

  it("counts the days that have anything in them", () => {
    expect(prescribedPerWeek([week(4)])).toBe(4);
    expect(prescribedPerWeek([{ days: [{ movements: [{}] }, { movements: [] }, {}] }])).toBe(1);
  });

  /*
    ⚠️ AVERAGED ACROSS THE WEEKS, NOT TAKEN FROM THE FIRST. A four-week block
    that deloads asks for less than its first week does, and measuring against
    week one tells somebody they fell behind by following the plan.
  */
  it("averages across the block rather than reading week one", () => {
    expect(prescribedPerWeek([week(4), week(4), week(4), week(2)])).toBe(3.5);
  });

  /*
    ⚠️ A BODY IT CANNOT READ ASKS FOR NOTHING, NEVER FOR NOUGHT. Zero would flow
    into a consistency figure as 0%, which accuses somebody of missing sessions
    that a parsing failure invented.
  */
  it("says nothing rather than zero when it cannot tell", () => {
    expect(prescribedPerWeek(null)).toBeNull();
    expect(prescribedPerWeek([])).toBeNull();
    expect(prescribedPerWeek([{ days: [] }])).toBeNull();
    expect(prescribedPerWeek([{ notWeeks: true }])).toBeNull();
    expect(consistency(0, expectedOver(prescribedPerWeek(null), 28)).ratio).toBeNull();
  });

  it("scales to the window being asked about", () => {
    expect(expectedOver(4, 28)).toBe(16);
    expect(expectedOver(4, 7)).toBe(4);
    expect(expectedOver(null, 28)).toBe(0);
    expect(expectedOver(4, 0)).toBe(0);
  });
});

/* ------------------------------------------------------------- attention --- */

describe("why somebody needs a coach today", () => {
  /*
    ⚠️ A NEW PERSON IS NOT A QUIET PERSON. Somebody who joined on Tuesday has not
    gone silent by Thursday, and a list that says they have teaches a coach to
    ignore it — which costs the one person who really has stopped.
  */
  it("does not call a new arrival quiet", () => {
    expect(watchesFor(facts({ quietFor: 30, joinedAgo: 3 }))).toEqual([]);
    expect(watchesFor(facts({ quietFor: 30, joinedAgo: 30 })).map((w) => w.reason)).toEqual(["quiet"]);
  });

  it("waits for silence to mean something before mentioning it", () => {
    expect(watchesFor(facts({ quietFor: QUIET_DAYS - 1 }))).toEqual([]);
    expect(watchesFor(facts({ quietFor: QUIET_DAYS })).map((w) => w.reason)).toEqual(["quiet"]);
  });

  /*
    ⚠️ SOMEBODY WAITING ON US COMES FIRST. A person who reached out and got
    nothing back is the most urgent name on a coach's list — more urgent than
    somebody who simply went quiet, because one of them is waiting on us.
  */
  it("puts an unanswered check-in above everything else", () => {
    const all = watchesFor(facts({ unansweredFor: 2, overdueBy: 40, quietFor: 40, endingIn: 1 }));
    expect(all.map((w) => w.reason)).toEqual(["unanswered", "overdue", "quiet", "ending"]);
  });

  it("mentions access running out only when it is close", () => {
    expect(watchesFor(facts({ endingIn: 30 }))).toEqual([]);
    expect(watchesFor(facts({ endingIn: 3 })).map((w) => w.reason)).toEqual(["ending"]);
  });
});

describe("the roster, narrowed to who needs something", () => {
  it("leaves out everybody who is fine", () => {
    const out = needing([
      { who: "fine", facts: facts() },
      { who: "waiting", facts: facts({ unansweredFor: 3 }) },
    ]);
    expect(out.map((n) => n.who)).toEqual(["waiting"]);
  });

  /*
    ⚠️ ORDERED BY THE WORST REASON, NOT BY HOW MANY. Somebody with one unanswered
    check-in comes before somebody with three mild ones — a count sorts by volume,
    and volume is not urgency.
  */
  it("orders by the worst reason rather than by the number of them", () => {
    const out = needing([
      { who: "three-mild", facts: facts({ quietFor: 40, overdueBy: 5, endingIn: 2 }) },
      { who: "one-urgent", facts: facts({ unansweredFor: 1 }) },
    ]);
    expect(out.map((n) => n.who)).toEqual(["one-urgent", "three-mild"]);
  });

  it("breaks a tie on how long it has been true", () => {
    const out = needing([
      { who: "yesterday", facts: facts({ unansweredFor: 1 }) },
      { who: "a-fortnight", facts: facts({ unansweredFor: 14 }) },
    ]);
    expect(out.map((n) => n.who)).toEqual(["a-fortnight", "yesterday"]);
  });
});
