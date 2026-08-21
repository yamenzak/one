/**
 * AN OBJECT'S STANDING CHANGES ONLY WHERE THE SHELF CAN CHANGE WITH IT.
 *
 * ⚠️ AN ITEMISED PRODUCT HAS TWO RECORDS OF THE SAME FACT, and this is what keeps
 * them one. `stock` says how many are on the shelf; `unit.life` says which
 * particular ones are there. Issuing a drill has to move both — and a handler
 * that flipped `life` on its own would leave a shelf claiming a drill that is in
 * somebody's van, for ever, with every count "finding" it missing and correcting
 * a number that was right.
 *
 * ⚠️ SO THE CHECK IS STRUCTURAL RATHER THAN BEHAVIOURAL, like the chokepoint it
 * sits beside. No test can prove that an act NOBODY HAS YET WRITTEN will move
 * the balance; what a script can prove is that every write of `life` is one of
 * the acts that does.
 *
 * ⚠️ AND IT IS COUNTED RATHER THAN LOCATED. Matching "is this inside
 * `actOnItem`" needs a parser; counting both and requiring them equal needs
 * neither, and fails on the one edit that matters — a fifth act added without
 * routing it through the balance.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");
const APP = join(ENGINE, "apps/inventory/src/index.ts");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

if (!existsSync(APP)) {
  console.log("life: no inventory app in this tree");
  process.exit(0);
}

/* ⚠️ Comments name the shapes they describe, and each would otherwise count. */
const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/^(\s*)\/\/.*$/gm, "$1");

const code = strip(readFileSync(APP, "utf8"));

/*
  ⚠️ THE WHOLE `SET` CLAUSE, NOT THE FIRST COLUMN. `SET life = 'issued'` is the
  obvious shape and `SET note = ?, life = ?` is the one that would slip past a
  check anchored to the word after `SET` — which is how a rule comes to cover
  the version of the bug somebody already wrote and not the next one.

  ⚠️ AND `WHERE life = …` IS NOT A WRITE. Every one of these statements guards
  itself with a compare-and-set on the standing it expects, so a match that did
  not stop at `WHERE` would count each act twice and pass whatever it liked.
*/
const SETS = /UPDATE\s+unit\s+SET\s+([\s\S]*?)\bWHERE\b/gi;

let writes = 0;
for (const m of code.matchAll(SETS)) {
  if (/\blife\s*=/i.test(m[1])) writes++;
}

/* ⚠️ The definition is not a call site — `actOnItem(` appears in it too. */
const calls = [...code.matchAll(/\bactOnItem\s*\(/g)].length
  - [...code.matchAll(/function\s+actOnItem\s*\(/g)].length;

/*
  ⚠️ A FLOOR, BECAUSE A GUARD THAT COUNTS NOTHING PRINTS `0 === 0` AND A GREEN
  LINE. "Every write is routed" and "there are no writes" are the same sentence
  without a number, and the second is what a rename produces.
*/
if (writes < 3) {
  fail(`life: only ${writes} write(s) of \`unit.life\` in the manifest.\n`
     + `       Issuing, taking back and retiring each write it, so a number this low\n`
     + `       means the column was renamed and this check is now about nothing.`);
} else if (writes !== calls) {
  fail(`life: ${writes} write(s) of \`unit.life\` and ${calls} act(s) routed through the balance.\n`
     + `       An object's standing and the shelf it is on are two records of one fact.\n`
     + `       A standing changed on its own leaves a shelf claiming something that is in\n`
     + `       somebody's van — silently, and every count afterwards "finds" it missing\n`
     + `       and corrects a number that was right.`);
} else {
  ok(`life: ${writes} write(s) of the standing, every one of them moving the shelf`);
}

console.log(bad
  ? `\nlife: ${bad} finding(s) — an object that left the shelf in one record only.`
  : `\nlife: which one is where, and how many are there, are one fact.`);
process.exit(bad ? 1 : 0);
