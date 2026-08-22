/**
 * A JOB THAT IS DECLARED AND RUN BY NOTHING.
 *
 * ⚠️ THIS IS THE SHAPE THE WHOLE OPERATOR CONSOLE IS A CATALOGUE OF, AND IT HELD
 * FOR THREE STAGES. `tidy` was declared in a manifest, validated for its cron,
 * its floor and its failure route, drawn on a screen an operator opens — and no
 * code anywhere read an app's `jobs` book to execute it. Every test passed. The
 * row said "Has never run", which was true, permanent, and unreadable as a
 * fault.
 *
 * ⚠️ AND IT FAILED IN BOTH DIRECTIONS AT ONCE. The seven jobs the deployment
 * DOES run every night were string literals passed to `run()`, in no book, so
 * the console could not list them either. The screen showed exactly the work
 * that never happened and hid exactly the work that did — which is worse than
 * showing nothing, because it reads as coverage.
 *
 * ⚠️ SO THE CHECK IS ABOUT THE SEAM, NOT ABOUT ANY ONE JOB. A book the runner
 * reads, one runner, and a console that reads the same book. Anything that
 * re-derives "what runs here" a second time is how the screen and the work come
 * to describe different deployments.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { appDirs, appManifests, appTrees } from "./lib/trees.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(ENGINE.length + 1);
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const read = (p) => readFileSync(join(ENGINE, p), "utf8");

/* --------------------------------------------- every declared job has a body --- */

/**
 * ⚠️ THE APPS ARE FOUND, NOT LISTED. A guard naming the apps it checks is one
 * that stops covering the tree the day somebody adds the fifth — which is the
 * same failure it exists to catch, one level up.
 */
const APPS = appDirs().map((d) => `${d}/index.ts`)
  .filter((p) => existsSync(join(ENGINE, p)));

{
  let books = 0;
  let jobs = 0;
  for (const file of APPS) {
    const src = code(read(file));
    const at = src.indexOf("jobs:");
    if (at < 0) continue;
    books++;
    /*
      ⚠️ BALANCED BRACES, because a job's body is full of them. A lazy match to
      the next `}` ends inside the first `work` and reports every job after it
      as bodyless — a guard whose findings are its own parser is one people
      learn to wave through.
    */
    let depth = 0;
    let end = at;
    for (let i = src.indexOf("{", at); i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) { end = i; break; }
    }
    const book = src.slice(at, end);
    for (const [, id] of book.matchAll(/\bid:\s*"([\w.-]+)"/g)) jobs++;
    const bodies = [...book.matchAll(/\bwork\s*[(:]/g)].length;
    const declared = [...book.matchAll(/\bid:\s*"[\w.-]+"/g)].length;
    if (bodies < declared) {
      fail(`${file}: declares ${declared} job(s) and ${bodies} bod(y|ies).\n`
        + `       A job with no \`work\` is a row on the operator's console and a promise to `
        + `nobody — which is exactly what \`tidy\` was for three stages.`);
    }
  }
  if (!books) {
    fail("no app declares a job — this guard would pass over an empty list.");
  } else if (!bad) {
    ok(`bodies: ${jobs} declared job(s) across ${books} app(s), every one with work to do`);
  }
}

/* ------------------------------------------ the runner reads the composed book --- */

/**
 * ⚠️ ONE BOOK, BUILT FROM THE PLATFORM'S OWN AND EVERY APP'S. The console and
 * the clock must read the SAME one: two derivations of "what runs here" is how a
 * screen comes to list the jobs that do not happen.
 */
{
  const sweep = code(read("runtime/src/sweep.ts"));
  const builds = /export const jobBookFor[\s\S]{0,400}?platformJobs\(deps\)[\s\S]{0,300}?\.jobs\s*\?\?/
    .test(sweep);
  if (!builds) {
    fail("runtime/src/sweep.ts: `jobBookFor` does not compose the platform's jobs with every "
      + "app's.\n"
      + "       The console lists what this returns and the clock runs it. Built from one half, "
      + "the screen shows the work that never happens and hides the work that does.");
  } else {
    ok("book: one composed book — the platform's own and every app's");
  }
}

/**
 * ⚠️ AND SOMETHING HAS TO RUN IT. A book composed and handed to nobody is the
 * same fault one function along, and it would pass the check above.
 */
{
  const sweep = code(read("runtime/src/sweep.ts"));
  if (!/runDue\(\s*runnerFor\(deps\),\s*jobBookFor\(deps\)\s*\)/.test(sweep)) {
    fail("runtime/src/sweep.ts: the sweep does not hand the composed book to the runner.\n"
      + "       `sweep` is what the deployment's `scheduled` handler calls; a book nothing runs "
      + "is the state this guard exists for.");
  } else {
    ok("runner: the nightly pass runs the composed book, not a hand-kept list");
  }
}

/**
 * ⚠️ AND THE CONSOLE READS THE SAME BOOK RATHER THAN REBUILDING ONE. This is the
 * exact line that was wrong: `every().flatMap((a) => a.jobs)` — every app's, and
 * nothing else.
 */
{
  const op = code(read("runtime/src/operator.ts"));
  const at = op.indexOf('"op.jobs"');
  /*
    ⚠️ THE BLOCK ENDS AT THE NEXT OPERATION, and a fixed slice is what this first
    got wrong: 1200 characters ran into `op.job.run`, which legitimately reads
    `deps.jobs` — so a console rebuilding its own book passed, in the one check
    written to catch exactly that. Found by breaking it on purpose.
  */
  const next = op.indexOf('"op.', at + 10);
  const block = at < 0 ? "" : op.slice(at, next > at ? next : at + 1200);
  if (at < 0) {
    fail("runtime/src/operator.ts: `op.jobs` is gone — the console has no list to read.");
  } else if (/\.flatMap\([\s\S]{0,80}?\.jobs\b/.test(block)) {
    fail("runtime/src/operator.ts: `op.jobs` builds its own book from each app's `jobs`.\n"
      + "       That omits every job the platform itself runs — the erasure, the retention, the "
      + "money — so the screen lists the work that does not happen and hides the work that "
      + "does. Read the composed book (`deps.jobs`).");
  } else if (!/deps\.jobs\?\.\(\)/.test(block)) {
    fail("runtime/src/operator.ts: `op.jobs` does not read the injected book.");
  } else {
    ok("console: the screen reads the book the runner runs");
  }
}

/**
 * ⚠️ AND THE DEPLOYMENT HANDS BOTH HALVES OVER FROM ONE DEFINITION. Two
 * `SweepDeps` — one for the clock, one for the console — is the same job run
 * against a different set of shards or a different catalogue, with nothing
 * reporting a difference.
 */
{
  const one = code(read("one/src/index.ts"));
  if (!/jobs:\s*async \(\) => jobBookFor\(await sweepDeps\(env\)\)/.test(one)) {
    fail("one/src/index.ts: the console's book is not built from the deployment's own deps.");
  } else if (!/runner:\s*async \(\) => runnerFor\(await sweepWithOverrides\(env\)\)/.test(one)) {
    fail("one/src/index.ts: the console's runner is not built from the deployment's own deps.");
  } else {
    ok("wiring: the clock and the console are handed the same deployment");
  }
}

/* ------------------------------------------------------- the clock still ticks --- */

/**
 * ⚠️ A HANDLER WITH NO TRIGGER NEVER RUNS, and it compiles, typechecks and is
 * unit-tested — the shape this deployment has already shipped once, one config
 * file over.
 *
 * ⚠️ AND THE TRIGGER MUST BE FINER THAN THE FINEST SCHEDULE ANYBODY CAN SET. It
 * is a heartbeat now rather than the schedule itself: each pass asks every job
 * whether it is due. Against a DAILY trigger, an operator moving a job to
 * anything finer than a day would be a setting that saves successfully and
 * changes nothing.
 */
{
  const config = read("one/wrangler.jsonc").replace(/\/\/.*$/gm, "");
  const crons = /"crons"\s*:\s*\[([^\]]*)\]/.exec(config);
  if (!crons) {
    fail("one/wrangler.jsonc: no `triggers.crons`.\n"
      + "       `scheduled` compiles, typechecks and is called by nothing.");
  } else if (!/"0 \* \* \* \*"/.test(crons[1])) {
    fail(`one/wrangler.jsonc: the clock is ${crons[1].trim()} rather than an hourly heartbeat.\n`
      + "       The trigger is not the schedule any more — each pass asks every job whether it "
      + "is due. A coarser tick makes every cadence finer than it a setting that saves and "
      + "changes nothing.");
  } else {
    ok("clock: an hourly heartbeat, so a job's own schedule is what decides");
  }
}

console.log(bad
  ? `\njobs: ${bad} finding(s) — declared work that nothing performs.`
  : "\njobs: every declared job has a body, one runner runs them, and the console reads that list.");
process.exit(bad ? 1 : 0);
