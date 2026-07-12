import { describe, expect, it } from "vitest";
import { wellnessScore, sleepScore } from "../src/wellness.js";

describe("sleepScore", () => {
  it("scores the 7-9h band as ideal and degrades outside it", () => {
    expect(sleepScore(8)).toBe(1);
    expect(sleepScore(7)).toBe(1);
    expect(sleepScore(9)).toBe(1);
    expect(sleepScore(4)).toBe(0); // deprived floor
    expect(sleepScore(11)).toBe(0); // oversleep floor
    expect(sleepScore(5.5)).toBeCloseTo(0.5, 5); // halfway up
    expect(sleepScore(10)).toBeCloseTo(0.5, 5); // halfway down
  });
});

describe("wellnessScore", () => {
  it("returns 0 and 'start' with all pillars unavailable", () => {
    const r = wellnessScore({});
    expect(r.score).toBe(0);
    expect(r.band).toBe("start");
    expect(r.pillars.every((p) => !p.available && p.weight === 0 && p.score === null)).toBe(true);
  });

  it("scores a perfect week at 100 / 'peak'", () => {
    const r = wellnessScore({
      activeDays: 5, weeklyLoad: 400, weeklyLoadTarget: 300, prsThisWeek: 2,
      calorieAdherence: 1, proteinAdherence: 1, foodLoggedDays: 7,
      hydrationRatio: 1, avgSleepHours: 8,
      avgMood: 5, avgEnergy: 5, avgStress: 1,
      loggedDays: 7, checkInDays: 7, supplementAdherence: 1, bodyProgress: 1,
    });
    expect(r.score).toBe(100);
    expect(r.band).toBe("peak");
    expect(r.pillars.every((p) => p.available)).toBe(true);
    // Weights over a full pillar set sum to ~1.
    expect(r.pillars.reduce((s, p) => s + p.weight, 0)).toBeCloseTo(1, 2);
  });

  it("redistributes weight so a single available pillar drives the whole score", () => {
    const r = wellnessScore({ avgSleepHours: 8 });
    expect(r.score).toBe(100); // sleep perfect, only pillar available
    const sleep = r.pillars.find((p) => p.key === "sleep")!;
    expect(sleep.available).toBe(true);
    expect(sleep.weight).toBe(1); // absorbed all weight
    expect(r.pillars.filter((p) => p.available)).toHaveLength(1);
  });

  it("weights pillars: a strong-but-not-perfect mix lands mid-band", () => {
    const r = wellnessScore({
      activeDays: 3, weeklyLoad: 150, weeklyLoadTarget: 300, // training ~0.5
      calorieAdherence: 0.8, proteinAdherence: 0.6, foodLoggedDays: 7, // nutrition ~0.8
      avgSleepHours: 6, // sleep ~0.67
      loggedDays: 7, checkInDays: 3, // consistency ~0.71
    });
    expect(r.score).toBeGreaterThan(55);
    expect(r.score).toBeLessThan(80);
    expect(["building", "solid"]).toContain(r.band);
    // Unused pillars are marked unavailable and hold no weight.
    expect(r.pillars.find((p) => p.key === "hydration")!.available).toBe(false);
    expect(r.pillars.find((p) => p.key === "hydration")!.weight).toBe(0);
  });

  it("inverts stress — low stress helps, high stress hurts", () => {
    const calm = wellnessScore({ avgMood: 3, avgEnergy: 3, avgStress: 1 }).score;
    const tense = wellnessScore({ avgMood: 3, avgEnergy: 3, avgStress: 5 }).score;
    expect(calm).toBeGreaterThan(tense);
  });

  it("gives a small PR bonus on top of training volume", () => {
    const base = { activeDays: 4, weeklyLoad: 240, weeklyLoadTarget: 300 };
    const withPr = wellnessScore({ ...base, prsThisWeek: 2 }).pillars.find((p) => p.key === "training")!.score!;
    const noPr = wellnessScore({ ...base, prsThisWeek: 0 }).pillars.find((p) => p.key === "training")!.score!;
    expect(withPr).toBeGreaterThan(noPr);
  });
});
