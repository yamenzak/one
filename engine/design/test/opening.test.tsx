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
import { OPENING_MOTION, SAID } from "../src/index.js";
import { Opening } from "../src/parts/opening.js";
import { TYPE } from "../src/tokens/type.js";
import { harness } from "./opening.harness.js";
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

/* ------------------------------------------------------------ what it says --- */

/**
 * ⚠️ MOUNTED FOR REAL, BECAUSE THE CYCLE IS ONLY IN A BROWSER. Every assertion
 * above this point reads a first frame, and a first frame is identical in a
 * version that advances and one that never does. What is under test here is
 * three beats from two timers — the hold, the fade out, the swap while nothing
 * is on the screen — and none of them exist in a rendered string.
 */
describe("the line, while you wait", () => {
  const LINES = ["Counting to one", "Polishing the counters", "Winding the clock"];

  const mounted = async (lines: readonly string[] = LINES, extra = "") => {
    const code = await harness();
    const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await p.setContent(
      `<!doctype html><html data-theme="dark" ${extra}><head><meta charset="utf-8">`
      + `<style>${css}</style><style>${OPENING_MOTION}</style>`
      + `<style>html,body{margin:0}</style></head><body>`
      + `<script type="application/json" id="lines">${JSON.stringify(lines)}</script>`
      + `<div id="root"></div><script>${code}</script></body></html>`,
    );
    await p.waitForFunction(() => document.querySelector("[data-said]") !== null);
    return p;
  };

  const said = (p: Awaited<ReturnType<typeof mounted>>) =>
    p.evaluate(() => {
      const el = document.querySelector("[data-said]") as HTMLElement;
      return { text: el.textContent, state: el.dataset["said"], opacity: getComputedStyle(el).opacity };
    });

  it("moves on to the next line, and leaves before the next arrives", async () => {
    const p = await mounted();
    const first = await said(p);
    expect(first.state, "it starts already leaving").toBe("here");

    /* ⚠️ Sampled in the middle of the fade, which is the frame a cross-dissolve
       would have two sentences in. */
    await p.waitForTimeout(SAID.hold + SAID.fade / 2);
    const leaving = await said(p);
    expect(leaving.state, "the line never leaves").toBe("gone");
    expect(leaving.text, "the words changed before they had faded out")
      .toBe(first.text);
    expect(Number(leaving.opacity), "it swaps at full strength — two lines at once")
      .toBeLessThan(0.9);

    await p.waitForTimeout(SAID.fade);
    const next = await said(p);
    await p.close();
    expect(next.state).toBe("here");
    expect(next.text, "the same line came back").not.toBe(first.text);
    expect(LINES).toContain(next.text);
  }, 60_000);

  /*
    ⚠️ AND IT HOLDS ONE LINE FOR SOMEBODY WHO ASKED FOR LESS MOTION. Taking the
    fade away and leaving the cycle is the worst of the three: a sentence
    REPLACED with no transition is a harder cut than the fade it was meant to
    spare them.
  */
  it("says one thing and stops, when asked for less motion", async () => {
    const p = await mounted(LINES, `data-reduce-motion="true"`);
    const first = await said(p);
    await p.waitForTimeout(SAID.hold + SAID.fade * 2);
    const later = await said(p);
    await p.close();
    expect(later.text, "it kept cycling for somebody who asked it not to").toBe(first.text);
    expect(later.state).toBe("here");
  }, 60_000);

  /*
    ⚠️ AND THE NAME DOES NOT MOVE WHILE THE LINES DO, which is asserted with a
    line that WRAPS. Every one of One's sixty fits on one line at 320 today —
    measured — so a fixture of real copy proves nothing at all here: the room is
    reserved precisely so that "they all happen to be short" is not a rule
    somebody has to know. The long one below is what the sixty-first could be.
  */
  it("keeps the name still when a line under it wraps", async () => {
    const p = await mounted([
      "Counting to one",
      "Threading a needle that is rather longer than the ones before it",
    ]);
    const where = () => p.evaluate(() =>
      document.querySelector("[aria-label='One']")!.getBoundingClientRect().top);
    const lines = () => p.evaluate(() => {
      const el = document.querySelector("[data-said]") as HTMLElement;
      return Math.round(el.getBoundingClientRect().height
        / parseFloat(getComputedStyle(el).lineHeight));
    });
    const before = await where();
    await p.waitForTimeout(SAID.hold + SAID.fade * 2);
    const after = await where();
    const tall = await lines();
    await p.close();
    expect(tall, "the fixture does not wrap, so this proves nothing").toBeGreaterThan(1);
    expect(after, "the name moved when the line under it wrapped").toBe(before);
  }, 60_000);
});
