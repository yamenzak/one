/**
 * TAKING THE PICTURE.
 *
 * Every image the marketing site, the Help Center and the design review use is
 * produced here, which means the same three problems have to be solved once:
 *
 *   STILLNESS   the app's entrance choreography (UI-LANGUAGE §8) staggers
 *               content in over ~400ms. A screenshot taken during it catches
 *               half-faded rows, and — worse — catches them DIFFERENTLY every
 *               run, so the images churn without anything having changed.
 *   SETTLEMENT  data arrives after the first paint. A shot of a skeleton is a
 *               shot of the loading state, taken by accident.
 *   HONESTY     nothing is hidden, moved or restyled to flatter the frame. If a
 *               row wraps badly, the picture shows it wrapping badly — that is
 *               the entire reason the suite exists.
 *
 * The first two are handled by killing animation and waiting for a named
 * element. The third is a rule, and the only thing this module does to the page
 * is stop it moving.
 */

import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";

/** Where the images land. Gitignored: they are an output, regenerated on demand. */
export const SHOTS_DIR = new URL("../shots-out/", import.meta.url).pathname;

export interface ShotOptions {
  /** Wait for this to be visible before the shutter. The single most important
   *  option here: without it the picture is of whatever had arrived by then. */
  ready?: Locator;
  /** Capture the whole scroll height rather than the viewport. Documentation
   *  usually wants the whole thing; marketing usually wants the device frame. */
  full?: boolean;
  /** Extra settle time in ms, for a surface that animates its own content in
   *  (a chart drawing its path, a ring filling). */
  settle?: number;
}

/**
 * Freeze the page and write `<shots-out>/<project>/<name>.png`.
 *
 * `name` is the STABLE ID of the shot: docs and the marketing site reference it,
 * so renaming one is a content change, not a refactor.
 */
export async function shoot(page: Page, project: string, name: string, opts: ShotOptions = {}): Promise<string> {
  await freeze(page);
  if (opts.ready) await expect(opts.ready).toBeVisible({ timeout: 30_000 });
  // Fonts, because a shot taken mid-swap is set in the fallback face — which
  // changes every metric on the page and makes the image useless for judging
  // spacing, the thing it is most often used to judge.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(opts.settle ?? 250);

  const file = join(SHOTS_DIR, project, `${name}.png`);
  await mkdir(dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: opts.full ?? false, animations: "disabled", scale: "css" });
  return file;
}

/**
 * Stop everything that moves.
 *
 * `animations: "disabled"` in `screenshot()` handles CSS animations and
 * transitions, but not JS-driven motion (the entrance choreography is `motion`,
 * i.e. rAF) and not the caret. So: the app's own reduced-motion path is turned
 * on — which is a real supported mode rather than a screenshot hack, so what is
 * photographed is a state the product genuinely serves — and the caret is made
 * transparent, because a blinking cursor in a text field lands in half the
 * images and in none of the others.
 */
async function freeze(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
      * { caret-color: transparent !important; }
      /* The boot progress bar is an indefinite loop by design (it is honest
         about not knowing how long it will take) and would otherwise be caught
         at a different x-position in every run. */
      [data-boot-progress] { visibility: hidden !important; }
    `,
  });
}

/**
 * Go to a screen and wait for it to be the screen.
 *
 * `networkidle` alone is not enough: the app renders its shell first and fills
 * it from several requests, so "idle" can land on a fully-drawn skeleton.
 */
export async function visit(page: Page, url: string, ready?: Locator): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  if (ready) await expect(ready).toBeVisible({ timeout: 30_000 });
}
