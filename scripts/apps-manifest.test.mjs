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

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  apps,
  boundIds,
  discoverWorkerDirs,
  emailSql,
  isProvisioned,
  packageDir,
  publicOrigin,
  registry,
  sender,
  uncommented,
  wranglerText,
} from "./apps.mjs";

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

// ── The JSONC reader does not eat `//` inside a string ──────────────────────
//
// `uncommented` blanks comments so brackets can be matched and values read. The
// naive version blanks from any `//` to end of line, which also destroys the one
// inside `"https://kova.4dl.app"` — so the origin read back as `https:` and the
// boot check below would have probed a nonsense URL and reported it unreachable.
// Silent, and in the direction that looks like a real outage.
{
  const sample = '{ "url": "https://example.com/x", // a comment [ with a bracket\n  "n": 1 }';
  const scrubbed = uncommented(sample);
  if (scrubbed.length !== sample.length) fail("uncommented() must preserve length — positions are used to edit the real text.");
  if (!scrubbed.includes("https://example.com/x")) fail("uncommented() ate a `//` inside a string literal.");
  if (scrubbed.includes("a comment")) fail("uncommented() left a real comment in place.");
}

// ── Every app's public origin is usable, and the boot check is wired ─────────
//
// The origin is read from the worker's own `BETTER_AUTH_URL` rather than
// duplicated into the registry, so there is nothing to drift — but a typo there
// would make the boot check probe the wrong host and fail a healthy deploy.
for (const a of apps) {
  const origin = publicOrigin(a.id);
  if (!origin) {
    // Fine for a static site. Not fine for a worker that declares the var and
    // has it mangled — distinguish the two.
    if (/"BETTER_AUTH_URL"/.test(uncommented(existsSync(join(ROOT, a.dir, "wrangler.jsonc")) ? wranglerText(a.id) : ""))) {
      fail(`"${a.id}" declares BETTER_AUTH_URL but publicOrigin() read nothing from it.`);
    }
    continue;
  }
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") fail(`"${a.id}" BETTER_AUTH_URL is ${origin} — the boot check needs an https origin.`);
    if (u.pathname !== "/") fail(`"${a.id}" BETTER_AUTH_URL is ${origin} — it must be an origin, with no path.`);
  } catch {
    fail(`"${a.id}" BETTER_AUTH_URL is not a URL: ${JSON.stringify(origin)}.`);
  }
}

// ── An operator console nobody can open is not a console ────────────────────
//
// `ADMIN_EMAILS` empty means NOBODY outside development — `isPlatformAdminFor`
// fails closed rather than promoting every signed-in user, which is the right
// call and also means a blank value is indistinguishable from a considered one.
// Tessa scaffolded from the template with it blank and shipped that way: the
// `admin.` door answered "you're signed in, but you are not an operator" to the
// person who owns the deployment.
//
// Only apps that DECLARE the var are checked. Not declaring it is a coherent
// statement ("this app has no operator console"); declaring it empty is not.
for (const a of apps) {
  if (!existsSync(join(ROOT, a.dir, "wrangler.jsonc"))) continue;
  const text = uncommented(wranglerText(a.id));
  const m = /"ADMIN_EMAILS"\s*:\s*"([^"]*)"/.exec(text);
  if (m && !m[1].trim()) {
    fail(`"${a.id}" declares ADMIN_EMAILS but leaves it empty — its admin. door is unreachable by anyone in production.`);
  }
}

// A deploy that cannot tell "shipped" from "working" is how Tessa stayed green
// and dead for a day. Both workflows must run the check; a silent removal is
// exactly the regression this file exists to catch.
for (const wf of ["deploy.yml", "provision.yml"]) {
  const path = join(ROOT, ".github/workflows", wf);
  if (!existsSync(path)) {
    fail(`.github/workflows/${wf} is missing.`);
  } else if (!readFileSync(path, "utf8").includes("boot-check.mjs")) {
    fail(`${wf} no longer runs scripts/boot-check.mjs — it can report success on a worker that 500s on every request.`);
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
