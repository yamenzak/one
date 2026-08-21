/**
 * A BALANCE MOVES IN ONE PLACE, AND THE HISTORY MOVES WITH IT.
 *
 * ⚠️ A ROW WRITTEN PAST THE CHOKEPOINT IS A NUMBER NOTHING CAN REBUILD. The
 * whole claim an inventory makes is that what is on the shelf is the sum of
 * everything that happened to it — one `UPDATE stock` somewhere else and that
 * stops being true, permanently, for that line and for every report over it. And
 * nothing fails: the number is plausible, the screen redraws, and the ledger
 * simply does not add up to it any more.
 *
 * ⚠️ SO THE CHECK IS STRUCTURAL RATHER THAN BEHAVIOURAL. No test can prove that
 * a write NOBODY HAS YET ADDED will go through the right function; what a script
 * can prove is that only one function names those tables at all. This is the
 * same shape as the storage chokepoint a previous platform needed, and for the
 * same reason: the failure is invisible to every suite and permanent when it
 * lands.
 *
 * ⚠️ AND IT IS ANCHORED TO THE STATEMENT, NOT TO A WORD. `stock` appears in this
 * app on nearly every line; what is refused is a WRITE — `INSERT INTO stock`,
 * `UPDATE stock`, `DELETE FROM stock` — because a rule matched on an identifier
 * is a rule a comment can satisfy.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");
const APP = join(ENGINE, "apps/inventory/src");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(ENGINE.length + 1);

/* ⚠️ Nothing to walk is not a pass — see the count at the end. */
if (!existsSync(APP)) {
  console.log("chokepoint: no inventory app in this tree");
  process.exit(0);
}

const sources = [];
const walk = (at) => {
  for (const e of readdirSync(at, { withFileTypes: true })) {
    const path = join(at, e.name);
    if (e.isDirectory()) walk(path);
    else if (/\.tsx?$/.test(e.name)) sources.push(path);
  }
};
walk(APP);

const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/^(\s*)\/\/.*$/gm, "$1");

/**
 * ⚠️ THE ONE FUNCTION, NAMED HERE AND NOWHERE ELSE. Its file is what this guard
 * exempts, and moving the function means moving this line — which is a decision
 * somebody makes rather than a check that quietly stops applying.
 */
const CHOKEPOINT = "apps/inventory/src/index.ts";

/** ⚠️ Both tables, because the pair is the invariant. A ledger row with no
    balance move is a history of things that did not happen; a balance move with
    no ledger row is a number with no cause, and the second is the one that gets
    written by accident. */
const HELD = ["stock", "ledger"];

const WRITE = new RegExp(
  `\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+(${HELD.join("|")})\\b`, "gi");

let writes = 0;
let outside = 0;
for (const file of sources) {
  const name = rel(file);
  const code = strip(readFileSync(file, "utf8"));
  for (const m of code.matchAll(WRITE)) {
    writes++;
    if (name === CHOKEPOINT) continue;
    outside++;
    fail(`${name}: writes \`${m[1]}\` outside the chokepoint.\n`
       + `       A balance written past it is a number the ledger cannot rebuild, and a\n`
       + `       ledger row with no balance move is a history of things that did not happen.\n`
       + `       Both are silent, and both are permanent for that line.`);
  }
}

/*
  ⚠️ A FLOOR, BECAUSE A GUARD THAT WALKS NOTHING PRINTS A CONFIDENT GREEN LINE.
  "No violations found" and "nothing was looked at" are the same sentence without
  a number — and this one would read as a pass on the day somebody renames the
  tables.
*/
if (writes < 3) {
  fail(`chokepoint: only ${writes} write(s) to ${HELD.join(" or ")} in ${sources.length} file(s).\n`
     + `       The chokepoint writes both tables and a balance twice, so a number this low\n`
     + `       means the tables were renamed and this check is now about nothing.`);
} else if (!outside) {
  ok(`chokepoint: ${writes} write(s) to ${HELD.join("/")} across ${sources.length} file(s), all in one function`);
}

console.log(bad
  ? `\nchokepoint: ${bad} finding(s) — a balance that moved with nothing saying why.`
  : `\nchokepoint: what is on the shelf is the sum of what happened to it.`);
process.exit(bad ? 1 : 0);
