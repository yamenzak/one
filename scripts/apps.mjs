#!/usr/bin/env node
/**
 * THE APP REGISTRY, READ ONCE.
 *
 * Every workflow that needs to know "which apps exist" asks this instead of
 * repeating a list. The repeating is what broke: Tessa's SPA build was missing
 * from CI, so its whole suite reported "no tests" — a pass-shaped result — and
 * main went red on the merge that added it.
 *
 * Plain Node, no dependencies, no build step: workflows call it BEFORE
 * `pnpm install`, because a check that needs the workspace installed cannot
 * guard the workspace's own install.
 *
 * Usage:
 *   node scripts/apps.mjs spas            # packages whose build must run first
 *   node scripts/apps.mjs matrix          # deploy matrix, as JSON
 *   node scripts/apps.mjs e2e-matrix      # Playwright matrix, as JSON
 *   node scripts/apps.mjs ids             # every app id, one per line
 *   node scripts/apps.mjs get <id>        # one app, as JSON
 *   node scripts/apps.mjs ready <id>      # exit 0 if its ids are real
 *   node scripts/apps.mjs origin <id>     # its canonical public origin, or ""
 *   node scripts/apps.mjs email-sql <id>  # the seeding SQL for its sender
 *   node scripts/apps.mjs shared-config-title   # the platform-wide KV title
 */

import { readFileSync, readdirSync, existsSync, realpathSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

export const registry = JSON.parse(readFileSync(join(ROOT, "apps.json"), "utf8"));
export const apps = registry.apps;
export const app = (id) => {
  const a = apps.find((x) => x.id === id);
  if (!a) throw new Error(`No app "${id}" in apps.json. Known: ${apps.map((x) => x.id).join(", ")}`);
  return a;
};

/**
 * A placeholder resource id — the fake values that let `wrangler dev` run with
 * no Cloudflare account at all.
 *
 * Deploying against one does NOT fail loudly: wrangler binds or creates
 * *something*, and the worker comes up pointing at nothing. So the deploy is
 * gated on this rather than on someone remembering.
 *
 * Matched structurally (all zeros, with an optional trailing tag like `cafe` or
 * `d1`) rather than by an exact list, so a new app's placeholders are caught
 * without anyone registering them here.
 */
export const isPlaceholder = (v) => /^0{8,}[0-9a-f]{0,8}$/i.test(String(v).replace(/-/g, ""));

// ── Reading a wrangler.jsonc ────────────────────────────────────────────────
//
// These configs are JSONC on purpose — every binding is explained in place —
// so they are read as TEXT rather than parsed. One home for that reading, used
// by `bind-resource-ids.mjs` to edit and by the provisioning workflow to check.

/** The config's text. */
export const wranglerText = (id) => readFileSync(join(ROOT, app(id).dir, "wrangler.jsonc"), "utf8");

/**
 * A copy with `//` comments blanked out, character-for-character.
 *
 * Bracket-matching must ignore a `[` inside a comment, and blanking rather than
 * deleting keeps every index identical to the real text — so a position found
 * here can be used to edit there.
 *
 * ⚠️ STRING-AWARE, and it has to be. The obvious one-line version — a global
 * replace of "slash slash to end of line" — also blanks the `//` inside a URL,
 * so `"BETTER_AUTH_URL": "https://kova.4dl.app"` reads back as `https:` with the
 * rest of the line erased. That was silent — the value looked configured, just
 * truncated — and it would have taken the boot check below with it.
 */
export function uncommented(s) {
  let out = "";
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      out += c;
      if (c === "\\") {
        out += s[++i] ?? "";
      } else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === "/" && s[i + 1] === "/") {
      // Blank to end of line, keeping the newline so line numbers survive.
      while (i < s.length && s[i] !== "\n") {
        out += " ";
        i++;
      }
      out += s[i] ?? "";
      continue;
    }
    out += c;
  }
  return out;
}

/** The span of a `"key": [ … ]` array's contents, as [start, end), or null. */
export function arraySpan(source, key) {
  const scan = uncommented(source);
  const open = new RegExp(`"${key}"\\s*:\\s*\\[`).exec(scan);
  if (!open) return null;
  const start = open.index + open[0].length;
  let depth = 1;
  for (let i = start; i < scan.length; i++) {
    if (scan[i] === "[") depth++;
    else if (scan[i] === "]" && --depth === 0) return [start, i];
  }
  return null;
}

/** The `field` of the entry in `key`'s array whose `"binding"` is `binding`. */
export function boundField(source, key, binding, field) {
  const span = arraySpan(source, key);
  if (!span) return null;
  for (const entry of source.slice(...span).match(/\{[^{}]*\}/g) ?? []) {
    if (!new RegExp(`"binding"\\s*:\\s*"${binding}"`).test(entry)) continue;
    return new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`).exec(entry)?.[1] ?? null;
  }
  return null;
}

/**
 * What an app's config currently binds, and whether each is real.
 *
 * The provisioning workflow branches on this: a REAL id gets verified against
 * the account (and a mismatch is an error, not a reason to create a second
 * database), while a placeholder means adopt-or-create.
 */
export function boundIds(id) {
  const a = app(id);
  const text = wranglerText(id);
  // The D1 binding name as the config itself declares it — `wrangler d1 execute`
  // takes the BINDING as its target, and assuming `DB` would be a convention
  // masquerading as a fact.
  const span = arraySpan(text, "d1_databases");
  const d1Binding = (span && /"binding"\s*:\s*"([^"]+)"/.exec(text.slice(span[0], span[1]))?.[1]) || "DB";
  const d1 = boundField(text, "d1_databases", d1Binding, "database_id");
  const kv = a.provision?.kv ? boundField(text, "kv_namespaces", a.provision.kv, "id") : null;
  return {
    d1Binding,
    d1: d1 ?? "",
    kv: kv ?? "",
    d1Real: !!d1 && !isPlaceholder(d1),
    kvReal: !!kv && !isPlaceholder(kv),
  };
}

/** Does this app's wrangler.jsonc bind REAL ids? */
export function isProvisioned(id) {
  const a = app(id);
  if (!a.provision) return true; // nothing to bind — e.g. a static site
  const ids = [...wranglerText(id).matchAll(/"(?:id|database_id)"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
  if (ids.length === 0) return false;
  return !ids.some(isPlaceholder);
}

/**
 * A `vars` entry from the app's wrangler.jsonc, read as text.
 *
 * Comments are blanked first, so a value that only appears in a `//` line — the
 * usual way a var is documented before it is set — does not read as configured.
 */
export const varOf = (id, name) =>
  new RegExp(`"${name}"\\s*:\\s*"([^"]*)"`).exec(uncommented(wranglerText(id)))?.[1] ?? "";

/**
 * The app's canonical public origin, or "" for one that has none.
 *
 * `BETTER_AUTH_URL` is already the worker's own answer to "what address am I
 * served at" — a second field in the registry would be a copy of it, and a copy
 * that drifts silently is worse than no check at all. A static site has no such
 * var and returns "", which every caller treats as "nothing to probe".
 */
export const publicOrigin = (id) => varOf(id, "BETTER_AUTH_URL").replace(/\/+$/, "");

/**
 * The transactional sender for an app.
 *
 * ONE address for the whole platform — `noreply@4dl.app` — with a per-app
 * display name. A new app therefore inherits a sender that is already onboarded
 * and verified, instead of a per-app address that looks plausible and bounces.
 * DEPLOY.md's warning applies to exactly that: a plausible default is not a
 * configured one, and the way to make it configured once is to share it.
 */
export function sender(id) {
  const a = app(id);
  if (!a.email) return null;
  return `${a.email.name} <${registry.defaultEmailAddress}>`;
}

/**
 * SQL that seeds the app's email config — and never overwrites it.
 *
 * `DO NOTHING`, not `DO UPDATE`. DEPLOY.md's hand-run snippet upserts, which is
 * right for a person deliberately changing a value and catastrophic for an
 * automation that runs on every provisioning: it would silently reset a live
 * deployment's sender to the default every time somebody re-ran the workflow.
 * Seeding is for an app that has none.
 *
 * The `CREATE TABLE IF NOT EXISTS` makes it safe on a database the worker has
 * never touched — `ensureSchema` has not run yet on a fresh deployment.
 */
export function emailSql(id) {
  const from = sender(id);
  if (!from) return null;
  return [
    "CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT);",
    "INSERT INTO app_config (key, value) VALUES",
    "  ('email.provider', 'cloudflare'),",
    `  ('email.from', '${from.replace(/'/g, "''")}'),`,
    `  ('email.platform_from', '${from.replace(/'/g, "''")}')`,
    "ON CONFLICT(key) DO NOTHING;",
  ].join(" ");
}

/** Every app directory that looks deployable — used to catch an unregistered one. */
export function discoverWorkerDirs() {
  const out = [];
  for (const name of readdirSync(join(ROOT, "apps"))) {
    const dir = join("apps", name);
    if (existsSync(join(ROOT, dir, "wrangler.jsonc"))) out.push(dir);
  }
  return out;
}

/**
 * Where a workspace package lives, by its package.json `name`.
 *
 * The registry names packages, not paths, because a package name is what pnpm
 * and turbo take. But an artifact upload needs the PATH, and the only two ways
 * to have both are to duplicate it in the registry — which drifts — or to look
 * it up. This looks it up. Returns null when the name is not a package here,
 * which is what `apps-manifest.test.mjs` turns into a failure.
 */
export function packageDir(name) {
  for (const base of ["apps", "packages"]) {
    const dir = join(ROOT, base);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      const pkg = join(dir, entry, "package.json");
      if (!existsSync(pkg)) continue;
      try {
        if (JSON.parse(readFileSync(pkg, "utf8")).name === name) return `${base}/${entry}`;
      } catch {
        /* an unreadable package.json is someone else's failure */
      }
    }
  }
  return null;
}

/**
 * The Playwright matrix: one CI job per app that has a suite.
 *
 * Each carries its SPA because the worker under test serves it through an
 * `assets` binding — the suite boots `wrangler dev`, which needs the built
 * directory on disk before Playwright ever starts.
 */
export function e2eMatrix() {
  return {
    include: apps
      .filter((a) => a.e2e)
      .map((a) => ({ id: a.id, e2e: a.e2e, spa: a.spa ?? "", dir: packageDir(a.e2e) ?? "" })),
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
//
// Only when this file IS the entry point. Without the guard, every module that
// imports the registry also runs the switch below on ITS argv and exits 2 —
// which is how `bind-resource-ids.mjs <app>` first died with
// `Unknown command "tessa"`.
const isMain = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(new URL(import.meta.url).pathname);

const [, , cmd, arg] = isMain ? process.argv : [];
switch (cmd) {
  case "spas":
    console.log(apps.filter((a) => a.spa).map((a) => a.spa).join("\n"));
    break;
  case "ids":
    console.log(apps.map((a) => a.id).join("\n"));
    break;
  case "bound":
    console.log(JSON.stringify(boundIds(arg)));
    break;
  case "e2e-matrix":
    console.log(JSON.stringify(e2eMatrix()));
    break;
  case "matrix":
    console.log(JSON.stringify({ include: apps.filter((a) => a.deploy).map((a) => ({ id: a.id, dir: a.dir, pre: a.preCommands ?? "" })) }));
    break;
  case "get":
    console.log(JSON.stringify(app(arg)));
    break;
  case "ready":
    if (!isProvisioned(arg)) {
      console.error(`${arg} still binds placeholder resource ids — run the Provision workflow.`);
      process.exit(1);
    }
    console.log(`${arg} is provisioned.`);
    break;
  case "origin":
    console.log(publicOrigin(arg));
    break;
  case "email-sql":
    console.log(emailSql(arg) ?? "");
    break;
  // The ONE resource that is not per-app: a single KV namespace bound with the
  // same id into every worker. Printed rather than repeated in the workflow,
  // for the same reason nothing else here is repeated.
  case "shared-config-title":
    console.log(registry.sharedConfig?.title ?? "");
    break;
  case undefined:
    break;
  default:
    console.error(`Unknown command "${cmd}". See the header.`);
    process.exit(2);
}
