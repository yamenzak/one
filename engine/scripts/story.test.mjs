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
 * ⚠️ SO THE THREE RULES BELOW ARE ABOUT WORDS, WHICH IS UNUSUAL FOR A GUARD AND
 * IS THE POINT. A step ASKS rather than heading, it carries the CLAUSE its
 * answer makes, and the clause is the same string in the live echo and in the
 * recap. Any of the three left off renders perfectly and quietly turns the flow
 * back into the form it replaced.
 *
 * ⚠️ AND THE FOURTH IS THE ONE THAT PREVENTS A BUG RATHER THAN A REGRESSION.
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

/* ----------------------------------------------- asked, and it narrates --- */

/*
  ⚠️ AN `Ask` IS FOUND BY `children:`, AND THE FIRST DRAFT WAS NOT. Matching a
  bare `ask: "…"` reported twelve failures in the proving ground's SAMPLE DATA,
  where `ask` is a column meaning "who asked" and every value is an email
  address. `children` is what makes a step a step — it is the controls, it is
  required by the type, and no row of data has one.

  ⚠️ AND THE WINDOW IS LAZY, WHICH IS WHAT KEEPS ONE STEP OUT OF THE NEXT. Every
  step declares `children`, so the nearest one after an `ask` is always that
  step's own; a greedy match would read step A's question against step B's
  clause and pass whatever B happened to declare.
*/
/*
  ⚠️ ANCHORED ON `ask`, NOT ON `id`, AND THE FIRST DRAFT WAS THE OTHER WAY ROUND.
  Starting at the nearest preceding `id:` reads whatever id happens to be closest
  — and a step whose controls declare options (`{ id: "loose", label: … }`) puts
  three of them between one question and the next, so the barcode step reported
  its id as `loose`. A question is unambiguous; the id is then read BACKWARD from
  it, and a step that does not put the two together is reported rather than
  quietly skipped.
*/
const STEP = /\bask:\s*"([^"\\]{2,})"([\s\S]{0,6000}?)\bchildren:/g;
const NAMED = /\bid:\s*"([^"]+)",\s*$/;

/** The step's own id, or null where it is not written next to the question. */
const idOf = (src, at) => NAMED.exec(src.slice(Math.max(0, at - 200), at))?.[1] ?? null;

/**
 * ⚠️ THE FRAME ITSELF SYNTHESISES ONE STEP AND IT IS EXEMPT, NAMED HERE RATHER
 * THAN BY LUCK. `Story` appends the review — a step with a question and no
 * clause, which is correct: a review has nothing to add to a story because it IS
 * the story. It currently escapes the pattern above only because its id is the
 * constant `REVIEW` rather than a quoted string, and a rule that holds by an
 * accident of quoting is a rule that breaks the day somebody inlines it.
 */
const FRAME = "design/src/frame/story.tsx";

{
  let checked = 0;
  let headings = 0;
  let silent = 0;
  let unnamed = 0;
  for (const file of DRAWS) {
    if (rel(file) === FRAME) continue;
    const src = code(readFileSync(file, "utf8"));
    for (const match of src.matchAll(STEP)) {
      const [, text, head] = match;
      checked++;
      /*
        ⚠️ THE ID GOES DIRECTLY ABOVE THE QUESTION, AND A STEP THAT PUTS IT
        ELSEWHERE IS REPORTED RATHER THAN SKIPPED. Read from anywhere else it is
        whichever id happened to be nearest — a step whose controls declare
        options puts three of them between one question and the next, which is
        how the barcode step came to be called `loose`. The manifest that
        declares this flow is compared against it BY ID, so a step the guard
        cannot name is a step the comparison silently gets wrong.
      */
      if (!idOf(src, match.index)) {
        unnamed++;
        fail(`${rel(file)}: the step asking "${text.slice(0, 40)}" does not name its id\n`
          + `       directly above the question. Written apart, nothing here can tell which\n`
          + `       step a question belongs to — and the manifest declaring this flow is\n`
          + `       compared against it by id.`);
      }
      /*
        ⚠️ A QUESTION, AND THE `?` IS THE CHECK BECAUSE THE QUESTION IS THE
        DESIGN. "Counting" is a heading: it names the area of the record being
        written and leaves somebody to work out what is wanted of them. "What do
        you count it in?" has an answer, and anybody who can answer it needs no
        training to.
      */
      if (!text.trim().endsWith("?")) {
        headings++;
        fail(`${rel(file)}: a step is headed "${text.slice(0, 48)}"\n`
          + `       rather than asking anything. A step of a flow asks ONE thing in the\n`
          + `       second person — that is what makes the flow answerable without an\n`
          + `       induction, and a heading is what it replaced.`);
      }
      /*
        ⚠️ READ PER DECLARATION RATHER THAN PER FILE. Nine steps and eight
        clauses passes any check that only asks whether the word appears, and the
        one step missing its clause is the one that vanishes from the recap
        without a trace: the screen still draws, Next still works, and the
        sentence a person was going to check simply is not there.
      */
      if (!/\bsays:/.test(head)) {
        silent++;
        fail(`${rel(file)}: the step "${text.slice(0, 48)}" carries no \`says\`.\n`
          + `       A step that adds nothing to the story vanishes from the recap, so the\n`
          + `       answer somebody gave it is the one they can never check and never get\n`
          + `       back to. \`says: null\` is how a step declares it has no clause YET;\n`
          + `       leaving the key off declares it will never have one.`);
      }
    }
  }
  if (!checked) {
    fail("asked: no step declarations matched at all — both rules here are about the\n"
      + "       words in one, so a pattern that finds none is two checks that stopped\n"
      + "       looking rather than two rules being kept.");
  } else {
    if (!headings && !unnamed) ok(`asked: every step asks a question — ${checked} step(s)`);
    if (!silent) ok(`narrates: every declared step carries the clause its answer makes — ${checked}`);
  }
}

/* ------------------------------------------------------------- declared --- */

/**
 * A FLOW IS DECLARED IN THE MANIFEST AND DRAWN IN A SCREEN, AND THE TWO AGREE.
 *
 * ⚠️ THE HOLE THIS CLOSES IS TWO HAND-TYPED STRINGS IN TWO FILES. A screen
 * declares `permission: "product:write"`; the flow inside it declares
 * `op: "product.register"`. Nothing checked that the second demands the first —
 * so a wizard could take somebody through ten questions, past a gate that said
 * yes, and be refused by the write at the end. That is the offer-and-refuse
 * failure the whole `op` mechanism exists to prevent, reproduced one level up.
 *
 * ⚠️ AND A DECLARATION NOBODY CHECKS IS WORSE THAN NONE, because it is read as
 * true. The manifest's list of questions is what the docs print and what an
 * agent is told a flow will want; drifted from the screen it describes a product
 * that does not exist. The ids and the questions are compared literally.
 */
{
  const MANIFESTS = appDirs().flatMap((dir) => filesIn(dir, /^index\.tsx?$/));
  let flows = 0;

  for (const file of MANIFESTS) {
    const src = code(readFileSync(file, "utf8"));
    for (const [, block] of src.matchAll(/\bstory:\s*\{([\s\S]*?)\n(\s{4,6})\},/g)) {
      flows++;
      const name = rel(file);
      const writes = /\bwrites:\s*"([^"]+)"/.exec(block)?.[1];
      if (!writes) {
        fail(`${name}: a declared flow names no \`writes\`.\n`
          + `       A flow exists to reach ONE operation; without it nothing can check\n`
          + `       that the screen's permission is the one that write demands.`);
        continue;
      }
      /* ⚠️ THE OPERATION HAS TO EXIST — a flow pointed at a name nothing answers
         is ten questions ending in a 404. */
      if (!new RegExp(`\\bid:\\s*"${writes.replace(".", "\\.")}"`).test(src)) {
        fail(`${name}: a flow writes \`${writes}\`, which this app does not declare.\n`
          + `       Ten questions ending at an operation nothing answers.`);
      }
      const declared = [...block.matchAll(/\bid:\s*"([^"]+)",\s*ask:\s*"([^"\\]+)"/g)]
        .map(([, id, ask]) => `${id}\u0000${ask}`);
      if (!declared.length) {
        fail(`${name}: a declared flow asks nothing.\n`
          + `       The questions are what the docs print and what an agent is told the\n`
          + `       flow will want; an empty list describes a screen nobody can prepare for.`);
        continue;
      }
      /*
        ⚠️ COMPARED AGAINST THE SCREEN THAT DRAWS IT, LITERALLY. The screen is
        found by the operation it writes, which is the one string both halves
        already have to share — matching on a filename would break the day
        somebody renamed one.
      */
      /*
        ⚠️ FOUND BY THE OPERATION IT WRITES, NOT BY A FILENAME. That string is
        the one thing both halves already have to share, so matching on it
        survives a screen being renamed or moved — and a guard that breaks on a
        rename is a guard somebody deletes.
      */
      /*
        ⚠️ NOT THE MANIFEST ITSELF, WHICH NOW ALSO CARRIES `ask:` — the file that
        declares the flow names the operation and the questions, so an unfiltered
        search finds the declaration and compares it against itself. It passed,
        which is the worst way for this to be wrong.

        ⚠️ AND A SCREEN IS A FILE WITH REAL STEPS IN IT — `children:` after a
        question. That is what separates something that DRAWS the flow from
        something that merely mentions the operation, which the container that
        calls the write does on every screen in the product.
      */
      const drawn = DRAWS
        .filter((f) => rel(f) !== FRAME && !MANIFESTS.includes(f))
        .map((f) => code(readFileSync(f, "utf8")))
        .filter((s) => s.includes(`"${writes}"`) && [...s.matchAll(STEP)].length > 0);
      if (!drawn.length) {
        fail(`${name}: nothing draws the flow that writes \`${writes}\`.\n`
          + `       A declared flow with no screen is a promise in the docs and in the\n`
          + `       agent surface that resolves to a page nobody built.`);
        continue;
      }
      const screen = drawn[0];
      const actual = [...screen.matchAll(STEP)]
        .map((m) => `${idOf(screen, m.index) ?? "?"}\u0000${m[1]}`);
      const say = (list) => list.map((s) => s.replace("\u0000", " — ")).join("\n         ");
      if (say(declared) !== say(actual)) {
        fail(`${name}: the declared flow and the screen that draws it disagree.\n`
          + `       declared:\n         ${say(declared)}\n`
          + `       drawn:\n         ${say(actual)}\n`
          + `       The manifest is what the docs print and what an agent is handed. Drifted,\n`
          + `       it describes a product that does not exist.`);
      }
    }
  }

  if (flows) ok(`declared: every flow in a manifest is the flow its screen draws — ${flows}`);
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
