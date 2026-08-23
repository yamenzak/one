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
  ActionRow, Balance, Group, Hero, HeroWaiting, NavRow, QuickActions, Reveal, Screen, Stack,
} from "../src/index.js";
import { PHONE, html, pageFor, stylesheet } from "../src/measure/index.js";

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

/**
 * A DISCLOSURE IS A ROW, AND THE CARD HAD NO WAY TO KNOW IT.
 *
 * ⚠️ THE FILL IS WHAT A PERSON SEES, AND IT WAS THE WRONG SIZE IN BOTH
 * DIRECTIONS. `Reveal` composed a bare `Button slot="trigger"` with nothing but
 * `justify-between` and `px-0`, so it kept `.button`'s own `h-10 md:h-9` — a
 * 40px hover slab in a column of 64px rows — and without `ROW.press` the fill
 * stopped at the content box instead of bleeding to the card's edge. Reported as
 * "the public key button's hover has no padding", which is what a short fill
 * floating inside a card looks like.
 *
 * ⚠️ AND WITHOUT `data-row` THE CARD WRAPPED IT IN `CARD_OTHERS`, adding a
 * row's inset OUTSIDE a control that already had one — the double padding two
 * describes up, arriving by a different route.
 *
 * ⚠️ MEASURED AGAINST THE ROW BESIDE IT RATHER THAN AGAINST A NUMBER. A
 * disclosure that merely looks reasonable is how the two drift; the assertion
 * that holds is that they are the SAME control.
 */
describe("a disclosure inside a card", () => {
  /* ⚠️ A ONE-LINE ROW, BECAUSE A DISCLOSURE IS ONE LINE. `ROW.tap` is a MINIMUM:
     a row carrying an `under` grows to 72 and a fold-out cannot, so measuring
     the two against each other with a second line on one of them asserts a
     difference that is correct. The first draft of this test did exactly that
     and failed on the fixed code — the specimen was wrong, not the component. */
  const both = (
    <Group label="Push" under="what it is">
      <NavRow label="A row" onOpen={() => {}} />
      <Reveal label="Public key"><div>a key</div></Reveal>
    </Group>
  );

  it("presses exactly like the row beside it", async () => {
    const page = await browser.newPage({ viewport: { width: PHONE.width, height: PHONE.height } });
    try {
      await page.setContent(pageFor(html(screenOf(() => both)), css));
      const seen = await page.evaluate(() => {
        const box = (el: Element | null) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left) };
        };
        return {
          /* ⚠️ The BUTTONS, because the fill is the button's box — the row's
             outer marker and the disclosure's are different elements. */
          row: box(document.querySelector("button[data-row]")),
          fold: box(document.querySelector("[data-slot='disclosure'] button")),
          card: box(document.querySelector(".card")),
        };
      });
      expect(seen.row, "the row").not.toBeNull();
      expect(seen.fold, "the disclosure's trigger").not.toBeNull();

      /* ⚠️ SAME HEIGHT: `.button`'s 40 against the row's 64 was the complaint. */
      expect(seen.fold!.h, "a fold-out is as tall as a row").toBe(seen.row!.h);
      /* ⚠️ SAME WIDTH AND SAME LEFT EDGE: `ROW.press` bleeds the fill out over
         the card's gutter, so both reach the card's edge rather than one of
         them floating inside it. */
      expect(seen.fold!.w, "and as wide").toBe(seen.row!.w);
      expect(seen.fold!.left, "and starts where it starts").toBe(seen.row!.left);
      expect(seen.fold!.w, "which is the card's full width").toBe(seen.card!.w);
    } finally { await page.close(); }
  });

  /* ⚠️ AND THE CARD TREATS IT AS A ROW, which is what stops `CARD_OTHERS`
     wrapping a second inset round a control that has its own. */
  it("is marked as a row, so the card adds no inset of its own", async () => {
    const page = await browser.newPage({ viewport: { width: PHONE.width, height: PHONE.height } });
    try {
      await page.setContent(pageFor(html(screenOf(() => both)), css));
      const seen = await page.evaluate(() => {
        const fold = document.querySelector("[data-slot='disclosure']");
        const card = document.querySelector(".card");
        const trigger = fold?.querySelector("button");
        return {
          marked: fold?.hasAttribute("data-row") ?? false,
          /* The gap the card puts above the disclosure's own control. */
          slack: fold && trigger
            ? Math.round(trigger.getBoundingClientRect().top - fold.getBoundingClientRect().top)
            : -1,
          cardBottom: card ? Math.round(card.getBoundingClientRect().bottom) : 0,
          foldBottom: fold ? Math.round(fold.getBoundingClientRect().bottom) : 0,
        };
      });
      expect(seen.marked, "`data-row` goes on the OUTERMOST element — the card's selector matches a direct child").toBe(true);
      expect(seen.slack, "no inset between the disclosure and its own trigger").toBe(0);
      expect(seen.cardBottom - seen.foldBottom, "the card's own inset, once").toBe(ROW_PAD);
    } finally { await page.close(); }
  });
});

/**
 * THE ONE NUMBER A SCREEN IS ABOUT, AND THE AIR AROUND IT.
 *
 * ⚠️ A HERO IS THE ONLY BLOCK THAT ARRIVES UNDER THE CROWN RATHER THAN UNDER A
 * HEADING, AND THAT DECIDES ITS TOP. Everything else on a page is introduced by
 * type; a hero is introduced by 64px of chrome standing on a veil, so the rung
 * that reads as air under a section title reads as a figure pushed up against
 * the bar. It takes the widest rung above as well as below.
 *
 * ⚠️ AND WHAT IS UNDER IT IS A DIFFERENT KIND OF THING, NOT A FOURTH LINE OF THE
 * CAPTION. Eyebrow, figure and identifier are one thing said three ways and sit
 * tight; a row of quick actions is what to DO about the number, and at the same
 * gap two sections take from each other the eye reads a run of four.
 *
 * ⚠️ MEASURED, BECAUSE THE CLASS BEING PRESENT IS NOT THE PADDING BEING THERE.
 * The harness reads the SHIPPED stylesheet, so a rung nothing had used yet is a
 * class on the element computing to zero — `pt-10` did exactly that, and the
 * markup, the token and every source guard all looked right.
 */
describe("the one number a screen is about", () => {
  /** ⚠️ `SPACE.vast` — the rung that exists for a neighbour made of chrome. */
  const VAST = 64;
  /** ⚠️ `SPACE.airy` — the widest gap between two things the page itself drew. */
  const AIRY = 40;

  const hero = async () => {
    const page = await browser.newPage({ viewport: { width: PHONE.width, height: PHONE.height } });
    try {
      await page.setContent(pageFor(html(
        <Balance
          eyebrow="On the shelf"
          figure={<span data-figure="true">66</span>}
          identifier="214 products in 11 places"
          under={<div data-under="true">acts</div>}
        />,
      ), css));
      return await page.evaluate(() => {
        const box = (sel: string) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
        };
        const block = document.querySelector("[data-figure]")?.closest("div")?.parentElement;
        return {
          /* The whole block's own top inset — the gap the crown stands in. */
          padTop: Math.round(parseFloat(getComputedStyle(
            document.querySelector("[data-figure]")!.closest(".text-center")!).paddingTop)),
          said: block ? Math.round(block.getBoundingClientRect().bottom) : null,
          under: box("[data-under]"),
        };
      });
    } finally { await page.close(); }
  };

  it("stands off the chrome above it by the rung chrome earns", async () => {
    const seen = await hero();
    expect(seen.padTop, "the figure block's top inset — zero means the rung reached the "
      + "markup and not the stylesheet, so rebuild the SPA before believing it").toBe(VAST);
  });

  it("separates what to do about the number from the number itself", async () => {
    const seen = await hero();
    expect(seen.under!.top - seen.said!, "the acts sit at a section's distance from the "
      + "caption, so the eye reads a run of four rather than a figure and its acts").toBe(AIRY);
  });
});

/**
 * THE HERO'S PLACEHOLDER IS THE HERO, IN ANOTHER MODE.
 *
 * ⚠️ THE ONLY QUESTION A SKELETON HAS TO ANSWER IS "DOES ANYTHING MOVE WHEN THE
 * CONTENT LANDS", and it is a question about two heights, so it is asked as one.
 * What it replaced was a drawing written beside the component — `h-3 w-24` over
 * `h-10 w-40`, left-aligned, no padding, no caption, no acts — against a block
 * that is centred, 64px padded and 270px tall. Right vocabulary, wrong drawing.
 *
 * ⚠️ AND THE CIRCLE IS THE ONE COPY IN THE SYSTEM, so it is the one thing
 * measured twice. A `Skeleton` cannot BE a `Button`, so its diameter is stated
 * (`QUICK_CIRCLE`) rather than shared — and a stated measurement nobody checks
 * is exactly what a drifting skeleton is made of.
 */
describe("the hero's placeholder", () => {
  const both = async () => {
    const page = await browser.newPage({ viewport: { width: PHONE.width, height: PHONE.height } });
    try {
      const acts = [1, 2, 3, 4].map((i) => (
        { id: `a${i}`, label: "Receive", icon: <span>+</span>, onDo: () => {} }));
      await page.setContent(pageFor(html(
        <>
          <div data-real="true">
            <Hero
              eyebrow="On the shelf"
              value={66}
              identifier="214 products in 11 places"
              under={<QuickActions actions={acts} />}
            />
          </div>
          <div data-bones="true"><HeroWaiting acts={4} /></div>
        </>,
      ), css));
      return await page.evaluate(() => {
        const box = (sel: string) => {
          const el = document.querySelector(sel);
          return el ? Math.round(el.getBoundingClientRect().height) : null;
        };
        const round = (sel: string) => {
          const el = document.querySelector(sel);
          return el ? Math.round(el.getBoundingClientRect().width) : null;
        };
        return {
          real: box("[data-real]"),
          bones: box("[data-bones]"),
          realCircle: round("[data-real] button"),
          /* ⚠️ FOUND BY WHERE IT SITS, NEVER BY WHAT IT MEASURES. Two selectors
             were wrong before this one and each was wrong in a way that reads
             like the defect: `[class*="skeleton"]` took the eyebrow's 96px bar,
             and `.size-11` encoded the value under test — so changing the
             diameter made the circle UNFINDABLE and the failure said "null",
             which is a test that can see absence and never a wrong number. The
             column is `w-16` and the circle is its first child. */
          boneCircle: round("[data-bones] .w-16 > :first-child"),
        };
      });
    } finally { await page.close(); }
  };

  it("stands exactly as tall as the block it stands in for", async () => {
    const seen = await both();
    expect(seen.real, "the real hero did not render").toBeGreaterThan(200);
    expect(seen.bones, `the placeholder is ${seen.bones}px against the hero's ${seen.real} — `
      + "whatever the difference, it is how far the number jumps when the content lands")
      .toBe(seen.real);
  });

  it("draws its circles at the diameter the real control takes", async () => {
    const seen = await both();
    expect(seen.realCircle, "no quick action rendered").toBeGreaterThan(0);
    expect(seen.boneCircle, `a bone circle is ${seen.boneCircle}px against the control's `
      + `${seen.realCircle} — \`QUICK_CIRCLE\` is the one copy in this system and it has drifted`)
      .toBe(seen.realCircle);
  });
});
