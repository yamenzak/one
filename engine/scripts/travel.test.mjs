/**
 * GOING SOMEWHERE IS ONE MECHANISM, AND NOTHING ELSE MAY MOVE THE PAGE.
 *
 * ⚠️ THE FAULT THIS REFUSES IS A SECOND ROUTER, and it is the ordinary way a
 * transition system dies. `travel()` takes the picture before the swap and
 * compares the world after it (`design/src/frame/travel.ts`); a screen that
 * calls `history.pushState` itself, or sets its own state and re-renders, gets
 * there without any of that — and what somebody SEES is one screen that changes
 * instantly while every other one slides. Nothing fails, no test goes red, and
 * the inconsistency reads as jank rather than as a missing call.
 *
 * ⚠️ AND THE FOUR ANIMATIONS ARE CHECKED AGAINST THE FOUR STATES THE ROUTER CAN
 * PRODUCE. Direction × world is two questions with two answers each, and a
 * combination with no rule is not an error — it is the browser's own default
 * cross-fade, which looks deliberate and is the one outcome nobody would report.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(ENGINE.length + 1);
const read = (p) => readFileSync(join(ENGINE, p), "utf8");

/* ⚠️ Every browser half, derived — a second SPA is asked the same question the
   day it is added rather than the day somebody remembers this file. */
const spas = () => readdirSync(ENGINE, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(ENGINE, e.name, "src", "main.tsx")))
  .map((e) => e.name);

const filesIn = (dir, match) => {
  const at = join(ENGINE, dir);
  if (!existsSync(at)) return [];
  const out = [];
  const walk = (path) => {
    for (const e of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== "dist") walk(full); }
      else if (match.test(e.name)) out.push(full);
    }
  };
  walk(at);
  return out;
};

/* ------------------------------------------------------- one way to travel --- */

/**
 * ⚠️ THE ROUTER IS THE ONE PLACE THAT MAY WRITE HISTORY, AND IT IS NAMED. A
 * screen that pushes its own entry is a screen whose address changes without a
 * transition and — worse — without the step number the back gesture is read
 * from, so the NEXT `popstate` cannot tell forward from back either. One bad
 * call corrupts every direction after it.
 */
{
  const routers = [];
  const strays = [];
  for (const app of spas()) {
    for (const file of filesIn(join(app, "src"), /\.tsx?$/)) {
      const src = readFileSync(file, "utf8");
      if (!/history\.(pushState|replaceState)/.test(src)) continue;
      if (/\btravel\s*\(/.test(src)) routers.push(file);
      else strays.push(file);
    }
  }
  for (const file of strays) {
    fail(`${rel(file)}: writes history without going through \`travel()\`.\n`
      + `       An address that changes outside the router changes with no transition and\n`
      + `       with no step number, so the next back gesture cannot tell which way it is\n`
      + `       going either. Route through the app's own \`useTravel\`.`);
  }
  if (!routers.length) {
    fail(`no browser half writes history through \`travel()\` — the transition system is\n`
      + `       mounted nowhere, which is the shape it has to be in to be useless.`);
  } else if (!strays.length) {
    ok(`travelling: ${routers.length} router(s) write history, and nothing else does`);
  }
}

/* ------------------------------------------------------ and it is complete --- */

/**
 * ⚠️ FOUR STATES, FOUR ANIMATIONS. `data-travel` is `forward` or `back` and
 * `data-world` is `same` or `new`, and the pair is what the two mechanisms
 * produce between them: the route decides the direction, the ambience family
 * decides whether it is a slide or an opening. A combination with no rule falls
 * back to the browser's own cross-fade — which is not visibly broken, so it
 * would ship.
 */
{
  const src = read("design/src/frame/travel.ts");
  const need = [
    ["forward", `[data-travel]::view-transition-old(root)`],
    ["forward", `[data-travel]::view-transition-new(root)`],
    ["back", `[data-travel="back"]::view-transition-old(root)`],
    ["back", `[data-travel="back"]::view-transition-new(root)`],
    ["a new world", `[data-world="new"]::view-transition-old(root)`],
    ["a new world", `[data-world="new"]::view-transition-new(root)`],
  ];
  const missing = need.filter(([, sel]) => !src.includes(sel));
  for (const [what, sel] of missing) {
    fail(`design/src/frame/travel.ts: nothing draws ${what} — \`${sel}\` has no rule.\n`
      + `       An unanswered combination is the browser's default cross-fade, which reads\n`
      + `       as a decision rather than as an omission.`);
  }

  /* ⚠️ BOTH OPT-OUTS BEFORE THE TRANSITION STARTS, not only in the stylesheet.
     A view transition that is skipped costs nothing; one that is started and
     then has its animations removed still freezes the page for its duration. */
  if (!/prefers-reduced-motion/.test(src) || !/data-reduce-motion/.test(src)) {
    fail(`design/src/frame/travel.ts: does not read both reduced-motion signals.\n`
      + `       Starting a transition and then switching its animations off in CSS still\n`
      + `       holds the page still for the length of it.`);
  } else if (!missing.length) {
    ok(`ways: both directions and both worlds are drawn, and neither runs when asked not to`);
  }
}

/* -------------------------------------------------- the world is not a prop --- */

/**
 * ⚠️ WHETHER THE NEXT SCREEN IS THE SAME WORLD IS READ OFF THE DOM. It could be
 * a parameter, and then every router in every product would have to know the
 * ambience families and keep that knowledge in step with them — which is the
 * shape that leaves a new family with no transition and nothing failing.
 * `useScenery` stamps the family it actually mounted; `travel()` reads it.
 */
{
  const page = read("design/src/frame/page.tsx");
  const travel = read("design/src/frame/travel.ts");
  if (!/"data-sky":\s*scene\.family/.test(page)) {
    fail(`design/src/frame/page.tsx: the mounted family is not stamped on \`data-sky\`.\n`
      + `       \`travel()\` reads it to decide between a slide and an opening; a constant\n`
      + `       there makes every journey the same one.`);
  } else if (!/getAttribute\("data-sky"\)/.test(travel)) {
    fail(`design/src/frame/travel.ts: no longer reads the mounted family.\n`
      + `       Passing it in means every router has to know every family — and a family\n`
      + `       nobody added to that list transitions wrongly, silently.`);
  } else {
    ok(`world: the family is read from what was mounted, not declared by a router`);
  }
}

console.log(bad
  ? `\ntravel: ${bad} finding(s) — a page that moves outside the one mechanism.`
  : `\ntravel: the route decides the direction, the world decides the gesture.`);
process.exit(bad ? 1 : 0);
