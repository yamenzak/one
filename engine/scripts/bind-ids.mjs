#!/usr/bin/env node
/**
 * WRITE REAL D1 IDS INTO `engine/one/wrangler.jsonc`, AND READ BACK WHETHER IT IS
 * PROVISIONED.
 *
 * ⚠️ ENGINE DOES NOT USE `apps.json`, AND MUST NOT START. The legacy binder
 * (`scripts/bind-ids.mjs`) resolves its target through that registry,
 * so reusing it would mean registering One there — and the whole reason
 * `deploy.yml` can never select One is that it is absent from it. This is the
 * same job, forty lines, with the registry replaced by the config's own
 * `database_name`.
 *
 * ⚠️ MATCHED STRUCTURALLY, AND REPORTED. A `sed` that matches nothing exits 0,
 * so a failed rewrite leaves the placeholder in place behind a green run — and a
 * placeholder does not error at deploy time either: wrangler binds *something*
 * and the worker comes up pointing at nothing.
 *
 * Comments are preserved: the file is JSONC by design, so it is edited as text
 * rather than parsed and re-serialised.
 *
 * Usage:
 *   node engine/scripts/bind-ids.mjs <database_name> <uuid>   bind one id
 *   node engine/scripts/bind-ids.mjs --ready                  exit 0 if every id is real
 *   node engine/scripts/bind-ids.mjs --names                  print every database_name
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CONFIG = join(HERE, "..", "one", "wrangler.jsonc");

/** ⚠️ Every id, with the name it belongs to — read as TEXT, because the file
    carries the comments that explain each binding. */
export function databases(text = readFileSync(CONFIG, "utf8")) {
  const out = [];
  const re = /"database_name"\s*:\s*"([^"]+)"\s*,\s*(?:\/\/[^\n]*\n\s*)*"database_id"\s*:\s*"([^"]*)"/g;
  for (const [, name, id] of text.matchAll(re)) out.push({ name, id });
  return out;
}

/** ⚠️ A placeholder is anything that is not a real id. `wrangler` will happily
    accept a made-up string, so "looks like a uuid" is the only honest test. */
export const isReal = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/**
 * ⚠️ THE CLI RUNS ONLY WHEN THIS IS THE PROGRAM. `databases` and `isReal` are
 * imported by `inert.test.mjs`, and an unguarded CLI turns that import into a
 * usage error and an exit — a guard that fails for a reason having nothing to do
 * with what it guards.
 */
const asProgram = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (!asProgram) { /* imported — nothing below runs */ } else {

const [, , first, second] = process.argv;

if (first === "--names") {
  for (const { name } of databases()) console.log(name);
  process.exit(0);
}

if (first === "--ready") {
  const rows = databases();
  const fake = rows.filter((r) => !isReal(r.id));
  if (!rows.length) {
    console.error("BAD  engine/one/wrangler.jsonc binds no D1 database at all.");
    process.exit(1);
  }
  for (const r of fake) console.error(`not provisioned: ${r.name} is bound to "${r.id}"`);
  process.exit(fake.length ? 1 : 0);
}

if (!first || !second) {
  console.error("Usage: node engine/scripts/bind-ids.mjs <database_name> <uuid> | --ready | --names");
  process.exit(2);
}

if (!isReal(second)) {
  console.error(`BAD  "${second}" is not a database id. Binding it would point the worker at nothing.`);
  process.exit(1);
}

const text = readFileSync(CONFIG, "utf8");
const rows = databases(text);
const row = rows.find((r) => r.name === first);
if (!row) {
  console.error(`BAD  no binding named "${first}". This config has: ${rows.map((r) => r.name).join(", ")}`);
  process.exit(1);
}

if (row.id === second) {
  console.log(`ok   ${first} already binds ${second}`);
  process.exit(0);
}

/* ⚠️ Anchored on the NAME, so the two databases cannot be swapped by an edit
   that reorders them — which would point the directory at a shard and every
   cross-tenant question at one workspace's records. */
const before = `"database_name": "${first}"`;
const at = text.indexOf(before);
const idAt = text.indexOf('"database_id"', at);
const quoted = /"database_id"\s*:\s*"([^"]*)"/.exec(text.slice(idAt));
if (at < 0 || idAt < 0 || !quoted) {
  console.error(`BAD  could not locate the database_id for "${first}".`);
  process.exit(1);
}
const next = text.slice(0, idAt) + quoted[0].replace(/"([^"]*)"$/, `"${second}"`) + text.slice(idAt + quoted[0].length);
writeFileSync(CONFIG, next);

/* ⚠️ Read back, always. The point of a script over a substitution is that it
   can say whether it worked. */
const after = databases().find((r) => r.name === first);
if (after?.id !== second) {
  console.error(`BAD  wrote ${first} = ${second} and read back ${after?.id}.`);
  process.exit(1);
}
console.log(`ok   ${first} → ${second}`);

}
