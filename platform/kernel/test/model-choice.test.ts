/**
 * WHICH MODEL RUNS THIS, AND WHO DECIDED.
 *
 * ⚠️ IT WAS ONE LINE — `feature.model` — so a product could carry a catalogue of
 * two providers and every workspace on every deployment got whichever one the
 * manifest happened to name. The operator's toggles, the workspace's choice and
 * the region's allow-list were three mechanisms that existed and could not
 * change the answer.
 *
 * The tests that matter here are the ones where the layers DISAGREE, because
 * agreeing is the case that works by accident.
 */

import { describe, expect, it } from "vitest";
import { chooseModel, modelsFor, modelSuits, planFeature, type AiSpec } from "../src/generation.js";

const CATALOGUE: AiSpec = {
  models: [
    /* Text on both lanes, so a workspace has a real choice to make. */
    { id: "gemini-2.5-flash", provider: "gemini", rate: { input: 1, output: 4 }, imageUnits: 1_100 },
    { id: "@cf/meta/llama", provider: "workers-ai", rate: { input: 1, output: 2 } },
    /* Vision on one lane only: no `imageUnits` means a picture cannot be priced. */
    { id: "gemini-2.5-pro", provider: "gemini", rate: { input: 4, output: 16 }, thinking: true, imageUnits: 1_100 },
    /* Drawing is a third shape again — priced per picture, no meaningful output. */
    { id: "gemini-flash-image", provider: "gemini", rate: { input: 1, output: 4 }, perImage: 600 },
  ],
  features: {
    draft: { summary: "Draft something", model: "@cf/meta/llama", system: "S", maxOutput: 1_000, dailyPerPerson: 10 },
    read: { summary: "Read a picture", model: "gemini-2.5-flash", system: "S", maxOutput: 500, dailyPerPerson: 5, takes: "image" },
    draw: { summary: "Draw a picture", model: "gemini-flash-image", system: "S", maxOutput: 100, dailyPerPerson: 2, produces: "image" },
  },
};

/* ------------------------------------------------------------- capability --- */

describe("what a model can be asked to do is derived from what it costs", () => {
  const model = (id: string) => CATALOGUE.models.find((m) => m.id === id)!;

  /*
    ⚠️ DERIVED FROM THE METER RATHER THAN DECLARED BESIDE IT. A `capabilities`
    field can disagree with the arithmetic, and it disagrees expensively: a
    vision feature on a text model holds a reserve computed from the prompt
    alone, settles at almost nothing, and the platform pays for every picture.
  */
  it("refuses a model that prices no picture for a feature that sends one", () => {
    expect(modelSuits(model("@cf/meta/llama"), CATALOGUE.features.read!)).toBe(false);
    expect(modelSuits(model("gemini-2.5-flash"), CATALOGUE.features.read!)).toBe(true);
  });

  it("refuses a model that cannot draw for a feature that draws", () => {
    expect(modelSuits(model("gemini-2.5-flash"), CATALOGUE.features.draw!)).toBe(false);
    expect(modelSuits(model("gemini-flash-image"), CATALOGUE.features.draw!)).toBe(true);
  });

  /* ⚠️ And the other way: a model priced per picture is not a text model, so it
     is never offered for one — it has no output price that means anything. */
  it("refuses a drawing model for a text feature", () => {
    expect(modelSuits(model("gemini-flash-image"), CATALOGUE.features.draft!)).toBe(false);
  });
});

/* ----------------------------------------------------------- what is offered --- */

describe("what a workspace may choose from", () => {
  it("offers every eligible model when nothing narrows", () => {
    expect(modelsFor({ ai: CATALOGUE, feature: "draft" }).map((m) => m.id))
      .toEqual(["gemini-2.5-flash", "@cf/meta/llama", "gemini-2.5-pro"]);
  });

  it("drops what the operator turned off", () => {
    expect(modelsFor({ ai: CATALOGUE, feature: "draft", disabled: ["@cf/meta/llama"] }).map((m) => m.id))
      .toEqual(["gemini-2.5-flash", "gemini-2.5-pro"]);
  });

  /*
    ⚠️ THE REGION IS THE ONE THAT OUTRANKS EVERYTHING, and it was the one that
    never applied. `bindingsFor` read an allow-list from a runtime option no
    caller supplied, so every region resolved the app-wide set and residency
    stopped at storage.
  */
  it("drops what the region does not permit", () => {
    expect(modelsFor({ ai: CATALOGUE, feature: "draft", permitted: ["@cf/meta/llama"] }).map((m) => m.id))
      .toEqual(["@cf/meta/llama"]);
  });

  it("treats an empty allow-list as a region that narrows nothing", () => {
    expect(modelsFor({ ai: CATALOGUE, feature: "draft", permitted: [] })).toHaveLength(3);
  });

  it("offers nothing for a feature this product does not have", () => {
    expect(modelsFor({ ai: CATALOGUE, feature: "invented" })).toEqual([]);
  });
});

/* ---------------------------------------------------------------- decided --- */

describe("who decided which model runs", () => {
  it("uses the manifest's default when nobody chose", () => {
    const out = chooseModel({ ai: CATALOGUE, feature: "draft" });
    expect(out).toMatchObject({ ok: true, source: "manifest" });
    expect(out.ok && out.model.id).toBe("@cf/meta/llama");
  });

  it("uses the workspace's choice over the product's opinion", () => {
    const out = chooseModel({ ai: CATALOGUE, feature: "draft", chosen: "gemini-2.5-flash" });
    expect(out).toMatchObject({ ok: true, source: "workspace" });
    expect(out.ok && out.model.id).toBe("gemini-2.5-flash");
  });

  /*
    ⚠️ A CHOICE THAT IS NO LONGER ELIGIBLE MUST NOT PIN A WORKSPACE TO SOMETHING
    UNREACHABLE. An operator's toggle or a region's allow-list would otherwise
    leave one workspace's generation broken, reported as a provider error, months
    after the change that caused it.
  */
  it("falls back to the default when the workspace's pick was turned off", () => {
    const out = chooseModel({ ai: CATALOGUE, feature: "draft", chosen: "gemini-2.5-flash", disabled: ["gemini-2.5-flash"] });
    expect(out).toMatchObject({ ok: true, source: "manifest" });
    expect(out.ok && out.model.id).toBe("@cf/meta/llama");
  });

  it("falls back when the pick cannot do what the feature asks", () => {
    const out = chooseModel({ ai: CATALOGUE, feature: "read", chosen: "@cf/meta/llama" });
    expect(out).toMatchObject({ ok: true, source: "manifest" });
  });

  /*
    ⚠️ AND THE PRODUCT'S OWN DEFAULT IS SUBJECT TO THE REGION TOO. An app naming
    a model the EU does not permit would otherwise run it there for every
    workspace that never chose one — which is the exact promise residency is.
  */
  it("refuses rather than running the manifest's default where the region forbids it", () => {
    const out = chooseModel({ ai: CATALOGUE, feature: "draft", permitted: ["gemini-flash-image"] });
    expect(out).toEqual({ ok: false, why: "none_permitted" });
  });

  /* ⚠️ Never substituting: quietly picking another model sends a workspace's
     data to a company it did not choose, at a price nobody quoted. */
  it("picks nothing for a workspace when nothing is permitted", () => {
    expect(chooseModel({ ai: CATALOGUE, feature: "draft", permitted: ["nothing-real"] }))
      .toEqual({ ok: false, why: "none_permitted" });
  });

  it("names an unknown feature and an unknown default separately", () => {
    expect(chooseModel({ ai: CATALOGUE, feature: "invented" })).toEqual({ ok: false, why: "unknown_feature" });
    const broken: AiSpec = { ...CATALOGUE, features: { draft: { ...CATALOGUE.features.draft!, model: "not-in-catalogue" } } };
    expect(chooseModel({ ai: broken, feature: "draft" })).toEqual({ ok: false, why: "unknown_model" });
  });
});

/* ----------------------------------------------------------- the reserve --- */

describe("the reserve is computed for the model that will actually run", () => {
  /*
    ⚠️ A RESERVE IS A CEILING ON REVENUE. `settle` caps the charge at what was
    held, so budgeting the manifest's cheap default while running a workspace's
    dearer choice means the platform pays the difference on every call — silently,
    because nothing fails and every number looks right.
  */
  it("holds more for a dearer model than for the default", () => {
    const cheap = planFeature(CATALOGUE, "draft", "a prompt", {})!;
    const dear = planFeature(CATALOGUE, "draft", "a prompt", {}, "gemini-2.5-pro")!;
    expect(dear.reserve).toBeGreaterThan(cheap.reserve);
  });

  it("still holds the default's price when no model is named", () => {
    expect(planFeature(CATALOGUE, "draft", "a prompt", {})!.reserve)
      .toBe(planFeature(CATALOGUE, "draft", "a prompt", {}, "@cf/meta/llama")!.reserve);
  });

  it("refuses a model that is not in the catalogue rather than guessing one", () => {
    expect(planFeature(CATALOGUE, "draft", "a prompt", {}, "not-real")).toBe(null);
  });
});
