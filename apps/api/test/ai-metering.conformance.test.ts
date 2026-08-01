/**
 * The money path, and the studio's control over it.
 *
 * AI is the platform's margin, and every leak in it is silent: nothing throws
 * when we bill fewer tokens than the provider invoices us for. `settle` caps the
 * charge at the reserve, so BOTH halves have to hold — count every billed token,
 * and reserve enough that the cap never has to bite.
 *
 * These are pure unit tests on the exported seams (`geminiBilledTokens`,
 * `estimateUsage`, `composeSystem`) rather than integration tests, because the
 * mock lane reports synthetic usage and can therefore never exercise a real
 * provider's accounting quirks.
 */
import { describe, expect, it } from "vitest";
import { geminiBilledTokens, estimateUsage, composeSystem, modelSupportsTask, type AiModelRow } from "../src/ai.js";
import { AI_FEATURES, TONE_GUIDE, featureDef } from "../src/ai-features.js";

describe("token accounting — bill what the provider bills", () => {
  it("counts Gemini reasoning tokens, which are billed at the output rate", () => {
    // The leak: `candidatesTokenCount` is the VISIBLE answer only. Thinking is
    // on by default on 2.5+, billed as output, and often the larger half.
    const u = { promptTokenCount: 2_000, candidatesTokenCount: 800, thoughtsTokenCount: 2_000, totalTokenCount: 4_800 };
    expect(geminiBilledTokens(u)).toEqual({ inputTokens: 2_000, outputTokens: 2_800 });
    // Reading only the visible count would have billed 800 — 29% of the output
    // actually paid for, which at markup 3 leaves a ~5% margin instead of 67%.
    expect(geminiBilledTokens(u).outputTokens).not.toBe(800);
  });

  it("prefers total − prompt, so a future billed-output category is swept up too", () => {
    // totalTokenCount exceeds candidates+thoughts (Google added something new).
    const u = { promptTokenCount: 100, candidatesTokenCount: 50, thoughtsTokenCount: 10, totalTokenCount: 400 };
    expect(geminiBilledTokens(u).outputTokens).toBe(300);
  });

  it("falls back to the named fields when there is no total", () => {
    expect(geminiBilledTokens({ promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 7 }).outputTokens).toBe(12);
    expect(geminiBilledTokens({ promptTokenCount: 10, candidatesTokenCount: 5 }).outputTokens).toBe(5);
    // A nonsensical total (smaller than the prompt) is ignored, not trusted into
    // a negative charge.
    expect(geminiBilledTokens({ promptTokenCount: 100, candidatesTokenCount: 9, totalTokenCount: 50 }).outputTokens).toBe(9);
  });

  it("reports UNDEFINED, never 0, when the provider said nothing", () => {
    // This is the difference between "fall back to the reserve" and "this
    // generation was free": 0 is not nullish, so `?? estimate` never fired.
    expect(geminiBilledTokens(undefined)).toEqual({});
    expect(geminiBilledTokens({})).toEqual({ inputTokens: undefined, outputTokens: undefined });
    expect(geminiBilledTokens({}).outputTokens).not.toBe(0);
  });
});

describe("the reserve is an upper bound — because settle caps at it", () => {
  const long = (n: number) => "x".repeat(n);

  it("does not use the English 4-chars-per-token average", () => {
    // 4 chars/token is an AVERAGE, and an average is the wrong statistic for a
    // bound. Arabic runs ~2 chars/token, so chars/4 reserved half the real input
    // and the settle cap absorbed the rest.
    const est = estimateUsage({ system: long(400), prompt: long(600), maxOutputTokens: 100 });
    expect(est.inputTokens).toBeGreaterThan(1_000 / 4);
    expect(est.inputTokens).toBe(400);
  });

  it("reserves a thinking allowance on Gemini, none on Workers AI", () => {
    const args = { system: "s", prompt: "p", maxOutputTokens: 1_000 };
    expect(estimateUsage({ ...args, provider: "workers-ai" }).outputTokens).toBe(1_000);
    // maxOutputTokens caps the ANSWER; Gemini bills hidden thinking on top of
    // it from a budget the request does not bound.
    expect(estimateUsage({ ...args, provider: "google" }).outputTokens).toBeGreaterThan(1_000);
  });

  it("budgets for the image tokens a character count cannot see", () => {
    const withImage = estimateUsage({ system: "s", prompt: "p", hasImage: true });
    const without = estimateUsage({ system: "s", prompt: "p" });
    expect(withImage.inputTokens! - without.inputTokens!).toBeGreaterThan(1_000);
  });
});

describe("every AI action is a studio's to configure", () => {
  it("each registry feature can be extended, and the built-in prompt survives", () => {
    // "ALL AI prompts are extendible": the settings screen renders straight from
    // AI_FEATURES, so registry membership IS the guarantee — provided the
    // extension is additive. A replacement would let a studio delete the output
    // contract its own routes parse against.
    expect(AI_FEATURES.length).toBeGreaterThan(20);
    for (const f of AI_FEATURES) {
      const out = composeSystem({ base: f.defaultSystem, feature: f.key, extra: "House rule: no pork." });
      expect(out, f.key).toContain(f.defaultSystem);
      expect(out, f.key).toContain("House rule: no pork.");
      // …and the studio's text is framed as subordinate, not as a new contract.
      expect(out, f.key).toMatch(/don't conflict with the rules above/);
    }
  });

  it("applies tone to tonable features and withholds it from extractors", () => {
    const tonable = AI_FEATURES.filter((f) => f.tonable);
    const strict = AI_FEATURES.filter((f) => !f.tonable);
    expect(tonable.length).toBeGreaterThan(0);
    expect(strict.length).toBeGreaterThan(0);
    for (const f of tonable) {
      expect(composeSystem({ base: f.defaultSystem, feature: f.key, tone: "motivating" }), f.key).toContain(TONE_GUIDE.motivating);
    }
    for (const f of strict) {
      // A lab-marker or macro extractor must not be talked into a voice.
      expect(composeSystem({ base: f.defaultSystem, feature: f.key, tone: "funny" }), f.key).not.toContain(TONE_GUIDE.funny);
    }
  });

  it("puts the output contract last, so a chatty tone cannot bury it", () => {
    const f = AI_FEATURES.find((x) => x.tonable)!;
    const out = composeSystem({ base: f.defaultSystem, feature: f.key, extra: "Be poetic.", tone: "funny", expectsJson: true });
    expect(out.indexOf("Be poetic.")).toBeGreaterThan(out.indexOf(f.defaultSystem));
    expect(out.indexOf(TONE_GUIDE.funny)).toBeGreaterThan(out.indexOf("Be poetic."));
    expect(out.indexOf("Output format")).toBeGreaterThan(out.indexOf(TONE_GUIDE.funny));
  });

  it("an unknown feature key still extends, but is never toned", () => {
    // Defensive: a route added without a registry entry keeps working and stays
    // out of the tone path rather than throwing mid-generation.
    expect(featureDef("not-registered")).toBeUndefined();
    const out = composeSystem({ base: "B", feature: "not-registered", extra: "E", tone: "funny" });
    expect(out).toContain("E");
    expect(out).not.toContain(TONE_GUIDE.funny);
  });

  it("a per-feature model override is checked against the same compatibility rule everywhere", () => {
    // generate() and generateImage() both gate `fcfg.model` through
    // modelSupportsTask, so a studio cannot pin a model to an action it cannot
    // serve — which is how a Workers AI row ended up selected for Snap-a-Meal.
    const row = (over: Partial<AiModelRow>): AiModelRow => ({
      id: "m", task: "text", label: "M", provider: "workers-ai", input_rate: 1, output_rate: 1,
      unit_rate: null, unit_kind: null, markup: 3, enabled: 1, is_default: 0, ...over,
    });
    // A REAL image model carries the per-image rate. `parseGeminiCatalog` only
    // tags a row `image` when Google's page gives a single "$X per image"
    // figure, and the seed's Nano Banana row is written the same way — so this
    // is what an image model looks like everywhere it is actually produced.
    const imageModel = { task: "image", provider: "google", unit_rate: 3_545, unit_kind: "image" } as const;

    for (const task of ["text", "text-small"] as const) {
      expect(modelSupportsTask(row({ task: "text" }), task)).toBe(true);
      expect(modelSupportsTask(row(imageModel), task)).toBe(false);
    }
    expect(modelSupportsTask(row(imageModel), "image")).toBe(true);
    // Not Google → nothing here can drive it.
    expect(modelSupportsTask(row({ ...imageModel, provider: "workers-ai" }), "image")).toBe(false);

    // An `image` row with NO per-image rate is refused, and this is a MONEY
    // rule as much as a capability one: `neuronsForUsage` only charges for an
    // image when `unitRate` is set, so such a row would generate images for the
    // cost of the prompt alone. It also cannot come from the parser, which
    // refuses to create the row without that figure — so it only exists via a
    // hand-edit or a restored backup, which is exactly when a silent free lane
    // would go unnoticed.
    expect(modelSupportsTask(row({ task: "image", provider: "google" }), "image")).toBe(false);

    // A Gemini TEXT model reads images and cannot make them, so it is valid for
    // vision and refused for image generation. Offering it for the latter is
    // what produced cover-image features that failed on every call.
    const geminiText = row({ task: "text", provider: "google" });
    expect(modelSupportsTask(geminiText, "vision")).toBe(true);
    expect(modelSupportsTask(geminiText, "image")).toBe(false);
  });
});
