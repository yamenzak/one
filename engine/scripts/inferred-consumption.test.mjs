/**
 * WHAT A COUNT FOUND MISSING IS STILL CONSUMPTION, AND THE LINK IS ONE STRING.
 *
 * ⚠️ THE FAILURE IS A FLATTERING NUMBER THAT IS SILENTLY WRONG. "Sixty-one per
 * cent of what left was recorded" is the honest measure of whether anybody is
 * actually scanning, and the whole of it rests on one coupling: a correction a
 * count caused carries that count session's id in `against`, and the report
 * recognises it by its prefix. Break either half and the report says a hundred
 * per cent — the direction nobody questions, for ever, with every test still
 * green because the unit tests build their own rows.
 *
 * ⚠️ AND THE TWO HALVES ARE IN DIFFERENT FILES BY DESIGN. The id is minted where
 * a count is opened; the prefix is read where the ledger is summed. Neither
 * file has any reason to mention the other, which is exactly why nothing but a
 * check like this one connects them.
 *
 * ⚠️ THE THIRD HALF IS THE WRITE. A close that stopped passing `against` would
 * produce corrections with an empty cause — indistinguishable from a keeper
 * deciding a number was wrong, which is a different event with a different
 * person behind it.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { appDirs, appManifests, appTrees } from "./lib/trees.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/^(\s*)\/\/.*$/gm, "$1");

const apps = appTrees().map(([id, dir]) => [id, join(ENGINE, dir)])
  .filter(([, src]) => existsSync(join(src, "index.ts")));

let checked = 0;
for (const [app, src] of apps) {
  const report = join(src, "report.ts");
  if (!existsSync(report)) continue;
  checked++;

  const summing = strip(readFileSync(report, "utf8"));
  const manifest = strip(readFileSync(join(src, "index.ts"), "utf8"));

  /* ⚠️ THE PREFIX THE REPORT LOOKS FOR, out of the expression it looks with.
     Read rather than assumed: a check with the string written into it twice is
     a check that agrees with itself. */
  const wants = /\/\^([a-z]+_)\//.exec(summing)?.[1];
  if (!wants) {
    fail(`${app}: \`report.ts\` names no id prefix to recognise a count's corrections by.\n`
      + `       Without one, stock a count found missing is indistinguishable from a\n`
      + `       keeper deciding a number was wrong — and the recorded share reads a\n`
      + `       hundred per cent for ever.`);
    continue;
  }

  /* ⚠️ AND THE PREFIX THE APP ACTUALLY MINTS. A session id built with a
     different one is the same break wearing a passing test. */
  const mints = [...manifest.matchAll(/`([a-z]+_)\$\{/g)].map((m) => m[1]);
  if (!mints.includes(wants)) {
    fail(`${app}: the report recognises \`${wants}\` and nothing mints an id with it.\n`
      + `       Minted here: ${mints.length ? mints.join(", ") : "nothing"}.\n`
      + `       The two halves live in different files on purpose — the id is minted\n`
      + `       where a count is opened and read where the ledger is summed — so nothing\n`
      + `       but this connects them, and the failure is a flattering number.`);
  }

  /*
    ⚠️ AND THE CLOSE STILL NAMES ITS CAUSE. A correction written with no
    `against` is one nothing can attribute — the ledger keeps the number and
    loses the reason, which is the whole difference between an inventory
    somebody can audit and one they can only believe.
  */
  if (!/\bagainst:\s*input\.count\b/.test(manifest)) {
    fail(`${app}: closing a count writes corrections that do not name the session.\n`
      + `       \`against: input.count\` is what makes a discrepancy attributable, and\n`
      + `       what the recorded share is computed from. Without it every correction\n`
      + `       reads as somebody deciding a number was wrong by hand.`);
  }
}

/*
  ⚠️ A FLOOR, BECAUSE A GUARD THAT FINDS NOTHING PRINTS A GREEN LINE. "The
  coupling holds" and "there is no report" are the same sentence without a
  number, and the second is what a renamed file produces.
*/
if (checked < 1) {
  fail(`inferred-consumption: no app across ${apps.length} has a \`report.ts\`.\n`
    + `       OneInventory does, so a zero here means it was renamed and this check is\n`
    + `       now about nothing.`);
} else if (!bad) {
  ok(`inferred-consumption: ${checked} report(s), each still able to tell a count's `
    + `corrections from a keeper's`);
}

console.log(bad
  ? `\ninferred-consumption: ${bad} finding(s) — a recorded share that cannot be wrong.`
  : `\ninferred-consumption: what a count found missing is still counted as gone.`);
process.exit(bad ? 1 : 0);
