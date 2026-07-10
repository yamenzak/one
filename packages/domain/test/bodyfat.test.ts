import { describe, expect, it } from "vitest";
import {
  calculateBodyFatNavy,
  classifyBodyFat,
  ellipseCircumference,
  pixelScaleFromHeight,
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

  it("ellipse circumference C ≈ π(a+b)", () => {
    expect(ellipseCircumference(30, 20)).toBe(Math.round(Math.PI * 25 * 10) / 10);
    expect(ellipseCircumference(0, 20)).toBeNull();
  });

  it("pixel scale uses the 0.86 nose→ankle anthropometric factor", () => {
    // 1548 px body span for a 180cm person: 1548 / (180*0.86) = 10 px/cm
    expect(pixelScaleFromHeight(1548, 180)).toBeCloseTo(10, 5);
  });
});
