#!/usr/bin/env node
/**
 * ASKING A LIVE DATABASE NEVER FAILS QUIETLY, AND NEVER ASKS THE IMPOSSIBLE.
 *
 * ⚠️ THIS GUARD IS THE REHEARSAL THAT FAILED. `wrangler d1 execute --json` writes
 * its refusals where its answers go, and every caller captured that stream — so a
 * query D1 will not answer produced exit 1 and an empty log. The step that went
 * wrong was the one VERIFYING the copy, which is the worst possible place for a
 * failure nobody can read.
 *
 * ⚠️ AND THE QUERY IT REFUSED WAS ONE THAT CANNOT SUCCEED ANYWHERE. Every D1
 * database carries internal tables under `_cf_`; they are listed by
 * `sqlite_master` like any other and every query against one is refused. A table
 * list built without excluding them is broken on every database, always — so the
 * exclusion is asserted here rather than remembered.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { TABLES, answer, countsFor, rowsIn } from "./d1.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/* ------------------------------------------------------- what is excluded --- */

if (!/_cf/.test(TABLES)) {
  fail("the table list does not exclude D1's own `_cf_` tables. Every count\n"
    + "     built from it asks a question D1 refuses, on every database.");
} else ok("tables: D1's internal tables are left out of the list");

if (!/sqlite_%/.test(TABLES)) {
  fail("the table list does not exclude `sqlite_%`. `sqlite_sequence` differs\n"
    + "     between two databases holding identical rows.");
} else ok("tables: sqlite's own are left out too");

/**
 * ⚠️ AND NO WORKFLOW MAY ASK `sqlite_master` ITSELF. The exclusion is only worth
 * having in one place if a second copy cannot appear beside it — which is exactly
 * how it was wrong the first time.
 */
const flows = join(ROOT, ".github", "workflows");
const read = readdirSync(flows).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
const asking = read.filter((f) => /sqlite_master/.test(readFileSync(join(flows, f), "utf8")));
if (!read.length) {
  fail("no workflows were read at all. A check over an empty corpus is green for\n"
    + "     the same reason a check over a clean one is.");
} else if (asking.length) {
  fail(`${asking.join(", ")}: asks sqlite_master directly. Use \`d1.mjs --counts\`,\n`
    + "     which is where the exclusion lives and is the only copy of it.");
} else ok(`tables: ${read.length} workflow(s) read, none writes its own table list`);

/* ---------------------------------------------------------- the refusals --- */

const said = (rows) => JSON.stringify([{ results: rows }]);

const cases = [
  ["a refusal on stdout with a non-zero exit",
    { code: 1, stdout: '{"error":"not authorized"}', stderr: "" },
    /not authorized/],
  ["a non-zero exit that said nothing at all",
    { code: 1, stdout: "", stderr: "" },
    /exited 1/],
  ["a clean exit that answered nothing",
    { code: 0, stdout: "", stderr: "" },
    /no rows at all/],
  ["an answer that is not JSON",
    { code: 0, stdout: "[this is not json", stderr: "" },
    /not JSON/],
];
for (const [what, input, saying] of cases) {
  const got = answer(input);
  if (!got.refused) fail(`refuses: ${what} was ACCEPTED.`);
  else if (!saying.test(got.refused)) fail(`refuses: ${what} — the reason does not say why: ${got.refused}`);
  else ok(`refuses: ${what}`);
}

const fine = answer({ code: 0, stdout: said([{ t: "account", n: 3 }]), stderr: "" });
if (fine.refused) fail(`accepts: a good answer was refused — ${fine.refused}`);
else if (fine.rows?.[0]?.n !== 3) fail("accepts: a good answer did not come back as rows.");
else ok("accepts: an answer wrangler actually gave");

/* ⚠️ EVERY STATEMENT'S ROWS, NOT THE FIRST STATEMENT'S. A count per table is one
   reply carrying many, and reading `[0]` reports one table's number as all. */
const many = rowsIn([{ results: [{ t: "a", n: 1 }] }, { results: [{ t: "b", n: 2 }] }]);
if (many.length !== 2) fail(`multi: ${many.length} row(s) read out of a two-statement reply.`);
else ok("multi: every statement's rows are read, not the first's");

/* ------------------------------------------------------------- the names --- */

/* ⚠️ A TABLE NAME IS QUOTED AS AN IDENTIFIER. `order` and `group` are words
   SQLite reserves, and an unquoted one is a syntax error that fails the whole
   verification over a naming choice. */
const sql = countsFor(["order", "plain"]);
if (!sql.includes('FROM "order"')) fail(`counts: a reserved table name is not quoted: ${sql}`);
else ok("counts: table names are quoted as identifiers");

/**
 * ⚠️ AND IT IS ONE STATEMENT PER TABLE. D1 refuses a compound SELECT past a
 * ceiling well under the table count of a real deployment — 36 was rejected with
 * `too many terms in compound SELECT`. A union here is a verification that stops
 * working as the schema grows, so the shape is asserted rather than trusted.
 */
const wide = countsFor(Array.from({ length: 60 }, (_, i) => `t${i}`));
if (/UNION/i.test(wide)) {
  fail("counts: builds a compound SELECT. D1 refuses one past a few dozen terms,\n"
    + "     so this fails on exactly the databases worth verifying.");
} else if (wide.split(";").filter((s) => s.trim()).length !== 60) {
  fail(`counts: 60 tables produced ${wide.split(";").filter((s) => s.trim()).length} statement(s).`);
} else ok("counts: 60 tables, 60 statements, no compound SELECT");

/* ------------------------------------------------- and it runs end to end --- */

const ran = spawnSync(process.execPath, [join(HERE, "d1.mjs")], { encoding: "utf8" });
if (ran.status !== 2) fail(`usage: running it with no arguments exited ${ran.status}, not 2.`);
else ok("usage: it says how to be called");

console.log(bad
  ? `\nd1: ${bad} failure(s).`
  : "\nd1: a refused query is printed, and nothing asks D1 for a table it hides.");
process.exit(bad ? 1 : 0);
