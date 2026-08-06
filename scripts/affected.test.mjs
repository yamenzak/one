#!/usr/bin/env node
/**
 * The deploy filter, against hand-written file lists.
 *
 * This decides whether a fix ships, so the tests that matter are the ones about
 * the UNSAFE direction. Skipping an app that did change is a green run for a
 * deploy that never happened — the exact silent-success class every other guard
 * in this repo exists to catch — so every ambiguity has to resolve to "deploy
 * everything", and each of those paths is asserted by name.
 *
 * Plain Node with `node:assert`, like the repo's other script tests: the
 * workflows run it before `pnpm install`, so it cannot need vitest.
 */

import assert from "node:assert/strict";
import { affectedApps } from "./affected.mjs";
import { apps } from "./apps.mjs";

let failures = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.error(`  ✗ ${name}\n    ${e.message}`);
  }
};

const ids = (files) => affectedApps(files).ids.sort();
/** Every app the registry says is deployable — see the fail-open note below. */
const EVERY = apps.filter((a) => a.deploy !== false).map((a) => a.id).sort();

console.log("affected apps");

// ── The point of the whole thing ────────────────────────────────────────────

test("a change inside one app deploys only that app", () => {
  assert.deepEqual(ids(["apps/api/src/index.ts"]), ["kova"]);
  assert.deepEqual(ids(["apps/tessa/src/index.ts"]), ["tessa"]);
});

test("a change to an app's SPA deploys that app", () => {
  // The SPA is not a dependency of the worker — it is served through an
  // `assets` binding, a filesystem path. Missing this would mean a UI-only
  // change deploying nothing at all.
  assert.deepEqual(ids(["apps/app/src/Shell.tsx"]), ["kova"]);
  assert.deepEqual(ids(["apps/tessa-app/src/screens/Admin.tsx"]), ["tessa"]);
});

test("a change to a shared package deploys every app that reaches it", () => {
  assert.deepEqual(ids(["packages/core/src/config.ts"]), ["kova", "tessa"]);
  assert.deepEqual(ids(["packages/ui/src/index.ts"]), ["kova", "tessa"]);
});

test("a change to one product's own domain package deploys only that product", () => {
  assert.deepEqual(ids(["packages/domain/src/lapse.ts"]), ["kova"]);
});

test("a change to an E2E suite deploys nothing", () => {
  // `@kova/e2e` is nobody's dependency — it drives the worker, it is not part
  // of it. A Playwright edit minting a Worker version would be pure noise.
  assert.deepEqual(ids(["apps/e2e/src/plan.spec.ts"]), []);
});

test("documentation alone deploys nothing", () => {
  assert.deepEqual(ids(["README.md", "docs/SHIPPING-AN-APP.md", "CLAUDE.md"]), []);
});

test("docs alongside code still deploy the code's app", () => {
  assert.deepEqual(ids(["CLAUDE.md", "apps/api/src/db.ts"]), ["kova"]);
});

// ── Every path that must fail OPEN ──────────────────────────────────────────
//
// `EVERY` comes from the REGISTRY, not from the function under test. It was a
// literal `["kova", "tessa", "www"]`, and adding Scena's three workers turned
// five fail-open assertions red at once — each correct about the behaviour and
// merely stale about the cast.
//
// ⚠️ The obvious repair is `const EVERY = ids(null)`, which is WRONG: it makes
// "an unknown base deploys everything" assert `ids(null) === ids(null)`, which
// passes for a filter that deploys nothing at all. The list has to come from a
// source the filter does not control, so reading apps.json is the fix and
// calling the filter twice is not.

test("an unknown base deploys everything", () => {
  assert.deepEqual(ids(null), EVERY);
});

test("a root-level file deploys everything", () => {
  for (const f of ["pnpm-lock.yaml", "apps.json", "turbo.json", "package.json", "tsconfig.json"]) {
    assert.deepEqual(ids([f]), EVERY, f);
  }
});

test("a change to the scripts or the workflows deploys everything", () => {
  assert.deepEqual(ids(["scripts/affected.mjs"]), EVERY);
  assert.deepEqual(ids([".github/workflows/deploy.yml"]), EVERY);
});

test("a path under apps/ or packages/ that owns no package deploys everything", () => {
  assert.deepEqual(ids(["packages/brand/logo.svg"]), EVERY);
});

test("an unrecognised top-level path deploys everything", () => {
  assert.deepEqual(ids(["Dockerfile"]), EVERY);
});

// ── The registry's own shape ────────────────────────────────────────────────

test("a static site with no package graph is not silently dropped", () => {
  // `www` is deployable and has its own package; a change there must reach it
  // and must NOT reach the workers.
  assert.deepEqual(ids(["apps/www/build.mjs"]), ["www"]);
});

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("✓ the deploy filter fails open on every ambiguity");
