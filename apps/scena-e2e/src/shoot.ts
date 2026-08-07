/**
 * Scena's binding to the shared screenshot discipline.
 *
 * `freeze`, `visit` and the stillness/settlement/honesty argument are
 * `@4dl/e2e-kit`'s. This file was a COPY of Kova's and had drifted from it in
 * four ways — a different settle, no `networkidle` wait, no boot-bar hiding,
 * and a `visit` whose `ready` was required rather than optional — so images
 * from two products in one design system were taken under two disciplines.
 *
 * What stays is what is genuinely this app's: where the images land, and a
 * longer default wait, because several of Scena's screens POLL and a paired
 * screen can take a beat to report in.
 */

import { shoot as shootTo, visit as visitWith, type ShotOptions } from "@4dl/e2e-kit";
import type { Locator, Page } from "@playwright/test";

export { freeze, type ShotOptions } from "@4dl/e2e-kit";

/** Where the images land. Gitignored: they are an output, regenerated on demand. */
export const SHOTS_DIR = new URL("../shots-out/", import.meta.url).pathname;

/** Freeze the page and write `<shots-out>/<project>/<name>.png`. */
export const shoot = (page: Page, project: string, name: string, opts: ShotOptions = {}): Promise<string> =>
  shootTo(page, SHOTS_DIR, project, name, opts);

/** 90s, not 30: a paired screen has to check in before its detail can settle. */
export const visit = (page: Page, url: string, ready?: Locator): Promise<void> =>
  visitWith(page, url, ready, 90_000);
