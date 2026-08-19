/**
 * THE SHAPES THAT SPEND MONEY WITHOUT ANYBODY DECIDING TO.
 *
 * ⚠️ EVERY FAULT HERE IS A LOOP, AND A LOOP IS THE ONE CLASS OF BUG THAT DOES
 * NOT DEGRADE. A wrong answer is wrong once; a loop is wrong until somebody
 * notices, and what it costs is a function of how long that takes. On a platform
 * billed per request, per row and per token, "how long until somebody notices"
 * is a line on an invoice.
 *
 * ⚠️ AND NONE OF THEM FAILS A TEST. A poll is correct. A retry is correct. A
 * walk over every page is correct. Each becomes a fault only in the presence of
 * something else — a component that remounts, an error that persists, a cursor
 * the server keeps handing back — and that combination is exactly what a unit
 * test does not have.
 *
 * ⚠️ THE RULE FOR ADDING TO THIS FILE: a check belongs here if the failure it
 * catches is UNBOUNDED. Something that costs twice as much is a performance
 * question and lives in `apps/hello/test/request-cost.test.ts`; something that
 * costs until it is stopped lives here.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Every source file under a directory, with its repo-relative name. */
function sources(dir, out = []) {
  for (const name of readdirSync(join(ENGINE, dir))) {
    if (name === "node_modules" || name === "dist") continue;
    const at = `${dir}/${name}`;
    if (statSync(join(ENGINE, at)).isDirectory()) { sources(at, out); continue; }
    if (!/\.(ts|tsx|mjs)$/.test(name) || /\.test\.|\.conformance\./.test(name)) continue;
    out.push({ at, src: readFileSync(join(ENGINE, at), "utf8") });
  }
  return out;
}

const ALL = [
  ...sources("kernel/src"), ...sources("runtime/src"), ...sources("design/src"),
  ...sources("one/src"), ...sources("one-space/src"), ...sources("apps/hello/src"),
];

/* ------------------------------------------------------------------ polls --- */

/**
 * ⚠️ A TIMER THAT ASKS THE SERVER IS A BILL PER PERSON PER MONTH, PAID WHETHER
 * OR NOT ANYBODY IS LOOKING. Five seconds is 17,280 requests per open tab per
 * month; a thousand people is 17 million, which alone is more than a Workers
 * plan includes — for a screen nobody is watching.
 *
 * ⚠️ SO A REPEATING TIMER IS DECLARED, NEVER INCIDENTAL. If real-time is ever
 * needed the answer is a push (the platform already has one) or an explicit
 * declaration with a stated interval and a stated stop; what must not happen is
 * a `setInterval` appearing inside a component because a screen felt stale.
 */
{
  const timers = ALL.filter(({ src }) => /\bsetInterval\s*\(/.test(strip(src)));
  if (timers.length) {
    fail(`${timers.map((t) => t.at).join(", ")} starts a repeating timer.\n` +
         `       A poll is a request per interval per open tab, for ever, whether or\n` +
         `       not anybody is looking. Push is already built; if a poll is genuinely\n` +
         `       wanted it needs a stated interval, a stated stop, and this rule\n` +
         `       amended on purpose.`);
  } else {
    ok(`polling: nothing in ${ALL.length} source file(s) starts a repeating timer`);
  }
}

/* ---------------------------------------------------------------- retries --- */

/**
 * ⚠️ A RETRY WITHOUT A CEILING IS A LOOP THAT LOOKS LIKE CARE. `while (!ok)`
 * around a call that is failing for a reason that will not change — a rejected
 * key, a deleted row, a permission removed — is a worker spending its own budget
 * against somebody else's error, at whatever rate the network allows.
 */
{
  const forever = [];
  for (const { at, src } of ALL) {
    const code = strip(src);
    /* `while (true)` / `for (;;)` around anything that awaits. */
    for (const [, body] of code.matchAll(/(?:while\s*\(\s*true\s*\)|for\s*\(\s*;\s*;\s*\))\s*\{([\s\S]{0,600}?)\n\s*\}/g)) {
      if (/\bawait\b/.test(body) && !/\bbreak\b|\breturn\b/.test(body)) forever.push(at);
    }
  }
  if (forever.length) {
    fail(`${[...new Set(forever)].join(", ")} awaits inside an unbounded loop with\n` +
         `       no way out. A call that keeps failing for a reason that will not change\n` +
         `       makes this a meter rather than a retry.`);
  } else {
    ok(`retries: no unbounded loop awaits anything without a way out`);
  }
}

/* ----------------------------------------------------------------- walks --- */

/**
 * ⚠️ A PAGED WALK NEEDS A CEILING, AND THE PAGE TOKEN IS SOMEBODY ELSE'S. A
 * `while (cursor)` over a third party's pagination is a loop whose exit
 * condition is controlled by the third party — one that keeps handing back a
 * token walks until the request is killed, having paid for every page.
 *
 * ⚠️ THE PLATFORM ALREADY DOES THIS RIGHT IN TWO PLACES and the check exists to
 * keep the third one honest: `cloudflare.ts` and `google.ts` both bound their
 * walk with a stated maximum rather than trusting the answer to end.
 */
{
  const walks = ALL.filter(({ src }) => {
    const code = strip(src);
    if (!/\b(nextPageToken|next_cursor|cursor|page_token|hasMore|has_more)\b/.test(code)) return false;
    if (!/\b(while|for)\s*\(/.test(code)) return false;
    /* ⚠️ A CEILING IS A LITERAL BOUND ON THE LOOP ITSELF, and naming one is the
       whole ask — `MOST_PAGES`, `n < 10`, `.slice(0, N)`. */
    return !/MOST_|MAX_|_PAGES|_LIMIT|n\s*<\s*\d+|i\s*<\s*\d+/.test(code);
  });
  if (walks.length) {
    fail(`${walks.map((w) => w.at).join(", ")} walks a paged answer with no stated\n` +
         `       ceiling. The exit condition belongs to whoever is answering, so a\n` +
         `       service that keeps handing back a token is a loop we pay for.`);
  } else {
    ok(`walks: every paged read is bounded by a number this repository chose`);
  }
}

/* ------------------------------------------------------------------- cron --- */

/**
 * ⚠️ A SCHEDULE IS A MULTIPLIER ON EVERYTHING THE JOB DOES. A sweep that walks
 * every workspace is fine nightly and is a different product hourly; at
 * `* * * * *` it is a permanent background load nobody asked for, and the only
 * evidence is the bill.
 *
 * ⚠️ AND THE TRIGGER IS A HEARTBEAT HERE, WHICH IS WHY THE FLOOR IS ON IT
 * SPECIFICALLY. Each pass asks every job whether it is due, so the trigger's own
 * cadence bounds how often ANY of them can run — one number, in one file,
 * governing the whole deployment's background cost.
 */
{
  const config = readFileSync(join(ENGINE, "one/wrangler.jsonc"), "utf8");
  const crons = [...config.matchAll(/"(\S*\s+\S+\s+\S+\s+\S+\s+\S+)"/g)]
    .map((m) => m[1])
    .filter((c) => /^[\d*/,\- ]+$/.test(c) && c.split(/\s+/).length === 5);

  const tooOften = crons.filter((c) => {
    const minute = c.split(/\s+/)[0];
    /* Every minute, or more often than every fifteen. */
    if (minute === "*") return true;
    const step = /^\*\/(\d+)$/.exec(minute);
    return step ? Number(step[1]) < 15 : false;
  });

  if (!crons.length) {
    fail(`one/wrangler.jsonc: no cron parsed — the parser or the config has changed\n` +
         `       shape, and a schedule that runs every minute would now pass unnoticed.`);
  } else if (tooOften.length) {
    fail(`one/wrangler.jsonc schedules "${tooOften.join('", "')}". The trigger is a\n` +
         `       heartbeat that asks every job whether it is due, so this one number\n` +
         `       bounds the whole deployment's background cost.`);
  } else {
    ok(`cron: ${crons.length} schedule(s), none finer than a quarter of an hour`);
  }
}

/* ------------------------------------------------------------------ logs --- */

/**
 * ⚠️ A LOG LINE PER REQUEST IS A METERED EVENT PER REQUEST. Log events are
 * billed, and the ones written on a hot path scale with traffic rather than with
 * incidents — so a `console.log` left in a handler is a cost that grows exactly
 * when a deployment is doing well.
 *
 * ⚠️ AN ERROR IS EXEMPT AND SHOULD BE. `console.error` is bounded by how often
 * something is wrong, which is the number that is supposed to be small; making
 * it silent to save money is the trade this file exists to refuse.
 */
{
  /* ⚠️ `logs-exempt:` IS THE MARKER THIS REPOSITORY ALREADY USES, and honouring
     it rather than keeping a second list is the point — one convention, checked
     by two guards asking different questions of it. */
  const chatty = [];
  for (const { at, src } of ALL) {
    if (/\/(sweep|resources|boot)\.ts$/.test(at)) continue;
    if (/logs-exempt/.test(src)) continue;
    const code = strip(src);
    const lines = [...code.matchAll(/console\.(log|info|debug)\s*\(/g)];
    if (lines.length) chatty.push(`${at} (${lines.length})`);
  }
  /* ⚠️ The worker's own boot says what is wrong with a deployment ONCE per
     isolate, which is bounded by cold starts rather than by traffic. */
  const allowed = new Set(["one/src/index.ts"]);
  const wrong = chatty.filter((c) => !allowed.has(c.split(" ")[0]));
  if (wrong.length) {
    fail(`${wrong.join(", ")} logs on a path a request can reach. Log events are\n` +
         `       billed, so this is a cost that grows with traffic rather than with\n` +
         `       incidents. \`console.error\` is exempt — a failure is supposed to be rare.`);
  } else {
    ok(`logs: nothing chatty on a request path (${allowed.size} stated exemption)`);
  }
}

/* ------------------------------------------------------------- fan-out --- */

/**
 * ⚠️ A QUERY INSIDE A LOOP OVER SOMETHING A CUSTOMER CONTROLS IS A COST THEY
 * SET. One read per workspace, per member, per note — fine with three, a
 * different product with three thousand, and nothing about the code changes in
 * between. D5 already forbids the per-request fan-out across shards; this is the
 * same shape one level down.
 *
 * ⚠️ SO THE TEST IS `await` DIRECTLY INSIDE A `for`, not the fan-out itself.
 * `Promise.all` over the same list is one wait and is the fix — which is why the
 * check looks for the sequential shape rather than for the loop.
 */
{
  const chains = [];
  for (const { at, src } of ALL) {
    if (!/^runtime\/src\//.test(at)) continue;
    const code = strip(src);
    /* ⚠️ WITH BRACES AND WITHOUT. `for (const x of xs) await db.prepare(…)` is
       the same round trip per row and a shorter way to write it — the first
       version of this check required a `{` and a mutation walked straight
       through, which is exactly what mutating a guard is for. */
    const loops = [
      ...code.matchAll(/for\s*\((?:const|let)[^)]*\)\s*\{[\s\S]{0,400}?\n {2,}\}/g),
      ...code.matchAll(/for\s*\((?:const|let)[^)]*\)\s*await[\s\S]{0,600}?;/g),
    ];
    for (const [whole] of loops) {
      /* ⚠️ `prepare` ONLY, NOT `exec`. The one place statements are run in a
         deliberate order is DDL, where the order IS the correctness — a schema
         module's statements build on each other — so running those together
         would be the bug rather than the fix. */
      if (!/await\s+\w+\.prepare\(|await\s+db\.prepare\(/.test(whole)) continue;
      /*
        ⚠️ A QUERY *STARTED* IN A LOOP AND AWAITED AFTERWARDS IS THE FIX, NOT THE
        FAULT — and it contains the same words. `push((async () => { await … })())`
        collects promises that all run together; the `await` inside it belongs to
        a function that the loop never waits for. Reading the text alone, that is
        indistinguishable from the sequential shape, so the concurrent one is
        recognised by what it does with the result: it puts it somewhere.
      */
      if (/\.push\(/.test(whole) && /async/.test(whole)) continue;
      /* ⚠️ A SWEEP IS THE ONE CALLER THAT IS NOT A REQUEST — see `sweep.ts`. */
      if (/\/(sweep|purge|move|resources)\.ts$/.test(at)) continue;
      chains.push(at);
    }
  }
  const seen = [...new Set(chains)];
  /*
    ⚠️ CARRIED WITH A REASON EACH, AND THE LIST CAN ONLY SHRINK. An entry that
    stops being sequential fails this guard until it is deleted, so it cannot rot
    into a permanent exemption.
  */
  const KNOWN = new Set([]);
  const fresh = seen.filter((at) => !KNOWN.has(at));
  const stale = [...KNOWN].filter((at) => !seen.includes(at));

  if (fresh.length) {
    fail(`${fresh.join(", ")} awaits a query inside a loop. The number of round\n` +
         `       trips is then set by however many rows a customer has — fine with\n` +
         `       three, a different product with three thousand. \`Promise.all\` over\n` +
         `       the same list is one wait.`);
  } else if (stale.length) {
    fail(`${stale.join(", ")} is carried as a known sequential loop and no longer\n` +
         `       has one. Delete the entry — an exemption that outlives its reason is\n` +
         `       how a guard stops guarding.`);
  } else {
    ok(`fan-out: no per-row query chains on a request path (${KNOWN.size} stated)`);
  }
}

console.log(bad
  ? `\nrunaway: ${bad} finding(s) — something here spends until it is stopped.`
  : `\nrunaway: nothing polls, retries for ever, walks unbounded or logs per request.`);
process.exit(bad ? 1 : 0);
