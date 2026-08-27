/**
 * AN APP'S TABLE MAY NOT SHADOW ONE THE PLATFORM ALREADY PUTS ON THAT DATABASE.
 *
 * ⚠️ THE FAILURE IS A 503 ON EVERY DOOR, AND IT IS NOT A GRACEFUL ONE. A
 * collection's DDL is generated from its fields, so an app declaring a table the
 * platform also creates hands `applySchema` two different shapes under one name:
 * `CREATE TABLE IF NOT EXISTS` is won by whichever module runs first, and the
 * LOSER'S indexes then reference columns that do not exist. The index throws,
 * the batch throws, `ensureSchema` throws, and every route that touches D1
 * answers 500 — including `/health`. Nothing degrades; the whole deployment
 * stops.
 *
 * ⚠️ IT WAS FOUND BY DOING IT. `buying` was written as `purchase` first, which
 * is what `@engine/runtime` calls the package rail's ledger — and the whole
 * worker suite went red at once with `no such column: member_id` on an index
 * over a table the app thought was its own. Nothing before this file asked the
 * question: the kernel refuses a reserved SQL WORD (`not_a_name`), and knows
 * nothing about the platform's own tables because it is the pure contracts layer
 * and has never seen one.
 *
 * ⚠️ AND IT IS PER DATABASE, WHICH IS THE HALF A CRUDE CHECK GETS WRONG.
 * OneInventory has a `code` collection and the platform has a `code` table, and
 * they have never collided: the platform's is in `IDENTITY_SCHEMA`, which is a
 * DIRECTORY module, and an app's collections only ever land on a SHARD. A guard
 * matching every platform table would report that pair for ever, which is how a
 * check earns an exemption list and then earns being ignored.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { appManifests } from "./lib/trees.mjs";

const HERE = join(import.meta.dirname, "..");
const RUNTIME = join(HERE, "runtime", "src");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/^(\s*)\/\/.*$/gm, "$1");

/**
 * ⚠️ THE MODULES THE SHARD ACTUALLY GETS, READ FROM THE LIST THAT DECIDES IT.
 * A guard holding its own idea of which schemas reach a workspace's database is
 * a second answer to a question `platform-schema.ts` already answers — and the
 * day a module moves between the two lists, this would quietly be checking the
 * wrong set.
 */
const shardModules = () => {
  const src = strip(readFileSync(join(RUNTIME, "platform-schema.ts"), "utf8"));
  const block = /export const SHARD_MODULES: readonly SchemaModule\[\] = \[([\s\S]*?)\n\];/
    .exec(src);
  if (!block) return null;
  return new Set([...block[1].matchAll(/\b([A-Z][A-Z0-9_]*_SCHEMA)\b/g)].map((m) => m[1]));
};

/** Every table a named schema module creates. */
const tablesIn = (modules) => {
  const out = new Map();
  for (const name of readdirSync(RUNTIME).filter((f) => /\.ts$/.test(f))) {
    const src = strip(readFileSync(join(RUNTIME, name), "utf8"));
    for (const m of src.matchAll(
      /export const ([A-Z][A-Z0-9_]*_SCHEMA)\s*:\s*SchemaModule\s*=\s*\{([\s\S]*?)\n\};/g,
    )) {
      if (!modules.has(m[1])) continue;
      for (const t of m[2].matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)) {
        if (!out.has(t[1])) out.set(t[1], `${m[1]} (${name})`);
      }
    }
  }
  return out;
};

/* ⚠️ A COLLECTION'S ID IS ITS TABLE WITH THE HYPHENS TURNED, which is what the
   runner generates — `buying-line` is `buying_line` in SQLite, and a guard
   comparing the id verbatim would miss every collection whose name has two
   words in it. */
const tableOf = (id) => id.replace(/-/g, "_");

const shard = shardModules();
if (!shard) {
  fail("shadow: runtime/src/platform-schema.ts has no SHARD_MODULES list this guard can read — "
    + "it names the shape, so a file that moved it would pass by finding nothing to check.");
} else {
  const held = tablesIn(shard);
  if (!held.size) {
    fail(`shadow: none of the ${shard.size} shard module(s) declares a table this guard can see `
      + "— a check that finds nothing to compare against cannot fail.");
  }

  let asked = 0;
  for (const [app, manifest] of appManifests()) {
    if (!existsSync(manifest)) continue;
    const src = strip(readFileSync(manifest, "utf8"));
    const ids = [...src.matchAll(/(?:^|\n)const \w+ = collection\(\{\s*\n\s*id:\s*"([^"]+)"/g)]
      .map((m) => m[1]);
    if (!ids.length) {
      fail(`shadow: ${app} declares no collections this guard can see — it names their shape, `
        + "so a manifest that changed it would pass by finding nothing to check.");
      continue;
    }
    asked += ids.length;
    const shadowed = ids.filter((id) => held.has(tableOf(id)));
    if (shadowed.length) {
      fail(`shadow: ${app} declares ${shadowed.map((id) => `"${id}"`).join(", ")}, which `
        + `${shadowed.length === 1 ? "is a table" : "are tables"} the platform already puts on `
        + `every shard — ${shadowed.map((id) => `${tableOf(id)} from ${held.get(tableOf(id))}`)
          .join("; ")}.\n`
        + "       `CREATE TABLE IF NOT EXISTS` is won by whichever module runs first and the "
        + "loser's indexes then name columns that are not there, so `ensureSchema` throws and "
        + "every route that touches D1 answers 500 — `/health` included. Rename the collection.");
    }
  }
  if (!asked) {
    fail("shadow: no app declares a collection — this check asked nothing, and a check that "
      + "cannot fail is one nobody can rely on.");
  } else if (!bad) {
    ok(`shadow: ${asked} collection(s) checked against ${held.size} `
      + `table(s) the platform puts on every shard, and none is shadowed`);
  }
}

/* ⚠️ THE DIRECTORY IS DELIBERATELY NOT ASKED ABOUT — see the header. An app's
   collections land on a shard and nowhere else, so a platform table that lives
   only in the directory shares a NAME with one and never a database. */
ok("shadow: the directory's own tables are a different database, and are not asked about");

console.log(bad
  ? `\nshadow: ${bad} finding(s) — a table two schemas both create.`
  : "\nshadow: no app names a table the platform already puts beside it.");

process.exit(bad ? 1 : 0);
