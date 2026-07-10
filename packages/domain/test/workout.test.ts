import { describe, expect, it } from "vitest";
import { estimateBurnedCalories, estimateWorkoutBurn } from "../src/activity.js";
import {
  detectPrs,
  epley1Rm,
  pickPlanForDate,
  recommendNextDay,
  sessionLoad,
  sessionTonnage,
  type ExerciseBests,
} from "../src/workout.js";

describe("workout math", () => {
  it("Epley e1RM = w(1 + r/30)", () => {
    expect(epley1Rm(100, 5)).toBeCloseTo(116.7, 1);
    expect(epley1Rm(100, 1)).toBeCloseTo(103.3, 1);
    expect(epley1Rm(0, 5)).toBeNull();
  });

  it("detects weight/rep/duration PRs and raises the bar", () => {
    let bests: ExerciseBests = { prWeightKg: 100, prReps: 8, prDurationSeconds: null, bestE1Rm: 120 };
    const r1 = detectPrs(bests, { weightKg: 102.5, reps: 5, completed: true });
    expect(r1.broke).toEqual(["weight"]);
    bests = r1.bests;
    // Same weight again: no re-fire.
    expect(detectPrs(bests, { weightKg: 102.5, reps: 5 }).broke).toEqual([]);
    expect(detectPrs(bests, { reps: 9 }).broke).toEqual(["reps"]);
  });

  it("tonnage sums reps × kg over completed sets only", () => {
    expect(
      sessionTonnage([
        { reps: 5, weightKg: 100, completed: true },
        { reps: 5, weightKg: 100, completed: false },
        { reps: 10, weightKg: 20 },
      ]),
    ).toBe(700);
  });

  it("session load: resistance and cardio land in comparable ranges", () => {
    // 20 working sets of 8 reps (24s work each) at perfect effort = 20*0.4*10 = 80
    const sets = Array.from({ length: 20 }, () => ({ reps: 8, effortLabel: "perfect" as const }));
    expect(sessionLoad({ sets })).toBe(80);
    // 30-min MET-7 run = 21
    expect(sessionLoad({ cardio: [{ met: 7, durationMin: 30 }] })).toBe(21);
  });

  it("recommends in-progress-today first, else the stalest day", () => {
    const days = [
      { prescribedSets: 10 },
      { prescribedSets: 12 },
      { isRestDay: true, prescribedSets: 0 },
      { prescribedSets: 8 },
    ];
    // Day 1 partially logged today -> resume it.
    expect(
      recommendNextDay(
        days,
        [null, { lastLoggedDate: "2026-07-10", loggedSetsOnLastDate: 4 }, null, null],
        "2026-07-10",
      ),
    ).toBe(1);
    // Nothing today: day 3 done 5 days ago, day 1 done yesterday, day 0 never -> day 0.
    expect(
      recommendNextDay(
        days,
        [
          null,
          { lastLoggedDate: "2026-07-09", loggedSetsOnLastDate: 12 },
          null,
          { lastLoggedDate: "2026-07-05", loggedSetsOnLastDate: 8 },
        ],
        "2026-07-10",
      ),
    ).toBe(0);
  });

  it("pickPlanForDate honors superseded plans' historical windows", () => {
    const plans = [
      { id: "old", status: "superseded" as const, publishedAt: "2026-01-01T00:00:00Z" },
      { id: "new", status: "published" as const, publishedAt: "2026-06-01T00:00:00Z" },
    ];
    expect(pickPlanForDate(plans, "2026-03-15")!.id).toBe("old");
    expect(pickPlanForDate(plans, "2026-07-01")!.id).toBe("new");
    expect(pickPlanForDate(plans)!.id).toBe("new");
  });
});

describe("activity burn", () => {
  it("kcal = MET × kg × h × HR factor", () => {
    expect(estimateBurnedCalories({ met: 3.5, weightKg: 80, durationMin: 30, avgHrBpm: 120 })).toBe(
      140,
    );
    expect(estimateBurnedCalories({ met: 3.5, weightKg: 80, durationMin: 30 })).toBe(140);
    expect(estimateBurnedCalories({ met: 3.5, weightKg: 80, durationMin: 30, avgHrBpm: 175 })).toBe(
      Math.round(3.5 * 80 * 0.5 * 1.45),
    );
  });

  it("workout burn: null without bodyweight or usable sets", () => {
    expect(estimateWorkoutBurn([{ reps: 10 }], null)).toBeNull();
    expect(estimateWorkoutBurn([], 80)).toBeNull();
    const r = estimateWorkoutBurn(
      [
        { reps: 10, effortLabel: "perfect" },
        { reps: 8, effortLabel: "hard" },
      ],
      80,
    )!;
    expect(r.setCount).toBe(2);
    expect(r.kcal).toBeGreaterThan(0);
  });
});
