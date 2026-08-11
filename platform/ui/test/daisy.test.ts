/**
 * THE BRIDGE.
 *
 * ⚠️ THE FAILURE THIS FILE EXISTS FOR IS SILENT AND PARTIAL. A variable daisyUI
 * reads and we never write does not throw and does not look broken — that one
 * component falls back to daisyUI's stock theme and renders in somebody else's
 * brand, on a tenant's screen, next to components that are correct. So the map
 * is proved COMPLETE against their own list rather than spot-checked.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { DAISY_VARS, daisyTheme, daisySheet } from "../src/daisy.js";
import { DEFAULT_BRAND, RANGE, type Brand } from "../src/brand.js";
import { rgbToOklch } from "../src/colour.js";
import { FLOOR } from "../src/ground.js";
import { contrast, fromHex } from "../src/colour.js";

const BRANDS: Brand[] = [
  DEFAULT_BRAND,
  { ...DEFAULT_BRAND, accent: "#0b7a5a", ambience: { hue: 155, intensity: RANGE.ambienceIntensity.max } },
  /* ⚠️ Mid-lightness saturated orange: the case a hand-tuned palette fails,
     because it carries neither near-white nor near-dark as a legible fill. */
  { ...DEFAULT_BRAND, accent: "#e8590c", ambience: { hue: 32, intensity: RANGE.ambienceIntensity.max } },
  { ...DEFAULT_BRAND, accent: "#ffffff", radius: RANGE.radius.min, density: "compact", edge: "none", elevation: "flat" },
  { ...DEFAULT_BRAND, accent: "#000000", radius: RANGE.radius.max, edge: "defined" },
];
const THEMES = ["light", "dark"] as const;

describe("every variable daisyUI reads, we write", () => {
  it("emits all of them, for every brand and both themes", () => {
    for (const brand of BRANDS) {
      for (const theme of THEMES) {
        const out = daisyTheme(brand, theme);
        for (const name of DAISY_VARS) {
          expect(out[name], `${brand.accent} ${theme} ${name}`).toBeTruthy();
        }
      }
    }
  });

  /*
    ⚠️ CHECKED AGAINST daisyUI'S OWN FILE WHERE IT IS INSTALLED. Our list is a
    copy, and a copy of somebody else's contract goes stale on their release
    rather than on ours — which is the kind of drift nobody is watching for.
    Skipped rather than failed when the package is absent, because the package
    is not a dependency of this test.
  */
  it("names every variable their stylesheet declares", () => {
    const themes = "node_modules/daisyui/themes.css";
    if (!existsSync(themes)) return;
    const declared = new Set(
      [...readFileSync(themes, "utf8").matchAll(/(--(?:color|radius|size)-[a-z0-9-]+|--border|--depth|--noise)\s*:/g)]
        .map((m) => m[1]!),
    );
    const missing = [...declared].filter((v) => !DAISY_VARS.includes(v as never));
    expect(missing, "daisyUI reads these and the bridge never writes them").toEqual([]);
  });

  it("writes no colour that is not a hex the browser will accept", () => {
    for (const brand of BRANDS) {
      for (const theme of THEMES) {
        for (const [name, value] of Object.entries(daisyTheme(brand, theme))) {
          if (!name.startsWith("--color-")) continue;
          expect(value, `${name}`).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
  });
});

describe("the light survives the crossing", () => {
  /*
    ⚠️ THE CLAIM THE WHOLE SYSTEM RESTS ON, ASSERTED ON THE OTHER SIDE OF THE
    BRIDGE. Proving contrast in our own tokens proves nothing about what daisyUI
    renders — what it renders is these pairs, so these pairs are what must clear
    the floor.
  */
  it("clears the contrast floor for every fill-and-ink pair it hands over", () => {
    const pairs = [
      ["--color-base-100", "--color-base-content"],
      ["--color-primary", "--color-primary-content"],
      ["--color-secondary", "--color-secondary-content"],
      ["--color-accent", "--color-accent-content"],
      ["--color-neutral", "--color-neutral-content"],
      ["--color-success", "--color-success-content"],
      ["--color-warning", "--color-warning-content"],
      ["--color-error", "--color-error-content"],
      ["--color-info", "--color-info-content"],
    ] as const;
    for (const brand of BRANDS) {
      for (const theme of THEMES) {
        const t = daisyTheme(brand, theme);
        for (const [fill, ink] of pairs) {
          const ratio = contrast(fromHex(t[fill]!), fromHex(t[ink]!));
          expect(ratio, `${brand.accent} ${theme} ${fill}`).toBeGreaterThanOrEqual(FLOOR.text);
        }
      }
    }
  });

  /*
    ⚠️ ONE HUE AT THREE DEPTHS, NOT THREE COLOURS. daisyUI offers primary,
    secondary and accent; this language has one accent on purpose. Inventing hues
    for the other two hands every author a second and third brand colour to reach
    for, and the restraint is gone in a week.
  */
  it("keeps the three accent slots on the tenant's one hue", () => {
    for (const brand of BRANDS.slice(0, 3)) {
      for (const theme of THEMES) {
        const t = daisyTheme(brand, theme);
        const hues = (["--color-primary", "--color-secondary", "--color-accent"] as const)
          .map((k) => rgbToOklch(fromHex(t[k]!)).h);
        const spread = Math.max(...hues) - Math.min(...hues);
        expect(spread, `${brand.accent} ${theme}`).toBeLessThan(1);
      }
    }
  });

  /* And the ladder still steps: three base surfaces, three distinct values. */
  it("keeps the three base surfaces distinguishable", () => {
    for (const brand of BRANDS) {
      for (const theme of THEMES) {
        const t = daisyTheme(brand, theme);
        const ls = (["--color-base-100", "--color-base-200", "--color-base-300"] as const)
          .map((k) => rgbToOklch(fromHex(t[k]!)).l);
        expect(new Set(ls.map((l) => l.toFixed(3))).size, `${brand.accent} ${theme}`).toBe(3);
      }
    }
  });

  /* ⚠️ Semantic hues are never the tenant's, at any depth. */
  it("gives every tenant the same danger", () => {
    const reds = BRANDS.map((b) => daisyTheme(b, "dark")["--color-error"]);
    expect(new Set(reds).size).toBe(1);
  });
});

describe("the sheet is scoped so a toggle wins in either direction", () => {
  /*
    ⚠️ A PALETTE DEFINED ONLY INSIDE A MEDIA QUERY HAS NO VALUE AT ALL when the
    root carries an explicit choice, and the symptom is a screen with no
    background. All three blocks, every time.
  */
  it("emits light bare, dark under the media query, and dark under the attribute", () => {
    const css = daisySheet(DEFAULT_BRAND);
    expect(css).toContain(":root {");
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain(":root:not([data-theme='light'])");
    expect(css).toContain(":root[data-theme='dark']");
    /* Every variable in every block, or one theme is missing a colour. */
    for (const name of DAISY_VARS) {
      /* ⚠️ Matched with its colon: `--color-primary` is a substring of
         `--color-primary-content`, so a bare split counts its own sibling. */
      expect(css.split(`${name}:`).length - 1, name).toBe(3);
    }
  });
});
