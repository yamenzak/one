/**
 * THE RESERVE MUST COVER WHAT THE RUN ASKS FOR.
 *
 * ── Why this is a test and not a comment ────────────────────────────────────
 *
 * `settle` caps the charge at the reserve (`Math.min(held.credits, actual)`), so
 * the reserve is not an estimate in the ordinary sense — it is a CEILING ON
 * REVENUE. Every token it fails to count is a token the platform pays for and
 * the workspace does not, silently, on every call, forever. There is no failing
 * request, no log line, and no screen anywhere that looks wrong.
 *
 * Four defects were found by measuring rather than by reading, and every one of
 * them is the same shape: two plausible numbers in two functions, neither wrong
 * on its own terms.
 *
 *   THE OUTPUT CAP DISAGREED WITH ITSELF. The run asked Gemini for 32,768
 *   output tokens on a slide; the reserve budgeted 8,000. A FOUR-FOLD
 *   under-reserve on the most-used lane in the product.
 *
 *   THE SYSTEM PROMPT WAS NOT COUNTED. A flat `+200` tokens stood in for
 *   `SLIDE_SYSTEM` (3,207 chars ≈ 1,283 tokens) and `+1500` for
 *   `layoutSystem()` (6,875 chars ≈ 2,750, most of it
 *   `describeWidgets(WIDGET_REGISTRY)`).
 *
 *   FOUR CHARS PER TOKEN. The English average, used as a bound. Arabic runs
 *   nearer two, so an Arabic prompt reserved about half its real input.
 *
 *   NO THINKING BUDGET. Gemini 2.5+ bills `thoughtsTokenCount` at the output
 *   rate from a budget the request does not cap, so reserving the answer cap
 *   under-reserves every thinking model.
 *
 * The last three are `@4dl/ai`'s `estimateUsage`, which Scena now delegates to.
 * The first is `outputCap`, which is one function precisely so a caller that
 * changes the cap necessarily changes what it reserves.
 *
 * ⚠️ These assertions are RELATIONS, not magic numbers. Pinning "1,283 tokens"
 * would fail the day somebody edits a word of the system prompt, and would be
 * waived. What must hold is that the reserve covers the run.
 */

import { describe, expect, it } from "vitest";
import { estimateUsage as sharedEstimate } from "@4dl/ai";
import { outputCap, planRun } from "../src/ai.js";
import type { GenerateRequest } from "../src/ai.js";

describe("the output cap is one number", () => {
  it("gives Gemini the long budget its slides actually use", () => {
    // The run asks for this; before `outputCap` existed the reserve did not.
    expect(outputCap("text", "google", undefined)).toBe(32768);
    expect(outputCap("layout", "google", undefined)).toBe(8192);
  });

  it("keeps Workers AI on the shorter one, which is a fact about the models", () => {
    // An uncapped Workers AI model rambles for minutes and trips the request
    // timeout long before 32k, so the caps differ by provider on purpose.
    expect(outputCap("text", "workers-ai", undefined)).toBe(8000);
    expect(outputCap("layout", "workers-ai", undefined)).toBe(4096);
  });

  it("lets an explicit request win, for both providers and both tasks", () => {
    for (const provider of ["google", "workers-ai"]) {
      for (const task of ["text", "layout"] as const) {
        expect(outputCap(task, provider, { maxTokens: 512 }), `${provider}/${task}`).toBe(512);
      }
    }
  });
});

describe("the reserve covers the run", () => {
  const SYSTEM = "x".repeat(3207); // SLIDE_SYSTEM's real size
  const PROMPT = "a poster for the summer sale";

  it("counts the SYSTEM prompt, which a flat pad did not", () => {
    const withSystem = sharedEstimate({ system: SYSTEM, prompt: PROMPT, maxOutputTokens: 8000, provider: "workers-ai" });
    const without = sharedEstimate({ system: "", prompt: PROMPT, maxOutputTokens: 8000, provider: "workers-ai" });
    // The old pad was 200 tokens against a system prompt worth ~1,283.
    expect(withSystem.inputTokens! - orZero(without.inputTokens)).toBeGreaterThan(1000);
  });

  it("reserves the OUTPUT CAP the run will ask for, not a smaller default", () => {
    const gemini = sharedEstimate({
      system: SYSTEM,
      prompt: PROMPT,
      maxOutputTokens: outputCap("text", "google", undefined),
      provider: "google",
    });
    // 32,768 asked for, times the thinking multiplier. The old reserve was
    // 8,000 flat — under by more than an order of magnitude once thinking is
    // counted.
    expect(gemini.outputTokens!).toBeGreaterThanOrEqual(32768);
  });

  it("budgets a thinking model above a non-thinking one at the same cap", () => {
    const cap = 4000;
    const google = sharedEstimate({ system: SYSTEM, prompt: PROMPT, maxOutputTokens: cap, provider: "google" });
    const cf = sharedEstimate({ system: SYSTEM, prompt: PROMPT, maxOutputTokens: cap, provider: "workers-ai" });
    expect(google.outputTokens!).toBeGreaterThan(cf.outputTokens!);
  });

  it("does not assume four characters per token", () => {
    // The property that matters for a non-Latin prompt: the estimator must be
    // more conservative than the English average, not equal to it.
    const chars = 1000;
    const u = sharedEstimate({ system: "", prompt: "ب".repeat(chars), maxOutputTokens: 1, provider: "workers-ai" });
    expect(u.inputTokens!).toBeGreaterThan(chars / 4);
  });
});

/** `inputTokens` is optional on `Usage` — a unit-metered lane has none. */
function orZero(n: number | undefined): number {
  return n ?? 0;
}

/**
 * ⚠️ THE JOIN, which is where the defect actually lived.
 *
 * The assertions above check the two halves. A mutation replacing `generate`'s
 * system prompt with `""` passed every one of them, because they call the
 * estimator directly and hand it a system prompt themselves — so nothing said
 * the caller passes one.
 *
 * `planRun` removes that: it builds the system prompt AND estimates against it,
 * so the caller cannot supply a different text to each. These assertions run the
 * real builders — `SLIDE_SYSTEM`, `widgetSystem`, `layoutSystem()` with the
 * whole widget registry inside it — and read what falls out.
 */
const req = (over: Partial<GenerateRequest> = {}): GenerateRequest => ({
  task: "text",
  modelId: "m",
  prompt: "a poster for the summer sale",
  ...over,
});

describe("planRun ties the prompt to the reserve", () => {
  /**
   * The measurement, against the pad it replaces.
   *
   * ⚠️ Compared to a system-less estimate of the SAME prompt rather than to
   * another surface's. The first draft compared a slide against a widget and
   * failed — the widget contract turns out to be the LONGER of the two, because
   * it carries the shared style notes and the font list — which is a good
   * reminder that "obviously bigger" is not a measurement. What has to hold is
   * that the system prompt reaches the reserve at all, and by far more than the
   * 200 tokens that used to stand in for it.
   */
  for (const [label, over] of [
    ["slide", {}],
    ["widget", { options: { surface: "widget" as const, width: 400, height: 300 } }],
    ["layout", { task: "layout" as const, options: { designW: 1920, designH: 1080, currentWidgets: [] } }],
  ] as const) {
    it(`counts the ${label} system prompt, which a flat +200 pad did not`, () => {
      const plan = planRun(req(over), "workers-ai", "");
      const bare = sharedEstimate({ system: "", prompt: req().prompt, maxOutputTokens: 8000, provider: "workers-ai" });
      expect(plan.system.length, "the builder produced nothing").toBeGreaterThan(150);
      expect(plan.usage.inputTokens! - orZero(bare.inputTokens)).toBeGreaterThan(200);
    });
  }

  it("reserves the cap the run will ASK FOR, for every task and provider", () => {
    // The original bug, exactly: the run asked Gemini for 32,768 and the reserve
    // budgeted 8,000. One function now produces both.
    for (const provider of ["google", "workers-ai"]) {
      for (const task of ["text", "layout"] as const) {
        const plan = planRun(req({ task, options: task === "layout" ? { designW: 1920, designH: 1080 } : undefined }), provider, "");
        expect(plan.usage.outputTokens!, `${provider}/${task}`).toBeGreaterThanOrEqual(outputCap(task, provider, undefined));
      }
    }
  });

  it("folds the brand brief in, so a branded workspace reserves for it too", () => {
    const plain = planRun(req(), "workers-ai", "");
    const branded = planRun(req(), "workers-ai", "Brand: deep green, generous spacing, Figtree.".repeat(20));
    expect(branded.usage.inputTokens!).toBeGreaterThan(plain.usage.inputTokens!);
  });

  it("leaves the unit-metered lanes alone — they are not token estimates", () => {
    // tts bills per character, image per tile, music per second. The shared
    // token estimator has no equivalent and the shapes do not correspond.
    expect(planRun(req({ task: "tts", prompt: "hello" }), "workers-ai", "").system).toBe("");
    expect(planRun(req({ task: "tts", prompt: "hello" }), "workers-ai", "").usage.chars).toBe(5);
    expect(planRun(req({ task: "image" }), "workers-ai", "").usage.tiles).toBeGreaterThan(0);
  });
});
