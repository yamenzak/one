/**
 * DOES A PAGE CHANGE ACTUALLY ANIMATE — in a browser, against the stylesheet
 * that ships.
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
 */

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRAVEL_MOTION } from "../src/index.js";
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
 * One page change, driven the way `travel()` drives it.
 *
 * ⚠️ THE PAGE CARRIES A BLOCK COLUMN AND A BLOCK THAT WANTS TO ARRIVE, because
 * both halves of the answer are about them: the column is what slides, and its
 * children are what must NOT — a page transition and a per-block stagger firing
 * together is two entrances for one press.
 */
const travelled = async (
  attrs: { readonly travel: string; readonly world: string },
): Promise<{ readonly root: string; readonly column: string; readonly block: string }> => {
  const page = await browser.newPage({ viewport: { width: PHONE.width, height: PHONE.height } });
  try {
    await page.setContent(
      `<!doctype html><html data-theme="dark"><head><meta charset="utf-8">`
      + `<style>${css}</style>`
      /* ⚠️ A stand-in for the arrival every screen's blocks run on mount. */
      + `<style>@keyframes stagger { from { opacity: 0 } to { opacity: 1 } }`
      + ` [data-blocks] > * { animation: stagger 300ms both; }</style>`
      + `<style>${TRAVEL_MOTION}</style></head>`
      + `<body><main data-blocks><section id="one">before</section></main></body></html>`,
    );
    return await page.evaluate(async (at: { travel: string; world: string }) => {
      const root = document.documentElement;
      root.setAttribute("data-travel", at.travel);
      const go = (document as unknown as {
        startViewTransition: (c: () => void) => { readonly ready: Promise<void> };
      }).startViewTransition;
      const run = go.call(document, () => {
        document.getElementById("one")!.textContent = "after";
        root.setAttribute("data-world", at.world);
      });
      await run.ready;
      const named = (a: Animation) => (a as unknown as { animationName: string }).animationName;
      const all = document.getAnimations();
      return {
        /* ⚠️ The pseudo tree — a group that was never created simply has none. */
        root: all
          .filter((a) => (a.effect as KeyframeEffect | null)?.pseudoElement?.includes("view-transition"))
          .map((a) => `${(a.effect as KeyframeEffect).pseudoElement}: ${named(a)}`).join(" | "),
        column: (document.querySelector("[data-blocks]") as Element)
          .getAnimations().map(named).join(" "),
        block: (document.getElementById("one") as Element)
          .getAnimations().map(named).join(" "),
      };
    }, attrs);
  } finally { await page.close(); }
};

describe("a page change", () => {
  /*
    ⚠️ THE WORLD CROSS-FADES IN PLACE AND THE COLUMN SLIDES. Not "a transition
    ran" — one runs either way, which is exactly why an inert system was
    invisible for a day. What is asserted is which element carries which half.
  */
  it("dissolves the world and slides the column, going forward", async () => {
    const on = await travelled({ travel: "forward", world: "same" });
    expect(on.root).toContain("view-transition-old(root): travel-out");
    expect(on.root).toContain("view-transition-new(root): travel-in");
    expect(on.column).toBe("travel-column-forward");
  }, 60_000);

  it("slides the column the other way, going back", async () => {
    const on = await travelled({ travel: "back", world: "same" });
    expect(on.column).toBe("travel-column-back");
  }, 60_000);

  /* ⚠️ A different material does not slide — it opens, and the column stands
     down with it. A place has no direction. */
  it("opens rather than sliding, into another world", async () => {
    const on = await travelled({ travel: "forward", world: "new" });
    expect(on.root).toContain("view-transition-old(root): travel-away");
    expect(on.root).toContain("view-transition-new(root): travel-near");
    expect(on.column, "the column does not slide into a different place").toBe("");
  }, 60_000);

  /*
    ⚠️ AND NOTHING INSIDE THE COLUMN ARRIVES SEPARATELY. This is the whole of
    "one engine": the blocks' own stagger, a chart drawing itself and a mark
    playing its character are each correct on mount and are four entrances at
    once on top of a page change.
  */
  it("stands every entrance inside it down, so there is one movement", async () => {
    const on = await travelled({ travel: "forward", world: "same" });
    expect(on.block, "a block still running its own arrival during a travel").toBe("");
  }, 60_000);
});
