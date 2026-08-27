/**
 * A FLOW OF SEVERAL SCREENS IS A `Story`, AND IT NARRATES.
 *
 * @design a multi-step flow asks questions and says the answers back.
 *
 * ⚠️ THE COST A WIZARD USUALLY IMPOSES IS TRAINING, AND IT IS INVISIBLE IN A
 * DIFF. Four headings over groups of fields — "What it is", "Counting",
 * "Keeping" — name the areas of the database being written, and each of them
 * needs a person who has been told what the words mean. That person is an
 * induction, a wiki page and somebody in the warehouse who knows; none of them
 * appears in a code review, and all of them are paid for forever.
 *
 * ⚠️ SO THE FIRST TWO RULES BELOW ARE ABOUT WORDS, WHICH IS UNUSUAL FOR A GUARD
 * AND IS THE POINT. A step ASKS rather than heading, and it carries the CLAUSE
 * its answer makes. Either left off renders perfectly and quietly turns the flow
 * back into the form it replaced.
 *
 * ⚠️ AND THEY ARE READ OFF THE MANIFEST NOW, WHICH IS THE WHOLE OF WHAT CHANGED.
 * These rules used to be read off a hand-written screen, because a flow needed
 * one: a React file supplying the controls for each question, and a fourth rule
 * comparing the two halves so they could not drift. `Create` is that file — once,
 * for every flow in every product — so the declaration IS the flow, there is no
 * second half to disagree with it, and a pattern hunting for hand-written steps
 * finds none and passes. **A guard whose premise has been deleted does not fail;
 * it succeeds vacuously**, which is why re-founding one is part of the work that
 * removes its subject rather than a tidy-up afterwards.
 *
 * ⚠️ WHAT REPLACED THAT FOURTH RULE IS THE TWO THINGS COMPOSITION CANNOT SEE.
 * The kernel refuses a step naming an unregistered block — and it draws nothing,
 * so it cannot ask whether the registered one has a COMPONENT; and nothing but a
 * guard can say that the frame has exactly one caller, which is what stops a
 * hand-written wizard growing back beside the declared one.
 *
 * ⚠️ AND THE LAST IS THE ONE THAT PREVENTS A BUG RATHER THAN A REGRESSION.
 * `Story` owns the phone's back gesture: forward pushes an entry, `popstate`
 * steps back, the first step pushes nothing so the Nth Back leaves. Hand-rolled
 * per flow that is four subtle rules and most of them get one wrong — and the
 * failure is somebody on step five making the gesture that means "undo the last
 * thing" and losing five screens of typing.
 *
 * ⚠️ THE EXISTING HISTORY GUARD COULD NOT SEE ANY OF THIS. `travel.test.mjs`
 * derives its file list from `engine/<dir>/src/main.tsx` — the browser halves
 * with a router of their own — and an app under `engine/apps/*` has no `main.tsx`
 * because it is loaded BY one. So every screen in every product was outside it,
 * and `Register.tsx` wrote raw `pushState` calls with the whole gate green.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { appDirs, ENGINE } from "./lib/trees.mjs";

const rel = (p) => p.slice(ENGINE.length + 1);

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/* ⚠️ EVERY TREE THAT DRAWS, derived — a second product is asked these questions
   the day it is registered rather than the day somebody remembers this file. */
const filesIn = (dir, match = /\.tsx?$/) => {
  const at = join(ENGINE, dir);
  if (!existsSync(at)) return [];
  const out = [];
  const walk = (path) => {
    for (const e of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules" && e.name !== "dist") walk(full);
      } else if (match.test(e.name)) out.push(full);
    }
  };
  walk(at);
  return out;
};

const DRAWS = [
  ...filesIn("design/src"),
  ...filesIn("one-space/src"),
  ...filesIn("ground/src"),
  ...appDirs().flatMap((d) => filesIn(d)),
];

/* ⚠️ Comments are prose, and this whole file is about words in code. */
const code = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/^(\s*)\/\/.*$/gm, "$1");

/* ------------------------------------------------------------ historied --- */

/**
 * ⚠️ TWO FILES MAY WRITE HISTORY AND THEY ARE NAMED HERE. The router, because
 * an address is its job; and the flow, because a step is an entry that is NOT an
 * address — the steps are one screen, and a URL per step would make each of them
 * shareable, bookmarkable and reloadable into a form with nothing in it.
 */
const HISTORIANS = new Set([
  "design/src/frame/story.tsx",
  "one-space/src/nav.ts",
]);

{
  const WRITES = /\bhistory\.(pushState|replaceState)\b/;
  let checked = 0;
  const strays = [];
  for (const file of DRAWS) {
    const name = rel(file);
    if (HISTORIANS.has(name)) { checked++; continue; }
    if (WRITES.test(code(readFileSync(file, "utf8")))) strays.push(name);
  }
  for (const name of strays) {
    fail(`${name}: writes history itself.\n`
      + `       An entry pushed outside the router and outside \`Story\` has no step\n`
      + `       number on it, so the next back gesture cannot tell forward from back —\n`
      + `       and one bad call corrupts every direction after it. A flow of several\n`
      + `       screens is a \`Story\`; an address is the router's.`);
  }
  /* ⚠️ AND THE NAMED FILES MUST ACTUALLY DO IT, or the allow-list is two
     exemptions for a mechanism that no longer exists and the rule is unenforced
     in the direction nobody checks. */
  for (const name of HISTORIANS) {
    const at = join(ENGINE, name);
    if (!existsSync(at) || !WRITES.test(code(readFileSync(at, "utf8")))) {
      fail(`${name}: named here as one of the two files that may write history, and\n`
        + `       it does not. Either it moved — in which case this list is now an\n`
        + `       exemption for nothing — or the back gesture is no longer handled.`);
    }
  }
  if (!bad) ok(`historied: only the router and the flow write history — ${DRAWS.length} file(s) read`);
}

/**
 * ⚠️ THE FRAME ITSELF SYNTHESISES ONE STEP AND IT IS EXEMPT, NAMED HERE RATHER
 * THAN BY LUCK. `Story` appends the review — a step with a question and no
 * clause, which is correct: a review has nothing to add to a story because it IS
 * the story.
 */
const FRAME = "design/src/frame/story.tsx";

/* ----------------------------------------------- asked, and it narrates --- */

/**
 * THE STEPS OF EVERY DECLARED FLOW, READ OUT OF THE MANIFESTS.
 *
 * ⚠️ THE MANIFEST IS THE ONLY PLACE A STEP EXISTS NOW, AND THAT IS WHY THESE TWO
 * RULES MOVED. They used to be read off a hand-written screen, because a flow
 * needed one — a React file supplying the controls for each question. `Create`
 * is that file, once, for every flow in every product, so the screens the old
 * pattern searched are gone and searching for them found nothing and passed.
 *
 * ⚠️ SPLIT ON `{ id: "`, WHICH IS SAFE ONLY BECAUSE A STEP NESTS NO IDS. `takes`
 * is names, `says.per` is keyed on the closed set's values, `when` is a field and
 * a literal — none of them is an `id`. The old pattern read the nearest preceding
 * `id:` and a step whose controls declared options reported itself as `loose`;
 * that whole class went with the controls.
 */
const stepsOf = (block) => {
  const at = block.indexOf("asks:");
  if (at < 0) return [];
  return block.slice(at).split(/\{\s*id:\s*"/).slice(1).map((piece) => {
    const id = /^([^"]+)"/.exec(piece)?.[1] ?? "?";
    /* ⚠️ CUT AT THE NEXT STEP'S OWN START, so one step's `says` is never read as
       the previous one's. The split already did it — what is left is this step
       and everything after the last one, which is the closing bracket. */
    return { id, ask: /\bask:\s*"([^"\\]+)"/.exec(piece)?.[1] ?? "", body: piece };
  });
};

const MANIFESTS = appDirs().flatMap((dir) => filesIn(dir, /^index\.tsx?$/));

/**
 * ⚠️ THE END OF A `story:` IS FOUND BY COUNTING BRACES, NOT BY MATCHING AN
 * INDENT. This was `/story:\s*\{([\s\S]*?)\n(\s{4,6})\},/` — a pattern about
 * where somebody put a newline — and a story closing `} },` on one line ran
 * straight past its own end into the NEXT screen, reporting that screen's id as
 * a step with no question. Loud, and only by luck: the same brittleness under a
 * different formatting reads a story SHORT, which drops its last steps and
 * reports the flow as clean.
 *
 * ⚠️ AND STRINGS ARE THE REASON IT IS NOT THREE LINES. A brace inside a quoted
 * sentence — `says: { as: "{unit}" }` is every other step in this repository —
 * closes the block early to a counter that cannot see quotes.
 */
const storyAt = (src, from) => {
  let depth = 0;
  let quote = "";
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return src.slice(from + 1, i);
  }
  return null;
};

const STORIES = MANIFESTS.flatMap((file) => {
  const src = code(readFileSync(file, "utf8"));
  return [...src.matchAll(/\bstory:\s*\{/g)].map((m) => {
    const block = storyAt(src, m.index + m[0].length - 1);
    /* ⚠️ AND A `story:` THIS CANNOT CLOSE IS SAID OUT LOUD RATHER THAN SKIPPED.
       A dropped one is a flow every rule below stops asking about, reported as
       part of a clean sweep — which is the failure the whole extraction was
       just rewritten to end. */
    if (block === null) {
      fail(`${rel(file)}: a \`story:\` that never closes — this check could not read it,\n`
        + "       so every rule below stopped applying to that flow.");
    }
    return { file: rel(file), block: block ?? "" };
  }).filter((one) => one.block);
});

{
  let checked = 0;
  let headings = 0;
  let silent = 0;

  if (!STORIES.length) {
    fail("asked: no declared flow matched at all — every rule below is about the words\n"
      + "       in one, so a pattern that finds none is a set of checks that stopped\n"
      + "       looking rather than a set of rules being kept.");
  }

  for (const { file, block } of STORIES) {
    const steps = stepsOf(block);
    if (!steps.length) {
      fail(`${file}: a declared flow asks nothing.\n`
        + `       The questions are what the docs print and what an agent is told the\n`
        + `       flow will want; an empty list describes a screen nobody can prepare for.`);
      continue;
    }
    for (const step of steps) {
      checked++;
      /*
        ⚠️ A QUESTION, AND THE `?` IS THE CHECK BECAUSE THE QUESTION IS THE
        DESIGN. "Counting" is a heading: it names the area of the record being
        written and leaves somebody to work out what is wanted of them. "What do
        you count it in?" has an answer, and anybody who can answer it needs no
        training to.
      */
      if (!step.ask.trim().endsWith("?")) {
        headings++;
        fail(`${file}: the step \`${step.id}\` is headed "${step.ask.slice(0, 48)}"\n`
          + `       rather than asking anything. A step of a flow asks ONE thing in the\n`
          + `       second person — that is what makes the flow answerable without an\n`
          + `       induction, and a heading is what it replaced.`);
      }
      /*
        ⚠️ A STEP WITH FIELDS AND NO CLAUSE IS A ROW READING "Nothing set", which
        is the sharper form of the rule this replaces. `Create` puts a step into
        the review's paragraph only where it `says` something; everything else is
        a row whose label is its clause, so a step that has one to make and does
        not make it reports an answer somebody gave as an omission — on the one
        screen whose entire job is to show an omission.

        ⚠️ A BLOCK STEP IS EXEMPT AND THE EXEMPTION IS NOT A HOLE. Its clause
        comes from `AskEntry.said`, which is required, so its row counts what it
        holds. A `says` could not cover it anyway: `"{shots}"` prints a data URI,
        because a block's answer is a count rather than a value read back.
      */
      if (/\btakes:\s*\[/.test(step.body) && !/\bsays:/.test(step.body)) {
        silent++;
        fail(`${file}: the step \`${step.id}\` takes fields and carries no \`says\`.\n`
          + `       Its row in the review reads "Nothing set" under the question — so the\n`
          + `       answer somebody gave is reported as an omission, on the screen whose\n`
          + `       whole job is to show one. A step's clause is the product's words for\n`
          + `       what its answer MEANS, which no label can be derived into.`);
      }
    }
  }
  if (checked && !headings) ok(`asked: every declared step asks a question — ${checked} step(s)`);
  if (checked && !silent) ok(`narrates: every step with fields carries its clause — ${checked}`);
}

/* -------------------------------------------------------------- blocked --- */

/**
 * A STEP'S BLOCK IS DECLARED IN THE KERNEL AND DRAWN IN THE DESIGN PACKAGE, AND
 * NEITHER HALF CAN SEE THE OTHER.
 *
 * ⚠️ THE HOLE IS AN ENTRY WITH NO COMPONENT, AND IT FAILS IN SILENCE. The kernel
 * refuses `step_block_unknown` against `ASKS`, so a step may only name a
 * registered block — and `ASKING` is a plain record, so a registered block with
 * no component resolves to `undefined`, falls through to the fields branch, and
 * draws a question with NOTHING under it. That is exactly the screen
 * `step_asks_nothing` exists to refuse, arriving from the side the kernel cannot
 * look at, because the kernel draws nothing.
 *
 * ⚠️ AND THE OTHER DIRECTION IS DEAD CODE WEARING A CONTRACT. A component for an
 * id `ASKS` does not carry can never be reached — the kernel refuses every step
 * that would name it — so it is a lazy chunk, a skeleton and a claim, for a block
 * no flow can ask for.
 */
{
  const idsIn = (path, from, pattern) => {
    const src = readFileSync(join(ENGINE, path), "utf8");
    const at = src.indexOf(from);
    if (at < 0) return null;
    return new Set([...src.slice(at).matchAll(pattern)].map((m) => m[1]));
  };

  const declared = idsIn(
    "kernel/src/blocks.ts", "export const ASKS", /^\s{2}(\w+): asking\(/gm,
  );
  const drawn = idsIn(
    "design/src/rendered/asking.tsx", "export const ASKING", /^\s{2}(\w+):/gm,
  );

  if (!declared?.size || !drawn?.size) {
    fail("blocked: one of the two block registries could not be read at all.\n"
      + "       An empty side makes every comparison below vacuously true, which is a\n"
      + "       check that stopped looking rather than a rule being kept.");
  } else {
    /* ⚠️ ITS OWN COUNT, NOT THE FILE'S. Reading the shared one makes an unrelated
       failure above suppress this check's `ok`, so the report says nothing about a
       rule that was kept — and a silent pass reads the same as a missing check. */
    let apart = 0;
    for (const id of declared) {
      if (!drawn.has(id)) {
        apart++;
        fail(`blocked: \`${id}\` is in \`ASKS\` and has no component in \`ASKING\`.\n`
          + `       The kernel lets a step name it; the renderer resolves it to nothing and\n`
          + `       falls through to the fields branch, which for a block step is empty — so\n`
          + `       the flow draws that question with no control at all.`);
      }
    }
    for (const id of drawn) {
      if (!declared.has(id)) {
        apart++;
        fail(`blocked: \`${id}\` is in \`ASKING\` and not in \`ASKS\`.\n`
          + `       No step can name it — the kernel refuses an unregistered block — so it is\n`
          + `       a chunk, a skeleton and a contract for something nothing can ask for.`);
      }
    }
    if (!apart) ok(`blocked: every asking block is declared and drawn — ${declared.size}`);
  }
}

/* ---------------------------------------------------------- one drawing --- */

/**
 * ⚠️ THE FLOW HAS ONE RENDERER AND A SECOND CALLER IS A HAND-WRITTEN WIZARD.
 * `Story` is the frame; `Create` turns a declaration into it. Anything else that
 * mounts the frame is supplying its own `asks` — which is a file inside one
 * product holding that product's questions, its controls and its clauses, and it
 * is the exact shape the whole declared-flow contract replaced. It is also what a
 * surface rewrite deletes, taking the flow with it.
 */
{
  const RENDERER = "design/src/rendered/create.tsx";
  const MOUNTS = /<Story[\s/>]/;
  const strays = DRAWS
    .filter((f) => rel(f) !== FRAME && rel(f) !== RENDERER)
    .filter((f) => MOUNTS.test(code(readFileSync(f, "utf8"))))
    .map(rel);
  for (const name of strays) {
    fail(`${name}: mounts \`Story\` itself.\n`
      + `       A flow is DECLARED and \`Create\` draws it. Mounting the frame by hand is a\n`
      + `       file holding one product's questions, controls and clauses — which is what\n`
      + `       left the wizard orphaned last time, and what a surface rewrite deletes.`);
  }
  const at = join(ENGINE, RENDERER);
  if (!existsSync(at) || !MOUNTS.test(readFileSync(at, "utf8"))) {
    fail(`${RENDERER}: no longer mounts \`Story\`, so a declared flow draws nothing and\n`
      + `       this check is guarding an empty rule.`);
  }
  if (!strays.length) ok("one drawing: the declared flow has exactly one renderer");
}

/* -------------------------------------------------------------- paired --- */

{
  /*
    ⚠️ THE DOCK HOLDS A PAIR IN EXACTLY ONE PLACE. Every other screen has one
    act, because a page with two things it is for is two pages — and the moment a
    screen hand-rolls `step={{ back }}` it is a flow that has escaped `Story`,
    which means it has also escaped the history wiring, the recap and the
    per-step refusals. The pair is the visible half of all of that.
  */
  /*
    ⚠️ `step={{`, NOT `step={`, AND THE DIFFERENCE IS A NUMBER FIELD. The looser
    pattern reported the design package's own `NumberInput` and a console screen
    setting a spinner's increment — `step={0.5}` — as hand-rolled wizards. The
    prop this is about takes an OBJECT, so the second brace is the whole
    discriminator.
  */
  const PAIRS = /\bstep=\{\{/;
  const strays = DRAWS
    .filter((f) => rel(f) !== FRAME)
    .filter((f) => PAIRS.test(code(readFileSync(f, "utf8"))))
    .map(rel);
  for (const name of strays) {
    fail(`${name}: hands \`Screen\` a \`step\` of its own.\n`
      + `       The dock's second control exists for a flow, and a flow is a \`Story\` —\n`
      + `       written by hand it is a Back button over none of the wiring it implies:\n`
      + `       no recap, no per-step refusal, and no answer to the phone's own gesture.`);
  }

  const story = join(ENGINE, FRAME);
  if (!existsSync(story) || !PAIRS.test(readFileSync(story, "utf8"))) {
    fail("design/src/frame/story.tsx: no longer hands `Screen` a `step`, so the flow\n"
      + "       draws no way back and this check is guarding an empty rule.");
  }
  if (!strays.length) ok("paired: the dock's second control is the flow's, not a screen's");
}

console.log("\nstory: a flow asks questions, and what was answered stays said.");
process.exit(bad ? 1 : 0);
