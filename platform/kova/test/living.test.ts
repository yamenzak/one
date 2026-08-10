/**
 * A WEEK, AND A FAST — the two numbers a client reads about their own body.
 *
 * ⚠️ NEITHER MAY INVENT ONE. A wellness score computed from two inputs and shown
 * like one computed from five tells somebody they are doing well on the strength
 * of one good night's sleep; a fasting zone asserted from a clock nobody started
 * is a physiological claim about a person who has just eaten.
 */

import { describe, expect, it } from "vitest";
import { FASTING_ZONES, lengthOf, wellnessOf, zoneAt } from "../src/living.js";

/* --------------------------------------------------------------- fasting --- */

const START = "2026-03-01T20:00:00.000Z";
const after = (hours: number): string => new Date(Date.parse(START) + hours * 3_600_000).toISOString();

describe("where a fast has got to", () => {
  it("names the zone for the hours elapsed", () => {
    expect(zoneAt(START, after(1))!.zone.id).toBe("fed");
    expect(zoneAt(START, after(5))!.zone.id).toBe("early");
    expect(zoneAt(START, after(13))!.zone.id).toBe("burning");
    expect(zoneAt(START, after(17))!.zone.id).toBe("deep");
    expect(zoneAt(START, after(30))!.zone.id).toBe("long");
  });

  /* ⚠️ On the boundary is IN, or every zone begins a minute late and the screen
     disagrees with the number beside it. */
  it("enters a zone on its own hour", () => {
    expect(zoneAt(START, after(12))!.zone.id).toBe("burning");
    expect(zoneAt(START, after(11.99))!.zone.id).toBe("early");
  });

  /*
    ⚠️ THE LAST ZONE HAS NO CEILING, deliberately. A fast somebody forgot to stop
    must read as a long fast rather than falling off the end into nothing — the
    number they need is how long it has been.
  */
  it("keeps counting past the last zone", () => {
    const out = zoneAt(START, after(72))!;
    expect(out.zone.id).toBe("long");
    expect(out.hours).toBe(72);
  });

  /*
    ⚠️ AN UNSTARTED OR FUTURE FAST IS NOTHING, NOT ZONE ONE. Returning "Fed —
    still digesting" for a fast nobody began is a timer that looks like it is
    working and sits at zero forever.
  */
  it("says nothing about a fast that has not started", () => {
    expect(zoneAt(after(2), START)).toBeNull();
    expect(zoneAt("not a date", START)).toBeNull();
  });

  /* ⚠️ A finished fast is measured from its own end. One whose length kept
     growing on the screen is a record that disagrees with itself tomorrow. */
  it("measures a finished fast from when it ended", () => {
    expect(lengthOf(START, after(18), after(200))).toBe(18);
    expect(lengthOf(START, null, after(6))).toBe(6);
  });

  /* ⚠️ Every zone says something a hungry person can read, and none of it is a
     clinical claim. The copy is part of the design, not decoration. */
  it("says something about every zone, and claims nothing medical", () => {
    for (const z of FASTING_ZONES) {
      expect(z.says.length, `${z.id} says nothing`).toBeGreaterThan(10);
      expect(z.says.toLowerCase()).not.toMatch(/autophagy|ketosis|cure|treat|disease/);
    }
  });
});

/* --------------------------------------------------------------- wellness --- */

describe("one honest number for a week", () => {
  /*
    ⚠️ AN AVERAGE OF WHAT IS PRESENT, NOT A SUM WITH ZEROS FOR THE REST.
    Treating an absent input as zero punishes somebody for not logging — which is
    backwards, because the weeks people log least are the hard ones, so the score
    would fall hardest exactly when it is read most.
  */
  it("scores what was recorded and ignores what was not", () => {
    const both = wellnessOf({ sleep: [4, 4, 4], mood: [4, 4] });
    const one = wellnessOf({ sleep: [4, 4, 4], mood: [4, 4], energy: undefined });
    expect(both.score).toBe(one.score);
    expect(both.score).toBe(75);
  });

  /* A 3 out of 5 is the middle, not sixty per cent. */
  it("puts the middle of a five-point scale in the middle", () => {
    expect(wellnessOf({ sleep: [3], mood: [3] }).score).toBe(50);
    expect(wellnessOf({ sleep: [5], mood: [5] }).score).toBe(100);
    expect(wellnessOf({ sleep: [1], mood: [1] }).score).toBe(0);
  });

  /*
    ⚠️ BELOW TWO INPUTS THERE IS NO SCORE AT ALL. One input is not a picture of a
    week, and a number computed from one is a number somebody will act on.
  */
  it("refuses to score a week it knows one thing about", () => {
    expect(wellnessOf({ sleep: [5, 5, 5] }).score).toBeNull();
    expect(wellnessOf({}).score).toBeNull();
  });

  /*
    ⚠️ AND IT SAYS WHAT IT USED. A score of 82 from two inputs looks exactly like
    one from five, and the first is somebody being told they are doing well
    because they slept.
  */
  it("reports what it was computed from", () => {
    const out = wellnessOf({ sleep: [4], sessions: { done: 3, expected: 4 }, loggedDays: 7 });
    expect([...out.from].sort()).toEqual(["eating", "sleep", "training"]);
    expect(out.coverage).toBeCloseTo(3 / 5, 5);
  });

  it("counts training against what was actually asked for", () => {
    expect(wellnessOf({ sleep: [3], sessions: { done: 4, expected: 4 } }).score).toBe(75);
    expect(wellnessOf({ sleep: [3], sessions: { done: 0, expected: 4 } }).score).toBe(25);
  });

  /* ⚠️ Doing more than was asked is not 140% of a week. */
  it("does not let over-delivery push the score past full", () => {
    expect(wellnessOf({ sleep: [5], sessions: { done: 9, expected: 4 } }).score).toBe(100);
  });

  /* ⚠️ Nothing prescribed is not zero training — it is a question nobody asked. */
  it("ignores training where none was prescribed", () => {
    const out = wellnessOf({ sleep: [4], mood: [4], sessions: { done: 0, expected: 0 } });
    expect(out.from).not.toContain("training");
    expect(out.score).toBe(75);
  });

  it("survives a nonsense input rather than reporting NaN", () => {
    expect(wellnessOf({ sleep: [Number.NaN], mood: [4] }).score).toBe(38);
  });
});
