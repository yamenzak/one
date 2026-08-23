#!/usr/bin/env node
/**
 * A WORKFLOW THAT DEPLOYS THE WORKER BUILDS WHAT THE WORKER SERVES.
 *
 * ⚠️ AN `assets.directory` IS A FILESYSTEM PATH, NOT A PACKAGE DEPENDENCY, so
 * nothing in the workspace graph connects a deploy to the build it needs. Turbo
 * cannot infer it, the config does not declare it, and a workflow that omits the
 * build typechecks, parses, and passes every other check here — then fails at
 * `wrangler deploy` with "the directory specified by the assets.directory field
 * does not exist".
 *
 * ⚠️ AND WHERE IT FAILS IS THE POINT. The relocation workflow omitted it, so the
 * failure arrived after the copy was taken, the id was written and the
 * deployment was already in maintenance — a person waiting on a red run about a
 * missing folder. The same omission in an ordinary deploy is merely a red run;
 * in a sequence with a window in it, it is an outage extended by however long
 * the fix takes.
 *
 * ⚠️ THE OTHER HALF IS THAT A REHEARSAL MUST REHEARSE THE DEPLOY. Copying is the
 * step with a rollback behind it; deploying is the step with nobody able to work
 * until it lands. A rehearsal that proves only the easy half reports success and
 * leaves the dangerous half untried.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FLOWS = join(HERE, "..", "..", ".github", "workflows");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/* ⚠️ THE SPA PACKAGE IS NAMED ONCE. A second spelling here is a guard that
   passes over a workflow building nothing, which is the failure itself. */
const SPA = "@engine/space";
const BUILD = new RegExp(`turbo run build[^\\n]*--filter=${SPA}`);
/* A real deploy of the worker. `--dry-run` ships nothing, so it is not one. */
const DEPLOYS = /wrangler deploy(?![^\n]*--dry-run)/;

const files = readdirSync(FLOWS).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
if (!files.length) {
  fail("no workflows were read at all — a check over an empty corpus is green\n"
    + "     for the same reason a check over a clean one is.");
}

const deploying = [];
for (const f of files) {
  const text = readFileSync(join(FLOWS, f), "utf8");
  if (!DEPLOYS.test(text) && !/command:\s*deploy/.test(text)) continue;
  deploying.push(f);
  if (!BUILD.test(text)) {
    fail(`${f}: deploys the worker and never builds ${SPA}.\n`
      + "     An assets.directory is a path, not a dependency — nothing else connects\n"
      + "     the two, and the deploy fails on a directory that was never made.");
  }
}

if (!deploying.length) {
  fail("no workflow deploys the worker. Either the deploy moved or this guard\n"
    + "     is now looking for a command nothing runs.");
} else if (!bad) {
  ok(`builds: ${deploying.length} workflow(s) deploy the worker, each building ${SPA} first`);
}

/* ------------------------------------------------------- the rehearsal --- */

const relocate = join(FLOWS, "relocate.yml");
const runbook = readFileSync(relocate, "utf8");
if (!/wrangler deploy --dry-run/.test(runbook)) {
  fail("relocate.yml: rehearses the copy and not the deploy. The copy has a\n"
    + "     rollback behind it; the deploy has a person waiting on it, and it is the\n"
    + "     half that failed.");
} else ok("rehearsal: the deploy is proved with nothing bound");

/**
 * ⚠️ AND A WORKFLOW THAT COMMITS MUST BE ALLOWED TO. The default token is
 * read-only, so a `git push` at the end of a sequence is refused 403 — after the
 * copy, after the deploy, after the boot check, with the deployment already LIVE
 * on the new database and the repository still naming the old one. The next
 * ordinary push then re-deploys the old id and moves the deployment back onto a
 * database that has been out of service since the window. The work succeeded and
 * the record of it did not.
 */
const pushing = files.filter((f) => /git push/.test(readFileSync(join(FLOWS, f), "utf8")));
const unwritable = pushing.filter((f) =>
  !/permissions:\s*(\n\s+[a-z-]+:.*)*\n\s+contents:\s*write/.test(readFileSync(join(FLOWS, f), "utf8")));
if (!pushing.length) {
  fail("no workflow pushes to the repository. Either that moved or this guard is\n"
    + "     looking for something nothing does.");
} else if (unwritable.length) {
  fail(`${unwritable.join(", ")}: pushes to the repository without \`contents: write\`.\n`
    + "     The default token is read-only, so the push is refused after the work is done.");
} else ok(`writing: ${pushing.length} workflow(s) push, each allowed to`);

console.log(bad
  ? `\nshipping: ${bad} failure(s).`
  : "\nshipping: what ships is built, the deploy is rehearsed, and a workflow that commits may.");
process.exit(bad ? 1 : 0);
