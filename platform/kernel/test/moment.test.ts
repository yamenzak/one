/**
 * PUNCTUATION, AND THE THREE WAYS A PRODUCT SPENDS IT UNTIL IT IS WORTHLESS.
 *
 * Celebrating every save. Celebrating on an operation that can run all day.
 * Playing a chime over somebody's lost work. None of the three is a bug anybody
 * can point at — each is one reasonable declaration, and the result is an
 * interface that is pleased with itself and says nothing.
 */

import { describe, expect, it } from "vitest";
import { MOMENTS, OUTCOME_MESSAGE_MAX, SOUND_OF, momentProblems, strongest } from "../src/index.js";

/* ------------------------------------------------------- the vocabulary --- */

describe("the vocabulary is four words and a derived sound", () => {
  it("gives every moment exactly one sound", () => {
    expect(Object.keys(SOUND_OF).sort()).toEqual([...MOMENTS].sort());
    expect(new Set(Object.values(SOUND_OF)).size).toBe(MOMENTS.length);
  });

  /*
    ⚠️ A MOMENT NEVER REPORTS A FAILURE. A failure is a `Problem` — a code, copy,
    a status and a way out. Dressing one in this vocabulary is how a product ends
    up playing a chime over somebody's lost work, so the two sounds that mean
    "something went wrong" are unreachable from here by construction.
  */
  it("cannot reach the sounds that mean something went wrong", () => {
    expect(Object.values(SOUND_OF)).not.toContain("error");
    expect(Object.values(SOUND_OF)).not.toContain("alert");
  });
});

/* ---------------------------------------------------------- one at once --- */

describe("one moment at a time, and the heavier wins", () => {
  it("prefers a celebration over an acknowledgement, in either order", () => {
    expect(strongest("acknowledge", "celebrate")).toBe("celebrate");
    expect(strongest("celebrate", "acknowledge")).toBe("celebrate");
  });

  it("passes the only one through when there is only one", () => {
    expect(strongest(undefined, "welcome")).toBe("welcome");
    expect(strongest("welcome", undefined)).toBe("welcome");
    expect(strongest(undefined, undefined)).toBeUndefined();
  });

  /*
    ⚠️ WEIGHT IS THE DECLARED ORDER, not a second table to keep in step. A
    separate rank map is a thing somebody adds a moment to and forgets.
  */
  it("orders by the declaration, so a new moment cannot be unranked", () => {
    for (let i = 1; i < MOMENTS.length; i++) {
      expect(strongest(MOMENTS[i - 1], MOMENTS[i])).toBe(MOMENTS[i]);
    }
  });
});

/* ------------------------------------------------------------- the check --- */

describe("what an app may not say about its own punctuation", () => {
  const problems = (outcome: Record<string, unknown>) =>
    momentProblems([{ id: "thing.save", outcome: outcome as never }]).map((p) => p.why).join("; ");

  it("accepts an ordinary acknowledgement", () => {
    expect(problems({ message: "Saved", tone: "success", moment: "acknowledge" })).toBe("");
  });

  it("accepts an outcome with no moment at all, which is most of them", () => {
    expect(problems({ message: "Saved", tone: "success" })).toBe("");
  });

  /*
    ⚠️ `celebrate` IS NOT AN APP'S TO DECLARE. A celebration belongs to a
    milestone — a rule over an event, earned once per person for the rest of
    their account. An operation that can celebrate on every call is the
    leaderboard problem arriving through a different door, and the first one
    written would be on whatever the product most wants people to do.
  */
  it("refuses an operation that celebrates", () => {
    expect(problems({ message: "Done", tone: "success", moment: "celebrate" })).toMatch(/milestone/);
  });

  /*
    ⚠️ A MOMENT ON A `danger` TONE IS A CHIME OVER SOMEBODY'S LOST WORK. The tone
    already says this is the destructive one; punctuating it is the product being
    pleased about it.
  */
  it("refuses punctuation on a danger outcome", () => {
    expect(problems({ message: "Deleted", tone: "danger", moment: "acknowledge" })).toMatch(/danger/);
  });

  /*
    ⚠️ AN OUTCOME IS ONE LINE, AND IT NOW TRAVELS IN A HEADER. A paragraph is
    silently truncated by an intermediary — copy that stops mid-sentence in
    production and is complete in every test.
  */
  it("refuses a message longer than one line", () => {
    expect(problems({ message: "x".repeat(OUTCOME_MESSAGE_MAX + 1), tone: "success" })).toMatch(/over the/);
    expect(problems({ message: "x".repeat(OUTCOME_MESSAGE_MAX), tone: "success" })).toBe("");
  });

  it("refuses an outcome with nothing to say", () => {
    expect(problems({ message: "   ", tone: "success" })).toMatch(/nothing to say/);
  });
});
