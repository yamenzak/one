#!/usr/bin/env node
/**
 * EVERY QUESTION THE PAGE ASKS BEFORE THE BUNDLE ARRIVES HAS A DEPTH BUDGET.
 *
 * @design what a person waits for is measured per operation, and nothing joins that wait unbudgeted.
 *
 * ⚠️ THE PREFLIGHT IS THE CRITICAL PATH, BY DEFINITION. Those requests leave
 * before a byte of JavaScript has run, and nothing can be drawn until they
 * answer (D62) — so an operation added to that list is an operation a person
 * waits on, whatever else it is. `me.who` was found at TEN round trips deep
 * while every suite was green, which is what an unbudgeted wait looks like from
 * the inside.
 *
 * ⚠️ AND THE TWO LISTS LIVE IN DIFFERENT WORLDS, WHICH IS WHY THIS IS A SCRIPT.
 * The questions are in `one-space/index.html`; the budgets are in a suite that
 * runs inside workerd, which has no filesystem and cannot reach outside its own
 * root. Restating either list beside the other would produce two things that
 * agree with each other for ever while the page asks something else — so both
 * are READ, as text, from the files that are actually shipped and actually run.
 *
 * ⚠️ THIS DOES NOT MEASURE ANYTHING. It asks whether a measurement exists.
 * `one/test/request-cost.test.ts` is what measures, against a real worker and a
 * real database; this is the coverage question that a measurement of five
 * hand-listed operations cannot ask about a sixth.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");
const PAGE = join(ENGINE, "one-space", "index.html");
const COSTS = join(ENGINE, "one", "test", "request-cost.test.ts");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/* --------------------------------------------------- what the page asks --- */

const page = readFileSync(PAGE, "utf8");
const block = /window\.__one\s*=\s*\{([\s\S]*?)\n\s*\};/.exec(page)?.[1];
if (!block) {
  fail("no preflight block found in one-space/index.html.\n"
    + "       Either the head start is gone — which is a wave back on every visit —\n"
    + "       or this guard is reading for a shape that has moved.");
}
const asked = block ? [...block.matchAll(/"([^"]+)"\s*:/g)].map((m) => m[1]) : [];
if (block && !asked.length) fail("the preflight block asks nothing at all.");

/* ------------------------------------------------- what is budgeted for --- */

const costs = readFileSync(COSTS, "utf8");

/* ⚠️ BOTH SHAPES, because `me.who` is budgeted on its own — it is the one the
   curtain waits for, so it has a test to itself rather than a row in a list. */
const budgeted = new Set([
  ...[...costs.matchAll(/\bspent\("([^"]+)"\)/g)].map((m) => m[1]),
  ...[...costs.matchAll(/\["([^"]+)",\s*\d+\]/g)].map((m) => m[1]),
]);

if (budgeted.size < 2) {
  fail(`only ${budgeted.size} operation(s) read out of request-cost.test.ts.\n`
    + "       That is a parser that has stopped matching, not a suite that stopped\n"
    + "       measuring — check the shape before trusting a pass.");
}

/**
 * ⚠️ `health` IS THE ONE HONEST EXEMPTION, and it is exempt for a reason a
 * reader can check: it answers from the request's own hostname and touches no
 * database, so a round-trip budget over it would measure nothing. A second entry
 * here means editing this list, on purpose, in review.
 */
const FREE = new Set(["health"]);

const unbudgeted = asked.filter((op) => !FREE.has(op) && !budgeted.has(op));
if (unbudgeted.length) {
  fail(`the page asks ${unbudgeted.join(", ")} before the bundle and nothing says\n`
    + "       how deep that is allowed to be. A preflight question is on the critical\n"
    + "       path by definition — budget it in one/test/request-cost.test.ts, or say\n"
    + "       here why it costs no round trips.");
} else if (asked.length) {
  ok(`asked: ${asked.length} preflight question(s), each budgeted or free of the database`);
}

/* ⚠️ AND THE EXEMPTION CANNOT ROT. A `health` that grew a database read would
   keep its exemption for ever, silently, because nothing re-asks. */
for (const free of FREE) {
  if (!asked.includes(free)) {
    fail(`"${free}" is exempted from a budget and the page no longer asks it.\n`
      + "       An exemption for a question nobody asks is one that will be inherited\n"
      + "       by whatever takes the name next.");
  }
}
if (!bad) ok(`free: ${FREE.size} question(s) exempt, each still asked and still stated`);

console.log(bad
  ? `\nawaited: ${bad} finding(s) — something a person waits for has no ceiling.`
  : "\nawaited: nothing joins the first wait without a budget somebody has to read.");
process.exit(bad ? 1 : 0);
