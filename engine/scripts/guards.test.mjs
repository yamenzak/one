/**
 * THE GUARD REGISTRY, HELD TO ITS OWN RULES.
 *
 * ⚠️ A REGISTRY NOTHING CHECKS IS A LIST OF PROMISES. Four rules make this one
 * load-bearing, and each closes a way a guard stops existing without anybody
 * deciding it should:
 *
 *   binding  — a live guard names a literal string its implementation contains,
 *              so renaming the assertion fails the registry rather than silently
 *              orphaning the entry.
 *   invoked  — a live guard's implementation is reached by a command CI runs. A
 *              check nobody calls is no check.
 *   protects — every guard names the decision it defends, so its reason outlives
 *              the conversation that produced it. Without this, a guard whose
 *              purpose is forgotten is deleted as noise.
 *   owed     — an outstanding guard names a stage, and a SHIPPED stage may owe
 *              nothing. That is what makes the stage table mean something.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { knownStages, shippedStages, stages } from "./lib/stages.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");
const ROOT = join(ENGINE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const registry = JSON.parse(readFileSync(join(ENGINE, "docs/guards.json"), "utf8"));
const guards = registry.guards;
const decisions = readFileSync(join(ENGINE, "docs/DECISIONS.md"), "utf8");
const known = new Set([...decisions.matchAll(/^## (D\d+)/gm)].map((m) => m[1]));

/* ------------------------------------------------------------- the shape --- */

const seen = new Set();
for (const g of guards) {
  const where = g.id ?? JSON.stringify(g).slice(0, 60);
  if (!g.id) fail(`a guard with no id: ${where}`);
  if (seen.has(g.id)) fail(`${g.id}: declared twice`);
  seen.add(g.id);
  if (!g.fails) fail(`${g.id}: says nothing about what goes wrong when it breaks`);
  /*
    ⚠️ `fails` IS A CONSEQUENCE IN THE WORLD, and the check is crude on purpose:
    a restatement of the assertion tells a reader nothing they could not see, and
    the whole value of the field is that somebody reading a failure understands
    why they should care.
  */
  if (g.fails && g.fails.length < 30) fail(`${g.id}: "${g.fails}" is a label, not a consequence`);
  if (!["live", "owed"].includes(g.status)) fail(`${g.id}: status is neither live nor owed`);
}
ok(`shape: ${guards.length} guard(s) declared`);

/* ------------------------------------------------------------- protects: --- */

for (const g of guards) {
  if (!g.protects) { fail(`${g.id}: names no decision — its reason will not outlive this week`); continue; }
  if (!known.has(g.protects)) fail(`${g.id}: protects ${g.protects}, which DECISIONS.md does not record`);
}
ok(`protects: every guard names a decision, and every decision is recorded`);

/* -------------------------------------------------------------- binding --- */

const live = guards.filter((g) => g.status === "live");
for (const g of live) {
  if (!g.impl || !g.proves) { fail(`${g.id}: live with no implementation or nothing it proves`); continue; }
  const file = join(ENGINE, g.impl);
  if (!existsSync(file)) { fail(`${g.id}: ${g.impl} does not exist`); continue; }
  if (!readFileSync(file, "utf8").includes(g.proves)) {
    fail(`${g.id}: "${g.proves}" no longer appears in ${g.impl}.\n` +
         `       The check was renamed or removed, and the registry went on promising it.`);
  }
}
ok(`binding: ${live.length} live guard(s) bound to a real assertion`);

/* -------------------------------------------------------------- invoked --- */

/**
 * ⚠️ THE GATE NAMES ITS GUARDS IN `gate.mjs` NOW, NOT IN A `&&` CHAIN, so this
 * reads both. It matters more than it looks: `metrics.test.mjs` was a
 * two-hundred-line check in neither the chain nor this registry — the design
 * README listed it as a guard, and it had been accumulating findings that
 * nothing ran and nothing knew about.
 */
const scripts = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts;

/**
 * ⚠️ A DOCUMENT'S GENERATED BLOCK IS ALSO A COMMAND CI RUNS, and reading only
 * the gate misses it. `docs.test.mjs` executes every `<!-- generated: … -->`
 * command and reports a REFUSAL as that document's failure, so a generator that
 * refuses fails the gate exactly as a named guard does — `enforced.mjs` is one,
 * and it is what stops DESIGN.md §8 from silently omitting a guard again.
 * Without this the registry would have called it uninvoked and the only ways out
 * would be running it twice or not registering it at all.
 */
const generators = ["docs", "design"].flatMap((dir) =>
  readdirSync(join(ENGINE, dir))
    .filter((f) => f.endsWith(".md"))
    .flatMap((f) => [...readFileSync(join(ENGINE, dir, f), "utf8")
      .matchAll(/<!--\s*generated:\s*(.+?)\s*-->/g)].map((m) => m[1])));

const commands = [
  scripts["engine:gate"] ?? "", scripts["engine:test"] ?? "", scripts["engine:typecheck"] ?? "",
  readFileSync(join(ENGINE, "scripts/gate.mjs"), "utf8"),
  ...generators,
].join(" ");
/**
 * ⚠️ THERE ARE TWO TEST LANES NOW, AND A GUARD MUST SAY WHICH IT IS IN. A
 * `*.seen.test.*` file launches a browser, so it is excluded from `engine:test`
 * and runs in `engine:seen`, which CI does not call — a deliberate trade, and
 * exactly the kind that becomes a lie the moment a registry goes on claiming CI
 * runs it. `"lane": "seen"` is the declaration; it has to match the filename in
 * both directions, so neither a guard quietly leaving the fast lane nor a stale
 * tag left behind by a rename can pass.
 */
let slow = 0;
for (const g of live) {
  /* A vitest file is reached by `engine:test`; an .mjs guard has to be named. */
  const stem = g.impl.replace(/^scripts\//, "").replace(/\.test\.mjs$/, "");
  /* ⚠️ `g.impl` ON ITS OWN, because a generated block names the path from the
     engine directory (`node scripts/enforced.mjs`) rather than from the root. */
  if (g.impl.endsWith(".mjs") && !commands.includes(`engine/${g.impl}`)
      && !commands.includes(g.impl) && !commands.includes(`"${stem}"`)) {
    fail(`${g.id}: ${g.impl} is not named by engine:gate, so it never runs`);
  }

  const browser = /\.seen\.test\./.test(g.impl);
  if (browser && g.lane !== "seen") {
    fail(`${g.id}: ${g.impl} runs in the browser lane and the entry does not say so.\n`
      + `       Add "lane": "seen". CI does not run it — a registry claiming otherwise is `
      + "how a guard comes to be trusted for something nobody checks.");
  } else if (!browser && g.lane === "seen") {
    fail(`${g.id}: tagged \`lane: "seen"\` and ${g.impl} is not a \`.seen.\` file.\n`
      + "       It runs in `engine:test` after all, so the tag understates it — a guard filed as "
      + "slow is one nobody expects a red run from.");
  } else if (browser) {
    slow++;
    if (!scripts["engine:seen"]) {
      fail(`${g.id}: the browser lane has no \`engine:seen\` command to run it.`);
    }
  }
}
ok(`invoked: every live guard is reached by a command — ${live.length - slow} by CI, `
  + `${slow} by \`pnpm engine:seen\``);

/* ----------------------------------------------------------------- owed --- */

const owed = guards.filter((g) => g.status === "owed");
for (const g of owed) if (!g.stage) fail(`${g.id}: owed against no stage, so nothing will ever force it`);

/*
  ⚠️ AND A SHIPPED STAGE MAY OWE NOTHING. Without this the stage table is a mood:
  a stage gets marked shipped, its outstanding guards keep their entry, and the
  word stops meaning that the thing is actually defended. The stage REGISTRY is
  read rather than a second list kept here, because two lists disagree.
*/
const shipped = shippedStages();
for (const g of owed) {
  if (shipped.has(String(g.stage))) {
    fail(`${g.id}: owed against stage ${g.stage}, which the stage registry calls shipped.\n` +
         `       Either the guard is due now, or "shipped" has stopped meaning defended.`);
  }
}
const byStage = {};
for (const g of owed) byStage[g.stage] = (byStage[g.stage] ?? 0) + 1;

/* --------------------------------------------------------------- staged --- */

/**
 * ⚠️ THE STAGE REGISTRY IS READ BY FOUR CHECKS AND NOTHING CHECKED THE REGISTRY.
 * Two rows carrying the same number is a table where one of them is invisible —
 * whichever a reader's eye or a `Map` drops — so a stage can be shipped, deferred
 * against and owed at the same time, with every check reporting green about the
 * row it happened to see. The document renders both, which is the only place it
 * shows at all, and by then it reads as a formatting mistake rather than a
 * registry that has stopped meaning one thing per number.
 */
{
  const rows = stages();
  const seen = new Set();
  for (const s of rows) {
    if (seen.has(s.n)) fail(`docs/stages.json: stage ${s.n} appears twice, so one of the two is a row nothing can see`);
    seen.add(s.n);
    if (s.status !== "shipped" && s.status !== "planned") {
      fail(`docs/stages.json: stage ${s.n} is "${s.status}", which is neither shipped nor planned`);
    }
    if (!String(s.title ?? "").trim()) fail(`docs/stages.json: stage ${s.n} has no title`);
  }

  /* ⚠️ AND A GUARD MAY NOT PROTECT WORK THAT IS NOT ON THE MAP. */
  const known = knownStages();
  for (const g of guards) {
    if (g.stage && !known.has(String(g.stage))) {
      fail(`${g.id}: names stage ${g.stage}, which the registry has no row for — `
        + `a guard protecting work nobody has planned`);
    }
  }
  ok(`staged: ${rows.length} stage(s), each numbered once, and every guard on the map`);
}
ok(`owed: ${owed.length} guard(s) outstanding — ${Object.entries(byStage).map(([s, n]) => `stage ${s}: ${n}`).join(", ") || "none"}`);

/* --------------------------------------------------------------- legible --- */

/**
 * ⚠️ A GUARD'S REGEX CANNOT CONTAIN A CHARACTER NOBODY CAN SEE, AND ONE DID.
 * `/<InputOTP\.Slot\b/` was written into a guard through a tool that read `\b`
 * as an escape, so what landed in the file was a literal BACKSPACE where the
 * word boundary should be. The regex is unmatchable. The guard ran, found
 * nothing, and printed `ok` — about the one defect it had just been written to
 * catch — and `git diff`, `grep` and review all render it as the correct line.
 *
 * ⚠️ WHICH IS THE WORST SHAPE A FAILURE CAN TAKE HERE: a check that reports
 * green about the thing it exists to find. It only surfaced because the guard
 * was mutation-tested; a guard added without that would have been permanently,
 * invisibly inert.
 *
 * ⚠️ TAB IS THE ONE EXEMPTION, because a tab is a character somebody typed on
 * purpose. Everything else in C0 is not.
 */
const INVISIBLE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const walk = (dir, out = []) => {
  const at = join(ENGINE, dir);
  if (!existsSync(at)) return out;
  for (const e of readdirSync(at, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
    const path = join(dir, e.name);
    if (e.isDirectory()) walk(path, out);
    else if (/\.(mjs|ts|tsx|css)$/.test(e.name)) out.push(path);
  }
  return out;
};
let hidden = 0;
let read = 0;
for (const rel of [...walk("scripts"), ...walk("kernel/src"), ...walk("runtime/src"),
                   ...walk("design/src"), ...walk("one-space/src"), ...walk("apps")]) {
  read++;
  const lines = readFileSync(join(ENGINE, rel), "utf8").split("\n");
  lines.forEach((line, i) => {
    if (!INVISIBLE.test(line)) return;
    hidden++;
    const at = [...line].findIndex((c) => INVISIBLE.test(c));
    fail(`${rel}:${i + 1}: a character nothing renders, at column ${at + 1}.\n` +
         `       It reads as correct in a diff, in grep and in review. In a regex it is a\n` +
         `       pattern that can never match, and the check around it reports green.`);
  });
}
if (!hidden) ok(`legible: ${read} source file(s), none holding a character nothing renders`);

/* ------------------------------------------------------- the failure names --- */

/**
 * ⚠️ THE CATALOGUE IN DESIGN.md §8 NAMES A GUARD PER FAULT, AND THAT IS ITS
 * ENTRY CONDITION. A named failure with no check behind it is folklore: it reads
 * as covered, nothing covers it, and the row survives every renaming of the
 * thing that used to catch it. So every guard the table cites has to be one the
 * gate actually runs, and a guard that is retired takes its rows with it.
 *
 * ⚠️ READ OUT OF THE TABLE RATHER THAN LISTED HERE. A second copy of the names
 * would be the same drift one file over.
 */
const CATALOGUE = readFileSync(join(ENGINE, "design/DESIGN.md"), "utf8");
const table = /### The failures, by name([\s\S]*?)\n### /.exec(CATALOGUE);
if (!table) {
  fail(`design/DESIGN.md: no failure catalogue to check — if it is gone, drop this on purpose.`);
} else {
  const rows = [...table[1].matchAll(/^\|\s\*\*(.+?)\*\*\s\|.*\|(.*)\|\s*$/gm)];
  const runs = new Set(
    [...readFileSync(join(ENGINE, "scripts/gate.mjs"), "utf8")
      .matchAll(/"([a-z-]+)"/g)].map((m) => m[1]),
  );
  /**
   * ⚠️ AND A ROW MAY CITE THE BROWSER LANE, WHICH THE GATE DELIBERATELY DOES NOT
   * RUN (D49). Contrast is a rendered fact — a token pair after a `color-mix`, a
   * theme and a workspace's brand — so the only thing that can check it is a
   * page in a real browser, and refusing that citation would push a whole class
   * of fault back into prose.
   */
  const browserChecks = new Set(
    [...walk("design/test"), ...walk("one-space/test"), ...walk("apps")]
      .filter((p) => /\.seen\.test\.[jt]sx?$/.test(p))
      .map((p) => p.split("/").pop().replace(/\.seen\.test\..*$/, "")),
  );
  let unbacked = 0;
  for (const [, name, cited] of rows) {
    for (const [, guard] of cited.matchAll(/`([a-z-]+)(?:\.seen)?`/g)) {
      if (runs.has(guard) || (/\.seen`/.test(cited) && browserChecks.has(guard))) continue;
      unbacked++;
      fail(`design/DESIGN.md: "${name}" cites \`${guard}\`, which nothing runs.\n` +
        `       A named failure with no check behind it reads as covered and is not.`);
    }
  }
  if (!rows.length) {
    fail(`design/DESIGN.md: the failure catalogue has no rows — see the header there.`);
  } else if (!unbacked) {
    ok(`catalogue: ${rows.length} named failure(s), every one citing a check that runs`);
  }
}

console.log(`\nguards: ${live.length} live, ${owed.length} owed, every promise accounted for.`);
process.exit(bad ? 1 : 0);
