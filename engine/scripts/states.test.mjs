/**
 * EVERY SURFACE HAS FOUR OUTCOMES, AND MOST PRODUCTS SHIP TWO (D7).
 *
 * ⚠️ WAITING, NOTHING, TROUBLE AND THE CONTENT. The two that get skipped are
 * always the same two, and the reason is that nobody sees them: in development
 * the request is instant and it succeeds. What ships is a screen that renders
 * its EMPTY state during the round trip and its EMPTY state again when the
 * request fails — so "you have no clients" is what somebody is told when their
 * network dropped, which is a wrong answer wearing a loading state's excuse.
 *
 * ⚠️ SO THE SHAPE IS BANNED RATHER THAN THE OUTCOME CHECKED. "Does this screen
 * handle failure" is not a question a script can ask. "Does this screen keep a
 * `loading` boolean beside an `error` beside a `data`" is the same question with
 * an answer, because that triple IS the hand-rolled four-way — and it is wrong
 * in the same place every time somebody writes it.
 *
 * ⚠️ AND A COLLECTION SEEDED WITH `[]` IS THE SHARPEST CASE. `useState([])` has
 * no way to say "not yet", so the first paint is a confident, wrong fact:
 * a badge reading 0, "you're all caught up" over an inbox still loading, a
 * `catch(() => setItems([]))` that turns a FAILED load into "no media yet". All
 * three shipped in a previous product, all three are the same bug, and
 * `Loaded<T>` makes every one of them unrepresentable.
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

const filesIn = (dir, re = /\.tsx?$/) => {
  const at = join(ENGINE, dir);
  if (!existsSync(at)) return [];
  const out = [];
  const walk = (path) => {
    for (const e of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, e.name);
      if (e.isDirectory()) walk(full);
      else if (re.test(e.name)) out.push(full);
    }
  };
  walk(at);
  return out;
};

/** ⚠️ Comments name the shapes they ban, and would each be one breach. */
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const FILES = [
  ...filesIn("design/src"),
  ...filesIn("one-space/src"),
];

/**
 * ⚠️ `state.tsx` IS THE FILE THAT PROVIDES THE ANSWER, so it is the one place
 * the words appear legitimately. The list can only shrink.
 */
const DEFINES = new Set(["design/src/parts/state.tsx"]);

/* ------------------------------------------------------- the hand-rolled --- */

/**
 * ⚠️ THE VARIABLE NAME IS THE TELL, and it is a fair one: nobody calls a piece
 * of state `loading` for any reason other than to branch a render on it.
 */
const ROLLED = /\b(?:const|let)\s*\[\s*(loading|isLoading|pending|isPending|error|err|failed)\b/g;

let rolled = 0;
for (const file of FILES) {
  const name = rel(file);
  if (DEFINES.has(name)) continue;
  const src = strip(readFileSync(file, "utf8"));
  for (const [, which] of src.matchAll(ROLLED)) {
    rolled++;
    fail(`${name}: keeps its own \`${which}\` state (D7).\n` +
         `       That is three of the four outcomes, hand-rolled, and the fourth is the\n` +
         `       one it will get wrong. Use \`Loaded<T>\` and \`Await\`, which decide once.`);
  }
}
if (!rolled) ok(`outcomes: ${FILES.length} file(s), none hand-rolls the four-way`);

/* ------------------------------------------------------- the empty array --- */

/**
 * ⚠️ AN EMPTY COLLECTION IS A FACT, AND A FETCH HAS NOT PRODUCED ONE YET. This
 * matches the initialiser rather than the render, because by the time it is
 * rendered the mistake is already made and looks completely reasonable.
 */
const SEEDED = /useState\s*(?:<[^>]*>)?\s*\(\s*\[\s*\]\s*\)/g;

let seeded = 0;
for (const file of FILES) {
  const name = rel(file);
  if (DEFINES.has(name)) continue;
  const src = strip(readFileSync(file, "utf8"));
  for (const m of src.matchAll(SEEDED)) {
    seeded++;
    fail(`${name}: seeds a collection with \`[]\` — ${m[0].trim()} (D7).\n` +
         `       \`[]\` cannot say "not yet", so the first paint is a confident wrong fact.\n` +
         `       \`Loaded<T>\` has no value to seed it with, which is the point.`);
  }
}
if (!seeded) ok(`seeds: no collection starts as a fact it has not learned`);

/* --------------------------------------------------- the skeleton's shape --- */

/**
 * ⚠️ A SKELETON IS THE GEOMETRY OF WHAT IS COMING, AND A GENERIC ONE IS WORSE
 * THAN A BLANK. Its whole value is that nothing moves when the content lands;
 * get the box wrong and you have added a jump that would not have happened. So
 * each placeholder is built from the SAME metric as the component it stands in
 * for, and this asserts the pairing — a row skeleton that stops naming `ROW.tap`
 * is a list that resizes, silently, on every load.
 */
const STATE = readFileSync(join(ENGINE, "design/src/parts/state.tsx"), "utf8");
const SHAPED = [
  ["RowsWaiting", /ROW\.tap/, "the row height rows actually are"],
  ["ChartWaiting", /aspect-\[320\/120\]/, "the chart frame's own aspect"],
  ["TilesWaiting", /h-28/, "the tile height `TileGrid` draws"],
  ["TextWaiting", /w-\[55%\]/, "a short last line, which is what makes prose read as prose"],
];
/*
  ⚠️ SPLIT ON THE DECLARATIONS, NOT A LAZY MATCH TO THE FIRST `\n}`. Every
  component here destructures a multi-line inline type whose `}) {` sits at
  column zero, so the naive block stops at the PARAMETER LIST and reports every
  one of them as missing its own metric. This guard failed that way on its first
  run, which is the third time a block-matching regex in this directory has.
*/
const blockOf = (name) =>
  STATE.split(/\nexport /).find((b) => b.startsWith(`function ${name}(`)) ?? "";

let shapeless = 0;
for (const [name, needs, what] of SHAPED) {
  const block = blockOf(name);
  if (!block) {
    shapeless++;
    fail(`state.tsx: no \`${name}\` to check — if a shape is gone, drop its row here on purpose.`);
  } else if (!needs.test(block)) {
    shapeless++;
    fail(`state.tsx: \`${name}\` no longer uses ${what}.\n` +
         `       A placeholder at a different size than its content is a layout that jumps\n` +
         `       when the data lands, which is worse than one that was briefly blank.`);
  }
}
if (!shapeless) ok(`shaped: ${SHAPED.length} skeleton(s), each the geometry of its content`);

/* ------------------------------------------------------------ the arrival --- */

/**
 * ⚠️ THREE KINDS OF MOTION, AND A PRODUCT WITH A FOURTH HAS NONE. Arriving is
 * HeroUI's `enter` keyframe, changing is a transition on a `MOTION` token,
 * waiting is the library's own `Skeleton`/`Spinner`. Everything else is a jungle
 * — and the jungle is not built deliberately, it accretes one defensible
 * `animation:` at a time.
 */
const MOTION_DEFINES = new Set([
  "design/src/tokens/motion.ts", "design/src/tokens/ambience.ts", "design/src/chart/charts.tsx",
]);
let loose = 0;
for (const file of FILES) {
  const name = rel(file);
  if (MOTION_DEFINES.has(name)) continue;
  const src = strip(readFileSync(file, "utf8"));
  for (const [whole] of src.matchAll(/\banimation(?:Name)?\s*:\s*["'`][^"'`]+["'`]/g)) {
    loose++;
    fail(`${name}: animates by hand — \`${whole.trim()}\` (D7).\n` +
         `       A thing that ARRIVES takes \`ARRIVE\`; one that CHANGES takes a transition\n` +
         `       on a \`MOTION\` token; one that WAITS takes the library's own Skeleton.`);
  }
}
if (!loose) ok(`kinds: nothing animates outside the three named ways`);

/* --------------------------------------------------------- and it is MOUNTED --- */

/**
 * ⚠️ A STYLESHEET THE SHARED LAYER EXPORTS AND NOBODY INJECTS IS A FEATURE THAT
 * DOES NOT EXIST, AND NOTHING SAYS SO. `CHART_MOTION` was imported by the Hub's
 * entry point and left out of the join — so the chart reveal never ran once, in
 * any build, with every test green. A missing stylesheet does not throw; it
 * simply does not animate, which is indistinguishable from a design decision.
 *
 * ⚠️ AND THE IMPORT BEING PRESENT IS WHAT MADE IT INVISIBLE. It read as wired at
 * a glance, in the one file anybody would check.
 */
const WEB_INDEX = readFileSync(join(ENGINE, "design/src/index.ts"), "utf8");
const exported = new Set();
for (const file of filesIn("design/src", /\.tsx?$/)) {
  for (const [, id] of readFileSync(file, "utf8").matchAll(/^export const (\w*(?:_MOTION|_CSS))\b/gm)) {
    exported.add(id);
  }
}

let unmounted = 0;
for (const entry of filesIn("one-space/src", /^main\.tsx$/)) {
  const src = readFileSync(entry, "utf8");
  /* ⚠️ In the JOIN, not in the import — the import is what looked right. */
  const join_ = /\.join\(["'`]\\n["'`]\)/.test(src)
    ? /=\s*\[([\s\S]*?)\]\.join/.exec(src)?.[1] ?? ""
    : "";
  for (const id of exported) {
    if (!WEB_INDEX.includes("export * from")) continue;
    if (!join_.includes(id)) {
      unmounted++;
      fail(`${rel(entry)}: \`${id}\` is exported by @engine/design and never injected.\n` +
           `       A stylesheet that is not in the join does not throw — it simply does not\n` +
           `       apply, which looks exactly like a decision nobody made.`);
    }
  }
}
if (!unmounted) ok(`mounted: all ${exported.size} shared stylesheet(s) reach the document`);

/* ------------------------------------------------------------- the frames --- */

/**
 * ⚠️ A CONTAINER THAT PICKS ITS OWN GAP IS A LAYOUT NOBODY DESIGNED. `flex
 * flex-col gap-3` is a `Stack`; `flex flex-wrap gap-2` is a `Cluster`. Written
 * out by hand they are indistinguishable from the named ones on any single
 * screen — and across twenty screens they are `gap-2`, `gap-3`, `gap-4` and
 * `gap-10`, each defensible, with nobody able to point at which is wrong. The
 * Hub had twenty-three of them.
 *
 * ⚠️ THE CHECK IS THE PAIRING, NOT THE UTILITY. `flex items-center` with no gap
 * is aligning two things, which is not a frame and is fine; a gap is what makes
 * it a group with a rhythm, and a rhythm belongs to the scale. Naming the pair
 * is what keeps this from being a ban on `flex`.
 */
const FRAME = /className="[^"]*\b(?:flex|grid)\b[^"]*\bgap(?:-[xy])?-(?:\d+|\[[^\]]*\])/g;
const FRAME_DEFINES = new Set(["design/src/parts/arrange.tsx", "design/src/tokens/metrics.ts"]);

let framed = 0;
for (const file of FILES) {
  const name = rel(file);
  if (FRAME_DEFINES.has(name)) continue;
  const src = strip(readFileSync(file, "utf8"));
  for (const [whole] of src.matchAll(FRAME)) {
    framed++;
    fail(`${name}: a frame with its own gap — ${whole.slice(11, 60)}… (D7).\n` +
         `       A column of things at a chosen gap is \`Stack\`; a wrapping row is\n` +
         `       \`Cluster\`; a split is \`Columns\`. Where the element must stay what it is,\n` +
         `       the gap still comes from \`SPACE\`.`);
  }
}
if (!framed) ok(`frames: no container picks its own rhythm`);

console.log(bad
  ? `\nstates: ${bad} finding(s) — surfaces that answer three questions with one sentence.`
  : `\nstates: four outcomes, shaped placeholders, three kinds of motion, one rhythm.`);
process.exit(bad ? 1 : 0);
