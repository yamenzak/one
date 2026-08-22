/**
 * THE NAME IS SOMEWHERE AT EVERY MOMENT OF A SCROLL.
 *
 * ⚠️ THIS IS THE THIRD RULE WRITTEN FOR THIS HAND-OFF AND THE FIRST ONE THAT
 * ASKS ABOUT THE OUTCOME. The first two were about the mechanism — a distance,
 * then a position — and both were checked by tests that agreed with whatever the
 * mechanism happened to be. What a person actually sees is simpler and is the
 * only thing worth pinning: scrolling a page about a named thing, the name is
 * either on the page or in the crown, and there is no moment where it is in
 * neither. It was in neither for two seconds on a recording of the live screen.
 *
 * ⚠️ AND "ON THE PAGE" MEANS LEGIBLE, NOT PRESENT. The heading keeps its box for
 * the whole scroll; what removes it is the hem, which is fully opaque for
 * `HEM_HOLD`. So the question is whether the heading has anything left below
 * that band — which is a fact about the screen rather than a restatement of the
 * crossing rule, and is why this can fail while the rule is self-consistent.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HEM_HOLD } from "../src/tokens/ambience.js";
import { mounted, stylesheet } from "../src/measure/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));

let browser: Browser;
let css: string;
let code: string;
beforeAll(async () => {
  css = stylesheet();
  code = await mounted(join(HERE, "handover.mount.tsx"));
  browser = await chromium.launch();
}, 180_000);
afterAll(async () => { await browser?.close(); });

const PHONE = { width: 412, height: 900 };

/** ⚠️ Both places dim through an ancestor, so an element's own `opacity` is not
    what anybody sees — the chain to the root is. */
const WALK = `(el) => {
  let seen = 1;
  for (let at = el; at; at = at.parentElement) {
    seen *= Number(getComputedStyle(at).opacity);
  }
  return seen;
}`;

describe("the name a title card hands to the crown", () => {
  it("is on the page or in the crown, at every point of the scroll", async () => {
    const page = await browser.newPage({ viewport: PHONE });
    await page.setContent(
      `<!doctype html><html data-theme="dark"><head><style>${css}</style></head>`
      + `<body><div id="root"></div>`
      + `<script type="module">${code}</script></body></html>`,
    );
    await page.waitForSelector("h1");
    await page.waitForTimeout(400);

    const steps = await page.evaluate(async ([veil, walkSrc]) => {
      const opacityOf = eval(`(${walkSrc})`) as (el: Element) => number;
      const wait = () => new Promise((go) => { setTimeout(go, 80); });
      const scroller = document.scrollingElement!;
      const crown = document.querySelector('[data-hem="top"]') as HTMLElement;
      const heading = document.querySelector("h1")!;
      /* ⚠️ The crown's copy is whatever inside the row carries the same words —
         found by text rather than by class, so a restyle cannot silently make
         this stop looking. */
      const carried = Array.from(crown.querySelectorAll("*")).find((el) => (
        el.children.length === 0 && (el.textContent ?? "").trim() === "Acme Corp"));

      const out: { y: number; page: number; crown: number; bottom: number }[] = [];
      for (let y = 0; y <= 520; y += 20) {
        scroller.scrollTo(0, y);
        await wait();
        out.push({
          y,
          /* ⚠️ How much of the heading is below the opaque band, in px. */
          bottom: Math.round(heading.getBoundingClientRect().bottom - (veil as number)),
          page: Number(opacityOf(heading).toFixed(2)),
          crown: carried ? Number(opacityOf(carried).toFixed(2)) : 0,
        });
      }
      return out;
    }, [HEM_HOLD * 16, WALK] as const);
    await page.close();

    /* ⚠️ THE PAGE ACTUALLY SCROLLED PAST THE HAND-OFF, or this proves nothing. */
    expect(steps.some((s) => s.crown > 0.5), "the crown never took the name at all")
      .toBe(true);
    expect(steps.some((s) => s.bottom > 0 && s.page > 0.5),
      "the heading was never legible on the page").toBe(true);

    const nowhere = steps.filter((s) => !(s.bottom > 0 && s.page > 0.5) && s.crown <= 0.5);
    expect(nowhere.map((s) => s.y),
      "the name is in neither place at these scroll offsets — dissolved out of the "
      + "page by the hem and not yet in the crown").toEqual([]);
  }, 120_000);
});
