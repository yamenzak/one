/**
 * THE CONTROL THAT NARROWS A SCREEN, MEASURED.
 *
 * ⚠️ THIS IS THE ONE FAULT CLASS NOTHING ELSE HERE CAN SEE. The markup was
 * correct, the classes were correct, every unit test drew the right segment as
 * chosen and the manifest composed — and on a real page the period control was a
 * vertical stack of three pills hanging outside the page gutter. Every control
 * the renderer places here fills its box below its own breakpoint, which is
 * `w-full` on the inside; `w-full` contributes NOTHING to a max-content
 * measurement, so as a bare flex item the wrapper's base size resolved to zero,
 * the segments overflowed it, wrapped one per line, and the library's own
 * `justify-center` centred each of them on a zero-width box.
 *
 * ⚠️ WHAT IS ASSERTED IS WHERE THINGS LANDED, never a class name. Reading back
 * `flex-basis` would be reading back what the component was told.
 */

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Body, type Has } from "../src/rendered/body.js";
import { html, pageFor, stylesheet } from "../src/measure/index.js";

let browser: Browser;
let css: string;
beforeAll(async () => { css = stylesheet(); browser = await chromium.launch(); }, 120_000);
afterAll(async () => { await browser?.close(); });

/** ⚠️ A column narrower than the viewport, so "inside the gutter" is a real claim. */
const COLUMN = 620;
const GUTTER = 100;

const PERIOD = {
  id: "span",
  label: "Over",
  opens: "month",
  options: [
    { value: "week", label: "7 days" },
    { value: "month", label: "30 days" },
    { value: "quarter", label: "90 days" },
  ],
};

/** ⚠️ Every segment's box, in page coordinates. */
const segments = async (picks: readonly unknown[]) => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  try {
    await page.setContent(pageFor(html(
      <div style={{ width: `${COLUMN}px`, marginLeft: `${GUTTER}px` }}>
        <Body
          body={{
            shape: "figure", layout: { as: "stack" }, picks: picks as never, blocks: [],
          }}
          has={{ views: {}, onPick: () => undefined } as Has}
        />
      </div>), css));
    await page.evaluate(() => new Promise((go) => requestAnimationFrame(() => go(null))));
    return await page.evaluate(() => Array.prototype.slice
      .call(document.querySelectorAll("[data-slot='toggle-button']"))
      .map((el) => {
        const box = (el as HTMLElement).getBoundingClientRect();
        return { left: Math.round(box.left), right: Math.round(box.right), top: Math.round(box.top) };
      }));
  } finally {
    await page.close();
  }
};

describe("a narrowing sits in the column it narrows", () => {
  it("keeps every segment inside the gutter", async () => {
    const boxes = await segments([PERIOD]);
    expect(boxes.length).toBe(3);
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(GUTTER);
      expect(box.right).toBeLessThanOrEqual(GUTTER + COLUMN);
    }
  }, 60_000);

  /* ⚠️ ONE ROW, WHICH IS WHAT A SEGMENTED CONTROL IS. Three tops that differ is
     the shape the zero-width item produced, and it is the reading that made the
     failure obvious rather than merely wrong. */
  it("draws them side by side rather than stacked", async () => {
    const boxes = await segments([PERIOD]);
    expect(new Set(boxes.map((b) => b.top)).size).toBe(1);
    /* ⚠️ AND THEY SHARE THE COLUMN rather than huddling at its left edge — a
       control content-sized inside a full-width row reads as a stray. */
    expect(boxes[2]!.right).toBeGreaterThan(GUTTER + COLUMN * 0.9);
  }, 60_000);

  /* ⚠️ AND TWO OF THEM SHARE THE ROW, which is what the basis is for: one
     narrowing fills it and several split it, with no breakpoint anywhere. */
  it("puts two narrowings beside each other", async () => {
    const boxes = await segments([PERIOD, { ...PERIOD, id: "where", label: "Where" }]);
    expect(boxes.length).toBe(6);
    expect(new Set(boxes.map((b) => b.top)).size).toBe(1);
  }, 60_000);
});
