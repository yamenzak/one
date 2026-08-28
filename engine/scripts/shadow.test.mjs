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

/* -------------------------------------------------- and one app over another --- */

/**
 * ⚠️ THE SAME COLLISION ONE LAYER OUT: TWO APPS, ONE TABLE, ONE SHARD. Every app
 * a workspace installs applies its schema to the SAME database — that is what
 * makes a deployment cheap and it is also the thing composition cannot see, because
 * each manifest is asked on its own and each one is correct. Two apps declaring
 * `party` is `CREATE TABLE IF NOT EXISTS` won by whichever runs first: the loser's
 * columns never exist, its inserts fail on a field it declared, and every check in
 * the repository is green.
 *
 * ⚠️ THE RUNTIME ASKS THIS TOO (`deploymentFaults`), AND THAT IS NOT THE SAME
 * CHECK. It runs against the apps a DEPLOYMENT wires, at boot, and reports; this
 * runs against every manifest on disk, in the gate, before anything is wired. A
 * product that is written and not yet installed is exactly the one somebody is
 * still choosing collection names for.
 */
const declaredBy = new Map();
for (const [app, manifest] of appManifests()) {
  if (!existsSync(manifest)) continue;
  const src = strip(readFileSync(manifest, "utf8"));
  for (const m of src.matchAll(/(?:^|\n)const \w+ = collection\(\{\s*\n\s*id:\s*"([^"]+)"/g)) {
    (declaredBy.get(m[1]) ?? declaredBy.set(m[1], []).get(m[1])).push(app);
  }
}

let twice = 0;
for (const [id, apps] of declaredBy) {
  if (apps.length < 2) continue;
  twice++;
  fail(`shadow: ${apps.join(" and ")} both declare collection "${id}".\n`
    + "       Every app in a deployment applies its schema to the same shard, so whichever\n"
    + "       runs first wins and the other's columns silently never exist. One of them\n"
    + "       owns it — mark it `shared: true` and let the other `borrows` the name.");
}
if (!declaredBy.size) {
  fail("shadow: no collection ids were read at all, so this pair of checks compared nothing.");
} else if (!twice) {
  ok(`shadow: ${declaredBy.size} collection id(s) across the apps, each declared by one`);
}

/* ------------------------------------------------------- the reserved concepts --- */

/**
 * ⚠️ AND SOME NAMES ARE SPOKEN FOR BEFORE ANYBODY DECLARES THEM. A customer is
 * not a row in a shop's database and again in an invoicing app and again in a
 * payroll one; an account is not a table each product keeps its own version of.
 * That is the failure the whole business suite exists to refuse — not a crash,
 * but four products that each half-know a company's suppliers and disagree about
 * which is current.
 *
 * ⚠️ SO OWNERSHIP IS DECLARED HERE RATHER THAN DISCOVERED. The duplicate check
 * above only fires once BOTH apps exist; this one fires on the first, which is
 * the moment the name is being chosen and the only moment changing it is free.
 * The list is short on purpose: a concept earns a line when a second product
 * would otherwise need its own copy, and `ledger` is deliberately absent — a
 * stock ledger and a general ledger are two different words that happen to
 * collide, and reserving the noun would be reserving English.
 */
/* ⚠️ The app id is what a manifest is matched on; the product name is what the
   message says, because "belongs to party" reads as a typo and "belongs to
   OneParty" reads as an answer. */
const OWNERS = { party: "OneParty", book: "OneBook" };

const RESERVED = {
  party: "party",
  contact: "party",
  customer: "party",
  supplier: "party",
  vendor: "party",
  employee: "party",
  account: "book",
  journal: "book",
  posting: "book",
  fiscal: "book",
  tax: "book",
};

/**
 * ⚠️ AND IT CAN ONLY SHRINK. A collection that already exists under a reserved
 * name is named here with the stage that moves it, and an entry whose app has
 * stopped declaring it FAILS until the line is deleted — otherwise an exemption
 * outlives its reason and the guard quietly stops covering the case it was
 * written for.
 */
/*
  ⚠️ EMPTY, AND IT GOT THERE BY BEING PAID OFF RATHER THAN BY BEING FORGOTTEN.
  Its one entry was `inventory:supplier`, and BS-9 moved it: OneInventory borrows
  `party` now and keeps only what it knows about BUYING from one. The list can
  only ever SHRINK — an entry whose app has stopped declaring the name fails the
  check below until it is deleted — so a stage that quietly never happened cannot
  become a permanent exemption.
*/
const MIGRATING = {};

let claimed = 0;
let taken = 0;
for (const [id, apps] of declaredBy) {
  const owner = RESERVED[id];
  if (!owner) continue;
  for (const app of apps) {
    if (app === owner) { claimed++; continue; }
    const excuse = MIGRATING[`${app}:${id}`];
    if (excuse) { claimed++; continue; }
    taken++;
    fail(`shadow: ${app} declares "${id}", which belongs to ${OWNERS[owner] ?? owner}.\n`
      + "       A party is one record with roles and an account is one chart, or every\n"
      + "       product ends up half-knowing a company's suppliers and disagreeing about\n"
      + "       which is current. Borrow it from its owner, or add a line to MIGRATING\n"
      + "       naming the stage that moves it.");
  }
}
for (const [key, why] of Object.entries(MIGRATING)) {
  const [app, id] = key.split(":");
  if (declaredBy.get(id)?.includes(app)) continue;
  taken++;
  fail(`shadow: MIGRATING still excuses ${app}'s "${id}" — ${why} — and ${app} no longer\n`
    + "       declares it. Delete the line: an exemption that outlives its reason is a\n"
    + "       hole nobody remembers opening.");
}
if (!taken) {
  ok(`shadow: ${Object.keys(RESERVED).length} reserved concept(s), `
    + `${claimed} declared by their owner or named as migrating`);
}

console.log(bad
  ? `\nshadow: ${bad} finding(s) — a table two schemas both create.`
  : "\nshadow: no app names a table the platform already puts beside it.");

process.exit(bad ? 1 : 0);
