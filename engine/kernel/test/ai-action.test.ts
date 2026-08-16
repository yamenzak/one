/**
 * AN AI ACTION: A LANE, A LETTERHEAD, AND WHOSE WORDS (D19).
 *
 * ⚠️ THE PROMPT RULES ARE THE NOTIFICATION LETTERHEAD'S, AND THAT IS THE POINT.
 * Text somebody may edit that must keep naming only what exists is one problem;
 * two implementations of it is how one surface refuses `{coach}` and the other
 * sends it to a model as a literal brace — invisibly, with a subtly wrong
 * answer rather than a visible failure.
 */

import { describe, expect, it } from "vitest";
import type { AiActionSpec, ModelRow } from "../src/ai.js";
import { MAX_PROMPT, boundModel, refusePrompt, sayPrompt, unknownInPrompt } from "../src/ai.js";

const ACTION: AiActionSpec = {
  lane: "text",
  prompt: "Write a note about {about} for {who}.",
  variables: ["about", "who"],
  maxOutput: 800,
  brandable: true,
};

const SEALED: AiActionSpec = { ...ACTION, brandable: false };

const rows: readonly ModelRow[] = [
  { id: "@cf/meta/small", provider: "cf", task: "text-generation", label: "Small",
    input: 1, output: 3, markup: 0.5, enabled: true, maxOutput: 1000 },
  { id: "gemini-2.5-pro", provider: "google", task: "chat", label: "Pro",
    input: 10, output: 30, markup: 0.5, enabled: true, maxOutput: 4000 },
  { id: "@cf/meta/off", provider: "cf", task: "text-generation", label: "Off",
    input: 1, output: 1, markup: 0.5, enabled: false, maxOutput: 1000 },
  { id: "gemini-vision", provider: "google", task: "image-to-text", label: "Eyes",
    input: 5, output: 5, markup: 0.5, enabled: true, maxOutput: 500 },
];

describe("whose words", () => {
  it("refuses a prompt naming a variable the action does not offer", () => {
    expect(refusePrompt(ACTION, "About {ghost}.", "operator")).toContain("unknown_variable");
    expect(unknownInPrompt(ACTION, "About {ghost} and {about}.")).toEqual(["ghost"]);
  });

  it("refuses empty and oversized", () => {
    expect(refusePrompt(ACTION, "   ", "operator")).toContain("empty");
    expect(refusePrompt(ACTION, "x".repeat(MAX_PROMPT + 1), "operator")).toContain("too_long");
  });

  /* ⚠️ The two levels: an operator may reword any action, a tenant only what
     the app said is theirs — asked here so it is true of every write path. */
  it("lets an operator reword anything and a tenant only what is brandable", () => {
    expect(refusePrompt(SEALED, "Write about {about}.", "operator")).toEqual([]);
    expect(refusePrompt(SEALED, "Write about {about}.", "tenant")).toContain("not_theirs");
    expect(refusePrompt(ACTION, "Write about {about}.", "tenant")).toEqual([]);
  });

  /* ⚠️ An unfilled placeholder is sent to the model as itself, so every
     declared variable resolves to something rather than to a brace. */
  it("fills every named variable, and empties the ones nobody supplied", () => {
    expect(sayPrompt(ACTION.prompt, { about: "squats", who: "Alex" }))
      .toBe("Write a note about squats for Alex.");
    expect(sayPrompt(ACTION.prompt, { about: "squats" }))
      .toBe("Write a note about squats for .");
  });
});

describe("which model", () => {
  it("takes the operator's binding when it is enabled and in the lane", () => {
    expect(boundModel(rows, "text", "gemini-2.5-pro")?.id).toBe("gemini-2.5-pro");
  });

  /*
    ⚠️ A BINDING THAT NO LONGER RESOLVES FALLS BACK RATHER THAN FAILING. A model
    retired by its provider, switched off, or bound in the wrong lane would
    otherwise take every bound action down until somebody edited a row.
  */
  it("falls back to the lane's election on a binding that cannot answer", () => {
    for (const dead of ["@cf/meta/off", "gemini-vision", "gone", null, undefined]) {
      expect(boundModel(rows, "text", dead)?.id, String(dead)).toBe("@cf/meta/small");
    }
  });

  it("answers nothing when the lane has nothing enabled", () => {
    expect(boundModel(rows, "image", null)).toBe(null);
    expect(boundModel([], "text", "@cf/meta/small")).toBe(null);
  });
});
