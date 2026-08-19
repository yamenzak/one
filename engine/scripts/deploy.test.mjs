/**
 * A DEPLOY THAT DOES NOT SERVE.
 *
 * ⚠️ THIS DEPLOYMENT ANSWERED 503 ON EVERY DOOR FOR AN HOUR, BEHIND A GREEN GATE.
 * Every guard passed, every suite passed, the deploy step succeeded — and the
 * first request threw out of `boot`, so the signpost, the account door and the
 * console were all unreachable. Nothing in the chain was wrong about its own
 * question; the chain simply had no question that meant "is it up".
 *
 * ⚠️ SIX THINGS HAD TO BE TRUE AND NONE OF THEM WAS CHECKED BY ANYTHING. They are
 * one story, in order: the schema runner may only ADD (a rollback puts old code
 * in front of a migrated database); the ALTER path must accept the table names
 * this deployment actually declares (it did not, which is what threw); a suite
 * must boot against a database that already exists (every other one starts
 * empty, so the branch that threw could not run); a failed boot must not be
 * remembered (a rejected promise was cached, so one throw killed an isolate for
 * its lifetime); the 503 must say WHICH fault it is (one message for two faults
 * sent everybody to check the thing that was fine); the boot check must ask more
 * than once (a single probe is answered by the old version); and a check that
 * fails must PUT THE LAST GOOD VERSION BACK, because an alarm nobody is awake
 * for is not a safety.
 *
 * ⚠️ EVERY ONE OF THEM IS FIXED AND NOT ONE IS PROTECTED, which is the state that
 * produced this file. A fix held in place by nothing is a fix with an expiry
 * date somebody else will discover.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");
const ROOT = join(ENGINE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const read = (p) => readFileSync(join(ENGINE, p), "utf8");
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ------------------------------------------------ the schema may only ever add --- */

/**
 * ⚠️ THIS IS WHAT MAKES A ROLLBACK SAFE, AND IT READS AS TIDINESS. Rolling the
 * worker back does not roll the database back — the previous code meets a shape
 * the new code already migrated. That is survivable for exactly as long as every
 * migration is additive: a module that dropped or narrowed anything would leave
 * the recovered version reading columns that are gone, which is an outage the
 * recovery itself caused.
 */
{
  const schema = code(read("runtime/src/schema.ts"));
  const refuses = /function refuseSql\(module: SchemaModule\)[\s\S]*?\n\}/.exec(schema)?.[0] ?? "";
  if (!/\b\(DROP\|TRUNCATE\)\b/i.test(refuses) && !/DROP[\s\S]{0,20}TRUNCATE/i.test(refuses)) {
    fail("runtime/src/schema.ts: `refuseSql` no longer refuses a destructive statement.\n"
      + "       The deploy workflow rolls the WORKER back and never the database, so the "
      + "previous version meets a database the new one migrated. That is only survivable "
      + "while every migration is additive.");
  } else if (!/const wrong = refuseSql\(module\)[\s\S]{0,400}?throw new Error/.test(schema)) {
    fail("runtime/src/schema.ts: `applySchema` does not throw on a refused module.\n"
      + "       Reporting a malformed module and running it anyway is a half-applied batch: "
      + "some statements committed, the stamp unwritten, and the next boot starting from a "
      + "database that is neither shape.");
  } else {
    const at = schema.indexOf("refuseSql(module)");
    const runs = schema.indexOf("await db.exec(oneLine(statement))");
    if (at < 0 || runs < 0 || at > runs) {
      fail("runtime/src/schema.ts: the refusal runs AFTER the statements.\n"
        + "       Checked afterwards it is a report on damage already done.");
    } else {
      ok("additive: a destructive statement is refused, before any of the batch runs");
    }
  }
}

/* ------------------------------ the ALTER path accepts the names we declare --- */

/**
 * ⚠️ THE OUTAGE ITSELF, ASKED OF EVERY TABLE RATHER THAN THE ONE THAT FOUND IT.
 * `applySchema` puts a table's name through a validator before it ALTERs it, and
 * for a while that validator was `table` — which CONVERTS a collection id and so
 * forbids the underscores it exists to produce. Every platform table with one in
 * its name could never gain a column, and the refusal throws out of `boot`.
 *
 * ⚠️ IT COULD NOT BE SEEN FROM A TEST, WHICH IS WHY IT IS HERE. The branch only
 * runs when a live table is MISSING a column, and every suite starts from an
 * empty database where nothing is missing. The first deployment that had already
 * booted was the first execution.
 *
 * ⚠️ THE RULE IS EXTRACTED AND RUN, NOT MATCHED. A guard asserting the source
 * says `asTable` passes on a rename; one that runs the actual regex over the
 * actual declared names answers the question a boot asks.
 */
{
  const sql = code(read("runtime/src/sql.ts"));
  const rule = /const TABLE_NAME = \/([^/]+)\/([a-z]*);/.exec(sql);
  const schema = code(read("runtime/src/schema.ts"));

  if (!/ALTER TABLE \$\{asTable\(name\)\}/.test(schema)) {
    fail("runtime/src/schema.ts: the ALTER path does not put the table name through `asTable`.\n"
      + "       `table` CONVERTS a collection id and rejects the underscores it produces; "
      + "`asTable` VALIDATES a name that is already a table's. Confusing them threw out of "
      + "`boot` and answered 503 on every door.");
  } else if (!rule) {
    fail("runtime/src/sql.ts: no `TABLE_NAME` rule to read.\n"
      + "       This guard runs the real rule over the real names; it cannot be satisfied by "
      + "reading a function's name.");
  } else {
    /* ⚠️ THE REAL RULE, RECONSTRUCTED RATHER THAN RE-TYPED. A guard that keeps
       its own copy of the pattern is a guard that goes on passing after the
       pattern it is about has changed. */
    const accepts = new RegExp(rule[1], rule[2]);
    const declared = new Set();
    let files = 0;

    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!e.name.endsWith(".ts") && !e.name.endsWith(".tsx")) continue;
        const src = readFileSync(p, "utf8");
        if (!/CREATE TABLE IF NOT EXISTS/i.test(src) && !/ALTER TABLE/i.test(src)) continue;
        files++;
        for (const [, name] of src.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)/gi)) declared.add(name);
      }
    };
    walk(ENGINE);

    /* ⚠️ AN EMPTY CORPUS PASSES EVERY RULE. Twenty-odd tables is what this
       deployment declares; a walk that found none is a broken walk, not a clean
       schema. */
    if (declared.size < 20) {
      fail(`runtime: found only ${declared.size} declared table(s) across ${files} file(s).\n`
        + "       This deployment declares more than that, so the walk is wrong and the check "
        + "below is passing over nothing.");
    } else {
      const refused = [...declared].filter((n) => !accepts.test(n));
      if (refused.length) {
        fail(`runtime/src/sql.ts: \`TABLE_NAME\` refuses ${refused.length} declared table name(s): `
          + `${refused.slice(0, 6).join(", ")}.\n`
          + "       A name it refuses is a table that can never gain a column — and the refusal "
          + "throws out of `boot`, so it is not one failed migration, it is the deployment.");
      } else {
        ok(`alter: ${declared.size} declared table name(s) across ${files} file(s), every one `
          + "the ALTER path can accept");
      }
    }
  }
}

/* --------------------------------- something boots against an old database --- */

/**
 * ⚠️ EVERY OTHER SUITE STARTS EMPTY, AND THAT IS THE WHOLE BLIND SPOT. `CREATE
 * TABLE IF NOT EXISTS` builds whatever the code currently declares when there is
 * no table, so a column added to a `CREATE TABLE` is present in every test and
 * absent in every deployment that has booted once. The reconciliation branch —
 * the one that threw — cannot execute in a suite that never has an old table.
 */
{
  const tests = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (e.name.endsWith(".test.ts")) tests.push(p);
    }
  };
  walk(ENGINE);

  /* A suite that makes a table with its OWN hand and then applies the current
     modules over it — which is the only arrangement in which the reconciler has
     anything to reconcile. */
  const migrates = tests.filter((p) => {
    const src = readFileSync(p, "utf8");
    const made = src.search(/CREATE TABLE IF NOT EXISTS/i);
    return made >= 0 && src.indexOf("applySchema", made) > made;
  });

  if (!migrates.length) {
    fail(`no suite boots against a database that already exists (looked at ${tests.length}).\n`
      + "       Make the OLD table by hand, apply the CURRENT modules over it, and use them. "
      + "Without one, the reconciliation path runs for the first time in production.");
  } else {
    ok(`migration: ${migrates.length} of ${tests.length} suite(s) apply the current schema over `
      + "a table that was already there");
  }
}

/* ------------------------------------------- a failed boot is not remembered --- */

/**
 * ⚠️ `booted ??=` CACHES A REJECTION, AND A CACHED REJECTION IS PERMANENT. One
 * throw — a D1 hiccup on the first request of a cold start is enough — made
 * every request that isolate would ever serve answer 503, with no way back but a
 * new version. The fault becomes self-inflicted the moment it is remembered.
 */
{
  const one = code(read("one/src/index.ts"));
  const cleared = /\)\(\)\s*\.catch\(\s*\(\w*\)\s*=>\s*\{[\s\S]{0,200}?booted\s*=\s*null[\s\S]{0,200}?throw\b/
    .test(one);
  if (!/booted\s*\?\?=/.test(one)) {
    ok("boot: no promise is memoised, so there is no rejection to remember");
  } else if (!cleared) {
    fail("one/src/index.ts: `boot` memoises its promise and does not clear it on failure.\n"
      + "       A rejected promise cached is an isolate that answers 503 for its whole life over "
      + "a fault that may have lasted one request. Clear `booted` in a `.catch` and rethrow — "
      + "the work is idempotent, so the next request may simply try again.");
  } else {
    ok("boot: a failure is forgotten and rethrown; only a success is kept");
  }
}

/* --------------------------------------------- the 503 says which fault it is --- */

/**
 * ⚠️ ONE MESSAGE FOR TWO FAULTS COST AN OUTAGE ITS DIAGNOSIS. "One is not
 * configured" was returned both when an environment variable was unset and when
 * `boot` threw, so a deployment whose schema failed to apply reported a missing
 * variable — and the first thing anybody checked was the one thing that was
 * fine. The detail still goes to the log; the TITLE says which class.
 */
{
  const one = code(read("one/src/index.ts"));
  const fn = /const unavailable = \([\s\S]*?\n\s*\);/.exec(one)?.[0] ?? "";
  /* ⚠️ THE `title` CLAUSE, NOT THE WHOLE FUNCTION. Counting string literals
     anywhere in it is satisfied by the content type and the problem code, so a
     function saying one thing twice would pass the check written to catch it. */
  const clause = /title:([\s\S]*?),\n/.exec(fn)?.[1] ?? "";
  const said = new Set([...clause.matchAll(/"([^"]+)"/g)].map((m) => m[1])
    .filter((s) => /\s/.test(s)));

  if (!fn) {
    fail("one/src/index.ts: no `unavailable` — nothing shapes the 503 a probe reads.");
  } else if (said.size < 2) {
    fail("one/src/index.ts: `unavailable` gives one message for both faults.\n"
      + `       It says ${JSON.stringify([...said][0] ?? "")} whether the deployment was `
      + "misconfigured or failed to start. Those send an operator to different files, and "
      + "sending them to the wrong one cost an outage its diagnosis.");
  } else if (!/unavailable\("unconfigured"\)/.test(one) || !/unavailable\("boot"\)/.test(one)) {
    fail("one/src/index.ts: `unavailable` can tell the two faults apart and the handler does "
      + "not use it.\n"
      + "       Both call sites pass the same reason, so the distinction exists in the function "
      + "and nowhere a probe can read it.");
  } else {
    ok(`unavailable: ${said.size} distinct 503 titles — a missing variable and a failed start `
      + "are not the same sentence");
  }
}

/* ------------------------------------------- the boot check asks more than once --- */

/**
 * ⚠️ ONE PROBE RACES THE DEPLOY. `wrangler deploy` returns before every colo is
 * serving the new version, so a request six seconds later can be answered by the
 * OLD one — which is precisely how a worker that threw on every request passed
 * this check and was found hours later by somebody opening the app. Retrying
 * removes the race in the direction that matters: a broken worker stays broken,
 * so the LAST answer is the true one.
 */
{
  const check = code(readFileSync(join(ENGINE, "scripts", "boot-check.mjs"), "utf8"));
  const loop = /for \(let i = 0; i < (\d+); i\+\+\)/.exec(check);
  if (!loop) {
    fail("scripts/boot-check.mjs: no retry loop — the deploy is probed once.\n"
      + "       A single probe can be answered by the version being replaced, so a broken "
      + "deployment passes and a person finds it later.");
  } else if (Number(loop[1]) < 3) {
    fail(`scripts/boot-check.mjs: ${loop[1]} attempt(s) is not enough to outlast a rollout.`);
  } else if (!/setTimeout/.test(check)) {
    fail("scripts/boot-check.mjs: the retries have no delay, so all of them land inside the "
      + "same race.");
  } else if (!/i >= 1|i > 0/.test(check)) {
    fail("scripts/boot-check.mjs: the first answer is believed.\n"
      + "       The old version answers 200 too. The loop has to keep asking past the first "
      + "good answer, or the retry changes nothing.");
  } else {
    ok(`probe: ${loop[1]} attempts with a delay, and the first good answer is not the verdict`);
  }
}

/* ------------------------------------- a deploy that does not serve is put back --- */

/**
 * ⚠️ THE CHECK COULD ALREADY TELL A BROKEN DEPLOYMENT FROM A WORKING ONE, AND
 * NOTHING ACTED ON IT. The run went red, the worker went on answering 503 on
 * every door, and recovery waited for a person to notice, read a log and push a
 * revert. That is the whole distance between an alarm and a safety.
 *
 * ⚠️ AND THE ORDER IS THE MECHANISM. What is serving has to be recorded BEFORE
 * anything replaces it — after the deploy, the answer is the broken version.
 */
{
  /* ⚠️ COMMENTS STRIPPED, AND THE COMMAND ANCHORED TO THE START OF ITS LINE.
     The first version of this check matched `wrangler rollback` anywhere in the
     file — and the rollback step's own failure message tells a human to "run
     'wrangler rollback $was'". Deleting the actual command left the sentence
     about it, and the guard written to catch exactly that passed. Found by
     breaking it on purpose. */
  const yml = readFileSync(join(ROOT, ".github", "workflows", "engine.yml"), "utf8")
    .replace(/^\s*#.*$/gm, "");
  const deploy = yml.slice(yml.indexOf("\n  deploy:"));

  const seq = [
    ["remembers", /wrangler versions list[\s\S]{0,400}?was=/, "records the version that is serving"],
    ["deploys", /command: deploy\b/, "deploys"],
    ["probes", /^[ \t]*(?:node |run: node )[\w./]*boot-check\.mjs/m, "checks that it booted"],
    ["restores", /^[ \t]*(?:if[ \t]+)?(?:pnpm exec |npx )?wrangler rollback\b/m,
      "puts the last good version back"],
  ];

  const at = Object.fromEntries(seq.map(([key, rx]) => [key, deploy.search(rx)]));
  const missing = seq.filter(([key]) => at[key] < 0);

  if (missing.length) {
    fail(`.github/workflows/engine.yml: the deploy job never ${missing.map((m) => m[2]).join(", nor ")}.\n`
      + "       A deploy that does not serve has to be undone by the thing that noticed, or the "
      + "outage lasts until a person is awake.");
  } else if (!(at.remembers < at.deploys && at.deploys < at.probes && at.probes < at.restores)) {
    fail(".github/workflows/engine.yml: the deploy steps are out of order.\n"
      + "       Record what is serving, deploy, check, then roll back. Reading the serving "
      + "version AFTER the deploy records the broken one as the recovery target.");
  } else if (!/if: failure\(\)[\s\S]{0,200}?steps\.\w+\.outcome == 'failure'/.test(deploy)) {
    fail(".github/workflows/engine.yml: the rollback is not conditioned on the boot check "
      + "failing.\n"
      + "       A rollback on any failure undoes a working deployment over an unrelated step; "
      + "one with no condition at all runs on every deploy.");
  } else if (deploy.slice(at.restores).search(seq[2][1]) < 0) {
    fail(".github/workflows/engine.yml: the rollback is not re-checked.\n"
      + "       A rollback that reported success and did not serve is the same silence one level "
      + "up — which is the silence this whole file is about.");
  } else {
    ok("rollback: the previous version is recorded, the boot is checked, and a failed check "
      + "puts it back and verifies");
  }
}

console.log(bad
  ? `\ndeploy: ${bad} finding(s) — a deploy that could not serve and nothing that would notice.`
  : "\ndeploy: additive migrations, a probe that outlasts the rollout, and a bad deploy put back.");
process.exit(bad ? 1 : 0);
