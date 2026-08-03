/**
 * ONE MARK CANNOT WORK ON BOTH BACKGROUNDS.
 *
 * A studio's logo is usually a single colour. Drawn for the shipped dark theme
 * it is pale, and it disappears the moment a member switches to light — or
 * opens the studio on a phone set to light, which is most of them. The browser
 * tab is worse still: chrome follows the OS, not the app, so a dark-drawn mark
 * can vanish in the one place its owner looks all day.
 *
 * So there is an optional light variant, and this resolves which one a surface
 * gets. The rules that matter are the fallbacks: a studio with one full-colour
 * mark must upload nothing and see no change, and a surface that asked for a
 * wordmark must never be handed a square (or the reverse) while a correct
 * option exists.
 */

import { describe, expect, it } from "vitest";
import { brandMark, hasWordmark } from "../src/lib/theme.js";
import { markRuns, monogramFor } from "../src/lib/mark.js";

const full = { logoUrl: "/logo.png", iconUrl: "/icon.png", logoUrlLight: "/logo-light.png", iconUrlLight: "/icon-light.png" };

describe("brandMark", () => {
  it("uses the light variant in light mode and the dark one in dark", () => {
    expect(brandMark(full, "light", "logo")).toBe("/logo-light.png");
    expect(brandMark(full, "dark", "logo")).toBe("/logo.png");
    expect(brandMark(full, "light", "icon")).toBe("/icon-light.png");
    expect(brandMark(full, "dark", "icon")).toBe("/icon.png");
  });

  /** The whole compatibility promise: nothing uploaded, nothing changes. */
  it("falls back to the dark mark when no light variant exists", () => {
    const dark = { logoUrl: "/logo.png", iconUrl: "/icon.png" };
    expect(brandMark(dark, "light", "logo")).toBe("/logo.png");
    expect(brandMark(dark, "light", "icon")).toBe("/icon.png");
  });

  /**
   * Shape before mode. A wide wordmark squeezed into a 40px square looks
   * broken, so a surface asking for an icon takes the DARK icon over the light
   * logo — the variant is the second preference, not the first.
   */
  it("prefers the right shape over the right mode", () => {
    const iconOnlyDark = { iconUrl: "/icon.png", logoUrlLight: "/logo-light.png" };
    expect(brandMark(iconOnlyDark, "light", "icon")).toBe("/icon.png");

    const logoOnlyDark = { logoUrl: "/logo.png", iconUrlLight: "/icon-light.png" };
    expect(brandMark(logoOnlyDark, "light", "logo")).toBe("/logo.png");
  });

  /** A studio with only one of the two shapes still gets a mark. */
  it("crosses shapes only when the asked-for one is missing entirely", () => {
    expect(brandMark({ iconUrl: "/icon.png" }, "dark", "logo")).toBe("/icon.png");
    expect(brandMark({ logoUrl: "/logo.png" }, "dark", "icon")).toBe("/logo.png");
  });

  it("is null when a studio has uploaded nothing, and safe on no branding", () => {
    expect(brandMark({}, "dark", "icon")).toBeNull();
    expect(brandMark(null, "dark", "icon")).toBeNull();
    expect(brandMark(undefined, "light", "logo")).toBeNull();
  });
});

/**
 * A WORDMARK ALREADY SAYS THE NAME.
 *
 * The sign-in screen draws the mark and writes the studio's name under it. That
 * is right for a square icon and duplicated for a wordmark — and the generator
 * draws the NAME into the wordmark it makes, so every studio that used it saw
 * its own name twice. This has to track `brandMark`'s logo branch exactly: when
 * that branch falls through to the icon, the written name is the only place the
 * name appears and must stay.
 */
describe("hasWordmark", () => {
  it("is true exactly when brandMark returns a wide mark", () => {
    // The wide URL each shape should resolve to per mode, or null for "the icon
    // fallback was taken" — which is the case the written name must survive.
    const cases: [Record<string, string>, string | null, string | null][] = [
      [full, "/logo-light.png", "/logo.png"],
      [{ logoUrl: "/logo.png" }, "/logo.png", "/logo.png"],
      [{ logoUrlLight: "/l.png" }, "/l.png", null],
      [{ iconUrl: "/i.png" }, null, null],
      [{}, null, null],
    ];
    for (const [b, inLight, inDark] of cases) {
      expect(hasWordmark(b, "light")).toBe(inLight !== null);
      expect(hasWordmark(b, "dark")).toBe(inDark !== null);
      if (inLight) expect(brandMark(b, "light", "logo")).toBe(inLight);
      if (inDark) expect(brandMark(b, "dark", "logo")).toBe(inDark);
    }
  });

  it("is false when only a square icon was uploaded", () => {
    expect(hasWordmark({ iconUrl: "/icon.png" }, "dark")).toBe(false);
    expect(hasWordmark({ iconUrl: "/icon.png", iconUrlLight: "/icon-light.png" }, "light")).toBe(false);
  });

  it("is false in dark mode when only a LIGHT wordmark exists", () => {
    expect(hasWordmark({ logoUrlLight: "/logo-light.png" }, "dark")).toBe(false);
    expect(hasWordmark({ logoUrlLight: "/logo-light.png" }, "light")).toBe(true);
  });

  it("is safe on no branding", () => {
    expect(hasWordmark(null, "dark")).toBe(false);
    expect(hasWordmark(undefined, "light")).toBe(false);
    expect(hasWordmark({}, "dark")).toBe(false);
  });
});

/**
 * COUNTS FROM EACH END, NOT A LIST OF CHARACTERS.
 *
 * A text logo is the name plus two moves: a piece in the brand colour, a piece
 * that steps back. Expressed as head/tail counts so it survives the owner
 * fixing a typo in their own name — a per-character selection would silently
 * slide onto the wrong letters and say nothing.
 *
 * Every count is clamped, because these come from a stepper the owner drives
 * and from a stored value that may predate a rename that shortened the name.
 */
describe("markRuns", () => {
  const flat = (runs: { text: string }[]) => runs.map((r) => r.text).join("");

  it("puts the trailing character in the accent and the prefix in the quiet run", () => {
    // The case this was built for: "by" quieter, the full stop in the accent.
    expect(markRuns("byShujaa.", { softHead: 2, accentTail: 1 })).toEqual([
      { text: "by", accent: false, soft: true },
      { text: "Shujaa", accent: false, soft: false },
      { text: ".", accent: true, soft: false },
    ]);
  });

  it("merges neighbours that share a style, so the canvas draws one run not nine", () => {
    expect(markRuns("Iron Temple", { accentHead: 4 })).toEqual([
      { text: "Iron", accent: true, soft: false },
      { text: " Temple", accent: false, soft: false },
    ]);
  });

  it("lets the two moves overlap on the same characters", () => {
    expect(markRuns("Kova", { accentHead: 2, softHead: 2 })).toEqual([
      { text: "Ko", accent: true, soft: true },
      { text: "va", accent: false, soft: false },
    ]);
  });

  it("clamps a count longer than the name instead of throwing", () => {
    const runs = markRuns("Kova", { accentHead: 99, accentTail: 99 });
    expect(runs).toEqual([{ text: "Kova", accent: true, soft: false }]);
    expect(flat(runs)).toBe("Kova");
  });

  it("ignores nonsense counts", () => {
    expect(markRuns("Kova", { accentHead: -3, softTail: 1.7 })).toEqual([
      { text: "Kov", accent: false, soft: false },
      { text: "a", accent: false, soft: true },
    ]);
  });

  it("never drops or reorders a character", () => {
    for (const style of [{}, { accentHead: 1 }, { accentTail: 3, softHead: 2 }, { softHead: 9 }]) {
      expect(flat(markRuns("byShujaa.", style))).toBe("byShujaa.");
    }
  });

  it("counts by code point, so an emoji is one character and not two halves", () => {
    expect(markRuns("🏋️x", { accentHead: 1 })[0]!.text).toBe("🏋");
  });

  it("is empty for an empty name, and plain with no style at all", () => {
    expect(markRuns("", { accentHead: 2 })).toEqual([]);
    expect(markRuns("Kova")).toEqual([{ text: "Kova", accent: false, soft: false }]);
    expect(markRuns("Kova", null)).toEqual([{ text: "Kova", accent: false, soft: false }]);
  });
});

/**
 * THE MONOGRAM IS A RECOMMENDATION, AND ITS CASE IS THE BRAND.
 *
 * Most studios here are one person with a business name and no design file, so
 * the icon gets drawn from the name. The one rule that would make every
 * generated mark look subtly wrong at once is normalising the capitals: a
 * studio called "byShujaa" wrote it that way on purpose, and "BS" is not their
 * brand where "bS" is. So the case comes from the name, untouched.
 */
describe("monogramFor", () => {
  it("takes the first letter and the internal capital of a camelCase name", () => {
    expect(monogramFor("byShujaa")).toBe("bS");
    expect(monogramFor("TrueForm")).toBe("TF");
  });

  it("takes the initials of a multi-word name", () => {
    expect(monogramFor("Iron Temple")).toBe("IT");
    expect(monogramFor("The Strength Room")).toBe("TS");
    expect(monogramFor("Body-Works")).toBe("BW");
  });

  it("falls back to the first two characters, as written", () => {
    expect(monogramFor("kova")).toBe("ko");
    expect(monogramFor("ATLAS")).toBe("AT");
  });

  it("never normalises the case the owner chose", () => {
    expect(monogramFor("byShujaa")).not.toBe("BS");
    expect(monogramFor("kova")).not.toBe("KO");
  });

  it("survives a name it cannot do anything with", () => {
    expect(monogramFor("")).toBe("");
    expect(monogramFor("   ")).toBe("");
    expect(monogramFor("X")).toBe("X");
  });
});
