/**
 * THREE ARRANGEMENTS, MEASURED, AND NONE OF THEM A COORDINATE.
 *
 * ⚠️ A LAYOUT IS THE ONE THING IN THIS SYSTEM THAT CANNOT BE CHECKED BY READING
 * SOURCE. `Arranged` picking the right branch is a typed dispatch the compiler
 * already proves; what nothing else can answer is whether the three branches
 * PRODUCE different geometry — and a grid whose template resolved to one column,
 * a split whose aside wrapped underneath, and a stack are three declarations
 * that all draw one column and all pass every static check.
 *
 * ⚠️ AND THE GRID IS THE HALF WITH A NUMBER IN IT. `auto-fit` with a narrowest
 * cell says the columns are whatever fits, which is a claim about arithmetic
 * done by the browser: a grid of tiles must fit more per row than a grid of
 * cards at the same width, or the closed set of cell widths is decoration.
 */

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Layout } from "@engine/kernel";
import { Arranged, Group, NoteRow } from "../src/index.js";
import { html, pageFor, stylesheet } from "../src/measure/index.js";

let browser: Browser;
let css: string;
beforeAll(async () => { css = stylesheet(); browser = await chromium.launch(); }, 120_000);
afterAll(async () => { await browser?.close(); });

/** ⚠️ Six identical things, so any difference in the reading is the layout's. */
const THINGS = Array.from({ length: 6 }, (_, i) => (
  <Group key={i} label={`Thing ${i + 1}`}>
    <NoteRow>Something true about it</NoteRow>
  </Group>
));

const DESK = { width: 1200, height: 900 } as const;

/**
 * ⚠️ WHAT IS READ IS THE LEFT EDGE OF EACH CHILD, and how many DISTINCT ones
 * there are is the number of columns. Reading `gridTemplateColumns` would be
 * reading back what the component was told; reading where things landed is
 * reading what the browser did with it.
 */
const columns = async (layout: Layout, aside?: React.ReactNode) => {
  const page = await browser.newPage({ viewport: DESK });
  try {
    await page.setContent(pageFor(
      html(<div style={{ width: "1100px" }}><Arranged layout={layout} aside={aside}>{THINGS}</Arranged></div>),
      css,
    ));
    await page.evaluate(() => new Promise((go) => requestAnimationFrame(() => go(null))));
    return await page.evaluate(() => {
      /* ⚠️ The markup goes straight into the body — see `pageFor`, which has no
         mount point of its own. */
      const box = document.body.firstElementChild?.firstElementChild;
      if (!box) throw new Error("nothing was arranged");
      const lefts = new Set<number>();
      for (const child of Array.prototype.slice.call(box.children) as HTMLElement[]) {
        lefts.add(Math.round(child.getBoundingClientRect().left));
      }
      return lefts.size;
    });
  } finally {
    await page.close();
  }
};

describe("the three arrangements are three arrangements", () => {
  it("stacks in one column", async () => {
    expect(await columns({ as: "stack" })).toBe(1);
  }, 60_000);

  it("puts a grid in more than one", async () => {
    expect(await columns({ as: "grid", least: "card" }),
      "a grid that came out one column wide is a stack wearing a grid's declaration")
      .toBeGreaterThan(1);
  }, 60_000);

  /*
    ⚠️ THE NARROWEST CELL IS THE WHOLE DECLARATION, so this is the reading that
    says the closed set means anything. Tiles are 8rem and cards are 20rem: at
    the same width the tiles must fit more per row, and if they do not, the
    three names are three ways of saying the same thing.
  */
  it("fits more tiles across than cards, at the same width", async () => {
    const tiles = await columns({ as: "grid", least: "tile" });
    const cards = await columns({ as: "grid", least: "card" });
    expect(tiles, `${tiles} tiles across and ${cards} cards across — the narrowest `
      + `cell is not reaching the template`).toBeGreaterThan(cards);
  }, 60_000);

  /*
    ⚠️ A SPLIT'S TWO COLUMNS ARE ITS MAIN AND ITS ASIDE, so what is read here is
    the top level rather than the children of the main column. Its main content
    is still a stack — a split that also spread its own blocks sideways would be
    a grid with a sidebar, which is a fourth arrangement nobody declared.
  */
  it("puts a split in exactly two, with the main content still stacked", async () => {
    const page = await browser.newPage({ viewport: DESK });
    try {
      await page.setContent(pageFor(
        html(
          <div style={{ width: "1100px" }}>
            <Arranged layout={{ as: "split", aside: "end" }} aside={<Group label="Beside" />}>
              {THINGS}
            </Arranged>
          </div>,
        ),
        css,
      ));
      await page.evaluate(() => new Promise((go) => requestAnimationFrame(() => go(null))));
      /*
        ⚠️ THE `aside` IS FOUND BY ITS TAG RATHER THAN BY ITS DEPTH, because the
        depth changed the moment the container became a wrapper — and a reading
        that counts levels is one that breaks on a correct fix and passes on an
        incorrect one.
      */
      const seen = await page.evaluate(() => {
        const beside = document.querySelector("aside");
        const main = beside?.previousElementSibling;
        if (!beside || !main) throw new Error("the split drew no aside at all");
        const at = (el: Element) => el.getBoundingClientRect();
        const inside = new Set(
          Array.prototype.slice.call(main.children).map((c) => Math.round(at(c as Element).left)),
        );
        return { apart: Math.round(at(beside).left - at(main).left), inside: inside.size };
      });
      expect(seen.apart, "the aside is at the same left edge as the main column, so it "
        + "wrapped underneath — which is a stack").toBeGreaterThan(0);
      expect(seen.inside, "the main column spread sideways, which is a grid with a sidebar")
        .toBe(1);
    } finally {
      await page.close();
    }
  }, 60_000);
});
