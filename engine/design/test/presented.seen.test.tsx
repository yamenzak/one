/**
 * A PAGE PRESENTED OVER ANOTHER PAGE, AND THE TWO THINGS THE DIALOG DECIDES
 * FOR IT.
 *
 * ⚠️ A PAGE PAINTS ITS OWN WORLD EDGE TO EDGE, so anything the surface holding
 * it puts above that world is a band of somebody else's ground at the very top
 * of the screen. Three pixels was enough to photograph, and the note in
 * `overlay.tsx` had already looked at those three pixels and called them a
 * focus-ring bleed with nothing to turn off.
 *
 * ⚠️ AND A PAGE'S INK IS THE PAGE'S. A modal body is `text-sm text-muted`
 * because a modal body is usually a paragraph; `Page` answered the size and not
 * the colour, so every word that did not state its own came out muted — the line
 * under a workspace's name on its own hero, written across the picture of it.
 *
 * ⚠️ NEITHER IS VISIBLE WITHOUT THE DIALOG. Mounted on its own a page inherits
 * the document's ink and starts at zero, and both checks pass over nothing.
 */

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mounted, stylesheet } from "../src/measure/index.js";

let browser: Browser; let css: string; let code: string;
beforeAll(async () => {
  css = stylesheet();
  code = await mounted(new URL("./presented.mount.tsx", import.meta.url).pathname);
  browser = await chromium.launch();
}, 180_000);
afterAll(async () => { await browser?.close(); });

const shown = async () => {
  const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
  await page.setContent(
    `<!doctype html><html data-theme="dark"><head><style>${css}</style></head>`
    + `<body style="margin:0"><div id="root"></div>`
    + `<script type="module">${code}</script></body></html>`,
  );
  await page.waitForSelector('[data-hem="top"]');
  await page.waitForTimeout(500);
  return page;
};

describe("a page presented over a product", () => {
  it("starts at the top of the screen, with no band above its world", async () => {
    const page = await shown();
    const tops = await page.evaluate(() => Array.from(document.querySelectorAll("[data-sky]"))
      .map((el) => Number(el.getBoundingClientRect().top.toFixed(1))));
    await page.close();
    /* ⚠️ BOTH PAGES, because the one underneath is the control: it has always
       started at zero, so a run where only one does is a run where the harness
       stopped presenting anything. */
    expect(tops.length, "only one page is mounted — nothing is being presented").toBe(2);
    expect(tops, "a presented page starts below the top of the screen, so a strip "
      + "of the surface holding it shows above its world").toEqual([0, 0]);
  }, 120_000);

  it("writes in its own ink, not the surface's", async () => {
    const page = await shown();
    const seen = await page.evaluate(() => {
      const said = (want: string) => Array.from(document.querySelectorAll("*"))
        .filter((el) => Array.from(el.childNodes).some((n) => n.nodeType === 3
          && (n.textContent ?? "").includes(want)))
        .pop() as HTMLElement | undefined;
      const line = said("Hello ·");
      const name = document.querySelector("h1") as HTMLElement;
      return {
        line: line ? getComputedStyle(line).color : "not found",
        name: getComputedStyle(name).color,
        muted: getComputedStyle(document.documentElement).getPropertyValue("--muted").trim(),
      };
    });
    await page.close();
    expect(seen.line, "the line under the name was not found").not.toBe("not found");
    /* ⚠️ AGAINST THE NAME BESIDE IT, not against a literal. The name states its
       own ink (`TYPE.wordmark`), so it is what the page's own colour looks like
       — and comparing the two is the whole question: did the word that stated
       nothing get the same answer as the word that did. */
    expect(seen.line, `the line under the name is "${seen.line}" and the name is `
      + `"${seen.name}" — an unstated word took the surrounding surface's ink`)
      .toBe(seen.name);
  }, 120_000);
});
