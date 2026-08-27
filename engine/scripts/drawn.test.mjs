/**
 * A BLOCK IN THE VOCABULARY IS PLACED BY A DECLARATION, OR IT SAYS WHY NOT.
 *
 * @design every block a screen may declare is drawn by one, so a vocabulary cannot grow entries nothing composes.
 *
 * ⚠️ THIS IS `capability.test.mjs`'S QUESTION ONE LAYER DOWN, and the registry
 * has already answered it wrongly once. `blocks.ts` shipped thirteen charts
 * chosen by listing what the design package exports rather than by counting what
 * a product draws; eleven were removed the day somebody noticed that a
 * declaration naming one would have composed, passed every check in the tree,
 * and drawn an empty box — because the props it filled were not props that
 * component takes. The header now says every entry was COUNTED. Nothing checked
 * that, and by the time OneInventory's last screen was ported, fifteen of
 * thirty-one entries were placed by no body anywhere.
 *
 * ⚠️ AND "DRAWN SOMEWHERE" IS NOT THE TEST — PLACED BY A DECLARATION IS. Most of
 * those fifteen are drawn today, in hand-written screens, as ordinary React. The
 * path that is untested is the one the registry exists for: `Placed` reads the
 * entry, fills its slots from the bindings, hands them to `PARTS`, and the
 * component renders. A block no manifest ever names has that path exercised by
 * nothing, so the pairing of slot to prop is a claim `vocabulary.test.mjs` makes
 * statically and no render has ever made good.
 *
 * ⚠️ THE PROVING GROUND COUNTS AND A PRODUCT COUNTS, WHICH IS THE ONE PLACE THIS
 * DIFFERS FROM `private-ui.test.mjs`. That guard reads products only, because a
 * screen a customer opens is the thing being counted. Here the question is
 * whether the RENDERER has ever been asked to place the entry, and the ground is
 * where a framework claim is asserted before a product depends on it — that is
 * its whole job. What does not count is a component drawn by hand in either.
 *
 * ⚠️ AND THE EXEMPTIONS NAME WHAT IS MISSING, NOT THAT SOMETHING IS. Same shape
 * as `NOT_YET` and `KNOWN_UNENFORCED`: a sentence somebody can act on, and an
 * entry that becomes placed fails HERE until it is deleted, so the list can only
 * shrink.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { appManifests, ENGINE } from "./lib/trees.mjs";

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/**
 * WHAT NO DECLARATION PLACES, AND WHAT IT IS WAITING FOR.
 *
 * ⚠️ EACH REASON NAMES THE SHAPE OF DATA OR THE KIND OF SCREEN THAT IS ABSENT,
 * never that the block is unpopular. "Nothing uses it" is the finding, not the
 * reason — an entry whose reason is its own absence is an entry nobody can
 * decide about.
 */
const NOT_PLACED = new Map([
  ["Bars", "a barcode is drawn from a code a record carries, and neither the "
    + "proving ground nor a notebook has a scannable identifier — the product "
    + "that mints them draws its own label sheet in a session"],
  ["Document", "a legal document is drawn by the platform's own legal pages "
    + "from `DocumentBook`, so the app that would place this is the one app "
    + "that never declares a body — the deployment itself"],
  ["Steps", "where a flow has got to is drawn by the story frame around a "
    + "`StorySpec`, and a body placing it would be a second progress bar over a "
    + "walk the engine is already narrating"],
  ["PersonRow", "a row block draws one record of the screen's own list, so this "
    + "needs a collection OF PEOPLE — and the people in a workspace are the "
    + "platform's members rather than anything an app declares, so no app list "
    + "can be `of` them until the directory is readable as a collection"],
  ["Meter", "`limit` is the half that has no source: how full something is needs "
    + "an allowance beside the figure, and an allowance here is an entitlement "
    + "the wallet and the plan hold — no `Read` on any collection reaches one, so "
    + "the second slot could only ever be filled with a number typed in a manifest"],
  ["Delta", "it takes the movement itself, not two figures to subtract, and "
    + "nothing computes a period-over-period difference as a COLUMN — a report "
    + "answers one span at a time, so the figure this wants does not exist in any "
    + "row a view can bind"],
  ["Score", "out of a possible best, and no screen has wanted one: every figure "
    + "in both apps is a count, a total or a weight, none of which has a ceiling "
    + "that means anything — this is waiting on a subject that is genuinely "
    + "marked rather than measured"],
  ["Hero", "the figure a screen LEADS with is the hero REGION, which is drawn "
    + "from `HEROES` and placed above the layout so it can bleed past the gutter "
    + "— this is the same figure in a grid CELL, and no screen has wanted a "
    + "second display number under the one already leading it"],
  ["StepRow", "one step of something being explained, and neither app explains "
    + "anything in a body: a flow's progress is the story frame's (`Steps`, "
    + "excused above for the same reason) and a checklist is the guide's — this "
    + "waits on a screen that walks somebody through a procedure it does not run"],
  ["Gauge", "a dial reads a single figure against a range somebody already knows, "
    + "which is a shape a warehouse and a notebook have no instance of — it waits "
    + "on a subject with a normal band and an alarming one, and neither app has a "
    + "measurement of that kind"],
]);

/* ------------------------------------------------------- what is registered --- */

const registry = readFileSync(join(ENGINE, "kernel/src/blocks.ts"), "utf8");
const declared = [...registry.matchAll(/block\("(\w+)"/g)].map((m) => m[1]);

/*
  ⚠️ A FLOOR, FOR THE REASON `vocabulary.test.mjs` KEEPS ONE. A parser that stops
  matching reports a smaller vocabulary rather than a broken read, and from a
  smaller number alone the two look identical — which is how a guard comes to
  pass over a registry it can no longer see.
*/
const FEWEST = 20;
if (declared.length < FEWEST) {
  fail(`drawn: only ${declared.length} block(s) parsed out of kernel/src/blocks.ts, under `
    + `the ${FEWEST} floor.\n`
    + "       Either the vocabulary has been gutted or this guard has stopped reading it.");
}

/* ------------------------------------------------------------ what places one --- */

/**
 * ⚠️ THE MANIFESTS, INCLUDING THE GROUND'S. `appManifests` is the one walk, so
 * app #3 is asked on the day it is registered rather than the day somebody
 * remembers this file. A `block:` in a manifest is a placement by construction —
 * nothing else in a declaration uses that key.
 */
const placedIn = new Map();
for (const [app, path] of appManifests()) {
  let src;
  try { src = readFileSync(path, "utf8"); } catch { continue; }
  for (const m of src.matchAll(/\bblock:\s*"(\w+)"/g)) {
    (placedIn.get(m[1]) ?? placedIn.set(m[1], new Set()).get(m[1])).add(app);
  }
  /*
    ⚠️ AND A HERO IS PLACED BY ITS KIND, NOT BY `block:`. The hero region takes a
    KIND — `as: "figure"`, `as: "subject"` — so a manifest leading with either
    never writes the key this guard was reading, and both were reported as
    vocabulary nothing had ever asked the renderer to draw while two products
    opened on them. A guard that cannot see half the ways a thing is placed
    reports the half it can and calls the rest dead.
  */
  for (const m of src.matchAll(/\bas:\s*"(\w+)"/g)) {
    if (!declared.includes(m[1])) continue;
    (placedIn.get(m[1]) ?? placedIn.set(m[1], new Set()).get(m[1])).add(app);
  }
}

if (!placedIn.size) {
  fail("drawn: no manifest places a single block, which no manifest in this repository does.\n"
    + "       The reader has probably stopped matching rather than the bodies having gone.");
}

/* -------------------------------------------------------------- the finding --- */

for (const id of declared) {
  const where = placedIn.get(id);
  const why = NOT_PLACED.get(id);
  if (where) {
    if (why) {
      fail(`drawn: ${id} is placed by ${[...where].join(", ")} AND is excused in NOT_PLACED.\n`
        + "       Delete the entry — the list can only shrink, and one that keeps its\n"
        + "       entries after they stop being true is how an exemption becomes permanent.");
    }
    continue;
  }
  if (why) {
    /* ⚠️ A REASON THAT IS A LABEL IS NOT A REASON — the same rule every other
       allow-list in this directory follows. "Not needed" satisfies a presence
       check and tells the next reader nothing about what is absent. */
    if (why.trim().length < 40) {
      fail(`drawn: ${id} is excused for "${why}", which is a label rather than a reason.\n`
        + "       Say what shape of data or kind of screen is missing.");
    }
    continue;
  }
  fail(`drawn: ${id} is a block a screen may declare, and no manifest declares it.\n`
    + "       Nothing has ever asked the renderer to place it, so the pairing of its\n"
    + "       slots to its props is a static claim no render has made good. Place it in\n"
    + "       a body — the proving ground counts — or add it to NOT_PLACED with what is\n"
    + "       missing. A registry entry nothing composes is the fault this file is for.");
}

/*
  ⚠️ ON `bad`, NOT ON A COUNTER PER FINDING, AND THAT IS NOT TIDINESS. Three
  separate tallies were kept here and the summary was gated on two of them, so a
  thin reason and a gutted parser each FAILED and printed the all-clear directly
  underneath — and a reader resolving a contradiction between a red line and a
  green one resolves it in favour of the green one. Anything that failed above
  suppresses this.
*/
if (!bad) {
  ok(`drawn: ${declared.length} block(s), ${placedIn.size} placed by a declaration, `
    + `${NOT_PLACED.size} named with what they wait for`);
}

/* ⚠️ AND WHAT PLACES ONE, COUNTED, so a corpus that quietly shrank to the ground
   alone is visible rather than green. A vocabulary proved only by its own
   fixture is a vocabulary nothing has pulled on. */
const byProduct = [...placedIn.entries()].filter(([, apps]) => [...apps].some((a) => a !== "ground"));
ok(`pull: ${byProduct.length} block(s) placed by a product, `
  + `${placedIn.size - byProduct.length} by the proving ground alone`);

console.log(bad
  ? `\ndrawn: ${bad} finding(s) — a vocabulary entry nothing composes.`
  : "\ndrawn: every block a screen may declare is placed by one, or says what it waits for.");
process.exit(bad ? 1 : 0);
