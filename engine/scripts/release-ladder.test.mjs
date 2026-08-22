/**
 * A QUARANTINE LIFTS TO "NEEDS WORK" AND NEVER TO "GOOD TO GO".
 *
 * ⚠️ THE FAILURE IS A TRAY THAT WAS NEVER STERILISED BEING USED ON SOMEBODY. A
 * steriliser fails, its load is frozen, and the freeze has to be liftable —
 * holding stock frozen for ever because a form cannot be completed is how a rule
 * gets worked around. What must never happen is the lift arriving at `released`:
 * that is the ladder run backwards, and afterwards nothing in the record says
 * the run failed at all.
 *
 * ⚠️ SO THE CHECK IS ON THE WRITE, AND IT IS TWO HALVES. Only `process.release`
 * may write the verdict `released`, and its statement must compare against
 * `pending` — because an update with no compare-and-set is one that will
 * cheerfully move a `failed` item into `released` the day somebody adds a second
 * caller.
 *
 * ⚠️ AND IT IS STRUCTURAL BECAUSE A BEHAVIOURAL TEST CANNOT SEE THE NEXT ONE. A
 * suite proves the release path refuses a failed item today; it says nothing
 * about the lift path somebody writes next year, which is where this actually
 * goes wrong.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { appDirs, appManifests, appTrees } from "./lib/trees.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/^(\s*)\/\/.*$/gm, "$1");

const apps = appManifests();

/* ⚠️ Every statement that moves a verdict, whole — the `SET` clause and the
   `WHERE` that guards it, because the guard is half the rule. */
const SETS = /UPDATE\s+process_item\s+SET\s+([\s\S]*?)(WHERE[\s\S]*?)`/gi;

let writes = 0;
let releases = 0;
for (const [app, path] of apps) {
  const code = strip(readFileSync(path, "utf8"));
  if (!/process_item/.test(code)) continue;

  for (const m of code.matchAll(SETS)) {
    const [, set, where] = m;
    writes++;
    if (!/verdict\s*=\s*'released'/i.test(set)) continue;
    releases++;

    /*
      ⚠️ THE COMPARE-AND-SET IS THE RULE. Without `verdict = 'pending'` in the
      WHERE, this statement will move a FAILED item into `released` — which is
      the one direction the ladder may never go, and which fails nothing
      anywhere: the row updates, the screen redraws, and a tray whose steriliser
      failed reads as released for the length of its shelf life.
    */
    if (!/verdict\s*=\s*'pending'/i.test(where)) {
      fail(`${app}: releases a verdict without checking it was pending.\n`
        + `       A quarantine lifts to "needs work" and never to "good to go". An update\n`
        + `       with no compare-and-set moves a FAILED item into released — and nothing\n`
        + `       fails: the row updates, the screen redraws, and a tray whose steriliser\n`
        + `       failed reads as released for the length of its shelf life.`);
    }
  }

  /*
    ⚠️ AND THE LIFT MUST NOT REACH IT AT ALL. `lifted` is the word for "unfrozen
    and still not released"; a lift handler naming `released` anywhere in a write
    is the ladder run backwards through the other door.
  */
  const lift = /id:\s*["'`][\w.]*\.lift["'`]([\s\S]*?)\n\}\);/.exec(code);
  if (lift && /verdict\s*=\s*'released'/i.test(lift[1])) {
    fail(`${app}: the lift path writes the verdict \`released\`.\n`
      + `       Lifting a quarantine unfreezes a thing and does not release it. A tray\n`
      + `       whose steriliser failed is not sterile because somebody pressed a button.`);
  }
}

/*
  ⚠️ A FLOOR, BECAUSE A GUARD THAT WALKS NOTHING PRINTS A GREEN LINE. "No release
  skips the check" and "there are no releases" are the same sentence without a
  number, and the second is what a renamed table produces.
*/
if (releases < 1) {
  fail(`release-ladder: ${releases} release write(s) across ${writes} verdict write(s).\n`
    + `       The rail releases what a run produced, so a number this low means the\n`
    + `       table or the column was renamed and this check is now about nothing.`);
} else if (!bad) {
  ok(`release-ladder: ${releases} release(s) of ${writes} verdict write(s), each checked`);
}

console.log(bad
  ? `\nrelease-ladder: ${bad} finding(s) — the ladder run backwards.`
  : `\nrelease-ladder: a quarantine lifts to needs-work, never to good-to-go.`);
process.exit(bad ? 1 : 0);
