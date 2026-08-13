/**
 * THE PRICE LISTS, READ — against the real documents.
 *
 * ⚠️ THE FIXTURES ARE THE PAGES THEMSELVES, fetched on 2026-08-14 and committed
 * whole. A parser proved against a fixture somebody wrote is a parser proved
 * against its own author's idea of the page: every shape that actually breaks it
 * — a table with a different column count, a warning line in a new dialect, a
 * section that prices per second rather than per token — is exactly what an
 * invented fixture leaves out.
 *
 * ⚠️ AND THEY WILL GO STALE, WHICH IS THE POINT. When a provider changes the
 * page, refreshing the fixture is how the change is seen — as a diff, in a
 * review, rather than as a sync that quietly parsed nothing at three in the
 * morning.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  dateFrom, geminiLanes, merged, parseCloudflare, parseGemini, planSync, SOURCES,
  type PricedRow,
} from "../src/catalogue-doc.js";
import type { ModelSpec } from "../src/generation.js";
import { modelProblems } from "../src/generation.js";

/*
  ⚠️ `.txt` RATHER THAN `.md`, AND THE EXTENSION IS LOAD-BEARING. These are
  captured pages, not documents: every governed markdown file in this repository
  must declare a `kind` and carries rules about its own shape, and a fixture that
  had to satisfy those would be a fixture somebody had edited — which is exactly
  what makes it stop being the page.
*/
const doc = (name: string) => readFileSync(`test/fixture.${name}.txt`, "utf8");
const CLOUDFLARE = parseCloudflare(doc("cloudflare-pricing"));
const GEMINI = parseGemini(doc("gemini-pricing"));

const byId = (rows: readonly PricedRow[], id: string) => rows.find((m) => m.id === id);

describe("Cloudflare's pricing page", () => {
  /*
    ⚠️ A PARSE THAT YIELDS NOTHING IS THE FAILURE THIS WHOLE SUITE IS ABOUT. The
    page has no stability contract; a floor rather than an exact count is what
    keeps this test about the parser rather than about Cloudflare's release
    schedule.
  */
  it("reads the whole catalogue rather than a handful of it", () => {
    expect(CLOUDFLARE.length).toBeGreaterThan(30);
  });

  /* ⚠️ The section is the lane — the page carries no capability column at all. */
  it("takes the lane from the table a model is in", () => {
    expect(byId(CLOUDFLARE, "@cf/meta/llama-3.3-70b-instruct-fp8-fast")!.lanes).toEqual(["text"]);
    expect(byId(CLOUDFLARE, "@cf/black-forest-labs/flux-1-schnell")!.lanes).toEqual(["image"]);
  });

  /*
    ⚠️ AND A TEXT MODEL THAT IS ALSO A VISION MODEL GETS BOTH. One row per lane is
    not possible — the id is the primary key — and leaving vision off would put a
    vision model in the catalogue with no action able to reach it.
  */
  it("gives a vision model both lanes", () => {
    expect(byId(CLOUDFLARE, "@cf/meta/llama-3.2-11b-vision-instruct")!.lanes).toEqual(["text", "vision"]);
  });

  /*
    ⚠️ WITHIN THE AUDIO TABLE THE UNIT IS THE DIRECTION, not the name. `melotts`
    is text-to-speech priced per minute of what it PRODUCES, so a name heuristic
    puts it on the wrong side; a per-character price is words going in.
  */
  it("tells speaking from listening by what is being counted", () => {
    expect(byId(CLOUDFLARE, "@cf/deepgram/aura-1")!.lanes).toEqual(["speech"]);
    expect(byId(CLOUDFLARE, "@cf/openai/whisper")!.lanes).toEqual(["transcribe"]);
  });

  /*
    ⚠️ THE INPUT AND OUTPUT SIDES ARE PRICED SEPARATELY, because every provider
    prices them differently and a blended rate is wrong in whichever direction
    the request is unbalanced — which for generation is always the output side.
  */
  it("reads both sides of a price, in credits", () => {
    const llama = byId(CLOUDFLARE, "@cf/meta/llama-3.3-70b-instruct-fp8-fast")!;
    /* $0.293 and $2.253 per M tokens, one credit to the US cent. */
    expect(llama.rate.input).toBeCloseTo(0.0000293, 9);
    expect(llama.rate.output).toBeCloseTo(0.0002253, 9);
    expect(llama.rate.output).toBeGreaterThan(llama.rate.input);
  });

  /* ⚠️ Embeddings and the rest are skipped: no action can reach a lane the meter
     cannot price, so importing one is a row nobody can ever use. */
  it("imports nothing it cannot put in a lane", () => {
    expect(byId(CLOUDFLARE, "@cf/baai/bge-base-en-v1.5")).toBeUndefined();
  });
});

describe("Google's pricing page", () => {
  it("reads the whole catalogue rather than a handful of it", () => {
    expect(GEMINI.length).toBeGreaterThan(20);
  });

  /*
    ⚠️ A GEMINI TEXT MODEL IS A VISION MODEL. "Input price … $0.30 (text / image
    / video / audio)" is one row on one model, which is exactly why a model
    carries a LIST of lanes rather than one.
  */
  it("gives a text model the vision lane too, because the page prices it for both", () => {
    expect(byId(GEMINI, "gemini-2.5-flash")!.lanes).toEqual(["text", "vision"]);
  });

  it("puts drawing, speaking and video in their own lanes", () => {
    expect(byId(GEMINI, "gemini-2.5-flash-image")!.lanes).toEqual(["image"]);
    expect(byId(GEMINI, "gemini-3.1-flash-tts-preview")!.lanes).toEqual(["speech"]);
    expect(byId(GEMINI, "veo-3.1-generate-preview")!.lanes).toEqual(["video"]);
  });

  /*
    ⚠️ THE PAID COLUMN, NEVER THE FREE ONE. "Free of charge" read as zero is an
    unmetered model: the reserve holds nothing, the settle charges nothing, and
    the provider invoices as usual — which is the single most expensive way this
    parser could be wrong.
  */
  it("reads the paid price and never the free tier", () => {
    const flash = byId(GEMINI, "gemini-2.5-flash")!;
    expect(flash.rate.input).toBeGreaterThan(0);
    expect(flash.rate.output).toBeGreaterThan(flash.rate.input);
  });

  /*
    ⚠️ THE WARNING LINE IS THE VALUABLE PART, and this is the whole reason the
    sync exists rather than a person checking. Every call to a shut-down model
    fails, for every workspace pinned to it, on a date nobody was watching.
  */
  it("reads the shut-down date off the deprecation notice", () => {
    expect(byId(GEMINI, "gemini-2.0-flash")!.retiresAt).toBe("2026-06-01");
    expect(byId(GEMINI, "imagen-4.0-generate-001")!.retiresAt).toBe("2026-08-17");
  });

  /*
    ⚠️ AND THE REPLACEMENT IS NAMED IN THE PAGE. "migrate to Gemini 2.5 Flash
    Image" resolves through the page's own anchor to a model id — so the close
    alternative is a fact to read rather than a judgement somebody makes under
    time pressure, or a fall to whatever happens to be cheapest.
  */
  it("reads what to move to, resolved to a model id", () => {
    expect(byId(GEMINI, "imagen-4.0-generate-001")!.replacedBy).toBe("gemini-2.5-flash-image");
    expect(byId(GEMINI, "veo-2.0-generate-001")!.replacedBy).toBe("veo-3.1-generate-preview");
  });

  it("reads a date in the page's own wording", () => {
    expect(dateFrom("will be shut down on August 17, 2026;")).toBe("2026-08-17");
    expect(dateFrom("has been shut down June 1, 2026.")).toBe("2026-06-01");
    expect(dateFrom("no date here")).toBeUndefined();
  });

  it("puts an id in a lane from the id rather than from a marketing name", () => {
    expect(geminiLanes("veo-3.1-generate-preview")).toEqual(["video"]);
    expect(geminiLanes("gemini-3.1-flash-image")).toEqual(["image"]);
    /* ⚠️ Nothing an action could ask for, so nothing to import. */
    expect(geminiLanes("gemini-embedding-001")).toEqual([]);
  });

  /* ⚠️ Both providers name the same URL the sync fetches. A second copy of a
     source is a test that proves a parser against a page nobody reads. */
  it("names the documents it was proved against", () => {
    expect(SOURCES.gemini).toContain("ai.google.dev");
    expect(SOURCES["workers-ai"]).toContain("developers.cloudflare.com");
  });
});

describe("what a sync would change", () => {
  const have: readonly ModelSpec[] = [
    {
      id: "gemini-2.5-flash", provider: "gemini", lanes: ["text", "vision"],
      rate: { input: 1, output: 4 }, attachmentUnits: 1_100, markup: 1.4, enabled: true, thinking: true,
    },
  ];

  /*
    ⚠️ `markup` AND `enabled` SURVIVE A SYNC, and that is the whole contract. A
    sync corrects what a PROVIDER charges; what a deployment charges on top, and
    which companies it is willing to send data to, are the operator's — and a
    document that grew a row overnight is not that decision.
  */
  it("never touches the markup or whether a model is in service", () => {
    const out = merged(have, GEMINI).find((m) => m.id === "gemini-2.5-flash")!;
    expect(out.markup).toBe(1.4);
    expect(out.enabled).toBe(true);
    expect(out.thinking).toBe(true);
  });

  /*
    ⚠️ A NEW ROW ARRIVES DISABLED AND WITH NO MARKUP, so it is visible, priced,
    refused by `modelProblems`, and unusable until somebody decides. Arriving
    enabled would be the platform choosing a sub-processor on a workspace's
    behalf overnight.
  */
  it("brings a new model in switched off and unpriced", () => {
    const fresh = merged(have, GEMINI).find((m) => m.id !== "gemini-2.5-flash")!;
    expect(fresh.enabled).toBe(false);
    expect(fresh.markup).toBe(0);
    expect(modelProblems(fresh)).toContainEqual(expect.stringContaining("at or below cost"));
  });

  /*
    ⚠️ AN OPERATOR'S OWN ATTACHMENT PRICE SURVIVES TOO. Neither page states one,
    so taking the parsed absence would undo the single number that keeps a vision
    model metered — and the failure is the expensive one, because it succeeds.
  */
  it("keeps an attachment price the page does not state", () => {
    expect(merged(have, GEMINI).find((m) => m.id === "gemini-2.5-flash")!.attachmentUnits).toBe(1_100);
  });

  /* ⚠️ The plan is readable before it is applied, and says which rows MOVED. */
  it("says what is new, what was repriced, and what is retiring", () => {
    const plan = planSync(have, GEMINI);
    expect(plan.some((c) => c.kind === "new")).toBe(true);
    expect(plan.find((c) => c.id === "gemini-2.5-flash")!.kind).toBe("repriced");
    expect(plan.find((c) => c.id === "gemini-2.0-flash")).toMatchObject({
      kind: "new", retiresAt: "2026-06-01",
    });
  });
});
