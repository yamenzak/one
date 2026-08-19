/**
 * A CALL THAT REACHES A MODEL AND NOT THE METER.
 *
 * ⚠️ A RESERVE IS A CEILING ON REVENUE, WHICH IS WHY THIS HAS TO BE STRUCTURAL.
 * Settlement charges `min(held, actual)`, so every unit an estimate fails to
 * anticipate is a unit the platform pays for and the customer does not —
 * silently, on every call, for ever. Nothing downstream can catch it, by design.
 * So the checks here are all about the SHAPE: one door out, one place that
 * charges, one row per run, and a margin that cannot be set to nothing.
 *
 * ⚠️ AND EVERY ONE OF THESE FAILS SILENTLY RATHER THAN LOUDLY. A second caller
 * reaching a provider directly generates perfectly good output and bills nobody.
 * A run with no spend row is a statement that cannot answer "on what". A price
 * built from a rate table nobody synced is right until a provider changes
 * something. None of it throws.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (p) => strip(readFileSync(join(ENGINE, p), "utf8"));

/* ------------------------------------------------------- one door out --- */

/**
 * ⚠️ ONE FILE MAY ASK A MODEL, AND EVERY BOUND ON THE MONEY IS BEHIND IT. A
 * second caller reaching the gateway directly takes no reserve, records no run
 * and settles nothing — and it works perfectly, produces good output, and is
 * invisible until somebody compares an invoice to the ledger.
 */
{
  const walk = (dir, out = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
    }
    return out;
  };

  const ALLOWED = new Set(["runtime/src/gateway.ts"]);
  const files = walk(ENGINE);
  const reaching = files
    .map((p) => p.slice(ENGINE.length + 1))
    .filter((p) => /gateway\.ai\.cloudflare\.com|compat\/chat\/completions/.test(read(p)))
    .filter((p) => !ALLOWED.has(p));

  if (!files.length) {
    fail("metering: walked no files — this check is passing over nothing.");
  } else if (reaching.length) {
    fail(`${reaching.join(", ")} reaches a model without going through gateway.ts.\n`
      + "       A second caller takes no reserve, records no run and settles nothing — and it\n"
      + "       works: good output, billed to nobody, invisible until an invoice is compared\n"
      + "       to the ledger.");
  } else {
    ok(`door: ${files.length} source file(s), one way out to a model`);
  }
}

/* ------------------------------------------ reserve, run, settle, record --- */

/**
 * ⚠️ THE FOUR IN ONE FUNCTION, BECAUSE SPLITTING THEM IS THE DEFECT. A previous
 * platform fixed four separate under-counts as separate functions and a later
 * edit restored the original defect with every test green — which is what the
 * defect WAS. `generate` holds all of it: the hold, the call, the charge and the
 * row, so no path can take three of the four.
 */
{
  const src = read("runtime/src/services.ts");
  const fn = /export async function generate\([\s\S]*?\n\}/.exec(src)?.[0] ?? "";

  const owed = [
    ["reserve", /await reserve\(/, "takes no hold, so a workspace can spend a balance it does not have"],
    ["release", /await release\(/, "leaves credits held when a provider fails"],
    ["settle", /await settle\(/, "never charges"],
  ];
  const missing = owed.filter(([, re]) => !re.test(fn));

  /*
    ⚠️ THE RECORD IS CHECKED ON THE SUCCESS PATH RATHER THAN ANYWHERE IN THE
    FUNCTION, and the difference is the whole check. `generate` defines a local
    `record` helper that names `recordRun`, so a version that DELETED the call
    and kept the helper still mentioned it — and this check passed the mutation
    written to catch exactly that. Found by breaking it on purpose. What has to
    be true is that the settle is followed by a row.
  */
  const after = fn.slice(fn.indexOf("await settle("));
  const records = /\brecord\(\{/.test(after);

  if (!fn) {
    fail("runtime/src/services.ts: no `generate` — the metering chain has no home.");
  } else if (missing.length) {
    fail(`runtime/src/services.ts: \`generate\` ${missing.map((m) => m[2]).join("; and ")}.`);
  } else if (!records) {
    fail("runtime/src/services.ts: a settled run writes no spend row.\n"
      + "       The balance moves and nothing says what it moved for, so a statement cannot\n"
      + "       answer the only question a shared wallet provokes.");
  } else {
    ok("chain: one function holds the reserve, the run, the charge and the row");
  }
}

/**
 * ⚠️ A FAILED RUN RELEASES AND STILL RECORDS. Two separate things, and each is a
 * different silence: a hold not released is a balance that shrank for nothing; a
 * failure with no row is a button that did nothing and left no trace anybody in
 * support can find.
 */
{
  const src = read("runtime/src/services.ts");
  const onFail = /if \(typeof out === "string"\) \{([\s\S]*?)\n  \}/.exec(src)?.[1] ?? "";
  if (!/release\(/.test(onFail) || !/record\(/.test(onFail)) {
    fail("runtime/src/services.ts: a refused run does not both release the hold and record\n"
      + "       the attempt. One is a balance that shrank for nothing; the other is a button\n"
      + "       that did nothing and left no trace.");
  } else {
    ok("failure: a refusal gives the credits back and still leaves a row");
  }
}

/* --------------------------------------------- the row holds no content --- */

/**
 * ⚠️ WHAT IT COST, NEVER WHAT WAS SAID. A generation log carrying the prompt and
 * the output is a permanent record of everything every workspace has ever typed
 * — read by nothing, deleted by nobody, and a liability the moment anybody
 * copies the database. A previous platform kept both.
 */
{
  const schema = /SPEND_SCHEMA[\s\S]*?\n\};/.exec(read("runtime/src/spend.ts"))?.[0] ?? "";
  const columns = /CREATE TABLE IF NOT EXISTS ai_run[\s\S]*?\);/.exec(schema)?.[0] ?? "";
  const content = ["prompt", "output", "input_text", "response", "completion", "text"]
    .filter((c) => new RegExp(`\\b${c}\\b`).test(columns));

  if (!columns) {
    fail("runtime/src/spend.ts: no `ai_run` table to check.");
  } else if (content.length) {
    fail(`runtime/src/spend.ts: \`ai_run\` has a column named ${content.join(", ")}.\n`
      + "       A run record holds what it COST. Keeping what was written makes this table a\n"
      + "       permanent record of everything every workspace ever typed, read by nothing.");
  } else {
    ok("record: the spend row holds the cost and none of the content");
  }
}

/* -------------------------------------------------- the margin has a floor --- */

/**
 * ⚠️ A WORKSPACE PICKING ITS OWN MODEL IS SAFE FOR EXACTLY ONE REASON: every
 * choice is charged to its own wallet at a margin. A row at or below cost turns
 * that freedom into a way to spend our money, and the more attractive the model
 * the faster it goes.
 */
{
  const ai = read("kernel/src/ai.ts");
  const op = read("runtime/src/operator.ts");

  if (!/MIN_MULTIPLIER/.test(ai) || !/multiplier <= MIN_MULTIPLIER/.test(ai)) {
    fail("kernel/src/ai.ts: `refuseCatalogue` no longer reports a row sold at or below cost.\n"
      + "       The reserve is a ceiling on revenue, so a row at cost breaks even at best.");
  } else if (!/n <= MIN_MULTIPLIER/.test(op)) {
    fail("runtime/src/operator.ts: the margin can be SET to cost even though the catalogue\n"
      + "       reports it. A rule that is drawn and not enforced is a rule with a screen.");
  } else {
    ok("margin: at-cost is refused at the write and reported in the catalogue");
  }
}

/* ------------------------------------------ the sync never makes a decision --- */

/**
 * ⚠️ THE PRICE IS DISCOVERED AND THE MARGIN IS NOT. A nightly job that wrote
 * `enabled`, `is_default` or `multiplier` would undo an operator silently, on a
 * schedule, for ever — and the symptom is a model they switched off answering
 * again the next morning.
 */
{
  const src = read("runtime/src/models.ts");
  const update = /UPDATE ai_model SET provider[\s\S]*?WHERE id = \?/.exec(src)?.[0] ?? "";
  const decided = ["enabled", "is_default", "multiplier"].filter((c) =>
    new RegExp(`${c}\\s*=\\s*\\?`).test(update));

  if (!update) {
    fail("runtime/src/models.ts: no sync UPDATE to check.");
  } else if (decided.length) {
    fail(`runtime/src/models.ts: the sync writes ${decided.join(", ")}.\n`
      + "       Those are decisions somebody made. A nightly job that overwrites them undoes\n"
      + "       an operator on a schedule, and the symptom is a model they switched off\n"
      + "       answering again the next morning.");
  } else {
    ok("sync: prices are discovered nightly and decisions are never overwritten");
  }
}

/**
 * ⚠️ AND AN EMPTY CATALOGUE IS A FAILED FETCH WEARING A SUCCESS. An API
 * answering `200 []` — wrong token, changed path, a filter matching nothing —
 * would retire every model this deployment has, in one pass, at 03:00.
 */
{
  const src = read("runtime/src/models.ts");
  if (!/refuseDiscovered\(found\)/.test(src) || !/if \(refused\.length\) return/.test(src)) {
    fail("runtime/src/models.ts: `syncModels` applies whatever it was handed.\n"
      + "       An empty answer retires the whole catalogue in one pass.");
  } else {
    ok("catalogue: an empty or unpriced answer changes nothing");
  }
}

/* ------------------------------------------------- the check is not ours --- */

/**
 * ⚠️ EVERY OTHER NUMBER IN THE CHAIN AGREES WITH THE OTHERS BY CONSTRUCTION. The
 * estimate, the rate table, the multiplier and the settle are all ours and all
 * derived from each other, so they would go on agreeing perfectly through a
 * mistake they share. The gateway's own cost is the one independent authority,
 * and reaching it needs the tag that says which workspace a call was for.
 */
{
  const gw = read("runtime/src/gateway.ts");
  const sweep = read("runtime/src/sweep.ts");

  if (!/"cf-aig-metadata"/.test(gw)) {
    fail("runtime/src/gateway.ts: calls go out untagged, so the gateway's own billing is one\n"
      + "       number for the deployment and cannot be compared to what any workspace paid.");
  } else if (!/trueUp\(/.test(sweep) || !/lossesIn\(/.test(sweep)) {
    fail("runtime/src/sweep.ts: nothing compares what we charged against what the gateway\n"
      + "       says it cost. That is the only check here that is not our own arithmetic\n"
      + "       agreeing with itself.");
  } else if (!/throw new Error\(`\$\{said\}; sold under cost/.test(sweep)) {
    fail("runtime/src/sweep.ts: a workspace sold under cost does not FAIL the job.\n"
      + "       A green run with the bad news in its detail is the shape this whole guard\n"
      + "       exists against.");
  } else {
    ok("reconcile: calls are tagged, the cost is checked, and a loss fails the run");
  }
}

console.log(bad
  ? `\nmetering: ${bad} finding(s) — a call that reaches a model and not the meter.`
  : "\nmetering: one door out, one place that charges, and a check that is not ours.");
process.exit(bad ? 1 : 0);
