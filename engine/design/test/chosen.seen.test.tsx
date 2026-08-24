/**
 * THE ONE YOU CHOSE IS THE PRODUCT'S COLOUR, AND IT HAS TO BE RE-DERIVED TO BE
 * ONE AT ALL.
 *
 * ⚠️ THIS EXISTS BECAUSE A TOKEN THAT RESOLVES IN THE WRONG PLACE FAILS WITHOUT
 * FAILING. Every tier is declared on `:root` as a mix with `var(--brand)`, and a
 * custom property is substituted where it is DECLARED — so what descendants
 * inherit is an already-resolved colour. `Page` sets a product's own hue as an
 * inline `--brand` on ITSELF, which is below `:root`, so nothing resolved above
 * it can ever see the product's colour.
 *
 * ⚠️ AND ON THIS DEPLOYMENT THAT IS INVISIBLE. One's own brand is MONO, so the
 * `:root` mix is grey into grey — a clean neutral, which is exactly what the
 * palette is supposed to produce and is indistinguishable from working. The
 * defect only shows on the ONE token that is meant to carry a colour: the
 * selected segment came out a grey, raising its brand share made it a LIGHTER
 * grey, and every reading of the file said it should have been amber.
 *
 * ⚠️ SO IT IS MEASURED THROUGH A `Page` WITH A HUE ON IT, WHICH IS THE ONLY
 * ARRANGEMENT THAT CAN SEE IT. A specimen rendered without a page, or with the
 * hue on an ancestor, passes while the product is grey. Both were tried.
 */

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { Page } from "../src/index.js";
import { PHONE, html, pageFor, stylesheet } from "../src/measure/index.js";

let browser: Browser;
let css: string;
beforeAll(async () => { css = stylesheet(); browser = await chromium.launch(); }, 120_000);
afterAll(async () => { await browser?.close(); });

/** ⚠️ OneInventory's own amber, verbatim, so this is the real arrangement. */
const HUE = "oklch(0.79 0.16 68)";

const specimen = (
  <Page sky="glow" hue={HUE}>
    <ToggleButtonGroup selectionMode="single" defaultSelectedKeys={["b"]}>
      <ToggleButton id="a">Listed</ToggleButton>
      <ToggleButton id="b">Counted</ToggleButton>
      <ToggleButton id="c">Batched</ToggleButton>
    </ToggleButtonGroup>
  </Page>
);

interface Seen { readonly text: string; readonly chosen: boolean; readonly chroma: number }

/** ⚠️ CHROMA, NOT A COLOUR STRING. The fill is a `color-mix` of a hue nobody can
    predict by hand, and the question is only ever "is there a colour in it". */
const segmentsIn = async (theme: "dark" | "light"): Promise<readonly Seen[]> => {
  const page = await browser.newPage({ viewport: { width: PHONE.width, height: PHONE.height } });
  try {
    await page.setContent(pageFor(html(specimen), css, theme));
    return await page.evaluate(() =>
      (Array.prototype.slice.call(
        document.querySelectorAll(".toggle-button")) as HTMLElement[]).map((el) => {
        /* ⚠️ Painted through a canvas rather than parsed, because the computed
           value is an `oklab()` the browser has already resolved and the numbers
           are what matter, not the notation. */
        const bg = getComputedStyle(el).backgroundColor;
        const probe = document.createElement("canvas").getContext("2d")!;
        probe.fillStyle = bg;
        probe.fillRect(0, 0, 1, 1);
        const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
        const most = Math.max(r!, g!, b!);
        const least = Math.min(r!, g!, b!);
        return {
          text: (el.textContent ?? "").trim(),
          chosen: el.getAttribute("data-selected") === "true",
          /* Saturation as a plain 0–1 spread, which is all "is it grey" needs. */
          chroma: most === 0 ? 0 : (most - least) / most,
        };
      }));
  } finally {
    await page.close();
  }
};

describe("the chosen segment", () => {
  for (const theme of ["dark", "light"] as const) {
    /*
      ⚠️ THE ASSERTION IS ON THE CHOSEN ONE ALONE, AND GENEROUSLY. A workspace may
      pick a nearly-neutral hue, so this is not "vivid" — it is "a colour reached
      it at all", which is the difference between the mechanism working and the
      mechanism resolving two levels too high.
    */
    it(`carries the page's own hue in ${theme}`, async () => {
      const seen = await segmentsIn(theme);
      const one = seen.find((s) => s.chosen);
      expect(one, "nothing was selected — the specimen is wrong, not the palette").toBeTruthy();
      expect(one!.chroma,
        `the chosen segment is grey in ${theme}: the page declares ${HUE} and none of it reached the fill`)
        .toBeGreaterThan(0.05);
    }, 60_000);

    /*
      ⚠️ AND IT HAS TO BE THE MOST COLOURED THING IN THE CONTROL. A lit sky washes
      `--default`, so the UNCHOSEN segments carry the product's hue too — and when
      they carried more of it than the chosen one did, the control read as three
      selected options and one disabled. That is the shape this whole token exists
      to prevent, arrived at from the other side.
    */
    it(`is more coloured than the track it sits in, in ${theme}`, async () => {
      const seen = await segmentsIn(theme);
      const one = seen.find((s) => s.chosen)!;
      for (const other of seen.filter((s) => !s.chosen)) {
        expect(one.chroma,
          `"${other.text}" carries more of the hue than the chosen "${one.text}"`)
          .toBeGreaterThan(other.chroma);
      }
    }, 60_000);
  }
});
