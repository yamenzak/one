/**
 * THE CHROME, MEASURED IN A BROWSER, ON THE ADDRESSES THE DEPLOYMENT USES.
 *
 * ⚠️ EVERY DEFECT HERE SHIPPED PAST A GREEN FIXTURE, AND ALL FOR ONE REASON:
 * the proving ground mounts the shell with an app's OWN routes (`/`, `/count`)
 * and the deployment mounts the same shell with those routes PREFIXED
 * (`/inventory`, `/inventory/count`). A test that only ever drives the first
 * shape cannot see anything the second one does — so these cases carry the
 * prefix, which is what `routeIn` produces and what `Product` hands down.
 *
 * ⚠️ AND IT IS A BROWSER BECAUSE THE FAULTS WERE GEOMETRIC. Two lit items is a
 * string assertion; the destination that then fell off the right edge of a
 * clipping bar is not, and neither is a hem's own curve. Rendered to a string,
 * every one of them is invisible.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ScreenSpec } from "@engine/kernel";
import { Shell } from "../src/frame/shell.js";
import { html, mounted, stylesheet } from "../src/measure/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));

let browser: Browser;
let css: string;
beforeAll(async () => { css = stylesheet(); browser = await chromium.launch(); }, 120_000);
afterAll(async () => { await browser?.close(); });

/** ⚠️ OneInventory's own five, at the addresses the centre gives them. */
const IN = "/inventory";
const SCREENS: readonly ScreenSpec[] = [
  { id: "stock", route: `${IN}`, label: "Stock", nav: "primary", icon: "box", permission: "any:read" },
  { id: "scan", route: `${IN}/scan`, label: "Scan", nav: "primary", icon: "search", permission: "any:read" },
  { id: "count", route: `${IN}/count`, label: "Count", nav: "primary", icon: "check", permission: "any:read" },
  { id: "work", route: `${IN}/work`, label: "Work", nav: "primary", icon: "list", permission: "any:read" },
  { id: "reports", route: `${IN}/reports`, label: "Reports", nav: "primary", icon: "chart", permission: "any:read" },
  { id: "thing", route: `${IN}/thing`, label: "A product", nav: "none", icon: "box", permission: "any:read" },
];

const CROWN = { appId: "inventory", appName: "OneInventory", appMark: "▣", tenantName: "Acme Corp" };

/**
 * ⚠️ THE SAME FIVE WITH WORDS THAT DO NOT FIT. Five destinations and a long name
 * is the case the bar's own header promises to degrade — "a shorter label rather
 * than a dropped destination or a bar that wraps" — and it is the case where a
 * clipping nav actually loses one. Without it the overflow assertion below is
 * satisfied by a bar that was never asked to overflow.
 */
const WORDY: readonly ScreenSpec[] = SCREENS.map((s) => (
  s.nav === "primary" ? { ...s, label: `${s.label} and everything in it` } : s));

const shown = async (here: string, screens: readonly ScreenSpec[] = SCREENS) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.setContent(
    `<!doctype html><html data-theme="dark"><head><style>${css}</style></head><body>`
    + html(
      <Shell screens={screens} here={here} held={new Set(["any:read"])} crown={CROWN} onGo={() => {}} />,
    )
    + "</body></html>",
  );
  const seen = await page.evaluate(() => {
    const bars = Array.prototype.slice.call(
      document.querySelectorAll('[data-island="true"]')) as HTMLElement[];
    const bar = bars.find((b) => b.getBoundingClientRect().width > 0);
    if (!bar) return null;
    const box = bar.getBoundingClientRect();
    const items = (Array.prototype.slice.call(bar.querySelectorAll("button")) as HTMLElement[])
      .map((b) => {
        const at = b.getBoundingClientRect();
        return {
          text: (b.textContent ?? "").trim(),
          here: b.getAttribute("data-here") === "true",
          /* ⚠️ Inside the bar's own box, which is the question a clipped nav
             answers wrongly — see the header. */
          within: at.left >= box.left - 1 && at.right <= box.right + 1,
        };
      });
    return { items, width: Math.round(box.width), scroll: Math.round(bar.scrollWidth) };
  });
  await page.close();
  return seen;
};

describe("the bar, at the addresses a deployment uses", () => {
  /*
    ⚠️ ONE LIT ITEM. `isUnder` was asked per row, and a product's ROOT is a
    prefix of every address inside it — so on `/inventory/count` both Stock and
    Count marked themselves, and both opened their labels.
  */
  it("lights the screen somebody is on, and only that one", async () => {
    const seen = await shown(`${IN}/count`);
    expect(seen).not.toBeNull();
    expect(seen!.items.filter((i) => i.here).map((i) => i.text)).toEqual(["Count"]);
  });

  /* ⚠️ Home is lit at the app's own root, which is the case the root-prefix bug
     made indistinguishable from every other. */
  it("lights home at the product's root", async () => {
    const seen = await shown(IN);
    expect(seen!.items.filter((i) => i.here).map((i) => i.text)).toEqual(["Stock"]);
  });

  /*
    ⚠️ AND A RECORD'S SCREEN HAS NO BAR AT ALL, which is the other half of the
    same walk. `screenFor` answers `thing` for `/inventory/thing/t-glove` — a
    screen somebody WENT to rather than one of the five — so the foot is its one
    act and the navigation stands down. Asserted here because the address that
    reaches it is the prefixed, deeper one no fixture drives.
  */
  it("draws no bar on a screen somebody went to", async () => {
    expect(await shown(`${IN}/thing/t-glove`)).toBeNull();
  });

  /*
    ⚠️ AND EVERY DESTINATION IS INSIDE THE BAR. Two open labels pushed the row
    past its own width, and the nav clipped — so the fifth destination was gone
    with nothing to see: five declared, four reachable. The clip is gone with the
    travel that needed it, but the row still has to fit, because a bar wider than
    the screen is the same destination lost one way or another.
  */
  it("never pushes a destination off its own edge", async () => {
    for (const here of [IN, `${IN}/count`, `${IN}/reports`]) {
      const seen = await shown(here);
      expect(seen!.items, `${here}: the bar drew ${seen!.items.length} of 5`).toHaveLength(5);
      expect(seen!.items.filter((i) => !i.within).map((i) => i.text),
        `${here}: pushed past the bar's own edge`).toEqual([]);
    }
  });

  /*
    ⚠️ AND A NAME THAT DOES NOT FIT SHORTENS, RATHER THAN COSTING A DESTINATION.
    The open item is the only one that can grow, so it is the only one that can
    push the row past the bar.
  */
  it("shortens a long name rather than losing a destination", async () => {
    for (const here of [IN, `${IN}/count`, `${IN}/reports`]) {
      const seen = await shown(here, WORDY);
      expect(seen!.items, `${here}: the bar drew ${seen!.items.length} of 5`).toHaveLength(5);
      expect(seen!.items.filter((i) => !i.within).map((i) => i.text),
        `${here}: pushed past the bar's own edge`).toEqual([]);
      expect(seen!.scroll, `${here}: the row is wider than the bar that clips it`)
        .toBeLessThanOrEqual(seen!.width + 1);
    }
  });

  /*
    ⚠️ THE FOOT IS SOLID WHERE THE CONTROLS ARE, AND ITS FALLOFF IS TOO GENTLE TO
    FIND. Two shapes were shipped and both were wrong, in opposite directions: a
    76px flat part with a 56px fade read as a slab with a soft lip, because the
    fade's own top was findable; removing the flat part cured the edge and left
    the veil at 80% behind the nav, so a card's text read through the glyphs
    sitting on it. A photographic vignette is solid at the frame's edge too, so
    the solid part is not the fault.

    ⚠️ AND THREE THINGS ARE WANTED THAT CANNOT ALL BE HAD, WHICH IS WHY THE
    BOUND HERE IS A LENGTH AGAIN AFTER TWICE BEING SOMETHING CLEVERER. The veil
    is opaque behind the controls (legibility, not taste); it arrives at nothing
    (or it is a bar); and it is short. Fix the first two and the steepness is
    ARITHMETIC — a smoothstep from 100 to 0 peaks at `1.5 / length` — so a bound
    on the slope and a bound on the length are the same bound written twice, and
    the slope version reads as a perceptual law while being a length in disguise.

    ⚠️ TWO EARLIER SHAPES OF THIS BOUND ARE WORTH KNOWING BEFORE MOVING IT AGAIN.
    A ratio (fade ≥ 1.8× hold) blocked the first real request to shorten the
    vignette by leaving only the SOLID part free, which is the half set by
    legibility. Then `fade ≥ hold` plus 2%/px: the first compares what a person
    sees to what the controls hide, and the second was fitted BETWEEN TWO
    SAMPLES — 1.7 passing, 2.7 refused — rather than measured against an eye, and
    it forbids every fade under 75px, which is a 13px cut off 88 and no answer at
    all to a vignette somebody has looked at and called long.

    ⚠️ SO THE FLOOR IS WHAT THE HEM IS FOR: A LINE OF TEXT DISSOLVES OVER MORE
    THAN ITS OWN HEIGHT. Content does not stop at a floating bar — it arrives at
    the control's edge and is SLICED by it, and a fade shorter than a line is a
    slice with a soft edge, because the top of a line and the bottom of it are
    then at very different strengths. `text-base leading-relaxed` is 26px, the
    floor is one and a half of those, and the falloff is 44px — 1.7 lines.

    ⚠️ AND BANDING IS ANSWERED SOMEWHERE ELSE, ON PURPOSE. A short gradient bands
    LESS, not more: quantisation shows where a step spans several pixels, which
    is the long case. What a short one risks is the JOINS between its stops, and
    `scene.test.ts` measures those off the emitted gradient at both ends. Neither
    question belongs to the other, and folding them into one number is how the
    length came to be defended by an argument about banding.
  */
  it("hems solid behind the controls, and fades too gently to find", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(
      `<!doctype html><html data-theme="dark"><head><style>${css}</style></head><body>`
      + html(
        <Shell screens={SCREENS} here={IN} held={new Set(["any:read"])} crown={CROWN} onGo={() => {}} />,
      )
      + "</body></html>",
    );
    const stops = await page.evaluate(() => {
      const el = document.querySelector('[data-hem="bottom"]');
      if (!el) return null;
      const style = getComputedStyle(el, "::before");
      /* ⚠️ QUOTED FROM THE SCREEN'S EDGE, NOT THE LAYER'S. The layer overshoots
         the edge it hems — a stop out there paints nothing, and counting it
         makes the solid part measure longer than it looks by exactly the
         overshoot. Every number below is what a person is looking at. */
      const out = Math.abs(parseFloat(style.bottom) || 0);
      return (style.backgroundImage.match(/oklab\([^)]*\)\s+[\d.]+px/g) ?? []).map((one) => ({
        alpha: /\/\s*([\d.]+)\)/.exec(one) ? Number(/\/\s*([\d.]+)\)/.exec(one)![1]) : 1,
        at: Math.max(0, Number(/([\d.]+)px/.exec(one)![1]) - out),
      }));
    });
    await page.close();
    expect(stops, "no bottom hem is painted at all").not.toBeNull();

    /* ⚠️ THE NAV'S OWN CONTROLS TOP OUT 64px FROM THE FOOT — measured. Anything
       less than solid there is content read through a glyph. */
    const behind = stops!.filter((s) => s.at <= 64);
    expect(behind.every((s) => s.alpha > 0.99),
      "the veil is not solid where the nav's controls sit").toBe(true);

    /* ⚠️ AND A LINE OF TEXT TAKES MORE THAN ITS OWN HEIGHT TO DISSOLVE. That is
       the whole job: content arrives at a floating control's edge and is SLICED
       by it, and a falloff shorter than a line is a slice with a soft edge —
       the top of a line at full strength and the bottom of it at nothing. One
       and a half lines is the floor; below it the two ends of one word are at
       visibly different strengths. `text-base leading-relaxed` is 26px. */
    const LINE = 26;
    const held = Math.max(...stops!.filter((s) => s.alpha > 0.99).map((s) => s.at));
    const run = Math.max(...stops!.map((s) => s.at));
    expect(run - held, `holds ${held}px and fades ${(run - held).toFixed(0)} — `
      + `under ${1.5 * LINE}px a line of text is sliced rather than dissolved, whatever `
      + "the softness of the cut").toBeGreaterThanOrEqual(1.5 * LINE);

    expect(stops!.at(-1)!.alpha, "the veil never reaches nothing").toBe(0);
  });

  /*
    ⚠️ AND THE HEAD AND THE FOOT ARE ONE SHAPE. They were measured separately —
    the crown's controls end 3.375rem down, the nav's begin 4rem up — which is
    ten pixels of real difference and none anybody can see, bought at the price
    of two numbers that had to be tuned in step and never were. A screen whose
    two ends are the same idea at two strengths is what "it does not look like
    the header" actually means.

    ⚠️ MEASURED FROM THE SCREEN'S EDGE, NOT FROM THE LAYER'S. The two layers do
    not start in the same place and must not: the crown is `sticky top-0` inside
    a scroller and sits at its FLOW position, so its hem overshoots upward to
    close the strip of world that showed above it, while the nav already reaches
    the foot and an overshoot there would only move the gradient's origin
    off-screen. Comparing the raw stops makes that difference look like drift and
    makes closing the strip look like a regression; offsetting each list by its
    own layer's inset compares what a person is actually looking at.
  */
  it("hems its head and its foot with the same shape", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(
      `<!doctype html><html data-theme="dark"><head><style>${css}</style></head><body>`
      + html(
        <Shell screens={SCREENS} here={IN} held={new Set(["any:read"])} crown={CROWN} onGo={() => {}} />,
      )
      + "</body></html>",
    );
    const both = await page.evaluate(() => {
      const read = (edge: string) => {
        const el = document.querySelector(`[data-hem="${edge}"]`);
        if (!el) return null;
        const style = getComputedStyle(el, "::before");
        /* ⚠️ The gradient's origin is the layer's own edge, and the layer may sit
           outside the screen — so every stop is quoted from the SCREEN's edge. */
        const out = Math.abs(parseFloat(style[edge as "top" | "bottom"]) || 0);
        return (style.backgroundImage.match(/oklab\([^)]*\)\s+[\d.]+px/g) ?? []).map((one) => {
          const a = /\/\s*([\d.]+)\)/.exec(one);
          /* ⚠️ Clamped at the screen's edge, because a stop beyond it paints
             nothing: an overshoot is solid gradient held off-screen, and the
             shape a person sees begins where the screen does. */
          const at = Math.max(0, Number(/([\d.]+)px/.exec(one)![1]) - out);
          return `${a ? a[1] : "1"}@${Math.round(at)}`;
        }).join(" ");
      };
      return { top: read("top"), bottom: read("bottom") };
    });
    await page.close();
    expect(both.top, "no top hem is painted").not.toBeNull();
    expect(both.bottom, "the two ends of one screen are different shapes").toBe(both.top);
  });


  /*
    ⚠️ AND THE BAR DOES NOT HIDE ITSELF. It used to translate out on the way down
    and back on the way up; the crown never did, and two ends of one screen
    behaving differently is the thing a person notices. The hem is what handles
    content arriving at a control, at both ends — a bar that also leaves is a
    second answer to a question already answered, and it took the page's own
    height with it every time it moved.
  */
  it("stays put, the way the crown does", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(
      `<!doctype html><html data-theme="dark"><head><style>${css}</style></head><body>`
      + html(
        <Shell screens={SCREENS} here={IN} held={new Set(["any:read"])} crown={CROWN} onGo={() => {}} />,
      )
      + "</body></html>",
    );
    const moved = await page.evaluate(() => {
      const bar = Array.prototype.slice.call(
        document.querySelectorAll('[data-island="true"]')) as HTMLElement[];
      const foot = bar.find((b) => b.getBoundingClientRect().width > 0);
      const nav = foot?.closest("nav") as HTMLElement | null;
      return {
        /* ⚠️ Both, because the travel lived on the bar and the clip that served
           it lived on the nav around it. */
        transform: foot ? getComputedStyle(foot).transform : null,
        clip: nav ? getComputedStyle(nav).overflow : null,
      };
    });
    await page.close();
    expect(moved.transform, "the bar is transformed — it still leaves").toBe("none");
    expect(moved.clip, "the nav still clips, so it can still lose a destination")
      .toBe("visible");
  });
});