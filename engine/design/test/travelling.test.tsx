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

/** One page change, driven the way `travel()` drives it. */
const travelled = async (
  attrs: { readonly travel: string; readonly world: string },
): Promise<readonly string[]> => {
  const page = await browser.newPage({ viewport: { width: PHONE.width, height: PHONE.height } });
  try {
    await page.setContent(
      `<!doctype html><html data-theme="dark"><head><meta charset="utf-8">`
      + `<style>${css}</style><style>${TRAVEL_MOTION}</style></head>`
      + `<body><main id="screen">before</main></body></html>`,
    );
    return await page.evaluate(async (at: { travel: string; world: string }) => {
      const root = document.documentElement;
      root.setAttribute("data-travel", at.travel);
      const go = (document as unknown as {
        startViewTransition: (c: () => void) => { readonly ready: Promise<void> };
      }).startViewTransition;
      const run = go.call(document, () => {
        document.getElementById("screen")!.textContent = "after";
        root.setAttribute("data-world", at.world);
      });
      await run.ready;
      /* ⚠️ The animations on the PSEUDO tree, which is the only place the answer
         lives — a group that was never created simply has none. */
      return document.getAnimations()
        .filter((a) => (a.effect as KeyframeEffect | null)?.pseudoElement?.includes("view-transition"))
        .map((a) => `${(a.effect as KeyframeEffect).pseudoElement}: `
          + `${(a as unknown as { animationName: string }).animationName}`);
    }, attrs);
  } finally { await page.close(); }
};

describe("a page change", () => {
  /*
    ⚠️ THE ASSERTION IS THAT OUR KEYFRAMES ARE ON THE ROOT'S OWN PSEUDOS. Not
    that a transition "ran" — one runs either way, which is exactly why this was
    invisible. What was missing is the group it had to run ON.
  */
  it("slides forward, within one world", async () => {
    const on = await travelled({ travel: "forward", world: "same" });
    expect(on.join(" | ")).toContain("view-transition-old(root): travel-out-forward");
    expect(on.join(" | ")).toContain("view-transition-new(root): travel-in-forward");
  }, 60_000);

  it("slides the other way, going back", async () => {
    const on = await travelled({ travel: "back", world: "same" });
    expect(on.join(" | ")).toContain("view-transition-old(root): travel-out-back");
    expect(on.join(" | ")).toContain("view-transition-new(root): travel-in-back");
  }, 60_000);

  /* ⚠️ A different material does not slide — it opens. The second mechanism,
     and the one a router never has to know about. */
  it("opens rather than sliding, into another world", async () => {
    const on = await travelled({ travel: "forward", world: "new" });
    expect(on.join(" | ")).toContain("view-transition-old(root): travel-out-away");
    expect(on.join(" | ")).toContain("view-transition-new(root): travel-in-near");
  }, 60_000);
});
