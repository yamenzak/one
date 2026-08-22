/**
 * A LABEL IS MINTED ONCE AND NEVER RE-ISSUED.
 *
 * ⚠️ THE FAILURE IS A STICKER ON A WALL THAT NOW POINTS AT NOTHING. Our own
 * label is the identity of a physical object — a shelf, a tray, a drill, a
 * decanted bottle — for the rest of that object's life. Re-minting one gives the
 * same shelf two codes: the sticker somebody put up in March resolves to
 * nothing, and the count that walks past it silently finds an unlabelled place.
 * Nothing throws, nothing goes red, and the only symptom is a workflow that
 * stops working in a room nobody is looking at.
 *
 * ⚠️ AND THE OTHER DIRECTION IS WORSE. A code re-used across two rows is two
 * objects with one history, which cannot be untangled afterwards — every
 * movement, every service and every recall against that string becomes
 * ambiguous.
 *
 * ⚠️ SO THE RULE IS STRUCTURAL: an `UPDATE … SET code = …` carries a WHERE that
 * refuses a row which already has one. A handler that checks first and then
 * writes is the same bug with an extra step — two callers, one shelf, and the
 * second write wins.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { appDirs, appManifests, appTrees } from "./lib/trees.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/* ⚠️ Comments quote the statements they are about, and this file's own header
   would otherwise count as three violations. */
const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/^(\s*)\/\/.*$/gm, "$1");

const walk = (dir) => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((one) => {
    const path = join(dir, one.name);
    if (one.isDirectory()) return walk(path);
    return /\.tsx?$/.test(one.name) ? [path] : [];
  });
};

const apps = appTrees().map(([id, dir]) => [id, join(ENGINE, dir)])
  .filter(([, src]) => existsSync(src));

/*
  ⚠️ THE STATEMENT, TEMPLATE LITERAL AND ALL. A table name interpolated into the
  SQL — which is how one operation serves both locations and products — still
  reads as `UPDATE ${table} SET code`, so the check must not require a literal
  name. What it requires is the CONDITION, which no interpolation hides.
*/
const SETS_CODE = /UPDATE\s+[^\s;]+\s+SET\s+code\s*=/gi;
const GUARDED = /code\s+IS\s+NULL\s+OR\s+code\s*=\s*''/i;

let minted = 0;
for (const [app, src] of apps) {
  for (const path of walk(src)) {
    const code = strip(readFileSync(path, "utf8"));
    for (const match of code.matchAll(SETS_CODE)) {
      minted++;
      /*
        ⚠️ THE WHOLE STATEMENT IS WHAT IS READ, and a statement ends at its
        backtick or its semicolon. Reading to the end of the line would pass a
        multi-line query whose WHERE is on the third one, which is how every
        query in this repository is written.
      */
      const from = match.index;
      const end = code.indexOf("`", code.indexOf("`", from) + 1);
      const statement = code.slice(from, end === -1 ? from + 400 : end);

      if (!GUARDED.test(statement)) {
        fail(`${app}: an \`UPDATE … SET code\` with nothing stopping it re-issuing.\n`
          + `       ${path.slice(ENGINE.length + 1)}\n`
          + `       Our own label is the identity of a physical object for the rest of that\n`
          + `       object's life. Re-minting one leaves the sticker somebody put on a shelf\n`
          + `       in March resolving to nothing, and the count that walks past it finds an\n`
          + `       unlabelled place. Add \`AND (code IS NULL OR code = '')\`.`);
      }
    }
  }
}

/*
  ⚠️ A FLOOR, BECAUSE A GUARD THAT FINDS NOTHING PRINTS A GREEN LINE. "No
  statement re-issues a label" and "no statement mints one" are the same sentence
  without a number, and the second is what a rename produces.
*/
if (minted < 1) {
  fail(`label-once: no app across ${apps.length} mints a label at all.\n`
    + `       OneInventory does, so a zero here means the statement was rewritten and\n`
    + `       this check is now about nothing.`);
} else if (!bad) {
  ok(`label-once: ${minted} minting statement(s) across ${apps.length} app(s), none re-issuing`);
}

console.log(bad
  ? `\nlabel-once: ${bad} finding(s) — a label that can be re-issued.`
  : `\nlabel-once: a code is minted once, and is that object's for good.`);
process.exit(bad ? 1 : 0);
