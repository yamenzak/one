/**
 * THE DERIVATION.
 *
 * ⚠️ THE ASSERTION THAT MATTERS IS THE REFUSAL. `DECLARABLE` is a comment until
 * something rejects a word outside it — and the value of the whole system is
 * that its declaration surface is small enough to sweep, which is only true if
 * nothing can be said off-list.
 */

import { describe, expect, it } from "vitest";
import {
  DECLARABLE, DERIVED, LAWS, declarationProblems, litFor, sceneFor,
} from "../src/index.js";
import { DEFAULT_BRAND, RANGE, tokensFor, type Brand } from "../src/brand.js";
import { FLOOR } from "../src/ground.js";

describe("an app says what a thing is, never how it looks", () => {
  it("accepts every word the language has", () => {
    for (const [key, values] of Object.entries(DECLARABLE)) {
      for (const value of values) {
        expect(declarationProblems({ [key]: value }), `${key}: ${value}`).toEqual([]);
      }
    }
  });

  /*
    ⚠️ THE SIX WORDS THAT MOST LOOK LIKE THEY BELONG. Every one of them is a
    property somebody reasonably expects to set, and every one is the thing whose
    absence makes the sweep a proof. The refusal names what decides instead,
    because a prohibition with no replacement is a rule people route around.
  */
  it("refuses a look, and says what decides it", () => {
    for (const word of ["colour", "background", "margin", "duration", "fontSize", "width"]) {
      const [problem] = declarationProblems({ [word]: "anything" });
      expect(problem?.at, word).toBe(word);
      expect(problem?.detail, word).toContain("derived from");
      expect(DERIVED[word], word).toBeTruthy();
    }
  });

  it("refuses a word the language does not have at all, and lists what it does", () => {
    const [problem] = declarationProblems({ vibe: "premium" });
    expect(problem?.detail).toContain("not part of the language");
    for (const key of Object.keys(DECLARABLE)) expect(problem?.detail).toContain(key);
  });

  it("refuses a value outside a closed set", () => {
    expect(declarationProblems({ tone: "purple" })[0]?.detail).toContain("not one of");
    expect(declarationProblems({ archetype: "dashboard" })[0]?.detail).toContain("not one of");
  });

  /*
    ⚠️ REPORTS EVERY MISTAKE, NOT THE FIRST. This runs over a whole manifest, and
    an author fixing six things one round trip at a time is an author who stops
    reading the messages.
  */
  it("reports all of them at once", () => {
    expect(declarationProblems({ colour: "red", margin: "8px", tone: "purple" })).toHaveLength(3);
  });
});

describe("the light falls, and nothing is painted", () => {
  /*
    ⚠️ THE CLAIM THE WHOLE PACKAGE RESTS ON, swept rather than sampled: every
    depth, of every theme, of a brand at each end of its declared range, clears
    the contrast floor. A range nobody walked is a range with a hole in the middle.
  */
  it("clears the floor at every depth, for every brand in range", () => {
    const brands: Brand[] = [
      DEFAULT_BRAND,
      { ...DEFAULT_BRAND, accent: "#0b7a5a", ambience: { hue: 155, intensity: RANGE.ambienceIntensity.max } },
      { ...DEFAULT_BRAND, accent: "#e8590c", ambience: { hue: 32, intensity: RANGE.ambienceIntensity.max } },
      { ...DEFAULT_BRAND, accent: "#ffffff", ambience: { hue: 0, intensity: RANGE.ambienceIntensity.min } },
      { ...DEFAULT_BRAND, accent: "#000000", ambience: { hue: 359, intensity: RANGE.ambienceIntensity.max } },
    ];
    for (const brand of brands) {
      for (const theme of ["light", "dark"] as const) {
        const scene = sceneFor(brand, theme);
        for (const depth of [0, 1, 2, 3] as const) {
          const lit = litFor(scene, depth);
          expect(lit.ratio, `${brand.accent} ${theme} depth ${depth}`).toBeGreaterThanOrEqual(FLOOR.text);
          expect(lit.ink).toMatch(/^#[0-9a-f]{6}$/);
          expect(lit.accentInk).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
  });

  /*
    ⚠️ THE ACCENT IS RE-LIT PER SURFACE. Computed once per theme, a brand is
    legible on the page and not on the card — and the tempting fix, letting each
    screen choose its own primary, produces a product whose brand colour is a
    different colour on every screen.
  */
  it("re-lights the accent per surface rather than once per theme", () => {
    const scene = sceneFor(DEFAULT_BRAND, "dark");
    const lightnesses = ([0, 1, 2, 3] as const).map((d) => litFor(scene, d).accent.l);
    expect(new Set(lightnesses.map((l) => l.toFixed(3))).size).toBeGreaterThan(1);
    // ...and it is still the tenant's hue at every one of them.
    const hues = ([0, 1, 2, 3] as const).map((d) => litFor(scene, d).accent.h);
    expect(new Set(hues.map((h) => h.toFixed(1))).size).toBe(1);
  });

  /* Depth is a step toward the light, so no two depths land on one surface. */
  /*
    ⚠️ DEPTH IS READ FROM LIGHTNESS IN DARK AND FROM SHADOW IN LIGHT, and the
    first version of this asserted lightness for both. It could only be satisfied
    by grey cards on a white page — the dusty look that makes a light theme read
    as cheap — because a near-white ground has no room above it for four steps.
    A bright room tells things apart by what they cast; a dark one by what they
    catch. So the check is theme-aware, which is the physics rather than a
    concession to it.
  */
  it("separates depth by lightness in dark and by elevation in light", () => {
    const dark = ([0, 1, 2, 3] as const).map((d) => litFor(sceneFor(DEFAULT_BRAND, "dark"), d).surface.l);
    for (let i = 1; i < dark.length; i++) {
      expect(Math.abs(dark[i]! - dark[i - 1]!), `dark ${i - 1}→${i}`).toBeGreaterThan(0.008);
    }

    /* In light the page-to-card step is the one that carries the design. */
    const light = ([0, 1, 2, 3] as const).map((d) => litFor(sceneFor(DEFAULT_BRAND, "light"), d).surface.l);
    expect(light[1]! - light[0]!, "page → card").toBeGreaterThan(0.03);
    /* ⚠️ And the card is NEAR-WHITE, which is the whole point of lowering the page. */
    expect(light[1]!, "a card that is not near-white is a dusty card").toBeGreaterThan(0.97);

    /* Above it, the shadow is what differs — and it must actually grow. */
    const shadows = ([1, 2, 3] as const).map((d) => tokensFor(DEFAULT_BRAND, "light")[`--elevation-${d}`]!);
    expect(new Set(shadows).size, "three depths, three shadows").toBe(3);
    for (const s of shadows) expect(s).not.toBe("none");
    /* ⚠️ And none in dark: a shadow on near-black is a pixel that clarifies nothing. */
    for (const d of [1, 2, 3]) expect(tokensFor(DEFAULT_BRAND, "dark")[`--elevation-${d}`]).toBe("none");
  });
});

describe("the laws are quotable", () => {
  /*
    ⚠️ A LAW NAMES WHAT IT REPLACES. Without that it is a preference, and a
    preference is what gets overruled by the first person with a deadline.
  */
  it("states what each one replaces", () => {
    expect(LAWS).toHaveLength(4);
    for (const l of LAWS) {
      expect(l.replaces.length, l.law).toBeGreaterThan(20);
      expect(l.means.length, l.law).toBeGreaterThan(20);
    }
  });
});
