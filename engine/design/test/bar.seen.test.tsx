/**
 * THE NAV'S ARITHMETIC, MEASURED — at three, four and five destinations.
 *
 * ⚠️ NOTHING SOURCE-READING CAN ANSWER THIS. Whether a bar looks deliberate at
 * four is a question about pixels produced by a flex container, a `grow basis-0`
 * and a ceiling, and the answer changed the moment a class was added that
 * Tailwind had never seen — the cap was written, typechecked, shipped and did
 * NOTHING until the SPA was rebuilt, because a utility only exists if the
 * compiler found it in a source file. That is invisible to every check that
 * reads TypeScript.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PHONE, mounted, stylesheet } from "../src/measure/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));

let browser: Browser;
let css: string;
let code: string;
beforeAll(async () => {
  css = stylesheet();
  code = await mounted(join(HERE, "bar.mount.tsx"));
  browser = await chromium.launch();
}, 180_000);
afterAll(async () => { await browser?.close(); });

interface Bar {
  readonly items: readonly { readonly text: string; readonly x: number; readonly r: number }[];
  readonly left: number; readonly right: number;
  readonly lit: number;
}

const bars = async (theme: "dark" | "light" = "dark"): Promise<Bar[]> => {
  const page = await browser.newPage({ viewport: PHONE });
  await page.setContent(`<!doctype html><html data-theme="${theme}"><head><style>${css}`
    + `</style></head><body><div id="root"></div>`
    + `<script type="module">${code}</script></body></html>`, { waitUntil: "load" });
  await page.waitForSelector("[data-island]");
  await page.waitForTimeout(400);
  const read = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-island]")).map((island) => {
      const box = island.getBoundingClientRect();
      const items = Array.from(island.children).map((el) => {
        const at = el.getBoundingClientRect();
        return { text: (el.textContent ?? "").trim(), x: Math.round(at.left), r: Math.round(at.right) };
      });
      /* ⚠️ THE LIGHT IS A PSEUDO-ELEMENT, so it is read the only way one can be:
         off the computed style rather than off an element that does not exist in
         the tree. A `background-image` of `none` is a light nobody drew. */
      const here = island.querySelector('[data-here="true"]');
      const paint = here ? getComputedStyle(here, "::before").backgroundImage : "none";
      return { items, left: Math.round(box.left), right: Math.round(box.right),
        lit: paint === "none" || paint === "" ? 0 : 1 };
    }));
  await page.close();
  return read as Bar[];
};

describe("the bar at three, four and five", () => {
  it("draws every destination it was given", async () => {
    const [five, four, three] = await bars();
    expect(five?.items.length).toBe(5);
    expect(four?.items.length).toBe(4);
    expect(three?.items.length).toBe(3);
  }, 60_000);

  /*
    ⚠️ THE CLOSED ITEMS KEEP THEIR PITCH. They are `grow basis-0`, so without a
    ceiling they divide whatever the open one leaves: measured at 390px that was
    59px each with five destinations and 88 with four — every item still equal,
    still centred, and the marks half again as far apart as the design was drawn
    for. `ISLAND_ITEM_MAX` is the ceiling; this is the number it produces.
  */
  it("never lets a closed item sprawl", async () => {
    for (const bar of await bars()) {
      const closed = bar.items.slice(1);
      const widest = Math.max(...closed.map((one) => one.r - one.x));
      expect(widest, `${bar.items.length} item(s): widest closed item is ${widest}px`)
        .toBeLessThanOrEqual(76);
    }
  }, 60_000);

  /*
    ⚠️ AND THE ROOM THAT IS LEFT GOES TO BOTH ENDS. With a ceiling and no
    centring the leftover collects at the right, which is a bar with a hole in it
    rather than a bar with fewer items — measured before `justify-center`: the
    three-item row ended 97px short of its own right edge.
  */
  it("centres what it has", async () => {
    for (const bar of await bars()) {
      const before = (bar.items[0]?.x ?? 0) - bar.left;
      const after = bar.right - (bar.items[bar.items.length - 1]?.r ?? 0);
      expect(Math.abs(before - after),
        `${bar.items.length} item(s): ${before}px before the first, ${after}px after the last`)
        .toBeLessThanOrEqual(2);
    }
  }, 60_000);

  /*
    ⚠️ AND THE ONE LIT MARK IS ACTUALLY LIT. The light is `color-mix(in oklab,
    var(--brand) …)`, so a product whose declared hue is not a COLOUR — an oklch
    triple rather than `oklch(...)` — makes the whole declaration invalid and the
    gradient is simply never painted. Nothing else about the bar changes, which
    is why this is asserted rather than looked at.
  */
  it("lights the destination somebody is on, in both themes", async () => {
    for (const theme of ["dark", "light"] as const) {
      for (const bar of await bars(theme)) {
        expect(bar.lit, `${bar.items.length} item(s) in ${theme}: nothing painted under the mark`)
          .toBe(1);
      }
    }
  }, 90_000);
});
