/**
 * A HAZARD DIAMOND SAYS THE WHOLE HAZARD, INSIDE THE DIAMOND.
 *
 * ⚠️ THIS LABEL GOES ON A BOTTLE OF SOLVENT, so the two ways it can be wrong are
 * both serious and both invisible in source. A name set on one line runs out
 * through the red border — the shape narrows to nothing at both points, so the
 * widest word that fits is not the widest word the box holds — and a name
 * shortened to its first word says something else entirely: "Gas under pressure"
 * became "Gas", "Acutely toxic" became "Acutely", "Health hazard" became
 * "Health". A diamond naming no hazard is worse than an empty one, because it
 * reads as information.
 *
 * ⚠️ SO IT IS MEASURED IN A BROWSER. Text width is a font, a weight, a size and
 * a string; nothing static can tell whether a word fits a rhombus, and the
 * overrun does not appear until somebody prints the one chemical nobody tried.
 *
 * ⚠️ AND IT IS CHECKED AGAINST THE INNER RHOMBUS, NOT THE BOX. `|x−50| + |y−50|`
 * is the distance to the edge of a diamond in the 100-unit square the label is
 * drawn in; the stroke is 10 wide and centred on the path, so the white inside
 * stops at 46 − 5√2 ≈ 39.
 */

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PHONE, html, pageFor, stylesheet } from "@engine/design/measuring";
import { GHS } from "../src/hazard.js";
import { InventoryScreen } from "../src/screens/index.js";

let browser: Browser;
let css: string;
beforeAll(async () => { css = stylesheet(); browser = await chromium.launch(); }, 120_000);
afterAll(async () => { await browser?.close(); });

/** ⚠️ The white inside the red border, in the units the diamond is drawn in. */
const INSIDE = 39;

interface Said {
  readonly label: string;
  readonly text: string;
  /** The furthest any corner of the drawn text reaches, as `|x−50| + |y−50|`. */
  readonly reach: number;
}

const diamondsIn = async (route: string): Promise<readonly Said[]> => {
  const page = await browser.newPage({ viewport: PHONE });
  try {
    await page.setContent(pageFor(html(<InventoryScreen route={route} />), css));
    return await page.evaluate(() =>
      (Array.prototype.slice.call(document.querySelectorAll("svg[role='img']")) as SVGSVGElement[])
        .filter((svg) => Boolean(svg.querySelector("path[stroke='#d40000']")))
        .flatMap((svg) => {
          const label = svg.getAttribute("aria-label") ?? "";
          return (Array.prototype.slice.call(svg.querySelectorAll("text")) as SVGTextElement[])
            .map((node) => {
              const box = node.getBBox();
              const corners: readonly [number, number][] = [
                [box.x, box.y], [box.x + box.width, box.y],
                [box.x, box.y + box.height], [box.x + box.width, box.y + box.height],
              ];
              return {
                label,
                text: node.textContent ?? "",
                reach: Math.max(...corners.map(([x, y]) => Math.abs(x - 50) + Math.abs(y - 50))),
              };
            });
        }));
  } finally {
    await page.close();
  }
};

describe("what a hazard diamond says", () => {
  it("says the whole hazard, not its first word", async () => {
    const said = await diamondsIn("/labels");
    expect(said.length, "the ground drew no hazard diamonds").toBeGreaterThan(0);
    for (const one of said) {
      /* ⚠️ Every line together IS the name — the phrase is broken across two, so
         no single line equals it and no line may be missing from it. */
      expect(one.label, `a diamond drew "${one.text}", which is not part of "${one.label}"`)
        .toContain(one.text);
    }
    for (const label of new Set(said.map((s) => s.label))) {
      const whole = said.filter((s) => s.label === label).map((s) => s.text).join(" ");
      expect(whole, `"${label}" was drawn as "${whole}"`).toBe(label);
    }
  }, 30_000);

  it("keeps every line inside the red border", async () => {
    const said = await diamondsIn("/labels");
    for (const one of said) {
      expect(one.reach, `"${one.text}" reaches ${one.reach.toFixed(1)} of ${INSIDE} inside "${one.label}"`)
        .toBeLessThanOrEqual(INSIDE);
    }
  }, 30_000);

  /*
    ⚠️ AND EVERY HAZARD IN THE REGISTRY, NOT ONLY THE TWO THE GROUND HAPPENS TO
    SHOW. The longest name is the one that overruns, and a sample of two is a
    sample that never contains it — "Gas under pressure" and "Environmental" are
    the two that decide this and neither is on a bottle of isopropanol.
  */
  it("fits every hazard the product knows, not only the ones on the ground", async () => {
    const page = await browser.newPage({ viewport: PHONE });
    try {
      await page.setContent(pageFor(
        html(<InventoryScreen route="/labels" />), css));
      const worst = await page.evaluate((names: readonly string[]) => {
        /* ⚠️ THE DIAMOND'S OWN SVG, found by its red border. `svg[role='img']`
           alone is the first marked graphic in the document, which is a glyph
           in the chrome with no text in it — and the sweep then reports nothing
           to measure, which reads as a pass. */
        const svg = (Array.prototype.slice.call(
          document.querySelectorAll("svg[role='img']")) as SVGSVGElement[])
          .find((one) => Boolean(one.querySelector("path[stroke='#d40000']")));
        const node = svg?.querySelector("text") as SVGTextElement | null;
        if (!svg || !node) return null;
        let most = { name: "", reach: 0 };
        for (const name of names) {
          /* ⚠️ THE SAME SPLIT THE COMPONENT MAKES. Written out here rather than
             imported because what is measured has to be what a browser lays
             out, and only the drawn node knows its own metrics. */
          const words = name.split(" ");
          let at = 1;
          let closest = Number.POSITIVE_INFINITY;
          for (let cut = 1; cut < words.length; cut++) {
            const gap = Math.abs(
              words.slice(0, cut).join(" ").length - words.slice(cut).join(" ").length);
            if (gap < closest) { closest = gap; at = cut; }
          }
          const lines = words.length < 2
            ? words
            : [words.slice(0, at).join(" "), words.slice(at).join(" ")];
          /* ⚠️ THE SAME ARITHMETIC `fits` MAKES, for the same reason the split
             is repeated: what is measured has to be what a browser lays out. */
          const widest = Math.max(...lines.map((l) => l.length));
          const size = Math.min(16, 39 / (0.75 * widest / 2 + (lines.length - 1) / 2 * 1.15 + 0.6));
          lines.forEach((line, i) => {
            node.textContent = line;
            node.setAttribute("font-size", String(size));
            node.setAttribute("y", String(50 + (i - (lines.length - 1) / 2) * size * 1.15));
            const box = node.getBBox();
            const reach = Math.max(
              Math.abs(box.x - 50) + Math.abs(box.y - 50),
              Math.abs(box.x + box.width - 50) + Math.abs(box.y - 50),
              Math.abs(box.x - 50) + Math.abs(box.y + box.height - 50),
              Math.abs(box.x + box.width - 50) + Math.abs(box.y + box.height - 50));
            if (reach > most.reach) most = { name: `${name} — "${line}"`, reach };
          });
        }
        return most;
      }, GHS.map((h) => h.says));
      expect(worst, "no diamond to measure with").not.toBeNull();
      expect(worst!.reach, `${worst!.name} reaches ${worst!.reach.toFixed(1)} of ${INSIDE}`)
        .toBeLessThanOrEqual(INSIDE);
    } finally {
      await page.close();
    }
  }, 30_000);
});
