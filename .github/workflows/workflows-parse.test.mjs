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
 * A SUITE THAT LAUNCHES A BROWSER NEEDS ONE INSTALLED, AND CI HAD NONE.
 *
 * Three `@engine/design` suites measure real geometry in real Chromium —
 * spacing, and whether a ground actually moves — because no static check can
 * see either. They passed for a week on a sandbox image that happens to carry
 * browsers, and failed at LAUNCH the first time they reached a runner:
 * `Executable doesn't exist at …/chromium_headless_shell-1194`, on the whole
 * file, so every test in them counted as skipped rather than failed.
 *
 * ⚠️ THE POINT IS THAT THE TWO HALVES ARE CHECKED TOGETHER. A workflow that
 * installs a browser nothing uses is a wasted minute; a suite that needs one
 * nobody installs is a suite that cannot run — and this repository's whole
 * argument for measuring in a browser is that the measurement HAPPENS.
 */
{
  const root = new URL("../../", import.meta.url).pathname;
  /* ⚠️ Walked rather than listed: a fourth browser suite is asked the same
     question the day it is written. */
  const uses = [];
  const walk = (at) => {
    for (const e of readdirSync(at, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".git") continue;
      const full = join(at, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.(m?[jt]sx?)$/.test(e.name)) continue;
      const src = readFileSync(full, "utf8");
      if (/from "playwright"|require\("playwright"\)/.test(src)) {
        uses.push(full.slice(root.length));
      }
    }
  };
  walk(join(root, "engine"));

  if (uses.length) {
    const engine = readFileSync(join(DIR, "engine.yml"), "utf8");
    if (!/playwright install/.test(engine)) {
      console.error(
        `BAD  engine.yml installs no browser, and ${uses.length} suite(s) launch one:\n`
        + uses.map((u) => `       ${u}`).join("\n")
        + `\n       Every test in them fails at launch and is reported as SKIPPED, which is`
        + `\n       the whole file being unrunnable wearing a passing suite's clothes.`);
      bad++;
    }
  }
}

if (bad) {
  console.error(`\n${bad} problem(s). A broken workflow does not fail — it does not run.`);
  process.exit(1);
}
console.log("✓ every workflow file parses and has a name + trigger");
