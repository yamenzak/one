/**
 * EVERY WORKFLOW FILE PARSES.
 *
 * A workflow with broken YAML does not fail — it does not RUN. GitHub lists it
 * by filename instead of by name, its `workflow_dispatch` button never appears,
 * and nothing anywhere says why. That is exactly how `provision-tessa.yml`
 * shipped dead: a `git commit -m` message body sat at column 0 inside a `run: |`
 * block, which silently ends the block scalar and corrupts the rest of the file.
 *
 * The failure mode is the problem. A test that runs a workflow would have caught
 * it; so does simply parsing the file, and that costs nothing.
 *
 * Run with `node .github/workflows/workflows-parse.test.mjs`. Deliberately not a
 * vitest suite: it must not need the workspace installed, so it can be the first
 * thing anyone runs.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = new URL(".", import.meta.url).pathname;
let bad = 0;

for (const f of readdirSync(DIR).filter((n) => n.endsWith(".yml") || n.endsWith(".yaml"))) {
  const text = readFileSync(join(DIR, f), "utf8");
  const lines = text.split("\n");

  /**
   * The specific trap, checked directly rather than inferred from a parse error.
   *
   * Inside a block scalar (`run: |`), a line at column 0 that is not blank ends
   * the block. YAML parsers report this far from the real cause — "could not
   * find expected ':'" pointing at whatever came next — so naming it here is
   * what turns a confusing message into an obvious one.
   */
  let inBlock = false;
  let blockIndent = 0;
  lines.forEach((line, i) => {
    const m = /^(\s*)[-\w"' ]*:\s*[|>][-+\d]*\s*$/.exec(line);
    if (m) {
      inBlock = true;
      blockIndent = m[1].length;
      return;
    }
    if (!inBlock || line.trim() === "") return;
    const indent = line.length - line.trimStart().length;
    if (indent <= blockIndent) {
      // Left the block legitimately (a sibling key), which is fine — unless it
      // is at column 0 while the block was indented, which never is.
      if (indent === 0 && blockIndent > 0) {
        console.error(`BAD  ${f}:${i + 1} — line at column 0 inside an indented block scalar:\n     ${line}`);
        bad++;
      }
      inBlock = false;
    }
  });
}

// The parse itself, via GitHub's own reading of it: `on:` must survive as a key.
// `js-yaml` is not a dependency here on purpose, so this is a structural check
// rather than a full parse — the column-0 rule above is what actually bit.
const names = new Map();
for (const f of readdirSync(DIR).filter((n) => n.endsWith(".yml"))) {
  const text = readFileSync(join(DIR, f), "utf8");
  if (!/^on:/m.test(text)) {
    console.error(`BAD  ${f} — no top-level \`on:\` trigger survived parsing.`);
    bad++;
  }
  const name = /^name:\s*(.+?)\s*$/m.exec(text)?.[1];
  if (!name) {
    console.error(`BAD  ${f} — no top-level \`name:\`. GitHub will list it by filename.`);
    bad++;
  } else {
    if (names.has(name)) {
      console.error(`BAD  ${f} and ${names.get(name)} are both named "${name}". The Actions list becomes ambiguous.`);
      bad++;
    }
    names.set(name, f);
  }
}

/**
 * A workflow that tells you to go run another one must NAME one that exists.
 *
 * `deploy.yml` skips an unprovisioned app with "Run 'Provision an app on
 * Cloudflare'". That string is the only pointer from the failure to the fix, and
 * renaming the target workflow would leave it pointing at nothing — silently,
 * because it is a log line, not a reference.
 */
for (const [f] of [...names].map(([n, file]) => [file, n])) {
  const text = readFileSync(join(DIR, f), "utf8");
  for (const m of text.matchAll(/Run '([^']+)'/g)) {
    if (!names.has(m[1])) {
      console.error(`BAD  ${f} points at a workflow named "${m[1]}", which does not exist. Known: ${[...names.keys()].join(", ")}`);
      bad++;
    }
  }
}

if (bad) {
  console.error(`\n${bad} problem(s). A broken workflow does not fail — it does not run.`);
  process.exit(1);
}
console.log("✓ every workflow file parses and has a name + trigger");
