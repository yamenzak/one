/**
 * A TABLE NOBODY'S EXPORT OR ERASURE KNOWS ABOUT.
 *
 * ⚠️ BOTH ANSWERS ARE SENTENCES SOMEBODY RELIES ON — "here is everything we
 * hold" and "it is all gone" — and both are produced by a walk over a list. A
 * table missing from that list is not an error anywhere: the export is shorter,
 * the deletion is smaller, nothing throws, and the row that survived is found by
 * somebody outside the company, if ever.
 *
 * ⚠️ SO THE LIST IS CHECKED AGAINST THE SCHEMA RATHER THAN MAINTAINED. Every
 * `CREATE TABLE IF NOT EXISTS` anywhere in the runtime has to have a row in
 * `HOLDINGS`, saying either which columns name a person or why none does. A new
 * platform table then fails this guard on the commit that adds it, which is the
 * only moment anybody is thinking about it.
 *
 * ⚠️ AND "NOTHING ABOUT A PERSON IS IN HERE" MUST BE WRITTEN DOWN. A table with
 * an empty `person` list and no reason is indistinguishable from one somebody
 * forgot to look at — the whole value of the ledger is that every line is an
 * answer somebody gave.
 *
 * ⚠️ THE APP HALF IS NOT CHECKED HERE, DELIBERATELY: a collection's erasure
 * column is derived from its own declaration (`eraseBy`), so a product cannot
 * declare one the walk misses. This guard is about the tables written by hand.
 */

import { readFileSync, readdirSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const DIR = "engine/runtime/src";
const sources = readdirSync(DIR).filter((f) => f.endsWith(".ts"));

/* --------------------------------------------------------- what exists --- */

const declared = new Map();
for (const file of sources) {
  const text = readFileSync(`${DIR}/${file}`, "utf8");
  for (const m of text.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)) declared.set(m[1], file);
}

/* --------------------------------------------------------- what is known --- */

/* ⚠️ SPLIT AT EACH ENTRY RATHER THAN MATCHED AS ONE. A single regex over a row
   has to guess where it ends, and these rows nest objects and arrays — the first
   draft's lazy `\n },` matched nothing at all, so every table read as unledgered
   and the guard was 37 false alarms rather than a check. */
const ledger = readFileSync(`${DIR}/dossier.ts`, "utf8");
const block = ledger.slice(ledger.indexOf("export const HOLDINGS"));
const starts = [...block.matchAll(/\{\s*table:\s*"(\w+)"/g)];
const known = new Map(starts.map((m, i) => [
  m[1], block.slice(m.index, starts[i + 1]?.index ?? block.indexOf("\n];")),
]));

/* ------------------------------------------------------------- the check --- */

if (!declared.size) fail("dossier: no CREATE TABLE found at all — a check that cannot fail");
if (!known.size) fail("dossier: HOLDINGS parsed as empty — a check that cannot fail");

for (const [table, file] of declared) {
  if (known.has(table)) continue;
  fail(`dossier: ${file} creates "${table}" and HOLDINGS has no row for it — `
    + `an export that never reads it and an erasure that never deletes from it, both reporting success.\n`
    + `       Add a row saying which column names a person, or that none does and why.`);
}

for (const [table, body] of known) {
  if (!declared.has(table)) {
    fail(`dossier: HOLDINGS names "${table}" and no schema module creates it — `
      + `a ledger entry for a table that does not exist reads as coverage`);
    continue;
  }
  const names = /person:\s*\[\s*\]/.test(body) === false;
  const why = /\bwhy:/.test(body);
  const label = /\blabel:/.test(body);
  if (!names && !why) {
    fail(`dossier: "${table}" names nobody and does not say why — `
      + `indistinguishable from a table somebody forgot to look at`);
  }
  if (names && !label) {
    fail(`dossier: "${table}" names a person and carries no export label — `
      + `their own copy would be missing it`);
  }
  if (!names && label) {
    fail(`dossier: "${table}" offers an export label and names nobody — `
      + `the walk can never find a row for it`);
  }
  if (/on:\s*"anonymise"/.test(body) && !why) {
    fail(`dossier: "${table}" unwrites a name instead of deleting the row and does not say why`);
  }
}

/* ⚠️ AND THE TWO OPERATIONS EXIST. A ledger this complete, walked by nothing, is
   the exact shape `capability` was written for — and it would be the third time
   in this repository that a whole mechanism shipped with no address. */
const ops = readFileSync(`${DIR}/personal.ts`, "utf8");
for (const [id, why] of [
  ["me.export", "nothing offers somebody the copy this ledger exists to assemble"],
  ["me.forget", "nothing offers somebody the deletion this ledger exists to perform"],
]) {
  if (!ops.includes(`"${id}"`)) fail(`dossier: no ${id} — ${why}`);
}

if (!bad) {
  ok(`dossier: ${declared.size} platform table(s), every one of them in the ledger`);
  ok(`dossier: every row says who is in it, or says why nobody is`);
  ok("dossier: the copy and the deletion are both reachable");
}

console.log(bad
  ? `\ndossier: ${bad} table(s) an export or an erasure would silently miss.`
  : "\ndossier: everything we hold about somebody is in one ledger, and both walks read it.");
process.exit(bad ? 1 : 0);
