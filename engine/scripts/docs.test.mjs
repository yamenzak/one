/**
 * THE DOCUMENTS, HELD TO `docs/BUILDING.md` §5.
 *
 * ⚠️ THE PLAN IS THE ONLY THING THAT SURVIVES A COMPRESSED CONTEXT, so a plan
 * that has quietly stopped being true is worse than no plan — it is re-read and
 * believed. Three of these checks exist for that alone: an inventory that must
 * be generated rather than typed, a deferral that must be a marker rather than a
 * sentence, and a stage that cannot be called shipped while work still defers to
 * it.
 *
 * Run with `--write` to refresh the generated blocks.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { shippedStages } from "./lib/stages.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");
const WRITE = process.argv.includes("--write");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/**
 * ⚠️ TWO ROOTS, BECAUSE THE DESIGN LANGUAGE LIVES WITH THE PACKAGE THAT DRAWS
 * IT. `DESIGN.md` and `AMBIENCE.md` moved into `design/` so that everything a
 * person needs in order to build a screen is in one directory — and a guard
 * reading only `docs/` would have let all three fall out of governance in the
 * same commit, with no kind, no orphan check and no generated block verified.
 * Adding a root is a line here, in the same commit as the directory.
 */
const ROOTS = ["docs", "design"];
const files = ROOTS.flatMap((dir) =>
  readdirSync(join(ENGINE, dir))
    .filter((f) => f.endsWith(".md"))
    .map((f) => `${dir}/${f}`));
const read = (f) => readFileSync(join(ENGINE, f), "utf8");

/* ------------------------------------------------------------------ kind --- */

/**
 * ⚠️ A DOCUMENT THAT DOES NOT SAY WHAT IT IS gets read as whatever the reader
 * expected — a sketch quoted as a decision, a decision skimmed as a sketch.
 */
const KINDS = ["plan", "decisions", "standards", "progress", "guide"];
for (const f of files) {
  const kind = /^kind:\s*(\S+)/m.exec(read(f))?.[1];
  if (!kind) fail(`${f}: declares no kind:`);
  else if (!KINDS.includes(kind)) fail(`${f}: kind: ${kind} is not one of ${KINDS.join(", ")}`);
}
ok(`kind: ${files.length} document(s) declared`);

/* --------------------------------------------------------------- orphans --- */

/**
 * ⚠️ A DOCUMENT NOTHING LINKS TO IS ONE NOBODY OPENS, and it goes on being true
 * of a codebase that has moved. Two roots: `docs/ENGINE.md`, because it is where
 * a cold reader is told to start, and `design/README.md`, because a package's
 * README is the file anybody opening the directory already sees.
 *
 * ⚠️ AND A LINK IS RESOLVED AGAINST THE DOCUMENT THAT MAKES IT. While every
 * document was in one directory a bare filename was the whole answer; across two
 * it is not, and the version that ignored `../` would have called every
 * cross-directory link a hit — reporting the graph connected no matter what the
 * links actually said.
 */
const resolve = (from, href) =>
  join(dirname(from), href).replace(/\\/g, "/");
const linked = new Set(["docs/ENGINE.md", "design/README.md"]);
for (const f of files) {
  for (const m of read(f).matchAll(/\]\(([./A-Za-z-]*[A-Z][A-Za-z-]*\.md)\)/g)) {
    linked.add(resolve(f, m[1]));
  }
}
const orphans = files.filter((f) => !linked.has(f));
for (const f of orphans) fail(`${f}: nothing links to it`);
/* ⚠️ The count is the REAL one. A summary that says 4/4 beside a failure is a
   pass-shaped message, which is the exact shape every guard here refuses. */
ok(`orphans: ${files.length - orphans.length}/${files.length} document(s) reachable`);

/* ---------------------------------------------------------------- defer: --- */

/**
 * ⚠️ A DEFERRAL IS FOUND, NEVER REMEMBERED. Prose saying "later" is a promise
 * nobody can enumerate, and a stage flipped to shipped over one is a stage table
 * that has started lying.
 */
const source = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".turbo" || e.name === "dist") continue;
    const at = join(dir, e.name);
    if (e.isDirectory()) walk(at);
    else if (/\.(ts|tsx|mjs)$/.test(e.name)) source.push(at);
  }
};
walk(ENGINE);

const markers = [];
for (const file of source) {
  for (const m of readFileSync(file, "utf8").matchAll(/DEFER\((engine-\d+)\)\s*stage:(\d+)/g)) {
    markers.push({ id: m[1], stage: m[2], file: file.slice(ENGINE.length + 1) });
  }
}

const shipped = shippedStages();
for (const d of markers) {
  if (shipped.has(d.stage)) {
    fail(`${d.file}: ${d.id} defers to stage ${d.stage}, which the stage registry calls shipped.\n` +
         `       A stage cannot be shipped while something still waits on it.`);
  }
}
ok(`defer: ${markers.length} marker(s) open, ${shipped.size} stage(s) shipped`);

/* ------------------------------------------------------------- generated --- */

/**
 * ⚠️ A HAND-TYPED INVENTORY IS WRONG WITHIN A WEEK, and a document wrong in a
 * checkable way stops being read for the parts that are right.
 */
const BLOCK = /<!--\s*generated:\s*(.+?)\s*-->\n([\s\S]*?)<!--\s*\/generated\s*-->/g;

/**
 * ⚠️ A BLOCK INSIDE A CODE FENCE IS AN EXAMPLE, NOT A BLOCK. `BUILDING.md` shows
 * the shape of a generated block in order to explain it; running that is running
 * a command chosen for how it reads rather than for what it does — which is what
 * happened the first time this file was written.
 */
const fencesIn = (src) =>
  [...src.matchAll(/^```[\s\S]*?^```/gm)].map((m) => [m.index, m.index + m[0].length]);

let blocks = 0;
for (const f of files) {
  const before = read(f);
  const fenced = fencesIn(before);
  const after = before.replace(BLOCK, (whole, command, body, at) => {
    if (fenced.some(([from, to]) => at >= from && at < to)) return whole;
    blocks++;
    /*
      ⚠️ A GENERATOR THAT REFUSES IS A FAILED DOCUMENT, NOT A CRASH. `execSync`
      throws on a non-zero exit, and the one thing a generator here refuses is
      being asked to produce a list it knows is incomplete — an index missing a
      module reads as a module that does not exist, which is worse than no index
      at all. Reported as this document's failure, because that is whose failure
      it is.
    */
    let fresh;
    try {
      fresh = execSync(command, { cwd: ENGINE, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    } catch (why) {
      fail(`${f}: \`${command}\` refused to generate — ${String(why.stderr ?? why).trim()}`);
      return whole;
    }
    if (!WRITE && body.trim() !== fresh) {
      fail(`${f}: generated block is stale — \`${command}\` produces different output.\n` +
           `       Run \`node engine/scripts/docs.test.mjs --write\`.`);
    }
    return `<!-- generated: ${command} -->\n${fresh}\n<!-- /generated -->`;
  });
  if (WRITE && after !== before) writeFileSync(join(ENGINE, f), after);
}
ok(`generated: ${blocks} verified block(s)`);

/* ------------------------------------------------------------------ paths --- */

/*
  ⚠️ A DOCUMENT THAT POINTS AT A FILE THAT IS NOT THERE IS WORSE THAN ONE THAT
  POINTS AT NOTHING. STANDARDS §2 said deferrals are found by a script that does
  not exist, so anybody following the instruction found nothing and could
  reasonably conclude deferrals are not tracked at all. The mechanism was fine;
  the sentence describing it sent people away from it.

  ⚠️ AND A GUARD'S OWN HEADER IS A DOCUMENT TOO. One named a file deleted months
  earlier as though a reader could open it — the incident rather than the
  invariant, which is what §1 forbids and the reason it forbids it.
*/
{
  const REF = /`((?:scripts|docs|kernel|runtime|design|one-space|one|apps)\/[\w./-]+\.(?:mjs|md|ts|tsx|json))`/g;
  const looked = new Set();
  let broken = 0;
  const scan = (dir) => {
    let entries;
    try { entries = readdirSync(join(ENGINE, dir), { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const at = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!/node_modules|dist|\.turbo/.test(entry.name)) scan(at);
        continue;
      }
      if (!/\.(ts|tsx|mjs|md)$/.test(entry.name)) continue;
      for (const m of readFileSync(join(ENGINE, at), "utf8").matchAll(REF)) {
        looked.add(m[1]);
        if (!existsSync(join(ENGINE, m[1]))) {
          fail(`${at}: names \`${m[1]}\`, which is not there — an instruction that sends a reader somewhere empty`);
          broken++;
        }
      }
    }
  };
  for (const dir of ["docs", "scripts", "kernel/src", "runtime/src", "design/src",
    "one-space/src", "one/src", "apps"]) scan(dir);
  if (!broken) ok(`paths: all ${looked.size} file reference(s) in prose and comments resolve`);
}

console.log(`\ndocumentation: kinds declared, deferrals findable, inventories derived.`);
process.exit(bad ? 1 : 0);
