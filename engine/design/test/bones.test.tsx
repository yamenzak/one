/**
 * A PLACEHOLDER IS THE SAME SIZE AS THE THING IT STANDS FOR — measured, at two
 * widths.
 *
 * ⚠️ THE WHOLE VALUE OF A SKELETON IS THAT NOTHING MOVES WHEN THE CONTENT LANDS,
 * and nothing in this repository was checking it. Both hand-written placeholders
 * had drifted from the components they copied, silently, and one of them badly:
 * `TilesWaiting` laid its grid out at `minmax(min(8rem, 100%), 1fr)` against
 * `TileGrid`'s `min(6rem, 45%)`, so six tiles measured 236px in three columns
 * and waited behind 360px in two. Half a screen taller, in the wrong shape, and
 * the page jumped 124px on landing — the exact fault the placeholder exists to
 * prevent. `RowsWaiting` was 24px short over three rows, 8px per row, for the
 * same reason: it wrote out the row's classes instead of being the row.
 *
 * ⚠️ SO THE PAIR IS RENDERED SIDE BY SIDE AND BOTH ARE MEASURED. It cannot be
 * argued with, it does not care WHICH number diverged, and it is the only shape
 * of check that survives somebody changing a grid in one file.
 *
 * ⚠️ AND AT TWO WIDTHS, BECAUSE ONE OF THEM AGREED. At 1024 the tiles were the
 * same HEIGHT and a different number of columns — a phone is where a grid's
 * wrapping actually decides anything, and a check at desktop only would have
 * passed the worst defect here.
 */

import { chromium, type Browser } from "playwright";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Group, NavRow, TileGrid } from "../src/parts/surfaces.js";
import { RowsWaiting, TilesWaiting } from "../src/parts/state.js";
import { stylesheet } from "./rhythm.harness.js";

let browser: Browser;
let css: string;
beforeAll(async () => { css = stylesheet(); browser = await chromium.launch(); }, 120_000);
afterAll(async () => { await browser?.close(); });

const HOW_MANY = 6;

/** ⚠️ Real props, because a component's size is a function of what it was given. */
const PAIRS: readonly { name: string; real: string; bones: string }[] = [
  {
    name: "tiles",
    real: renderToStaticMarkup(
      <TileGrid
        tiles={Array.from({ length: HOW_MANY }, (_, i) => ({
          id: `${i}`, label: `Thing ${i}`, icon: null, onOpen: () => {},
        }))}
      />,
    ),
    bones: renderToStaticMarkup(<TilesWaiting tiles={HOW_MANY} />),
  },
  {
    name: "rows",
    real: renderToStaticMarkup(
      <Group>
        {Array.from({ length: 3 }, (_, i) => (
          <NavRow key={i} label={`Row ${i}`} under="a second line" onOpen={() => {}} />
        ))}
      </Group>,
    ),
    bones: renderToStaticMarkup(<RowsWaiting rows={3} lead={false} />),
  },
];

/**
 * ⚠️ 390 AND 1024 — a phone and a desktop. Both, because a grid's column count
 * is the thing that goes wrong and it only goes wrong where the grid wraps.
 */
describe.each([[390], [1024]])("at %ipx", (width) => {
  it.each(PAIRS.map((p) => [p.name, p] as const))(
    "%s: the placeholder is the size of the thing",
    async (name, pair) => {
      const page = await browser.newPage({ viewport: { width, height: 1200 } });
      await page.setContent(
        `<!doctype html><html data-theme="dark"><head><meta charset="utf-8">`
        + `<style>${css}</style><style>html,body{margin:0}</style></head><body>`
        + `<div id="real" style="width:${width}px">${pair.real}</div>`
        + `<div id="bones" style="width:${width}px">${pair.bones}</div>`
        + `</body></html>`,
      );
      await page.waitForTimeout(250);
      const seen = await page.evaluate(() => {
        const box = (id: string) => document.getElementById(id)!.getBoundingClientRect().height;
        /* ⚠️ THE COLUMNS TOO, AND THEY ARE THE HALF THAT WOULD HAVE SURVIVED. A
           grid can be the right height in the wrong number of columns whenever
           the item count divides differently — which is what shipped. */
        const cols = (id: string) => {
          const grid = document.querySelector(`#${id} [style*="grid-template-columns"]`)
            ?? document.getElementById(id)!.firstElementChild;
          return grid ? getComputedStyle(grid).gridTemplateColumns : "";
        };
        return {
          real: { height: box("real"), columns: cols("real") },
          bones: { height: box("bones"), columns: cols("bones") },
        };
      });
      await page.close();

      expect(
        seen.bones.height,
        `${name} at ${width}: the content will jump `
        + `${Math.abs(seen.real.height - seen.bones.height)}px when it lands`,
      ).toBe(seen.real.height);
      expect(
        seen.bones.columns,
        `${name} at ${width}: the placeholder lays out in a different grid`,
      ).toBe(seen.real.columns);
    },
    60_000,
  );
});
