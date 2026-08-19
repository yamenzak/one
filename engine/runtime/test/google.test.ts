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
import { listGeminiModels, priceAt, readGeminiPricing } from "../src/google.js";
import { preferOurs } from "../src/models.js";

const listed = (models: unknown[], nextPageToken?: string) =>
  new Response(JSON.stringify({ models, ...(nextPageToken ? { nextPageToken } : {}) }),
    { status: 200, headers: { "content-type": "application/json" } });

/**
 * ⚠️ TWO READS PER SYNC, AND THE STUB HAS TO KNOW WHICH IS WHICH. The catalogue
 * is the INTERSECTION of what the key can reach and what the page prices, so a
 * test that answered both with the same body would prove nothing about either.
 */
const both = (
  models: () => Response | Promise<Response>, page: string = PAGE,
) => vi.fn(async (url: string) =>
  (String(url).startsWith("https://ai.google.dev")
    ? new Response(page, { status: 200 })
    : models()));

const model = (name: string, extra: Record<string, unknown> = {}) => ({
  name: `models/${name}`,
  displayName: name,
  supportedGenerationMethods: ["generateContent"],
  ...extra,
});

afterEach(() => { vi.unstubAllGlobals(); });

/**
 * ⚠️ THE PAGE IS THE SOURCE, AND THE FIXTURE IS THE PAGE'S OWN SHAPE. A table in
 * our own file went stale the week it was written — it priced ten families from
 * the 2.5 generation while Google's page listed thirty, most of them newer.
 */
const PAGE = `
## Gemini 3.7 Flash

*\`gemini-3.7-flash\`*

Our most capable Flash model.

### Standard

|   | Free Tier | Paid Tier, per 1M tokens in USD |
|---|---|---|
| Input price | Free of charge | $0.75 through December 31, 2026. $1.50 starting January 1, 2027. |
| Output price (including thinking tokens) | Free of charge | $3.75 through December 31, 2026. $7.50 starting January 1, 2027. |

### Batch

|   | Free Tier | Paid Tier, per 1M tokens in USD |
|---|---|---|
| Input price | Not available | $0.375 through December 31, 2026. |
| Output price (including thinking tokens) | Not available | $1.875 through December 31, 2026. |

## Gemini 3.1 Flash Image (Nano Banana 2) 🍌

*\`gemini-3.1-flash-image\`*

### Standard

|   | Free Tier | Paid Tier, per 1M tokens in USD |
|---|---|---|
| Input price | Not available | $0.50 (text/image) |
| Output price | Not available | $3 (text and thinking) $60.00 (images) |

## Gemini 3.1 Flash TTS

*\`gemini-3.1-flash-tts-preview\`*

### Standard

|   | Free Tier | Paid Tier, per 1M tokens in USD |
|---|---|---|
| Input price | Free of charge | $1.00 (text) |
| Output price | Free of charge | $20.00 (audio) |

## Gemini 2.5 Flash Image

*\`gemini-2.5-flash-image\`*

### Standard

|   | Free Tier | Paid Tier, per 1M tokens in USD |
|---|---|---|
| Input price | Not available | $0.30 (text / image) |
| Output price | Not available | $0.039 per image |

## Gemini Embedding 2

*\`gemini-embedding-2\`*

### Standard

|   | Free Tier | Paid Tier, per 1M tokens in USD |
|---|---|---|
| Text input price | Free of charge | $0.20 |
| Image input price | Free of charge | $0.45 ($0.00012 per image) |

## Something With No Price

*\`gemini-mystery\`*

### Standard

|   | Free Tier | Paid Tier |
|---|---|---|
| Used to improve our products | Yes | No |
`;

const BEFORE = new Date("2026-08-19T00:00:00Z");
const AFTER = new Date("2027-03-01T00:00:00Z");

describe("reading the published prices", () => {
  /*
    ⚠️ THE DATED CELL IS THE ONE THAT WOULD HAVE COST MONEY QUIETLY. "$0.75
    through December 31, 2026. $1.50 starting January 1, 2027" is one cell
    holding two rates and the day the first stops being true. Reading the first
    number sells at half cost from New Year's Day, for as long as nobody looks.
  */
  it("takes the rate in effect, not the first one printed", () => {
    expect(priceAt("$0.75 through December 31, 2026. $1.50 starting January 1, 2027.", BEFORE))
      .toBe(0.75);
    expect(priceAt("$0.75 through December 31, 2026. $1.50 starting January 1, 2027.", AFTER))
      .toBe(1.5);
  });

  /*
    ⚠️ AND A CELL WITH SEVERAL NUMBERS TAKES THE ONE FOR THE MODALITY ASKED FOR.
    "$3 (text and thinking) $60.00 (images)" is one output price for two kinds of
    output; taking the larger quotes a text answer at twenty times its cost and
    taking the first quotes a picture at a twentieth of it. Neither is a rounding
    error — this row is what a workspace is charged from.
  */
  it("takes the number for the modality asked for", () => {
    const cell = "$3 (text and thinking) $60.00 (images)";
    expect(priceAt(cell, BEFORE, "text")).toBe(3);
    expect(priceAt(cell, BEFORE, "image")).toBe(60);
  });

  /*
    ⚠️ AND A LABEL NAMES A SET. "$0.30 (text / image / video) $1.00 (audio)" is
    one rate for three kinds of input and a different one for the fourth — asking
    which single modality the first IS matched `image`, so every multimodal text
    model on the page failed to price and was silently not stored. That was nine
    of twenty-nine.
  */
  it("reads a quote that names several modalities at once", () => {
    const cell = "$0.30 (text / image / video) $1.00 (audio)";
    expect(priceAt(cell, BEFORE, "text")).toBe(0.3);
    expect(priceAt(cell, BEFORE, "image")).toBe(0.3);
    expect(priceAt(cell, BEFORE, "audio")).toBe(1);
  });

  /*
    ⚠️ AND A PRICE PER PICTURE IS NOT A PRICE PER MILLION TOKENS. The column says
    "per 1M tokens" and one row under it says "$0.039 per image" anyway. Read as
    the column's unit that is a millionth of the real rate — a model that settles
    to nothing on every call.
  */
  it("refuses a quote in a unit the column does not use", () => {
    expect(priceAt("$0.039 per image", BEFORE, "image")).toBeUndefined();
    /* ⚠️ But the column's own unit restated is still the column's unit. */
    expect(priceAt("$0.025 / 1,000,000 tokens", BEFORE)).toBe(0.025);
  });

  it("says nothing for a cell with no price in it", () => {
    expect(priceAt("Free of charge", BEFORE)).toBeUndefined();
    expect(priceAt("Not available", BEFORE)).toBeUndefined();
  });

  /* ⚠️ The id is the backticked line; the heading is a display name with a
     version, a nickname and sometimes an emoji. */
  it("keys each model by the id a call is addressed to", () => {
    expect([...readGeminiPricing(PAGE, BEFORE).keys()]).toEqual([
      "gemini-3.7-flash", "gemini-3.1-flash-image", "gemini-3.1-flash-tts-preview",
      "gemini-embedding-2",
    ]);
  });

  /*
    ⚠️ THE TWO ENDS ASK FOR DIFFERENT THINGS. A voice model is prompted in text
    and answers in audio; an image model is prompted in text and answers in
    pictures. One modality across both rows priced a voice model's speech at the
    rate for the sentence that asked for it — twenty times under, on the
    expensive half.
  */
  it("prices each end at the modality that end is in", () => {
    const at = readGeminiPricing(PAGE, BEFORE);
    expect(at.get("gemini-3.1-flash-tts-preview")).toEqual({ input: 1, output: 20 });
    expect(at.get("gemini-3.1-flash-image")).toEqual({ input: 0.5, output: 60 });
  });

  /*
    ⚠️ AN OUTPUT ROW THAT COULD NOT BE PRICED IS A REFUSAL, and it must not share
    a branch with a model that HAS no output row. Falling back to the input rate
    priced pictures at the rate for the prompt, which is the settles-for-nothing
    failure wearing a plausible number.
  */
  it("drops a model whose output it could not price rather than reusing the input", () => {
    expect(readGeminiPricing(PAGE, BEFORE).has("gemini-2.5-flash-image")).toBe(false);
  });

  /*
    ⚠️ STANDARD ONLY. Every model also quotes Batch at half price, and metering
    an ordinary call at the batch rate under-charges by half — which the settle
    cap turns into a permanent loss rather than an error anybody sees.
  */
  it("reads the standard tier and not the cheaper ones beside it", () => {
    const at = readGeminiPricing(PAGE, BEFORE).get("gemini-3.7-flash")!;
    expect(at).toEqual({ input: 0.75, output: 3.75 });
  });

  it("follows a price change on its own date", () => {
    expect(readGeminiPricing(PAGE, AFTER).get("gemini-3.7-flash"))
      .toEqual({ input: 1.5, output: 7.5 });
  });

  /* ⚠️ No output row is one rate for both — an embedder has no output to bill. */
  it("prices an embedder from its input alone", () => {
    expect(readGeminiPricing(PAGE, BEFORE).get("gemini-embedding-2"))
      .toEqual({ input: 0.2, output: 0.2 });
  });

  /* ⚠️ A model with no price is not carried at zero — see the header. */
  it("carries no model it could not price", () => {
    expect(readGeminiPricing(PAGE, BEFORE).has("gemini-mystery")).toBe(false);
  });
});

describe("reading Google's list", () => {
  it("addresses a model by the segment after `models/`", async () => {
    vi.stubGlobal("fetch", both(() => listed([model("gemini-3.7-flash")])));
    const out = await listGeminiModels("a-key", BEFORE);
    expect(out.ok).toBe(true);
    expect(out.value?.[0]?.id).toBe("gemini-3.7-flash");
    /* ⚠️ Cloudflare's own name for the lane — `/compat` is what addresses it. */
    expect(out.value?.[0]?.provider).toBe("google-ai-studio");
  });

  /*
    ⚠️ THE KEY IS A HEADER. Google accepts `?key=` and every example uses it —
    and a URL is what gets logged, retained and pasted into a chat with an error
    message around it.
  */
  it("never puts the key in the URL", async () => {
    const call = both(() => listed([model("gemini-3.7-flash")]));
    vi.stubGlobal("fetch", call);
    await listGeminiModels("secret-key", BEFORE);
    const listing = call.mock.calls
      .find(([url]) => !String(url).startsWith("https://ai.google.dev"))!;
    const [url, init] = listing as unknown as [string, RequestInit];
    expect(url).not.toContain("secret-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret-key");
    /* ⚠️ And the pricing page is public — it must carry no key at all. */
    const pricing = call.mock.calls.find(([u]) => String(u).startsWith("https://ai.google.dev"))!;
    expect(JSON.stringify(pricing)).not.toContain("secret-key");
  });

  /* ⚠️ Not a name: what a model answers to is the only statement of what it is. */
  it("reads the task from what the model answers to", async () => {
    vi.stubGlobal("fetch", both(() => listed([
      model("gemini-embedding-2", { supportedGenerationMethods: ["embedContent"] }),
      model("gemini-3.7-flash"),
      model("gemini-3.1-flash-image"),
    ])));
    const by = new Map((await listGeminiModels("a-key", BEFORE)).value?.map((m) => [m.id, m]));
    expect(by.get("gemini-embedding-2")?.task).toBe("text-embeddings");
    expect(by.get("gemini-3.7-flash")?.task).toBe("text-generation");
    /* ⚠️ An image model in the text lane would be elected to answer a chat. */
    expect(by.get("gemini-3.1-flash-image")?.task).toBe("text-to-image");
  });

  /* ⚠️ A thinking model bills for tokens nobody requested — the reserve widens. */
  it("marks the reasoning models", async () => {
    vi.stubGlobal("fetch", both(() => listed([model("gemini-3.7-flash")])));
    const by = new Map((await listGeminiModels("a-key", BEFORE)).value?.map((m) => [m.id, m]));
    expect(by.get("gemini-3.7-flash")?.thinks).toBe(true);
  });

  /*
    ⚠️ AN UNPRICED ROW IS NOT STORED, AND THAT IS NOT TIDINESS. A reserve is a
    ceiling on revenue, so a row at zero settles free on every call while the
    provider's invoice arrives anyway.
  */
  it("drops a model it has no rate for rather than storing it at nothing", async () => {
    vi.stubGlobal("fetch", both(() => listed([
      model("gemini-3.7-flash"), model("aqa"), model("chat-bison-001"),
    ])));
    const out = await listGeminiModels("a-key", BEFORE);
    expect(out.value?.map((m) => m.id)).toEqual(["gemini-3.7-flash"]);
  });

  it("follows the pages, because one page is not the catalogue", async () => {
    const pages = [listed([model("gemini-3.7-flash")], "more"),
      listed([model("gemini-embedding-2", { supportedGenerationMethods: ["embedContent"] })])];
    vi.stubGlobal("fetch", both(() => pages.shift()!));
    const out = await listGeminiModels("a-key", BEFORE);
    expect(out.value?.map((m) => m.id)).toEqual(["gemini-3.7-flash", "gemini-embedding-2"]);
  });
});

/**
 * ⚠️ A FAILURE MUST NOT READ AS AN EMPTY CATALOGUE. Retiring is scoped by
 * provider, so a pass that answers "ok, no rows" retires every Gemini model this
 * deployment sells — at 03:00, over a dropped connection or a rotated key.
 */
describe("when Google does not answer", () => {
  it("refuses on a network fault", async () => {
    vi.stubGlobal("fetch", both(() => { throw new Error("nope"); }));
    const out = await listGeminiModels("a-key", BEFORE);
    expect(out.ok).toBe(false);
    expect(out.value).toBeUndefined();
  });

  it("refuses on a rejected key, and says which key", async () => {
    vi.stubGlobal("fetch", both(() => new Response("no", { status: 403 })));
    const out = await listGeminiModels("a-key", BEFORE);
    expect(out.ok).toBe(false);
    expect(out.why).toContain("403");
    expect(out.why).toContain("AI Studio");
  });

  /* ⚠️ AND A CHANGED PRICING PAGE IS A REFUSAL TOO. Parsed to nothing and
     applied, it would drop every Gemini row rather than report that the reader
     is out of date — the same silent retirement, one source over. */
  it("refuses a pricing page it could read no price from", async () => {
    vi.stubGlobal("fetch", both(() => listed([model("gemini-3.7-flash")]), "# nothing here"));
    expect((await listGeminiModels("a-key", BEFORE)).ok).toBe(false);
  });

  /* ⚠️ A key that reaches Google and matches nothing is a stale rate table, and
     that is a thing to say rather than a silent retirement. */
  it("refuses an answer it could price none of", async () => {
    vi.stubGlobal("fetch", both(() => listed([model("aqa")])));
    expect((await listGeminiModels("a-key", BEFORE)).ok).toBe(false);
  });
});

/**
 * TWO CATALOGUES, ONE MODEL, AND THE PRICE MUST BE THE ONE WE PAY.
 *
 * ⚠️ CLOUDFLARE RESELLS GEMINI AND THIS DEPLOYMENT DOES NOT BUY IT THERE. Its
 * unified catalogue carries `google/gemini-3.7-flash` at a resale rate; we call
 * Google on our own key at Google's rate, which is what holding the key is for.
 * Both rows describe the same model and only one of them is what we are charged,
 * so taking the wrong one meters every call against a price nobody billed us.
 */
describe("when both catalogues carry the same model", () => {
  const at = (id: string, into: number) =>
    ({ id, provider: "google-ai-studio", task: "text-generation", usdPerMillionIn: into });

  it("keeps the price from the source we actually call", () => {
    const out = preferOurs([at("gemini-3.7-flash", 9.99)], [at("gemini-3.7-flash", 0.3)]);
    expect(out).toHaveLength(1);
    expect(out[0]!.usdPerMillionIn).toBe(0.3);
  });

  /* ⚠️ And a model only the resold catalogue has is still offered — this is a
     precedence rule, not a filter. */
  it("keeps a model only the other catalogue has", () => {
    const out = preferOurs([at("veo-3.1", 1)], [at("gemini-3.7-flash", 0.3)]);
    expect(out.map((m) => m.id).sort()).toEqual(["gemini-3.7-flash", "veo-3.1"]);
  });
});
