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
  /**
   * An `${{ }}` EXPRESSION INSIDE A FLOW COLLECTION, unquoted.
   *
   *     with: { ref: ${{ github.ref_name }} }      ← invalid YAML
   *     with: { ref: "${{ github.ref_name }}" }    ← fine
   *     with:                                      ← fine
   *       ref: ${{ github.ref_name }}
   *
   * In block style the value is a plain scalar and the braces are just
   * characters. Inside `{ … }` they are STRUCTURE, so `{{` opens a nested
   * mapping and the file stops parsing.
   *
   * This one shipped. `deploy.yml` carried it for two commits, and the symptom
   * was exactly what the header of this file describes: the run appeared, took
   * zero seconds, ran no jobs, reported "failure", and was listed under its
   * FILENAME instead of its name. Nothing deployed and nothing said why. The
   * check above did not see it, and neither did the `on:`/`name:` regexes below
   * — both still matched a file GitHub could not read.
   */
  lines.forEach((line, i) => {
    const flow = /:\s*[{[]/.exec(line);
    if (!flow) return;
    // Quoted spans are safe; strip them before looking for a bare expression.
    const bare = line.slice(flow.index).replace(/"[^"]*"|'[^']*'/g, "");
    if (bare.includes("${{")) {
      console.error(`BAD  ${f}:${i + 1} — unquoted \${{ }} inside a YAML flow collection. Quote it, or use block style:\n     ${line.trim()}`);
      bad++;
    }
  });

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

// `on:` and `name:` must survive as keys.
//
// `js-yaml` is deliberately not a dependency — this file has to run before
// `pnpm install`, so it cannot be a real parse. That is a genuine limitation
// and it has now cost something: these two regexes match happily on a file
// GitHub refuses to read, so they can only prove a key EXISTS, never that the
// document is well-formed. Every syntax trap has to be named explicitly above.
// If a third one ever gets through, that is the signal to move this check
// somewhere it can afford a YAML parser rather than to add a fourth regex.
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

/**
 * THE DEPLOY GATE OPENS NO BROWSER, AND NOTHING IN ITS LANE NEEDS ONE.
 *
 * A dozen suites measure real geometry in real Chromium — spacing, wrapping,
 * whether a ground actually moves — because no static check can see any of it.
 * None of their answers is "the deployment boots", which is the only question a
 * deploy is waiting on, and together they cost more than every other check in
 * this repository. So they are `*.seen.test.*`, excluded from every `test`
 * config, and run by `pnpm engine:seen`, which CI does not call.
 *
 * ⚠️ THE TWO HALVES ARE CHECKED TOGETHER, WHICH IS THE WHOLE POINT. A browser
 * suite without the suffix is back in the lane a deploy waits for and nothing
 * says so — the tests pass, the run is simply minutes longer. A workflow that
 * installs a browser is paying ~400 MB and its system libraries for a lane that
 * opens none.
 *
 * ⚠️ THIS IS THE HALF THAT RUNS BEFORE `pnpm install`. The rest of the rule —
 * a suffixed suite with no command to run it, a second `test` config in the same
 * package whose globs still pick one up — is `engine/scripts/seen.test.mjs`,
 * which needs the workspace. Both are in the gate; only this one can guard the
 * workflow that installs the workspace.
 */
{
  const root = new URL("../../", import.meta.url).pathname;
  /* ⚠️ A LAUNCH, NOT AN IMPORT, and only in a test file. `design/src/measure`
     names playwright in an `import type`, which runs nothing; the shots sweep
     launches one and is its own command. A rule keyed on the word would report
     both and be waived. */
  const LAUNCHES = /\b(?:chromium|firefox|webkit)\s*\.\s*launch\s*\(/;
  const opens = [];
  const walk = (at) => {
    for (const e of readdirSync(at, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".git") continue;
      const full = join(at, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.test\.m?[jt]sx?$/.test(e.name)) continue;
      if (LAUNCHES.test(readFileSync(full, "utf8"))) opens.push(full.slice(root.length));
    }
  };
  walk(join(root, "engine"));

  const engine = readFileSync(join(DIR, "engine.yml"), "utf8");
  const installs = /playwright install/.test(engine);
  const fast = opens.filter((u) => !/\.seen\.test\./.test(u));

  if (!opens.length) {
    console.error("BAD  no test file in engine/ launches a browser — either the geometry suites\n"
      + "       are gone, or the launch moved behind a helper this check cannot see. Either way\n"
      + "       it is passing over nothing.");
    bad++;
  } else if (fast.length && !installs) {
    console.error(
      `BAD  ${fast.length} suite(s) launch a browser and are in the lane CI runs:\n`
      + fast.map((u) => `       ${u}`).join("\n")
      + "\n       Rename each to `<name>.seen.test.tsx`, which is what keeps it out of"
      + "\n       `pnpm engine:test`. Left as it is, every test in them fails at launch and is"
      + "\n       reported as SKIPPED — the whole file unrunnable, wearing a passing suite's"
      + "\n       clothes — or the deploy waits minutes for pixels it is not asking about.");
    bad++;
  } else if (installs && !fast.length) {
    console.error(
      "BAD  engine.yml installs a browser and no suite in its lane opens one.\n"
      + `       All ${opens.length} are \`.seen.\` and run in \`pnpm engine:seen\`, which this`
      + "\n       workflow does not call — so this is ~400 MB, its system libraries and a minute"
      + "\n       on every deploy, for nothing.");
    bad++;
  }
}

if (bad) {
  console.error(`\n${bad} problem(s). A broken workflow does not fail — it does not run.`);
  process.exit(1);
}
console.log("✓ every workflow file parses and has a name + trigger");
