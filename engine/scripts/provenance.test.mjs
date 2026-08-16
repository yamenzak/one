/**
 * EVERY COLLECTION CARRIES ITS OWN PROVENANCE, AND NO APP DECLARES IT.
 *
 * ⚠️ FOUR COLUMNS: when it was made and by whom, when it was last changed and by
 * whom. An app that had to declare these is an app that could ship without them,
 * and the first time anybody wants them is after something has gone wrong —
 * which is exactly when it is too late to start recording.
 *
 * ⚠️ AND THE GENERATED `update` MUST ACTUALLY WRITE. It was a read and a
 * `return { id }` for the whole of stages 3–10: it passed the gate, wrote an
 * audit entry saying the change had happened, answered 200 with the id, and
 * changed nothing — in every collection of every app, with every suite green,
 * because the only thing asserted about it was that the route existed. A guard
 * that only counted columns would have watched that happen.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/* ------------------------------------------------------------- the columns --- */

/**
 * ⚠️ READ OUT OF THE ONE PLACE A COLLECTION'S TABLE IS DERIVED. Asserting
 * against a list kept here would be asserting that this file agrees with itself.
 */
const schema = readFileSync(join(ENGINE, "runtime/src/schema.ts"), "utf8");

const REQUIRED = [
  ["at", "when it was made"],
  ["by", "who made it"],
  ["edited_at", "when it was last changed"],
  ["edited_by", "who last changed it"],
];

const statements = /export function statementsFor\(([\s\S]*?)\n}/.exec(schema)?.[1] ?? "";
const columns = /export const columnsFor[\s\S]*?\n};/.exec(schema)?.[0] ?? "";

if (!statements) fail(`runtime/src/schema.ts: no statementsFor — the table derivation is what this reads.`);
if (!columns) fail(`runtime/src/schema.ts: no columnsFor — the reconciler is what adds these to a live table.`);

for (const [name, what] of REQUIRED) {
  /* In the CREATE, so a new database has it. */
  if (statements && !new RegExp(`\`${name} TEXT`).test(statements)) {
    fail(`a new collection table would have no \`${name}\` (${what}).`);
  }
  /* AND in the reconciler, so a database that predates it gains it on boot. */
  if (columns && !new RegExp(`\\b${name}\\b`).test(columns)) {
    fail(`\`${name}\` is created but not reconciled, so every table older than it\n` +
         `       silently never gets one — and nothing reads a column that is absent.`);
  }
}
if (!bad) ok(`columns: every collection gets ${REQUIRED.map(([n]) => n).join(", ")}, on new tables and old`);

/* ---------------------------------------------------- the update that writes --- */

const compose = readFileSync(join(ENGINE, "runtime/src/compose.ts"), "utf8");
const update = /case "update": \{([\s\S]*?)\n      \}/.exec(compose)?.[1] ?? "";

if (!update) {
  fail(`runtime/src/compose.ts: no generated \`update\` — every collection would lose its edit.`);
} else if (!/\bpatch\(/.test(update)) {
  fail(`the generated \`update\` never calls \`patch\`, so it answers 200 and writes nothing.\n` +
       `       That shipped once and survived ten stages: the route existed, the audit\n` +
       `       entry said the change happened, and the row never moved.`);
} else {
  ok(`update: the generated edit goes through \`patch\`, which writes and reports`);
}

/**
 * ⚠️ AND `patch` MUST REPORT A STATEMENT THAT MATCHED NOTHING. The scope lives
 * in the `WHERE`, which is the only safe place for it — but that makes "not
 * yours" silent, so an unchecked row count answers 200 to an edit that landed on
 * nobody's record.
 */
const records = readFileSync(join(ENGINE, "runtime/src/records.ts"), "utf8");
const patch = /export async function patch\(([\s\S]*?)\n}/.exec(records)?.[1] ?? "";
if (!patch) {
  fail(`runtime/src/records.ts: no \`patch\`.`);
} else if (!/meta\?\.changes|meta\.changes/.test(patch)) {
  fail(`\`patch\` never checks how many rows it changed. The scope is in the WHERE,\n` +
       `       so a record belonging to somebody else matches nothing — and without the\n` +
       `       count, that answers 200 as though the edit landed.`);
} else if (!/edited_at/.test(patch) || !/edited_by/.test(patch)) {
  fail(`\`patch\` writes values without stamping edited_at/edited_by, so a changed\n` +
       `       record still reads as never touched.`);
} else {
  ok(`patch: scoped in the statement, row count checked, provenance stamped`);
}

console.log(bad
  ? `\nprovenance: ${bad} finding(s) — a record that cannot say what happened to it.`
  : `\nprovenance: every collection says who made it, who changed it, and when.`);
process.exit(bad ? 1 : 0);
