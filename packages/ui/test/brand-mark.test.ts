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
import { brandMark } from "../src/lib/theme.js";
import { monogramFor } from "../src/lib/mark.js";

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
