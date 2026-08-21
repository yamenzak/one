/**
 * DOES A PAGE CHANGE ACTUALLY ANIMATE, AND DOES IT DO SO WITHOUT THE SCREEN
 * GOING DARK — in a browser, against the stylesheet that ships.
 *
 * ⚠️ THE FIRST VERSION OF THIS SYSTEM WAS VERIFIED AND WAS COMPLETELY INERT, and
 * the reason is the whole point of this file. It was proved in real Chromium on
 * a page carrying `TRAVEL_MOTION` and four custom properties — which is not the
 * page the product serves. `@heroui/styles` ships
 * `:root { view-transition-name: none }`, correct for a library whose toast
 * queue runs its own transition and does not want the page captured every time
 * something is announced. With no name on the root there is no `root` GROUP in
 * the transition tree at all: `startViewTransition` runs, captures nothing, and
 * the swap is a hard cut. Every rule in `TRAVEL_MOTION` matched an element that
 * was never created, and the probe could not see it because the probe left out
 * the half that breaks it.
 *
 * ⚠️ SO THE STYLESHEET IS THE BUILT ONE, exactly as `rhythm` and `waiting` use
 * it. A transition verified against CSS nobody serves is worth nothing, and this
 * repository now has two instances of that costing a whole feature.
 *
 * ⚠️ AND THE SECOND VERSION ANIMATED CORRECTLY AND FLASHED TWICE PER PRESS,
 * which every check here passed. Naming the right keyframe on the right
 * pseudo-element says nothing about what the two of them composite to, and
 * nothing at all about the frame after the transition ends. Both faults are
 * measured now — `is never less than covered` and `releasing a page that has
 * arrived` — because both were invisible to every question about declarations.
 */

import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BLOCK_MOTION, TRAVEL_MOTION } from "../src/index.js";
import { PHONE, stylesheet } from "../src/measure/index.js";

let browser: Browser;
let css: string;
beforeAll(async () => { css = stylesheet(); browser = await chromium.launch(); }, 120_000);
afterAll(async () => { await browser?.close(); });

/**
 * ⚠️ THE RULE THAT KILLED IT, ASSERTED TO STILL BE THERE. If a HeroUI update
 * drops it, `:root[data-travel]` becomes a redundant re-declaration rather than
 * an override — harmless, but the paragraph explaining it would be describing a
 * codebase that no longer exists, and the next person would delete the line.
 */
it("the shipped stylesheet still takes the root's transition name away", () => {
  expect(css).toContain("view-transition-name:none");
});

/**
 * ⚠️ A PAGE WITH A GROUND, A COLUMN AND BLOCKS THAT WANT TO ARRIVE, because
 * every answer here is about one of the three: the ground is what a thin
 * transition shows through to, the column is what slides, and the blocks are
 * what must not move at all.
 */
const screen = (tag: string): string =>
  `<h1 style="margin:0;padding:20px;font:600 28px system-ui;color:#fff">${tag}</h1>`
  + `<main data-blocks="true" style="display:flex;flex-direction:column;gap:16px;padding:20px">`
  + [1, 2, 3, 4, 5].map((i) =>
    `<section style="border-radius:16px;background:#1c1c1c;padding:20px;color:#e8e8e8">`
    + `${tag} ${i}</section>`).join("")
  + `</main>`;

const opened = async (): Promise<Page> => {
  const page = await browser.newPage({ viewport: { width: PHONE.width, height: PHONE.height } });
  await page.setContent(
    `<!doctype html><html data-theme="dark"><head><meta charset="utf-8">`
    + `<style>${css}</style>`
    + `<style>html,body{margin:0;background:#0b0b0b}</style>`
    /* ⚠️ The real stagger, not a stand-in — what it does at the end of a travel
       is half of what is under test. */
    + `<style>${BLOCK_MOTION}</style>`
    + `<style>${TRAVEL_MOTION}</style></head>`
    + `<body><div id="page">${screen("A")}</div></body></html>`,
  );
  return page;
};

/**
 * Start a travel and hold it at `ready`, so the transition tree exists and is
 * live.
 *
 * ⚠️ EVERY ANIMATION IS PAUSED IN THE SAME TURN THAT `ready` RESOLVES, and not
 * in the round trip after it. A transition runs on a wall clock: under a loaded
 * machine — a whole workspace's suites in parallel — the next `page.evaluate`
 * can arrive after it has finished and been torn down, and then the samples are
 * of a settled page rather than of a transition. That is a flaky test, which is
 * worse than none: it teaches the next person to re-run instead of to look.
 */
const begin = async (page: Page, at: { travel: string; world: string }): Promise<void> => {
  await page.evaluate(async (to: { travel: string; world: string; markup: string }) => {
    const root = document.documentElement;
    root.setAttribute("data-travel", to.travel);
    const go = (document as unknown as {
      startViewTransition: (c: () => void) => { readonly ready: Promise<void> };
    }).startViewTransition;
    const run = go.call(document, () => {
      document.getElementById("page")!.innerHTML = to.markup;
      root.setAttribute("data-world", to.world);
    });
    await run.ready;
    for (const a of document.getAnimations()) a.pause();
  }, { ...at, markup: screen("B") });
};

const playing = async (page: Page): Promise<{
  readonly root: string; readonly column: string; readonly block: string;
}> =>
  await page.evaluate(() => {
    const name = (a: Animation) => (a as unknown as { animationName: string }).animationName;
    return {
      root: document.getAnimations()
        .filter((a) => (a.effect as KeyframeEffect | null)?.pseudoElement?.includes("view-transition"))
        .map((a) => `${(a.effect as KeyframeEffect).pseudoElement}: ${name(a)}`).join(" | "),
      column: (document.querySelector("[data-blocks]") as Element)
        .getAnimations().map(name).join(" "),
      block: (document.querySelector("[data-blocks] > *") as Element)
        .getAnimations().map(name).join(" "),
    };
  });

describe("a page change", () => {
  /*
    ⚠️ THE WORLD DISSOLVES AND THE COLUMN SLIDES. Not "a transition ran" — one
    runs either way, which is exactly why an inert system was invisible for a
    day. What is asserted is which element carries which half.
  */
  it("dissolves the world and slides the column, going forward", async () => {
    const page = await opened();
    await begin(page, { travel: "forward", world: "same" });
    const on = await playing(page);
    expect(on.root).toContain("view-transition-old(root): travel-out");
    expect(on.column).toBe("travel-column-forward");
    await page.close();
  }, 60_000);

  /*
    ⚠️ AND THE ARRIVING SIDE CARRIES NO ANIMATION AT ALL, WHICH IS A DECISION
    RATHER THAN AN OMISSION. Fading it in as well is what made the screen dim
    through every page change; leaving the rule out entirely would hand the job
    back to the browser's own fade-in, which is the same thing. See
    `is never less than covered`, which is the assertion this one explains.
  */
  it("brings the next screen in at full strength, not as a fade", async () => {
    const page = await opened();
    await begin(page, { travel: "forward", world: "same" });
    const on = await playing(page);
    expect(on.root, "the arriving page is fading in — the screen will dim")
      .not.toContain("view-transition-new(root)");
    await page.close();
  }, 60_000);

  it("slides the column the other way, going back", async () => {
    const page = await opened();
    await begin(page, { travel: "back", world: "same" });
    expect((await playing(page)).column).toBe("travel-column-back");
    await page.close();
  }, 60_000);

  /* ⚠️ A different material does not slide — it opens, and the column stands
     down with it. A place has no direction. */
  it("opens rather than sliding, into another world", async () => {
    const page = await opened();
    await begin(page, { travel: "forward", world: "new" });
    const on = await playing(page);
    expect(on.root).toContain("view-transition-old(root): travel-away");
    expect(on.root).toContain("view-transition-new(root): travel-near");
    expect(on.column, "the column does not slide into a different place").toBe("");
    await page.close();
  }, 60_000);

  /*
    ⚠️ AND NOTHING INSIDE THE COLUMN ARRIVES SEPARATELY. This is the whole of
    "one engine": the blocks' own stagger, a chart drawing itself and a mark
    playing its character are each correct on mount and are four entrances at
    once on top of a page change.
  */
  it("stands every entrance inside it down, so there is one movement", async () => {
    const page = await opened();
    await begin(page, { travel: "forward", world: "same" });
    expect((await playing(page)).block, "a block still running its own arrival").toBe("");
    await page.close();
  }, 60_000);
});

/* ------------------------------------------------------ and it never dims --- */

/**
 * ⚠️ THE ONE ASSERTION THAT WOULD HAVE CAUGHT WHAT SHIPPED. Every check above
 * passed while a page change dropped the whole screen — chrome, content and
 * ground — to 41% of its brightness, twice, for every press. Nothing was
 * misdeclared. Two snapshots each at partial opacity simply do not composite to
 * one opaque page, and no pairing of curves fixes that: it is arithmetic, and
 * the arithmetic is what has to be checked.
 *
 * ⚠️ SO WHAT IS MEASURED IS THE TWO OPACITIES, WHICH IS THE COMPOSITE ITSELF.
 * The transition tree is exactly two full-page pictures, one over the other,
 * blended `normal` — so how much of the ground still shows through is
 * `(1 - old)(1 - new)`, and the whole fault reduces to that one number, sampled
 * through the change with the clock held still.
 *
 * ⚠️ IT WAS A SCREENSHOT FIRST, AND THAT IS WORTH KNOWING BEFORE ANYBODY MAKES
 * IT ONE AGAIN. Photographing the page and averaging its luminance sounds like
 * the stronger check and is not: the root snapshot does not carry the document
 * background (it propagates to the canvas), so a picture taken inside a
 * transition and one taken outside it are not the same measurement, and the
 * comparison between them carries an offset of its own. It failed CI on a
 * sample 1.7% under a floor derived that way — a real fault would have been
 * 28%, but a check whose margin is smaller than its own systematic error tells
 * you to re-run rather than to look, and that is worse than not having it.
 */
const composite = async (page: Page): Promise<readonly {
  at: number; old: number; arriving: number;
}[]> =>
  await page.evaluate(() => {
    const root = document.documentElement;
    const out = [];
    for (const at of [0, 40, 90, 150, 220, 300, 380, 439]) {
      for (const a of document.getAnimations()) {
        try { a.currentTime = at; } catch { /* a finished one refuses; leave it */ }
      }
      out.push({
        at,
        old: Number(getComputedStyle(root, "::view-transition-old(root)").opacity),
        arriving: Number(getComputedStyle(root, "::view-transition-new(root)").opacity),
      });
    }
    return out;
  });

describe("the screen through a page change", () => {
  it.each([["same"], ["new"]])("is never less than covered (%s world)", async (world) => {
    const page = await opened();
    await begin(page, { travel: "forward", world });
    const through = await composite(page);
    await page.close();

    /*
      ⚠️ SOURCE-OVER, NOT ADDITION, AND THE DIFFERENCE IS THE WHOLE CHECK. Two
      pictures stacked and blended `normal` cover `a + b(1 - a)` of the ground,
      so what is left showing through is `(1 - a)(1 - b)` — which is zero only
      when ONE of them is fully opaque. A pair that merely sums to 1 (0.5 and
      0.5, the classic cross-fade) leaves a quarter of the page uncovered, and
      that quarter is the flash. Written as `a + b >= 1` this test passes the
      exact fault it exists to catch; it was, and it did.
    */
    const gap = (s: { old: number; arriving: number }) => (1 - s.old) * (1 - s.arriving);
    const thin = through.filter((s) => gap(s) > 0.001);
    expect(
      thin,
      `the page is not fully covered mid-change — it will dim: `
      + through.map((s) =>
        `${s.at}ms old ${s.old.toFixed(2)} new ${s.arriving.toFixed(2)} `
        + `(${(100 * gap(s)).toFixed(0)}% through)`).join(", "),
    ).toEqual([]);
  }, 60_000);

  /*
    ⚠️ AND THE OLD PICTURE REALLY DOES LEAVE, because "always covered" is also
    true of a transition that never animates anything — which is the OTHER way
    this system has already been broken, and the reason the file opens the way
    it does.
  */
  it.each([["same"], ["new"]])("dissolves the page being left (%s world)", async (world) => {
    const page = await opened();
    await begin(page, { travel: "forward", world });
    const through = await composite(page);
    await page.close();
    expect(through[0]!.old, "the outgoing page starts already gone").toBeGreaterThan(0.95);
    expect(through[through.length - 1]!.old, "the outgoing page never leaves")
      .toBeLessThan(0.05);
  }, 60_000);
});

/* ----------------------------------------------- and it arrives only once --- */

/**
 * ⚠️ WHY `travel()` FINISHES THE HELD ANIMATIONS INSTEAD OF JUST LETTING GO —
 * asserted as a fact about the BROWSER, because it is the non-obvious half and
 * the code reads like belt-and-braces without it.
 *
 * `animation: none` does not pause an arrival, it destroys it. Lifting the rule
 * makes the browser create the animation again AT TIME ZERO, so a screen that
 * has already settled blanks for a frame and staggers back in — a second, sharper
 * flash half a second behind the first, which is exactly how it was reported.
 * Finishing each one at the moment the hold lifts is what makes the transition
 * the only entrance.
 */
describe("releasing a page that has arrived", () => {
  const held = `<!doctype html><html><head><style>`
    + `@keyframes fade { from { opacity: 0 } to { opacity: 1 } }`
    + `[data-blocks] > * { animation: fade 300ms both; }`
    + `[data-blocks] > *:nth-child(2) { animation-delay: 120ms; }`
    + `:root[data-travel] [data-blocks] > * { animation: none !important; }`
    + `</style></head><body><main data-blocks><i id="one">1</i><i id="two">2</i></main></body></html>`;

  const release = async (finishThem: boolean): Promise<readonly string[]> => {
    const page = await browser.newPage();
    await page.setContent(held);
    const seen = await page.evaluate(async (finish: boolean) => {
      const root = document.documentElement;
      root.setAttribute("data-travel", "forward");
      await new Promise((done) => setTimeout(done, 400));
      const inside = Array.from(document.querySelectorAll<HTMLElement>("[data-blocks] > *"));
      root.removeAttribute("data-travel");
      if (finish) {
        for (const el of inside) {
          for (const a of el.getAnimations()) {
            if (a.effect?.getComputedTiming().iterations === Infinity) continue;
            try { a.finish(); } catch { /* */ }
          }
        }
      }
      const read = () => inside.map((el) => getComputedStyle(el).opacity);
      const first = read();
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      return [first.join(","), read().join(",")];
    }, finishThem);
    await page.close();
    return seen;
  };

  it("would blank the page if the hold were simply lifted", async () => {
    const [immediately] = await release(false);
    expect(
      immediately,
      "lifting `animation: none` no longer restarts the arrival — the whole "
      + "reason `travel()` finishes them has gone, and so should the code",
    ).not.toBe("1,1");
  }, 60_000);

  it("stays put when the held arrivals are finished instead", async () => {
    const seen = await release(true);
    expect(seen, "a block flashed after the transition had already landed")
      .toEqual(["1,1", "1,1"]);
  }, 60_000);
});
