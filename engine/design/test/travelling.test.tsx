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
 * measured now — `holds its brightness` and `does not arrive twice` — because
 * both were invisible to every question about declarations.
 */

import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BLOCK_MOTION, TRAVEL_MOTION } from "../src/index.js";
import { PHONE, stylesheet } from "./rhythm.harness.js";

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
 * ⚠️ A PAGE WITH A BACKGROUND, A COLUMN AND BLOCKS THAT WANT TO ARRIVE, because
 * every answer here is about one of the three. The background is what makes the
 * arriving snapshot OPAQUE, which is the whole reason it does not need to fade;
 * the column is what slides; and the blocks are what must not move at all.
 */
const screen = (tag: string, fill: string): string =>
  `<h1 style="margin:0;padding:20px;font:600 28px system-ui;color:#fff">${tag}</h1>`
  + `<main data-blocks="true" style="display:flex;flex-direction:column;gap:16px;padding:20px">`
  + [1, 2, 3, 4, 5].map((i) =>
    `<section style="border-radius:16px;background:${fill};padding:20px;color:#e8e8e8">`
    + `${tag} ${i}</section>`).join("")
  + `</main>`;

/*
  ⚠️ THE TWO SCREENS ARE DELIBERATELY DIFFERENT SHADES. A dissolve between two
  near-identical pictures barely dips even when it is composited wrongly, so a
  harness whose screens match measures its own similarity rather than the
  transition — and the fault it is here to catch would clear it by a few percent.
  Real screens differ; these do too.
*/
const BEFORE = "#161616";
const AFTER = "#2c2c2c";

const opened = async (fill: string = BEFORE): Promise<Page> => {
  const page = await browser.newPage({ viewport: { width: PHONE.width, height: PHONE.height } });
  await page.setContent(
    `<!doctype html><html data-theme="dark"><head><meta charset="utf-8">`
    + `<style>${css}</style>`
    + `<style>html,body{margin:0;background:#0b0b0b}</style>`
    /* ⚠️ The real stagger, not a stand-in — what it does at the end of a travel
       is half of what is under test. */
    + `<style>${BLOCK_MOTION}</style>`
    + `<style>${TRAVEL_MOTION}</style></head>`
    + `<body><div id="page">${screen("A", fill)}</div></body></html>`,
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
const begin = async (
  page: Page, at: { travel: string; world: string; fill?: string },
): Promise<void> => {
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
  }, { ...at, markup: screen("B", at.fill ?? AFTER) });
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
    `holds its brightness`, which is the assertion this one explains.
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
 * ground — to 72% of its brightness within 40ms of the press, held it a fifth
 * below for a quarter of a second, and snapped back when the snapshots were
 * discarded. Nothing was misdeclared: two snapshots each at partial opacity
 * simply do not composite to one opaque page, and no pairing of curves fixes
 * arithmetic. The fix is that only the outgoing picture fades.
 *
 * ⚠️ MEASURED BY SCREENSHOT, WITH THE CLOCK HELD STILL. Pausing every animation
 * and setting its time makes each sample exact and repeatable; sampling a live
 * transition measures the machine the test is running on.
 */
const brightness = async (page: Page): Promise<number> => {
  const shot = await page.screenshot({ type: "png" });
  return await page.evaluate(async (bytes: number[]) => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
    const img = new Image();
    await new Promise((done) => { img.onload = done; img.src = url; });
    const c = document.createElement("canvas");
    c.width = 32; c.height = 32;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, 32, 32);
    const { data } = ctx.getImageData(0, 0, 32, 32);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
    }
    URL.revokeObjectURL(url);
    return sum / (32 * 32);
  }, Array.from(shot));
};

/*
  ⚠️ AND IT IS MEASURED IN BOTH DIRECTIONS, WHICH IS NOT SYMMETRY FOR ITS OWN
  SAKE. The floor a dip is judged against can only be the dimmer of the two ends,
  and going from a dark screen to a bright one that floor is the dark end — so a
  transition that shows almost nothing in the middle still clears it. Measured:
  restoring the fade-in was caught going one way and passed going the other.
  Travelling dark→bright and bright→dark leaves nowhere for a trough to hide.
*/
describe("the screen through a page change", () => {
  it.each([
    ["same", BEFORE, AFTER], ["same", AFTER, BEFORE],
    ["new", BEFORE, AFTER], ["new", AFTER, BEFORE],
  ])("holds its brightness (%s world, %s to %s)", async (world, from, to) => {
    const page = await opened(from);
    const before = await brightness(page);
    await begin(page, { travel: "forward", world, fill: to });

    const through: Array<{ at: number; lit: number }> = [];
    for (const at of [0, 40, 90, 150, 220, 300, 380, 439]) {
      const live = await page.evaluate((t: number) => {
        const all = document.getAnimations();
        for (const a of all) {
          a.pause();
          try { a.currentTime = t; } catch { /* a finished one refuses; leave it */ }
        }
        return all.length;
      }, at);
      expect(live, `the transition was gone by ${at}ms — nothing was measured`)
        .toBeGreaterThan(0);
      through.push({ at, lit: await brightness(page) });
    }
    await page.close();

    /*
      ⚠️ THE FLOOR IS THE DIMMER OF THE TWO ENDS, LESS A LITTLE. Two screens are
      never identically bright, so the test cannot demand a constant — what it
      refuses is a middle DARKER than either end, which is the shape of the
      fault. 8% is comfortably inside the 28% that shipped and outside the
      couple of percent a sub-pixel resample moves.
    */
    const floor = Math.min(before, through[through.length - 1]!.lit) * 0.92;
    const dark = through.filter((s) => s.lit < floor);
    expect(
      dark,
      `the page dims mid-change (start ${before.toFixed(1)}, floor ${floor.toFixed(1)}): `
      + through.map((s) => `${s.at}ms ${s.lit.toFixed(1)}`).join(", "),
    ).toEqual([]);
  }, 90_000);
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
