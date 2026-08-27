/**
 * A SCREEN THAT IS NOT A DESTINATION IS REACHED FROM WHAT IT IS ABOUT.
 *
 * ⚠️ THE NAVIGATION IS FIVE, AND EVERYTHING ELSE HAS TO BE REACHED FROM
 * SOMEWHERE. A screen declaring `nav: "none"` is saying it belongs to a subject
 * — Receive to the shelf, Labels to the thing being labelled, Suppliers to the
 * product they supply. That is a claim about the app's own screens, and nothing
 * checks a claim.
 *
 * ⚠️ SO THE FAILURE IT CATCHES IS AN ORPHAN, WHICH IS SILENT IN EVERY OTHER
 * LANE. The route is declared, the container is mounted, the screen renders
 * perfectly at its address, every test is green — and no control in the product
 * leads to it. It is reachable by typing, which nobody does. Taking six screens
 * out of a bar in one commit is exactly when it happens, and it did.
 *
 * ⚠️ THE QUESTION IS ASKED OF EVERY APP, INCLUDING THE ONE ADDED TOMORROW.
 * `lib/trees.mjs` is the one walk, so app #3 is asked the day it is registered
 * rather than the day somebody remembers this file exists.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { appManifests } from "./lib/trees.mjs";

/** Every `.ts`/`.tsx` under a directory. */
const walk = (at) => {
  const out = [];
  for (const e of readdirSync(at, { withFileTypes: true })) {
    const full = join(at, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
};

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/* ⚠️ Comments quote routes, so they are blanked before anything is matched —
   otherwise a paragraph explaining where a screen is reached from counts as
   reaching it, which is the exact prose this guard exists to stop trusting. */
const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/^(\s*)\/\/.*$/gm, "$1");

/**
 * ⚠️ A SCREEN THE CHROME ITSELF OFFERS IS ALREADY REACHED, AND NOT BY THE APP.
 * `chrome: "search"` is the crown's middle and `chrome: "assistant"` is a button
 * beside the notifications — the SHELL draws both from the declaration, so the
 * app naming its own route would be the second answer to where they live.
 */
const CHROMED = /chrome:\s*"(?:search|assistant)"/;

/**
 * WHAT ACTUALLY TAKES SOMEBODY THERE — a travel call, not a mention.
 *
 * ⚠️ NAMING A ROUTE IS NOT REACHING IT, AND THE FIRST VERSION OF THIS GUARD
 * COULD NOT TELL THE DIFFERENCE. Every container file carries the MOUNT TABLE
 * (`["/receive", RECEIVE(api)]`) and a title lookup, so every route in the
 * product appears in it as a string — and the check passed over an app whose
 * every control had been unwired. What reaches a screen is the router handoff
 * the shell hands down (`go`/`onGo`), so that is what is matched.
 *
 * ⚠️ EXACT, OR AS THE STEM OF A RECORD'S ADDRESS. A detail screen is travelled
 * to as `/thing/${id}` and never as the bare `/thing`, so an exact-only match
 * would report every one of them.
 */
const TRAVELS = (route) => new RegExp(
  `\\b(?:go|onGo|onOpen|onDo)\\(\\s*["'\`]${route.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")}(?:["'\`/])`,
);

/**
 * ⚠️ WHAT THE SCREEN PASS ALREADY READ, KEPT FOR THE OPERATION PASS BELOW. Both
 * ask their question of the same corpus — the manifest's screen entries and the
 * app's own source minus the specimen board — and walking the tree twice is two
 * answers to which files count, which is the fault `lib/trees.mjs` exists over.
 */
const SEEN = [];

for (const [app, manifest] of appManifests()) {
  if (!existsSync(manifest)) continue;
  const src = strip(readFileSync(manifest, "utf8"));
  const block = /\n  screens: \[([\s\S]*?)\n  \],/.exec(src);
  if (!block) {
    fail(`reached: ${app} declares no screens block — this guard names its shape, `
      + `so a manifest that moved it would pass by finding nothing to check.`);
    continue;
  }

  /*
    ⚠️ ONE ENTRY AT A TIME, because `nav` and `route` are fields of the SAME
    object and a file-wide match would pair either with the other's neighbour.

    ⚠️ AND THE SPLIT IS BY BRACE BALANCE, NOT BY A REGEX, which is the second
    time that lesson has been paid for in this directory. `\{[^{}]*route:…\}`
    matches only an entry with nothing nested inside it — so the day a screen
    gained a `body`, it stopped being a screen as far as this guard was
    concerned, silently, one screen at a time. When the last one was ported the
    corpus went to nought and `guards.test.mjs` is what said so; before that it
    was a check quietly shrinking under a green tick.
  */
  const entries = [];
  for (let i = 0; i < block[1].length; i++) {
    if (block[1][i] !== "{") continue;
    let depth = 0;
    let end = i;
    for (let j = i; j < block[1].length; j++) {
      if (block[1][j] === "{") depth++;
      else if (block[1][j] === "}") { depth--; if (!depth) { end = j; break; } }
    }
    const whole = block[1].slice(i, end + 1);
    const route = /^\s*\{[^{}]*route:\s*"([^"]+)"/.exec(whole);
    if (route) entries.push([whole, route[1]]);
    i = end;
  }
  const folded = entries
    .filter(([whole]) => /nav:\s*"none"/.test(whole) && !CHROMED.test(whole))
    .map(([, route]) => route);

  if (!entries.length) {
    fail(`reached: ${app} declares no screens at all.`);
    continue;
  }

  /*
    ⚠️ THE APP'S OWN SOURCE, MINUS THE MANIFEST AND MINUS THE SPECIMEN BOARD. A
    route named only where it is DECLARED is named nowhere, which is the whole
    shape of the fault — and a route reached only from `./screens` is the same
    fault wearing a demo: that entry is a sample world for photographing screens
    and no customer loads it (`bundle.test.mjs`), so a row there leads nobody
    anywhere.

    ⚠️ THE EXPORT MAP IS WHAT SAYS WHICH FILE THAT IS, rather than a filename
    here. A guard holding its own idea of where a package's demo lives is a
    second answer to a question `package.json` already answers, and the day the
    file moves this check silently widens back.
  */
  const root = join(manifest, "..", "..");
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  /*
    ⚠️ AN APP WITH NO `./live` ENTRY HAS NO PRODUCT HALF, AND THE QUESTION IS
    NOT ASKED OF IT. That is the proving ground: its browser surface IS the
    board, so excluding the board would leave nothing to be reached FROM and
    every screen would report as an orphan — a check that cannot pass, which is
    the same uselessness as one that cannot fail. Said out loud rather than
    skipped in silence, because a corpus quietly one app smaller is the failure
    `lib/trees.mjs` exists to refuse.
  */
  const board = pkg.exports?.["./screens"];
  const live = Boolean(pkg.exports?.["./live"]);
  /* ⚠️ AND FOR AN APP WITH NO PRODUCT HALF THE BOARD IS COUNTED IN, which is
     the same sentence the skip below makes — its board IS its surface. Excluded
     from both questions, the widest manifest in the repository would be the one
     tree neither of them reads. */
  const spare = new Set([manifest, ...(board && live ? [join(root, board)] : [])]);
  const from = walk(manifest.replace(/\/index\.ts$/, ""))
    .filter((f) => !spare.has(f))
    .map((f) => strip(readFileSync(f, "utf8")))
    .join("\n");
  SEEN.push([app, manifest, entries, from]);

  /*
    ⚠️ AN APP WITH NO `./live` ENTRY HAS NO PRODUCT HALF, AND THE SCREEN QUESTION
    IS NOT ASKED OF IT. That is the proving ground: its browser surface IS the
    board, so excluding the board would leave nothing to be reached FROM and
    every screen would report as an orphan — a check that cannot pass, which is
    the same uselessness as one that cannot fail. Said out loud rather than
    skipped in silence, because a corpus quietly one app smaller is the failure
    `lib/trees.mjs` exists to refuse.

    ⚠️ THE OPERATION QUESTION ABOVE IS STILL ASKED OF IT, because that one has an
    answer here: a verb of a subject the board draws and nothing calls is a gap
    in the ground exactly as it is in a product.
  */
  if (!live) {
    ok(`${app}: a fixture with no product half — its board is its whole surface`);
    continue;
  }

  /*
    ⚠️ AND A DECLARED BODY LEADS SOMEWHERE TOO, which this could not see. A
    ported screen's links are `goes: "<screen id>"` in the MANIFEST — the one
    file this walk deliberately excludes — so every route reached only from a
    declaration read as an orphan the moment its neighbour was ported. Measured,
    by porting one: deleting the product container took `/move`'s only link with
    it, and putting the link back as a `NavRow` did not satisfy this.

    ⚠️ IT IS THE SCREEN'S ID, NOT ITS ROUTE. `goes` names a screen and the shell
    turns it into an address (`Declared`), which is why a route typed in a
    manifest would be a second spelling of one it already holds.
  */
  /* ⚠️ BOTH FORMS OF `goes` — see `GoSpec`. The long one names the field that
     carries the id (`goes: { to: "kit", by: "kit" }`) and reading only the short
     one reported every row that used it as leading nowhere. */
  const led = new Set([
    ...[...block[1].matchAll(/goes:\s*"([^"]+)"/g)].map((m) => m[1]),
    ...[...block[1].matchAll(/goes:\s*\{[^{}]*to:\s*"([^"]+)"/g)].map((m) => m[1]),
    /* ⚠️ AND A ROW OF SHORTCUTS LEADS TOO — see `BlockSpec.leads`. Four
       destinations at once is still four things reached from a screen, and
       reading only `goes` reported every one of them as an orphan. */
    ...[...block[1].matchAll(/leads:\s*\[([^\]]*)\]/g)]
      .flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])),
  ]);
  const idOf = new Map(entries
    .map(([whole, route]) => [route, /^\s*\{[^{}]*id:\s*"([^"]+)"/.exec(whole)?.[1] ?? ""]));

  const orphans = folded.filter((route) =>
    !TRAVELS(route).test(from) && !led.has(idOf.get(route) ?? ""));

  if (orphans.length) {
    fail(`reached: ${app} declares ${orphans.join(", ")} outside the navigation and `
      + `reaches ${orphans.length === 1 ? "it" : "them"} from nowhere.\n`
      + `       The screen renders at its address and no control in the product leads there, `
      + `which every other lane reports as green.`);
  } else {
    ok(`${app}: ${folded.length} screen(s) off the bar, every one of them reached from its subject`);
  }
}

/* ------------------------------- and a verb of a subject that has a screen --- */

/**
 * THE SAME FAULT ONE LEVEL DOWN: AN OPERATION NO CONTROL CALLS.
 *
 * ⚠️ `stock.undo` SHIPPED RULE-COMPLETE AND REACHABLE FROM NOTHING FOR A MONTH.
 * It refused a movement that was not yours, one no longer last on its line, one
 * over an hour old; it reversed both halves of a transfer. Built, tested end to
 * end, correct — and no screen named it, so from the product it did not exist.
 * `capability.test.mjs` asks whether a PACKAGE's exports are imported and
 * `unreachable` asks whether a permission is holdable; between them nobody was
 * asking whether an APP's operation has an address. Every lane was green.
 *
 * ⚠️ IT IS ASKED OF EVERY VERB, AND IT USED TO BE ASKED ONLY OF A SUBJECT THE
 * APP HAD ALREADY REACHED FOR. That narrowing was written during RW-0, when
 * every screen in this product had been emptied on purpose and they were coming
 * back one at a time: asking it of everything would have reported thirty-odd
 * verbs whose surfaces were not written yet, which is a guard nobody can act on
 * and everybody learns to ignore. The rebuild finished. The narrowing did not
 * expire with it.
 *
 * ⚠️ AND WHAT IT COST IS THE EXACT FAULT THIS FILE IS ABOUT, ONE LEVEL UP. A
 * subject with NO screen and NO wired verb was not a finding — it was not a
 * question. `unit` (five verbs), `kit` (six) and `job` (three) were built,
 * gated, audited, tested at the door and reachable by nobody, and the one guard
 * written to catch that reported `27 of 28 verb(s) of a reached subject called`.
 * Every word of that sentence was true. A guard that excuses a whole noun for
 * having no surface excuses precisely the case where the surface is what is
 * missing.
 *
 * ⚠️ IT FOUND ONE THE DAY IT WAS WRITTEN. `/count` wired `count.tally` and
 * `count.close`, `/counts` listed the sessions — and `count.open` was called
 * from nothing, so the product had a way to work a count, a way to settle one,
 * and no way to begin one. The list screen's own empty state said "Open a count
 * on a shelf".
 *
 * ⚠️ `WAITING` IS A COUNTDOWN, NOT AN EXEMPTION, AND IT CAN ONLY SHRINK. A name
 * that becomes reached FAILS until it is deleted, and a name for an operation
 * that no longer exists fails too — so it cannot rot into a permanent allow-list
 * the way a waiver does. Each entry is a surface somebody has to build, and the
 * only edit that adds one is a deliberate one a reviewer sees.
 */
const WAITING = new Set([
  /* The proving ground's notebook declares every cross-cutting concern and
     draws one screen; these three are the verbs that screen does not offer. */
  "ground/note.publish", "ground/note.ask", "ground/note.share",
  /* A deliberate correction of a product's whole on-hand — UN-2 built the rule
     and the product page has no control for it. */
  "inventory/product.recount",
  /*
    ⚠️ THE THIRTEEN THE WIDENED QUESTION FOUND, AND EVERY ONE OF THEM WAS ALREADY
    LIKE THIS. Nothing here regressed: they are what the narrow rule could not
    see, written down the first time anything asked.
  */
  /* Marking a batch opened starts the third of the four expiry clocks, and
     `/expiring` reports what that clock decides with no way to set it. */
  "inventory/batch.open",
  /* Teaching the scanner a code it did not recognise — the other half of
     `code.resolve`, which the viewfinder already calls. */
  "inventory/code.learn",
  /* Serialised things: issue one to somebody, take it back, service it, retire
     it. Built by OI-8; no screen. */
  "inventory/unit.issue", "inventory/unit.return", "inventory/unit.serve",
  "inventory/unit.retire",
  /* Assemblies: build a set, put something in, take something out, break it
     down. Built by OI-8; no screen. */
  "inventory/kit.assemble", "inventory/kit.put", "inventory/kit.take",
  "inventory/kit.build", "inventory/kit.break",
  /* Work orders. Built by OI-10 alongside the release rail, which shipped its
     surface; this half did not. */
  "inventory/job.open", "inventory/job.close",
]);

/**
 * ⚠️ WHAT A SCREEN IS ABOUT, FROM THE ENTRY RATHER THAN THE FILE. `of:` is also
 * how a `bind` names its source (`of: "words"`, `of: "view"`), so a file-wide
 * match reports a product whose screens are about "words" and "field" — which
 * would ask this question of collections that do not exist.
 */
const subjectsIn = (entries) => new Set(entries
  .map(([whole]) => /^\s*\{[^{}]*\bof:\s*"([^"]+)"/.exec(whole)?.[1])
  .filter(Boolean));

/**
 * Every `<collection>.<verb>` the manifest declares as a write, in order.
 *
 * ⚠️ AND THE SECOND PATTERN IS A VERB WHOSE ID IS AN ARGUMENT, WHICH THE FIRST
 * COULD NOT SEE AT ALL. `location.label` is built by a factory shared with
 * `product.label` — `operation({ id, kind: "write" })`, with the id passed in —
 * so there is no `id: "location.label"` anywhere in the tree and this guard
 * never asked about it. Not a false pass: a verb it does not know exists is one
 * it cannot report, and the shelf-labelling half of a scanning product sat
 * callable by nobody underneath a green run.
 *
 * ⚠️ THE CALL SITE IS ALSO ITS DECLARATION — see `namesIt`. Both halves are
 * needed and either alone is worse than neither: seeing the verb without
 * discounting its construction reports it as permanently wired, and discounting
 * the construction without seeing the verb discounts nothing.
 */
const writesIn = (src) => [
  ...[...src.matchAll(/id:\s*"([a-z]+)\.([a-z_]+)",\s*\n\s*kind:\s*"write"/g)]
    .map((m) => [m[1], `${m[1]}.${m[2]}`]),
  ...[...src.matchAll(/=\s*\w+\(\s*"([a-z]+)\.([a-z_]+)"/g)]
    .map((m) => [m[1], `${m[1]}.${m[2]}`]),
];

/**
 * ⚠️ A MENTION THAT IS NOT ITS OWN DECLARATION. An operation is reached by being
 * NAMED — in an act's `does`, a story step, an outcome's `back`, a job's work or
 * a hand-written screen — and every one of those is the id as a string. Counting
 * against the declaration is what makes "appears once, where it is defined" read
 * as the nothing it is.
 *
 * ⚠️ AND PROSE CANNOT SATISFY IT, which is the trap this whole check exists over.
 * `stock.undo` was named in four comments while it was reachable from nowhere —
 * paragraphs explaining what it takes and what it refuses — so a guard reading
 * raw source would have called it wired for the month it was not. `strip` blanks
 * every comment before any of this runs, and the same rule the screen half above
 * records: a sentence about where something is reached from is not reaching it.
 *
 * ⚠️ AND AN ID HANDED TO A FACTORY IS A DECLARATION TOO, which `id: "…"` alone
 * could not see. `location.label` is built by a function taking its id as an
 * argument, so its only appearance in the tree was its own construction site —
 * one quote, no `id:` line, counted as a reach, and the verb was reported as
 * wired through every run in which nothing could call it. That is precisely the
 * "appears once, where it is defined" case above, wearing a different syntax.
 */
const namesIt = (hay, op) => {
  const one = op.replace(".", "\\.");
  const quoted = new RegExp(`"${one}"`, "g");
  const declared = new RegExp(`(?:id:\\s*|\\w+\\(\\s*)"${one}"`, "g");
  return [...hay.matchAll(quoted)].length > [...hay.matchAll(declared)].length;
};

{
  const held = new Set();
  for (const [app, manifest, entries, from] of SEEN) {
    const src = strip(readFileSync(manifest, "utf8"));
    const hay = `${src}\n${from}`;
    const writes = writesIn(src);
    /* ⚠️ REPORTED, NOT NARROWED BY — see the header. What a screen is about is
       worth saying in the failure so the reader can see which nouns the product
       does reach; it is no longer what decides whether the question is asked. */
    const subjects = subjectsIn(entries);
    let asked = 0;
    let waiting = 0;
    const orphans = [];
    for (const [, op] of writes) {
      asked++;
      const key = `${app}/${op}`;
      /* ⚠️ EVERY VERB ASKED ABOUT, REACHED OR NOT, because the stale check below
         means "this name is not in the tree" and not "this name is not currently
         an orphan". Collecting only the orphans made a listed entry that had just
         been wired report twice — once correctly, and once as though it had been
         deleted. */
      held.add(key);
      if (namesIt(hay, op)) {
        /* ⚠️ THE HALF THAT MAKES THE LIST SHRINK. A name still listed after its
           surface is built is a countdown that stopped counting. */
        if (WAITING.has(key)) {
          fail(`reached: ${key} is reached now and still listed as waiting — `
            + `delete the entry, or the list stops being a countdown.`);
        }
        continue;
      }
      if (WAITING.has(key)) waiting++;
      else orphans.push(op);
    }
    if (orphans.length) {
      fail(`reached: ${app} draws ${[...subjects].join(", ")} and declares `
        + `${orphans.join(", ")}, which no control in the product calls.\n`
        + `       The operation is gated, audited, tested and answers over the API — `
        + `and from the product it does not exist. Give it a control, or add it to `
        + `WAITING with the surface it is waiting for named beside it.`);
    } else {
      /* ⚠️ THE COUNTDOWN IS SAID OUT LOUD, because "every one of them called" over
         a corpus with seven waiting is a summary that reads better than the tree
         does — which is the failure every guard in this directory is about. */
      ok(`${app}: ${asked - waiting} of ${asked} declared verb(s) called`
        + (waiting ? `, ${waiting} waiting on a surface` : ""));
    }
  }
  /* ⚠️ A CORPUS OF NOUGHT PASSES, WHICH IS WHY IT IS SAID. Every reading here is
     per app, so a walk that found no manifests is a file of assertions that never
     ran and a summary that reports it as a clean sweep. */
  if (!held.size) {
    fail("reached: no app declares a verb of a subject it has reached for — this check "
      + "asked nothing, and a check that cannot fail is one nobody can rely on.");
  }
  /* ⚠️ AND A NAME FOR SOMETHING THAT IS NOT THERE. An operation renamed or
     deleted leaves its entry behind, and a list holding names nothing matches is
     one that has stopped describing the tree. */
  for (const key of WAITING) {
    if (!held.has(key)) fail(`reached: ${key} is listed as waiting and is not there — `
      + `it was renamed, deleted, or its subject lost its screen.`);
  }
}

/* --------------------------------------- and a whole noun nobody can see --- */

/**
 * THE SAME FAULT ONE LEVEL UP: A COLLECTION NO PERSON CAN SEE A ROW OF.
 *
 * ⚠️ A TABLE IS NOT A SMALL DECLARATION. It is applied to every workspace's
 * database, indexed, scoped, carried in the erasure cascade, listed in the
 * holdings register a customer reads, and answered by the agent door. All of
 * that is real work the product does on its behalf — and if no screen draws it,
 * no view reads it and no control calls a verb of it, the return on all of it is
 * that a person cannot see one row.
 *
 * ⚠️ AND BEING WRITTEN IS NOT BEING REACHED, WHICH IS THE SHARP PART. Two of the
 * five this found are FILLED by a flow somebody completes: `product.register`
 * asks "Can you photograph it?" and writes `shot`, and asks who supplies it and
 * writes `sourcing`. Both handlers are correct. Both tables fill up. Nothing in
 * the product ever shows either back, so the honest description of that step is
 * that it asks somebody to do work and discards it politely. A rule that counted
 * a write as a reach would call that wired.
 *
 * ⚠️ THE THREE WAYS TO BE REACHED ARE THE THREE WAYS A PERSON MEETS A RECORD: a
 * screen ABOUT it, a view that READS it, or a verb of it a control CALLS. There
 * is deliberately no fourth. "Another table refs it" would excuse every join
 * table in the repository, which is exactly where this fault hides.
 */
const COLLECTIONS = /(?:^|\n)const \w+ = collection\(\{\s*\n\s*id:\s*"([^"]+)"/g;

/**
 * ⚠️ THE VIEWS BLOCK, BY ITS OWN SHAPE. `of:` is also how a binding names its
 * source and how a screen names its subject, so a file-wide match would report
 * every collection as read by something — a check that always passes, which is
 * the failure mode every guard in this directory is a record of.
 */
const READS = (src) => {
  const block = /\n  views: \[([\s\S]*?)\n  \],/.exec(src);
  return new Set(block
    ? [...block[1].matchAll(/\bof:\s*"([^"]+)"/g)].map((m) => m[1])
    : []);
};

/**
 * ⚠️ `UNSEEN` IS A COUNTDOWN ON THE SAME TERMS `WAITING` IS. A name that becomes
 * reached fails until it is deleted; a name for a collection that is not there
 * fails too. Each entry is a surface somebody owes, written where a reviewer
 * sees it being added.
 */
const UNSEEN = new Set([
  /* ⚠️ THE PROVING GROUND'S SECOND SCOPE, AND IT IS THE ONE ENTRY HERE THAT IS
     NOT A COUNTDOWN. `check-in` exists so a reference app exercises
     `scope.of: "subject"` — a record that is the PERSON's rather than the
     workspace's, and the half of the erasure mechanism that deletes somebody's
     own rows. Its surface is the test suite, deliberately. */
  "ground/check-in",
  /* Who a workspace buys from. `product.register` asks and writes `sourcing`,
     and nothing shows either back. */
  "inventory/supplier", "inventory/sourcing",
  /* The gallery around `product.photo`. Same shape: the register flow asks
     "Can you photograph it?", the handler writes the rows, no screen reads
     them. */
  "inventory/shot",
  /* Free labelling of products. Declared with no verbs at all, which is why the
     verb pass above could never have found it. */
  "inventory/tag", "inventory/tagging",
  /* The three whose verbs are in `WAITING` above; the collection is unseen for
     the same reason and stops being so in the same commit. */
  "inventory/unit", "inventory/kit", "inventory/job",
]);

{
  const held = new Set();
  for (const [app, manifest, entries, from] of SEEN) {
    const src = strip(readFileSync(manifest, "utf8"));
    const hay = `${src}\n${from}`;
    const drawn = subjectsIn(entries);
    const read = READS(src);
    const called = new Set(writesIn(src)
      .filter(([, op]) => namesIt(hay, op))
      .map(([of_]) => of_));
    const all = [...src.matchAll(COLLECTIONS)].map((m) => m[1]);
    if (!all.length) {
      fail(`reached: ${app} declares no collections this guard can see — it names their `
        + `shape, so a manifest that changed it would pass by finding nothing to check.`);
      continue;
    }
    let waiting = 0;
    const unseen = [];
    for (const id of all) {
      const key = `${app}/${id}`;
      held.add(key);
      if (drawn.has(id) || read.has(id) || called.has(id)) {
        if (UNSEEN.has(key)) {
          fail(`reached: ${key} can be seen now and is still listed as unseen — `
            + `delete the entry, or the list stops being a countdown.`);
        }
        continue;
      }
      if (UNSEEN.has(key)) waiting++;
      else unseen.push(id);
    }
    if (unseen.length) {
      fail(`reached: ${app} declares ${unseen.join(", ")} and no screen draws `
        + `${unseen.length === 1 ? "it" : "them"}, no view reads `
        + `${unseen.length === 1 ? "it" : "them"} and no control calls a verb of `
        + `${unseen.length === 1 ? "it" : "them"}.\n`
        + `       The table is created in every workspace, scoped, indexed, erased on `
        + `purge and listed in the holdings register — and a person cannot see one row. `
        + `Give it a surface, or add it to UNSEEN with the surface it is waiting for.`);
    } else {
      ok(`${app}: ${all.length - waiting} of ${all.length} collection(s) a person can reach`
        + (waiting ? `, ${waiting} waiting on a surface` : ""));
    }
  }
  if (!held.size) {
    fail("reached: no app declares a collection — this check asked nothing, and a check "
      + "that cannot fail is one nobody can rely on.");
  }
  for (const key of UNSEEN) {
    if (!held.has(key)) fail(`reached: ${key} is listed as unseen and is not there — `
      + `it was renamed or deleted.`);
  }
}

console.log(bad
  ? `\nreached: ${bad} finding(s) — a screen only a typed address can open.`
  : `\nreached: everything off the bar is reached from what it is about.`);

process.exit(bad ? 1 : 0);
