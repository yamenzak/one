/**
 * Tessa's binding to the shared screenshot discipline (`@4dl/e2e-kit`).
 *
 * The whole of it is shared — this file exists only to say WHERE the images
 * land. Shot ids are per-product (`today`, `settings`) and two suites writing
 * into one directory would overwrite each other.
 */

import { shoot as shootTo, type ShotOptions } from "@4dl/e2e-kit";
import type { Page } from "@playwright/test";

export { freeze, visit, type ShotOptions } from "@4dl/e2e-kit";

/** Where the images land. Gitignored: they are an output, regenerated on demand. */
export const SHOTS_DIR = new URL("../shots-out/", import.meta.url).pathname;

/** Freeze the page and write `<shots-out>/<project>/<name>.png`. */
export const shoot = (page: Page, project: string, name: string, opts: ShotOptions = {}): Promise<string> =>
  shootTo(page, SHOTS_DIR, project, name, opts);
