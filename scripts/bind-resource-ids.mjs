#!/usr/bin/env node
/**
 * WRITE THE REAL RESOURCE IDS INTO AN APP'S wrangler.jsonc.
 *
 * Provisioning already knows the ids it just created, so making a person paste
 * them is one manual step too many on the one file where a typo is worst: a
 * wrong id does not error, it binds the worker to an empty database.
 *
 * ── Why this is a script and not a `sed` in the workflow ────────────────────
 *
 * The workflow it replaced used two `sed -i -E` lines. They worked, but only
 * because both bindings happened to be on ONE line — `apps/api/wrangler.jsonc`
 * spreads its `d1_databases` entry over fifteen lines of comment, and a
 * line-oriented substitution across that is a coin flip. Worse, a `sed` that
 * matches nothing exits 0, so a failed rewrite leaves the placeholders in place
 * behind a green run. This matches structurally, and REPORTS.
 *
 * Comments are preserved: the file is JSONC by design (every binding here is
 * explained in place), so it is edited as text rather than parsed and
 * re-serialised.
 *
 * Usage:
 *   node scripts/bind-resource-ids.mjs <app> [--d1 <uuid>] [--kv <hex>] [--shared-config <hex>]
 *
 * Exit 0 means the config now binds exactly what was passed — whether this run
 * changed it or it was already right. Any other exit means it does not.
 *
 * ── `--shared-config` INSERTS, the others only update ───────────────────────
 *
 * The platform-wide config namespace is the one binding that is deliberately
 * absent from a config until it is real. A placeholder would be worse than
 * nothing here: `isProvisioned` reads every id in the file, so a fake one marks
 * the whole app un-provisioned and `deploy.yml` SKIPS it — which would take two
 * live products off deploys the moment this landed, to wire a feature that
 * degrades to nothing when unbound. So the entry appears the same run its id
 * does, and this script grows an insert path for it.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, arraySpan, boundIds, registry } from "./apps.mjs";

const ROOT = new URL("..", import.meta.url).pathname;

const [, , id, ...rest] = process.argv;
if (!id) {
  console.error("Usage: node scripts/bind-resource-ids.mjs <app> [--d1 <uuid>] [--kv <hex>]");
  process.exit(2);
}

const opts = {};
for (let i = 0; i < rest.length; i += 2) {
  if (!rest[i]?.startsWith("--")) {
    console.error(`Expected a --flag, got "${rest[i]}".`);
    process.exit(2);
  }
  opts[rest[i].slice(2)] = rest[i + 1] ?? "";
}

const a = app(id);
const path = join(ROOT, a.dir, "wrangler.jsonc");
const original = readFileSync(path, "utf8");
let text = original;
const problems = [];
const notes = [];

/**
 * Set `field` on the entry in `key`'s array whose `"binding"` is `binding`.
 *
 * Reports rather than silently doing nothing: a rewrite that matched no entry
 * is the exact failure this script exists to make loud.
 */
function bind(key, binding, field, value, label) {
  const span = arraySpan(text, key);
  if (!span) return problems.push(`no "${key}" array in ${a.dir}/wrangler.jsonc — nothing to bind ${label} into.`);

  const [start, end] = span;
  const block = text.slice(start, end);
  let hits = 0;

  const next = block.replace(/\{[^{}]*\}/g, (entry) => {
    if (!new RegExp(`"binding"\\s*:\\s*"${binding}"`).test(entry)) return entry;
    const field_re = new RegExp(`("${field}"\\s*:\\s*")([^"]*)(")`);
    if (!field_re.test(entry)) {
      problems.push(`the "${binding}" entry in "${key}" has no "${field}" to set.`);
      return entry;
    }
    hits++;
    const was = field_re.exec(entry)[2];
    if (was === value) notes.push(`${label} already bound to ${value}.`);
    else notes.push(`${label}: ${was || "(empty)"} → ${value}`);
    return entry.replace(field_re, `$1${value}$3`);
  });

  if (hits === 0) problems.push(`no entry with "binding": "${binding}" in "${key}" — ${label} was not written.`);
  if (hits > 1) problems.push(`${hits} entries bind "${binding}" in "${key}". Ambiguous; refusing to guess.`);
  if (hits === 1) text = text.slice(0, start) + next + text.slice(end);
}

/**
 * Set `field` on the `binding` entry, ADDING the entry when it is not there.
 *
 * Only used for the shared config namespace, and only because that entry is
 * absent by design until its id exists (see the header). Everything else must
 * keep failing loudly on a missing entry: a binding the config never declared
 * is a config someone needs to look at, not one this script should invent.
 */
function bindOrAdd(key, binding, field, value, label, comment) {
  const span = arraySpan(text, key);
  if (!span) return problems.push(`no "${key}" array in ${a.dir}/wrangler.jsonc — nothing to bind ${label} into.`);
  if (new RegExp(`"binding"\\s*:\\s*"${binding}"`).test(text.slice(...span))) return bind(key, binding, field, value, label);

  const [start, end] = span;
  const block = text.slice(start, end);
  const entries = block.trim();
  // Match the file's own indentation for the array's first entry, so the result
  // reads like the hand-written JSONC around it rather than a machine's paste.
  const indent = /\n(\s+)\S/.exec(block)?.[1] ?? "    ";
  const added = `${entries ? `${entries.replace(/,\s*$/, "")},\n` : "\n"}${comment
    .split("\n")
    .map((l) => indent + l)
    .join("\n")}\n${indent}{ "binding": "${binding}", "${field}": "${value}" }\n${indent.slice(0, -2)}`;
  text = text.slice(0, start) + `\n${indent}` + added + text.slice(end);
  notes.push(`${label}: added, bound to ${value}`);
}

if (opts.d1) bind("d1_databases", boundIds(id).d1Binding, "database_id", opts.d1, "D1");
if (opts.kv) bind("kv_namespaces", a.provision?.kv ?? "CACHE", "id", opts.kv, "KV");
if (opts["shared-config"] && registry.sharedConfig) {
  bindOrAdd(
    "kv_namespaces",
    registry.sharedConfig.binding,
    "id",
    opts["shared-config"],
    "shared config",
    [
      "// The SHARED platform config store — the SAME namespace id in every 4DL",
      "// app, holding the credentials the whole platform has in common (the",
      "// Google key, the Stripe account, the Cloudflare token, the Turnstile",
      "// widget). This app's own `app_config` rows still win. Written here by",
      "// provisioning; see packages/core/src/config.ts.",
    ].join("\n"),
  );
}

if (problems.length) {
  for (const p of problems) console.error(`BAD  ${p}`);
  process.exit(1);
}

for (const n of notes) console.log(`  ${n}`);

if (text === original) {
  console.log(`✓ ${a.dir}/wrangler.jsonc already binds these ids — nothing to write.`);
  process.exit(0);
}

writeFileSync(path, text);

// Verified by re-reading, not assumed. The whole point of this script is that
// the previous approach could report success without having written anything.
const after = readFileSync(path, "utf8");
for (const [flag, v] of Object.entries(opts)) {
  if (v && !after.includes(`"${v}"`)) {
    console.error(`BAD  wrote the file but --${flag} ${v} is not in it.`);
    process.exit(1);
  }
}
console.log(`✓ ${a.dir}/wrangler.jsonc updated.`);
