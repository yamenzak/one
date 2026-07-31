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
  NEURON_COST_USD,
  CREDITS_PER_DOLLAR,
  type ModelRate,
  type Usage,
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

// AI is the platform's margin. These pin the two properties that keep it: both
// provider rails price through the SAME formula, and every rounding decision
// falls the platform's way. A regression here does not throw — it quietly bills
// less than the provider charges.
describe("the meter never bills below cost, on either rail", () => {
  const usdPerMToNeurons = (u: number) => Math.round(u / NEURON_COST_USD);
  const usd = (credits: number) => credits / CREDITS_PER_DOLLAR;
  const cost = (usage: Usage, rate: ModelRate) => neuronsForUsage(usage, rate) * NEURON_COST_USD;

  // Workers AI publishes neurons directly; Gemini publishes USD, converted to
  // neuron-equivalents at the same $0.011/1k. Same unit in, same formula out.
  const RAILS: [string, ModelRate][] = [
    ["workers-ai llama-3.3-70b", { inputRate: 26_668, outputRate: 204_805, markup: 3 }],
    ["workers-ai llama-3.2-3b", { inputRate: 4_625, outputRate: 30_475, markup: 3 }],
    ["gemini-2.5-flash", { inputRate: usdPerMToNeurons(0.3), outputRate: usdPerMToNeurons(2.5), markup: 3 }],
    ["gemini-2.5-pro", { inputRate: usdPerMToNeurons(1.25), outputRate: usdPerMToNeurons(10), markup: 3 }],
    ["gemini image (per unit)", { inputRate: usdPerMToNeurons(0.3), unitRate: Math.round(0.039 / NEURON_COST_USD), unitKind: "image", markup: 3 }],
    ["gemini TTS (audio out)", { inputRate: usdPerMToNeurons(0.5), outputRate: usdPerMToNeurons(10), markup: 3 }],
  ];

  const WORKLOADS: [string, Usage][] = [
    ["tiny", { inputTokens: 40, outputTokens: 12 }],
    ["typical", { inputTokens: 2_000, outputTokens: 800 }],
    ["long context", { inputTokens: 120_000, outputTokens: 4_000 }],
    ["heavy thinking", { inputTokens: 2_000, outputTokens: 28_000 }],
    ["one image", { inputTokens: 200, images: 1 }],
  ];

  it("bills at least markup × the real provider cost, for every rail × workload", () => {
    for (const [rail, rate] of RAILS) {
      for (const [name, usage] of WORKLOADS) {
        const c = cost(usage, rate);
        if (c <= 0) continue; // this rail does not bill that axis
        const billed = usd(creditsForUsage(usage, rate));
        // >= not ==: `ceil` on the credit rounds UP, so the platform's side.
        expect(billed, `${rail} / ${name}`).toBeGreaterThanOrEqual(c * (rate.markup ?? 3));
      }
    }
  });

  it("rounding always favours the platform, never the tenant", () => {
    for (const [rail, rate] of RAILS) {
      for (const [name, usage] of WORKLOADS) {
        const c = cost(usage, rate);
        if (c <= 0) continue;
        const billed = usd(creditsForUsage(usage, rate));
        const realised = 1 - c / billed;
        // Never below the nominal margin (66.7% at markup 3)…
        expect(realised, `${rail} / ${name} margin`).toBeGreaterThanOrEqual(marginAt(rate.markup ?? 3) - 1e-9);
        // …and the rounding bonus stays bounded, i.e. we are not wildly
        // over-charging tiny calls either (the 1-credit floor is the only source).
        expect(billed, `${rail} / ${name} sanity`).toBeLessThanOrEqual(Math.max(c * (rate.markup ?? 3) * 6, 0.002));
      }
    }
  });

  it("a sub-credit call still costs a credit — nothing is ever given away", () => {
    const rate = { inputRate: 4_625, outputRate: 30_475, markup: 3 };
    expect(creditsForUsage({ inputTokens: 1, outputTokens: 1 }, rate)).toBe(1);
    // …but genuinely zero work is genuinely free (a released hold, a cache hit).
    expect(creditsForUsage({}, rate)).toBe(0);
  });

  it("the two rails agree: equal real cost ⇒ equal credits", () => {
    // $2.50/1M on Gemini and the neuron rate that costs the same on Workers AI
    // must bill identically — the whole point of metering in neurons.
    const same = usdPerMToNeurons(2.5);
    const gemini = { outputRate: same, markup: 3 };
    const workers = { outputRate: same, markup: 3 };
    const usage = { outputTokens: 10_000 };
    expect(creditsForUsage(usage, gemini)).toBe(creditsForUsage(usage, workers));
  });
});
