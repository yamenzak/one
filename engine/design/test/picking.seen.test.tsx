/**
 * THE SAME LIST AT A DESK WIDTH, WHERE IT IS A TABLE.
 *
 * ⚠️ THE ONE FAULT `Listing` EXISTS TO PREVENT IS A CAPABILITY REACHING ONE
 * SHAPE. The phone list is `md:hidden` and the table is `hidden md:block`, so a
 * screenshot at any width shows one of them looking perfectly correct — and
 * every screen that ever hand-rolled row actions put them in the `aside` and
 * forgot the columns, or the other way round.
 *
 * ⚠️ AND THIS HALF NEEDS A BROWSER RATHER THAN A STRING. The table is behind
 * `React.lazy` so its weight stays out of the entry chunk, which means a static
 * render contains its SKELETON and nothing else. `picking.test.tsx` asserts the
 * phone half where a string can see it; this is the other half, once the chunk
 * has arrived and the media query has picked it.
 */

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Listing, Screen, Stack } from "../src/index.js";
import { DESK, PHONE, mounted, pageFor, stylesheet } from "../src/measure/index.js";

let browser: Browser;
let css: string;
let code: string;
beforeAll(async () => {
  css = stylesheet();
  code = await mounted(new URL("./mount/picking.tsx", import.meta.url).pathname);
  browser = await chromium.launch();
}, 180_000);
afterAll(async () => { await browser?.close(); });

const seenAt = async (width: number) => {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  try {
    await page.setContent(pageFor(`<div id="root"></div><script type="module">${code}</script>`, css));
    /* ⚠️ THE LAZY CHUNK IS WHY THIS WAITS FOR THE ROWS RATHER THAN FOR A TIMER.
       A `waitForTimeout` here is a test that passes on a fast machine and
       reports a missing table on a busy one — which is the fixture racing its
       own precondition, and this tree has had that once already. */
    await page.waitForSelector("[data-ready='true']", { timeout: 30_000 });
    return await page.evaluate(() => {
      const shown = (el: Element) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      };
      const all = (q: string) => Array.from(document.querySelectorAll(q)).filter(shown);
      return {
        acts: all('[aria-label="What can be done here"]').length,
        boxes: all("[data-slot='checkbox']").length,
        chosen: all("[aria-label='What is chosen']").length,
      };
    });
  } finally { await page.close(); }
};

describe("one declaration, both shapes", () => {
  it("gives the table its own row actions", async () => {
    const seen = await seenAt(DESK.width);
    /* ⚠️ TWO ROWS, TWO TRIGGERS — and the phone list is display:none beside it,
       which is what makes counting the VISIBLE ones the question. */
    expect(seen.acts).toBe(2);
  });

  it("gives the table its own choosing column", async () => {
    const seen = await seenAt(DESK.width);
    expect(seen.boxes).toBe(2);
    expect(seen.chosen).toBe(1);
  });

  it("and the phone list has exactly the same three", async () => {
    const seen = await seenAt(PHONE.width);
    expect(seen).toEqual({ acts: 2, boxes: 2, chosen: 1 });
  });
});
