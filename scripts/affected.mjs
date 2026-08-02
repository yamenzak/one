#!/usr/bin/env node
/**
 * WHICH APPS DOES THIS PUSH ACTUALLY CHANGE?
 *
 * Every push to main redeployed every app. That is correct and wasteful: a
 * one-line fix in Kova's workout player redeployed Tessa, which had not changed
 * since the last time it was redeployed for the same reason. Each redeploy is a
 * new Worker version — a fresh isolate, a cold start for the first request of
 * every colo, and a version-history entry that says nothing happened.
 *
 * So the deploy matrix is filtered by what the diff touched, through the
 * workspace dependency graph: a change under `packages/ui` reaches both SPAs and
 * both apps deploy; a change under `apps/api` reaches Kova and nothing else.
 *
 * ── The bias is deliberate: over-deploy, never under-deploy ─────────────────
 *
 * Getting this wrong in one direction costs CI minutes. Getting it wrong in the
 * other means a fix that never ships, with a GREEN run saying it did — which is
 * the exact class of silent failure every other guard in this repo exists to
 * catch. So every uncertainty resolves to "deploy everything":
 *
 *   • no base commit, or a base git cannot resolve (first push, force-push,
 *     shallow clone) — the diff is unknowable, so nothing may be skipped
 *   • a changed path this does not recognise
 *   • anything at the repo root that could plausibly affect a build
 *
 * Plain Node, no dependencies, like the rest of `scripts/` — the workflows call
 * it before `pnpm install`, and a check that needs the workspace installed
 * cannot guard the workspace.
 *
 * Usage:
 *   node scripts/affected.mjs <base-sha>          # deploy matrix, as JSON
 *   node scripts/affected.mjs <base-sha> --e2e    # Playwright matrix, as JSON
 *   node scripts/affected.mjs <base-sha> --why    # the same decision, in words
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { apps, e2eMatrix } from "./apps.mjs";

const ROOT = new URL("..", import.meta.url).pathname;

/**
 * Paths that can never change what a worker serves.
 *
 * Prose only. A doc edit is the single commonest push to this repo and it has
 * no business minting a Worker version — but the list stays SHORT, because
 * every entry is a promise that a file cannot affect a build, and a wrong
 * promise here is a fix that silently does not ship.
 */
const IGNORED = [/^docs\//, /\.md$/i, /^\.gitignore$/, /^LICENSE$/i, /^\.vscode\//];

/**
 * Paths that affect EVERY app.
 *
 * The lockfile and the root configs change what every package resolves to;
 * `scripts/` and `.github/` change how everything is built and shipped;
 * `apps.json` changes what "everything" even means.
 */
const GLOBAL = [/^apps\.json$/, /^pnpm-lock\.yaml$/, /^pnpm-workspace\.yaml$/, /^package\.json$/, /^turbo\.json$/, /^tsconfig[^/]*\.json$/, /^scripts\//, /^\.github\//];

/** Every workspace package, by name → { dir, deps }. */
function workspace() {
  const byName = new Map();
  const byDir = new Map();
  for (const base of ["apps", "packages"]) {
    const root = join(ROOT, base);
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root)) {
      const dir = `${base}/${entry}`;
      const file = join(ROOT, dir, "package.json");
      if (!existsSync(file)) continue;
      let pkg;
      try {
        pkg = JSON.parse(readFileSync(file, "utf8"));
      } catch {
        continue; // an unreadable package.json is someone else's failure
      }
      if (!pkg.name) continue;
      const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
      byName.set(pkg.name, { dir, deps });
      byDir.set(dir, pkg.name);
    }
  }
  // Keep only workspace-internal edges; an npm dependency cannot be "changed"
  // by a commit in this repo.
  for (const v of byName.values()) v.deps = v.deps.filter((d) => byName.has(d));
  return { byName, byDir };
}

/** `name` plus everything it depends on, transitively. */
function closure(byName, name, seen = new Set()) {
  if (!name || seen.has(name) || !byName.has(name)) return seen;
  seen.add(name);
  for (const d of byName.get(name).deps) closure(byName, d, seen);
  return seen;
}

/** The files this push changed, or null when that cannot be determined. */
export function changedFiles(base) {
  if (!base || /^0+$/.test(base)) return null;
  try {
    const out = execFileSync("git", ["diff", "--name-only", `${base}`, "HEAD"], { cwd: ROOT, encoding: "utf8" });
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return null; // unknown base: a force-push, a shallow clone, a first push
  }
}

/**
 * Decide, for one list of changed files, which apps must deploy.
 *
 * Exported separately from the CLI so the test can drive it with a file list
 * instead of a git repository.
 */
export function affectedApps(files) {
  const deployable = apps.filter((a) => a.deploy);
  const all = () => deployable.map((a) => a.id);

  if (files === null) return { ids: all(), reason: "could not work out what changed — deploying everything" };

  const relevant = files.filter((f) => !IGNORED.some((re) => re.test(f)));
  if (relevant.length === 0) return { ids: [], reason: "only documentation changed" };

  if (relevant.some((f) => GLOBAL.some((re) => re.test(f)))) {
    return { ids: all(), reason: "a root-level file changed (lockfile, registry, scripts or workflows)" };
  }

  const { byName, byDir } = workspace();

  // Map each changed path to the workspace package that owns it. A path under
  // apps/ or packages/ that belongs to no package is not something this can
  // reason about, so it deploys everything.
  const touched = new Set();
  for (const f of relevant) {
    const m = /^((?:apps|packages)\/[^/]+)\//.exec(f);
    const name = m && byDir.get(m[1]);
    if (!name) return { ids: all(), reason: `changed path "${f}" belongs to no workspace package` };
    touched.add(name);
  }

  const ids = [];
  for (const a of deployable) {
    const worker = byDir.get(a.dir);
    // An app whose directory has no package.json cannot be reasoned about
    // either — deploy it rather than guess.
    if (!worker) return { ids: all(), reason: `"${a.id}" has no package.json to trace dependencies from` };
    const reach = closure(byName, worker);
    // The SPA is NOT a dependency of the worker — it is served through an
    // `assets` binding, which is a filesystem path. Same blind spot that made
    // Tessa's suite report "no tests"; here it would mean a UI-only change
    // deploying nothing.
    if (a.spa) for (const n of closure(byName, a.spa)) reach.add(n);
    if ([...touched].some((t) => reach.has(t))) ids.push(a.id);
  }

  return { ids, reason: `changed: ${[...touched].sort().join(", ")}` };
}

/** The deploy matrix, filtered — same shape `apps.mjs matrix` produces. */
export function affectedMatrix(base) {
  const { ids, reason } = affectedApps(changedFiles(base));
  const include = apps.filter((a) => a.deploy && ids.includes(a.id)).map((a) => ({ id: a.id, dir: a.dir, pre: a.preCommands ?? "" }));
  return { matrix: { include }, reason, skipped: apps.filter((a) => a.deploy && !ids.includes(a.id)).map((a) => a.id) };
}

/**
 * The Playwright matrix, filtered by the same rule.
 *
 * E2E is the slowest lane in CI — a Chromium download plus a real browser
 * against a real worker, per product — and a PR touching one product has no
 * reason to run the other's. An E2E suite's OWN files count as a change to it,
 * which the deploy filter deliberately ignores (a spec edit must not mint a
 * Worker version, but it absolutely must be run).
 */
export function affectedE2e(base) {
  const files = changedFiles(base);
  const { ids, reason } = affectedApps(files);
  const touchedSuite = new Set(
    (files ?? []).map((f) => /^apps\/([^/]+)\//.exec(f)?.[1]).filter(Boolean).map((d) => `apps/${d}`),
  );
  const include = e2eMatrix().include.filter((m) => ids.includes(m.id) || touchedSuite.has(m.dir));
  return { matrix: { include }, reason };
}

const isMain = process.argv[1] && process.argv[1].endsWith("affected.mjs");
if (isMain) {
  const [, , base, flag] = process.argv;
  if (flag === "--e2e") {
    console.log(JSON.stringify(affectedE2e(base).matrix));
    process.exit(0);
  }
  const { matrix, reason, skipped } = affectedMatrix(base);
  if (flag === "--why") {
    console.log(`deploying: ${matrix.include.map((m) => m.id).join(", ") || "(nothing)"}`);
    if (skipped.length) console.log(`unchanged: ${skipped.join(", ")}`);
    console.log(`because:   ${reason}`);
  } else {
    console.log(JSON.stringify(matrix));
  }
}
