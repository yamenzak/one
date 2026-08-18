/**
 * THE STAGE TABLE, READ ONCE.
 *
 * ⚠️ FOUR CHECKS PARSED A MARKDOWN TABLE WITH FOUR DIFFERENT REGULAR
 * EXPRESSIONS, and one of them matched a row shape the others did not. A stage
 * that a reformatted row made invisible is a stage nothing can be deferred
 * against and a guard that can be owed for ever — and both failures are silent,
 * because the check reports green about a row it never saw.
 *
 * ⚠️ SO THE TABLE IS A REGISTRY AND THE DOCUMENT IS GENERATED FROM IT, which is
 * the direction that cannot rot. `docs/stages.json` is the source; the table in
 * `docs/ENGINE.md` is a rendering of it.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** Every stage, in order. */
export const stages = () =>
  JSON.parse(readFileSync(join(ENGINE, "docs/stages.json"), "utf8")).stages;

/**
 * ⚠️ THE NUMBERS AS STRINGS, because every caller has one out of a `DEFER`
 * marker or a guard entry, and both are text. Comparing a string to a number is
 * how a check quietly matches nothing.
 */
export const shippedStages = () =>
  new Set(stages().filter((s) => s.status === "shipped").map((s) => String(s.n)));

export const knownStages = () => new Set(stages().map((s) => String(s.n)));
