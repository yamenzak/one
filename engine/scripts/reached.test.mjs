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
 * ⚠️ AND THE QUESTION IS ASKED ONLY OF A SUBJECT THE APP HAS ALREADY REACHED
 * FOR, which is what makes it answerable during a rebuild. Every screen in this
 * product was emptied on purpose (RW-0) and they are coming back one at a time;
 * asking it of everything would report thirty-odd verbs whose surfaces are not
 * written yet, which is a guard nobody can act on and everybody learns to
 * ignore. A collection the app has DRAWN, or one whose verbs it has wired ANY
 * of, is one it has decided about — so the failure this catches is the sharp
 * one: a screen ships, wires two of its subject's three verbs, and leaves the
 * third addressable by nobody.
 *
 * ⚠️ THE SECOND HALF OF THAT WAS ADDED BECAUSE THE FIRST MISSED THE CASE IT WAS
 * WRITTEN FOR. `stock` has no screen of its own — receiving and taking live on
 * the PRODUCT page, which is `of: "product"` — so asking only about drawn
 * subjects left every stock verb unexamined, and `stock.arrive` sat callable by
 * nobody through the round that introduced this check. A subject with one verb
 * wired and six not is exactly the shape here; the narrow rule could not see it.
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
  /* The AI lane's second half: `product.see` reads photographs and IS reached
     from the register flow; the preview of what it made is not drawn anywhere. */
  "inventory/product.preview",
  /* Both need a screen of their own rather than a control on an existing one —
     a bulk import, and the label printer. */
  "inventory/product.import", "inventory/product.label",
  /* THE RELEASE RAIL, WHOLE. A batch is opened, filled, ended, then held until
     somebody releases it or fails it — and recalled or lifted afterwards. Seven
     verbs, one feature, gated on `processes`, and its screens were emptied with
     everything else. It is the one entry here that is a WHOLE surface rather
     than a control missing from an existing one, so it goes as a block or not
     at all. `process.result` is wired, which is what put the subject in this
     guard's sights in the first place. */
  "inventory/process.open", "inventory/process.put", "inventory/process.end",
  "inventory/process.release", "inventory/process.fail", "inventory/process.recall",
  "inventory/process.lift",
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

/** Every `<collection>.<verb>` the manifest declares as a write, in order. */
const writesIn = (src) => [...src.matchAll(
  /id:\s*"([a-z]+)\.([a-z_]+)",\s*\n\s*kind:\s*"write"/g)]
  .map((m) => [m[1], `${m[1]}.${m[2]}`]);

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
 */
const namesIt = (hay, op) => {
  const quoted = new RegExp(`"${op.replace(".", "\\.")}"`, "g");
  const declared = new RegExp(`id:\\s*"${op.replace(".", "\\.")}"`, "g");
  return [...hay.matchAll(quoted)].length > [...hay.matchAll(declared)].length;
};

{
  const held = new Set();
  for (const [app, manifest, entries, from] of SEEN) {
    const src = strip(readFileSync(manifest, "utf8"));
    const hay = `${src}\n${from}`;
    const writes = writesIn(src);
    /* ⚠️ DRAWN, OR REACHED FOR — see the header. Either is the app saying it has
       decided about this collection, and `stock` is only ever the second. */
    const subjects = new Set([...subjectsIn(entries),
      ...writes.filter(([, op]) => namesIt(hay, op)).map(([of_]) => of_)]);
    let asked = 0;
    let waiting = 0;
    const orphans = [];
    for (const [of_, op] of writes) {
      if (!subjects.has(of_)) continue;
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
      ok(`${app}: ${asked - waiting} of ${asked} verb(s) of a reached subject called`
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

console.log(bad
  ? `\nreached: ${bad} finding(s) — a screen only a typed address can open.`
  : `\nreached: everything off the bar is reached from what it is about.`);

process.exit(bad ? 1 : 0);
