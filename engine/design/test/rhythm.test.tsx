/**
 * THE VERTICAL RHYTHM, MEASURED IN A BROWSER.
 *
 * ⚠️ THIS IS THE ONE RULE EVERY OTHER GUARD IS BLIND TO. They read source — which
 * class was written, which component was composed — and spacing is not in the
 * source. It is a computed value produced by a stylesheet, a flex container, a
 * line-height and four components that each did something defensible. "The
 * sections are stuck together" and "this card has double padding" have been
 * reported, fixed one instance at a time, and come back, for exactly that reason:
 * there was nothing that could see them.
 *
 * ⚠️ SO THE ASSERTIONS ARE PIXELS. Real components, the real built stylesheet,
 * real Chromium, at 390. A screen cannot compose its way out of a rule expressed
 * in the geometry it produces.
 *
 * ⚠️ AND EACH ONE HAS A NEGATIVE CONTROL BESIDE IT — a specimen built the wrong
 * way, asserted to FAIL the same arithmetic. A geometry check that only ever sees
 * correct layout is a check nobody knows is looking.
 */

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ActionRow, Group, NavRow, Screen, Stack,
} from "../src/index.js";
import { PHONE, html, pageFor, stylesheet } from "./rhythm.harness.js";

/* ------------------------------------------------------------- the scale --- */

/** ⚠️ `SPACE.roomy` — between two kinds of thing. DESIGN.md §6. */
const BETWEEN_BLOCKS = 24;
/** ⚠️ `HEAD_GAP` — a heading belongs to what is under it. */
const HEAD_TO_BLOCK = 8;
/** ⚠️ `ROW.pad` — one number, on every row, top and bottom. */
const ROW_PAD = 12;

/* --------------------------------------------------------------- measure --- */

let browser: Browser;
let css: string;
beforeAll(async () => { css = stylesheet(); browser = await chromium.launch(); }, 120_000);
afterAll(async () => { await browser?.close(); });

interface Seen {
  readonly blocks: readonly { readonly top: number; readonly bottom: number }[];
  readonly heads: readonly { readonly text: string; readonly bottom: number }[];
  readonly cards: readonly { readonly top: number; readonly bottom: number }[];
  readonly rows: readonly { readonly top: number; readonly bottom: number }[];
}

const measure = async (node: React.ReactNode): Promise<Seen> => {
  const page = await browser.newPage({ viewport: { width: PHONE.width, height: PHONE.height } });
  try {
    await page.setContent(pageFor(html(node), css));
    return await page.evaluate(() => {
      const at = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
      };
      const blocks = [...(document.querySelector("[data-blocks]")?.children ?? [])];
      return {
        blocks: blocks.map(at),
        /* ⚠️ The heading BLOCK, not the `h2` — the line under it belongs to the
           heading, so the gap that matters is measured from the bottom of both. */
        heads: [...document.querySelectorAll("h2")].map((h) => ({
          text: h.textContent ?? "",
          bottom: Math.round((h.parentElement ?? h).getBoundingClientRect().bottom),
        })),
        cards: [...document.querySelectorAll(".card")].map(at),
        rows: [...document.querySelectorAll("[data-row]")].map(at),
      };
    });
  } finally { await page.close(); }
};

/** ⚠️ Every consecutive pair, because one correct gap in three is not a rhythm. */
const gaps = (of: readonly { readonly top: number; readonly bottom: number }[]): number[] =>
  of.slice(1).map((b, i) => b.top - of[i]!.bottom);

/* -------------------------------------------------------------- specimens --- */

const two = (label: string) => (
  <Group label={label} under="what it is">
    <NavRow label="One" under="a fact" onOpen={() => {}} />
    <NavRow label="Two" under="a fact" onOpen={() => {}} />
  </Group>
);

/**
 * ⚠️ A COMPONENT RETURNING A FRAGMENT, WHICH IS WHAT EVERY REAL SCREEN DOES —
 * and what defeated the old rhythm completely. `React.Children` cannot look
 * inside this, so anything that counted children saw one block and spaced it
 * against nothing.
 */
function Composed() {
  return <>{two("A")}{two("B")}{two("C")}</>;
}

const screenOf = (then: () => React.ReactNode) => (
  <Screen shape="list" of={{ status: "ready", value: 1 } as never} then={then} />
);

describe("a screen's blocks", () => {
  /* ⚠️ THE INLINE CASE WORKED AND WAS THE ONLY ONE THAT DID. Kept so the two are
     asserted to be the SAME number rather than each merely being reasonable. */
  it("are spaced by the scale when the fragment is written inline", async () => {
    const seen = await measure(screenOf(() => <>{two("A")}{two("B")}{two("C")}</>));
    expect(seen.blocks.length).toBe(3);
    expect(gaps(seen.blocks)).toEqual([BETWEEN_BLOCKS, BETWEEN_BLOCKS]);
  });

  /*
    ⚠️ AND THE SAME WHEN A COMPONENT RETURNS IT. This is the assertion the
    product needed: measured before the fix, the gap here was 0 — three cards
    touching, on nearly every screen in the console, with every suite green.
    Nothing about the screen was wrong; the rhythm was counting React children,
    and a component boundary is opaque to that by construction.
  */
  it("are spaced by the same scale when a component returns them", async () => {
    const seen = await measure(screenOf(() => <Composed />));
    expect(seen.blocks.length, "the DOM is the list of blocks").toBe(3);
    expect(gaps(seen.blocks)).toEqual([BETWEEN_BLOCKS, BETWEEN_BLOCKS]);
  });

  /*
    ⚠️ A HEADING BELONGS TO WHAT IS UNDER IT, AND THE RATIO IS WHAT SAYS SO. Both
    numbers can be defensible on their own and still read as one run of five
    things: what makes a heading a heading is that the air above it is several
    times the air below it. Three to one, measured, on every block.
  */
  it("bind each heading to its own card, not to the block above", async () => {
    const seen = await measure(screenOf(() => <Composed />));
    const bind = seen.cards.map((card, i) => card.top - seen.heads[i]!.bottom);
    expect(bind).toEqual([HEAD_TO_BLOCK, HEAD_TO_BLOCK, HEAD_TO_BLOCK]);
    expect(BETWEEN_BLOCKS / HEAD_TO_BLOCK,
      "air above a heading must outweigh the air below it").toBeGreaterThanOrEqual(3);
  });
});

/**
 * ⚠️ A CARD'S INSET IS EXACTLY HALF ITS ROW RHYTHM, AND THAT IS THE WHOLE OF
 * "DOUBLE PADDING". Every row is `py-3` and the card is `py-3`, so edge → first
 * row is 12 and row → row is 12 + 12 = 24. Any extra container inside the card
 * adds its own 12 to the top and the bottom while the rows keep theirs — so the
 * first row sits 24 from the edge where every other card in the product puts it
 * at 12, and because the cards are the same colour what somebody SEES is one card
 * whose contents start twice as far down as its neighbour's.
 */
describe("a card's inset", () => {
  it("is half the distance between two of its rows", async () => {
    const seen = await measure(screenOf(() => two("Rows")));
    const card = seen.cards[0]!;
    const [first, second] = [seen.rows[0]!, seen.rows[1]!];
    expect(first.top - card.top, "the top inset").toBe(ROW_PAD);
    expect(card.bottom - second.bottom, "the bottom inset").toBe(ROW_PAD);
    expect(second.top - first.bottom, "rows touch — their own padding is the rhythm").toBe(0);
  });

  /*
    ⚠️ THE NEGATIVE CONTROL, AND IT IS THE SHAPE THAT SHIPPED. A `Stack` wrapping
    rows inside a card is not a row, so the card gives IT a row's inset and the
    rows inside keep their own — 12 + 12 before the first line, and the stack's own
    gap added between every pair. Reported as "the catalogue card has double
    padding", which is exactly what it is.
  */
  it("doubles when something re-stacks the rows inside it — which is the fault", async () => {
    const seen = await measure(screenOf(() => (
      <Group label="Wrapped" under="what it is">
        <Stack space="tight">
          <NavRow label="One" under="a fact" onOpen={() => {}} />
          <ActionRow label="Two" under="a fact" onDo={() => {}} />
        </Stack>
      </Group>
    )));
    const card = seen.cards[0]!;
    expect(seen.rows[0]!.top - card.top,
      "if this is 12 the fault is gone and this test should be deleted")
      .toBe(ROW_PAD * 2);
  });
});
