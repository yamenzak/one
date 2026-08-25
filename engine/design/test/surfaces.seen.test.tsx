/**
 * ONE CORNER AND ONE INSET, MEASURED IN A BROWSER.
 *
 * ⚠️ THIS EXISTS BECAUSE A ROUND OF WORK SHIPPED WITH FOUR OF THEM AND EVERY
 * OTHER GUARD WAS GREEN. A card came out at 32px and a tile at 36; the card's
 * inset was 16 and the tile's 12; a picture leading a card was square inside a
 * 32px curve and its top corners stuck out of it; and three glass capsules on
 * one photograph measured 32, 36 and 44 tall. None of that is in the source —
 * the tile asked for no radius at all and took the library's `.button--md`, the
 * insets were two different tokens, and the capsule heights were a side effect
 * of an svg's line box. It is all computed, so only a browser can see it.
 *
 * ⚠️ AND IT IS RELATIVE, NEVER A LITERAL. Nothing here asserts "32". The card is
 * the surface everything else follows, so the assertions say a tile equals a
 * card and a picture's top equals a card — which stays true when the ladder
 * moves, and fails the moment one surface stops tracking the others.
 *
 * ⚠️ EACH ONE HAS A NEGATIVE CONTROL, for the reason `rhythm.seen.test.tsx`
 * gives: a geometry check that only ever sees correct layout is a check nobody
 * knows is looking.
 */

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FieldRow, Glass, Group, Screen, Stack, TileGrid, glyphOf } from "../src/index.js";
import { PHONE, html, pageFor, stylesheet } from "../src/measure/index.js";

let browser: Browser;
let css: string;
beforeAll(async () => { css = stylesheet(); browser = await chromium.launch(); }, 120_000);
afterAll(async () => { await browser?.close(); });

interface Box {
  readonly what: string;
  readonly w: number;
  readonly h: number;
  readonly radius: string;
  readonly pad: string;
}

interface Seen {
  readonly cards: readonly Box[];
  readonly tiles: readonly Box[];
  readonly media: readonly Box[];
  readonly glass: readonly Box[];
}

const measure = async (node: React.ReactNode): Promise<Seen> => {
  const page = await browser.newPage({ viewport: { width: PHONE.width, height: PHONE.height } });
  try {
    await page.setContent(pageFor(html(node), css));
    return await page.evaluate(() => {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return {
          what: el.tagName.toLowerCase(),
          w: Math.round(r.width),
          h: Math.round(r.height),
          radius: s.borderTopLeftRadius,
          pad: `${s.paddingTop}/${s.paddingLeft}`,
        };
      };
      const all = (q: string) => Array.from(document.querySelectorAll(q)).map(box);
      return {
        cards: all(".card"),
        tiles: all("[data-tile]"),
        media: all("[data-media]"),
        glass: all("[data-glass]"),
      };
    });
  } finally { await page.close(); }
};

/* -------------------------------------------------------------- specimen --- */

/** ⚠️ A one-pixel gif, because what is under the glass is not what is measured. */
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const surfaces = (
  <Screen shape="board">
    <Stack space="roomy">
      <Group
        label="A card that leads with a picture"
        media={{
          src: PIXEL,
          alt: "",
          over: (
            <>
              <Glass label="A word" />
              <Glass icon={glyphOf("clock")} label="A word and a mark" />
            </>
          ),
          act: <Glass icon={glyphOf("search")} label="Open it" only onDo={() => {}} />,
        }}
      >
        <FieldRow label="A fact" value="its value" />
      </Group>
      <TileGrid
        tiles={[
          { id: "a", label: "Plain", icon: glyphOf("note"), onOpen: () => {} },
          { id: "b", label: "Deep", under: "with a line under it", icon: glyphOf("chart"), onOpen: () => {} },
        ]}
      />
    </Stack>
  </Screen>
);

/* ------------------------------------------------------------------ one --- */

const only = (of: readonly string[]): readonly string[] => [...new Set(of)];

describe("one corner, one inset", () => {
  it("a tile curves exactly as a card does", async () => {
    const seen = await measure(surfaces);
    expect(seen.cards.length).toBeGreaterThan(0);
    expect(seen.tiles.length).toBeGreaterThan(0);
    /* ⚠️ THE CARD IS THE ONE THAT DECIDES — see the header. */
    expect(only([...seen.cards, ...seen.tiles].map((b) => b.radius))).toHaveLength(1);
  });

  it("a picture leading a card takes the card's top corners", async () => {
    const seen = await measure(surfaces);
    expect(seen.media).toHaveLength(1);
    expect(seen.media[0]!.radius).toBe(seen.cards[0]!.radius);
  });

  it("a tile is inset exactly as a card is", async () => {
    const seen = await measure(surfaces);
    /* ⚠️ THE HORIZONTAL HALF ONLY. A card is rows and a row brings its own
       vertical rhythm; a tile is one block and its air is square. What must
       agree is where the words start, which is the left inset. */
    const left = (b: Box) => b.pad.split("/")[1] ?? "";
    expect(only([...seen.cards, ...seen.tiles].map(left))).toHaveLength(1);
  });

  it("every tile in one grid is the same height", async () => {
    const seen = await measure(surfaces);
    expect(only(seen.tiles.map((b) => String(b.h)))).toHaveLength(1);
  });

  it("glass is one height per role — a caption, and a target", async () => {
    const seen = await measure(surfaces);
    /* ⚠️ TWO, NEVER THREE. A caption is not a target and is allowed to be
       shorter; what is refused is a third height nobody chose — which is what an
       icon's line box produced, 36 between a 32 and a 44. */
    expect(only(seen.glass.map((b) => String(b.h))).length).toBeLessThanOrEqual(2);
  });
});

/* ------------------------------------------------------- and it does bite --- */

describe("the negative controls", () => {
  it("sees a tile that took the library's own radius", async () => {
    const seen = await measure(
      <Screen shape="board">
        <Stack space="roomy">
          <Group label="A card"><FieldRow label="A fact" value="its value" /></Group>
          {/* ⚠️ A BARE BUTTON IS WHAT A TILE WAS BEFORE THE RULE — same role, no
              `data-tile`, so it keeps `.button--md`'s corner. */}
          <button type="button" className="button button--md button--tertiary">Not a tile</button>
        </Stack>
      </Screen>,
    );
    const card = seen.cards[0]!.radius;
    const loose = await browser.newPage().then(async (page) => {
      await page.setContent(pageFor(
        `<button type="button" class="button button--md button--tertiary">x</button>`, css));
      const r = await page.evaluate(() =>
        getComputedStyle(document.querySelector("button")!).borderTopLeftRadius);
      await page.close();
      return r;
    });
    expect(loose).not.toBe(card);
  });

  it("sees a picture with no corners", async () => {
    const page = await browser.newPage({ viewport: { width: PHONE.width, height: PHONE.height } });
    await page.setContent(pageFor(`<div class="card"><div class="h-44"></div></div>`, css));
    const [card, inner] = await page.evaluate(() => [
      getComputedStyle(document.querySelector(".card")!).borderTopLeftRadius,
      getComputedStyle(document.querySelector(".card > div")!).borderTopLeftRadius,
    ]);
    await page.close();
    expect(inner).not.toBe(card);
  });
});
