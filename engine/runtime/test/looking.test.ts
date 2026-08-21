/**
 * THE VISION LANE ACTUALLY CARRIES A PICTURE.
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
 */

import { describe, expect, it } from "vitest";
import type { ModelRow } from "@engine/kernel";
import { askModel, type GatewayAt } from "../src/gateway.js";

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
async function sent(image?: string) {
  let body: Record<string, unknown> = {};
  await askModel(AT, {
    model: MODEL, system: "Read the label.", prompt: "What is this?",
    maxOutput: 400, tag: TAG, ...(image ? { image } : {}),
  }, async (_url, init) => {
    body = JSON.parse(String(init.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), {
      headers: { "content-type": "application/json" },
    });
  });
  const messages = body.messages as readonly { role: string; content: unknown }[];
  return messages.find((m) => m.role === "user")?.content;
}

const PICTURE = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

describe("asking a model to look at something", () => {
  it("sends the picture with the words", async () => {
    const content = await sent(PICTURE) as readonly Record<string, unknown>[];
    expect(Array.isArray(content)).toBe(true);
    expect(content.map((p) => p.type)).toEqual(["text", "image_url"]);
    expect((content[1]?.image_url as { url: string }).url).toBe(PICTURE);
  });

  it("keeps the text of the question beside it", async () => {
    const content = await sent(PICTURE) as readonly Record<string, unknown>[];
    expect(content[0]?.text).toBe("What is this?");
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
});
