import { describe, expect, it } from "vitest";
import {
  calculateBodyFatNavy,
  classifyBodyFat,
  ellipseCircumference,
  pixelScaleFromHeight,
  relativeFatMass,
  deurenbergBodyFat,
  estimateBodyFat,
} from "../src/bodyfat.js";

describe("body fat", () => {
  it("male Navy formula matches the reference computation", () => {
    // waist 85, neck 38, height 180:
    // 495 / (1.0324 - 0.19077*log10(47) + 0.15456*log10(180)) - 450
    const expected =
      495 / (1.0324 - 0.19077 * Math.log10(47) + 0.15456 * Math.log10(180)) - 450;
    expect(calculateBodyFatNavy("male", 85, 38, 180)).toBe(Math.round(expected * 10) / 10);
  });

  it("female formula requires hips", () => {
    expect(calculateBodyFatNavy("female", 75, 33, 165)).toBeNull();
    expect(calculateBodyFatNavy("female", 75, 33, 165, 95)).toBeGreaterThan(0);
  });

  it("rejects waist <= neck and missing inputs", () => {
    expect(calculateBodyFatNavy("male", 38, 38, 180)).toBeNull();
    expect(calculateBodyFatNavy("male", 0, 38, 180)).toBeNull();
  });

  it("classifies with gender-split ACE bands (upper bound exclusive)", () => {
    expect(classifyBodyFat(5.9, "male")).toBe("essential");
    expect(classifyBodyFat(6, "male")).toBe("athletic");
    expect(classifyBodyFat(17.9, "male")).toBe("fitness");
    expect(classifyBodyFat(30, "male")).toBe("above_average");
    expect(classifyBodyFat(20, "female")).toBe("athletic");
    expect(classifyBodyFat(24, "female")).toBe("fitness");
    expect(classifyBodyFat(0, "male")).toBeNull();
  });

  it("ellipse circumference uses Ramanujan-II (a circle degenerates to 2πr)", () => {
    // Circle: front = side = 20 → r = 10 → C = 2π·10 = 62.8.
    expect(ellipseCircumference(20, 20)).toBeCloseTo(Math.round(2 * Math.PI * 10 * 10) / 10, 1);
    // Elongated waist reads HIGHER than the crude π(a+b) (which would give 78.5).
    expect(ellipseCircumference(30, 20)!).toBeGreaterThan(Math.round(Math.PI * 25 * 10) / 10);
    expect(ellipseCircumference(0, 20)).toBeNull();
  });

  it("pixel scale uses the 0.86 nose→ankle anthropometric factor", () => {
    // 1548 px body span for a 180cm person: 1548 / (180*0.86) = 10 px/cm
    expect(pixelScaleFromHeight(1548, 180)).toBeCloseTo(10, 5);
  });

  it("RFM (Woolcott-Bergman) uses the height/waist ratio by sex", () => {
    // Men: 64 − 20·(180/90) = 24.0
    expect(relativeFatMass("male", 180, 90)).toBe(24);
    // Women: 76 − 20·(165/80) = 34.75 → 34.8
    expect(relativeFatMass("female", 165, 80)).toBeCloseTo(34.8, 1);
    expect(relativeFatMass("male", 0, 90)).toBeNull();
  });

  it("Deurenberg BMI+age formula matches the reference", () => {
    // BMI 24, age 30, male: 1.2·24 + 0.23·30 − 10.8 − 5.4 = 19.5
    expect(deurenbergBodyFat(24, 30, "male")).toBeCloseTo(19.5, 1);
    // female (sex term drops): 1.2·24 + 0.23·30 − 5.4 = 30.3
    expect(deurenbergBodyFat(24, 30, "female")).toBeCloseTo(30.3, 1);
  });

  it("ensemble blends methods, clamps, and derives a confidence band", () => {
    const est = estimateBodyFat({ gender: "male", ageYears: 30, heightCm: 180, weightKg: 80, neckCm: 38, waistCm: 85, hipsCm: null });
    expect(est).not.toBeNull();
    // Weighted mean sits between the min and max of the contributing methods.
    const vals = est!.methods.map((m) => m.value);
    expect(est!.bodyFatPercent).toBeGreaterThanOrEqual(Math.min(...vals));
    expect(est!.bodyFatPercent).toBeLessThanOrEqual(Math.max(...vals));
    // Band brackets the estimate; weights renormalize to ~1.
    expect(est!.low).toBeLessThan(est!.bodyFatPercent);
    expect(est!.high).toBeGreaterThan(est!.bodyFatPercent);
    expect(est!.methods.reduce((s, m) => s + m.weight, 0)).toBeCloseTo(1, 1);
    expect(["high", "medium", "low"]).toContain(est!.confidence);
    // Never emits a nonsense value even with extreme inputs.
    const extreme = estimateBodyFat({ gender: "male", ageYears: 30, heightCm: 180, weightKg: 40, neckCm: 30, waistCm: 60, hipsCm: null });
    expect(extreme!.bodyFatPercent).toBeGreaterThanOrEqual(2);
    expect(extreme!.bodyFatPercent).toBeLessThanOrEqual(65);
  });
});
