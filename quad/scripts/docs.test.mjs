/**
 * THE DOCUMENTS, HELD TO STANDARDS.md.
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

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const QUAD = join(HERE, "..");
const DOCS = join(QUAD, "docs");
const WRITE = process.argv.includes("--write");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const files = readdirSync(DOCS).filter((f) => f.endsWith(".md"));
const read = (f) => readFileSync(join(DOCS, f), "utf8");

/* ------------------------------------------------------------------ kind --- */

/**
 * ⚠️ A DOCUMENT THAT DOES NOT SAY WHAT IT IS gets read as whatever the reader
 * expected — a sketch quoted as a decision, a decision skimmed as a sketch.
 */
const KINDS = ["plan", "decisions", "standards", "progress", "guide"];
for (const f of files) {
  const kind = /^kind:\s*(\S+)/m.exec(read(f))?.[1];
  if (!kind) fail(`docs/${f}: declares no kind:`);
  else if (!KINDS.includes(kind)) fail(`docs/${f}: kind: ${kind} is not one of ${KINDS.join(", ")}`);
}
ok(`kind: ${files.length} document(s) declared`);

/* --------------------------------------------------------------- orphans --- */

/**
 * ⚠️ A DOCUMENT NOTHING LINKS TO IS ONE NOBODY OPENS, and it goes on being true
 * of a codebase that has moved. PLAN.md is the root of the graph because it is
 * what §0 tells a cold reader to start from.
 */
const linked = new Set(["PLAN.md"]);
for (const f of files) for (const m of read(f).matchAll(/\]\(([A-Z][A-Za-z-]*\.md)\)/g)) linked.add(m[1]);
const orphans = files.filter((f) => !linked.has(f));
for (const f of orphans) fail(`docs/${f}: nothing links to it`);
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
walk(QUAD);

const markers = [];
for (const file of source) {
  for (const m of readFileSync(file, "utf8").matchAll(/DEFER\((quad-\d+)\)\s*stage:(\d+)/g)) {
    markers.push({ id: m[1], stage: m[2], file: file.slice(QUAD.length + 1) });
  }
}

const shipped = new Set(
  [...read("PROGRESS.md").matchAll(/^\|\s*(\d+)\s*\|[^|]*\|\s*shipped\s*\|/gim)].map((m) => m[1]),
);
for (const d of markers) {
  if (shipped.has(d.stage)) {
    fail(`${d.file}: ${d.id} defers to stage ${d.stage}, which PROGRESS.md calls shipped.\n` +
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
 * ⚠️ A BLOCK INSIDE A CODE FENCE IS AN EXAMPLE, NOT A BLOCK. STANDARDS.md shows
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
    const fresh = execSync(command, { cwd: QUAD, encoding: "utf8" }).trim();
    if (!WRITE && body.trim() !== fresh) {
      fail(`docs/${f}: generated block is stale — \`${command}\` produces different output.\n` +
           `       Run \`node quad/scripts/docs.test.mjs --write\`.`);
    }
    return `<!-- generated: ${command} -->\n${fresh}\n<!-- /generated -->`;
  });
  if (WRITE && after !== before) writeFileSync(join(DOCS, f), after);
}
ok(`generated: ${blocks} verified block(s)`);

console.log(`\ndocumentation: kinds declared, deferrals findable, inventories derived.`);
process.exit(bad ? 1 : 0);
