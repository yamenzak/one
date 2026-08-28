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
 * question and lives in `ground/test/request-cost.test.ts`; something that
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
  ...sources("one/src"), ...sources("one-space/src"), ...sources("ground/src"),
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

/* -------------------------------------------------------------- how many --- */

/**
 * ⚠️ THE CHECK ABOVE ASKS ABOUT WAITING, AND WAITING IS ONLY HALF OF IT. A
 * request may make a thousand subrequests, and a D1 query is one — so a read per
 * row is a ceiling a customer's row count walks into whether the rows are asked
 * for one after another or all at once. `Promise.all` over a map fixes the
 * LATENCY and leaves the COUNT exactly where it was, which is why the operator's
 * workspace list could spend six hundred subrequests on one screen with the
 * sequential check green above it.
 *
 * ⚠️ SO WHAT IS CHECKED IS THE SHAPE, AND THE BOUND IS WRITTEN DOWN. A fan-out
 * over a list somebody chose (five products, four packages) is a decision this
 * repository made and can count; one over a list a customer grows is a cost they
 * set. Nothing in the code tells the two apart, so each is carried by name with
 * the bound that makes it safe — and the list can only shrink, because an entry
 * that stops fanning out fails until it is deleted.
 *
 * ⚠️ AND IT FOLLOWS THE CALL RATHER THAN MATCHING `prepare`. Every one of these
 * fan-outs calls a helper — `memberFor`, `unseenCount`, `holdingOf` — so a check
 * looking for a literal `.prepare(` inside the callback finds NONE of them and
 * says so in green. The reachable set is computed instead: a function whose body
 * runs a statement, then anything that calls one of those, to a fixpoint.
 */
{
  const HOME = ALL.filter(({ at }) => /^runtime\/src\//.test(at));

  /* ⚠️ Bodies by brace column, which this tree's formatting makes reliable: a
     top-level declaration closes on a `}` in column 0. A body this cannot find
     is a body this cannot check, so failing to find any at all is a failure. */
  const DECLARED = [
    /^(?:export\s+)?(?:async\s+)?function\s+(\w+)[\s\S]*?^\}/gm,
    /* ⚠️ THE HEAD MAY SPAN LINES AND MUST NOT SPAN A STATEMENT. `memberFor` puts
       its parameters and its return type on three lines before the arrow, and
       requiring the arrow on the first line missed it — which is one of the two
       functions every fan-out here calls. Barring a `;` in the head is what
       stops `const A_DAY = 86_400_000;` swallowing the next function. */
    /^(?:export\s+)?const\s+(\w+)\s*=[^;]{0,300}?=>\s*\{[\s\S]*?^\};?/gm,
    /^(?:export\s+)?const\s+(\w+)\s*=[^\n{]*=>[^\n{]*;$/gm,
  ];
  const bodies = new Map();
  for (const { src } of HOME) {
    const code = strip(src);
    for (const shape of DECLARED) {
      for (const [whole, name] of code.matchAll(shape)) {
        /* ⚠️ The SHORTEST reading of a name wins: a greedy one that ran to a
           later closing brace would call half the file this function's body. */
        if (!bodies.has(name) || bodies.get(name).length > whole.length) bodies.set(name, whole);
      }
    }
  }

  /* ⚠️ ONE FIXPOINT, NOT ONE HOP. `unseenCount` may not touch the database
     itself and may call something that does, and a check that stopped at the
     first call would report the caller as free. */
  const RUNS = /\.(prepare|exec|batch)\s*\(/;
  const touches = new Set([...bodies].filter(([, b]) => RUNS.test(b)).map(([n]) => n));
  for (let moved = true; moved;) {
    moved = false;
    for (const [name, body] of bodies) {
      if (touches.has(name)) continue;
      for (const other of touches) {
        if (new RegExp(`\\b${other}\\s*\\(`).test(body)) { touches.add(name); moved = true; break; }
      }
    }
  }

  /** The balanced text of a call whose opening `(` is at `from`. */
  const callAt = (code, from) => {
    let depth = 0;
    for (let i = from; i < code.length; i++) {
      if (code[i] === "(") depth++;
      else if (code[i] === ")" && !--depth) return code.slice(from, i + 1);
    }
    return null;
  };

  const fans = [];
  let unread = 0;
  for (const { at, src } of HOME) {
    /* ⚠️ A SWEEP IS THE ONE CALLER THAT IS NOT A REQUEST — the same exemption
       the sequential check makes, for the same reason. */
    if (/\/(sweep|purge|move|resources)\.ts$/.test(at)) continue;
    const code = strip(src);
    for (const hit of code.matchAll(/\.map\(\s*async\b/g)) {
      const body = callAt(code, code.indexOf("(", hit.index));
      if (body === null) { unread++; continue; }
      const reaches = RUNS.test(body)
        || [...touches].some((n) => new RegExp(`\\b${n}\\s*\\(`).test(body));
      if (reaches) fans.push(at);
    }
  }

  const here = new Map();
  for (const at of fans) here.set(at, (here.get(at) ?? 0) + 1);

  /*
    ⚠️ EACH ONE CARRIES THE BOUND THAT MAKES IT SAFE, and every bound here is a
    number this repository chose rather than one a customer grows.

    ⚠️ AND THE COUNT IS PART OF THE ENTRY, WHICH IS THE HALF THAT KEEPS BITING. A
    file, once named, would be exempt for ever — the sixth fan-out added to
    `personal.ts` would land inside an exemption written about the second, and
    the guard would report it as read and approved. Pinning how many means a new
    one fails until somebody writes down what bounds it.
  */
  const BOUNDED = new Map([
    /* ⚠️ ONE PER DOCUMENT COLLECTION, WHICH IS A NUMBER IN THE MANIFEST. The
       settings screen answers "how is each kind of document numbered, and what
       would the next one be called" — so the fan-out is over the DOCUMENT
       collections a product declares, fixed at build time, and it cannot grow
       with a workspace's data. Three today across the whole suite; a product
       with a dozen document types would still be a dozen. */
    ["runtime/src/documents.ts",
      [1, "one per DOCUMENT collection the manifest declares — fixed at build "
        + "time, never one per row"]],
    /* ⚠️ THE HOPS, NOT THE ROWS, AND THAT IS THE WHOLE POINT OF THE MODULE. A
       body names a handful of `<ref>.<field>` paths; `hopsIn` deduplicates them
       to one query per REFERENCE, and the ids of every row are collected into a
       single `IN` list first. Fifty stock lines are two statements — product and
       location — not a hundred, which is the shape this guard exists to refuse
       and the reason the join is here rather than in each screen. */
    ["runtime/src/joined.ts",
      [2, "the references one body names and the counts one view asks for, both "
        + "deduplicated — never one per row"]],
    /* ⚠️ ONE PER COLLECTION A PICKER OFFERS, NOT ONE PER ROW OR PER FIELD — see
       `Act.choices`. The fan-out is over the DISTINCT collections the acts on
       one screen reference, which is a number written in the manifest and is one
       or two on every screen in this repository; `stock.move` takes two shelves
       and they are one query. Each is capped at `CHOICES_MOST`. */
    ["runtime/src/screen.ts",
      [1, "the collections the acts on one screen offer a picker over, deduplicated"]],
    ["runtime/src/centre-ops.ts",
      [1, "the products a workspace has switched on — the deployment's own catalogue"]],
    ["runtime/src/operator.ts",
      [2, "the workspaces one account belongs to, and the deployment's product list"]],
    /* ⚠️ ONE PER COLLECTION THE APP DECLARES, WHICH IS A NUMBER IN THE MANIFEST
       — see `binnedIn`. The trash is one place across every collection, and
       finding what is in it is one query per table; that count is fixed at
       build time, so it cannot grow with a workspace's data. The alternative is
       a second table written on every delete, which is a copy that has to be
       kept in step with the row it points at through restore, freeze, edit and
       erasure. */
    ["runtime/src/bin-ops.ts",
      [1, "the collections one app declares — the trash is one place across all of them"]],
    ["runtime/src/packages.ts", [1, "the packages one app declares"]],
    ["runtime/src/personal.ts", [2, "the workspaces one person belongs to"]],
    ["runtime/src/push.ts", [1, "the devices one person has registered"]],
  ]);
  const fresh = [...here].filter(([at, n]) => (BOUNDED.get(at)?.[0] ?? 0) < n)
    .map(([at, n]) => `${at} (${n}, ${BOUNDED.get(at)?.[0] ?? 0} written down)`);
  const gone = [...BOUNDED].filter(([at, [n]]) => (here.get(at) ?? 0) < n).map(([at]) => at);

  if (!bodies.size || !touches.size) {
    fail("runaway: read no function bodies out of runtime/src, so this check is\n" +
         "       passing over nothing. The formatting it reads has changed.");
  } else if (unread) {
    fail(`runaway: ${unread} fan-out(s) could not be read to their end — the matcher\n` +
         "       is broken rather than the tree being clean.");
  } else if (fresh.length) {
    fail(`${fresh.join(", ")} runs a query per row of a list. \`Promise.all\` makes\n` +
         "       that one WAIT and leaves it N subrequests, against a ceiling of a\n" +
         "       thousand — so the cost of the screen is set by how many rows a\n" +
         "       customer has. Read the rows in one statement, or add the file here\n" +
         "       with the bound that makes it safe.");
  } else if (gone.length) {
    fail(`${gone.join(", ")} is carried as having more bounded fan-outs than it has.\n` +
         "       Correct the count or delete the entry — an exemption that outlives its\n" +
         "       reason is how a guard stops guarding.");
  } else {
    ok(`count: ${touches.size} function(s) reach the database, ` +
       `${fans.length} bounded fan-out(s) over them`);
  }
}

console.log(bad
  ? `\nrunaway: ${bad} finding(s) — something here spends until it is stopped.`
  : `\nrunaway: nothing polls, retries for ever, walks unbounded or logs per request.`);
process.exit(bad ? 1 : 0);
