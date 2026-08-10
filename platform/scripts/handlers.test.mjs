#!/usr/bin/env node
/**
 * WHAT AN APP'S OWN HANDLERS MAY NOT DO.
 *
 * The derived surface is safe by construction — a collection's list is bounded,
 * scoped and paged by the platform, and there is no way to write it otherwise.
 * A BESPOKE operation is where an app writes SQL, and that is where the four
 * properties below stop being structural and start being a matter of
 * remembering.
 *
 * ⚠️ TWO OF THESE HOLD TODAY AND ARE BEING LOCKED IN RATHER THAN FIXED. That is
 * the point of writing them now: a property that holds by discipline across
 * sixty statements is one commit from not holding, and the commit that breaks it
 * will look completely ordinary.
 *
 * Dependency-free Node — these run before `pnpm install` in CI.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let bad = 0;
const fail = (m) => (console.error(`BAD  ${m}`), bad++);
const ok = (m) => console.log(`ok   ${m}`);

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && p.endsWith(".ts")) out.push(p);
  }
  return out;
};

/** Every app: a `src/manifest.ts` is what makes a directory one. */
const apps = readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(ROOT, e.name, "src", "manifest.ts")))
  .map((e) => e.name);

const sources = apps.flatMap((a) => walk(join(ROOT, a, "src")).map((f) => [f, readFileSync(f, "utf8")]));
if (!sources.length) fail("no app source found, so none of these checks proves anything.");

const at = (file, text, index) => `${relative(ROOT, file)}:${text.slice(0, index).split("\n").length}`;
/**
 * ⚠️ THE WHOLE COMMENT ABOVE THE LINE, not a fixed number of lines back. A
 * reason worth writing is usually longer than three lines, and a lookback that
 * stops short means the marker is there, the reason is there, and the check
 * fails anyway — which teaches people to write shorter reasons.
 */
const exempted = (text, index, marker) => {
  const lines = text.slice(0, index).split("\n");
  /*
    ⚠️ WALKING UP THROUGH A BLOCK COMMENT, WITH ITS STATE TRACKED. This file's
    comments are `/* … *\/` with plain indented prose inside, so an interior line
    starts with no marker of its own — and the first version of this stopped at
    the first such line and reported an exemption that was written correctly,
    three lines above, as missing. A check that refuses a reason somebody wrote
    is worse than one that does not ask for a reason.
  */
  let inside = false;
  for (let i = lines.length - 2; i >= 0 && lines.length - i < 25; i--) {
    const line = lines[i].trim();
    if (line.includes(marker)) return true;
    if (line.endsWith("*/")) { inside = true; continue; }
    if (inside) { if (line.startsWith("/*")) inside = false; continue; }
    if (line === "" || line.startsWith("//") || line.startsWith("*")) continue;
    return false;
  }
  return false;
};


/* ------------------------------------------------------ 1. NAMES ITS TENANT */

/**
 * ⚠️ THE HIGHEST-CONSEQUENCE PROPERTY IN A MULTI-TENANT PRODUCT, and in a
 * bespoke handler it is one forgotten `AND tenant_id = ?` away from not holding.
 *
 * A derived list filters by tenant in code nobody writes. A hand-written query
 * that forgets returns every workspace's rows, answers 200, renders perfectly,
 * and looks completely ordinary in review — which is why it is checked here
 * rather than trusted.
 *
 * ⚠️ THE EXEMPTION IS FOR A TABLE THAT IS GENUINELY NOT A WORKSPACE'S. A shared
 * catalogue, the deployment's own configuration, a session row that belongs to
 * an account: each is real, and each has to say so on the line above it.
 */
let queries = 0;
for (const [file, text] of sources) {
  for (const m of text.matchAll(/`(SELECT[\s\S]{0,600}?)`/g)) {
    const q = m[1].replace(/\s+/g, " ");
    queries++;
    if (/\btenant_id\b/.test(q)) continue;
    if (exempted(text, m.index, "tenant-exempt")) continue;
    fail(`${at(file, text, m.index)}: a query that does not name its tenant.\n` +
         `       ${q.slice(0, 90)}\n` +
         `       One that forgets returns every workspace's rows and looks entirely ordinary.\n` +
         `       Add the predicate, or say why with \`tenant-exempt: <reason>\` above it.`);
  }
}
ok(`scoped: ${queries} hand-written query(s), every one naming its workspace`);

/* ------------------------------------------------------------- 2. BOUNDED */

/**
 * ⚠️ A LIST WHOSE SIZE IS THE WORKSPACE'S OWN ROW COUNT ONLY EVER GROWS.
 *
 * It works on every deployment until the largest workspace crosses the runtime's
 * time or memory limit — and then it fails, is retried, fails at the same size,
 * and the feature stops for exactly the customer who uses it most. `no-silent-cap`
 * has this covered for the derived surface; this is the half an app writes.
 *
 * ⚠️ AGGREGATES ARE EXEMPT BY SHAPE, not by a marker. A `COUNT`, `SUM`, `MAX` or
 * `GROUP BY` returns a bounded number of rows by construction, and demanding a
 * `LIMIT` on one would be a check nobody could satisfy meaningfully.
 */
let reads = 0;
for (const [file, text] of sources) {
  for (const m of text.matchAll(/\.all<[^>]*>\(\s*\n?\s*`([\s\S]{0,600}?)`/g)) {
    const q = m[1].replace(/\s+/g, " ");
    reads++;
    if (/\bLIMIT\b/i.test(q)) continue;
    if (/\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(q) && /GROUP BY|^\s*SELECT\s+(COUNT|SUM|AVG|MIN|MAX)/i.test(q)) continue;
    if (exempted(text, m.index, "unbounded-read")) continue;
    fail(`${at(file, text, m.index)}: a read with no ceiling.\n` +
         `       ${q.slice(0, 90)}\n` +
         `       Its size is the workspace's own row count, so it works until the largest one\n` +
         `       crosses a limit — then fails, is retried, and fails at the same size forever.\n` +
         `       Add a LIMIT, or say why with \`unbounded-read: <reason>\` above it.`);
  }
}
ok(`bounded: ${reads} multi-row read(s) in app code, every one with a ceiling`);

/* ---------------------------------------------------------- 3. NO WALL CLOCK */

/**
 * ⚠️ `ctx.now()` IS INJECTED, AND THAT IS WHAT MAKES A TEST DETERMINISTIC.
 *
 * A handler reading the wall clock is one whose behaviour cannot be pinned — a
 * ladder that fires on the wrong day, a window that rolls over mid-assertion, a
 * relocation replay that produces different rows than the run it is replaying.
 * It holds in both apps today; a guard is what keeps it holding.
 */
for (const [file, text] of sources) {
  for (const m of text.matchAll(/\bDate\.now\(\)|\bnew Date\(\s*\)/g)) {
    if (exempted(text, m.index, "wall-clock")) continue;
    fail(`${at(file, text, m.index)}: a handler reading the wall clock.\n` +
         `       Use \`ctx.now()\` — injected, so a test can pin it and a replay reproduces.\n` +
         `       Or say why with \`wall-clock: <reason>\` above it.`);
  }
}
ok(`clock: every app reads the injected one`);

/* ------------------------------------------------------- 4. A WRITE SPEAKS */

/**
 * ⚠️ A WRITE THE PERSON CANNOT SEE HAPPEN AND THAT SAYS NOTHING IS ONE THEY DO
 * TWICE.
 *
 * MANIFEST.md §2 gives the policy: a field saved in place is inline, a result
 * you cannot see is a toast, and silence is reserved for something that visibly
 * happened already — a row appearing is its own feedback. So this is not "every
 * write declares an outcome"; it is "every write that is not visible declares
 * one, or says which case it is".
 *
 * ⚠️ AND THE EXEMPTION IS A MARKER ON THE OPERATION, so the reasoning sits where
 * somebody adding the next one reads it. Five writes that spend a workspace's
 * credits shipped with neither.
 */
let writes = 0;
for (const [file, text] of sources) {
  for (const m of text.matchAll(/\n(?:export )?const \w+ = operation<[\s\S]*?\n\}\);/g)) {
    const block = m[0];
    if (!/kind: "write"/.test(block)) continue;
    writes++;
    if (/outcome:/.test(block)) continue;
    if (/visible-outcome:/.test(block)) continue;
    const id = /id: "([^"]+)"/.exec(block)?.[1] ?? "?";
    fail(`${at(file, text, m.index)}: "${id}" writes and says nothing.\n` +
         `       A result somebody cannot see happen needs an outcome, or a screen has\n` +
         `       nothing to say and they do it again. If it IS visible — a row appearing is\n` +
         `       its own feedback — say so with \`visible-outcome: <reason>\` on the operation.`);
  }
}
ok(`acknowledged: ${writes} bespoke write(s), every one saying what happened`);

/* -------------------------------------------------------------------------- */

if (bad) {
  console.error(`\n${bad} handler failure(s).`);
  process.exit(1);
}
console.log(`\nhandlers: ${apps.length} app(s) — every query scoped and bounded, one clock, every write speaks.`);
