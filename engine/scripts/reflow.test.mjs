/**
 * A BLOCK MAY NOT NAME A BREAKPOINT.
 *
 * @design a screen composes the vocabulary; it does not re-derive it.
 *
 * ⚠️ A BREAKPOINT IS A CLAIM ABOUT THE SCREEN AND A BLOCK KNOWS NOTHING ABOUT
 * THE SCREEN. `Listing` collapsed on `md:` — right while a list was always the
 * width of the page, wrong the moment one sits in a cell of a board: on a 1440px
 * monitor the viewport says "wide", so four columns are drawn into 300 pixels
 * and every one of them is a word per line. The reverse costs as much, and a
 * list given the whole of a 700px tablet stays a phone list.
 *
 * ⚠️ AND IT IS THE RULE THAT MAKES A DECLARED LAYOUT POSSIBLE AT ALL (D92). A
 * block told what slot it is in works in the layouts that use that vocabulary
 * and breaks in every one that does not, including the ones nobody has designed
 * yet. A block that measures its own box works in all of them.
 *
 * ⚠️ THE MEASURED HALF IS `design/test/reflow.seen.test.tsx`, and the two ask
 * different questions on purpose. This one asks whether a rule about the SCREEN
 * was written; that one holds the screen still, gives a block two boxes, and
 * asks whether it actually answered differently — which is the only reading a
 * breakpoint cannot fake.
 *
 * ⚠️ THE EXEMPTIONS ARE BY NAME AND BY REASON, AND THEY CAN ONLY SHRINK. What is
 * legitimately about the device — a page gutter, a reading size, an input that
 * has no swipe — is a short list, and each entry has to be argued for rather
 * than ticked.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/** ⚠️ Where a block lives. `rendered/` is a whole surface and is swept too. */
const HOMES = ["design/src/parts", "design/src/chart", "design/src/rendered"];

/**
 * ⚠️ ONLY THESE FOUR MAY, AND EACH IS A FACT ABOUT THE DEVICE RATHER THAN ABOUT
 * A BOX.
 */
const MAY = {
  /*
    THE PAGE GUTTER. How far the content sits from the EDGE OF THE SCREEN is
    about the screen by definition, and `Band` is the one thing that applies it.
  */
  "design/src/tokens/metrics.ts": "the page gutter, the bleed and the door's padding — all measured from the edge of the screen",
  /*
    THE TYPE LADDER. How large a word is set is a reading-distance decision: a
    phone is held at arm's length and a monitor is not, and that is true whatever
    box the words are in.
  */
  "design/src/tokens/type.ts": "the type ladder steps up on a larger screen, which is about reading distance",
  /*
    THE RAIL'S STEPPERS AND ITS CARD. A desk has no swipe — a trackpad can scroll
    a rail sideways and a mouse cannot reach the second card at all — so the
    steppers are about the INPUT. The card width follows from a rail that bleeds
    to the page's own edge, which is the page's width and not a box's.
  */
  "design/src/parts/arrange.tsx": "a rail bleeds to the page's edge and its steppers are about the pointer, not the box",
};

/* ⚠️ A CLASS, NEVER A WORD. `md:` inside prose is a comment explaining the rule,
   and a check that could not tell them apart would make writing the reason for
   the rule a violation of it. */
const BREAKPOINT = /(?:^|[\s"'`{])(?:sm|md|lg|xl|2xl):[a-z[]/;

const files = [];
for (const home of HOMES) {
  for (const f of readdirSync(join(ENGINE, home))) {
    if (/\.tsx?$/.test(f)) files.push(`${home}/${f}`);
  }
}
files.push("design/src/tokens/metrics.ts", "design/src/tokens/type.ts");

{
  let named = 0;
  let swept = 0;
  for (const at of files) {
    const why = MAY[at];
    const lines = readFileSync(join(ENGINE, at), "utf8").split("\n");
    let found = 0;
    /*
      ⚠️ THE COMMENT STATE IS TRACKED, NOT MATCHED PER LINE. A `{/* … *\/}` block
      in JSX has no `*` down its left edge, so a per-line prefix test read the
      MIDDLE of a paragraph explaining the rule as a violation of it — and the
      paragraph in question is the one arguing why a button is `h-10 md:h-9`.
      A guard that makes writing down its own reason a failure is one people
      delete the reasons to satisfy.
    */
    let inside = false;
    for (const [i, line] of lines.entries()) {
      const opens = line.includes("/*");
      const closes = line.includes("*/");
      const was = inside;
      if (opens && !closes) inside = true;
      if (closes) inside = false;
      if (was || opens) continue;
      if (/^\s*\/\//.test(line)) continue;
      if (!BREAKPOINT.test(line)) continue;
      found++;
      if (why) continue;
      named++;
      fail(`${at}:${i + 1}: a block naming a breakpoint.\n`
        + `       ${line.trim()}\n`
        + `       A breakpoint is a claim about the screen, and this component does not know `
        + `what box it was put in. Use \`BOX\` and \`ROOM\` — see metrics.ts.`);
    }
    if (!why) { swept++; continue; }
    /*
      ⚠️ AN EXEMPTION FOR A FILE THAT NO LONGER HAS ONE IS A DOOR LEFT OPEN, and
      the list is only useful if it can only shrink. This is the direction that
      keeps it honest.
    */
    if (!found) {
      named++;
      fail(`${at} is exempted in scripts/reflow.test.mjs and names no breakpoint.\n`
        + `       Delete the exemption — the list can only shrink.`);
    }
  }
  if (!named) {
    ok(`blocks: ${swept} file(s) swept, none deciding by the width of the window`);
    ok(`allowed: ${Object.keys(MAY).length} file(s) exempted, each still using what it asked for`);
  }
}

/* ------------------------------------------------------- and the box exists --- */

/**
 * ⚠️ A CONTAINER RULE WITH NO CONTAINER OVER IT RESOLVES AGAINST THE NEAREST
 * ANCESTOR THAT IS ONE, OR AGAINST THE VIEWPORT — and neither fails. `@2xl:block`
 * inside a component that forgot `@container` is a rule that fires on somebody
 * else's width, silently, and reads on the screen as a component that reflows at
 * the wrong moment rather than as one that is broken.
 */
{
  let loose = 0;
  for (const at of files) {
    const text = readFileSync(join(ENGINE, at), "utf8");
    if (at.startsWith("design/src/tokens/")) continue;
    const uses = /@(?:xs|sm|md|lg|xl|2xl|3xl):/.test(text) || /\bROOM\./.test(text);
    if (!uses) continue;
    /*
      ⚠️ APPLIED, NOT MENTIONED. The first draft asked whether `BOX` appeared in
      the file, and every file that queries a box also EXPLAINS why it does — so
      the sentence "see `BOX`" satisfied the check, and a component whose
      container had been deleted went on passing. The question is whether the
      class reaches an element.
    */
    if (/\$\{BOX\}/.test(text) || /className=\{BOX\}/.test(text) || /"@container/.test(text)) continue;
    loose++;
    fail(`${at}: reflows by a container it never declares.\n`
      + `       The rule resolves against whatever ancestor happens to be a container, `
      + `or against the viewport — so it fires on somebody else's width.`);
  }
  if (!loose) ok("containers: every file that queries a box also declares one");
}

/* ------------------------------------------------------ and it is not itself --- */

/**
 * ⚠️ AN ELEMENT CANNOT QUERY ITSELF, AND THE RULE IS SIMPLY INERT WHEN IT TRIES.
 * `Columns` and `Segmented` both carried `@container` and their `@2xl:` rules on
 * ONE element: the declaration typechecked, the class was in the stylesheet, and
 * the columns never separated at any width. Nothing static could see it and
 * nothing visual reported it — the component looked converted and behaved as it
 * had before, which is the exact silence this whole arc is a catalogue of.
 *
 * ⚠️ IT WAS FOUND BY A BROWSER ASKING HOW MANY COLUMNS CAME OUT, which is why
 * the measured half exists. This check is the cheap version of that reading, so
 * the third instance is caught before somebody has to write another one.
 */
{
  let itself = 0;
  for (const at of files) {
    const text = readFileSync(join(ENGINE, at), "utf8");
    /* One `className={…}` at a time — a whole-file test cannot tell two
       neighbouring elements from one. */
    for (const m of text.matchAll(/className=\{(`[^`]*`|"[^"]*")\}/g)) {
      const cls = m[1];
      const container = /\$\{BOX\}/.test(cls) || /@container/.test(cls);
      const queries = /@(?:xs|sm|md|lg|xl|2xl|3xl):/.test(cls) || /\$\{ROOM\./.test(cls);
      if (!container || !queries) continue;
      itself++;
      fail(`${at}: one element is both the container and the thing querying it.\n`
        + `       ${cls.slice(0, 90)}\n`
        + `       An element cannot query itself, so the rule is inert at every width — `
        + `it typechecks, the class ships, and nothing ever moves. Wrap it.`);
    }
  }
  if (!itself) ok("boxes: no element is both the container and what measures it");
}

console.log(bad
  ? "\nreflow: something decides by the window rather than by its own box."
  : "\nreflow: a block reflows by the box it was given, and says which box that is.");
process.exit(bad ? 1 : 0);
