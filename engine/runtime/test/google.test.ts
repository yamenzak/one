/**
 * GEMINI IN THE CATALOGUE, AND THE THREE WAYS IT COULD GO WRONG QUIETLY.
 *
 * ⚠️ THE GAP THIS CLOSES SHOWED AS AN ABSENCE, WHICH IS THE HARDEST KIND TO SEE.
 * Cloudflare's `/ai/models/search` answers for the models Cloudflare HOSTS, so a
 * deployment with a Google key set and a gateway that would route the call had
 * no Gemini row to switch on — and from the catalogue's own side nothing was
 * missing, nothing failed, and no screen could say why.
 */

import { describe, expect, it, vi, afterEach } from "vitest";
import { GEMINI_RATES, listGeminiModels, rateForModel } from "../src/google.js";

const listed = (models: unknown[], nextPageToken?: string) =>
  new Response(JSON.stringify({ models, ...(nextPageToken ? { nextPageToken } : {}) }),
    { status: 200, headers: { "content-type": "application/json" } });

const model = (name: string, extra: Record<string, unknown> = {}) => ({
  name: `models/${name}`,
  displayName: name,
  supportedGenerationMethods: ["generateContent"],
  ...extra,
});

afterEach(() => { vi.unstubAllGlobals(); });

describe("pricing a family", () => {
  /*
    ⚠️ THE ONE THAT WOULD HAVE COST MONEY. Google ships a model and four dated
    snapshots of it, so the table is matched by PREFIX — and `-flash-lite` starts
    with `-flash`. Shortest-first, the cheap model is priced at the expensive
    one's rate: four times its cost, in our favour, which is exactly the error
    nobody complains about and nothing else would catch.
  */
  it("takes the longest matching prefix, not the first", () => {
    expect(rateForModel("gemini-2.5-flash-lite")).toEqual([0.1, 0.4]);
    expect(rateForModel("gemini-2.5-flash")).toEqual([0.3, 2.5]);
  });

  /* ⚠️ A dated snapshot is the family, which is the whole reason for prefixes. */
  it("prices a snapshot at its family's rate", () => {
    expect(rateForModel("gemini-2.5-flash-preview-05-20")).toEqual([0.3, 2.5]);
    expect(rateForModel("gemini-2.5-pro-001")).toEqual([1.25, 10]);
  });

  it("says nothing rather than guessing at a family it has no rate for", () => {
    expect(rateForModel("some-model-nobody-has-priced")).toBeNull();
  });

  /* ⚠️ Every rate is real: a zero here settles free on every call. */
  it("carries no rate that is a placeholder", () => {
    for (const [id, into, out] of GEMINI_RATES) {
      expect(Number.isFinite(into), id).toBe(true);
      expect(Number.isFinite(out), id).toBe(true);
      expect(out >= into, id).toBe(true);
    }
  });
});

describe("reading Google's list", () => {
  it("addresses a model by the segment after `models/`", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => listed([model("gemini-2.5-flash")])));
    const out = await listGeminiModels("a-key");
    expect(out.ok).toBe(true);
    expect(out.value?.[0]?.id).toBe("gemini-2.5-flash");
    /* ⚠️ Cloudflare's own name for the lane — `/compat` is what addresses it. */
    expect(out.value?.[0]?.provider).toBe("google-ai-studio");
  });

  /*
    ⚠️ THE KEY IS A HEADER. Google accepts `?key=` and every example uses it —
    and a URL is what gets logged, retained and pasted into a chat with an error
    message around it.
  */
  it("never puts the key in the URL", async () => {
    const call = vi.fn(async () => listed([model("gemini-2.5-flash")]));
    vi.stubGlobal("fetch", call);
    await listGeminiModels("secret-key");
    const [url, init] = call.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("secret-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret-key");
  });

  /* ⚠️ Not a name: what a model answers to is the only statement of what it is. */
  it("reads the task from what the model answers to", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => listed([
      model("gemini-embedding-001", { supportedGenerationMethods: ["embedContent"] }),
      model("gemini-2.5-pro"),
    ])));
    const out = await listGeminiModels("a-key");
    const by = new Map(out.value?.map((m) => [m.id, m]));
    expect(by.get("gemini-embedding-001")?.task).toBe("text-embeddings");
    expect(by.get("gemini-2.5-pro")?.task).toBe("text-generation");
  });

  /* ⚠️ A thinking model bills for tokens nobody requested — the reserve widens. */
  it("marks the reasoning models", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => listed([
      model("gemini-2.5-pro"), model("gemini-1.5-flash"),
    ])));
    const by = new Map((await listGeminiModels("a-key")).value?.map((m) => [m.id, m]));
    expect(by.get("gemini-2.5-pro")?.thinks).toBe(true);
    expect(by.get("gemini-1.5-flash")?.thinks).toBeUndefined();
  });

  /*
    ⚠️ AN UNPRICED ROW IS NOT STORED, AND THAT IS NOT TIDINESS. A reserve is a
    ceiling on revenue, so a row at zero settles free on every call while the
    provider's invoice arrives anyway.
  */
  it("drops a model it has no rate for rather than storing it at nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => listed([
      model("gemini-2.5-flash"), model("aqa"), model("chat-bison-001"),
    ])));
    const out = await listGeminiModels("a-key");
    expect(out.value?.map((m) => m.id)).toEqual(["gemini-2.5-flash"]);
  });

  it("follows the pages, because one page is not the catalogue", async () => {
    const call = vi.fn()
      .mockResolvedValueOnce(listed([model("gemini-2.5-flash")], "more"))
      .mockResolvedValueOnce(listed([model("gemini-2.5-pro")]));
    vi.stubGlobal("fetch", call);
    const out = await listGeminiModels("a-key");
    expect(out.value?.map((m) => m.id)).toEqual(["gemini-2.5-flash", "gemini-2.5-pro"]);
  });
});

/**
 * ⚠️ A FAILURE MUST NOT READ AS AN EMPTY CATALOGUE. Retiring is scoped by
 * provider, so a pass that answers "ok, no rows" retires every Gemini model this
 * deployment sells — at 03:00, over a dropped connection or a rotated key.
 */
describe("when Google does not answer", () => {
  it("refuses on a network fault", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("nope"); }));
    const out = await listGeminiModels("a-key");
    expect(out.ok).toBe(false);
    expect(out.value).toBeUndefined();
  });

  it("refuses on a rejected key, and says which key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 403 })));
    const out = await listGeminiModels("a-key");
    expect(out.ok).toBe(false);
    expect(out.why).toContain("403");
    expect(out.why).toContain("AI Studio");
  });

  /* ⚠️ A key that reaches Google and matches nothing is a stale rate table, and
     that is a thing to say rather than a silent retirement. */
  it("refuses an answer it could price none of", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => listed([model("aqa")])));
    expect((await listGeminiModels("a-key")).ok).toBe(false);
  });
});
