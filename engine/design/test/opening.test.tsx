/**
 * THE CURTAIN — is the drawn letter the letter, and does it actually move.
 *
 * ⚠️ THE FIRST QUESTION IS THE ONE NO REVIEW CATCHES. A ring standing in for an
 * O is either exactly the letter's box or it is a foreign glyph in the middle of
 * the word, and the difference is a few hundredths of an em — invisible in a
 * diff, invisible in a code review, and the first thing anybody notices on the
 * screen. The first version of this was drawn from taste and had four of its six
 * measurements wrong, including the one that matters most: Geist sets its O
 * NARROWER than it is tall, so a circle there is a letter from another font.
 *
 * ⚠️ SO IT IS MEASURED AGAINST THE BASELINE, IN A BROWSER, WITH THE REAL FONT.
 * The numbers on the right are the typeface's own, read off a 200px rasterisation
 * of its O. If a font update moves them, this goes red rather than the wordmark
 * quietly coming apart.
 */

import { chromium, type Browser } from "playwright";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OPENING_MOTION } from "../src/index.js";
import { Opening } from "../src/parts/opening.js";
import { TYPE } from "../src/tokens/type.js";
import { stylesheet } from "./rhythm.harness.js";

let browser: Browser;
let css: string;
beforeAll(async () => { css = stylesheet(); browser = await chromium.launch(); }, 120_000);
afterAll(async () => { await browser?.close(); });

const page = async (extra = "") => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await p.setContent(
    `<!doctype html><html data-theme="dark" ${extra}><head><meta charset="utf-8">`
    + `<style>${css}</style><style>${OPENING_MOTION}</style>`
    + `<style>html,body{margin:0}</style></head><body>`
    + renderToStaticMarkup(<Opening says={["Counting to one"]} />)
    + `</body></html>`,
  );
  await p.waitForTimeout(400);
  return p;
};

/** ⚠️ The typeface's own O, read off its ink. Not a preference. */
const LETTER = {
  above: 0.745,
  below: 0.01,
  width: 0.68,
  height: 0.755,
} as const;

describe("the letter that turns", () => {
  it("occupies the exact box of the letter it stands in for", async () => {
    const p = await browser.newPage({ viewport: { width: 900, height: 400 } });
    const svg = renderToStaticMarkup(<Opening says={[]} />)
      .replace(/^[\s\S]*?(<svg)/, "$1").replace(/(<\/svg>)[\s\S]*$/, "$1");
    await p.setContent(
      `<!doctype html><html data-theme="dark"><head><meta charset="utf-8">`
      + `<style>${css}</style><style>html,body{margin:0}</style></head><body>`
      + `<p id="w" class="${TYPE.opening}" style="font-size:200px">`
      /* ⚠️ A zero-sized inline box is the only honest way to ask a line where its
         baseline is — every other measurement here is relative to it. */
      + `<i id="base" style="display:inline-block;width:0;height:0;vertical-align:baseline"></i>`
      + svg + `<span>ne</span></p></body></html>`,
    );
    await p.waitForTimeout(400);
    const drawn = await p.evaluate(() => {
      const em = 200;
      const base = document.getElementById("base")!.getBoundingClientRect().bottom;
      const s = document.querySelector("#w svg")!.getBoundingClientRect();
      const to3 = (n: number) => Math.round(n * 1000) / 1000;
      return {
        above: to3((base - s.top) / em),
        below: to3((s.bottom - base) / em),
        width: to3(s.width / em),
        height: to3(s.height / em),
      };
    });
    await p.close();
    expect(drawn, "the drawn O is not the shape of the O it replaces").toEqual(LETTER);
  }, 60_000);

  /*
    ⚠️ IN PIXELS, BECAUSE A DECLARED ANIMATION IS NOT A MOVING ONE. This
    repository has shipped a whole ambience whose keyframes were created, were
    reported by `getAnimations()`, and repainted nothing — see `sky.test.tsx`.
    Two screenshots cannot be argued with.
  */
  it("travels", async () => {
    const p = await page();
    const before = await p.screenshot();
    await p.waitForTimeout(550);
    const after = await p.screenshot();
    await p.close();
    expect(Buffer.compare(before, after), "the arc is not moving").not.toBe(0);
  }, 60_000);

  /*
    ⚠️ AND WHAT IS LEFT WHEN IT STOPS IS A LETTER. Switching a travelling arc off
    and leaving it where it stood is a broken O on the screen of somebody who
    asked for less motion — so the arc goes and the ring behind it comes up to
    full ink. Something that holds still has to still be a thing.
  */
  it("holds still when asked, and is a whole letter while it does", async () => {
    const p = await page(`data-reduce-motion="true"`);
    const before = await p.screenshot();
    await p.waitForTimeout(550);
    const after = await p.screenshot();
    const ink = await p.evaluate(() => ({
      arc: getComputedStyle(document.querySelector('[data-opening="arc"]')!).opacity,
      ring: getComputedStyle(document.querySelector('[data-opening="ring"]')!).opacity,
    }));
    await p.close();
    expect(Buffer.compare(before, after), "it keeps moving for somebody who asked it not to")
      .toBe(0);
    expect(ink, "the O is left broken rather than whole").toEqual({ arc: "0", ring: "1" });
  }, 60_000);
});

describe("what it says", () => {
  const LINES = ["one", "two", "three", "four", "five", "six", "seven", "eight"];

  /*
    ⚠️ THE WHOLE LIST, NOT JUST A MEMBER OF IT. A pick that returns the first
    entry every time also returns a member of the list, and sixty lines nobody
    ever sees is the fault this screen exists to avoid. Forty mounts of eight
    lines misses one about a thousandth of the time, so the assertion is that
    MOST of them come up — enough to fail an index that cannot move.
  */
  it("reaches across the lines it is given", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const html = renderToStaticMarkup(<Opening says={LINES} />);
      const found = LINES.filter((l) => html.includes(`>${l}<`));
      expect(found, "a mount showed something other than one line").toHaveLength(1);
      seen.add(found[0]!);
    }
    expect(seen.size, `only ${[...seen].join(", ")} ever came up`).toBeGreaterThan(4);
  });

  /* ⚠️ Nothing to say is a curtain, not a curtain with an empty line under it. */
  it("says nothing rather than nothing at all", () => {
    const html = renderToStaticMarkup(<Opening says={[]} />);
    expect(html).toContain("One");
    expect(html, "an empty line still took its space").not.toContain("max-w-sm");
  });
});
