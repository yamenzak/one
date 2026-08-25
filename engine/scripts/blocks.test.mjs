/**
 * THE LIBRARY ALREADY HAS THIS — a screen rebuilding a block it ships.
 *
 * @design a screen composes the vocabulary; it does not re-derive it.
 *
 * ⚠️ EVERY GUARD BESIDE THIS ONE ASKS WHETHER SOMETHING IS DRAWN CORRECTLY. This
 * one asks whether it should have been drawn at all. The failure it catches is
 * not a wrong colour or a short target — it is a screen quietly growing its own
 * copy of a component, which passes every other check in the tree because the
 * copy is made of the same primitives. Measured across the two apps before this
 * existed: three hand-rolled filter rows at three heights, two byte formatters
 * that both said `0KB` for a small file, and a facepile built out of a negative
 * margin somebody typed.
 *
 * ⚠️ AND IT IS A TABLE OF SHAPES, NOT A LIST OF NAMES. "Do not write a filter
 * row" is advice; `aria-pressed` on a control outside the design package is a
 * string a script can find. Each entry names the shape, the component that
 * already exists, and what goes wrong when the copy ships — because a finding
 * whose fix is not obvious is a finding somebody argues with.
 *
 * ⚠️ THE EXEMPTIONS ARE BY FILE AND BY REASON, and they can only shrink. A
 * pattern-shaped exemption ("tests may", "anything under charts may") is a door
 * the next file walks through without anybody deciding.
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

/**
 * ⚠️ SCREENS, NOT THE PACKAGE. `design/src` is where every one of these shapes
 * is SUPPOSED to appear — it is the implementation — so pointing the check at it
 * would report the vocabulary as its own violation, which is how a guard comes
 * to be waived on its first run.
 */
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

/* ------------------------------------------------------------------ table --- */

const REBUILDS = [
  {
    what: "a filter row",
    use: "Filters",
    /* ⚠️ A TOGGLE IS WHAT `aria-pressed` MEANS, and a row of toggles over a list
       is a filter row whatever it was called. */
    finds: /\baria-pressed\b/,
    costs: "three filter rows at three heights and two gaps, and `All` meaning "
      + "`no filter` on one screen and a real value on the next",
  },
  {
    what: "a facepile",
    use: "Faces",
    /* ⚠️ A NEGATIVE INLINE MARGIN IS OVERLAP, and overlap on avatars is one
       thing. It is a `style` rather than a class because the amount is derived
       from the plate — which is exactly the arithmetic the component owns. */
    finds: /margin(?:Inline)?(?:Start|Left)\s*:\s*[`"']?-/,
    costs: "plates that touch or gap by two pixels the day a face changes size, "
      + "and a pile whose left edge is a third of a plate right of everything above it",
  },
  {
    what: "a size in bytes",
    use: "Size",
    /* ⚠️ THE TWO DIVISORS PEOPLE REACH FOR, and both of them alone. What makes
       this a finding rather than arithmetic is that it is being SHOWN. */
    finds: /\/\s*1024\b|\/\s*1_?000_?000\b/,
    costs: "`0KB` for anything under half a kilobyte and `1536KB` for a megabyte "
      + "and a half, in the reader's units rather than their own",
  },
  {
    what: "a rating",
    use: "Score",
    /* ⚠️ AN ARRAY BUILT FROM A COUNT AND FILLED BY AN INDEX COMPARISON is what
       every hand-drawn rating is, whatever the mark inside it. */
    finds: /Array\.from\(\{\s*length:[^}]*\}\)[\s\S]{0,120}?\bi\s*<\s*\w*(?:filled|score|rating|stars)/i,
    costs: "a rating drawn at a size nothing else on the page uses, in a colour "
      + "the workspace's branding does not reach",
  },
  {
    what: "a before-and-after",
    use: "Compare",
    /* ⚠️ THE ARROW BETWEEN TWO VALUES, in the two ways it gets typed. */
    finds: /\{[^}]{0,60}\}\s*(?:→|&rarr;|-&gt;)\s*\{/,
    costs: "an arrow at whatever baseline the two figures happened to share, "
      + "and a mark a screen reader has no word for",
  },
  {
    what: "a standing message",
    use: "Banner",
    /* ⚠️ A TOAST USED FOR A STATE. `notice` says what JUST happened; a call
       whose text is a condition rather than an event is a banner. The shape that
       gives it away is a `notice` reached from a render rather than a handler,
       which is what an immediately-invoked one in JSX is. */
    finds: /\{\s*notice\(/,
    costs: "a message that leaves after four seconds while the thing it is about "
      + "is still true, and a toast raised again on every re-render",
  },
];

/* ------------------------------------------------------------ exemptions --- */

/**
 * ⚠️ A REASON EACH, AND EVERY ONE OF THEM IS A DIFFERENT KIND OF THING. Two are
 * the vocabulary being composed one layer up; one is arithmetic that is never
 * shown to anybody.
 */
const ALLOWED = new Map([
  /* ⚠️ The proving ground's own filter specimen IS `Filters` — see `Notes`. */
]);

/* ------------------------------------------------------------------ sweep --- */

const FILES = [
  ...filesIn("ground/src"),
  ...filesIn("one-space/src"),
  ...appDirs().flatMap((d) => filesIn(`${d}/src`)),
];

let looked = 0;
let found = 0;
for (const file of FILES) {
  const where = rel(file);
  if (ALLOWED.has(where)) continue;
  looked++;
  const src = strip(readFileSync(file, "utf8"));
  for (const one of REBUILDS) {
    const hit = one.finds.exec(src);
    if (!hit) continue;
    found++;
    const line = src.slice(0, hit.index).split("\n").length;
    fail(`${where}:${line} builds ${one.what} by hand — \`${one.use}\` already ships it.\n`
      + `       What the copy costs: ${one.costs}.`);
  }
}

if (!found) ok(`vocabulary: ${looked} screen(s), none rebuilding a block the library ships`);

/* ⚠️ AND THE TABLE ITSELF HAS TO REACH THE PACKAGE, which is the check that
   stops a renamed component turning a rule into a rule about nothing. Every
   `use` above is an export of `@engine/design` or this guard is asking screens
   to compose something that is not there. */
{
  const index = readFileSync(join(ENGINE, "design/README.md"), "utf8");
  const missing = REBUILDS.filter((one) => !new RegExp(`\`${one.use}\``).test(index));
  if (missing.length) {
    fail(`scripts/blocks.test.mjs names ${missing.length} component(s) the package does not `
      + `export — ${missing.map((m) => m.use).join(", ")}.\n`
      + `       A rule pointing at a component that is not there is a rule nobody can obey.`);
  } else {
    ok(`vocabulary: all ${REBUILDS.length} named component(s) are in the package's index`);
  }
}

console.log(bad
  ? `\nblocks: ${bad} finding(s) — a screen is growing its own copy of the vocabulary.`
  : "\nblocks: the screens compose the vocabulary rather than re-deriving it.");
process.exit(bad ? 1 : 0);
