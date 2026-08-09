#!/usr/bin/env node
/**
 * WHAT A SUITE COSTS, AND WHY IT IS A GUARD RATHER THAN A PREFERENCE.
 *
 * ⚠️ A SLOW SUITE IS NOT RUN. Not "run less often" — not run: locally it gets
 * skipped with a filter, in review it gets waited out once and trusted after
 * that, and in CI it becomes the reason somebody proposes splitting the pipeline
 * into a fast lane that is the only one anybody watches.
 *
 * The cap is per app and deliberately uncomfortable. Every way of coming in
 * under it is a good change: fewer fixtures, a shared world, a unit test where
 * an integration test was doing the work of one. The bad way — deleting
 * coverage — is visible in the same diff.
 *
 * ⚠️ AND IT MEASURES RATHER THAN ASKS. A budget nobody times is a comment.
 *
 * Dependency-free Node — this runs before `pnpm install` in CI.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let bad = 0;
const fail = (m) => (console.error(`BAD  ${m}`), bad++);
const ok = (m) => console.log(`ok   ${m}`);

/**
 * ⚠️ SECONDS, PER APP, AND ONE NUMBER FOR EVERY APP. A per-app budget is one
 * that gets raised for whichever app is slowest, one app at a time, until it
 * describes what the suite happens to take rather than what it may take.
 */
const CAP_SECONDS = 120;

const apps = readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(ROOT, e.name, "src", "manifest.ts")))
  .map((e) => e.name);

if (apps.length === 0) fail(`no app found under platform/ — the budget check has nothing to measure.`);

for (const app of apps) {
  const started = Date.now();
  try {
    execFileSync("pnpm", ["--filter", `@one/${app}`, "test"], { cwd: join(ROOT, ".."), stdio: "ignore" });
  } catch {
    fail(`${app}: its own suite does not pass, so its duration means nothing.`);
    continue;
  }
  const seconds = (Date.now() - started) / 1000;
  if (seconds > CAP_SECONDS) {
    fail(`${app}: its suite took ${seconds.toFixed(0)}s, over the ${CAP_SECONDS}s cap.\n` +
         `       A slow suite is not run less often, it is not run — skipped locally with a\n` +
         `       filter, waited out once in review, and the reason somebody proposes a fast\n` +
         `       lane that becomes the only one anybody watches. Solve the fixtures.`);
  } else {
    ok(`${app}: ${seconds.toFixed(0)}s of ${CAP_SECONDS}s`);
  }
}

if (bad) {
  console.error(`\n${bad} test-budget failure(s).`);
  process.exit(1);
}
console.log(`\nbudget: ${apps.length} app suite(s) measured, all inside the cap.`);
