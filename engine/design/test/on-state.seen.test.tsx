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

interface Painted { readonly sat: number; readonly rgb: string }

const paintedIn = async (
  theme: "dark" | "light", selector: string, part: "" | "::before",
): Promise<Painted> => {
  const page = await browser.newPage({ viewport: { width: PHONE.width, height: PHONE.height } });
  try {
    await page.setContent(pageFor(SPECIMEN, css, theme));
    return await page.evaluate(([sel, which]: readonly string[]) => {
      const el = document.querySelector(sel!);
      if (!el) return { sat: -1, rgb: "MISSING" };
      const colour = getComputedStyle(el, which || null).backgroundColor;
      const probe = document.createElement("canvas").getContext("2d")!;
      probe.fillStyle = "#000";
      probe.fillStyle = colour;
      probe.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
      if (!a) return { sat: 0, rgb: "transparent" };
      const most = Math.max(r!, g!, b!); const least = Math.min(r!, g!, b!);
      return { sat: most === 0 ? 0 : (most - least) / most, rgb: `rgb(${r},${g},${b})` };
    }, [selector, part] as const);
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
        expect(seen.sat,
          `${says} is ${seen.rgb} — no colour reached it, so its state reads as grey`)
          .toBeGreaterThan(0.05);
      }, 60_000);
    }

    /* ⚠️ A FIELD SOMEBODY IS TYPING IN, WHICH THE LIBRARY LEAVES IDENTICAL TO A
       RESTING ONE. Lower bar than a filled control on purpose: it is a lift, not
       a fill, and a fill here would be a text field the colour of a button. */
    it(`a field being typed in is lit — ${theme}`, async () => {
      const seen = await paintedIn(theme, ".input--secondary[data-focused='true']", "");
      expect(seen.sat,
        `the focused field is ${seen.rgb} — the same value as a resting one`)
        .toBeGreaterThan(0.02);
    }, 60_000);

    /*
      ⚠️ AND THE ACTION STAYS MONO, WHICH IS THE HALF A CARELESS FIX BREAKS.
      Binding `--accent` itself would have coloured every state AND turned the
      primary button amber — one call to action per screen, in the product's own
      colour, is a screen where the loudest thing is no longer the thing to press.
    */
    it(`the primary action stays monochrome — ${theme}`, async () => {
      const seen = await paintedIn(theme, ".button--primary", "");
      expect(seen.sat,
        `the primary button is ${seen.rgb} — the one call to action has taken a hue`)
        .toBeLessThan(0.05);
    }, 60_000);
  }
});
