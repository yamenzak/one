#!/usr/bin/env node
/**
 * A NEW APP CANNOT BE FORGOTTEN.
 *
 * `apps.json` only helps if it is complete. The failure mode is specific and it
 * has already happened once: nobody forgets the app they are currently building,
 * they forget the CI step for it — and the symptom was a test suite reporting
 * "no tests", which reads as a pass.
 *
 * So this walks `apps/` and fails on anything that has a `wrangler.jsonc` and is
 * not registered. It also checks the parts of a registration that are silently
 * wrong rather than loudly wrong: a `spa` naming a package that does not exist,
 * a `dir` that is not there, an app declaring resources with no wrangler config
 * to bind them in.
 *
 * Plain Node, no dependencies — it runs BEFORE `pnpm install` in CI, because a
 * check that needs the workspace installed cannot guard the install itself.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { apps, boundIds, discoverWorkerDirs, emailSql, isProvisioned, packageDir, registry, sender } from "./apps.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const problems = [];
const fail = (msg) => problems.push(msg);

// ── Every worker directory is registered ────────────────────────────────────
//
// `apps/_template` is the deliberate exception: it exists to be COPIED, and
// registering it would deploy a worker with no product in it.
const registered = new Set(apps.map((a) => a.dir));
for (const dir of discoverWorkerDirs()) {
  if (dir.endsWith("_template")) continue;
  if (!registered.has(dir)) {
    fail(`${dir} has a wrangler.jsonc but is not in apps.json — CI will not build it, and its tests may silently report "no tests".`);
  }
}

// ── Every registration points at something real ─────────────────────────────
for (const a of apps) {
  if (!existsSync(join(ROOT, a.dir))) fail(`apps.json: "${a.id}" names dir ${a.dir}, which does not exist.`);

  // The SPA is the one that bit: its build must run before the worker's tests,
  // because the worker serves it through an `assets` binding.
  if (a.spa && !packageDir(a.spa)) {
    fail(`apps.json: "${a.id}".spa is "${a.spa}", which is not a package in this workspace.`);
  }

  // The e2e name has to RESOLVE, not just exist: CI uploads its report from the
  // directory `packageDir` returns, and a null there silently uploads nothing.
  if (a.e2e && !packageDir(a.e2e)) fail(`apps.json: "${a.id}".e2e is "${a.e2e}", which is not a package in this workspace.`);

  if (a.provision) {
    if (!existsSync(join(ROOT, a.dir, "wrangler.jsonc"))) {
      fail(`apps.json: "${a.id}" declares resources but ${a.dir}/wrangler.jsonc does not exist to bind them.`);
    } else if (!a.provision.d1) {
      // The provisioning workflow branches on this name to adopt-or-create.
      // Absent, it would create a database called `null`.
      fail(`apps.json: "${a.id}".provision has no "d1" name for the provisioning workflow to create or adopt.`);
    } else if (a.provision.kv && !boundIds(a.id).kv) {
      // A KV binding named in the registry but absent from the config means the
      // workflow looks up an id it then has nowhere to write.
      fail(`apps.json: "${a.id}" declares KV "${a.provision.kv}", but ${a.dir}/wrangler.jsonc binds no such namespace.`);
    }
  }

  // Every app that sends mail must resolve to the ONE platform sender. A
  // per-app address is how you end up with a plausible default that bounces.
  if (a.email) {
    const from = sender(a.id);
    if (!from.includes(registry.defaultEmailAddress)) {
      fail(`apps.json: "${a.id}" does not use the platform sender ${registry.defaultEmailAddress}.`);
    }
    const sql = emailSql(a.id);
    // `DO UPDATE` here would reset a live deployment's configured sender every
    // time somebody re-ran provisioning.
    if (!sql.includes("DO NOTHING")) fail(`"${a.id}" email seeding must not overwrite an existing value.`);
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
if (problems.length) {
  for (const p of problems) console.error(`BAD  ${p}`);
  console.error(`\n${problems.length} problem(s) in apps.json.`);
  process.exit(1);
}

console.log(`✓ apps.json covers ${apps.length} app(s): ${apps.map((a) => a.id).join(", ")}`);
for (const a of apps) {
  if (a.provision) console.log(`  ${a.id}: ${isProvisioned(a.id) ? "provisioned" : "PLACEHOLDER ids — deploy will skip"}`);
}
