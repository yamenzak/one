/**
 * EVERY REFUSAL COMES FROM A CATALOGUE (D5).
 *
 * @design every refusal comes from a catalogue, and one naming an input is rendered on that input.
 *
 * ⚠️ A HAND-BUILT REFUSAL IS THE EASIEST WRONG THING IN THIS TREE TO WRITE. The
 * shape is six obvious fields, it typechecks, it renders, and every one of the
 * six is a decision somebody made alone: the wording, the status, the tone,
 * whether retrying could work, and — worst — the code. Six sites had done it,
 * and three of them stamped `platform.invalid` on three different sentences, so
 * one code meant three things and a client switching on it could not.
 *
 * ⚠️ THE CATALOGUE IS WHAT MAKES A CODE MEAN SOMETHING. `problem()` is the only
 * constructor: it resolves the code, interpolates the sentence's values, and
 * turns an unknown code into `platform.unavailable` rather than into a throw
 * inside the error path. A literal goes round all three.
 *
 * ⚠️ AND A CAST WOULD NOT HELP, WHICH IS WHY THIS IS A GUARD RATHER THAN A
 * BRANDED TYPE. A `Problem` legitimately arrives from the wire — the fetch layer
 * parses one out of a response body — so a nominal type would only push a cast
 * into that seam, and a cast is exactly as unchecked as the literal was. What is
 * checkable is the SHAPE being written by hand, and that is what this refuses.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { appDirs } from "./lib/trees.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const read = (p) => readFileSync(join(ENGINE, p), "utf8");

/*
  ⚠️ `retryable` IS THE TELL, AND IT IS A GOOD ONE: it appears in a `Problem`, in
  a `ProblemDef`, and in nothing else in this tree. Matching on `code:` would
  catch every unrelated identifier; matching on the whole shape would miss one
  written across four lines.
*/
const WRITES_PROBLEMS = /\bretryable:/;

/*
  ⚠️ TWO KINDS OF FILE MAY HOLD ONE, AND BOTH ARE DECLARATIONS RATHER THAN USES:
  the engine itself, and a catalogue. A catalogue is recognised by what it says
  it is — a `ProblemCatalog` — so a new app's catalogue needs no edit here, and a
  screen cannot become exempt by being renamed.
*/
const ENGINE_ITSELF = "kernel/src/problem.ts";
/**
 * ⚠️ AN APP DECLARES ITS CATALOGUE INSIDE ITS MANIFEST, under `problems:`, and
 * it is typed structurally rather than annotated — so looking only for the type
 * name reported OneInventory's whole catalogue as forty hand-built refusals the
 * day this guard was widened to cover apps. Both spellings are declarations; a
 * screen can wear neither.
 */
const isCatalogue = (src) =>
  /:\s*ProblemCatalog\b/.test(src) || /^\s{2}problems:\s*\{/m.test(src);

/**
 * ⚠️ AND EVERY APP, DERIVED RATHER THAN LISTED. A product is where a refusal is
 * most likely to be re-worded — it is the tree with the most screens and the
 * least platform context — and a hand-kept list here means app #3 is exempt on
 * the day it is registered, silently, which is the shape every other widened
 * guard in this repository was widened to fix.
 */
const ROOTS = [
  "kernel/src", "runtime/src", "design/src", "one-space/src", "one/src",
  "ground/src", ...appDirs(),
];

const strays = [];
const catalogues = [];

const walk = (dir) => {
  let entries;
  try { entries = readdirSync(join(ENGINE, dir), { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const at = `${dir}/${entry.name}`;
    if (entry.isDirectory()) { walk(at); continue; }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    const src = read(at);
    if (!WRITES_PROBLEMS.test(src)) continue;
    if (at === ENGINE_ITSELF) continue;
    if (isCatalogue(src)) { catalogues.push(at); continue; }
    strays.push(at);
  }
};
for (const root of ROOTS) walk(root);

if (strays.length) {
  fail(`catalogue: ${strays.join(", ")} build a refusal by hand. Add the code to a ProblemCatalog and raise it with problem().`);
} else {
  ok(`catalogue: every refusal comes from one of ${catalogues.length + 1} catalogue(s)`);
}

/*
  ⚠️ AND THE FIELD CHANNEL HAS TO BE READ SOMEWHERE, or it is a mechanism with
  no surface — the failure D12 exists to refuse, one layer down. `Problem.fields`
  carries a sentence per input so a form can put it against the input; nothing
  reading it means every refusal about a value renders as a banner over the form
  saying "that does not look right" without saying which of six.
*/
const readsFields = [...ROOTS, "design/src"].some((root) => {
  const found = [];
  const scan = (dir) => {
    let entries;
    try { entries = readdirSync(join(ENGINE, dir), { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const at = `${dir}/${entry.name}`;
      if (entry.isDirectory()) scan(at);
      else if (/\.(ts|tsx)$/.test(entry.name) && /\brefusedOn\(/.test(read(at))) found.push(at);
    }
  };
  scan(root);
  return found.length > 0;
});

if (readsFields) {
  ok("fields: a refusal naming an input is rendered against that input");
} else {
  fail("fields: nothing calls refusedOn, so Problem.fields is a channel every form drops — a refusal about one value shown as a banner over all of them");
}

/*
  ⚠️ EVERY PLATFORM CODE'S SENTENCE IS FILLED WHERE IT IS RAISED, OR IT SHIPS A
  BRACE. `say` leaves an unknown token VISIBLE on purpose — visibly wrong beats
  plausibly wrong — but that correct behaviour is also what lets a token nobody
  supplies survive onto a screen, which is how somebody hitting a seat limit read
  "your plan includes {limit}".

  ⚠️ AND IT IS CHECKED PER CALL SITE, WHICH IS THE ONLY VERSION THAT BITES. The
  first draft asked whether the token appeared as `word:` ANYWHERE in the tree —
  and almost every word does, so renaming `{limit}` to `{ceiling}` left it green
  because an unrelated `ceiling:` exists in the entitlement code. A check that
  broad is a check that reports what it happens to find.
*/
const CODES = new Map();
for (const [, code, block] of read(ENGINE_ITSELF).matchAll(/"(platform\.\w+)":\s*\{([\s\S]*?)\n  \},/g)) {
  const want = [...block.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
    /* `ref` is supplied by `problem()` itself out of `extra`, never by a caller. */
    .filter((t) => t !== "ref");
  if (want.length) CODES.set(code, want);
}

const sources = [];
const gather = (dir) => {
  let entries;
  try { entries = readdirSync(join(ENGINE, dir), { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const at = `${dir}/${entry.name}`;
    if (entry.isDirectory()) gather(at);
    else if (/\.(ts|tsx)$/.test(entry.name)) sources.push([at, read(at)]);
  }
};
for (const root of ROOTS) gather(root);

/*
  ⚠️ THE CODE IS FOUND AS A LITERAL, NOT AS AN ARGUMENT TO ONE HELPER. It is
  raised through `problem()`, through the gate's `no()`, and through whatever the
  next lane calls its own — anchoring on one of them would silently skip the
  others. What a raise always looks like is the code's own string beside the
  values, so the window after the literal is what is read.
*/
const dry = [];
for (const [at, src] of sources) {
  if (at === ENGINE_ITSELF) continue;
  for (const [code, want] of CODES) {
    for (const m of src.matchAll(new RegExp(`"${code.replace(".", "\\.")}"`, "g"))) {
      /* ⚠️ A `fails:` LIST NAMES A CODE, IT DOES NOT RAISE ONE. An operation
         declares which refusals it may answer with — that is what the agent
         surface and the docs read — and treating the declaration as a raise
         asked every one of them for values nothing is interpolating. */
      if (/\bfails:\s*\[[^\]]*$/.test(src.slice(Math.max(0, m.index - 400), m.index))) continue;
      const window = src.slice(m.index, m.index + 300);
      const missing = want.filter((t) => !new RegExp(`\\b${t}\\s*[:,}]`).test(window));
      if (missing.length) dry.push(`${at} raises ${code} without {${missing.join("}, {")}}`);
    }
  }
}

if (dry.length) {
  fail(`values: ${dry.join("; ")} — the token reaches the screen as a literal brace`);
} else {
  ok(`values: every raise of the ${CODES.size} interpolated code(s) supplies its values`);
}

/* ------------------------------------------------------------ the drawing --- */

/**
 * ⚠️ AND A REFUSAL IS DRAWN BY ONE THING, WHICH IS THE HALF THE CHECKS ABOVE DO
 * NOT ASK. They cover CONSTRUCTION — that a code comes from a catalogue and its
 * sentence is filled. Nothing covered DISPLAY, so a control could obey every one
 * of them and still put the words on the screen itself.
 *
 * ⚠️ `PickFile` HAD, FOR A YEAR. It wrote its own three sentences in the file
 * that draws it and painted them `text-danger` — so a file rejected in the
 * browser read in different words, in a different tone and in a different colour
 * from the same file rejected by the server one layer up. The colour was the
 * one the contrast reading later measured at 3.39:1.
 *
 * ⚠️ THE TELL IS A RAW TONE UTILITY. `text-danger` and its siblings are the
 * library's FILL colours; as ink they are short of the floor, and `data-ink` is
 * the channel that carries the tuned value. A screen reaching for the class is a
 * screen that has decided to say something itself.
 */
const TONE_UTILITY = /className=[^\n]*\btext-(danger|warning|success)\b/;
const drawn = [];
for (const [at, src] of sources) {
  const bare = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  if (TONE_UTILITY.test(bare)) drawn.push(at);
}
if (drawn.length) {
  fail(`ink: ${drawn.join(", ")} paint a tone with a utility class.\n` +
    `       \`text-danger\` is the library's FILL colour and it is under the contrast\n` +
    `       floor as ink. Stamp \`data-ink="danger"\` — one channel, tuned once.`);
} else {
  ok(`ink: no screen paints a tone with a utility class`);
}

/**
 * ⚠️ AND `Trouble` IS THE ONLY THING THAT DRAWS ONE. It is where the tone
 * becomes a status, where `retryable` decides whether a retry is offered at all,
 * and where the reference is shown — three decisions the kernel already took. A
 * second renderer is a second answer to each of them.
 */
const RENDERER = "design/src/parts/state.tsx";
const others = sources
  .filter(([at]) => at !== RENDERER)
  .filter(([, src]) => /<Alert\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")));
if (others.length) {
  fail(`drawn: ${others.map(([at]) => at).join(", ")} draw an Alert of their own.\n` +
    `       \`Trouble\` is the one renderer — it maps the tone to a status, offers a\n` +
    `       retry only where \`retryable\` says so, and shows the reference. Three\n` +
    `       decisions the kernel already took, and a second Alert re-takes all of them.`);
} else {
  ok(`drawn: one renderer for every refusal, in ${RENDERER}`);
}

console.log(bad ? `\nproblem: ${bad} problem(s).` : "\nproblem: green.");
process.exit(bad ? 1 : 0);
