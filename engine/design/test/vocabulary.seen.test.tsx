/**
 * THE FOUR BLOCKS THAT ONLY EXIST ONCE SOMETHING HAS RUN — measured, and
 * photographed on the way past.
 *
 * ⚠️ EACH OF THESE IS A CAPABILITY THAT A STATIC RENDER REPORTS AS PRESENT AND
 * INERT. `Rail`'s paging is a scroll listener, so a string contains a scroller
 * with no dots and no steppers and looks exactly like the version that works.
 * `Words` is a field whose whole behaviour is what happens after a keystroke.
 * `Bars` draws from a computation over the digits, so the difference between a
 * correct symbol and a convincing picture of the wrong one is a measurement.
 * `TileGrid` is `auto-fit`, which means its column count is the browser's answer
 * and not the markup's.
 *
 * ⚠️ AND IT WRITES THE IMAGES, WHICH IS NOT A SIDE ERRAND. Four blocks shipped
 * and buried is how they came to be asked about at all — each is drawn on one
 * screen of one app, behind a sign-in, in a state that needs a furnished
 * workspace. A file somebody can look at is what stops the fifth one being
 * rebuilt by hand.
 */

import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DESK, PHONE, mounted, pageFor, stylesheet } from "../src/measure/index.js";

const OUT = new URL("./seen-out/", import.meta.url).pathname;

let browser: Browser;
let css: string;
let code: string;
beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  css = stylesheet();
  code = await mounted(new URL("./mount/vocabulary.tsx", import.meta.url).pathname);
  browser = await chromium.launch();
}, 180_000);
afterAll(async () => { await browser?.close(); });

const open = async (
  width: number, theme: "dark" | "light" = "dark", shot?: string,
): Promise<Page> => {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.setContent(
    pageFor(`<div id="root"></div><script type="module">${code}</script>`, css, theme),
  );
  /* ⚠️ THE FIXTURE'S OWN SIGNAL, NOT A TIMER — `mount/vocabulary.tsx`. */
  await page.waitForSelector("[data-ready='true']", { timeout: 30_000 });
  await page.evaluate(() => new Promise((go) => { requestAnimationFrame(() => go(null)); }));
  if (shot) await page.screenshot({ path: `${OUT}${shot}.png`, fullPage: true });
  return page;
};

describe("the blocks a photograph could not reach", () => {
  it("lays the grid out in more columns on a desk than on a phone", async () => {
    /* ⚠️ THE COLUMN COUNT IS THE BROWSER'S ANSWER, which is the whole argument
       for `auto-fit` over a declared count — so it is the browser that has to be
       asked. A grid that silently resolved to one column everywhere would pass
       every static check in the tree. */
    const tops = async (width: number, theme: "dark" | "light", shot?: string) => {
      const page = await open(width, theme, shot);
      try {
        return await page.evaluate(() => {
          const tiles = Array.from(document.querySelectorAll("[data-tile]"));
          const first = tiles[0]?.getBoundingClientRect().top ?? 0;
          return tiles.filter((t) => Math.abs(t.getBoundingClientRect().top - first) < 2).length;
        });
      } finally { await page.close(); }
    };
    const phone = await tops(PHONE.width, "dark", "V-blocks-phone-dark");
    const desk = await tops(DESK.width, "dark", "V-blocks-desk-dark");
    expect(phone).toBeGreaterThanOrEqual(1);
    expect(desk).toBeGreaterThan(phone);
  }, 120_000);

  /**
   * ⚠️ NARROW ENOUGH TO PAGE AND WIDE ENOUGH FOR THE STEPPERS, which is one
   * width and not two. `Rail` returns a BARE scroller when its content fits —
   * correct, and it means a desk viewport where four cards fit side by side has
   * no dots to find and nothing is wrong. The steppers are `hidden md:flex`, so
   * a phone has the dots and not them. 800 is just past `md` and still narrow
   * enough that four cards do not fit.
   */
  const PAGES = 800;

  it("gives the rail its page count and its steppers", async () => {
    const page = await open(PAGES);
    try {
      const rail = await page.evaluate(() => {
        const dots = document.querySelector('[role="img"][aria-label*="pinned note"]');
        return {
          says: dots?.getAttribute("aria-label") ?? "",
          /* ⚠️ PRESENT AND DRAWN ARE TWO QUESTIONS, and the second is the one a
             `hidden md:flex` that never turns on would pass. */
          steps: Array.from(document.querySelectorAll('[aria-label^="Previous "], [aria-label^="Next "]'))
            .filter((el) => el.getBoundingClientRect().width > 0).length,
        };
      });
      /* ⚠️ "1 of N", IN WORDS, because the dots alone are decoration to anybody
         who cannot see them. */
      expect(rail.says).toMatch(/pinned note: 1 of \d+/);
      expect(rail.steps).toBe(2);
    } finally { await page.close(); }
  }, 120_000);

  it("still says so when only a sliver is off the edge", async () => {
    /* ⚠️ THE WIDTH WHERE IT WAS WRONG. At a desk the four cards overrun by about
       a third of a viewport, which `Math.round` called one page — so the rail
       drew no dots and no steppers and left the fourth card clipped at the edge
       with nothing saying it could be reached. A rail that overflows at all has
       more than one page. */
    const page = await open(DESK.width);
    try {
      const over = await page.evaluate(() => {
        const el = document.querySelector(".snap-x");
        const dots = document.querySelector('[role="img"][aria-label*="pinned note"]');
        return {
          hidden: (el?.scrollWidth ?? 0) - (el?.clientWidth ?? 0),
          says: dots?.getAttribute("aria-label") ?? "",
        };
      });
      expect(over.hidden).toBeGreaterThan(0);
      expect(over.says).toMatch(/pinned note: 1 of \d+/);
    } finally { await page.close(); }
  }, 120_000);

  it("draws the barcode as bars rather than as the digits", async () => {
    const page = await open(PHONE.width);
    try {
      const bars = await page.evaluate(() => {
        const svg = document.querySelector('svg[role="img"][aria-label="5901234123457"]');
        /* ⚠️ ONE `path`, MANY SUBPATHS — see `Bars`. Every bar is an `M` in the
           same `d` because a symbol drawn as ninety-five sibling rects is
           ninety-five nodes the browser composites separately. */
        return (svg?.querySelector("path")?.getAttribute("d") ?? "").split("M").length - 1;
      });
      /* ⚠️ AN EAN-13 IS THIRTY BAR GROUPS, so a handful is a symbol that would
         scan as nothing. The floor sits far below the real count and far above
         anything a placeholder would produce. */
      expect(bars).toBeGreaterThan(20);
    } finally { await page.close(); }
  }, 120_000);

  it("takes a word into the vocabulary and shows it beside the others", async () => {
    const page = await open(PHONE.width);
    try {
      await page.fill('input[placeholder="Type a topic"]', "Hiring");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(150);
      const said = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-slot='tag']")).map((t) => t.textContent ?? ""));
      /* ⚠️ BOTH HALVES, because the pair is the point: `Words` is the control and
         `Tags` is the same set worn read-only, and a screen that used one for
         both is the fault they exist to prevent. */
      expect(said.filter((t) => t.includes("Hiring")).length).toBeGreaterThanOrEqual(2);
    } finally { await page.close(); }
  }, 120_000);

  it("photographs both themes", async () => {
    for (const theme of ["dark", "light"] as const) {
      const page = await open(PHONE.width, theme, `V-blocks-phone-${theme}`);
      await page.close();
    }
    expect(true).toBe(true);
  }, 120_000);
});
