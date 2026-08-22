/**
 * WHICH ELEMENT IS SCROLLING, WHEN IT IS NOT THE DOCUMENT.
 *
 * ⚠️ THE ACCOUNT CENTRE IS PRESENTED OVER A PRODUCT, so on `/space/` the thing
 * that scrolls is the dialog's body and the window never moves at all. Every
 * reading the chrome takes — the hem's strength, and through it the whole
 * vignette — comes from whichever element `scrolling.ts` resolved, and it
 * resolves by walking up for an ancestor that is ALREADY overflowing.
 *
 * ⚠️ WHICH IS A RACE, AND THE LOSING SIDE IS SILENT. A dialog that has not
 * finished opening has a body that does not overflow yet, so the walk finds
 * nothing and falls back to the window — which, inside a dialog, is a scroll
 * position of zero for ever. The page then scrolls with no hem at the top and
 * nothing to say why: the crown's own hand-off keeps working, because that one
 * measures rectangles rather than a scroll offset, so the name arrives in the
 * header over content that is not being dissolved.
 *
 * ⚠️ SO THE TEST IS THE RACE, NOT THE GEOMETRY. The container starts short and
 * grows after the frame has mounted, which is what a dialog opening does and
 * what a list finishing does.
 */

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mounted, stylesheet } from "../src/measure/index.js";

let browser: Browser; let css: string; let code: string;
beforeAll(async () => {
  css = stylesheet();
  code = await mounted(new URL("./scroller.mount.tsx", import.meta.url).pathname);
  browser = await chromium.launch();
}, 180_000);
afterAll(async () => { await browser?.close(); });

describe("a page that scrolls inside something", () => {
  it("hems its head from the element that is actually scrolling", async () => {
    const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
    await page.setContent(
      `<!doctype html><html data-theme="dark"><head><style>${css}</style></head>`
      + `<body style="margin:0"><div id="root"></div>`
      + `<script type="module">${code}</script></body></html>`,
    );
    await page.waitForSelector('[data-hem="top"]');
    /* ⚠️ Long enough for the dialog to finish opening, which is the race. */
    await page.waitForTimeout(700);

    const seen = await page.evaluate(async () => {
      const wait = () => new Promise((go) => { setTimeout(go, 120); });
      /* ⚠️ WHATEVER THE DIALOG ACTUALLY SCROLLS IN, found the way a person's
         thumb finds it: the deepest element that can scroll. Naming a class
         would be asserting the library's markup rather than the behaviour. */
      const box = (Array.from(document.querySelectorAll("*")) as HTMLElement[])
        .filter((el) => el.scrollHeight > el.clientHeight + 1
          && /auto|scroll/.test(getComputedStyle(el).overflowY))
        .pop()!;
      /* ⚠️ READ WHERE THE HEM ITSELF READS IT — off the crown inside the
         dialog, which inherits from whichever ancestor set it. Reading the root
         is reading the global this stopped being. */
      const crown = box.querySelector('[data-hem="top"]') as HTMLElement;
      const hem = () => Number(getComputedStyle(crown)
        .getPropertyValue("--hem-top").trim() || "1");
      const before = hem();
      box.scrollTo(0, 400);
      await wait();
      return { before, after: hem(), moved: box.scrollTop, window: window.scrollY };
    });
    await page.close();

    /* ⚠️ THE CONTAINER SCROLLED AND THE WINDOW DID NOT — or this proves nothing
       about the case it was written for. */
    expect(seen.moved, "the container did not scroll").toBeGreaterThan(100);
    expect(seen.window, "the window scrolled, so this is not the nested case").toBe(0);

    expect(seen.before, "hemmed before anything had gone under the crown").toBe(0);
    expect(seen.after, "the page scrolled inside a container and the hem never "
      + "answered — the reading is coming from something that is not moving")
      .toBe(1);
  }, 120_000);
});
