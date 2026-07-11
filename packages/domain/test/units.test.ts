import { describe, expect, it } from "vitest";
import {
  DEFAULT_UNITS, resolveUnits, cmToFeetInches, feetInchesToCm,
  fmtWeight, fmtHeight, fmtLength, fmtVolume, fmtDistance, fmtEnergy,
  displayToKg, lengthDisplayToCm, volumeDisplayToMl, kgToDisplay, kcalToDisplay,
} from "../src/units.js";

const M = DEFAULT_UNITS;
const IMP = resolveUnits({ weight: "lb", height: "ft_in", length: "in", volume: "oz", distance: "mi", energy: "kJ" });

describe("units", () => {
  it("resolveUnits fills defaults + coerces junk", () => {
    expect(resolveUnits(null)).toEqual(DEFAULT_UNITS);
    expect(resolveUnits({ weight: "stone" as never }).weight).toBe("kg");
    expect(resolveUnits({ weight: "lb" }).weight).toBe("lb");
  });

  it("feet/inches round-trips and normalizes 12in", () => {
    expect(cmToFeetInches(180)).toEqual({ ft: 5, in: 11 });
    expect(Math.round(feetInchesToCm(5, 11))).toBe(180);
    // 12in rolls into the next foot.
    expect(cmToFeetInches(feetInchesToCm(6, 0)).in).toBe(0);
  });

  it("formats metric + imperial", () => {
    expect(fmtWeight(72.5, M)).toBe("72.5 kg");
    expect(fmtWeight(72.5, IMP)).toBe("159.8 lb");
    expect(fmtHeight(180, M)).toBe("180 cm");
    expect(fmtHeight(180, IMP)).toBe("5'11\"");
    expect(fmtLength(81, IMP)).toBe("31.9 in");
    expect(fmtVolume(500, M)).toBe("500 ml");
    expect(fmtVolume(1500, M)).toBe("1.5 L");
    expect(fmtVolume(500, IMP)).toBe("17 oz");
    expect(fmtDistance(5000, M)).toBe("5 km");
    expect(fmtDistance(5000, IMP)).toBe("3.1 mi");
    expect(fmtEnergy(2000, M)).toBe("2,000 kcal");
    expect(fmtEnergy(2000, IMP)).toBe("8,368 kJ");
  });

  it("parses display inputs back to metric (round-trip)", () => {
    expect(displayToKg(160, IMP)).toBeCloseTo(72.574, 2);
    expect(kgToDisplay(displayToKg(160, IMP), IMP)).toBeCloseTo(160, 1);
    expect(lengthDisplayToCm(32, IMP)).toBeCloseTo(81.28, 2);
    expect(volumeDisplayToMl(16, IMP)).toBeCloseTo(473.18, 1);
    expect(kcalToDisplay(2000, IMP)).toBe(8368);
    expect(displayToKg(70, M)).toBe(70);
  });
});
