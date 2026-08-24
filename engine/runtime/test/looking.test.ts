/**
 * THE VISION LANE ACTUALLY CARRIES ITS PICTURES, AND EVERY ONE IS PAID FOR.
 *
 * ⚠️ THE FAILURE THIS CATCHES IS A LANE THAT IS ONLY A NAME. An app can declare
 * `lane: "vision"`, compose, price a meter, bind a model and pass every guard in
 * this repo — and if nothing puts the image in the request, the model receives
 * the instructions alone and answers about a photograph nobody sent it. Nothing
 * fails: a confident, fluent, entirely invented product record comes back, and
 * the workspace is charged for it.
 *
 * ⚠️ SO WHAT IS ASSERTED IS THE BYTES ON THE WIRE. The compat endpoint takes a
 * bare string for a text turn and a list of parts for anything else, and the
 * difference between them is the whole feature.
 *
 * ⚠️ AND THE SECOND HALF IS THE MONEY, WHICH IS THE HALF THAT FAILS QUIETLY.
 * `settle` charges `min(held, actual)`, so a reserve that counted one picture
 * out of six is not an error anybody sees — it is five sixths of the largest
 * input in the request, paid for by the platform, on every call, for ever.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppId, ModelRow, TenantId } from "@engine/kernel";
import { TOKENS_PER_IMAGE } from "@engine/kernel";
import { BILLING_SCHEMA, applySchema, type Db } from "../src/index.js";
import { MODEL_SCHEMA } from "../src/models.js";
import { SPEND_SCHEMA, spendOf } from "../src/spend.js";
import { askModel, type Answered, type GatewayAt } from "../src/gateway.js";
import { generate, type Ask, type Provider } from "../src/services.js";
import { openAccount, topUp } from "../src/wallet.js";

const AT: GatewayAt = {
  accountId: "acc", gateway: "one", token: "tok",
};

const MODEL: ModelRow = {
  id: "gemini-2.5-flash", provider: "google", task: "vision", label: "Flash",
  meter: "token", input: 100, output: 400, multiplier: 5,
  enabled: true, isDefault: true, thinks: false, maxOutput: 8_000, retired: false,
} as ModelRow;

const TAG = { t: "ten_x", a: "inventory", o: "product.read" };

/** ⚠️ What was actually sent, which is the only thing worth asserting here. */
async function sent(images?: readonly string[]) {
  let body: Record<string, unknown> = {};
  await askModel(AT, {
    model: MODEL, system: "Read the label.", prompt: "What is this?",
    maxOutput: 400, tag: TAG, ...(images ? { images } : {}),
  }, async (_url, init) => {
    body = JSON.parse(String(init.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), {
      headers: { "content-type": "application/json" },
    });
  });
  const messages = body.messages as readonly { role: string; content: unknown }[];
  return messages.find((m) => m.role === "user")?.content;
}

const picture = (n: number) => `data:image/jpeg;base64,/9j/4AAQSkZJRg==${n}`;
const PICTURE = picture(1);

describe("asking a model to look at something", () => {
  it("sends the picture with the words", async () => {
    const content = await sent([PICTURE]) as readonly Record<string, unknown>[];
    expect(Array.isArray(content)).toBe(true);
    expect(content.map((p) => p.type)).toEqual(["text", "image_url"]);
    expect((content[1]?.image_url as { url: string }).url).toBe(PICTURE);
  });

  it("keeps the text of the question beside it", async () => {
    const content = await sent([PICTURE]) as readonly Record<string, unknown>[];
    expect(content[0]?.text).toBe("What is this?");
  });

  /*
    ⚠️ ALL OF THEM, IN THE ORDER THEY WERE GIVEN. Several photographs of one
    thing are one question — the front, the back and the cap identify a product
    that no single one of them does — and the order is the app's to mean
    something by. A seam that sent only the first would answer just as fluently
    about a bottle it had seen one side of.
  */
  it("sends every picture, in order", async () => {
    const all = [picture(1), picture(2), picture(3)];
    const content = await sent(all) as readonly Record<string, unknown>[];
    expect(content.map((p) => p.type)).toEqual(["text", "image_url", "image_url", "image_url"]);
    expect(content.slice(1).map((p) => (p.image_url as { url: string }).url)).toEqual(all);
  });

  /*
    ⚠️ AND A TEXT TURN STAYS A STRING. Sending the list shape for every call puts
    an app's ordinary text through the path that exists for pictures, on every
    provider, including the ones that read it less well — so the shape is a
    function of whether there is anything to see.
  */
  it("sends a bare string when there is nothing to look at", async () => {
    expect(await sent()).toBe("What is this?");
  });

  /* ⚠️ An empty list is nothing to look at, not a list with nothing in it. */
  it("sends a bare string for an empty list", async () => {
    expect(await sent([])).toBe("What is this?");
  });
});

/* ------------------------------------------------------------------- money --- */

const db = () => env.DIRECTORY as unknown as Db;
const TENANT = "ten_looking" as TenantId;
const NOW = new Date("2026-08-24T10:00:00.000Z");

const ASK: Ask = {
  tenantId: TENANT, appId: "inventory" as AppId, action: "product.see", lane: "vision",
  system: "You identify products.", prompt: "what is it", maxOutput: 800,
};

/** ⚠️ Answers with no usage, so the settle falls back to the hold and the row
    records what was RESERVED — which is the number under test. */
const provider: Provider = {
  async run(): Promise<Answered> {
    return { text: "{}", usage: null, logId: null, cached: false };
  },
};

const deps = () => ({
  directory: db(),
  models: async () => [MODEL],
  provider,
  environment: "test",
});

const heldFor = async (images?: readonly string[]) => {
  await db().exec(`DELETE FROM ai_run;`);
  await generate(deps(), { ...ASK, ...(images ? { images } : {}) });
  const rows = await spendOf(db(), TENANT, { limit: 10 });
  return rows[0]!.held;
};

beforeEach(async () => {
  await applySchema(db(), [BILLING_SCHEMA, MODEL_SCHEMA, SPEND_SCHEMA]);
  await db().exec(`DELETE FROM billing_account;`);
  await db().exec(`DELETE FROM credit_ledger;`);
  await db().exec(`DELETE FROM ai_run;`);
  await openAccount(db(), TENANT, "USD", NOW);
  await topUp(db(), TENANT, 100_000, "test", {}, NOW);
});

describe("paying for what it looked at", () => {
  /*
    ⚠️ THE COUNT, NOT WHETHER THERE ARE ANY. `images: 1` for six photographs is
    the under-count wearing a plural seam's clothes, and it is invisible from
    every direction: the pictures all arrive, the answer is good, the run
    succeeds, and the hold covers a sixth of the input. Six times the picture
    rate is the assertion, because arithmetic is the only thing that can tell.
  */
  it("reserves for every picture, not for the fact that there are pictures", async () => {
    const one = await heldFor([picture(1)]);
    const six = await heldFor([1, 2, 3, 4, 5, 6].map(picture));
    const words = await heldFor();

    /* Each picture adds the same amount, and it is `TOKENS_PER_IMAGE` at this
       model's input rate — 100 milli per thousand, multiplied by 5. */
    const perPicture = (TOKENS_PER_IMAGE / 1000) * MODEL.input * MODEL.multiplier;
    expect((one - words) * 1000).toBeCloseTo(perPicture, -1);
    expect(six - words).toBeCloseTo((one - words) * 6, -1);
  });

  /* ⚠️ And no pictures reserves for none of them, rather than for one. */
  it("reserves nothing extra when there is nothing to look at", async () => {
    expect(await heldFor()).toBe(await heldFor([]));
  });
});
