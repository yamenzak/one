import { describe, expect, it } from "vitest";
import {
  creditsForNeurons,
  creditsForUsage,
  creditsPerMillionTokens,
  creditsPerUnit,
  marginAt,
  neuronsForUsage,
  neuronsPerCredit,
  referenceCredits,
  referenceUsage,
  REFERENCE_USAGE,
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

// The figures a studio owner picks a model on. A wrong number here is not a
// cosmetic bug: it is the platform quoting a price it will not charge.
describe("model pricing, in the currency a studio spends", () => {
  const at = (inputRate: number, outputRate: number) => ({ inputRate, outputRate, markup: 3 });

  it("prices a typical request from the lane's reference workload", () => {
    // llama-3.3-70b on the text lane: 2000 in / 800 out.
    //   2000/1e6*26668 + 800/1e6*204805 = 53.34 + 163.84 = 217.18 neurons
    //   ceil(217.18 * 0.000011 * 3 * 1000) = ceil(7.167) = 8 credits
    expect(referenceCredits("text", at(26_668, 204_805))).toBe(8);
    // The same model on the small lane is cheaper — the job is smaller.
    expect(referenceCredits("text-small", at(26_668, 204_805))).toBe(3);
  });

  it("separates the lanes it is asked about, and never prices at zero", () => {
    const cheap = at(4_625, 30_475);
    expect(referenceCredits("text", cheap)).toBe(2);
    // A tiny job still costs the 1-credit floor — which is what actually bills.
    expect(referenceCredits("text-small", cheap)).toBe(1);
    // An unknown lane falls back to text rather than quoting free.
    expect(referenceCredits("something-new", cheap)).toBe(referenceCredits("text", cheap));
    expect(referenceUsage("something-new")).toEqual(REFERENCE_USAGE.text);
  });

  it("ranks the catalog the way an owner expects — cheap models quote cheaper", () => {
    const tiny = referenceCredits("text", at(4_625, 30_475));
    const mid = referenceCredits("text", at(24_545, 77_273));
    const big = referenceCredits("text", at(26_668, 204_805));
    const flagship = referenceCredits("text", at(136_364, 909_091));
    expect(tiny).toBeLessThan(mid);
    expect(mid).toBeLessThan(big);
    expect(big).toBeLessThan(flagship);
  });

  it("quotes the same total the meter would actually charge", () => {
    // The quote is not a parallel calculation — it is creditsForUsage on a
    // fixed usage, so it can never drift from the billed path.
    const rate = at(26_668, 204_805);
    expect(referenceCredits("text", rate)).toBe(creditsForUsage(REFERENCE_USAGE.text!, rate));
  });

  it("converts the rate card into credits per million tokens", () => {
    // 26,668 neurons * 0.000011 * 3 * 1000 = 880.0 → 881 (ceil)
    expect(creditsPerMillionTokens(at(26_668, 204_805))).toEqual({ input: 881, output: 6_759 });
  });

  it("reports null on an axis the model does not bill", () => {
    expect(creditsPerMillionTokens({ inputRate: 27_273, markup: 3 })).toEqual({ input: 901, output: null });
    expect(creditsPerUnit({ inputRate: 27_273, markup: 3 })).toBeNull();
  });

  it("prices a per-unit model per unit", () => {
    // Nano Banana: 3,545 neurons per image at markup 3 → 117 credits (~$0.117
    // charged on a $0.039 cost).
    expect(creditsPerUnit({ unitRate: 3_545, unitKind: "image", markup: 3 })).toEqual({ credits: 117, kind: "image" });
  });

  it("an image generation is visibly dearer than a text call — the point of showing it", () => {
    const image = referenceCredits("image", { inputRate: 27_273, unitRate: 3_545, unitKind: "image" as const, markup: 3 });
    expect(image).toBeGreaterThan(10 * referenceCredits("text", at(26_668, 204_805)));
  });
});
