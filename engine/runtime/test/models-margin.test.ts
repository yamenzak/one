/**
 * ONE MULTIPLIER ONTO MANY ROWS, AGAINST A REAL CATALOGUE (D24).
 *
 * ⚠️ WHAT THIS PROVES IS THAT "APPLY A MARKUP TO EVERYTHING" IS A BULK EDIT AND
 * NOT A NEW SOURCE OF TRUTH. The number stays in the column the credit
 * arithmetic already reads, so there is nothing underneath it that could
 * disagree — a deployment-wide value with per-row overrides would be a
 * precedence layer under the one figure the metering consults, and the two come
 * apart the first time either changes.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { applySchema, type Db } from "../src/index.js";
import { MODEL_SCHEMA, modelsOf, priceEvery, syncModels } from "../src/models.js";

const db = () => env.DIRECTORY as unknown as Db;

const FOUND = [
  { id: "@cf/meta/small", provider: "workers-ai", task: "Text Generation", label: "Small",
    usdPerMillionIn: 0.1, usdPerMillionOut: 0.3, maxOutput: 1000 },
  { id: "@cf/black-forest/flux", provider: "workers-ai", task: "Text-to-Image", label: "Flux",
    usdPerMillionIn: 0, usdPerMillionOut: 40_000, maxOutput: 1 },
  { id: "gemini-2.5-pro", provider: "google-ai-studio", task: "Text Generation", label: "Pro",
    usdPerMillionIn: 1.25, usdPerMillionOut: 10, maxOutput: 4000 },
];

beforeEach(async () => {
  await applySchema(db(), [MODEL_SCHEMA]);
  await db().exec("DELETE FROM ai_model;");
  await syncModels(db(), FOUND as never, 5);
});

describe("pricing every row at once", () => {
  it("writes one multiplier onto the whole catalogue and reports the count", async () => {
    expect(await priceEvery(db(), 7)).toBe(FOUND.length);
    for (const row of await modelsOf(db())) expect(row.multiplier).toBe(7);
  });

  /* ⚠️ THE GESTURE AN OPERATOR ACTUALLY WANTS IS OFTEN PER VENDOR — one
     provider's prices move, and the rest of the catalogue should not. */
  it("narrows to one vendor and leaves the rest where they were", async () => {
    await priceEvery(db(), 3);
    expect(await priceEvery(db(), 9, { provider: "google-ai-studio" })).toBe(1);
    const rows = await modelsOf(db());
    expect(rows.find((r) => r.id === "gemini-2.5-pro")!.multiplier).toBe(9);
    expect(rows.find((r) => r.id === "@cf/meta/small")!.multiplier).toBe(3);
  });

  /* ⚠️ A SELECTION THAT MATCHES NOTHING REPORTS NOTHING, rather than reporting
     success. A silent zero and a silent forty look identical to whoever pressed
     it, and only one of them is what they meant. */
  it("reports nothing changed when the selection matches no row", async () => {
    expect(await priceEvery(db(), 6, { provider: "nobody" })).toBe(0);
  });

  /*
    ⚠️ AND IT DOES NOT TOUCH THE COST. The margin is ours; what a call cost is
    the provider's, discovered nightly. A bulk write that moved both would make
    the next sync's diff meaningless and the reconciliation compare a number
    against itself.
  */
  it("moves the margin and never the cost", async () => {
    const before = await modelsOf(db());
    await priceEvery(db(), 8);
    const after = await modelsOf(db());
    for (const row of after) {
      const was = before.find((r) => r.id === row.id)!;
      expect(row.input).toBe(was.input);
      expect(row.output).toBe(was.output);
    }
  });
});
