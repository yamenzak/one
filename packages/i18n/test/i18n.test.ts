/**
 * The pure half of translation — everything that can be wrong without a DOM.
 *
 * The two decisions worth pinning are the FALLBACK (a missing translation shows
 * English, never a key) and the LOCALE MATCH (`de-AT` gets German rather than
 * falling to English over a region tag). Both are the kind of thing that looks
 * fine in a demo and embarrasses you in front of a customer.
 */

import { describe, expect, it } from "vitest";
import { missingKeys, pickLocale, strayKeys } from "../src/index.js";

describe("choosing a locale", () => {
  it("prefers an exact match", () => {
    expect(pickLocale(["de-AT"], ["en", "de", "de-AT"], "en")).toBe("de-AT");
  });

  it("falls back to the LANGUAGE rather than to English over a region tag", () => {
    // A Swiss or Austrian browser must get German. Matching only exactly would
    // send half of the German-speaking world to the English build.
    expect(pickLocale(["de-CH"], ["en", "de"], "en")).toBe("de");
    expect(pickLocale(["de-AT", "en-GB"], ["en", "de"], "en")).toBe("de");
  });

  it("respects the browser's ORDER of preference", () => {
    expect(pickLocale(["fr", "de", "en"], ["en", "de"], "en")).toBe("de");
  });

  it("falls back when nothing matches", () => {
    expect(pickLocale(["ja"], ["en", "de"], "en")).toBe("en");
    expect(pickLocale([], ["en", "de"], "en")).toBe("en");
  });

  it("is case-insensitive, because browsers are inconsistent", () => {
    expect(pickLocale(["DE-de"], ["en", "de"], "en")).toBe("de");
  });
});

describe("finding the gaps", () => {
  const reference = { "a.one": "One", "a.two": "Two", "a.three": "Three" };

  it("names what a translation is missing", () => {
    // `Partial` keeps a half-finished locale compiling, which is right — and
    // also means nothing stops one shipping. This is the other half of that
    // trade, so an app can make its own gaps a test failure.
    expect(missingKeys(reference, { "a.one": "Eins" })).toEqual(["a.two", "a.three"]);
    expect(missingKeys(reference, { "a.one": "Eins", "a.two": "Zwei", "a.three": "Drei" })).toEqual([]);
  });

  it("names what a rename left behind", () => {
    // A key deleted from the reference lingers in every translation, where it is
    // invisible: nothing renders it and nothing complains.
    expect(strayKeys(reference, { "a.one": "Eins", "a.gone": "Weg" } as never)).toEqual(["a.gone"]);
  });
});
