import { describe, expect, it } from "vitest";
import {
  creditsForNeurons,
  creditsForUsage,
  marginAt,
  neuronsForUsage,
  neuronsPerCredit,
} from "../src/credits.js";

describe("credits", () => {
  it("1 credit = $0.001; break-even ≈ 90.9 neurons/credit at markup 1", () => {
    expect(neuronsPerCredit(1)).toBeCloseTo(90.909, 2);
  });

  it("charges ceil(neurons × $0.011/1000 × markup × 1000)", () => {
    // 10_000 neurons at markup 3: 10000 * 0.000011 * 3 * 1000 = 330 credits
    expect(creditsForNeurons(10_000, 3)).toBe(330);
  });

  it("never charges less than 1 credit for nonzero work", () => {
    expect(creditsForNeurons(0.001)).toBe(1);
    expect(creditsForNeurons(0)).toBe(0);
    expect(creditsForNeurons(-5)).toBe(0);
  });

  it("margin at markup 3 is 66.7%", () => {
    expect(marginAt(3)).toBeCloseTo(2 / 3, 5);
  });

  it("meters token usage against per-million rates", () => {
    const rate = { inputRate: 26_668, outputRate: 204_805 };
    const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000 };
    expect(neuronsForUsage(usage, rate)).toBeCloseTo(231_473, 0);
    expect(creditsForUsage(usage, rate)).toBe(Math.ceil(231_473 * 0.000011 * 3 * 1000));
  });

  it("meters unit kinds (image tiles, audio seconds)", () => {
    expect(neuronsForUsage({ tiles: 2 }, { unitRate: 4.8, unitKind: "tile" })).toBeCloseTo(9.6);
    expect(neuronsForUsage({ audioSec: 30 }, { unitRate: 121, unitKind: "audio_sec" })).toBe(3630);
  });
});
