/**
 * WHICH LANE A MODEL ANSWERS, FROM A NAME SOMEBODY ELSE CHOSE.
 *
 * ⚠️ THE ALIAS TABLE IS HYPHENATED AND A CATALOGUE IS NOT. Cloudflare publishes
 * DISPLAY names — "Text Generation", "Automatic Speech Recognition", "Text
 * Embeddings" — so a lowercased match against `text-generation` finds nothing.
 * The lanes whose published name happens to be one hyphenated word worked, and
 * the rest silently did not: four of six lanes empty on a catalogue holding
 * models for all six, with every one of those models listed on the screen
 * saying nothing would ever select it.
 *
 * ⚠️ AND A FAULT IS SOMEBODY'S DECISION CONTRADICTING ITSELF, never a model we
 * simply do not sell. A provider ships classifiers, translators, rerankers and
 * detectors; reported per row, sixty of them were fifty red cards above the list
 * and the one entry that mattered was somewhere inside them.
 */

import { describe, expect, it } from "vitest";
import type { ModelRow } from "../src/ai.js";
import { LANES, inLane, laneOf, refuseCatalogue, taskKey } from "../src/ai.js";

const row = (over: Partial<ModelRow> = {}): ModelRow => ({
  id: "@cf/meta/small", provider: "workers-ai", task: "text-generation", label: "Small",
  meter: "token", input: 1, output: 3, multiplier: 5, enabled: false, maxOutput: 1000,
  ...over,
});

describe("a provider's name for a task", () => {
  /* ⚠️ THE EXACT STRINGS CLOUDFLARE PUBLISHES, and the two-word ones are the
     half that did not resolve. */
  it("resolves the display names a catalogue actually carries", () => {
    expect(laneOf("Text Generation")).toBe("text");
    expect(laneOf("Automatic Speech Recognition")).toBe("listen");
    expect(laneOf("Text Embeddings")).toBe("embed");
    expect(laneOf("Text-to-Image")).toBe("image");
    expect(laneOf("Image-to-Text")).toBe("vision");
  });

  it("normalises the same way whatever the spelling", () => {
    for (const said of ["Text Generation", "text generation", "TEXT_GENERATION", " text-generation "]) {
      expect(taskKey(said), said).toBe("text-generation");
      expect(laneOf(said), said).toBe("text");
    }
  });

  /* ⚠️ AND A TASK WE SELL NO LANE FOR IS STILL NOTHING. Widening the match must
     not widen it into matching everything. */
  it("says nothing for a task no lane of ours answers", () => {
    expect(laneOf("Text Classification")).toBeNull();
    expect(laneOf("Object Detection")).toBeNull();
    expect(laneOf("Translation")).toBeNull();
  });

  /* ⚠️ MEMBERSHIP GOES THROUGH IT TOO. Normalising only the lookup leaves every
     row already stored unreachable — a fix that appears not to work. */
  it("counts a row into its lane whatever the catalogue called it", () => {
    expect(inLane([row({ task: "Text Generation" })], "text")).toHaveLength(1);
  });

  it("has a lane for every name in the list", () => {
    for (const lane of LANES) expect(laneOf(lane), lane).toBe(lane);
  });
});

describe("what the catalogue reports as a fault", () => {
  /* ⚠️ Not on offer is not a problem — see the header. */
  it("is silent about a model in no lane while it is switched off", () => {
    expect(refuseCatalogue([row({ task: "Text Classification" })], [])).toEqual([]);
  });

  /* ⚠️ Switched on, it IS a contradiction: sold, and unpickable. */
  it("names one switched on into no lane", () => {
    const out = refuseCatalogue([row({ task: "Text Classification", enabled: true })], []);
    expect(out.map((f) => f.why)).toEqual(["unknown_task"]);
  });

  /* ⚠️ A retired row is not somebody's live decision, whatever its task. */
  it("stays silent about a retired one", () => {
    const gone = row({ task: "Text Classification", enabled: true, retired: true });
    expect(refuseCatalogue([gone], [])).toEqual([]);
  });

  /* ⚠️ THE ENTRY THE NOISE WAS BURYING. A lane an app asks for with nothing
     enabled is the one thing on this screen somebody has to act on. */
  it("still names a lane nothing answers", () => {
    const out = refuseCatalogue([row({ task: "Text Classification" })], ["text"]);
    expect(out.map((f) => f.why)).toEqual(["lane_with_no_model"]);
  });
});
