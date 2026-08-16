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

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

const scripts = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts;
const commands = [scripts["engine:gate"] ?? "", scripts["engine:test"] ?? "", scripts["engine:typecheck"] ?? ""].join(" ");
for (const g of live) {
  /* A vitest file is reached by `engine:test`; an .mjs guard has to be named. */
  if (g.impl.endsWith(".mjs") && !commands.includes(g.impl.replace(/^/, "engine/"))) {
    fail(`${g.id}: ${g.impl} is not named by engine:gate, so it never runs`);
  }
}
ok(`invoked: every live guard is reached by a command CI runs`);

/* ----------------------------------------------------------------- owed --- */

const owed = guards.filter((g) => g.status === "owed");
for (const g of owed) if (!g.stage) fail(`${g.id}: owed against no stage, so nothing will ever force it`);

/*
  ⚠️ AND A SHIPPED STAGE MAY OWE NOTHING. Without this the stage table is a mood:
  a stage gets marked shipped, its outstanding guards keep their entry, and the
  word stops meaning that the thing is actually defended. `PROGRESS.md` is read
  rather than a second list kept here, because two lists disagree.
*/
const progress = readFileSync(join(ENGINE, "docs/PROGRESS.md"), "utf8");
const shipped = new Set([...progress.matchAll(/^\|\s*(\d+)\s*\|[^|]*\|\s*shipped\s*\|/gm)].map((m) => m[1]));
for (const g of owed) {
  if (shipped.has(String(g.stage))) {
    fail(`${g.id}: owed against stage ${g.stage}, which PROGRESS.md calls shipped.\n` +
         `       Either the guard is due now, or "shipped" has stopped meaning defended.`);
  }
}
const byStage = {};
for (const g of owed) byStage[g.stage] = (byStage[g.stage] ?? 0) + 1;
ok(`owed: ${owed.length} guard(s) outstanding — ${Object.entries(byStage).map(([s, n]) => `stage ${s}: ${n}`).join(", ") || "none"}`);

console.log(`\nguards: ${live.length} live, ${owed.length} owed, every promise accounted for.`);
process.exit(bad ? 1 : 0);
