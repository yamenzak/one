#!/usr/bin/env node
/**
 * THE META-GUARD — what makes the guard registry more than a list.
 *
 * ⚠️ THE FAILURE THIS EXISTS FOR: a document that says "enforced by a guard"
 * when nothing enforces it. That reads as safety, costs nothing to write, and is
 * expensive to disprove — so it survives review indefinitely and the platform
 * comes to believe it is stricter than it is.
 *
 * Four checks, each closing one way an enforcement promise can be empty:
 *
 *   1. SHAPE     a guard is a complete declaration or it is not a guard.
 *   2. BINDING   ⚠️ a `live` guard names a literal string its implementation
 *                contains. Rename the check and this fails — so a guard cannot
 *                stop existing quietly, which is the only way they ever do.
 *   3. INVOKED   a `live` guard is actually RUN by something. A check nobody
 *                calls is indistinguishable from no check, and looks better.
 *   4. OWED      an `owed` guard names a stage that is not shipped. The DEFER
 *                mechanism applied to enforcement: flipping a stage to shipped
 *                forces every guard it promised to be built, re-targeted with a
 *                reason, or dropped on purpose.
 *
 * The fifth is structural rather than a check here: PLAN.md §6 and UI.md §10 are
 * GENERATED from the registry, so prose cannot name a guard with no entry.
 * `docs.test.mjs` re-runs those commands and diffs them.
 *
 * Dependency-free Node — these run before `pnpm install` in CI.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, readGuards, readStages } from "./guards.mjs";

const REPO = join(ROOT, "..");
let bad = 0;
const fail = (m) => (console.error(`BAD  ${m}`), bad++);
const ok = (m) => console.log(`ok   ${m}`);

const guards = readGuards();
const stages = new Map(readStages().map((s) => [s.id, s]));
const GROUPS = new Set(["docs", "kernel", "platform", "interface"]);

/* ------------------------------------------------------------------ 1. SHAPE */

const seen = new Set();
for (const g of guards) {
  const at = `guards.json: ${g.id ?? "(no id)"}`;
  if (!g.id || !/^[a-z][a-z0-9-]*$/.test(g.id)) { fail(`${at}: id must be kebab-case.`); continue; }
  if (seen.has(g.id)) { fail(`${at}: duplicate id.`); continue; }
  seen.add(g.id);
  // ⚠️ "fails on" is the field that makes an entry actionable. A guard described
  // by its name alone is one nobody can tell has been implemented wrongly.
  if (!g.fails || g.fails.length < 20) fail(`${at}: needs a \`fails\` saying what it refuses, specifically.`);
  if (!GROUPS.has(g.group)) fail(`${at}: group "${g.group}" is not one of ${[...GROUPS].join(", ")}.`);
  if (!stages.has(g.stage)) fail(`${at}: names stage "${g.stage}", which is not in docs/stages.json.`);
  if (g.status !== "live" && g.status !== "owed") fail(`${at}: status must be live or owed.`);
}
ok(`shape: ${seen.size} guard(s) declared`);

/* ---------------------------------------------------------------- 2. BINDING */

/**
 * ⚠️ A GUARD DIES BY RENAME, NOT BY DELETION.
 *
 * Nobody deletes a check on purpose. What happens is a refactor that renames the
 * assertion, or a rewrite that drops one branch of it, and the registry goes on
 * describing enforcement that left. Binding each live entry to a literal string
 * in its implementation makes that a build failure at the moment it happens.
 */
let liveCount = 0;
for (const g of guards.filter((x) => x.status === "live")) {
  liveCount++;
  const at = `guards.json: ${g.id}`;
  if (!g.impl || !g.proves) { fail(`${at}: a live guard names its \`impl\` and the \`proves\` string that implementation contains.`); continue; }
  const path = join(ROOT, g.impl);
  if (!existsSync(path)) { fail(`${at}: impl "${g.impl}" does not exist.`); continue; }
  const src = readFileSync(path, "utf8");
  if (!src.includes(g.proves)) {
    fail(`${at}: "${g.proves}" no longer appears in ${g.impl}.\n` +
         `       The check was renamed, rewritten or removed — and the registry still\n` +
         `       claims it. Restore it, or move this entry to owed with a stage.`);
  }
}
ok(`binding: ${liveCount} live guard(s) bound to a real assertion`);

/* ---------------------------------------------------------------- 3. INVOKED */

/**
 * A check that runs nowhere is worse than no check: it is a green line in a
 * registry that nothing produces. `.mjs` guards are named by a root script;
 * `.ts` guards live where the test runner finds them.
 */
const rootPkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
const invocations = `${rootPkg.scripts?.gate ?? ""} ${rootPkg.scripts?.["one:gate"] ?? ""}`;
for (const g of guards.filter((x) => x.status === "live" && x.impl)) {
  const at = `guards.json: ${g.id}`;
  if (g.impl.endsWith(".mjs")) {
    if (!invocations.includes(`platform/${g.impl}`)) {
      fail(`${at}: ${g.impl} is not named by the root \`gate\` or \`one:gate\` script, so it never runs.`);
    }
  } else if (!/^[^/]+\/test\/.+\.test\.ts$/.test(g.impl)) {
    fail(`${at}: ${g.impl} is not where the test runner looks (\`<package>/test/*.test.ts\`), so it never runs.`);
  }
}
ok(`invoked: every live guard is reached by \`pnpm gate\` or \`pnpm one:test\``);

/* ------------------------------------------------------------------- 4. OWED */

/**
 * ⚠️ THE RULE THE REGISTRY IS BUILT AROUND, and it is `stages.json`'s rule for
 * deferrals applied to enforcement. A stage is not finished when its code works;
 * it is finished when it owes nothing — including the guards it promised, which
 * are exactly what gets dropped when a stage is being closed under pressure.
 */
const owed = guards.filter((x) => x.status === "owed");
for (const g of owed) {
  const s = stages.get(g.stage);
  if (s?.status === "shipped") {
    fail(`guards.json: ${g.id} is owed by stage ${g.stage} ("${s.title}"), which is SHIPPED.\n` +
         `       Build it, re-target it at a later stage with a reason, or delete the entry\n` +
         `       on purpose — a shipped stage may not still owe enforcement.`);
  }
}
const byStage = [...stages.values()].map((s) => [s.id, owed.filter((g) => g.stage === s.id).length]).filter(([, n]) => n);
ok(`owed: ${owed.length} guard(s) outstanding — ${byStage.map(([id, n]) => `stage ${id}: ${n}`).join(", ")}`);

/* -------------------------------------------------------------------------- */

if (bad) {
  console.error(`\n${bad} guard-registry failure(s).`);
  process.exit(1);
}
console.log(`\nguards: ${liveCount} live, ${owed.length} owed, every promise accounted for.`);
