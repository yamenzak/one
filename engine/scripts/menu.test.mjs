/**
 * A MENU IS ALL MARKS OR NONE.
 *
 * @design a screen composes the vocabulary; it does not re-derive it.
 *
 * ⚠️ THE HALF-MARKED MENU IS THE ONE FAILURE THIS SHAPE ACTUALLY HAS, and it is
 * invisible in every review because each LINE is correct. `Dropdown.Item` lays
 * its mark, its label and its indicator in a row, so an item with no mark starts
 * where the marked ones' LABELS start — a list with a step in its left edge,
 * where the unmarked rows read as failing to load rather than as being
 * different. Measured on the first menu that got marks: three of five, and the
 * two bare ones looked broken.
 *
 * ⚠️ AND THE RULE IS PER MENU, NOT PER PRODUCT. A menu built by `.map` over data
 * — a list of topics, a list of packages — has no mark for any of its rows and
 * that is right: a topic is a word, not a thing with a shape. What is never
 * right is one literal list disagreeing with itself.
 *
 * ⚠️ THE CHECK IS ON THE LITERAL, WHICH IS WHY IT CAN BE STATIC AT ALL. A menu
 * assembled at runtime out of two arrays is beyond a script and is left alone;
 * every menu in this tree is written out, which is the case worth guarding.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { appDirs } from "./lib/trees.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(ENGINE.length + 1);

const filesIn = (dir) => {
  const at = join(ENGINE, dir);
  if (!existsSync(at)) return [];
  const out = [];
  const walk = (path) => {
    for (const e of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, e.name);
      if (e.isDirectory()) { if (!/node_modules|dist/.test(e.name)) walk(full); }
      else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name)) out.push(full);
    }
  };
  walk(at);
  return out;
};

const strip = (of) => of.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * ⚠️ BALANCED, BECAUSE AN ITEM'S OWN BODY HOLDS BRACKETS. `onDo: () => { … }`
 * and a ternary label both carry braces, so the first `]` is nowhere near the
 * end of the list. Nothing here parses TypeScript — it counts depth and ignores
 * what is inside a string or a template, which is enough for an array literal.
 */
const balanced = (src, from) => {
  let depth = 0;
  let quote = "";
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") { i++; continue; }
      if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "[" || c === "{" || c === "(") depth++;
    else if (c === "]" || c === "}" || c === ")") {
      depth--;
      if (depth === 0) return src.slice(from, i + 1);
    }
  }
  return null;
};

/** ⚠️ The top-level `{ … }` members of an array literal, in source form. */
const membersOf = (list) => {
  const out = [];
  let depth = 0;
  let quote = "";
  let start = -1;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (quote) {
      if (c === "\\") { i++; continue; }
      if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{" || c === "[" || c === "(") {
      if (c === "{" && depth === 1) start = i;
      depth++;
    } else if (c === "}" || c === "]" || c === ")") {
      depth--;
      if (c === "}" && depth === 1 && start >= 0) { out.push(list.slice(start, i + 1)); start = -1; }
    }
  }
  return out;
};

/* ------------------------------------------------------------------ sweep --- */

const FILES = [
  ...filesIn("design/src"),
  ...filesIn("ground/src"),
  ...filesIn("one-space/src"),
  ...filesIn("one/src"),
  ...appDirs().flatMap((d) => filesIn(`${d}/src`)),
];

/**
 * ⚠️ THE TWO PROPS THAT CARRY `MenuItem[]`, AND ONLY THOSE. `items` is `Menu`'s
 * own; `acts` is what `Listing` hands to one per row. Any other array of objects
 * in the tree is somebody else's shape and is none of this guard's business.
 */
const PROPS = /\b(items|acts)=\{/g;

let menus = 0;
for (const file of FILES) {
  const src = strip(readFileSync(file, "utf8"));
  for (const at of src.matchAll(PROPS)) {
    /* ⚠️ Find the array itself: `items={[…]}` opens at the `[`, and
       `acts={(p) => […]}` opens after the arrow. Anything else — a variable, a
       call — is assembled elsewhere and cannot be read from here. */
    const after = at.index + at[0].length;
    /* ⚠️ THE ARRAY HAS TO BE THE FIRST THING, or it is not this literal. Either
       the prop opens straight onto `[`, or onto a one-expression callback that
       returns one — `acts={(row) => [ … ]}`. Anything before the bracket that is
       neither is a variable, a call or a conditional, and what it evaluates to
       is not readable from here. */
    const lead = /^\s*(?:\([^)]*\)\s*=>\s*)?\[/.exec(src.slice(after, after + 200));
    if (!lead) continue;
    const list = balanced(src, after + lead[0].length - 1);
    if (!list) continue;
    /* ⚠️ A LIST THAT IS NOT A LITERAL. `.map(…)` over data is uniform by
       construction — every row of it is built by one expression — so there is
       nothing here for two halves to disagree about. */
    if (/\.map\(/.test(list.slice(0, 4))) continue;
    const items = membersOf(list);
    /* ⚠️ AND IT HAS TO LOOK LIKE MENU ITEMS. `onDo` is what a `MenuItem` has and
       what nothing else in this vocabulary does, so a `Rings` list or a set of
       tabs sharing the prop name is skipped rather than reported. */
    if (items.length < 2 || !items.every((m) => /\bonDo\s*:/.test(m))) continue;
    menus++;
    const marked = items.filter((m) => /\bicon\s*:/.test(m)).length;
    if (marked === 0 || marked === items.length) continue;
    const line = src.slice(0, at.index).split("\n").length;
    fail(`${rel(file)}:${line} — ${marked} of ${items.length} menu items carry a mark.\n`
      + `       An unmarked row starts where the marked ones' LABELS start, so it reads as\n`
      + `       a row that failed to load. Give every item a mark, or none of them one.`);
  }
}

if (!bad) ok(`menus: ${menus} written-out menu(s), each all marks or none`);

console.log(bad
  ? `\nmenu: ${bad} finding(s) — a menu disagrees with itself about marks.`
  : "\nmenu: every written-out menu is all marks or none.");
process.exit(bad ? 1 : 0);
