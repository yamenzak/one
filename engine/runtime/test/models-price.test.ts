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
import { priceFrom, readCatalogue, refuseDiscovered } from "../src/models.js";

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
  const row = (properties: readonly { property_id: string; value: unknown }[]) =>
    [{ id: "@cf/meta/llama-3", name: "Llama", task: { name: "Text Generation" }, properties }];

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
