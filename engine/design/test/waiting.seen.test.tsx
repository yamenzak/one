/**
 * DOES THE PLACEHOLDER STAND WHERE THE CONTENT WILL — measured, at a phone
 * width, in the stylesheet that ships.
 *
 * ⚠️ THIS IS THE ONLY CLAIM A SKELETON MAKES, AND IT IS A CLAIM ABOUT PIXELS.
 * "Shaped like what is coming" is in three comments in this package and was
 * checked by nothing: a shape's preset stands in for every screen that names the
 * shape, so `list` drew one un-headed card of four rows in front of a console
 * page of three headed cards holding one, two and two. Everything about that is
 * defensible in the source and it is the exact fault a skeleton exists to
 * prevent — the content lands and the whole page jumps.
 *
 * ⚠️ SO THE ASSERTION IS THAT THE TWO GEOMETRIES AGREE. The screen is rendered
 * ready and measured; `ShapeWaiting` is handed what the measurement found and
 * measured in turn; block for block, they must land in the same places.
 */

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Group, NavRow, Screen, ShapeWaiting, Stat, Grid, type Block } from "../src/index.js";
import { PHONE, html, pageFor, stylesheet } from "../src/measure/index.js";

let browser: Browser;
let css: string;
beforeAll(async () => { css = stylesheet(); browser = await chromium.launch(); }, 120_000);
afterAll(async () => { await browser?.close(); });

/**
 * ⚠️ THE SAME THREE FACTS `recall.tsx` KEEPS, READ THE SAME WAY. Written out
 * again here it would be a test of a copy; this is the walk the product runs,
 * so a change to what a block is measured by fails here rather than drifting.
 */
const READ = `[...document.querySelectorAll("[data-blocks]")].slice(-1)[0]`;

const measure = async (node: React.ReactNode): Promise<readonly Block[]> => {
  const page = await browser.newPage({ viewport: { width: PHONE.width, height: PHONE.height } });
  try {
    await page.setContent(pageFor(html(node), css));
    return await page.evaluate(`[...(${READ}?.children ?? [])].map((b) => ({
      head: b.querySelector("h2")
        ? Math.round(b.querySelector("h2").parentElement.getBoundingClientRect().height) : 0,
      rows: b.querySelectorAll("[data-row]").length,
      height: Math.round(b.getBoundingClientRect().height),
    }))`) as readonly Block[];
  } finally { await page.close(); }
};

/** ⚠️ The skeleton is not inside a `Screen`, so it is measured on its own terms. */
const measureBars = async (blocks: readonly Block[]): Promise<readonly number[]> => {
  const page = await browser.newPage({ viewport: { width: PHONE.width, height: PHONE.height } });
  try {
    await page.setContent(pageFor(
      /* ⚠️ The same column width a `read` screen has, or every bar is measured in
         a box the product never draws. */
      `<div style="width:${PHONE.width}px;padding:0 1rem">${html(<ShapeWaiting blocks={blocks} />)}</div>`,
      css,
    ));
    return await page.evaluate(`[...document.querySelector("[role='status']").children]
      .map((b) => Math.round(b.getBoundingClientRect().height))`) as readonly number[];
  } finally { await page.close(); }
};

const screenOf = (then: () => React.ReactNode) => (
  <Screen shape="list" of={{ status: "ready", value: 1 } as never} then={then} />
);

/** ⚠️ Three headed cards of different sizes — the console's own shape, which is
    the one the preset stood in for worst. */
function Console() {
  return (
    <>
      <Group label="The check" under="what it is">
        <NavRow label="One" under="a fact" onOpen={() => {}} />
      </Group>
      <Group label="The catalogue" under="what it is">
        <NavRow label="Two" under="a fact" onOpen={() => {}} />
        <NavRow label="Three" under="a fact" onOpen={() => {}} />
      </Group>
      <Group label="Figures">
        <Grid min="8rem">
          <Stat label="Findable" value={12} />
          <Stat label="Waiting" value={3} />
        </Grid>
      </Group>
    </>
  );
}

describe("the skeleton a screen waits behind", () => {
  it("reads the screen's real blocks — headings, rows and heights", async () => {
    const blocks = await measure(screenOf(() => <Console />));
    expect(blocks.length, "three top-level blocks").toBe(3);
    expect(blocks.map((b) => b.head > 0), "each block carries a heading")
      .toEqual([true, true, true]);
    /* ⚠️ THE FIRST TWO HAVE A LINE UNDER THE NAME AND THE THIRD DOES NOT, so
       their heading blocks are different heights — which is exactly why this is
       a measurement rather than a boolean. */
    expect(blocks[0]!.head).toBeGreaterThan(blocks[2]!.head);
    expect(blocks.map((b) => b.rows)).toEqual([1, 2, 0]);
    /* ⚠️ The third has no rows at all — it is a grid of figures, which is why a
       block with none is drawn at its measured height rather than as rows. */
    expect(blocks[2]!.height).toBeGreaterThan(0);
  });

  /*
    ⚠️ THE ONE THAT MATTERS. Every block of the placeholder has to be the height
    of the block it stands in for, or the content moves when it lands — which is
    the jump the skeleton was added to prevent, arriving by way of the fix.
  */
  it("stands each block where the content will be", async () => {
    const blocks = await measure(screenOf(() => <Console />));
    const bars = await measureBars(blocks);
    expect(bars.length, "one placeholder per block").toBe(blocks.length);
    bars.forEach((bar, i) => {
      /* ⚠️ A rounding allowance and no more. Two pixels is a border and a
         half-pixel line-height; anything larger is a different layout. */
      expect(Math.abs(bar - blocks[i]!.height),
        `block ${i}: placeholder ${bar}px against content ${blocks[i]!.height}px`)
        .toBeLessThanOrEqual(2);
    });
  });

  /*
    ⚠️ AND THE NEGATIVE CONTROL IS THE BEHAVIOUR THAT SHIPPED. The `list` shape's
    own placeholder is one card of four rows whatever the screen holds — measured
    against the console page above, it is a different drawing in every respect,
    which is what "the skeleton looks nothing like the screen" was reporting.
  */
  it("is nothing like the shape's own preset, which is why this exists", async () => {
    const blocks = await measure(screenOf(() => <Console />));
    const page = await browser.newPage({ viewport: { width: PHONE.width, height: PHONE.height } });
    try {
      await page.setContent(pageFor(
        html(<Screen shape="list" of={{ status: "waiting" } as never} then={() => null} />), css));
      /* ⚠️ The preset draws no `data-blocks` at all — it is not the screen's
         content, it is a stand-in beside it — so it is counted in cards. */
      const preset = await page.evaluate(`({
        cards: document.querySelectorAll(".card").length,
        heads: document.querySelectorAll("h2").length,
        tall: Math.round(document.querySelector(".card").getBoundingClientRect().bottom
          - document.querySelector(".card").getBoundingClientRect().top),
      })`) as { cards: number; heads: number; tall: number };
      expect(preset.cards, "one card for a screen that has three").toBe(1);
      expect(preset.heads, "and no heading at all, on a page of three").toBe(0);
      /* ⚠️ AND IT IS THE WRONG HEIGHT BY MOST OF A SCREEN, which is the jump
         itself: the preset's one card against the three blocks it stands in
         for. The number is not the point — that it is nowhere near is. */
      const real = blocks.reduce((n, b) => n + b.height, 0);
      expect(Math.abs(preset.tall - real),
        `the preset is ${preset.tall}px where the screen is ${real}px`)
        .toBeGreaterThan(100);
    } finally { await page.close(); }
  });
});
