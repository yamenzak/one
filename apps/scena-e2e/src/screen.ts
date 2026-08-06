/**
 * BOOTING A SCREEN — the real player, on the real device door.
 *
 * Shared by the wall spec and the screenshot suite because the two subtleties
 * below are not obvious from either call site, and a copy of this that quietly
 * lost one would fail somewhere else entirely.
 */

import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { PLAYER_URL } from "./env.js";

export interface BootedScreen {
  context: BrowserContext;
  page: Page;
  /** The pairing code the device is showing, ready for `/api/pair/claim`. */
  code: string;
}

/**
 * Open a player in its OWN context and wait for its pairing code.
 *
 * ⚠️ A PLAIN CONTEXT, NOT `newParty`. That helper adds a `cf-connecting-ip`
 * header so each signing-in PERSON spends their own OTP budget — and a screen is
 * not a person. Worse, it breaks them: the player's reservation is a
 * cross-origin POST with no custom headers, i.e. a SIMPLE request that needs no
 * preflight, and adding one header turns it into a preflighted one. The worker's
 * CORS allows `content-type` and nothing else, so the preflight is refused and
 * the player renders "offline — no cached channel yet" with nothing in the log
 * that looks like a failure.
 *
 * ⚠️ ONE CONTEXT PER SCREEN. The reservation lives in `localStorage`; two screens
 * sharing a context would be one screen with two windows, which is not what a
 * video wall is.
 */
export async function bootScreen(browser: Browser): Promise<BootedScreen> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(PLAYER_URL);
  // The code is persisted as soon as the DO hands one over, and reading it from
  // storage rather than off the screen is deliberate: the pairing screen draws
  // each character in its own animated tile, so scraping it would couple every
  // caller to a presentation choice.
  await expect
    .poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("scena.screen") ?? "{}")?.code ?? ""), {
      timeout: 60_000,
      message: "the player never reserved a screen (is the API base right?)",
    })
    .toMatch(/^[A-Z0-9]{4,8}$/);
  const code = await page.evaluate(() => String(JSON.parse(localStorage.getItem("scena.screen") ?? "{}").code));
  return { context, page, code };
}

/**
 * Wait for a booted player to be showing content rather than a pairing code.
 *
 * ⚠️ `page.bringToFront()` first. Playout is a `requestAnimationFrame` loop and
 * Chromium does not run rAF in a BACKGROUND page, so a player left behind
 * another tab never paints its first frame — and every symptom of that names the
 * wrong subsystem ("no manifest", a blank stage, a screenshot of the pairing
 * code filed under the name of a playing screen).
 */
export async function awaitPlayout(page: Page): Promise<void> {
  await page.bringToFront();
  await expect
    .poll(() => page.evaluate(() => !!localStorage.getItem("scena.manifest")), {
      timeout: 90_000,
      message: "the screen never cached a manifest",
    })
    .toBe(true);
  // The stage paints from the rAF loop; the pairing code is what it replaces.
  await expect(page.getByText(/waiting for pairing/i)).toBeHidden({ timeout: 60_000 });
}
