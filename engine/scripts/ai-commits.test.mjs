/**
 * A MODEL MAY FILL ANYTHING AND MAY COMMIT NOTHING.
 *
 * ⚠️ THE FAILURE IS A NUMBER SOMEBODY ACTS ON THAT NOBODY AGREED TO. An expiry, a
 * quantity, a lot code, a hazard class: each is read off a creased page or a
 * blurred label by a system that answers fluently whether or not it could see,
 * and each is a thing a person then works from. A generating operation that
 * writes one straight to a table has removed the only step where anybody could
 * have noticed — and it never fails, because a wrong expiry is a perfectly
 * valid date.
 *
 * ⚠️ SO THE RULE IS THE STRONGEST SHAPE OF IT: an operation that declares an AI
 * action writes NO table at all. It answers; a screen fills a form; a person
 * presses the button that writes. Narrower rules — "no expiry", "not without a
 * confirm" — need a parser to tell a confirmed write from an unconfirmed one,
 * and the version that fits in a script is the version that gets waived.
 *
 * ⚠️ AND IT IS STRUCTURAL BECAUSE IT HAS TO OUTLIVE THE PERSON WHO READ THE RULE.
 * "AI fills, people commit" is one sentence and it survives exactly as long as
 * everybody remembers it; this is what makes the NEXT generating action have to
 * be written the same way.
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

/* ⚠️ Comments describe the writes they forbid, and each would otherwise match. */
const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/^(\s*)\/\/.*$/gm, "$1");

/**
 * ⚠️ ONE CHUNK PER OPERATION, CUT AT THE CALLS THEMSELVES. It is not a parser and
 * does not need to be: every operation in this repo is one top-level
 * `operation(…)` call, so the text between two of them is one declaration and
 * its handler. A helper defined between two operations would be attributed to
 * the first — which errs towards reporting, and a false report is read and
 * dismissed while a missed write is not.
 */
const operationsIn = (code) => {
  const at = [...code.matchAll(/\boperation\s*[<(]/g)].map((m) => m.index);
  return at.map((from, i) => code.slice(from, at[i + 1] ?? code.length));
};

const WRITE = /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-z_]+)/gi;

const apps = appManifests();

let actions = 0;
for (const [app, path] of apps) {
  const code = strip(readFileSync(path, "utf8"));
  for (const chunk of operationsIn(code)) {
    /* ⚠️ `ai:` AND NOT `ai`, so a variable called `ai` in a handler is not an
       action. The declaration is a property and always carries its colon. */
    if (!/\bai:\s*\{/.test(chunk)) continue;
    actions++;

    const id = /\bid:\s*["'`]([\w.]+)["'`]/.exec(chunk)?.[1] ?? "an operation";
    for (const m of chunk.matchAll(WRITE)) {
      fail(`${app}: \`${id}\` generates AND writes \`${m[1]}\`.\n`
        + `       A model may fill anything and may commit nothing. What it answered is a\n`
        + `       suggestion until somebody agrees with it — written straight to a table it\n`
        + `       is a fact, and a wrong expiry read off a blurred label is a perfectly\n`
        + `       valid date that nothing anywhere will ever question.`);
    }
  }
}

/*
  ⚠️ A FLOOR, BECAUSE A GUARD THAT FINDS NO ACTIONS PRINTS A GREEN LINE. "No
  generating operation writes" and "there are no generating operations" are the
  same sentence without a number, and the second is what a renamed declaration
  produces.
*/
if (actions < 2) {
  fail(`ai-commits: only ${actions} generating operation(s) across ${apps.length} app(s).\n`
    + `       Two apps declare them, so a number this low means the declaration was\n`
    + `       renamed and this check is now about nothing.`);
} else if (!bad) {
  ok(`ai-commits: ${actions} generating operation(s) across ${apps.length} app(s), none of them writing`);
}

console.log(bad
  ? `\nai-commits: ${bad} finding(s) — a model's answer committed as a fact.`
  : `\nai-commits: a model fills, and a person commits.`);
process.exit(bad ? 1 : 0);
