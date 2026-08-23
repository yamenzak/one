/**
 * WHAT A HAND-WRITTEN STYLESHEET MAY DO, AND IT IS LESS THAN CSS ALLOWS.
 *
 * @design hand-written CSS names the properties it animates, gates hover on a pointer that hovers, and takes its curve from the library.
 *
 * ⚠️ ALMOST EVERY RULE IN THIS PRODUCT IS THE LIBRARY'S, WHICH IS WHY THE FEW
 * THAT ARE NOT NEED A GUARD. HeroUI's own sheet already answers all three of
 * these — it names its transition properties, it wraps every hover in
 * `@media (hover: hover)`, and its curves are the six it publishes. The rules
 * this deployment writes by hand are a few dozen strings in `ambience.ts` and
 * `theme.ts`, they ship in every page, and nothing was looking at them.
 *
 * ⚠️ `transition: all` IS THE ONE WORTH THE MOST. It animates whatever happens
 * to change — including background, border and shadow, which are paint rather
 * than composite — and on a pinned element that is a repaint on every frame of
 * a scroll. It has a second cost that is worse: nobody can say what it animates,
 * so it survives the removal of the thing it was written for. This product had
 * exactly that. The bar used to fold its labels away on the way down a page;
 * `The foot is the head, mirrored` removed the folding, and the rule that
 * animated it stayed — along with a doc comment describing a mechanism that no
 * longer existed, at the end of a file, attached to nothing.
 *
 * ⚠️ A HOVER ON A TOUCH SCREEN NEVER ENDS. The browser fires one on tap and the
 * element keeps it until something else is tapped, so a control somebody pressed
 * stays lit for as long as they read the screen — a bar wearing a selection
 * nobody made. `@media (hover: hover) and (pointer: fine)` is the whole fix and
 * it is invisible on every machine a developer owns.
 *
 * ⚠️ AND A KEYWORD EASING IS A CURVE NOBODY CHOSE. `ease`, `ease-in-out` and
 * friends exist because a browser needed a default. `motion.test.mjs` refuses a
 * hand-rolled `cubic-bezier` and a literal duration; this refuses the other
 * direction, which is naming no curve at all and taking whatever the CSS
 * specification's default happens to be.
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

const filesIn = (dir, re) => {
  const at = join(ENGINE, dir);
  if (!existsSync(at)) return [];
  const out = [];
  const walk = (path) => {
    for (const e of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== "dist") walk(full); }
      else if (re.test(e.name)) out.push(full);
    }
  };
  walk(at);
  return out;
};

const SOURCES = [
  ...filesIn("design/src", /\.(tsx?|css)$/),
  ...filesIn("one-space/src", /\.(tsx?|css)$/),
  ...filesIn("ground/src", /\.(tsx?|css)$/),
  ...appDirs().flatMap((d) => filesIn(d, /\.(tsx?|css)$/)),
];

/** ⚠️ A comment describing a rule is not the rule — see `motion.test.mjs`. */
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const read = SOURCES.map((file) => [rel(file), strip(readFileSync(file, "utf8"))]);

/* ------------------------------------------------------- transition: all --- */

let anyAll = 0;
for (const [name, src] of read) {
  for (const [what] of src.matchAll(/transition(?:-property)?\s*:\s*all\b/g)) {
    anyAll++;
    fail(`${name}: \`${what}\` — name the properties.\n` +
      `       \`all\` animates whatever happens to change, paint included, and it\n` +
      `       outlives whatever it was written for because nobody can say what it\n` +
      `       covers. Use \`transition()\` from @engine/design, or list them.`);
  }
}
if (!anyAll) ok(`transition: no \`all\` in ${read.length} source files.`);

/* ------------------------------------------------------------- the hover --- */

/**
 * ⚠️ ONLY WHAT THIS DEPLOYMENT WRITES. A `:hover` inside a CSS string is ours; a
 * `hover:` Tailwind variant is compiled into the query by Tailwind itself, and
 * every hover HeroUI draws is already inside one.
 *
 * ⚠️ AND THE QUERY IS LOOKED FOR IN THE SAME FILE RATHER THAN AROUND THE MATCH,
 * because the rules are emitted as arrays of line strings and there is no block
 * structure to walk. What that cannot catch is a file with one gated hover and
 * one ungated one — which is why the message names the file and asks.
 */
let hovers = 0;
let ungated = 0;
for (const [name, src] of read) {
  const found = [...src.matchAll(/:hover\b/g)];
  if (!found.length) continue;
  hovers += found.length;
  if (/@media\s*\(\s*hover\s*:\s*hover\s*\)/.test(src)) continue;
  ungated++;
  fail(`${name}: writes ${found.length} \`:hover\` rule(s) and no \`@media (hover: hover)\`.\n` +
    `       A touch screen fires hover on tap and never clears it, so the control\n` +
    `       somebody pressed stays lit until they press another one.`);
}
if (!ungated) ok(`hover: ${hovers} hand-written rule(s), every file gating on a pointer that hovers.`);

/* ------------------------------------------------------------ the curves --- */

/**
 * ⚠️ THE KEYWORDS, WHERE THEY ARE A TIMING FUNCTION. `ease-out` also appears in
 * `var(--ease-out-quart)` and in a Tailwind class, so the match is anchored to a
 * transition or animation shorthand — the place a curve is actually chosen.
 */
const KEYWORD = /(?:transition|animation)(?:-timing-function)?\s*:\s*[^;`"']*?(?<![\w-])(ease-in-out|ease-in|ease-out|ease|linear)(?![\w-])/g;
let keywords = 0;
for (const [name, src] of read) {
  for (const [, what] of src.matchAll(KEYWORD)) {
    keywords++;
    fail(`${name}: eases on the keyword \`${what}\`.\n` +
      `       A keyword is the curve nobody chose. Name one from \`EASE\`.`);
  }
}
if (!keywords) ok(`easing: no keyword timing function in ${read.length} source files.`);

process.exit(bad ? 1 : 0);
