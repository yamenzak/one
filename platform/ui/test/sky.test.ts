/**
 * THE SKY.
 *
 * ⚠️ THE SKY IS THE ONE PLACE COLOUR IS NOT MEASURED AGAINST INK, so the checks
 * that keep every other surface honest do not reach it. What replaces them: the
 * hue is the tenant's and never drifts, the light stays under the ambience
 * ceiling so it cannot reach the saturation of a semantic fill, and the layer
 * FADES rather than ending — a backdrop with a bottom edge is the single thing
 * that most separates a stack of cards from a designed screen.
 */

import { describe, expect, it } from "vitest";
import { SKIES, SKY, SKY_VARS, MASKED, skyVars, skySheet } from "../src/sky.js";
import { CHOREOGRAPHY } from "../src/motion.js";
import { DEFAULT_BRAND, RANGE, type Brand } from "../src/brand.js";
import { fromHex, rgbToOklch } from "../src/colour.js";

const BRANDS: Brand[] = [
  DEFAULT_BRAND,
  { ...DEFAULT_BRAND, accent: "#0b7a5a", ambience: { hue: 155, intensity: RANGE.ambienceIntensity.max } },
  { ...DEFAULT_BRAND, accent: "#e8590c", ambience: { hue: 32, intensity: RANGE.ambienceIntensity.max } },
  { ...DEFAULT_BRAND, accent: "#ffffff", ambience: { hue: 0, intensity: RANGE.ambienceIntensity.min } },
  { ...DEFAULT_BRAND, accent: "#000000", ambience: { hue: 359, intensity: 0.02 } },
];
const THEMES = ["light", "dark"] as const;

/* ⚠️ Every value is either #rrggbb or #rrggbbaa; the sheet accepts nothing else. */
const hex6 = (v: string): string => v.slice(0, 7);

/* Comments state the rules and would match them. Only declarations are judged. */
const rules = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("the tenant's light, and only theirs", () => {
  it("writes every variable the sheet reads, for every brand and both themes", () => {
    for (const brand of BRANDS) {
      for (const theme of THEMES) {
        const out = skyVars(brand, theme);
        for (const name of SKY_VARS) expect(out[name], `${brand.accent} ${theme} ${name}`).toBeTruthy();
        for (const [name, value] of Object.entries(out)) {
          expect(value, name).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);
        }
      }
    }
  });

  /*
    ⚠️ EVERY VARIABLE THE STYLESHEET NAMES IS ONE THE DERIVATION WRITES. A sky
    colour that resolves to nothing is a gradient stop the browser drops, and the
    symptom is a bloom that is simply absent — on one theme, for one tenant.
  */
  it("names nothing in the sheet that the derivation does not write", () => {
    const named = [...SKY.matchAll(/var\((--sky-[a-z0-9-]+)\)/g)].map((m) => m[1]!);
    expect(named.length).toBeGreaterThan(0);
    for (const name of new Set(named)) expect(SKY_VARS, name).toContain(name);
  });

  /*
    ⚠️ THE HUE NEVER CYCLES AND IT IS NEVER SOMEBODY ELSE'S. Two of the three
    blooms are the ambience hue outright; the middle one is the accent re-lit. A
    sky whose hue wandered would be a screensaver, and one that ignored the slot
    would make the ambience control do nothing again.
  */
  it("keeps every bloom on the tenant's own hue", () => {
    for (const brand of BRANDS.slice(0, 3)) {
      for (const theme of THEMES) {
        const vars = skyVars(brand, theme);
        for (const key of ["--sky-deep", "--sky-1", "--sky-3", "--sky-bloom"] as const) {
          const { h, c } = rgbToOklch(fromHex(hex6(vars[key]!)));
          /* A near-neutral colour has no meaningful hue, so it is exempt. */
          if (c < 0.004) continue;
          const delta = Math.abs(((h - brand.ambience.hue + 540) % 360) - 180);
          expect(delta, `${brand.accent} ${theme} ${key}`).toBeLessThan(12);
        }
      }
    }
  });

  /*
    ⚠️ THE CEILING IS WHAT KEEPS AMBIENCE A WASH. Past the range's chroma a
    ground reaches the saturation of a semantic fill and "is that green a success
    or the page?" becomes a real question — which no amount of contrast checking
    answers, because both are legible.
  */
  it("stays under the saturation of a semantic fill", () => {
    for (const brand of BRANDS) {
      for (const theme of THEMES) {
        for (const [name, value] of Object.entries(skyVars(brand, theme))) {
          const { c } = rgbToOklch(fromHex(hex6(value)));
          expect(c, `${brand.accent} ${theme} ${name}`).toBeLessThan(0.12);
        }
      }
    }
  });

  /* ⚠️ A dark sky is light on dark and a light sky is shade on pale. */
  it("inverts with the theme", () => {
    for (const brand of BRANDS) {
      const dark = rgbToOklch(fromHex(hex6(skyVars(brand, "dark")["--sky-deep"]!))).l;
      const light = rgbToOklch(fromHex(hex6(skyVars(brand, "light")["--sky-deep"]!))).l;
      expect(light, brand.accent).toBeGreaterThan(dark);
    }
  });
});

describe("the layer fades, and the weather is slow", () => {
  /*
    ⚠️ THE ONE FILE IN THE PACKAGE ALLOWED A LITERAL, AND ONLY INSIDE A MASK.
    `sky.ts` is on the interface guard's token layer because a mask is an alpha
    channel written in colour syntax — its `#000` mean "opaque". That exemption
    is only safe while it stays true, so this is the check that keeps it: any
    literal outside a mask declaration is a colour somebody picked.
  */
  it("carries no literal that is not a mask's opacity", () => {
    for (const [i, line] of rules(SKY).split("\n").entries()) {
      if (!/#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(/i.test(line)) continue;
      expect(line, `line ${i + 1}: a literal outside a mask`).toMatch(/mask-image|mask-size/);
    }
  });

  /*
    ⚠️ THE BACKDROP HAS NO BOTTOM EDGE. This is §5.4, and it is invisible until
    you look for it: with a hard end the hero becomes a band, and a band is what
    makes a screen read as a stack of cards.
  */
  it("masks the light to nothing rather than stopping it", () => {
    expect(SKY).toContain("mask-image: linear-gradient(to bottom");
    expect(SKY).toContain("var(--solid");
    expect(SKY).toContain("var(--reach");
  });

  /*
    ⚠️ TRANSFORM, NEVER background-position. One is composited on the GPU and one
    repaints the whole layer every frame — at 52s nobody sees the difference in
    motion and every device sees it in battery.

    ⚠️ ASSERTED AGAINST THE CHOREOGRAPHER, because that is where the weather's
    timing lives — the sky draws the light and the masks and holds no duration,
    like everything else in the language.
  */
  it("drifts on a transform and never on a background position", () => {
    expect(CHOREOGRAPHY).toMatch(/@keyframes sky-drift[\s\S]*?transform: translate3d/);
    /* ⚠️ Comments state the rule and would match it — only declarations count. */
    expect(rules(CHOREOGRAPHY)).not.toMatch(/background-position/);
  });

  /* ⚠️ And the sky itself holds no timing at all. */
  it("keeps no duration in the sky", () => {
    expect(rules(SKY)).not.toMatch(/\b\d+m?s\b|animation|@keyframes/);
  });

  /*
    ⚠️ SLOW ENOUGH TO BE WEATHER. Under ~30s it reads as an animation somebody
    added; past ~45s it reads as light changing in a room, which is the point.
  */
  it("runs slower than anything a person caused", () => {
    const seconds = [...CHOREOGRAPHY.matchAll(/animation: sky-[^;]*?(\d+)s/g)].map((m) => Number(m[1]));
    expect(seconds.length).toBeGreaterThan(0);
    for (const s of seconds) expect(s, `${s}s reads as an animation rather than as weather`).toBeGreaterThanOrEqual(26);
  });

  /* ⚠️ A pattern BREATHES; it does not travel. */
  it("scales the mask rather than moving it", () => {
    const breathe = CHOREOGRAPHY.split("@keyframes sky-breathe")[1]?.split("}\n}")[0] ?? "";
    expect(breathe).toContain("mask-size");
    expect(breathe).not.toContain("translate");
  });

  /*
    ⚠️ THE CORRECTION FOLLOWS THE GROUND: brighter on dark, darker on pale.
    Correcting in both directions is the same defect with the opposite sign — it
    blows a light pattern out to white, and a mask is legible by DISTANCE from
    its ground rather than by absolute brightness.
  */
  it("corrects a masked sky in one direction per theme", () => {
    const corrections = [...SKY.matchAll(/\[data-masked\]::before \{ filter: brightness\(([\d.]+)\)/g)].map((m) => Number(m[1]));
    /*
      ⚠️ ONE BRIGHTENING AND TWO DARKENINGS, and the count is the point: the pale
      correction is written twice — once for the explicit attribute and once for
      the un-stamped default under `prefers-color-scheme` — because a rule that
      exists only inside a media query does not apply when the root carries an
      explicit choice, and vice versa.
    */
    expect(corrections.filter((v) => v > 1).length, "the dark ground is brightened, once").toBe(1);
    expect(corrections.filter((v) => v < 1).length, "the pale ground is darkened, in both scopings").toBe(2);
  });

  it("marks exactly the four masked skies as masked", () => {
    expect([...MASKED].sort()).toEqual(["dots", "grid", "rings", "waves"]);
    for (const sky of MASKED) expect(SKY, sky).toContain(`data-sky='${sky}'`);
    for (const sky of SKIES) expect(SKIES, sky).toContain(sky);
  });

  /* ⚠️ Removed, not slowed. The light stays; only the weather stops. */
  it("stops the weather for anybody who asked", () => {
    expect(CHOREOGRAPHY).toMatch(/prefers-reduced-motion[\s\S]*animation: none/);
  });

  it("emits both themes, and lets an explicit choice win either way", () => {
    const sheet = skySheet(DEFAULT_BRAND);
    expect(sheet).toMatch(/^:root \{/);
    expect(sheet).toContain(":root:not([data-theme='light'])");
    expect(sheet).toContain(":root[data-theme='dark']");
    for (const name of SKY_VARS) expect(sheet.split(`${name}:`).length - 1, name).toBe(3);
  });
});
