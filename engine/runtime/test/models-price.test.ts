/**
 * A PRICE OUT OF WHATEVER SHAPE THE CATALOGUE QUOTES IT IN.
 *
 * ⚠️ THIS PARSER GUESSED AT FIELD NAMES AND WAS WRONG TWICE AGAINST A LIVE
 * ACCOUNT. The whole nightly sync refused with `no_priced_row` — true, correct,
 * and useless: the catalogue was right there and every row's price sat in a
 * `price` property holding an ARRAY, where `String(value)` yields
 * `[object Object]` and every number parse fails.
 *
 * ⚠️ SO THE SHAPES ARE THE TEST, not one vendor's field names. The published
 * response is not in the API docs, and a parser written from a guess is a
 * catalogue that stops syncing the day somebody changes a key.
 */

import { describe, expect, it } from "vitest";
import {
  addressIn, isAddressable, priceFrom, readCatalogue, refuseDiscovered,
} from "../src/models.js";

describe("reading a price", () => {
  it("takes a bare number as it stands", () => {
    expect(priceFrom(0.35, "in")).toBe(0.35);
  });

  it("reads one out of a quoted string", () => {
    expect(priceFrom("$0.35 per M input tokens", "in")).toBe(0.35);
  });

  /*
    ⚠️ THE SHAPE THAT WAS ACTUALLY BREAKING IT. One entry per unit, and the unit
    is what says which half of the price it is — taking the first would charge
    every output token at the input rate, which is the expensive half.
  */
  it("picks the right half out of an array of units", () => {
    const value = [
      { unit: "per M input tokens", price: 0.35, currency: "USD" },
      { unit: "per M output tokens", price: 1.75, currency: "USD" },
    ];
    expect(priceFrom(value, "in")).toBe(0.35);
    expect(priceFrom(value, "out")).toBe(1.75);
  });

  /* ⚠️ One rate for both is how an embedding or a classifier quotes itself. */
  it("uses a single unpriced-by-direction entry for both halves", () => {
    const value = [{ unit: "per M tokens", price: 0.011 }];
    expect(priceFrom(value, "in")).toBe(0.011);
    expect(priceFrom(value, "out")).toBe(0.011);
  });

  it("reads an object keyed by direction", () => {
    expect(priceFrom({ input: 0.5, output: 1.5 }, "out")).toBe(1.5);
  });

  it("says nothing rather than guessing when it cannot tell", () => {
    expect(priceFrom(null, "in")).toBeUndefined();
    expect(priceFrom({ nothing: "here" }, "in")).toBeUndefined();
    expect(priceFrom([], "in")).toBeUndefined();
  });
});

describe("reading a catalogue", () => {
  /*
    ⚠️ THE REAL ROW SHAPE, TAKEN FROM CLOUDFLARE'S OWN PUBLISHED CATALOGUE: `id`
    is a UUID and `name` is the addressable path. This fixture used to have them
    the other way round, which is why the code did too — a test written from the
    same guess as the code confirms the guess and nothing else.
  */
  const row = (properties: readonly { property_id: string; value: unknown }[]) =>
    [{
      id: "41975cc2-c82e-4e98-b7b8-88ffb186a545",
      name: "@cf/meta/llama-3.1-8b-instruct",
      task: { name: "Text Generation" },
      properties,
    }];

  /*
    ⚠️ THE END-TO-END CASE, because the parser being right about a value and
    wrong about which PROPERTY holds it is the same outage. `price` is the id
    Cloudflare's own rows use.
  */
  it("prices a row whose `price` property is an array", () => {
    const [found] = readCatalogue(row([{
      property_id: "price",
      value: [
        { unit: "per M input tokens", price: 0.28 },
        { unit: "per M output tokens", price: 0.83 },
      ],
    }]));

    expect(found!.usdPerMillionIn).toBe(0.28);
    expect(found!.usdPerMillionOut).toBe(0.83);
    /* ⚠️ And a priced catalogue is not refused, which is the whole symptom. */
    expect(refuseDiscovered([found!])).toEqual([]);
  });

  /*
    ⚠️ AND AN UNPRICED CATALOGUE IS STILL REFUSED. The fix widened what can be
    read; it must not have widened it into accepting nothing, because a row at
    zero cost settles free on every call and reads as healthy usage until an
    invoice arrives.
  */
  it("still refuses a catalogue it genuinely cannot price", () => {
    const [found] = readCatalogue(row([{ property_id: "context_window", value: 8192 }]));
    expect(found!.usdPerMillionIn).toBeUndefined();
    expect(refuseDiscovered([found!])).toEqual(["no_priced_row"]);
  });
});

/**
 * WHICH FIELD IS THE MODEL'S NAME.
 *
 * ⚠️ THE FAULT THESE EXIST FOR SHIPPED, RAN AND REPORTED SUCCESS. Sixty-four
 * models synced under Cloudflare's UUIDs — priced, tasked, grouped into lanes,
 * each with a switch — and `compatName` would have addressed every one of them
 * as `/41975cc2-…`. Nothing failed anywhere, because nothing had been switched
 * on yet: the first symptom would have been every AI call in the product
 * refusing, weeks later, for a reason no screen could show.
 */
describe("addressing a model", () => {
  const at = (row: { id?: string; name?: string }) =>
    readCatalogue([{ ...row, task: { name: "Text Generation" } }])[0];

  it("takes the path out of `name` when `id` is a UUID", () => {
    const found = at({
      id: "41975cc2-c82e-4e98-b7b8-88ffb186a545",
      name: "@cf/meta/llama-3.1-8b-instruct",
    });
    expect(found!.id).toBe("@cf/meta/llama-3.1-8b-instruct");
    /* ⚠️ And the vendor, which is the other half of the only name it has. */
    expect(found!.provider).toBe("workers-ai");
    /* ⚠️ Titled by its last segment — the path is already shown beneath it. */
    expect(found!.name).toBe("llama-3.1-8b-instruct");
  });

  /* ⚠️ THE SAME RULE READ THE OTHER WAY, which is what makes it a rule about the
     shape rather than about one vendor's field names. The vendor segment then
     moves out of the id and into the provider — see `addressIn`. */
  it("takes the path out of `id` when `name` is a human title", () => {
    const found = at({ id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" });
    expect(found!.id).toBe("gemini-2.5-flash");
    expect(found!.provider).toBe("google-ai-studio");
    expect(found!.name).toBe("Gemini 2.5 Flash");
  });

  /*
    ⚠️ AND A CATALOGUE NOTHING CAN BE CALLED FROM IS REFUSED WHOLE. This is the
    check that turns the outage above into a visible failure: the rows parse,
    they price, they have tasks — and not one of them resolves a vendor, so
    every model in the answer is half a name.
  */
  it("refuses a catalogue where nothing resolves a vendor", () => {
    const found = at({ id: "41975cc2-c82e-4e98-b7b8-88ffb186a545" });
    expect(found!.provider).toBe("");
    expect(isAddressable(found!)).toBe(false);
    expect(refuseDiscovered([found!])).toContain("no_addressable_row");
  });

  /* ⚠️ Both faults at once are both reported — they have different fixes. */
  it("reports every fault it found rather than the first", () => {
    expect(refuseDiscovered([at({ id: "a-uuid-shaped-thing" })!]))
      .toEqual(["no_addressable_row", "no_priced_row"]);
  });
});

/**
 * A UNIFIED CATALOGUE NAMES ITS VENDOR IN THE ID, AND THE GUESS TABLE MISSED IT.
 *
 * ⚠️ CLOUDFLARE'S OWN LIST NOW CARRIES THIRD-PARTY MODELS AS `google/…`,
 * `openai/…`, `anthropic/…` — 144 of them beside its 84 hosted ones. The vendor
 * was being guessed from the model's SPELLING (`^gemini`), which tests a string
 * beginning `google/` and matches nothing, so every one of those rows resolved
 * no provider and was dropped as unaddressable. The provider is not a guess: it
 * is the first segment.
 *
 * ⚠️ AND THE SEGMENT MOVES OUT OF THE ID. `/compat` is addressed
 * `{provider}/{model}`, so leaving it in builds
 * `google-ai-studio/google/gemini-3.7-flash`.
 */
describe("a vendor named in the id", () => {
  const of = (id: string) => addressIn(id);

  it("reads the vendor off the first segment, in the gateway's own spelling", () => {
    /* ⚠️ `google` is the company; `google-ai-studio` is the gateway's lane. */
    expect(of("google/gemini-3.7-flash")).toEqual({
      provider: "google-ai-studio", model: "gemini-3.7-flash",
    });
    expect(of("anthropic/claude-4-opus").provider).toBe("anthropic");
    /* ⚠️ xAI's company name and the gateway's lane are different words. */
    expect(of("xai/grok-4").provider).toBe("grok");
  });

  /* ⚠️ Cloudflare's own rows carry no vendor — from its side they are its own. */
  it("leaves a Cloudflare model whole", () => {
    expect(of("@cf/meta/llama-3.1-8b-instruct")).toEqual({
      provider: "workers-ai", model: "@cf/meta/llama-3.1-8b-instruct",
    });
  });

  /*
    ⚠️ THE TWO SOURCES LAND ON ONE ROW. Cloudflare says `google/gemini-3.7-flash`
    and Google's own list says `gemini-3.7-flash`; if those stored separately the
    catalogue would carry the same model twice, at two prices, with two switches.
  */
  it("agrees with a bare id from the vendor's own list", () => {
    expect(of("google/gemini-3.7-flash")).toEqual(of("gemini-3.7-flash"));
  });

  /*
    ⚠️ AND A VENDOR THE GATEWAY CANNOT REACH IS NOT HALF-ADDRESSED. Cloudflare
    hosts models from vendors `/compat` has no lane for; keeping the model and
    dropping the vendor would store a row that lists, prices, switches on, and
    fails at the first call.
  */
  it("refuses a vendor the gateway has no lane for", () => {
    expect(of("recraft/recraft-v3").provider).toBe("");
    expect(of("alibaba/hh1-i2v").provider).toBe("");
  });

  it("carries the whole thing through the reader", () => {
    const [found] = readCatalogue([{
      id: "some-uuid", name: "google/gemini-3.7-flash",
      task: { name: "Text Generation" },
      properties: [{ property_id: "price", value: [
        { unit: "per M input tokens", price: 0.3 },
        { unit: "per M output tokens", price: 2.5 },
      ] }],
    }]);
    expect(found!.id).toBe("gemini-3.7-flash");
    expect(found!.provider).toBe("google-ai-studio");
    expect(found!.usdPerMillionOut).toBe(2.5);
  });
});
