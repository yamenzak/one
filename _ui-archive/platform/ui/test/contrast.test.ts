/**
 * THE SWEEP — the proof behind "a tenant's bad palette is not their problem".
 *
 * ⚠️ WALKED, NOT SAMPLED. The claim in UI.md §1.1 is that EVERY value in every
 * slot's range is safe. A handful of representative brands proves a handful of
 * brands; the hole in a range is always somewhere nobody chose to look, and the
 * report is a customer saying a button is invisible on their screen.
 *
 * The colour-carrying slots are the accent and the ambience family, so those two
 * are walked at every hue in both themes. The rest are enumerated.
 */

import { describe, expect, it } from "vitest";
import {
  accentOn, bestForeground, contrast, DEFAULT_BRAND, FLOOR, groundFor, inkOn, INK_DARK,
  INK_LIGHT, luminance, oklchToRgb, RANGE, semanticForm, surfaces, tokensFor, validateBrand,
  fromHex, rgbToOklch, type Brand, type Theme,
} from "../src/index.js";

const THEMES: Theme[] = ["light", "dark"];
/** Every 10°, both themes: 72 hues × 2. Fine enough to catch a narrow band. */
const HUES = Array.from({ length: 36 }, (_, i) => i * 10);
/** The full legal intensity range, at the resolution an editor can produce. */
const INTENSITIES = Array.from({ length: 13 }, (_, i) => Number((i * 0.005).toFixed(3)));

const brandAt = (accentHue: number, ambienceHue: number, intensity: number): Brand => ({
  ...DEFAULT_BRAND,
  // The most saturated accent a hue can hold, because that is the hard case.
  accent: toHexAt(accentHue),
  ambience: { hue: ambienceHue, intensity },
});

const toHexAt = (hue: number): string => {
  const { r, g, b } = oklchToRgb({ l: 0.55, c: 0.3, h: hue });
  const two = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${two(r)}${two(g)}${two(b)}`;
};

/* ------------------------------------------------------------------ ink --- */

describe("the on-colour is measured, and the measurement is checked independently", () => {
  /*
    ⚠️ AN EXHAUSTIVE SWEEP THAT VERIFIES WITH THE FUNCTION UNDER TEST PROVES
    CONSISTENCY, NOT CORRECTNESS.
    
    Every other assertion in this file reads a ratio back through `inkOn`, which
    calls `bestForeground`. Replace `bestForeground` with a lightness threshold
    and the sweep goes on passing — because it is now measuring with the same
    wrong rule that produced the colour. The mutation survived exactly there.
    
    So this one computes both candidates in the test and asserts the function
    returns the better of the two. It is the only check here that does not depend
    on the thing it is checking.
  */
  it("returns whichever ink actually contrasts more, at every lightness and hue", () => {
    const wrong: string[] = [];
    for (const hue of HUES) {
      for (let l = 0.1; l <= 0.95; l += 0.05) {
        for (const c of [0, 0.08, 0.2, 0.3]) {
          const background = oklchToRgb({ l, c, h: hue });
          const mine = bestForeground(background);
          const onLight = contrast(background, oklchToRgb(INK_LIGHT));
          const onDark = contrast(background, oklchToRgb(INK_DARK));
          const better = Math.max(onLight, onDark);
          if (Math.abs(mine.ratio - better) > 0.001) {
            wrong.push(`hue ${hue} l ${l.toFixed(2)} c ${c}: chose ${mine.ratio.toFixed(2)}, better was ${better.toFixed(2)}`);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  /*
    And the band a threshold gets wrong, named: mid-lightness saturated colours,
    where near-white and near-dark are both borderline and a rule picks one of
    them badly for a whole hue range.
  */
  it("does not agree with a lightness threshold everywhere", () => {
    let disagreements = 0;
    for (const hue of HUES) {
      for (let l = 0.35; l <= 0.7; l += 0.05) {
        const background = oklchToRgb({ l, c: 0.3, h: hue });
        const measured = bestForeground(background).ink;
        const byRule = luminance(background) > 0.18 ? oklchToRgb(INK_DARK) : oklchToRgb(INK_LIGHT);
        if (measured.r !== byRule.r) disagreements++;
      }
    }
    // If a threshold agreed everywhere, measuring would be an expensive way to
    // reach the same answer — and this whole file would prove nothing.
    expect(disagreements).toBeGreaterThan(0);
  });
});

describe("ink clears its floor on every surface, for every legal brand", () => {
  /*
    ⚠️ THE ASSERTION THE WHOLE DESIGN RESTS ON. If this can fail for any brand in
    range, then the brand surface is not small enough to guarantee and the
    promise in UI.md §1.1 is an aspiration rather than an invariant.
  */
  it("reads on canvas and on every surface step", () => {
    const failures: string[] = [];
    for (const theme of THEMES) {
      for (const hue of HUES) {
        for (const intensity of [0, 0.03, RANGE.ambienceIntensity.max]) {
          const ground = groundFor(brandAt(hue, hue, intensity), theme);
          surfaces(ground, 3).forEach((surface, i) => {
            const { ratio } = inkOn(surface);
            if (ratio < FLOOR.text) failures.push(`${theme} hue ${hue} intensity ${intensity} surface ${i}: ${ratio.toFixed(2)}`);
          });
        }
      }
    }
    expect(failures).toEqual([]);
  });

  /*
    ⚠️ AND ON A FILLED ACCENT, which is the case a lightness threshold gets
    wrong. Mid-lightness saturated colours are where near-white and near-dark are
    both borderline, and a rule picks one of them badly for a whole hue band.
  */
  it("reads on a filled accent, at every hue", () => {
    const failures: string[] = [];
    for (const theme of THEMES) {
      for (const accentHue of HUES) {
        const brand = brandAt(accentHue, 250, 0.03);
        const ground = groundFor(brand, theme);
        for (const surface of surfaces(ground, 3)) {
          const lit = accentOn(ground.accent, surface);
          const { ratio } = inkOn(lit);
          if (ratio < FLOOR.text) failures.push(`${theme} accent ${accentHue} on ${surface.l.toFixed(2)}: ${ratio.toFixed(2)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

/* --------------------------------------------------------------- surfaces --- */

describe("the ladder never collapses", () => {
  /*
    ⚠️ "ELEVATION IS ALWAYS LIGHTER" SATURATES. A near-white page reaches white
    at the first step, and every surface after it is the same colour — so an
    input inside a card inside a sheet is one flat rectangle. Choosing the
    direction with headroom per step is what stops that at both ends.
  */
  /*
    ⚠️ THE STEP THAT HAS TO SURVIVE EVERY BRAND IS PAGE TO CARD. Above it, a dark
    ground keeps climbing and a light one is already at the ceiling — where depth
    is carried by `--elevation-1..3` rather than by lightness, because a bright
    room tells things apart by what they cast. Asserting a lightness gap for all
    four in both themes is only satisfiable with grey cards on a white page.
  */
  it("keeps the page and the card visibly apart, for every brand in range", () => {
    const collapsed: string[] = [];
    for (const theme of THEMES) {
      for (const hue of HUES) {
        for (const intensity of INTENSITIES) {
          const ladder = surfaces(groundFor(brandAt(hue, hue, intensity), theme), 3);
          const ratio = contrast(oklchToRgb(ladder[1]!), oklchToRgb(ladder[0]!));
          if (ratio < 1.05) collapsed.push(`${theme} hue ${hue} intensity ${intensity}: ${ratio.toFixed(3)}`);
          /* And in dark, every step above it too — there is room, so it is used. */
          if (theme === "dark") {
            for (let i = 2; i < ladder.length; i++) {
              const r = contrast(oklchToRgb(ladder[i]!), oklchToRgb(ladder[i - 1]!));
              if (r < 1.05) collapsed.push(`dark hue ${hue} intensity ${intensity} step ${i}: ${r.toFixed(3)}`);
            }
          }
        }
      }
    }
    expect(collapsed).toEqual([]);
  });

  it("inherits the ground's hue, so a branded page tints its own furniture", () => {
    const ground = groundFor(brandAt(20, 140, 0.05), "light");
    for (const surface of surfaces(ground, 3).slice(1)) {
      expect(surface.h).toBe(140);
      expect(surface.c).toBeGreaterThan(0);
    }
  });
});

/* ---------------------------------------------------------------- accent --- */

describe("the accent is re-lit, never recomputed", () => {
  /*
    ⚠️ THE HUE IS KEPT EXACTLY. A screen that picked a new primary because the
    old one did not contrast produces a product whose brand colour is a different
    colour on every screen — and a tenant who never sees the one they chose.
  */
  it("keeps the tenant's hue on every surface of every theme", () => {
    for (const theme of THEMES) {
      for (const hue of HUES) {
        const ground = groundFor(brandAt(hue, 250, 0.03), theme);
        for (const surface of surfaces(ground, 3)) {
          const lit = accentOn(ground.accent, surface);
          expect(Math.abs(lit.h - ground.accent.h), `${theme} ${hue}`).toBeLessThan(0.001);
        }
      }
    }
  });

  it("clears its floor against the surface it sits on", () => {
    const failures: string[] = [];
    for (const theme of THEMES) {
      for (const hue of HUES) {
        const ground = groundFor(brandAt(hue, hue, 0.04), theme);
        for (const surface of surfaces(ground, 3)) {
          const ratio = contrast(oklchToRgb(accentOn(ground.accent, surface)), oklchToRgb(surface));
          if (ratio < FLOOR.nonText) failures.push(`${theme} hue ${hue}: ${ratio.toFixed(2)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("leaves an accent alone when it already clears the floor", () => {
    const ground = groundFor(DEFAULT_BRAND, "light");
    const lit = accentOn(ground.accent, ground.canvas);
    expect(lit).toEqual(ground.accent);
  });
});

/* -------------------------------------------------------------- semantics --- */

describe("a semantic differs from its context, not merely from the contrast floor", () => {
  /*
    ⚠️ CONTRAST IS NOT DISTINGUISHABILITY. Green success on a green ambience can
    clear every floor and still fail completely, because a signal's job is to
    differ from what surrounds it. Detecting the collision is what lets the
    renderer answer without an author writing a conditional.
  */
  const success = rgbToOklch(fromHex("#2f9e44"));

  it("detects a tone colliding with its ground", () => {
    const green = groundFor(brandAt(250, success.h, 0.05), "light");
    expect(semanticForm(success, green.canvas)).toBe("contained");
  });

  it("leaves a tone alone on a ground it cannot be confused with", () => {
    const blue = groundFor(brandAt(250, 250, 0.05), "light");
    expect(semanticForm(success, blue.canvas)).toBe("tone");
  });

  /*
    A ground with almost no chroma is grey and cannot be confused with anything —
    which is why the neutral surfaces outcomes live on are the safe place for
    them in the first place.
  */
  it("never collides with a neutral ground", () => {
    for (const hue of HUES) {
      const neutral = groundFor(brandAt(250, hue, 0), "light");
      expect(semanticForm(success, neutral.canvas), `hue ${hue}`).toBe("tone");
    }
  });
});

/* ----------------------------------------------------------------- slots --- */

describe("the brand surface is closed, and out of range is refused", () => {
  /*
    ⚠️ REFUSED, NOT CLAMPED. Clamping accepts a value and renders something else,
    so a tenant who typed 40 sees 24 and concludes the setting is broken.
  */
  it("names the slot and its bounds", () => {
    expect(validateBrand({ ...DEFAULT_BRAND, radius: 40 })).toEqual([{ slot: "radius", detail: "must be between 8 and 24" }]);
    expect(validateBrand({ ...DEFAULT_BRAND, ambience: { hue: 250, intensity: 0.2 } })[0]?.slot).toBe("ambience");
    expect(validateBrand({ ...DEFAULT_BRAND, accent: "rebeccapurple" })[0]?.slot).toBe("accent");
    expect(validateBrand(DEFAULT_BRAND)).toEqual([]);
  });

  it("emits a token for everything a component may reach, and nothing else", () => {
    const tokens = tokensFor(DEFAULT_BRAND, "dark");
    expect(Object.keys(tokens).every((k) => k.startsWith("--"))).toBe(true);
    for (const required of ["--canvas", "--canvas-ink", "--surface-1", "--surface-1-accent-ink", "--radius", "--edge"]) {
      expect(tokens[required], required).toBeTruthy();
    }
    /*
      ⚠️ A SHADOW IS LIGHT-ONLY, AND `flat` MEANS NO SHADOW — NEVER NO BOUNDARY.
      This test used to assert flat-in-light was `none`, which is what let the
      hole ship: in light the shadow is the only separator, so a flat tenant got
      surfaces 1 to 3 all within a rounding error of white with nothing telling
      them apart — cards with no edge, a segmented indicator that WAS the bar it
      sat in, a confirm whose two buttons were the card behind them. A hairline
      is the same token doing the same job in a way flat permits.
    */
    expect(tokensFor({ ...DEFAULT_BRAND, elevation: "soft" }, "dark")["--elevation"], "a shadow on near-black is spent for nothing").toBe("none");
    expect(tokensFor({ ...DEFAULT_BRAND, elevation: "flat" }, "dark")["--elevation"]).toBe("none");
    const flatLight = tokensFor({ ...DEFAULT_BRAND, elevation: "flat" }, "light")["--elevation"]!;
    expect(flatLight, "flat in light must still separate, or nothing does").not.toBe("none");
    expect(flatLight, "and it separates by an edge rather than by a shadow").toContain("inset");
    const softLight = tokensFor({ ...DEFAULT_BRAND, elevation: "soft" }, "light")["--elevation"]!;
    expect(softLight).not.toBe("none");
    expect(softLight, "soft casts, it does not outline").not.toContain("inset");
  });
});
