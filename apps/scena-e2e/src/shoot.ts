/**
 * TAKING THE PICTURE.
 *
 * Every image the design review, the docs and any marketing page use is produced
 * here, which means the same three problems get solved once:
 *
 *   STILLNESS   the dashboard's entrance choreography staggers content in over
 *               a few hundred ms. A screenshot taken during it catches
 *               half-faded rows — and catches them DIFFERENTLY every run, so the
 *               images churn without anything having changed.
 *   SETTLEMENT  data arrives after the first paint, and several of Scena's
 *               screens POLL. A shot of a skeleton is a shot of the loading
 *               state, taken by accident; a shot of a two-second poll's first
 *               frame is a shot of an empty workspace that is not empty.
 *   HONESTY     nothing is hidden, moved or restyled to flatter the frame. If a
 *               row wraps badly the picture shows it wrapping badly — that is
 *               the entire reason the suite exists.
 *
 * The first two are handled by killing animation and waiting for a named
 * element. The third is a rule, and the only thing this module does to the page
 * is stop it moving.
 *
 * This is Kova's `apps/e2e/src/shoot.ts` idea, deliberately COPIED rather than
 * shared: the two suites are separate packages with separate configs, and a
 * shared screenshot helper would be a fifteenth package earning its keep on
 * eighty lines. What matters is that both obey the same three rules, and the
 * rules are stated in both files.
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
  /** Extra settle time in ms, for a surface that animates its own content in. */
  settle?: number;
}

/**
 * Freeze the page and write `<shots-out>/<project>/<name>.png`.
 *
 * `name` is the STABLE ID of the shot: anything that references an image
 * references this string, so renaming one is a content change, not a refactor.
 */
export async function shoot(page: Page, project: string, name: string, opts: ShotOptions = {}): Promise<string> {
  await freeze(page);
  if (opts.ready) await expect(opts.ready).toBeVisible({ timeout: 30_000 });
  // Fonts, because a shot taken mid-swap is set in the fallback face — which
  // changes every metric on the page and makes the image useless for judging
  // spacing, the thing it is most often used to judge.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(opts.settle ?? 300);

  const file = join(SHOTS_DIR, project, `${name}.png`);
  await mkdir(dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: opts.full ?? false, animations: "disabled", scale: "css" });
  return file;
}

/**
 * Go to a screen and wait for it to have actually arrived.
 *
 * `ready` is not optional here on purpose. Scena's screens poll, and several of
 * them render an empty state on the first tick — navigating and shooting
 * immediately produces a convincing photograph of "no boards yet" over a
 * workspace with three.
 *
 * A generous timeout, because every visit is a FULL PAGE LOAD. The sweep
 * deep-links each screen by URL rather than clicking through the nav — a click
 * that silently missed would photograph the previous screen under the next
 * one's name — so each one re-boots the SPA, re-resolves the session and
 * re-fetches, with two players holding WebSockets alongside.
 *
 * ⚠️ AND `getByRole(..., { name })` IS A SUBSTRING MATCH BY DEFAULT. Pass
 * `exact: true` for any heading whose words recur further down the page.
 * `{ name: "Alerts" }` also matched the "Recent alerts" section heading, and two
 * matches is a strict-mode violation that surfaces here as an ordinary timeout —
 * "the heading never appeared", on a page whose own failure snapshot showed the
 * heading, twice, in plain sight. Raising the timeout does not fix it and
 * spending two runs proving that is how this note came to be written.
 */
export async function visit(page: Page, url: string, ready: Locator): Promise<void> {
  await page.goto(url);
  await expect(ready).toBeVisible({ timeout: 90_000 });
}

/**
 * Stop everything that moves.
 *
 * `animations: "disabled"` in `screenshot()` handles CSS animations and
 * transitions, but not JS-driven motion and not the caret. So: the browser's own
 * reduced-motion preference is turned on — a real supported mode rather than a
 * screenshot hack, so what is photographed is a state the product genuinely
 * serves — and the caret is made transparent, because a blinking cursor lands in
 * half the images and in none of the others.
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
    `,
  });
}
