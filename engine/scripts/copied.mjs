#!/usr/bin/env node
/**
 * IS THE COPY THE SAME DATABASE — asked table by table, before anything is bound
 * to it.
 *
 * ⚠️ AN IMPORT THAT PARTLY WORKED IS THE FAILURE THIS EXISTS AGAINST. `d1
 * execute --file` reports the statements it ran, not the rows that landed: a
 * file truncated in transit, a table whose CREATE failed and whose INSERTs then
 * failed quietly after it, a constraint that rejected half a table — every one
 * of them exits 0 and leaves a database that opens, answers, and is missing
 * records. Binding that is worse than not moving at all, because the old one is
 * still there and nobody knows to look at it.
 *
 * ⚠️ THE TABLE LIST COMES FROM THE SOURCE, NEVER FROM HERE. A list written in
 * this file is one a new table is forgotten in, and the symptom is a table that
 * silently did not travel — which is the same shape as every other finding in
 * this repository. `sqlite_master` is asked, on the source, every time.
 *
 * ⚠️ AND `sqlite_sequence` IS NOT A TABLE ANYBODY WROTE. SQLite maintains it for
 * AUTOINCREMENT and its contents legitimately differ between two databases
 * holding identical rows, so comparing it reports a difference that is not one.
 *
 * Usage:
 *   node engine/scripts/copied.mjs <source.json> <target.json>
 *
 * Each file is the output of:
 *   wrangler d1 execute <db> --remote --json --command \
 *     "SELECT name FROM sqlite_master WHERE type='table' ..."
 * followed by one count per table, as this script's own `--counts` prints.
 */

import { readFileSync } from "node:fs";

/** ⚠️ `d1 execute --json` answers an ARRAY of results, one per statement, and
    each carries its own `results`. Reading `[0]` blindly is how a multi-statement
    reply gets read as the first table's answer for every table. */
const rowsOf = (text) => {
  const said = JSON.parse(text);
  const all = Array.isArray(said) ? said : [said];
  return all.flatMap((one) => one?.results ?? []);
};

const [, , sourceFile, targetFile] = process.argv;
if (!sourceFile || !targetFile) {
  console.error("usage: copied.mjs <source.json> <target.json>");
  process.exit(2);
}

const counted = (file) => {
  const out = new Map();
  for (const row of rowsOf(readFileSync(file, "utf8"))) {
    /* Each row is `{ t: "<table>", n: <count> }` — see `--counts`. */
    if (typeof row?.t === "string") out.set(row.t, Number(row.n ?? 0));
  }
  return out;
};

const source = counted(sourceFile);
const target = counted(targetFile);

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };

if (!source.size) {
  fail("the source reported no tables at all.\n"
    + "       That is a query that failed, not a database that is empty — an empty\n"
    + "       one still has its schema. Nothing may be bound on this answer.");
}

for (const [name, n] of [...source].sort()) {
  const got = target.get(name);
  if (got === undefined) fail(`${name}: ${n} row(s) in the source, and the table is not in the copy.`);
  else if (got !== n) fail(`${name}: ${n} row(s) in the source, ${got} in the copy.`);
}

/* ⚠️ AND EXTRA TABLES ARE REPORTED, NOT IGNORED. A copy with MORE in it is a
   database somebody has already used for something else, and binding it would
   merge two histories. */
for (const [name] of [...target].sort()) {
  if (!source.has(name)) fail(`${name}: in the copy and not in the source.`);
}

const rows = [...source.values()].reduce((a, b) => a + b, 0);
console.log(bad
  ? `\ncopied: ${bad} difference(s) — this is not the same database.`
  : `\ncopied: ${source.size} table(s), ${rows} row(s), identical.`);
process.exit(bad ? 1 : 0);
