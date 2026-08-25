/**
 * A CONTROL THAT IS ON LOOKS ON, AND THE ONE THAT IS THE ACTION DOES NOT.
 *
 * ⚠️ THIS EXISTS BECAUSE THE LIBRARY PAINTS BOTH FROM ONE TOKEN. HeroUI fills a
 * checked switch, a ticked box, a chosen radio, an open tab and a slider's
 * travelled part with `--accent` — which is also the primary button — and our
 * `--accent` is MONO on purpose, so every one of those states came out grey. A
 * person could not tell a switch's state at a glance, which is the exact failure
 * the mono rule exists to prevent, arrived at by obeying it too far.
 *
 * ⚠️ AND THE OTHER HALF IS THE ONE NOBODY LOOKS AT: a FOCUSED field. The
 * library's `--input-bg-focus` is `var(--default)` — the identical value to the
 * resting field — so typing into a field changed nothing but its ring.
 *
 * ⚠️ THE SPECIMEN IS HAND-WRITTEN MARKUP, AND THAT IS FORCED RATHER THAN LAZY.
 * HeroUI v3 builds `.switch__control`, `.checkbox__control` and `.radio__control`
 * CLIENT-SIDE through React Aria's render props, so a statically-rendered
 * `<Switch defaultSelected>` is one `<div>` containing its own label and nothing
 * else. Measured through the real component this suite asserted `transparent` on
 * an element that does not exist yet — a guard that passes and fails for reasons
 * unrelated to what it claims.
 *
 * ⚠️ AND THE SPECIMEN CARRIES `data-sky`, WHICH IS NOT DECORATION. That attribute
 * is what re-derives the chosen tier against the page's own `--brand` — without
 * it every assertion here measures `:root`'s resolution against the DEPLOYMENT's
 * neutral and reports grey, which is a true measurement of the wrong page.
 *
 * ⚠️ AND WHAT IS MEASURED IS CHROMA, NOT SATURATION. "Has a hue in it" is a
 * perceptual claim, so it needs a perceptual number; HSV saturation is a ratio
 * to the brightest channel and therefore says a near-black button is six times
 * more coloured than a near-white one painted from the identical mix. See
 * `chromaOf` below.
 *
 * ⚠️ SO THE CLASS CONTRACT IS ASSERTED FIRST, AND THAT IS WHAT MAKES THE REST
 * HONEST. Hand-written markup against a library's internal class names goes
 * silently dead the day the library renames one — the specimen still renders, our
 * rules still do not match it, and the test still passes because it is measuring
 * markup nothing else produces. `theContract` reads the BUILT stylesheet and
 * fails if a selector we depend on is no longer in it, so a rename is a red run
 * rather than a quiet one.
 */

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PHONE, pageFor, stylesheet } from "../src/measure/index.js";

let browser: Browser;
let css: string;
beforeAll(async () => { css = stylesheet(); browser = await chromium.launch(); }, 120_000);
afterAll(async () => { await browser?.close(); });

/** ⚠️ OneInventory's own amber, so this is the real arrangement. */
const HUE = "oklch(0.79 0.16 68)";

/**
 * ⚠️ THE LIBRARY'S OWN STRUCTURE, AND EVERY CLASS IN IT IS CHECKED BELOW. Taken
 * from the built stylesheet's selectors: a switch's fill is on a `__control`
 * child, a checkbox's is that child's `::before`, a radio's is the child itself.
 */
const SPECIMEN = `
<div id="lit" data-sky="glow" style="--brand: ${HUE}">
  <div class="switch" data-selected="true"><span class="switch__control"></span></div>
  <div class="checkbox" data-selected="true"><span class="checkbox__control"></span></div>
  <div class="radio" data-selected><span class="radio__control"></span></div>
  <div class="toggle-button-group toggle-button-group--horizontal">
    <button class="toggle-button" data-selected="true">On</button>
  </div>
  <input class="input input--secondary" data-focused="true" />
  <button class="button button--primary">Next</button>
  <button class="button button--secondary">Cancel</button>
</div>`;

/** ⚠️ Every selector the rules above lean on. A rename must be loud. */
const CONTRACT = [
  ".switch__control", ".checkbox__control", ".radio__control",
  "--switch-control-bg-checked", "--input-bg-focus", ".button--primary",
  ".toggle-button", "--toggle-button-bg-selected",
];

interface Painted { readonly chroma: number; readonly rgb: string }

/**
 * ⚠️ CHROMA IN OKLCH, NOT SATURATION — AND THE DIFFERENCE IS NOT PEDANTRY. HSV
 * saturation is `(max − min) / max`: a RATIO to the brightest channel, so it
 * grows without bound as a colour darkens. The identical cast measures 0.048 on
 * the light theme's near-white action and 0.267 on the light theme's near-black
 * one — same paint, same eight points of spread between channels, and a verdict
 * decided by how dark the button is rather than by whether anybody can see a
 * hue in it. Every threshold in `ground.ts` is stated in OKLCH chroma for this
 * reason; a browser check that measures something else is checking a different
 * claim from the one the palette makes.
 *
 * ⚠️ THE PAGE HANDS BACK CHANNELS AND NOTHING ELSE. `getComputedStyle` answers
 * in whatever space the browser resolved to — `rgb()` here — so a canvas
 * readback is the only honest way to get numbers out; the arithmetic on them is
 * ordinary code and belongs on this side, where it is readable rather than
 * serialised into a `page.evaluate`. The matrices are the sRGB → OKLab pair,
 * unmodified.
 */
const chromaOf = (r: number, g: number, b: number): number => {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return Math.hypot(
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  );
};

/**
 * ⚠️ ONE NUMBER SEPARATES ALL THREE CLAIMS, AND IT IS THE FIELD'S LIFT. A
 * focused input carries the smallest cast in the system that is still meant to
 * read as colour (0.030 measured); the interface's own warm neutral carries
 * 0.010, which is meant to read as material. 0.02 sits between them, so "the
 * state is visible" and "the action is monochrome" are the two sides of one
 * threshold rather than two numbers that can drift apart.
 */
const LIFT = 0.02;

/** ⚠️ A FILLED CONTROL, NOT A LIFT — measured at 0.127, so this is a floor with
    room under it rather than a value tuned to what today happens to render. */
const FILLED = 0.05;

const paintedIn = async (
  theme: "dark" | "light", selector: string, part: "" | "::before",
): Promise<Painted> => {
  const page = await browser.newPage({ viewport: { width: PHONE.width, height: PHONE.height } });
  try {
    await page.setContent(pageFor(SPECIMEN, css, theme));
    const channels = await page.evaluate(([sel, which]: readonly string[]) => {
      const el = document.querySelector(sel!);
      if (!el) return null;
      const colour = getComputedStyle(el, which || null).backgroundColor;
      const probe = document.createElement("canvas").getContext("2d")!;
      probe.fillStyle = "#000";
      probe.fillStyle = colour;
      probe.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
      return [r!, g!, b!, a!] as const;
    }, [selector, part] as const);

    if (!channels) return { chroma: -1, rgb: "MISSING" };
    const [r, g, b, a] = channels;
    if (!a) return { chroma: 0, rgb: "transparent" };
    const chroma = chromaOf(r, g, b);
    return { chroma, rgb: `rgb(${r},${g},${b}) C=${chroma.toFixed(4)}` };
  } finally {
    await page.close();
  }
};

describe("the class contract this leans on", () => {
  it("is still what the library ships", () => {
    for (const name of CONTRACT) {
      expect(css.includes(name),
        `\`${name}\` is gone from the built stylesheet — the specimen in this file `
        + `is hand-written against the library's structure, so a rename makes every `
        + `assertion below pass against markup nothing produces`).toBe(true);
    }
  });
});

/*
  ⚠️ ONE ENTRY PER CONTROL, NOT ONE STANDING FOR THE OTHERS. These are four
  separate selectors in the library and were four separate `var(--accent)`
  references; fixing the switch and assuming the box followed is exactly how two
  of them stayed grey through the last pass.
*/
const ON: readonly (readonly [string, string, "" | "::before"])[] = [
  ["a switch that is on", ".switch[data-selected='true'] .switch__control", ""],
  ["a box that is ticked", ".checkbox[data-selected='true'] .checkbox__control", "::before"],
  ["a radio that is chosen", ".radio[data-selected] .radio__control", ""],
  ["a segment that is selected", ".toggle-button[data-selected='true']", ""],
];

describe("a control that is on", () => {
  for (const theme of ["dark", "light"] as const) {
    for (const [says, selector, part] of ON) {
      it(`${says} carries the product's hue — ${theme}`, async () => {
        const seen = await paintedIn(theme, selector, part);
        expect(seen.chroma,
          `${says} is ${seen.rgb} — no colour reached it, so its state reads as grey`)
          .toBeGreaterThan(FILLED);
      }, 60_000);
    }

    /* ⚠️ A FIELD SOMEBODY IS TYPING IN, WHICH THE LIBRARY LEAVES IDENTICAL TO A
       RESTING ONE. Lower bar than a filled control on purpose: it is a lift, not
       a fill, and a fill here would be a text field the colour of a button. */
    it(`a field being typed in is lit — ${theme}`, async () => {
      const seen = await paintedIn(theme, ".input--secondary[data-focused='true']", "");
      expect(seen.chroma,
        `the focused field is ${seen.rgb} — the same value as a resting one`)
        .toBeGreaterThan(LIFT);
    }, 60_000);

    /*
      ⚠️ AND THE ACTION STAYS MONO, WHICH IS THE HALF A CARELESS FIX BREAKS.
      Binding `--accent` itself would have coloured every state AND turned the
      primary button amber — one call to action per screen, in the product's own
      colour, is a screen where the loudest thing is no longer the thing to press.
    */
    it(`the primary action stays monochrome — ${theme}`, async () => {
      const seen = await paintedIn(theme, ".button--primary", "");
      expect(seen.chroma,
        `the primary button is ${seen.rgb} — the one call to action has taken a hue`)
        .toBeLessThan(LIFT);
    }, 60_000);
  }
});
