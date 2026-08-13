/**
 * WHICH MODEL RUNS THIS, AND WHO DECIDED.
 *
 * ⚠️ AN APP DECLARES NO MODELS NOW, and every test here is about what that
 * changed. The catalogue is the deployment's: an operator adds a row and every
 * product behind the deployment can run it, without one of them being edited.
 * What an app declares is an ACTION and the LANE it needs.
 *
 * The tests that matter are the ones where the layers DISAGREE — the operator
 * has turned something off, the region refuses it, the workspace picked
 * something that has since gone — because agreeing is the case that works by
 * accident.
 */

import { describe, expect, it } from "vitest";
import {
  chooseModel, modelsFor, modelSuits, planAction, priced,
  type AiSpec, type Catalogue, type ModelSpec,
} from "../src/generation.js";

const model = (over: Partial<ModelSpec> & Pick<ModelSpec, "id" | "lane">): ModelSpec => ({
  provider: "gemini", rate: { input: 1, output: 4 }, markup: 1, enabled: true, ...over,
});

const CATALOGUE: Catalogue = [
  /* Text on both lanes, so a workspace has a real choice to make. */
  model({ id: "gemini-2.5-flash", lane: "text", rate: { input: 1, output: 4 } }),
  model({ id: "@cf/meta/llama", lane: "text", provider: "workers-ai", rate: { input: 1, output: 2 } }),
  /* Vision is its own lane, and a model in it prices what it is given. */
  model({ id: "gemini-2.5-pro", lane: "vision", rate: { input: 4, output: 16 }, thinking: true, attachmentUnits: 1_100 }),
  /* Drawing is a third shape again — priced per picture, no meaningful output. */
  model({ id: "gemini-flash-image", lane: "image", perOutput: 600 }),
];

const APP: AiSpec = {
  actions: {
    draft: { summary: "Draft something", lane: "text", system: "S", maxOutput: 1_000, dailyPerPerson: 10 },
    read: { summary: "Read a picture", lane: "vision", system: "S", maxOutput: 500, dailyPerPerson: 5 },
    draw: { summary: "Draw a picture", lane: "image", system: "S", maxOutput: 1, dailyPerPerson: 2 },
  },
};

const where = (action: string, over: Partial<{ catalogue: Catalogue; permitted: readonly string[] }> = {}) =>
  ({ ai: APP, catalogue: CATALOGUE, action, ...over });

describe("a model can only do what it is priced for", () => {
  /*
    ⚠️ ONE COMPARISON, AND IT USED TO BE THREE INFERENCES. Suitability was
    derived from whether a model happened to carry a per-picture price — which
    is a fact about the METER being read as a fact about the model. A lane says
    it directly, and a model in the wrong one is not a near miss.
  */
  it("matches an action to its own lane and nothing else", () => {
    expect(modelSuits(CATALOGUE[0]!, APP.actions.draft!)).toBe(true);
    expect(modelSuits(CATALOGUE[0]!, APP.actions.read!)).toBe(false);
    expect(modelSuits(CATALOGUE[3]!, APP.actions.draft!)).toBe(false);
    expect(modelSuits(CATALOGUE[2]!, APP.actions.read!)).toBe(true);
  });
});

describe("what a workspace is offered", () => {
  it("offers every eligible model when nothing narrows", () => {
    expect(modelsFor(where("draft")).map((m) => m.id).sort())
      .toEqual(["@cf/meta/llama", "gemini-2.5-flash"]);
  });

  /*
    ⚠️ CHEAPEST FIRST, because the head of this list is what runs for every
    workspace that never opened the screen — which is most of them. Ordered as
    the operator happened to type them, the default price would be one nobody
    decided.
  */
  it("puts the cheapest first, because the first is what runs by default", () => {
    expect(modelsFor(where("draft"))[0]!.id).toBe("@cf/meta/llama");
  });

  /*
    ⚠️ THE OPERATOR'S SWITCH IS ON THE ROW NOW. It was a list of exceptions in
    an app's own configuration, which was right while the catalogue shipped
    inside the app; a row an operator typed exists because somebody meant it.
  */
  it("drops what the operator took out of service", () => {
    const off = CATALOGUE.map((m) => (m.id === "@cf/meta/llama" ? { ...m, enabled: false } : m));
    expect(modelsFor(where("draft", { catalogue: off })).map((m) => m.id)).toEqual(["gemini-2.5-flash"]);
  });

  /*
    ⚠️ THE ALLOW-LIST IS BY PROVIDER, and that changed with the catalogue. By
    model id it was a manifest that had to be redeployed whenever an operator
    added a row — and a provider is what a processing agreement actually names.
  */
  it("drops what the region does not permit, by provider", () => {
    expect(modelsFor(where("draft", { permitted: ["workers-ai"] })).map((m) => m.id))
      .toEqual(["@cf/meta/llama"]);
  });

  it("treats an empty allow-list as a region that narrows nothing", () => {
    expect(modelsFor(where("draft", { permitted: [] })).length).toBe(2);
  });

  /*
    ⚠️ AND A ROW THAT CANNOT BE METERED IS NOT OFFERED. It is a row an operator
    typed wrongly — a rate of zero, an attaching lane with no attachment price —
    and offering it would sell a generation the platform pays for in full.
  */
  it("never offers a row that would be unmetered", () => {
    const broken = [...CATALOGUE, model({ id: "free-lunch", lane: "text", rate: { input: 0, output: 0 } })];
    expect(modelsFor(where("draft", { catalogue: broken })).map((m) => m.id)).not.toContain("free-lunch");
  });

  it("offers nothing for an action this product does not have", () => {
    expect(modelsFor(where("nope"))).toEqual([]);
  });
});

describe("who decided", () => {
  it("runs the cheapest eligible model when nobody chose", () => {
    const out = chooseModel(where("draft"));
    expect(out).toMatchObject({ ok: true, source: "catalogue" });
    expect(out.ok && out.model.id).toBe("@cf/meta/llama");
  });

  /*
    ⚠️ THE WORKSPACE OUTRANKS THE DEPLOYMENT'S OWN CHEAPEST. "Which company
    reads my clients' photographs" is the workspace's decision, and a cheaper
    default is not an answer to it.
  */
  it("uses the workspace's choice over the deployment's cheapest", () => {
    const out = chooseModel({ ...where("draft"), chosen: "gemini-2.5-flash" });
    expect(out).toMatchObject({ ok: true, source: "workspace" });
    expect(out.ok && out.model.id).toBe("gemini-2.5-flash");
  });

  /*
    ⚠️ A PICK THAT IS NO LONGER ELIGIBLE FALLS BACK RATHER THAN FAILING, and
    `source` says so. Pinned to something unreachable, one workspace's
    generation simply stops working and reports a provider error months after
    the change that caused it.
  */
  it("falls back, and says it fell back, when the pick was taken out of service", () => {
    const off = CATALOGUE.map((m) => (m.id === "gemini-2.5-flash" ? { ...m, enabled: false } : m));
    const out = chooseModel({ ...where("draft", { catalogue: off }), chosen: "gemini-2.5-flash" });
    expect(out).toMatchObject({ ok: true, source: "catalogue" });
    expect(out.ok && out.model.id).toBe("@cf/meta/llama");
  });

  it("falls back when the pick cannot do what the action asks", () => {
    const out = chooseModel({ ...where("read"), chosen: "@cf/meta/llama" });
    expect(out.ok && out.model.id).toBe("gemini-2.5-pro");
  });

  /*
    ⚠️ NOTHING ELIGIBLE SPLITS TWO WAYS, and they are different problems: an
    operator who has added no model in that lane is a thing to go and do,
    a region that permits none is a decision to accept. One "unavailable" makes
    both the same shrug.
  */
  it("tells an empty lane from a region that permits nothing", () => {
    expect(chooseModel(where("draft", { catalogue: [] })))
      .toEqual({ ok: false, why: "none_in_lane" });
    expect(chooseModel(where("draft", { permitted: ["nobody"] })))
      .toEqual({ ok: false, why: "none_permitted" });
  });

  it("names an action it does not have rather than guessing one", () => {
    expect(chooseModel(where("nope"))).toEqual({ ok: false, why: "unknown_action" });
  });
});

describe("the markup, which is what the platform is paid", () => {
  /*
    ⚠️ APPLIED EXACTLY ONCE, AND BOTH FAILURES ARE SILENT. Not at all is every
    generation sold at cost forever; twice is a workspace whose credits drain at
    double the rate it was quoted. Neither throws and neither shows up in a
    green suite, which is why the type carries it rather than a convention.
  */
  it("turns cost into price", () => {
    const sold = priced(model({ id: "x", lane: "text", rate: { input: 2, output: 10 }, markup: 1.5 }));
    expect(sold.rate).toEqual({ input: 3, output: 15 });
  });

  it("marks a per-output price up the same way", () => {
    const sold = priced(model({ id: "x", lane: "image", perOutput: 600, markup: 2 }));
    expect(sold.perOutput).toBe(1_200);
  });

  /*
    ⚠️ IDEMPOTENT, which is the cheapest possible defence against the one
    mistake this whole type exists for. The multiplier is spent into the numbers
    and the field is left at 1, so applying it again is arithmetic that changes
    nothing.
  */
  it("is not applied twice", () => {
    const once = priced(model({ id: "x", lane: "text", rate: { input: 2, output: 10 }, markup: 1.5 }));
    expect(priced(once).rate).toEqual(once.rate);
    expect(once.markup).toBe(1);
  });

  /* ⚠️ Every model reaching a caller is already priced, because `chooseModel` is
     the only way to one and it marks up on the way out. */
  it("reaches every caller through the choice, never raw", () => {
    const dear = CATALOGUE.map((m) => ({ ...m, markup: 3 }));
    const out = chooseModel(where("draft", { catalogue: dear }));
    expect(out.ok && out.model.rate).toEqual({ input: 3, output: 6 });
    expect(out.ok && out.model.markup).toBe(1);
  });

  /*
    ⚠️ AND THE RESERVE IS COMPUTED FROM THE PRICE, NOT THE COST. Held at cost,
    the settle caps there too and the platform's margin is silently zero on
    every call — a bug with no symptom other than the revenue nobody sees.
  */
  it("is in the reserve, because the reserve is the ceiling on revenue", () => {
    const at = chooseModel(where("draft"));
    const dear = chooseModel(where("draft", { catalogue: CATALOGUE.map((m) => ({ ...m, markup: 2 })) }));
    const cheap = planAction(APP, "draft", "hello", at.ok ? at.model : (() => { throw new Error("no model"); })());
    const sold = planAction(APP, "draft", "hello", dear.ok ? dear.model : (() => { throw new Error("no model"); })());
    expect(sold!.reserve).toBe(cheap!.reserve * 2);
  });
});

describe("the workspace's own words", () => {
  const one = () => {
    const out = chooseModel(where("draft"));
    if (!out.ok) throw new Error("no model");
    return out.model;
  };

  /*
    ⚠️ THE PREAMBLE COMES BACK ON THE RUN, and that is the whole mechanism. A
    caller free to send its own string while this one was measured is the
    two-document defect the `Run` return value exists to prevent, with a second
    author.
  */
  it("is composed into exactly the prompt that will be sent", () => {
    const run = planAction(APP, "draft", "make a plan", one(), "Always answer in German.");
    expect(run!.prompt).toBe("Always answer in German.\n\nmake a plan");
  });

  /*
    ⚠️ AND IT IS PAID FOR. Appended after the reserve it would be a standing
    discount on every call, growing with however much somebody typed into a
    settings box once.
  */
  it("is measured into the reserve", () => {
    const bare = planAction(APP, "draft", "make a plan", one());
    const with_ = planAction(APP, "draft", "make a plan", one(), "x".repeat(400));
    expect(with_!.reserve).toBeGreaterThan(bare!.reserve);
  });

  it("changes nothing when it is empty or only spaces", () => {
    const bare = planAction(APP, "draft", "make a plan", one());
    expect(planAction(APP, "draft", "make a plan", one(), "   ")!.prompt).toBe(bare!.prompt);
    expect(planAction(APP, "draft", "make a plan", one(), "   ")!.reserve).toBe(bare!.reserve);
  });
});
