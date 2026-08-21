/**
 * WHAT A SCREEN ACTUALLY MEASURES, IN A BROWSER — the harness every app uses.
 *
 * ⚠️ SPACING IS THE ONE RULE NO STATIC CHECK CAN SEE. Every guard in this
 * repository reads source: which class was written, which component was
 * composed, which attribute was stamped. None of them can answer "how far is
 * this heading from the card above it", because the answer is a computed value
 * produced by a stylesheet, a flex container, a line-height and four components
 * that each did something reasonable. That is exactly the class of fault this
 * product keeps shipping — sections that run together, a card whose first row
 * sits twice as far down as every other card's — and it is why it keeps coming
 * back after being fixed one instance at a time.
 *
 * ⚠️ SO THE HARNESS RENDERS AND MEASURES. Real markup, the real built
 * stylesheet, real Chromium, at a real phone width — and the assertions are
 * about PIXELS. A screen cannot compose its way out of a rule expressed in the
 * geometry it produces.
 *
 * ⚠️ IT USES THE BUILT STYLESHEET RATHER THAN COMPILING ONE. Tailwind emits only
 * the classes it finds written down, so a stylesheet compiled for the harness
 * would be a different stylesheet from the one that ships — and a spacing rule
 * verified against CSS nobody serves is worth nothing. `dist/assets/index-*.css`
 * is what the browser gets.
 *
 * ⚠️ AND IT IS A `.tsx` RATHER THAN A `.mjs` BECAUSE IT COMPOSES REAL
 * COMPONENTS. A specimen assembled out of hand-written HTML would measure the
 * harness's idea of a card. What is under test is `Group`, `Section`, `Screen`
 * and `Stack` as a screen actually uses them.
 *
 * ⚠️ IT IS IN `src` RATHER THAN IN THIS PACKAGE'S OWN `test` BECAUSE A PRODUCT
 * HAS TO BE ABLE TO POINT IT AT ITS OWN SCREENS. Measured only against library
 * specimens, every rule here is verified on the arrangement that was built to
 * pass it — and the screens somebody actually opens are exactly what nothing
 * looks at. A second copy in each app would be a second answer to which
 * stylesheet ships.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import type { Browser } from "playwright";
import type { ReactNode } from "react";

const HERE = dirname(fileURLToPath(import.meta.url));
const SPA = join(HERE, "..", "..", "..", "one-space", "dist", "assets");

/**
 * ⚠️ THE PHONE, BECAUSE THAT IS WHERE THE COMPLAINTS COME FROM. Every screenshot
 * that has ever been sent about spacing in this product was taken on a phone, and
 * a rhythm that reads on a desktop can be two blocks touching at 390.
 */
export const PHONE = { width: 390, height: 844, deviceScaleFactor: 1 } as const;

/**
 * ⚠️ AND THE DESK, BECAUSE THE TWO FAIL DIFFERENTLY. A phone catches blocks that
 * run together and a row that wraps into three lines; a wide viewport catches a
 * table that pushes the page sideways and a column that stretches to eleven
 * hundred pixels of prose. Neither width finds the other's fault.
 */
export const DESK = { width: 1280, height: 900, deviceScaleFactor: 1 } as const;

/** ⚠️ Absent is a build that has not run — a harness measuring nothing must say so. */
export const stylesheet = (): string => {
  const css = readdirSync(SPA).filter((f) => f.startsWith("index-") && f.endsWith(".css"));
  if (css.length !== 1) {
    throw new Error(
      `expected exactly one built stylesheet in ${SPA}, found ${css.length}. `
      + `Run \`pnpm --filter @engine/space build\` — the harness measures the CSS that ships, `
      + `not one compiled for itself.`);
  }
  return readFileSync(join(SPA, css[0]!), "utf8");
};

/**
 * ⚠️ THE THEME IS STAMPED, because `data-theme` is what selects dark and nothing
 * in a server-rendered fragment stamps it. Measured undressed, every token falls
 * back and the numbers are a different product's.
 */
export const pageFor = (markup: string, css: string): string =>
  `<!doctype html><html data-theme="dark"><head><meta charset="utf-8">`
  + `<style>${css}</style>`
  + `<style>html,body{margin:0;padding:0}</style>`
  + `</head><body>${markup}</body></html>`;

export const html = (node: ReactNode): string => renderToStaticMarkup(node);

/* ------------------------------------------------------------- what it is --- */

/**
 * ⚠️ 44 PIXELS, WHICH IS THE SMALLEST BOX A FINGER RELIABLY HITS — and the
 * number `ROW.tap`'s paragraph already calls non-negotiable. It is a floor on a
 * mouse too: a 32px control is one people miss on a laptop.
 */
export const FINGER = 44;

/** What one render of one screen, at one width, actually laid out. */
export interface Geometry {
  /** How far the document can be scrolled sideways. Anything over zero is a bug. */
  readonly spill: number;
  /** The widest thing that stuck out, and what it said — so a failure names it. */
  readonly worst: { readonly tag: string; readonly right: number; readonly text: string } | null;
  /** Every control somebody has to hit, with the box they have to hit it in. */
  readonly targets: readonly {
    readonly text: string; readonly width: number; readonly height: number;
    /** ⚠️ What the library calls it — see `tooSmall` for the one thing it is for. */
    readonly kind: string;
  }[];
}

/**
 * ⚠️ THE ONE EXEMPTION, AND IT IS WRITTEN DOWN RATHER THAN QUIET. A tag's remove
 * cross is 12px and a search field's clear is 20px, both INSIDE a control that
 * is itself a target: the chip is what a finger goes for and the cross is the
 * precise second half of it. Raising them to 44 would resize every chip in every
 * product — the glyph is the chip's height — and the correct fix is a hit area
 * larger than the glyph, which is a design decision about which of two nested
 * targets wins rather than a number.
 *
 * ⚠️ IT CAN ONLY SHRINK. An entry that stops appearing is an entry to delete; a
 * new one is a decision somebody makes here, in review, rather than a control
 * that quietly slipped under the floor.
 */
export const INSIDE_A_CONTROL = ["tag__remove-button", "search-field__clear-button"];

/**
 * ⚠️ ONE ANSWER TO "IS THIS BIG ENOUGH", SO TWO PRODUCTS CANNOT DISAGREE. An
 * app applying the floor itself would also have to carry the exemption, and the
 * first one to forget reports a screen full of faults nobody can act on.
 */
export const tooSmall = (targets: Geometry["targets"]): Geometry["targets"] =>
  targets.filter((t) => t.height < FINGER
    && !INSIDE_A_CONTROL.some((one) => t.kind.includes(one)));

/**
 * WHAT A SCREEN LAID OUT, AT ONE WIDTH.
 *
 * ⚠️ ONE FUNCTION FOR EVERY PRODUCT, BECAUSE THE QUESTION IS THE SAME ONE. A
 * copy per app is a second answer to what counts as off-canvas — and the
 * exemptions below are the whole subtlety: a screen-reader-only label lives
 * outside the viewport on purpose, and a table inside its own scroller is the
 * correct answer rather than a fault. An app deciding those for itself gets one
 * of them wrong and reports green.
 *
 * ⚠️ AND IT MEASURES AFTER A FRAME. Fonts and the ambience layer both move
 * geometry; a number taken straight after `setContent` is one that happens to be
 * right on a fast machine.
 */
export async function geometryOf(
  browser: Browser, node: ReactNode, css: string,
  viewport: { width: number; height: number },
): Promise<Geometry> {
  const page = await browser.newPage({ viewport });
  try {
    await page.setContent(pageFor(html(node), css));
    await page.evaluate(() => new Promise((go) => requestAnimationFrame(() => go(null))));
    return await page.evaluate((width) => {
      const spill = Math.max(0, document.documentElement.scrollWidth - width);
      let worst: { tag: string; right: number; text: string } | null = null;
      for (const el of Array.prototype.slice.call(document.querySelectorAll("body *")) as Element[]) {
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        const style = getComputedStyle(el);
        /* Deliberately outside the page: a fixed dock, a hidden thing, an
           sr-only label clipped to a pixel. None of them is off-canvas. */
        if (style.position === "fixed" || style.visibility === "hidden") continue;
        if (style.clipPath && style.clipPath !== "none") continue;
        /* Wide content inside its own scroller is the correct answer. */
        let scrolls = false;
        for (let up = el.parentElement; up; up = up.parentElement) {
          const how = getComputedStyle(up).overflowX;
          if (how === "auto" || how === "scroll" || how === "hidden") { scrolls = true; break; }
        }
        if (scrolls) continue;
        if (box.right > width + 1 && (!worst || box.right > worst.right)) {
          worst = {
            tag: el.tagName.toLowerCase(),
            right: Math.round(box.right),
            text: (el.textContent ?? "").trim().slice(0, 40),
          };
        }
      }
      const targets = (Array.prototype.slice.call(
        document.querySelectorAll("button, a[href], [role='button']")) as Element[])
        .map((el) => {
          const box = el.getBoundingClientRect();
          return {
            text: (el.textContent ?? "").trim().slice(0, 30) || el.tagName.toLowerCase(),
            width: Math.round(box.width),
            height: Math.round(box.height),
            kind: typeof el.className === "string" ? el.className : "",
          };
        })
        .filter((t) => t.width > 0 && t.height > 0);
      return { spill, worst, targets };
    }, viewport.width);
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------- when it is --- */

/**
 * WAIT UNTIL A THING HAS STOPPED MOVING, RATHER THAN FOR A NUMBER OF
 * MILLISECONDS.
 *
 * ⚠️ A `waitForTimeout` IS A GUESS ABOUT A MACHINE, AND IT IS WRONG UNDER LOAD.
 * "Sleep 500ms, the sheet will have arrived" holds until something else is using
 * the processor — and then the sheet is measured mid-slide, at a position it
 * never rests in, and the failure is about the runner rather than the product.
 * That is the flake this repository already refuses to answer with `retry`:
 * a retry is what a suite has instead of isolation, and for a moving thing
 * isolation means waiting for the MOTION rather than for the clock.
 *
 * ⚠️ TWO AGREEING FRAMES, NOT ONE. A single sample can land on the pause between
 * two stages of a sequence; two consecutive frames at the same position is the
 * cheapest reading of "it has settled" that a stage boundary cannot pass.
 */
export async function stillness(
  page: { evaluate: <T>(fn: (arg: string) => T, arg: string) => Promise<T> },
  selector: string,
  patience = 5_000,
): Promise<void> {
  const settled = await page.evaluate((sel: string) => new Promise<boolean>((done) => {
    const of = () => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return `${Math.round(r.top)}:${Math.round(r.left)}:${Math.round(r.width)}:${Math.round(r.height)}`;
    };
    let last: string | null = null;
    let same = 0;
    const started = Date.now();
    const tick = () => {
      const now = of();
      if (now !== null && now === last) same += 1; else same = 0;
      last = now;
      if (same >= 2) { done(true); return; }
      if (Date.now() - started > 5_000) { done(false); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), selector);
  if (!settled) throw new Error(`${selector} never stopped moving within ${patience}ms`);
}
