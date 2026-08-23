#!/usr/bin/env node
/**
 * A MOVE BETWEEN DESTINATIONS IS INSTANT, AND A JOURNEY CLEANS UP AFTER ITSELF.
 *
 * @design a tab switch is not a journey; only the journey still running may land.
 *
 * ⚠️ THIS WAS REPORTED AS "IT TAKES SEVERAL TAPS AND THEN GOES STUBBORN", and
 * the whole of it was two lines. `wayTo` had no answer for a sibling, so a move
 * between two of the five destinations took the PUSH's answer — a full
 * `startViewTransition` at `DURATION.page`, on the move somebody makes dozens of
 * times an hour. And the duration is not the worst of it: the tree is swapped
 * inside the transition's callback while the browser goes on showing a picture
 * of the screen being left, so for the whole animation a tap lands on the NEW
 * screen's controls under the OLD screen's image.
 *
 * ⚠️ AND THE SECOND TAP MADE IT WORSE RATHER THAN BETTER. Every journey
 * registered its own tidy-up on its own `finished`, and an interrupted
 * transition REJECTS — so pressing again made the abandoned promise settle at
 * once and the tidy-up ran in the middle of the journey that replaced it.
 *
 * ⚠️ CHECKED STRUCTURALLY BECAUSE THE BEHAVIOUR IS ALREADY TESTED, and this asks
 * the question a behaviour test cannot: whether the SHAPE that makes the fast
 * path possible is still there. `design/test/travel.test.ts` proves a lateral
 * move starts no transition; this proves nobody has quietly given laterality
 * back to the router, or added a second place that decides a way.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");
const TRAVEL = join(ENGINE, "design", "src", "frame", "travel.ts");
const NAV = join(ENGINE, "one-space", "src", "nav.ts");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const travel = readFileSync(TRAVEL, "utf8");
const nav = readFileSync(NAV, "utf8");

/* ------------------------------------------------------------- the lane --- */

if (!/"forward"\s*\|\s*"back"\s*\|\s*"lateral"/.test(travel)) {
  fail("`Way` no longer offers `lateral`, so a move between destinations has\n"
    + "       only a push's answer — a view transition on every tap of the bar.");
} else ok("way: a lateral move has an answer of its own");

/**
 * ⚠️ THE SHORT-CIRCUIT IS IN THE SAME CONDITION AS THE OTHER TWO. A browser
 * with no view transitions, a person who asked for stillness, and a tab switch
 * are all "change the screen, now" — one path, so the fast case cannot rot while
 * the decorated one is maintained. Split into a branch of its own it becomes a
 * second thing to remember.
 */
const guardLine = /way === "lateral"\)\s*\{\s*change\(\);\s*return;/.exec(travel);
if (!guardLine) {
  fail("`travel` does not commit a lateral move without a transition.\n"
    + "       Every tap on the bar then waits out an animation paced for a push.");
} else ok("lane: a lateral move is committed with no transition");

if (!/still\(\)[\s\S]{0,40}way === "lateral"/.test(travel)) {
  fail("the lateral lane is not the same condition as the reduced-motion one.\n"
    + "       Two paths for `change the screen, now` is one that goes stale.");
} else ok("lane: it shares the path with a browser that cannot and a person who asked not to");

/* --------------------------------------------------------- the journeys --- */

if (!/let journey = 0/.test(travel) || !/mine === journey/.test(travel)) {
  fail("`travel` does not number its journeys. An interrupted transition rejects,\n"
    + "       so the abandoned one tidies up after the journey that replaced it —\n"
    + "       stripping its direction off the root mid-animation.");
} else ok("journeys: only the one still running lands");

/* ------------------------------------------------------- who decides it --- */

/**
 * ⚠️ THE ADDRESSES ANSWER "WHICH WAY", WITH ONE STATED EXCEPTION — and the
 * exception is the correction. Whether a move is between DESTINATIONS is a fact
 * about the manifest (`nav: "primary"`), not about two paths: a product's home is
 * its ROOT, so `/inventory` → `/inventory/stock` reads as parent-to-child to any
 * rule written over addresses. Every move to or from Home therefore kept its
 * hierarchical push after the sibling case was fixed — which is half of all
 * navigation, and is what was reported the second time.
 *
 * ⚠️ SO THE BAR SAYS SO, AND ONLY THE BAR MAY. It holds destinations and nothing
 * else, which makes it the one place that knows; a screen or a row passing a way
 * would be the drift this whole mechanism exists to remove. Asserted as: exactly
 * one file may hand `travel` a way it did not compute.
 */
if (!/export const wayTo/.test(nav)) {
  fail("nav.ts no longer exports `wayTo` — this guard is reading for a shape\n"
    + "       that has moved, which is not the same as one that is still right.");
} else if (!/return "lateral"/.test(nav)) {
  fail("`wayTo` never answers `lateral`, so nothing ever takes the fast lane.");
} else ok("deciding: the addresses answer which way, in one place");

/* ⚠️ THE SAME PARENT, NOT MERELY THE SAME DEPTH. `/space/console/keys` and
   `/space/w/acme` are both two deep and are not siblings; giving that a tab
   switch's silence would take the one move that genuinely changes place and
   make it invisible. */
if (!/up\(a\) === up\(b\)/.test(nav)) {
  fail("`wayTo` decides laterality without comparing parents. Two areas at one\n"
    + "       depth are not siblings, and a jump between them must still travel.");
} else ok("deciding: a sibling is under the same parent, not merely as deep");

/* ------------------------------------------------ nobody else transitions --- */

/**
 * ⚠️ AND `travel` IS THE ONLY CALLER OF THE BROWSER'S API. A second
 * `startViewTransition` anywhere is a second set of rules about when the screen
 * freezes — including, inevitably, one with no re-entrancy guard.
 */
const roots = ["design/src", "one-space/src", "apps"];
const walk = (dir) => {
  let out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist") continue;
    const at = join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(at));
    else if (/\.tsx?$/.test(at)) out.push(at);
  }
  return out;
};
const files = roots.flatMap((r) => walk(join(ENGINE, r)));
const starters = files.filter((f) =>
  f !== TRAVEL && /startViewTransition/.test(readFileSync(f, "utf8")));
if (!files.length) {
  fail("no source files were read at all — a check over an empty corpus is green\n"
    + "       for the same reason a check over a clean one is.");
} else if (starters.length) {
  fail(`${starters.map((f) => f.slice(ENGINE.length + 1)).join(", ")}: starts a view\n`
    + "       transition of its own. `travel` is the one place that decides when the\n"
    + "       screen freezes, and the second place will not have the guard.");
} else ok(`one caller: ${files.length} source file(s), only \`travel\` freezes the screen`);

/* ⚠️ AND THE EXCEPTION IS EXACTLY ONE FILE. `Shell` wraps both navs once, so the
   bar and the desktop rail cannot come to disagree about what pressing the same
   five things means — and nothing else in the tree may declare a way. */
const SHELL = join(ENGINE, "design", "src", "frame", "shell.tsx");
const declaring = files.filter((f) => /onGo\([^)]*"lateral"\)/.test(readFileSync(f, "utf8")));
if (!declaring.length) {
  fail("nothing declares a move as lateral, so the bar is back to whatever the\n"
    + "       addresses say — and a product's home is its root, so every move to or\n"
    + "       from it is a hierarchical push.");
} else if (declaring.length > 1 || declaring[0] !== SHELL) {
  fail(`${declaring.map((f) => f.slice(ENGINE.length + 1)).join(", ")}: declares a way.\n`
    + "       Only the shell may, and once for both navs — a screen or a row saying\n"
    + "       which way it goes is twenty places that can disagree.");
} else ok("exception: only the shell declares a move lateral, once for both navs");

console.log(bad
  ? `\nmoving: ${bad} finding(s) — a tap costs more than it should.`
  : "\nmoving: a destination switch is instant, and a journey tidies up only after itself.");
process.exit(bad ? 1 : 0);
