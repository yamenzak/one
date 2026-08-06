import { describe, it, expect } from "vitest";
import {
  creditsForNeurons,
  neuronsForUsage,
  creditsForUsage,
  neuronsPerCredit,
  marginAt,
  CREDITS_PER_DOLLAR,
  NEURON_COST_USD,
  type ModelRate,
} from "../src/credits.js";

describe("credit economics", () => {
  it("headline: $1 = 1000 credits, 1 neuron = $0.000011", () => {
    expect(CREDITS_PER_DOLLAR).toBe(1000);
    expect(NEURON_COST_USD).toBeCloseTo(0.000011, 12);
  });

  it("1000 neurons at 3x markup costs 33 credits ($0.033), 67% margin", () => {
    // 1000 × 0.011 × 3 = 33 credits = $0.033; CF cost $0.011 → margin (33-11)/33
    expect(creditsForNeurons(1000, 3)).toBe(33);
    expect(marginAt(3)).toBeCloseTo(0.6667, 3);
  });

  it("margin is constant across markup levels", () => {
    expect(marginAt(2)).toBeCloseTo(0.5, 6);
    expect(marginAt(4)).toBeCloseTo(0.75, 6);
    expect(marginAt(5)).toBeCloseTo(0.8, 6);
  });

  it("neurons per credit falls as markup rises (90.9 at break-even)", () => {
    expect(neuronsPerCredit(1)).toBeCloseTo(90.909, 2);
    expect(neuronsPerCredit(3)).toBeCloseTo(30.303, 2);
    expect(neuronsPerCredit(4)).toBeCloseTo(22.727, 2);
  });

  it("any positive usage costs at least 1 credit (never free), zero stays zero", () => {
    expect(creditsForNeurons(1, 3)).toBe(1);
    expect(creditsForNeurons(0, 3)).toBe(0);
    expect(creditsForNeurons(-5, 3)).toBe(0);
  });

  it("falls back to the default markup for a non-positive multiple", () => {
    expect(creditsForNeurons(1000, 0)).toBe(33);
    expect(creditsForNeurons(1000, -2)).toBe(33);
  });

  it("text model: neurons from input+output tokens", () => {
    const rate: ModelRate = { inputRate: 26668, outputRate: 204805, markup: 3 };
    // 2000 in + 2000 out on Llama-70B ≈ 53.3 + 409.6 = 462.9 neurons
    const n = neuronsForUsage({ inputTokens: 2000, outputTokens: 2000 }, rate);
    expect(n).toBeCloseTo(462.95, 1);
    expect(creditsForUsage({ inputTokens: 2000, outputTokens: 2000 }, rate)).toBe(16);
  });

  it("TTS model: neurons per 1k chars", () => {
    const rate: ModelRate = { unitRate: 1363.64, unitKind: "chars_1k", markup: 3 };
    // 800 chars → 0.8 × 1363.64 = 1090.9 neurons → ceil(1090.9×0.033)=37 credits
    expect(neuronsForUsage({ chars: 800 }, rate)).toBeCloseTo(1090.9, 1);
    expect(creditsForUsage({ chars: 800 }, rate)).toBe(37);
  });

  it("image model: neurons per 512² tile", () => {
    const rate: ModelRate = { unitRate: 4.8, unitKind: "tile", markup: 3 };
    // 4 tiles → 19.2 neurons → ceil(19.2×0.033)=1 credit (min)
    expect(neuronsForUsage({ tiles: 4 }, rate)).toBeCloseTo(19.2, 4);
    expect(creditsForUsage({ tiles: 4 }, rate)).toBe(1);
  });

  it("per-image model (Gemini): neurons per generated image, ignores tiles", () => {
    const rate: ModelRate = { unitRate: 3545, unitKind: "image", markup: 3 };
    // Nano Banana ($0.039/img → 3545 neurons): 1 image → ceil(3545×0.033)=117 credits.
    // A stray `tiles` count must NOT be metered for a per-image unit kind.
    expect(neuronsForUsage({ images: 1, tiles: 4 }, rate)).toBe(3545);
    expect(creditsForUsage({ images: 1 }, rate)).toBe(117);
    expect(neuronsForUsage({ tiles: 4 }, rate)).toBe(0);
  });

  it("selling 1000 credits at $1 clears a profit at 3x (CF cost $0.33)", () => {
    // 1000 credits buys 30303 neurons; CF cost 30303 × $0.000011 = $0.333
    const neurons = 1000 * neuronsPerCredit(3);
    expect(neurons * NEURON_COST_USD).toBeCloseTo(0.333, 2);
  });
});
