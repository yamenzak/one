/**
 * THE MODEL CATALOG, AFTER IT BECAME `@4dl/ai`'s.
 *
 * Scena carried its own `ai_models`: a short slug for an `id` with the real
 * provider path in a `cf_model` column beside it. That single difference is what
 * kept it off the shared catalog for three stages, and what it cost was not
 * duplication — it was the live pricing-page sync, the retirement sweep, the
 * shared publication a new app seeds from, and the cross-app selection
 * broadcast. In their place: a hand-written syncer behind a button that once
 * reported "17 updated" having fetched nothing at all.
 *
 * Every assertion here is against a REAL D1 through the real seed, because every
 * failure mode in this migration is silent:
 *
 *   • an id that is a slug, not a path, resolves at no provider — and surfaces as
 *     "generation failed", two steps from its cause
 *   • a lane the app declares but the catalog leaves DISABLED is a voice a
 *     workspace can select and never use
 *   • a lane with no elected `is_default` picks a model by database order, so the
 *     console can show one default while the generator uses another
 *   • a `speech`-tagged Google row is invisible to a `tts` request, which reads
 *     as "the model I chose in settings is being ignored"
 *
 * None of those throws. All four are a wrong answer wearing a correct one's face.
 */

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { lanesFor, runnableLanes } from "@4dl/ai";
import { ensureSchema } from "../src/db.js";
import { defaultModelForTask, ensureBilling, getModel, listModels, providerOf } from "../src/billing-store.js";
import { CONFIG_DEFAULTS, SCENA_MODEL_FLOOR } from "../src/billing-seed.js";

async function catalog() {
  await ensureSchema(env.DB);
  await ensureBilling(env.DB);
  return listModels(env.DB);
}

describe("the id is the provider path", () => {
  it("seeds every curated row under the string the provider answers to", async () => {
    const rows = await catalog();
    expect(rows.length).toBeGreaterThanOrEqual(SCENA_MODEL_FLOOR.length);
    for (const seed of SCENA_MODEL_FLOOR) {
      const row = rows.find((r) => r.id === seed.id);
      expect(row, `${seed.id} is missing from the seeded catalog`).toBeTruthy();
      expect(row!.provider).toBe(seed.provider);
    }
  });

  /*
    A Workers AI path is `@cf/<vendor>/<model>` and a Google one is a bare id.
    Asserted because the whole migration rests on it: `providerOf` derives a
    provider from an id, `/api/ai/models` hides Google rows without a key, and
    `ai.ts` routes to Gemini on the `provider` column. A slug that slipped back
    in would be classified as Google and sent to Google's API.
  */
  it("has no slugs left — every Workers AI row is an @cf/ path", async () => {
    const rows = await catalog();
    const wrong = rows.filter((r) => providerOf(r.id) !== r.provider);
    expect(wrong.map((r) => `${r.id} (${r.provider})`)).toEqual([]);
    for (const r of rows.filter((r) => r.provider === "workers-ai")) {
      expect(r.id.startsWith("@cf/"), `${r.id} is tagged workers-ai but is not an @cf/ path`).toBe(true);
    }
  });

  /*
    ⚠️ `lyria-3-clip` WAS NOT A MODEL. Scena's slug and its `cf_model` were the
    same invented string, and `cf_model` is what went into the request URL — so
    every music generation on that row 404'd at Google. `lyria-002` is the id
    Google publishes, and it is the id `@4dl/ai`'s own floor carries, so the two
    apps name the same model the same way and a shared catalog can line up.
  */
  it("names Lyria what Google names it", async () => {
    expect(await getModel(env.DB, "lyria-002")).toBeTruthy();
    expect(await getModel(env.DB, "lyria-3-clip")).toBeNull();
  });
});

describe("the lanes Scena declared", () => {
  it("includes music and BOTH names for text-to-speech", () => {
    // `configureAiLanes(["text", "image", "tts", "music"])` in billing-seed.ts.
    // `speech` arrives with `tts` through `LANE_ALIASES`; declaring one name and
    // not the other is the mistake that table exists to prevent.
    expect([...runnableLanes()].sort()).toEqual(["image", "music", "speech", "text", "tts"]);
  });

  /*
    THE DEFECT `configureAiLanes` WAS BUILT FOR.

    The runnable set used to be a constant holding Kova's five lanes, which has
    no `music` and does not run Cloudflare's `tts`. So on Scena's catalog every
    voice it actually sells — Deepgram Aura, Workers AI — arrived priced,
    listed, and switched OFF, and so did every music bed.
  */
  it("catalogues Scena's own voices and music beds ENABLED", async () => {
    const rows = await catalog();
    for (const id of ["@cf/deepgram/aura-1", "@cf/minimax/music-01", "gemini-2.5-flash-preview-tts"]) {
      const row = rows.find((r) => r.id === id);
      expect(row, `${id} is missing`).toBeTruthy();
      expect(row!.enabled, `${id} is catalogued disabled — the lane is not declared runnable`).toBe(1);
    }
  });
});

describe("every runnable lane has exactly one default", () => {
  /*
    `modelForTask` and `defaultModelForTask` both break ties on `is_default`
    alone. With none set, forty rows of `is_default = 0` mean the winner is
    whatever order D1 returns — an answer that is stable enough to look
    deliberate and has nothing behind it.
  */
  it("elects one, and only one, per lane the catalog holds", async () => {
    const rows = await catalog();
    for (const lane of runnableLanes()) {
      const inLane = rows.filter((r) => r.task === lane && r.enabled === 1);
      if (inLane.length === 0) continue; // `speech`-only catalogs are legitimate
      const defaults = inLane.filter((r) => r.is_default === 1);
      expect(defaults.length, `lane "${lane}" has ${defaults.length} defaults, not 1`).toBe(1);
    }
  });

  /*
    THE CURATED PICK WINS; PRICE ONLY FILLS A GAP.

    `electLaneDefaults` crowns the CHEAPEST enabled model in a lane, and if that
    were the whole rule the floor's ordering would be decoration — Scena's text
    lane would open on Granite 4.0 Micro rather than the Llama 3.3 70B its own
    `ai.default_model.text` config names, and the two would disagree with nothing
    reporting it. So the floor's FIRST row in each lane is seeded as the default
    and the election only fills lanes that have none.

    Checked against `CONFIG_DEFAULTS` rather than against a hardcoded list,
    because the failure this prevents IS the two drifting apart.
  */
  it("crowns the floor's first row in each lane, matching the seeded config", async () => {
    const rows = await catalog();
    const firstOf = (lane: string) => SCENA_MODEL_FLOOR.find((m) => m.task === lane)!.id;
    for (const lane of ["text", "image", "tts", "music"]) {
      const elected = rows.find((r) => r.task === lane && r.is_default === 1);
      expect(elected?.id, `lane "${lane}"`).toBe(firstOf(lane));
      expect(CONFIG_DEFAULTS[`ai.default_model.${lane}`], `ai.default_model.${lane}`).toBe(firstOf(lane));
    }
  });
});

describe("a lane with two names is one lane", () => {
  it("maps tts and speech to each other, and leaves the rest alone", () => {
    expect([...lanesFor("tts")].sort()).toEqual(["speech", "tts"]);
    expect([...lanesFor("speech")].sort()).toEqual(["speech", "tts"]);
    expect(lanesFor("image")).toEqual(["image"]);
  });

  /*
    Cloudflare's pricing page prices text-to-speech per CHARACTER and calls the
    lane `tts`; Google's ids contain "tts" and parse as `speech`. A catalog with
    both providers therefore holds the capability under two names, in one table,
    with nothing in the row to say which page it came from.

    So a request for the `tts` lane has to be able to resolve to a `speech` row.
    Before this it could not: `defaultModelForTask` filtered `m.task === task`,
    which meant a workspace that picked a Gemini voice in settings had its choice
    silently discarded and got a Deepgram one.
  */
  it("resolves a Gemini voice as the tts default when it is the stored choice", async () => {
    await catalog();
    const gemini = await getModel(env.DB, "gemini-2.5-flash-preview-tts");
    expect(gemini!.task).toBe("speech");

    await env.DB.prepare("INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES (?, ?, ?)")
      .bind("ai.default_model.tts:lane-test", gemini!.id, Date.now())
      .run();
    const picked = await defaultModelForTask(env.DB, "tts", "lane-test");
    expect(picked?.id).toBe(gemini!.id);
  });

  it("still falls back inside the lane when the stored choice is gone", async () => {
    await catalog();
    await env.DB.prepare("INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES (?, ?, ?)")
      .bind("ai.default_model.tts:missing-test", "@cf/deepgram/aura-does-not-exist", Date.now())
      .run();
    const picked = await defaultModelForTask(env.DB, "tts", "missing-test");
    expect(picked, "a removed default must never wedge a generator").toBeTruthy();
    expect(lanesFor("tts")).toContain(picked!.task);
  });
});
