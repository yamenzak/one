/**
 * WHAT ONE CALL HOLDS, AND WHAT A DECLARATION CAN GET WRONG.
 *
 * ⚠️ EVERY REFUSAL HERE IS A FAILURE THAT COSTS MONEY RATHER THAN THROWING. An
 * action with no system text computes its reserve from a document that is not
 * the one sent; a catalogue row priced at zero is unmetered while the provider
 * invoices as usual; an attaching lane with no attachment price SUCCEEDS every
 * time and the platform pays for every picture. None is visible in a green
 * suite, because each produces a perfectly good generation.
 */

import { describe, expect, it } from "vitest";
import {
  aiProblems, catalogueProblems, modelProblems, planAction, priced,
  type AiSpec, type Catalogue, type ModelSpec,
} from "../src/generation.js";

const model = (over: Partial<ModelSpec> & Pick<ModelSpec, "id" | "lanes">): ModelSpec => ({
  provider: "gemini", rate: { input: 1, output: 4 }, markup: 1, enabled: true, ...over,
});

const TEXT = priced(model({ id: "m", lanes: ["text"], rate: { input: 1, output: 4 } }));
const THINKS = priced(model({ id: "m", lanes: ["text"], rate: { input: 1, output: 4 }, thinking: true }));
const SEES = priced(model({ id: "v", lanes: ["vision"], rate: { input: 1, output: 4 }, attachmentUnits: 1_100 }));
const DRAWS = priced(model({ id: "d", lanes: ["image"], perOutput: 600 }));

const app = (actions: AiSpec["actions"]): AiSpec => ({ actions });

const DRAFT = app({
  draft: { summary: "Draft", lane: "text", system: "S".repeat(100), maxOutput: 1_000, dailyPerPerson: 10 },
});

/* ------------------------------------------------------------- the reserve --- */

describe("what one call holds", () => {
  it("holds the whole of what the request may return", () => {
    /* 100 system + 5 prompt over the Latin ratio = 27 input units, and the full
       thousand on the output side because that is what the request may ask for. */
    expect(planAction(DRAFT, "draft", "hello", TEXT)!.reserve).toBe(Math.ceil(27 * 1 + 1_000 * 4));
  });

  it("returns exactly the two texts that will be sent", () => {
    const run = planAction(DRAFT, "draft", "hello", TEXT)!;
    expect(run.system).toBe("S".repeat(100));
    expect(run.prompt).toBe("hello");
  });

  it("widens for a model that reasons before answering", () => {
    expect(planAction(DRAFT, "draft", "hello", THINKS)!.reserve)
      .toBeGreaterThan(planAction(DRAFT, "draft", "hello", TEXT)!.reserve);
  });

  it("says nothing rather than guessing for an action it does not have", () => {
    expect(planAction(DRAFT, "nope", "hello", TEXT)).toBeNull();
  });
});

/* ------------------------------------------------------------ attachments --- */

describe("a picture, which is nowhere in the text", () => {
  const READ = app({ read: { summary: "Read", lane: "vision", system: "S", maxOutput: 500, dailyPerPerson: 5 } });

  /*
    ⚠️ THE ATTACHMENT'S UNITS COME FROM THE LANE. Providers bill a picture as a
    flat block of input units — more than most prompts — and a vision call
    metered on its words alone holds almost nothing, settles at almost nothing,
    and the platform pays for every photograph. It scales with use, so the
    cheapest-looking row runs the largest invoice.
  */
  it("adds the picture's units to the reserve", () => {
    const blind = priced(model({ id: "v", lanes: ["vision"], rate: { input: 1, output: 4 }, attachmentUnits: 0 }));
    expect(planAction(READ, "read", "what is this", SEES)!.reserve)
      .toBe(planAction(READ, "read", "what is this", blind)!.reserve + 1_100);
  });

  it("adds nothing to an action in a lane that attaches nothing", () => {
    const one = planAction(DRAFT, "draft", "hello", TEXT)!.reserve;
    const two = planAction(DRAFT, "draft", "hello", { ...TEXT, attachmentUnits: 5_000 })!.reserve;
    expect(two).toBe(one);
  });

  it("refuses a catalogue row that is given attachments and prices none", () => {
    expect(modelProblems(model({ id: "v", lanes: ["vision"] })))
      .toEqual([expect.stringContaining("prices none")]);
  });

  it("says nothing about the same price on a lane that does not attach", () => {
    expect(modelProblems(model({ id: "m", lanes: ["text"] }))).toEqual([]);
  });
});

/* --------------------------------------------------------------- pictures --- */

describe("a lane that produces things", () => {
  const DRAW = app({ draw: { summary: "Draw", lane: "image", system: "S", maxOutput: 1, dailyPerPerson: 2 } });

  /*
    ⚠️ PRICED PER THING PRODUCED. Through the unit arithmetic a picture is billed
    at the cost of the sentence that asked for it, so the cap settles at that
    fraction and the platform pays the rest on every image anybody makes.
  */
  it("holds the per-output price rather than the price of the prompt", () => {
    expect(planAction(DRAW, "draw", "a gym at dawn", DRAWS)!.reserve).toBe(600);
  });

  it("holds the same whatever the prompt is", () => {
    expect(planAction(DRAW, "draw", "x".repeat(5_000), DRAWS)!.reserve).toBe(600);
  });

  it("counts every output asked for", () => {
    const four = app({ draw: { summary: "Draw", lane: "image", system: "S", maxOutput: 1, dailyPerPerson: 2, outputs: 4 } });
    expect(planAction(four, "draw", "x", DRAWS)!.reserve).toBe(2_400);
  });

  it("refuses a catalogue row that produces things and prices none of them", () => {
    expect(modelProblems(model({ id: "d", lanes: ["image"] })))
      .toEqual([expect.stringContaining("prices none of them")]);
  });

  it("does not demand an output ceiling of an action that produces things", () => {
    const noCeiling = app({ draw: { summary: "Draw", lane: "image", system: "S", maxOutput: 0, dailyPerPerson: 2 } });
    expect(aiProblems(noCeiling)).toEqual([]);
  });

  it("refuses half a picture", () => {
    const half = app({ draw: { summary: "Draw", lane: "image", system: "S", maxOutput: 1, dailyPerPerson: 2, outputs: 1.5 } });
    expect(aiProblems(half)).toEqual([{ id: "draw", why: expect.stringContaining("whole number") }]);
  });
});

/* ---------------------------------------------------- what an app declares --- */

describe("what an app's own declaration can get wrong", () => {
  it("says nothing about an app that generates nothing", () => {
    expect(aiProblems(undefined)).toEqual([]);
  });

  it("accepts a declaration that is complete", () => {
    expect(aiProblems(DRAFT)).toEqual([]);
  });

  /*
    ⚠️ NO SYSTEM TEXT MEANS THE RESERVE IS COMPUTED FROM A DIFFERENT DOCUMENT
    than the one sent — which is the defect `planRun` returning both halves
    exists to make impossible, arriving from the declaration instead.
  */
  it("refuses an action that sends no system text", () => {
    const blank = app({ a: { summary: "A", lane: "text", system: "   ", maxOutput: 10, dailyPerPerson: 1 } });
    expect(aiProblems(blank)).toEqual([{ id: "a", why: expect.stringContaining("no system text") }]);
  });

  it("refuses an action with no bounded output", () => {
    const loose = app({ a: { summary: "A", lane: "text", system: "S", maxOutput: 0, dailyPerPerson: 1 } });
    expect(aiProblems(loose)).toEqual([{ id: "a", why: expect.stringContaining("no bounded output") }]);
  });

  it("refuses an action with no daily ceiling per person", () => {
    const loose = app({ a: { summary: "A", lane: "text", system: "S", maxOutput: 10, dailyPerPerson: 0 } });
    expect(aiProblems(loose)).toEqual([{ id: "a", why: expect.stringContaining("daily ceiling") }]);
  });

  /*
    ⚠️ AND A LANE THE METER CANNOT PRICE. It arrives from a hand-written
    manifest or a widened union, and an action in one would fall through the
    producing check into the unit arithmetic — which is the wrong shape, applied
    silently.
  */
  it("refuses a lane the meter cannot price", () => {
    const alien = app({ a: { summary: "A", lane: "hologram" as never, system: "S", maxOutput: 10, dailyPerPerson: 1 } });
    expect(aiProblems(alien)).toEqual([{ id: "a", why: expect.stringContaining("not one the meter can price") }]);
  });

  /*
    ⚠️ IT NO LONGER CHECKS MODELS, and that is the point of the split. An app
    declares none, so a manifest cannot name one that does not exist — and what
    a catalogue can get wrong is checked where a catalogue is WRITTEN.
  */
  it("asks nothing about models, because an app declares none", () => {
    expect(Object.keys(DRAFT)).toEqual(["actions"]);
  });
});

/* --------------------------------------------------- what a catalogue can --- */

describe("what a catalogue row can get wrong", () => {
  const ok: Catalogue = [model({ id: "m", lanes: ["text"] }), model({ id: "d", lanes: ["image"], perOutput: 600 })];

  it("accepts a catalogue that can be metered", () => {
    expect(catalogueProblems(ok)).toEqual([]);
  });

  /*
    ⚠️ A ZERO RATE IS NOT "FREE", IT IS UNMETERED. Reserve zero, settle zero,
    balance never moves, provider invoices as usual — so the model looks like
    the cheapest row in the catalogue right up to the end of the month.
  */
  it("refuses a rate of nothing, on either side", () => {
    expect(modelProblems(model({ id: "m", lanes: ["text"], rate: { input: 0, output: 4 } })))
      .toEqual([expect.stringContaining("unmetered")]);
    expect(modelProblems(model({ id: "m", lanes: ["text"], rate: { input: 1, output: 0 } })))
      .toEqual([expect.stringContaining("unmetered")]);
  });

  /*
    ⚠️ AND A MARKUP OF ZERO SELLS EVERY CALL AT COST. It is the one refusal here
    that costs no money to the platform's provider and all of the margin — and
    it is the likeliest to be typed, because zero is what an empty box means.
  */
  it("refuses a markup that sells at or below cost", () => {
    expect(modelProblems(model({ id: "m", lanes: ["text"], markup: 0 })))
      .toEqual([expect.stringContaining("at or below cost")]);
  });

  it("refuses the same model twice, because which rate applies depends on order", () => {
    expect(catalogueProblems([...ok, model({ id: "m", lanes: ["text"] })]))
      .toEqual([{ id: "m", why: expect.stringContaining("twice") }]);
  });

  it("refuses a lane it cannot price", () => {
    expect(modelProblems(model({ id: "m", lanes: ["hologram"] as never })))
      .toContainEqual(expect.stringContaining("not one the meter can price"));
  });
});
