/**
 * WHICH TREES A GUARD ASKS ITS QUESTION OF — resolved ONCE.
 *
 * ⚠️ TWENTY GUARDS ENUMERATED `engine/apps/*` BY HAND, AND ONE DIRECTORY MOVE
 * NARROWED ALL OF THEM AT ONCE. The proving ground was inside that catalogue, so
 * every one of those walks happened to include it; moving it out — where a
 * fixture belongs — took it out of all twenty silently, and every guard went on
 * printing `ok` over a corpus one app smaller. That is the failure shape this
 * whole directory exists to refuse: a check that reports something narrower than
 * the truth. A tree a guard reads is named once, here.
 *
 * ⚠️ THE GROUND IS ASKED THE SAME QUESTIONS AS A PRODUCT, deliberately. It is
 * the app that declares every cross-cutting concern — the widest manifest in the
 * repository and the place most of the design system is drawn — so it is the
 * corpus these checks are most worth running against. It is not SERVED (see
 * `fixture.test.mjs`); being outside the catalogue is about what a customer can
 * reach, not about what a guard may read.
 *
 * ⚠️ AND A NAMED DIRECTORY THAT IS NOT THERE THROWS. `lib/rules.mjs` learned
 * this the same way: a walk that swallows a missing path reports green over
 * nothing, and the absence is the thing nobody looks for.
 */

import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ENGINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** ⚠️ THE GROUND FIRST, because a corpus is read in the order it is listed and
    the widest manifest is the one worth failing on first. */
const GROUND = "ground";

/** Every product directory name, in `engine/apps`. */
export const products = () => {
  const at = join(ENGINE, "apps");
  if (!existsSync(at)) {
    throw new Error("engine/apps is not there — the product catalogue every guard walks");
  }
  return readdirSync(at, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
};

/**
 * EVERY APP TREE A GUARD READS: the ground and every product, as
 * `[id, "<dir>/src"]` pairs relative to `engine/`.
 */
export const appTrees = () => {
  if (!existsSync(join(ENGINE, GROUND, "src"))) {
    throw new Error(`engine/${GROUND}/src is not there — the proving ground every guard reads`);
  }
  return [[GROUND, `${GROUND}/src`], ...products().map((name) => [name, `apps/${name}/src`])];
};

/** Just the `src` directories, for a guard that only walks files. */
export const appDirs = () => appTrees().map(([, dir]) => dir);

/** `[id, absolute path to its manifest]`, skipping a tree that has none. */
export const appManifests = () => appTrees()
  .map(([id, dir]) => [id, join(ENGINE, dir, "index.ts")])
  .filter(([, path]) => existsSync(path));
