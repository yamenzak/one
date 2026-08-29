/**
 * THE LANES THAT ARE NOT A CONVERSATION ACTUALLY REACH A PROVIDER (D79).
 *
 * ⚠️ THE FAILURE THIS CATCHES IS THE ONE STAGE 87 EXISTS FOR. `/compat` is chat
 * completions and nothing else, so an app declaring `lane: "image"` used to
 * compose, find models, price a meter, elect a default, pass every guard — and
 * post an image request to a chat endpoint. Every check in the repository was
 * about the CATALOGUE; none of them was about whether anything could make the
 * call.
 *
 * ⚠️ SO WHAT IS ASSERTED IS THE URL AND THE BODY, because those are the two
 * things that were wrong. A test that mocked the answer and checked the return
 * value would pass against a request sent to the wrong address entirely.
 *
 * ⚠️ AND THE SECOND HALF IS THAT THE ANSWER SURVIVES THE JOURNEY. A picture that
 * runs, holds, charges and settles correctly and then returns an empty string is
 * a lane that is billed and useless, with every meter reading healthy — which is
 * the same shape as the defect, one layer out.
 */

import { describe, expect, it } from "vitest";
import type { ModelRow } from "@engine/kernel";
import { askLane, type GatewayAt } from "../src/gateway.js";
import { gatewayProvider } from "../src/services.js";

const AT: GatewayAt = { accountId: "acc", gateway: "one", token: "tok" };
const TAG = { t: "ten_x", a: "inventory", o: "product.see" };

const model = (over: Partial<ModelRow> = {}): ModelRow => ({
  id: "@cf/black-forest-labs/flux", provider: "workers-ai", task: "text-to-image",
  label: "Flux", meter: "image", input: 0, output: 4_000_000, multiplier: 5,
  enabled: true, maxOutput: 1, ...over,
} as ModelRow);

/** ⚠️ Where it went and what it carried — the two facts that were wrong. */
async function sent(lane: "embed" | "image" | "speech", row: ModelRow, answer?: Response) {
  let url = "";
  let body: Record<string, unknown> = {};
  let headers: Record<string, string> = {};
  const out = await askLane(AT, lane, {
    model: row, system: "Be exact.", prompt: "a red bottle", maxOutput: 2, tag: TAG,
  }, async (at, init) => {
    url = at;
    body = JSON.parse(String(init.body)) as Record<string, unknown>;
    headers = init.headers as Record<string, string>;
    return answer ?? new Response(JSON.stringify({ result: { image: "AAEC" } }), {
      headers: { "content-type": "application/json" },
    });
  });
  return { url, body, headers, out };
}

describe("a lane that is not a conversation", () => {
  /*
    ⚠️ THE ADDRESS IS THE WHOLE POINT. Every one of these used to go to
    `/compat/chat/completions`, which cannot generate a picture, embed a
    sentence or speak one.
  */
  it("reaches the provider's own path rather than chat completions", async () => {
    const { url } = await sent("image", model());
    expect(url).not.toContain("/compat/chat/completions");
    expect(url).toContain("/workers-ai/@cf/black-forest-labs/flux");
  });

  it("addresses an OpenAI-shaped provider at its own verb per lane", async () => {
    const openai = { provider: "openai", id: "gpt-image-1" };
    expect((await sent("image", model(openai))).url).toContain("/openai/v1/images/generations");
    expect((await sent("embed", model({ ...openai, id: "text-embedding-3" }))).url)
      .toContain("/openai/v1/embeddings");
    expect((await sent("speech", model({ ...openai, id: "tts-1" }),
      new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/mpeg" } })))
      .url).toContain("/openai/v1/audio/speech");
  });

  /* ⚠️ The vendor prefix belongs to `/compat`'s addressing. A passthrough request
     is already AT the provider, so sending it again asks for `openai/openai/…`. */
  it("does not send the vendor prefix to a provider it is already talking to", async () => {
    const { body, url } = await sent("embed",
      model({ provider: "openai", id: "text-embedding-3", meter: "token" }));
    expect(url).not.toContain("/openai/openai");
    expect(body.model).toBe("text-embedding-3");
  });

  /*
    ⚠️ THE MONEY HEADERS TRAVEL ON THIS PATH TOO, and they are the reason the
    lane split is safe. Without them the gateway's own bill is one number for the
    deployment and the nightly reconciliation has nothing to compare — so a lane
    that assembled its own headers would be a lane whose spending is invisible.
  */
  it("carries the same metadata and custom cost as the text lane", async () => {
    const { headers } = await sent("image", model());
    expect(headers["cf-aig-metadata"]).toBe(JSON.stringify(TAG));
    expect(headers["cf-aig-custom-cost"]).toBeTruthy();
    expect(headers["cf-aig-authorization"]).toBe("Bearer tok");
  });

  /* ⚠️ A key we hold beats a key the gateway holds — the whole reason to hold
     one, and it must not be lost on the path that was added later. */
  it("uses a provider key we hold ourselves", async () => {
    let seen: Record<string, string> = {};
    await askLane({ ...AT, keys: { "workers-ai": "mine" } }, "image", {
      model: model(), system: "", prompt: "x", maxOutput: 1, tag: TAG,
    }, async (_u, init) => {
      seen = init.headers as Record<string, string>;
      return new Response(JSON.stringify({ result: { image: "AAEC" } }),
        { headers: { "content-type": "application/json" } });
    });
    expect(seen["authorization"]).toBe("Bearer mine");
  });
});

describe("the answer a lane gives back", () => {
  /* ⚠️ Dropped, the lane runs, charges and returns an empty string. */
  it("carries a picture out as bytes rather than as words", async () => {
    const { out } = await sent("image", model());
    expect(typeof out).not.toBe("string");
    if (typeof out === "string") return;
    expect(out.bytes).toBeInstanceOf(Uint8Array);
    expect(out.text).toBe("");
  });

  /* ⚠️ Speech answers with the audio itself, not a document describing it —
     reading that as JSON throws, and reports a working call as a broken one. */
  it("reads a spoken answer as bytes and keeps its type", async () => {
    const { out } = await sent("speech", model({ meter: "character" }),
      new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/mpeg" } }));
    if (typeof out === "string") throw new Error(`refused: ${out}`);
    expect(out.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(out.mime).toBe("audio/mpeg");
  });

  /* ⚠️ Three published shapes for one answer, and every one is somebody's
     contract: OpenAI nests under `data`, Google under `embedding`, Workers AI
     under `result`. */
  it("reads an embedding out of whichever shape the provider published", async () => {
    const vector = [0.1, 0.2, 0.3];
    const shapes = [
      { data: [{ embedding: vector }] },
      { embedding: { values: vector } },
      { result: { data: [vector] } },
    ];
    for (const shape of shapes) {
      const { out } = await sent("embed", model({ meter: "token" }),
        new Response(JSON.stringify(shape), { headers: { "content-type": "application/json" } }));
      if (typeof out === "string") throw new Error(`refused: ${out}`);
      expect(out.vector).toEqual(vector);
    }
  });
});

/*
  ⚠️ THE DISPATCH ITSELF, WHICH IS WHERE THIS WOULD ACTUALLY BREAK. Everything
  above calls `askLane` directly and so cannot see the decision that picks it:
  a mutation routing every lane back onto `/compat` left all of it green. The
  seam `generate` really uses is `gatewayProvider.run`, and that is what has to
  be asked which address it chose.
*/
describe("which door a lane goes out of", () => {
  const wentTo = async (lane: "text" | "vision" | "image" | "embed" | "speech") => {
    let url = "";
    const provider = gatewayProvider(AT, TAG, async (at) => {
      url = at;
      return new Response(JSON.stringify({
        choices: [{ message: { content: "" } }], result: { image: "AAEC" },
        data: [{ embedding: [1] }],
      }), { headers: { "content-type": "application/json" } });
    });
    await provider.run(model({ meter: "token" }),
      { system: "s", prompt: "p", reserve: { credits: 1, of: "x" } }, 1, undefined, lane);
    return url;
  };

  it("sends a conversation to compat and everything else to the provider's own path", async () => {
    expect(await wentTo("text")).toContain("/compat/chat/completions");
    expect(await wentTo("vision")).toContain("/compat/chat/completions");
    for (const lane of ["image", "embed", "speech"] as const) {
      expect(await wentTo(lane), `${lane} must not go to compat`)
        .not.toContain("/compat/chat/completions");
    }
  });
});

describe("a route we do not have", () => {
  /*
    ⚠️ REFUSED, NEVER GUESSED, AND WITH ITS OWN REASON. An invented path 404s on
    a model an operator switched on and a workspace chose, and "provider_failed"
    would send somebody to look at a provider that is working perfectly.
  */
  it("refuses a vendor whose dialect we do not know", async () => {
    const out = await askLane(AT, "image", {
      model: model({ provider: "anthropic" }), system: "", prompt: "x", maxOutput: 1, tag: TAG,
    }, async () => new Response("{}"));
    expect(out).toBe("no_route");
  });

  /* ⚠️ AND A LANE A VENDOR DOES NOT ANSWER IS THE SAME REFUSAL. Google has no
     text-to-speech verb at this address; inventing one is a 404 nobody can read. */
  it("refuses a lane its vendor has no verb for", async () => {
    const out = await askLane(AT, "speech", {
      model: model({ provider: "google-ai-studio", id: "gemini-2.5-flash" }),
      system: "", prompt: "x", maxOutput: 1, tag: TAG,
    }, async () => new Response("{}"));
    expect(out).toBe("no_route");
  });

  /* ⚠️ A refusal before any request is made, so nothing is spent finding out. */
  it("makes no request at all when there is no route", async () => {
    let called = 0;
    await askLane(AT, "image", {
      model: model({ provider: "anthropic" }), system: "", prompt: "x", maxOutput: 1, tag: TAG,
    }, async () => { called++; return new Response("{}"); });
    expect(called).toBe(0);
  });
});
