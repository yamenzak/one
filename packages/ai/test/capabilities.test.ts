/**
 * WHICH MODEL CAN SERVE WHICH LANE.
 *
 * The catalog stores ONE `task` per model, and that single column cannot express
 * what a modern multimodal model does. `modelSupportsTask` is the translation,
 * and it had the two image capabilities backwards in a way that is easy to keep
 * getting wrong, so the rule is pinned here against what Google documents:
 *
 *   READING an image — "All Gemini model versions are multimodal and can be
 *   utilized in a wide range of image processing and computer vision tasks."
 *   (ai.google.dev/gemini-api/docs/image-understanding). So a Gemini TEXT model
 *   is a valid Snap-a-Meal model, and Kova relies on that: no Gemini row is ever
 *   tagged `vision`, because Google's pricing page has no such lane.
 *
 *   MAKING an image — four models, the "Nano Banana" family
 *   (ai.google.dev/gemini-api/docs/image-generation). A Gemini text model cannot
 *   return one: `runGeminiImage` asks for `responseModalities: ["IMAGE"]` and
 *   the API refuses on a model with no image modality.
 *
 * The old rule allowed a text model for BOTH, so "Gemini 2.5 Flash Lite" was an
 * offered choice for cover images and failed every single call.
 *
 * The image test keys on `unit_kind === "image"` rather than on the id, because
 * that is what the SYNC derives from the same pricing page: a row only becomes
 * `task: "image"` when Google prices its output "$X per image". A new model in
 * the family therefore works the day it is synced, and a rename cannot silently
 * reclassify anything.
 */

import { describe, expect, it } from "vitest";
import { modelSupportsTask, modelTasks, type AiModelRow } from "../src/generate.js";

const model = (over: Partial<AiModelRow>): AiModelRow => ({
  id: "m", task: "text", label: "M", provider: "google",
  input_rate: 1, output_rate: 1, unit_rate: null, unit_kind: null,
  markup: 3, enabled: 1, is_default: 0,
  ...over,
});

/** A Gemini text model, e.g. `gemini-2.5-flash-lite`. */
const geminiText = model({ id: "gemini-2.5-flash-lite", task: "text-small", provider: "google" });
/** A Nano Banana model: priced per image, so the sync tags it `image`. */
const geminiImage = model({ id: "gemini-2.5-flash-image", task: "image", provider: "google", unit_rate: 100, unit_kind: "image" });
const workersText = model({ id: "@cf/meta/llama-3.1-8b", task: "text", provider: "workers-ai" });

describe("reading an image — every Gemini model can", () => {
  it("a Gemini TEXT model serves vision", () => {
    // The whole Snap-a-Meal path depends on this: the catalog has no
    // `vision`-tagged Gemini row to fall back to.
    expect(modelSupportsTask(geminiText, "vision")).toBe(true);
    expect(modelSupportsTask(model({ task: "text" }), "vision")).toBe(true);
  });

  it("a Gemini IMAGE model serves vision too", () => {
    expect(modelSupportsTask(geminiImage, "vision")).toBe(true);
  });

  it("a WORKERS-AI model never serves vision, whatever its tag says", () => {
    // A property of this codebase, not of the model: the Workers AI branch of
    // `generate()` never attaches `input.image`. Trusting the tag made
    // `@cf/meta/llama-3.2-11b-vision-instruct` a pickable Snap-a-Meal model that
    // failed every call with "model cannot read images".
    expect(modelSupportsTask(workersText, "vision")).toBe(false);
    expect(modelSupportsTask(model({ id: "@cf/meta/llama-3.2-11b-vision-instruct", task: "vision", provider: "workers-ai" }), "vision")).toBe(false);
  });
});

describe("making an image — only the models Google prices per image", () => {
  it("a Gemini IMAGE model can", () => {
    expect(modelSupportsTask(geminiImage, "image")).toBe(true);
  });

  it("a Gemini TEXT model CANNOT — this is the bug this rule exists for", () => {
    // It reads images and cannot make them. Offering it produced a studio
    // configured with a cover-image model that failed on every generation.
    expect(modelSupportsTask(geminiText, "image")).toBe(false);
    expect(modelSupportsTask(model({ task: "text" }), "image")).toBe(false);
  });

  it("a row tagged `image` but not priced per image cannot", () => {
    // Belt and braces on the sync: `parseGeminiCatalog` only tags `image` when
    // the page gives a single "$X per image" figure, so a row without a unit
    // rate never came from that path and is not to be trusted.
    expect(modelSupportsTask(model({ task: "image", unit_kind: null }), "image")).toBe(false);
  });

  it("a WORKERS-AI image model cannot — nothing here can drive it", () => {
    expect(modelSupportsTask(model({ task: "image", provider: "workers-ai", unit_kind: "image" }), "image")).toBe(false);
  });
});

describe("the inert lanes stay inert", () => {
  it.each([
    ["embedding", "embedding"],
    ["speech", "speech"],
    ["transcribe", "transcribe"],
    ["classify", "classify"],
  ])("a %s model serves no generation lane", (_name, task) => {
    const m = model({ task });
    // A WHITELIST, not a blacklist. The blacklist version quietly let a Gemini
    // embedding model satisfy a vision request.
    expect(modelTasks(m)).toEqual([]);
  });

  it("a TTS model is not a vision model just because it is Google's", () => {
    // TTS runs through its own call (`responseModalities: ["AUDIO"]`), never
    // through `generate()`, and only three Gemini models do it at all.
    expect(modelSupportsTask(model({ id: "gemini-2.5-flash-preview-tts", task: "speech" }), "vision")).toBe(false);
  });
});

describe("modelTasks — what the clients are told", () => {
  it("a Gemini text model: text lanes and vision, never image", () => {
    expect(modelTasks(geminiText)).toEqual(["text", "text-small", "vision"]);
  });

  it("a Gemini image model: image and vision, but it is not a writer", () => {
    expect(modelTasks(geminiImage)).toEqual(["vision", "image"]);
  });

  it("a Workers AI text model: the text lanes and nothing else", () => {
    expect(modelTasks(workersText)).toEqual(["text", "text-small"]);
  });

  it("agrees with modelSupportsTask on every lane", () => {
    // The two must not drift: `modelTasks` is what the pickers filter on and
    // `modelSupportsTask` is what the engine enforces. A picker offering what
    // the engine refuses is the whole class of bug being closed here.
    for (const m of [geminiText, geminiImage, workersText, model({ task: "speech" })]) {
      for (const t of ["text", "text-small", "vision", "image"] as const) {
        expect(modelTasks(m).includes(t), `${m.id} / ${t}`).toBe(modelSupportsTask(m, t));
      }
    }
  });
});
