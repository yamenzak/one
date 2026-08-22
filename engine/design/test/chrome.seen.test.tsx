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
 * `overflow-clip` bar is not, and neither is a hem whose opaque part is a
 * seventy-six pixel slab. Rendered to a string, all three are invisible.
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
    ⚠️ AND EVERY DESTINATION IS INSIDE THE BAR. The nav is `overflow-clip` — it
    has to be, or the bar's leaving transform makes the document taller — so a
    row that does not fit does not wrap or scroll, it silently loses whatever
    falls off the right edge. Two open labels was enough: five declared
    destinations, four reachable, nothing to see.
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
    push the row past the bar — and the nav clips, so what it pushes out is gone
    with nothing to see.
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
    ⚠️ THE FOOT IS SOLID WHERE THE CONTROLS ARE, AND THE FALLOFF IS TWICE THAT
    AGAIN. Two shapes were shipped and both were wrong, in opposite directions:
    a 76px flat part with a 56px fade read as a slab with a soft lip, because the
    fade's own top was findable; removing the flat part cured the edge and left
    the veil at 80% behind the nav, so a card's text read through the glyphs
    sitting on it. What stops a vignette reading as a panel is the RATIO, not the
    absence of a solid part — a photographic one is solid at the frame's edge too.
  */
  it("hems solid behind the controls, and fades far longer than it holds", async () => {
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
      const image = getComputedStyle(el, "::before").backgroundImage;
      return (image.match(/oklab\([^)]*\)\s+[\d.]+px/g) ?? []).map((one) => ({
        alpha: /\/\s*([\d.]+)\)/.exec(one) ? Number(/\/\s*([\d.]+)\)/.exec(one)![1]) : 1,
        at: Number(/([\d.]+)px/.exec(one)![1]),
      }));
    });
    await page.close();
    expect(stops, "no bottom hem is painted at all").not.toBeNull();

    /* ⚠️ THE NAV'S OWN CONTROLS TOP OUT 64px FROM THE FOOT — measured. Anything
       less than solid there is content read through a glyph. */
    const behind = stops!.filter((s) => s.at <= 64);
    expect(behind.every((s) => s.alpha > 0.99),
      "the veil is not solid where the nav's controls sit").toBe(true);

    /* ⚠️ AND THE FADE IS LONGER THAN THE SOLID PART, WHICH IS WHAT STOPS IT
       READING AS A PANEL WITH A SOFT EDGE. */
    const held = Math.max(...stops!.filter((s) => s.alpha > 0.99).map((s) => s.at));
    const run = Math.max(...stops!.map((s) => s.at));
    expect(run - held, `holds ${held}px and fades ${run - held} — a fade no longer `
      + "than the hold is a slab with a lip").toBeGreaterThanOrEqual(held * 1.8);

    /* ⚠️ AND NO STEP BIG ENOUGH TO SHOW ITS OWN JOIN. The eye finds a break in a
       gradient's SLOPE long before it finds one in its value. */
    const steps = stops!.slice(1).map((s, i) => Math.abs(s.alpha - stops![i]!.alpha));
    expect(Math.round(Math.max(...steps) * 100),
      "one stop jumps far enough from its neighbour to draw a line").toBeLessThanOrEqual(20);

    expect(stops!.at(-1)!.alpha, "the veil never reaches nothing").toBe(0);
  });
});

/**
 * A SURFACE PRESENTED OVER A PRODUCT IS STILL A PAGE, AND A PAGE SCROLLS.
 *
 * ⚠️ `scroll="inside"` PUTS THE OVERFLOW ON `Modal.Body`, AND `Over` RENDERED
 * NONE. The dialog it gives `overflow-clip` and a height capped at the viewport,
 * so the account centre showed as much as fitted and clipped the rest: the last
 * row faded under a hard edge and nothing moved. Every other lane was green,
 * because the markup was complete — only the box around it was wrong.
 *
 * ⚠️ AND THE FRAME'S THREE SCROLL READINGS WENT WITH IT. The hem's strength, the
 * crown's collapse and the nav's leaving each read `window.scrollY`, which
 * inside a presented surface is 0 for ever. Three features that looked separately
 * missing, one cause.
 */
describe("a surface presented over a product", () => {
  it("scrolls, rather than clipping what does not fit", async () => {
    const code = await mounted(join(HERE, "mount", "over.tsx"));
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(
      `<!doctype html><html data-theme="dark"><head><style>${css}</style></head>`
      + `<body><div id="root"></div><script type="module">${code}</script></body></html>`,
    );
    await page.waitForFunction(
      () => (document.body.textContent ?? "").includes("Row 40"), undefined, { timeout: 20_000 });
    const seen = await page.evaluate(() => {
      const all = Array.prototype.slice.call(document.querySelectorAll("*")) as HTMLElement[];
      /* ⚠️ The one element that can actually take the content, whatever it is —
         asked of the DOM rather than of a class name, so the answer survives the
         library renaming its own parts. */
      const scrollers = all.filter((el) => {
        const how = getComputedStyle(el).overflowY;
        return (how === "auto" || how === "scroll") && el.scrollHeight > el.clientHeight + 1;
      });
      return { reach: scrollers.map((el) => el.scrollHeight - el.clientHeight) };
    });
    await page.close();
    /* ⚠️ AND IT REACHES THE END. A scroller a pixel deep is still a clip. */
    expect(seen.reach.length, "nothing inside the surface can scroll — the rest is clipped")
      .toBeGreaterThan(0);
    expect(Math.max(...seen.reach), "the scroller cannot reach the content below it")
      .toBeGreaterThan(400);
  }, 180_000);
});
