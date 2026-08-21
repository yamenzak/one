/**
 * EVERY SURFACE HAS FOUR OUTCOMES, AND MOST PRODUCTS SHIP TWO (D7).
 *
 * @design four outcomes, a placeholder the component draws itself, three kinds of motion, one rhythm.
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

/* --------------------------------------------------- the four-way as props --- */

/**
 * ⚠️ THE SAME FAILURE ARRIVES THROUGH THE PROP LIST, AND THE CHECK ABOVE CANNOT
 * SEE IT. `Inbox` took `notes: Note[] | null` plus `failed: boolean` and branched
 * on them in that order — which is `Await` rewritten by hand, with the null
 * branch first, so a REFUSED inbox rendered "Loading…" indefinitely and the
 * "could not load" branch beneath it was unreachable code. Nothing declared a
 * `loading` variable, so nothing fired.
 *
 * ⚠️ AND `failed: boolean` IS THE PART WORTH BANNING BY ITSELF. A `Problem`
 * carries the sentence, the tone and whether trying again could work; a boolean
 * throws all three away and leaves the receiving component to invent copy the
 * platform already wrote (`Trouble` — "there is no `message` prop and there must
 * not be one"). A component that can be told a request failed must be told WHAT
 * failed.
 */
const AS_PROP = /readonly\s+(failed|errored|isError|hasError)\s*\??\s*:\s*boolean/g;

/** ⚠️ The visible symptom, banned on its own — a skeleton is what waiting looks like. */
const SAYS_LOADING = /["'>]\s*Loading[….]/g;

let handed = 0;
for (const file of [...FILES, ...filesIn("apps")].filter((f) => !/\.test\.tsx?$/.test(f))) {
  const name = rel(file);
  if (DEFINES.has(name)) continue;
  const src = strip(readFileSync(file, "utf8"));
  for (const [, which] of src.matchAll(AS_PROP)) {
    handed++;
    fail(`${name}: takes \`${which}: boolean\` (D7).\n` +
         `       A failure is a \`Problem\`, and a boolean has thrown away the sentence,\n` +
         `       the tone and whether a retry could work. Take \`Loaded<T>\` and let\n` +
         `       \`Await\` decide, or take the \`Problem\` itself.`);
  }
  for (const [] of src.matchAll(SAYS_LOADING)) {
    handed++;
    fail(`${name}: writes its own "Loading…" (D7).\n` +
         `       Waiting is a SKELETON shaped like what is coming — \`RowsWaiting\`,\n` +
         `       \`TableWaiting\`, \`FormWaiting\`. A word where the content goes is a\n` +
         `       layout that jumps, and it is what a refusal looked like here.`);
  }
}
if (!handed) ok(`handed: no surface is told "it failed" without being told what`);

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
 * get the box wrong and you have added a jump that would not have happened.
 *
 * ⚠️ THERE ARE TWO WAYS TO BE RIGHT ABOUT THAT AND ONLY ONE OF THEM HOLDS. A
 * placeholder can NAME the same metric as the component it stands in for, which
 * is a copy that agrees today; or it can BE that component in bones mode, which
 * cannot disagree. `TilesWaiting` was the first kind and had already drifted —
 * `minmax(min(8rem, 100%), 1fr)` against `TileGrid`'s `min(6rem, 45%)`, so six
 * tiles measured 236px in three columns and waited behind 360px in two. The
 * metric it named was still correct; the geometry around it was not, which is
 * the whole reason a matched string is a weak proxy.
 */
const STATE = readFileSync(join(ENGINE, "design/src/parts/state.tsx"), "utf8");

/**
 * ⚠️ COMPOSED: the placeholder renders the real component under `Waiting`, so
 * there is no second geometry to keep in step. What this asserts is only that it
 * still does — a rewrite back to hand-drawn bars would pass every other check
 * here and reintroduce exactly the drift above. The SIZES are asserted by
 * `design/test/bones.test.tsx`, which measures both in a browser at two widths;
 * a string cannot do that and should not pretend to.
 */
const COMPOSED = [
  ["RowsWaiting", /<(Group|NavRow)\b/, "`Group`/`NavRow`"],
  ["TilesWaiting", /<TileGrid\b/, "`TileGrid`"],
];

/** ⚠️ DRAWN: no component owns these shapes yet, so the named metric is all there is. */
const SHAPED = [
  ["ChartWaiting", /aspect-\[320\/120\]/, "the chart frame's own aspect"],
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
const missing = (name) => {
  shapeless++;
  fail(`state.tsx: no \`${name}\` to check — if a shape is gone, drop its row here on purpose.`);
};

for (const [name, draws, what] of COMPOSED) {
  const block = blockOf(name);
  if (!block) missing(name);
  else if (!draws.test(block)) {
    shapeless++;
    fail(`state.tsx: \`${name}\` no longer draws ${what} (D7).\n` +
         `       It has gone back to drawing its own bars, which is a second copy of a\n` +
         `       geometry that already drifted once. Render the component under \`Waiting\`\n` +
         `       and let it draw its own bones.`);
  }
}

for (const [name, needs, what] of SHAPED) {
  const block = blockOf(name);
  if (!block) missing(name);
  else if (!needs.test(block)) {
    shapeless++;
    fail(`state.tsx: \`${name}\` no longer uses ${what}.\n` +
         `       A placeholder at a different size than its content is a layout that jumps\n` +
         `       when the data lands, which is worse than one that was briefly blank.`);
  }
}
if (!shapeless) {
  ok(`shaped: ${COMPOSED.length} skeleton(s) drawn by the component itself, ` +
     `${SHAPED.length} by their own metric`);
}

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
 * DOES NOT EXIST, AND NOTHING SAYS SO. `CHART_MOTION` was imported by the OneSpace's
 * entry point and left out of the join — so the chart reveal never ran once, in
 * any build, with every test green. A missing stylesheet does not throw; it
 * simply does not animate, which is indistinguishable from a design decision.
 *
 * ⚠️ AND THE IMPORT BEING PRESENT IS WHAT MADE IT INVISIBLE. It read as wired at
 * a glance, in the one file anybody would check.
 *
 * ⚠️ THE JOIN IS `runtimeCss`, AND THE DEPLOYMENT MOUNTING IT IS THE OTHER HALF.
 * A complete join nobody calls fails in precisely the way this guard exists to
 * catch, so both are asserted: every exported stylesheet is in the list, and the
 * entry point puts the list in the document.
 */
const WEB_INDEX = readFileSync(join(ENGINE, "design/src/index.ts"), "utf8");
const exported = new Set();
for (const file of filesIn("design/src", /\.tsx?$/)) {
  for (const [, id] of readFileSync(file, "utf8").matchAll(/^export const (\w*(?:_MOTION|_CSS))\b/gm)) {
    exported.add(id);
  }
}

const RUNTIME = join(ENGINE, "design/src/frame/runtime.ts");
const runtimeSrc = readFileSync(RUNTIME, "utf8");
/* ⚠️ In the JOIN, not in the import — the import is what looked right. */
const runtimeJoin = /\[([\s\S]*?)\]\s*\.join\(/.exec(runtimeSrc)?.[1] ?? "";

let unmounted = 0;
for (const id of exported) {
  if (!WEB_INDEX.includes("export * from")) continue;
  if (!runtimeJoin.includes(id)) {
    unmounted++;
    fail(`design/src/frame/runtime.ts: \`${id}\` is exported by @engine/design and never injected.\n` +
         `       A stylesheet that is not in the join does not throw — it simply does not\n` +
         `       apply, which looks exactly like a decision nobody made.`);
  }
}

/* ⚠️ AND SOMEBODY HAS TO MOUNT IT. A complete list nothing calls is the same
   silence with a tidier file. */
for (const entry of filesIn("one-space/src", /^main\.tsx$/)) {
  if (readFileSync(entry, "utf8").includes("runtimeCss()")) continue;
  unmounted++;
  fail(`${rel(entry)}: the entry point never calls \`runtimeCss()\`, so none of the\n` +
       `       ${exported.size} shared stylesheet(s) reach the document.`);
}
if (!unmounted) ok(`mounted: all ${exported.size} shared stylesheet(s) reach the document`);

/* -------------------------------------------------------------- the seed --- */

/**
 * ⚠️ A GENERATED FILE NOBODY READS IS THE SHAPE THIS REPOSITORY KEEPS SHIPPING.
 * `shapes.ts` is written by the harness that photographs the product — every
 * number in it measured off a real screen — and it does nothing at all unless
 * the app hands it to `seedShapes` at boot. Nothing fails if it does not: every
 * screen falls back to its preset, which is what happened before the file
 * existed, so the only symptom is a first visit that is worse than it looks in
 * the diff.
 *
 * ⚠️ AND THE KEYS ARE CHECKED FOR A NAME THAT LEAKED. The harness makes a
 * workspace called for the clock and stars that segment out; if it ever stops,
 * the seed is full of addresses nobody will have — coverage on paper and a miss
 * on every lookup. A digit-tailed segment is what that looks like.
 */
{
  const seeds = filesIn("one-space/src").concat(filesIn("apps"))
    .filter((f) => /export const SHAPES\b/.test(readFileSync(f, "utf8")));
  for (const file of seeds) {
    const name = rel(file);
    /* ⚠️ THE APPS ONLY, AND THE FIRST VERSION OF THIS CHECKED THE WHOLE TREE —
       which the DEFINITION of `seedShapes` satisfies, so the guard passed while
       nothing called it. A check a definition can answer is a check about
       spelling. */
    const reached = filesIn("one-space/src").concat(filesIn("apps"))
      .some((f) => /(?<!export function )\bseedShapes\s*\(/.test(readFileSync(f, "utf8")));
    if (!reached) {
      fail(`${name}: measured, generated, and handed to nobody.\n`
        + `       Nothing calls \`seedShapes\`, so every screen still waits behind its\n`
        + `       shape's preset and the file is a diff that changed no pixels.`);
    }
    for (const [, key] of readFileSync(file, "utf8").matchAll(/^\s+"([^"]+)":/gm)) {
      if (/\/[a-z-]*\d{3,}(?:\/|$)/.test(key)) {
        fail(`${name}: "${key}" carries a name from the run that generated it.\n`
          + `       No person will ever have that address, so the entry is a lookup that\n`
          + `       always misses. The varying segment is starred — see \`varying\`.`);
      }
    }
  }
  if (seeds.length) ok(`seed: ${seeds.length} generated shape map(s), reached and addressable`);
}

/* ------------------------------------------------------------- the frames --- */

/**
 * ⚠️ A CONTAINER THAT PICKS ITS OWN GAP IS A LAYOUT NOBODY DESIGNED. `flex
 * flex-col gap-3` is a `Stack`; `flex flex-wrap gap-2` is a `Cluster`. Written
 * out by hand they are indistinguishable from the named ones on any single
 * screen — and across twenty screens they are `gap-2`, `gap-3`, `gap-4` and
 * `gap-10`, each defensible, with nobody able to point at which is wrong. The
 * OneSpace had twenty-three of them.
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

/* -------------------------------------------------------------- the mark --- */

/**
 * ⚠️ AN EMPTY STATE WEARS THE SCREEN'S OWN NOUN, AND WITHOUT ONE IT WEARS THE
 * NEUTRAL CIRCLE — the same anonymous drawing on every surface in the product,
 * shown at the one moment a screen has nothing else to identify itself with.
 * `Nothing` cannot pick the mark for the caller: only the caller knows whether
 * the emptiness is about people, packages or a search that found nothing.
 *
 * ⚠️ SO IT IS CHECKED RATHER THAN TYPED. Making `icon` required would be the
 * compiler's job and it is nearly right — but the two threading wrappers
 * (`Screen`'s `nothing`/`refused` and `Listing`'s `says`) pass it on, and a
 * required prop on those would force the same value through a third hop with
 * nothing gained. This asks the one question the type cannot: does the place
 * that KNOWS the noun say it.
 *
 * ⚠️ AND IT SWEEPS THE APPS TOO. Every empty state a person actually meets is in
 * a product's own screens, so a check that stopped at the design system and
 * OneSpace would pass while the surfaces it exists for drew circles.
 */
const MARK_FILES = [...FILES, ...filesIn("apps")].filter((f) => !/\.test\.tsx?$/.test(f));

/** ⚠️ The definition and the two that forward it. The list can only shrink. */
const MARK_DEFINES = new Set([
  "design/src/parts/state.tsx",
  "design/src/frame/screen.tsx",
  "design/src/parts/listing.tsx",
]);

/* `<Nothing …>` up to the closing angle, and the object forms that reach it. */
const DRAWN = /<Nothing\b[^>]*>/g;
const DECLARED = /\b(?:nothing|refused|says)=\{\{[\s\S]*?\}\}/g;

let unmarked = 0;
for (const file of MARK_FILES) {
  const name = rel(file);
  if (MARK_DEFINES.has(name)) continue;
  const src = strip(readFileSync(file, "utf8"));

  for (const [whole] of src.matchAll(DRAWN)) {
    if (/\bicon=/.test(whole)) continue;
    unmarked++;
    fail(`${name}: an empty state with no mark — ${whole.slice(0, 48)}… (D7).\n` +
         `       Name the screen's own noun: \`icon={glyphOf("people")}\`. Without one\n` +
         `       it draws the neutral circle, which is the same picture everywhere.`);
  }

  /* ⚠️ `says={{…}}` IS ONLY A `Listing`'S when it carries `nothing:` — a
     `says` prop elsewhere is an ordinary sentence, and matching it would be
     the guard inventing a rule for a component that has no empty state. */
  for (const [whole] of src.matchAll(DECLARED)) {
    if (/^says=/.test(whole) && !/\bnothing:/.test(whole)) continue;
    if (/\bicon:/.test(whole)) continue;
    unmarked++;
    fail(`${name}: an empty state with no mark — ${whole.slice(0, 48)}… (D7).\n` +
         `       Add \`icon: glyphOf("…")\` beside \`says\`. See \`Nothing\`.`);
  }
}
if (!unmarked) ok(`marks: every empty state wears its own noun, not the neutral circle`);

/* ------------------------------------------------------------ the fifth --- */

/**
 * ⚠️ THE ANSWER ARRIVED AND THE PAGE COULD NOT DRAW IT, which is the outcome
 * this file's own header does not list — and it is the one with no symptom. A
 * screen reads `useLoad<Answer>` and that is a type ARGUMENT, not a check: the
 * compiler believes the declaration and the server never sent it. `then` throws
 * on the first field, React unmounts the whole tree, and the page is BLACK. No
 * message, no retry, nothing in a log anybody on a phone can reach.
 *
 * ⚠️ AND THE SCREENS IT REACHES FIRST ARE THE ONES ABOUT AN EMPTY DEPLOYMENT.
 * Those branches are the ones nobody has data for while building, so the pages
 * that explain an unconfigured product are exactly the pages that go dark on an
 * unconfigured product. The console's Gateway screen — whose whole text is "no
 * gateway is configured, set it under Keys" — shipped as a black rectangle for
 * precisely that reason.
 *
 * ⚠️ SO THE BOUNDARY IS CHECKED HERE, because deleting it restores the black
 * screen and nothing else notices: every suite renders the shapes it declared.
 */
{
  const src = STATE;
  const fn = /export function Await<T>\([\s\S]*?\n\}/.exec(src)?.[0] ?? "";

  if (!fn) {
    fail("design/src/parts/state.tsx: no `Await` — the four-way decision has no home.");
  } else if (!/<Drew\b/.test(fn)) {
    fail("design/src/parts/state.tsx: `Await` renders `then` outside a boundary.\n"
      + "       A screen handed a shape it did not expect throws in render, React unmounts\n"
      + "       the tree, and the page goes black — no message, no retry, and nothing in a\n"
      + "       log a person can reach.");
  } else if (!/getDerivedStateFromError/.test(src)) {
    fail("design/src/parts/state.tsx: the boundary catches nothing.\n"
      + "       `getDerivedStateFromError` is what keeps a render fault inside its own page.");
  } else {
    ok("drew: an answer the page cannot draw is a refusal, not a black screen");
  }
}

/* ---------------------------------------------------------------- re-read --- */

/**
 * ⚠️ A RE-READ MUST NOT BLANK A SCREEN THAT ALREADY HAS DATA. `again` is what a
 * save calls, and resetting to `waiting` replaced the list under the control
 * somebody had just used with a skeleton — for a round trip, from the top of a
 * list they had scrolled. That is what "updating a field reloads the entire
 * page" was, and it is invisible in every test that renders a screen once.
 *
 * ⚠️ AND THE CACHE IS THE OTHER HALF. Without one, every navigation — going BACK
 * included — draws the skeleton and waits, so the product feels slow even where
 * the request is fast.
 */
{
  const data = readFileSync(join(ENGINE, "one-space/src/centre/data.tsx"), "utf8");
  /* ⚠️ TO THE NEXT TOP-LEVEL DECLARATION, because the signature's own return
     TYPE closes with `} {` in the first column — stopping at the first of those
     matched four lines and checked none of the body. */
  const hook = /export function useLoad[\s\S]*?(?=\n\/\*\*|\nexport |$)/.exec(data)?.[0] ?? "";

  if (!hook) {
    fail(`one-space/src/centre/data.tsx: no useLoad to check — every screen's
       loading state comes through it, so a parser that cannot find it is
       checking nothing.`);
  } else if (!/held\.set\(/.test(hook) || !/held\.has\(/.test(hook)) {
    fail(`one-space/src/centre/data.tsx: useLoad keeps no answer, so every
       navigation redraws the skeleton and waits on a round trip to show what
       the browser had just painted.`);
  } else if (/set\(waiting\(\)\)/.test(hook)) {
    fail(`one-space/src/centre/data.tsx: useLoad blanks to \`waiting\` on a
       re-read. A save then replaces the list under the control somebody just
       used with a skeleton, which is what reads as the page reloading.`);
  } else if (!/was\.status === "ready" \? was/.test(hook)) {
    fail(`one-space/src/centre/data.tsx: useLoad no longer holds a ready answer
       across a re-read — see above.`);
  } else {
    ok(`re-read: a screen with data keeps it while the next answer is on its way`);
  }
}

console.log(bad
  ? `\nstates: ${bad} finding(s) — surfaces that answer three questions with one sentence.`
  : `\nstates: four outcomes, shaped placeholders, three kinds of motion, one rhythm.`);
process.exit(bad ? 1 : 0);
