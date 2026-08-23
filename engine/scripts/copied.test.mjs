/**
 * THE THING THAT SAYS A COPY IS SAFE TO BIND MUST FAIL WHEN IT IS NOT.
 *
 * @design a copy is the same database only when every table says so.
 *
 * ⚠️ `copied.mjs` IS THE LAST CHECK BEFORE A LIVE REBIND, and a checker that
 * only ever passes is worse than none: it converts "we did not look" into "we
 * looked and it was fine". `d1 execute --file` reports the statements it ran
 * rather than the rows that landed, so every way an import half-works exits 0 —
 * which is exactly the silence this repository keeps finding.
 *
 * ⚠️ SO EACH DIFFERENCE IS FED TO IT AND THE REFUSAL IS REQUIRED. A missing
 * table, a short table, an extra table, and a source that answered nothing at
 * all — the last because a failed query and an empty database look identical
 * from here, and only one of them is safe to proceed on.
 */

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = join(HERE, "copied.mjs");
const WHERE = mkdtempSync(join(tmpdir(), "copied-"));

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/** ⚠️ Shaped the way `wrangler d1 execute --json` answers: an array of results,
    one per statement, each with its own `results`. */
const asFile = (name, tables) => {
  const at = join(WHERE, `${name}.json`);
  writeFileSync(at, JSON.stringify([{
    results: Object.entries(tables).map(([t, n]) => ({ t, n })),
  }]));
  return at;
};

const said = (source, target) => {
  try {
    /* ⚠️ The tool's own report is CAPTURED rather than inherited — every case
       below is a deliberate difference, and letting its findings through would
       fill this guard's output with alarming lines that are the pass. */
    execFileSync("node", [TOOL, source, target], { encoding: "utf8", stdio: "pipe" });
    return { refused: false };
  } catch (why) {
    return { refused: true, why: `${why.stdout ?? ""}${why.stderr ?? ""}` };
  }
};

const WHOLE = { account: 12, tenant: 3, session: 40, maintenance: 1 };

const cases = [
  ["an identical copy", WHOLE, WHOLE, false],
  ["a table that did not travel", WHOLE, { account: 12, tenant: 3, maintenance: 1 }, true],
  ["a table that arrived short", WHOLE, { ...WHOLE, session: 39 }, true],
  ["a table that was already there", WHOLE, { ...WHOLE, leftover: 5 }, true],
  /* ⚠️ A source that answered nothing is a query that FAILED. An empty database
     still has its schema, so "no tables" is never a fact about the data. */
  ["a source that answered nothing", {}, WHOLE, true],
];

for (const [what, source, target, mustRefuse] of cases) {
  const out = said(asFile(`s-${what.replace(/\W/g, "")}`, source),
    asFile(`t-${what.replace(/\W/g, "")}`, target));
  if (out.refused === mustRefuse) {
    ok(`${mustRefuse ? "refuses" : "accepts"}: ${what}`);
  } else if (mustRefuse) {
    fail(`${what} was accepted.\n`
      + "       A database missing records would have been bound over a live one.");
  } else {
    fail(`${what} was refused:\n${out.why}`);
  }
}

console.log(bad
  ? `\ncopied: ${bad} finding(s) — the check before a rebind does not bite.`
  : "\ncopied: every way an import half-works is refused, and an identical copy is not.");
process.exit(bad ? 1 : 0);
