/**
 * THE CATALOGUE, AND WHAT IT REFUSES BEFORE A REQUEST EXISTS.
 *
 * ⚠️ EVERY FAILURE HERE IS A TRANSFER RATHER THAN AN ERROR. A feature pointed at
 * an undeclared model cannot compute a reserve; a rate of zero holds nothing and
 * charges nothing while the provider still invoices; an absent per-person ceiling
 * is a balance one person empties in an afternoon. None of them throws, none of
 * them is visible in a green suite, and each produces a perfectly successful
 * generation.
 */

import { describe, expect, it } from "vitest";
import { aiProblems, modelFor, planFeature, type AiSpec } from "../src/generation.js";

const spec = (over: Partial<AiSpec> = {}): AiSpec => ({
  models: [{ id: "gemini-2.5-flash", provider: "google", rate: { input: 1, output: 4 } }],
  features: {
    draft: { summary: "Draft", model: "gemini-2.5-flash", system: "You draft things.", maxOutput: 1_000, dailyPerPerson: 20 },
  },
  ...over,
});

/* -------------------------------------------------------------- reserves --- */

describe("what one call holds", () => {
  /*
    ⚠️ THE OUTPUT SIDE IS THE CEILING THE REQUEST ASKS FOR, not what a typical
    answer costs. Budgeting the typical one makes every long answer partly free,
    and long answers are what the expensive requests produce.
  */
  it("holds the whole of what the request may return", () => {
    const run = planFeature(spec(), "draft", "a four-week block for a beginner")!;
    expect(run.reserve).toBeGreaterThanOrEqual(1_000 * 4);
  });

  /*
    ⚠️ THE TEXT AND THE RESERVE COME FROM ONE CALL. Two functions — one producing
    what is sent, one producing what is held — is a shape in which a caller may
    hand a different document to each, and unit tests over the halves separately
    stay green through it.
  */
  it("returns exactly the text that will be sent", () => {
    expect(planFeature(spec(), "draft", "x")!.system).toBe("You draft things.");
  });

  it("widens for a model that reasons before answering", () => {
    const plain = planFeature(spec(), "draft", "x")!.reserve;
    const thinking = planFeature(spec({
      models: [{ id: "gemini-2.5-flash", provider: "google", rate: { input: 1, output: 4 }, thinking: true }],
    }), "draft", "x")!.reserve;
    expect(thinking).toBeGreaterThan(plain);
  });

  it("says nothing rather than guessing for a feature or a model it does not have", () => {
    expect(planFeature(spec(), "nonesuch", "x")).toBeNull();
    expect(planFeature(spec({ features: { draft: { summary: "D", model: "ghost", system: "s", maxOutput: 1, dailyPerPerson: 1 } } }), "draft", "x")).toBeNull();
  });
});

/* -------------------------------------------------------------- refusals --- */

describe("a catalogue that cannot be trusted with money", () => {
  it("accepts one that can", () => {
    expect(aiProblems(spec())).toEqual([]);
  });

  it("says nothing about an app that generates nothing", () => {
    expect(aiProblems(undefined)).toEqual([]);
  });

  it("refuses a feature naming a model this app does not declare", () => {
    const out = aiProblems(spec({ features: { draft: { summary: "D", model: "ghost", system: "s", maxOutput: 10, dailyPerPerson: 5 } } }));
    expect(out.map((p) => p.id)).toEqual(["draft"]);
    expect(out[0]!.why).toContain("ghost");
  });

  /*
    ⚠️ A ZERO RATE IS NOT "FREE", IT IS UNMETERED. The reserve is zero, the
    settle is zero, the balance never moves and the provider still invoices — so
    the model looks like the cheapest in the catalogue until the end of the month.
  */
  it("refuses a model priced at nothing, on either side", () => {
    for (const rate of [{ input: 0, output: 4 }, { input: 1, output: 0 }, { input: -1, output: 4 }]) {
      const out = aiProblems(spec({ models: [{ id: "gemini-2.5-flash", provider: "google", rate }] }));
      expect(out.some((p) => p.why.includes("unmetered")), JSON.stringify(rate)).toBe(true);
    }
  });

  it("refuses the same model declared twice, because which rate applies depends on order", () => {
    const twice = spec({
      models: [
        { id: "gemini-2.5-flash", provider: "google", rate: { input: 1, output: 4 } },
        { id: "gemini-2.5-flash", provider: "google", rate: { input: 9, output: 9 } },
      ],
    });
    expect(aiProblems(twice).some((p) => p.why.includes("twice"))).toBe(true);
  });

  /*
    ⚠️ AN EMPTY SYSTEM TEXT IS NOT A CHEAP FEATURE, it is a reserve computed from
    a document that is not the one sent — because a handler with nothing declared
    to send is a handler that will assemble something.
  */
  it("refuses a feature that declares no system text", () => {
    const out = aiProblems(spec({ features: { draft: { summary: "D", model: "gemini-2.5-flash", system: "   ", maxOutput: 10, dailyPerPerson: 5 } } }));
    expect(out.some((p) => p.why.includes("system text"))).toBe(true);
  });

  it("refuses a feature with no bounded output", () => {
    for (const maxOutput of [0, -5, 1.5]) {
      const out = aiProblems(spec({ features: { draft: { summary: "D", model: "gemini-2.5-flash", system: "s", maxOutput, dailyPerPerson: 5 } } }));
      expect(out.some((p) => p.why.includes("bounded output")), String(maxOutput)).toBe(true);
    }
  });

  /*
    ⚠️ THE PER-PERSON CEILING IS NOT OPTIONAL. An app-wide balance is spent by
    whoever asks first: one person looping a draft empties a workspace's credits
    before anybody else opens the product, and the only signal is a bill.
  */
  it("refuses a feature with no daily ceiling per person", () => {
    for (const dailyPerPerson of [0, -1, 2.5]) {
      const out = aiProblems(spec({ features: { draft: { summary: "D", model: "gemini-2.5-flash", system: "s", maxOutput: 10, dailyPerPerson } } }));
      expect(out.some((p) => p.why.includes("daily ceiling")), String(dailyPerPerson)).toBe(true);
    }
  });
});

/* --------------------------------------------------------------- rates --- */

/**
 * ⚠️ THE DECLARED CATALOGUE IS A FLOOR. A manifest is a deploy and a price change
 * is not, so a shared, correctable rate wins — and an out-of-date rate is not a
 * cosmetic error: the reserve caps what may be charged, so every unit it fails to
 * count is a unit the platform pays for and nobody is billed.
 */
describe("what a model costs, corrected centrally", () => {
  it("uses what the app shipped with until somebody says otherwise", () => {
    expect(modelFor(spec(), "gemini-2.5-flash")!.rate).toEqual({ input: 1, output: 4 });
  });

  it("prefers the published rate", () => {
    const live = modelFor(spec(), "gemini-2.5-flash", { "gemini-2.5-flash": { rate: { input: 3, output: 9 } } })!;
    expect(live.rate).toEqual({ input: 3, output: 9 });
    /* ⚠️ And nothing else about the model moves with it. */
    expect(live.provider).toBe("google");
  });

  it("holds more once the published rate is higher", () => {
    const before = planFeature(spec(), "draft", "x")!.reserve;
    const after = planFeature(spec(), "draft", "x", { "gemini-2.5-flash": { rate: { input: 3, output: 12 } } })!.reserve;
    expect(after).toBeGreaterThan(before);
  });

  /*
    ⚠️ WHETHER A MODEL REASONS IS A FACT ABOUT THE MODEL, so it travels with the
    rate — a model that starts thinking and is still budgeted as one that does
    not is an under-count on every call to it.
  */
  it("carries whether it reasons, and leaves the app's answer alone when silent", () => {
    expect(modelFor(spec(), "gemini-2.5-flash", { "gemini-2.5-flash": { rate: { input: 1, output: 4 }, thinking: true } })!.thinking).toBe(true);
    const quiet = spec({ models: [{ id: "gemini-2.5-flash", provider: "google", rate: { input: 1, output: 4 }, thinking: true }] });
    expect(modelFor(quiet, "gemini-2.5-flash", { "gemini-2.5-flash": { rate: { input: 2, output: 8 } } })!.thinking).toBe(true);
  });

  /*
    ⚠️ AND A RATE NEVER INVENTS A MODEL. The system text, the output ceiling and
    the daily bound are the app's, and nothing in a catalogue can supply them —
    so a row for something this app does not declare is ignored rather than
    turned into something it can be asked for.
  */
  it("ignores a rate for a model this app does not declare", () => {
    expect(modelFor(spec(), "gpt-9-ultra", { "gpt-9-ultra": { rate: { input: 1, output: 1 } } })).toBeNull();
  });
});


/* ------------------------------------------------------------- a picture --- */

/**
 * ⚠️ A PHOTOGRAPH IS A FLAT BLOCK OF INPUT UNITS AND NONE OF IT IS IN THE TEXT.
 *
 * Providers bill hundreds to thousands of them per picture — more than most
 * prompts — so a vision call metered on its words holds a fraction of what it
 * costs. The cap then settles at that fraction and the platform pays the rest,
 * on every call, with every call succeeding. Nothing throws, nothing logs, and
 * the failure scales with USE: photographing a meal is the feature people reach
 * for most, so the cheapest-looking line runs up the largest invoice.
 */
describe("what a picture costs on the way in", () => {
  const spec: AiSpec = {
    models: [
      { id: "sees", provider: "p", rate: { input: 1, output: 4 }, imageUnits: 1_100 },
      { id: "blind", provider: "p", rate: { input: 1, output: 4 } },
    ],
    features: {
      read: { summary: "s", model: "sees", system: "SYSTEM", maxOutput: 100, dailyPerPerson: 5, takes: "image" },
      words: { summary: "s", model: "sees", system: "SYSTEM", maxOutput: 100, dailyPerPerson: 5 },
    },
  };

  it("adds the picture's units to the reserve", () => {
    const withPicture = planFeature(spec, "read", "porridge")!.reserve;
    const wordsOnly = planFeature(spec, "words", "porridge")!.reserve;
    expect(withPicture - wordsOnly).toBe(1_100);
  });

  /* ⚠️ Only where the FEATURE declared it. A reserve that guessed from the call
     could be computed for one request and an image attached to another. */
  it("adds nothing to a feature that takes no picture", () => {
    expect(planFeature(spec, "words", "porridge")!.reserve)
      .toBe(planFeature({ ...spec, models: [spec.models[1]!, spec.models[0]!] }, "words", "porridge")!.reserve);
  });

  /*
    ⚠️ A VISION FEATURE ON A MODEL THAT PRICES NO PICTURE IS REFUSED AT
    COMPOSITION, because at runtime it is a successful call that silently
    under-charges — the one failure class nothing else here would find.
  */
  it("refuses a manifest whose vision feature runs on a model that prices no picture", () => {
    const bad: AiSpec = {
      models: [{ id: "blind", provider: "p", rate: { input: 1, output: 4 } }],
      features: { read: { summary: "s", model: "blind", system: "S", maxOutput: 10, dailyPerPerson: 1, takes: "image" } },
    };
    expect(aiProblems(bad).map((p) => p.why).join()).toMatch(/prices none/);
  });

  it("says nothing about the same model used without a picture", () => {
    const fine: AiSpec = {
      models: [{ id: "blind", provider: "p", rate: { input: 1, output: 4 } }],
      features: { words: { summary: "s", model: "blind", system: "S", maxOutput: 10, dailyPerPerson: 1 } },
    };
    expect(aiProblems(fine)).toEqual([]);
  });
});

describe("what a picture costs on the way out", () => {
  const spec: AiSpec = {
    models: [{ id: "draws", provider: "p", rate: { input: 1, output: 4 }, perImage: 600 }],
    features: {
      one: { summary: "s", model: "draws", system: "S", maxOutput: 1, dailyPerPerson: 5, produces: "image" },
      four: { summary: "s", model: "draws", system: "S", maxOutput: 1, dailyPerPerson: 5, produces: "image", images: 4 },
    },
  };

  /*
    ⚠️ PRICED PER PICTURE, NOT PER UNIT. Through the token arithmetic an image
    holds the cost of the sentence that asked for it — a fraction of the real
    price — and the platform pays the rest every time.
  */
  it("holds the per-picture price rather than the price of the prompt", () => {
    expect(planFeature(spec, "one", "a kettlebell")!.reserve).toBe(600);
  });

  it("holds the same whatever the prompt is", () => {
    expect(planFeature(spec, "one", "a kettlebell on a gym floor ".repeat(50))!.reserve).toBe(600);
  });

  /* ⚠️ Asking for several at once is the ordinary case, and three of four
     unbudgeted is three the platform pays for. */
  it("counts every picture asked for", () => {
    expect(planFeature(spec, "four", "a kettlebell")!.reserve).toBe(2_400);
  });

  it("refuses a manifest that produces images on a model pricing none", () => {
    const bad: AiSpec = {
      models: [{ id: "text", provider: "p", rate: { input: 1, output: 4 } }],
      features: { one: { summary: "s", model: "text", system: "S", maxOutput: 1, dailyPerPerson: 1, produces: "image" } },
    };
    expect(aiProblems(bad).map((p) => p.why).join()).toMatch(/produces images.*prices none/);
  });

  /* ⚠️ An output ceiling means nothing for a picture, so demanding one would be
     a formality — but a count that is not a whole number of pictures is real. */
  it("does not demand an output ceiling of an image feature", () => {
    const noCeiling: AiSpec = {
      models: [{ id: "draws", provider: "p", rate: { input: 1, output: 4 }, perImage: 600 }],
      features: { one: { summary: "s", model: "draws", system: "S", maxOutput: 0, dailyPerPerson: 1, produces: "image" } },
    };
    expect(aiProblems(noCeiling).map((p) => p.why).join()).not.toMatch(/bounded output/);
  });

  it("refuses half a picture", () => {
    const bad: AiSpec = {
      models: [{ id: "draws", provider: "p", rate: { input: 1, output: 4 }, perImage: 600 }],
      features: { one: { summary: "s", model: "draws", system: "S", maxOutput: 1, dailyPerPerson: 1, produces: "image", images: 0 } },
    };
    expect(aiProblems(bad).map((p) => p.why).join()).toMatch(/whole number of images/);
  });
});
