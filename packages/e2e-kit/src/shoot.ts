/**
 * TAKING THE PICTURE — once, for every app.
 *
 * This existed twice, in `apps/e2e/src` and `apps/scena-e2e/src`, and Tessa was
 * about to make it three. The two copies had already drifted: one settled for
 * 250ms and the other 300, one waited for `networkidle` and the other did not,
 * and only one hid the boot progress bar — so images from two products in one
 * design system were taken under two different disciplines. Which is the same
 * failure the whole UI-unification pass is about, in the tool that is supposed
 * to be checking for it.
 *
 * Every image the marketing site, the Help Center and the design review use is
 * produced here, which means the same three problems get solved once:
 *
 *   STILLNESS   the entrance choreography (UI-LANGUAGE §8) staggers content in
 *               over a few hundred ms. A screenshot taken during it catches
 *               half-faded rows, and — worse — catches them DIFFERENTLY every
 *               run, so the images churn without anything having changed.
 *   SETTLEMENT  data arrives after the first paint, and several screens POLL. A
 *               shot of a skeleton is a shot of the loading state, by accident.
 *   HONESTY     nothing is hidden, moved or restyled to flatter the frame. If a
 *               row wraps badly, the picture shows it wrapping badly — that is
 *               the entire reason these suites exist.
 *
 * The first two are handled by killing animation and waiting for a named
 * element. The third is a rule, and the only thing this module does to the page
 * is stop it moving.
 */

import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";

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
 * Freeze the page and write `<dir>/<project>/<name>.png`.
 *
 * `name` is the STABLE ID of the shot: docs and the marketing site reference it,
 * so renaming one is a content change, not a refactor. `dir` is the app's own
 * output directory — the ids are per-product and must not collide.
 */
export async function shoot(page: Page, dir: string, project: string, name: string, opts: ShotOptions = {}): Promise<string> {
  await freeze(page);
  if (opts.ready) await expect(opts.ready).toBeVisible({ timeout: 30_000 });
  // Fonts, because a shot taken mid-swap is set in the fallback face — which
  // changes every metric on the page and makes the image useless for judging
  // spacing, the thing it is most often used to judge.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(opts.settle ?? 300);

  const file = join(dir, project, `${name}.png`);
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
export async function freeze(page: Page): Promise<void> {
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
      /* An indefinite progress bar is an honest design — it does not know how
         long it will take — and would otherwise be caught at a different
         x-position in every run. Kova had this; Scena's copy did not, which is
         exactly the drift that motivated one module. */
      [data-boot-progress] { visibility: hidden !important; }
    `,
  });
}

/**
 * Go to a screen and wait for it to be the screen.
 *
 * `networkidle` alone is not enough: an app renders its shell first and fills it
 * from several requests, so "idle" can land on a fully-drawn skeleton. It is
 * also not always REACHED — a screen that polls never goes idle — so the wait is
 * best-effort and the named element is what actually decides.
 */
export async function visit(page: Page, url: string, ready?: Locator, timeout = 30_000): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  if (ready) await expect(ready).toBeVisible({ timeout });
}
