/**
 * ONE RHYTHM PER CONTAINER (DESIGN.md §4, §6).
 *
 * @design one rhythm per container, and a screen's is the DOM's rather than a walk over React children.
 *
 * ⚠️ THE MEASURED HALF OF THIS IS `design/test/rhythm.test.tsx`, WHICH RENDERS IN
 * A BROWSER AND ASSERTS PIXELS. This is the cheap net over the source, and the
 * two exist for different reasons: the geometry test proves the LIBRARY spaces a
 * card correctly, and this proves no SCREEN reaches inside one and adds a second
 * rhythm. A screen that does still renders perfectly — the spacing is merely
 * different from every other card in the product, which is the one fault a
 * screenshot of that screen alone can never show.
 *
 * ⚠️ AND IT IS THE COMPLAINT THIS REPOSITORY HAS HAD MOST OFTEN. "The card has
 * double padding" has been reported, fixed at the call site, and come back, four
 * times — because each fix was an instance and the cause is compositional: a
 * `Stack` inside a `Group` is two people each doing something correct.
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

/* ⚠️ Every browser half this repository has, derived rather than listed — a
   fourth app must be asked the same question the day it is added. */
const FILES = [
  ...filesIn("design/src", /\.tsx$/),
  ...filesIn("one-space/src", /\.tsx$/),
  ...filesIn("apps", /\.tsx$/),
];

/* ------------------------------------------------------- a card IS a stack --- */

/**
 * ⚠️ A CARD IS ALREADY A COLUMN AT ONE RHYTHM, so a `Stack` inside one is a
 * second inset and a second gap. Measured: the card gives its non-row child a
 * row's padding, the stack gives its own children theirs, and the first line
 * lands 36px from the card's edge where every other card in the product puts it
 * at 24 — with the stack's gap added between every pair on top of that. Both
 * halves are individually reasonable and the composition is the defect, which is
 * why this is a rule rather than a review note.
 *
 * ⚠️ `Grid` AND `Center` ARE NOT REFUSED, AND THE DIFFERENCE IS ARITHMETIC. They
 * arrange a card's content in a way a column of rows cannot express — a grid of
 * figures, one object centred — and they hold ONE child's worth of inset rather
 * than re-spacing a run of rows. Measured, the first line is still at 24.
 */
const RESTACKS = /^(Stack|Rail|Cluster)$/;

/** The tag that opens right after a `<Group …>`, comments skipped. */
const firstInside = (src, from) => {
  const after = src.slice(from, from + 600).replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
  return /<([A-Z][A-Za-z]*)/.exec(after)?.[1] ?? null;
};

{
  let cards = 0;
  let doubled = 0;
  for (const file of FILES) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/<Group\b[^>]*>/g)) {
      cards++;
      const first = firstInside(src, m.index + m[0].length);
      if (first && RESTACKS.test(first)) {
        doubled++;
        fail(`${rel(file)}:${src.slice(0, m.index).split("\n").length}: `
          + `<${first}> directly inside a <Group>.\n`
          + `       A card is already a column at one rhythm — a second one inside it is a\n`
          + `       second inset and a second gap, which is what "double padding" is. Put the\n`
          + `       rows in the card; it spaces them.`);
      }
    }
  }
  if (!doubled) ok(`stacked: ${cards} card(s), none re-spaced from the inside`);
}

/* ------------------------------------------------- and nothing counts blocks --- */

/**
 * ⚠️ A SCREEN'S RHYTHM MUST NOT DEPEND ON COUNTING REACT CHILDREN, and this is
 * the guard for the fault that cost every gap on nearly every screen. `Screen`
 * wrapped each child it could count; `React.Children` flattens a fragment written
 * inline and CANNOT look inside a component that returns one — which is what
 * every real screen does. So the gap was applied between nothing and three cards
 * touched, measured at 0 where the scale says 24, with every suite green.
 *
 * ⚠️ THE FIX IS THAT THE DOM IS THE LIST. Fragments produce no DOM nodes, so a
 * `gap` on the container reaches whatever a component composed. This refuses the
 * shape that broke it: a walk over children inside the frame that lays them out.
 */
{
  const screen = readFileSync(join(ENGINE, "design/src/frame/screen.tsx"), "utf8");
  const arrange = readFileSync(join(ENGINE, "design/src/parts/arrange.tsx"), "utf8");
  const motion = readFileSync(join(ENGINE, "design/src/tokens/motion.ts"), "utf8");

  if (/React\.Children\.(toArray|map|forEach)/.test(screen)) {
    fail(`design/src/frame/screen.tsx: the frame walks its children to lay them out.\n`
      + `       A component boundary is opaque to \`React.Children\`, so any rhythm that\n`
      + `       counts them is absent on every screen whose \`then\` returns a component —\n`
      + `       which is all of them. Let the DOM be the list: fragments make no nodes, so a\n`
      + `       gap on the container reaches whatever composed it.`);
  } else if (!/<Stack\b[^>]*\bblocks\b/.test(screen)) {
    fail(`design/src/frame/screen.tsx: the screen's content is not in a \`blocks\` Stack,\n`
      + `       so nothing marks where its top-level blocks are and both the gap and the\n`
      + `       arrival stagger have nothing to apply to.`);
  } else if (!/"data-blocks"/.test(arrange)) {
    fail(`design/src/parts/arrange.tsx: \`blocks\` no longer stamps \`data-blocks\`.\n`
      + `       The stagger selects on it; without the attribute every block arrives at once.`);
  } else if (!/\[data-blocks\] > \*:nth-child/.test(motion)) {
    fail(`design/src/tokens/motion.ts: the block stagger is not positional.\n`
      + `       An inline delay per wrapper is exactly what was lost on every screen whose\n`
      + `       blocks came from a component — the same silence as the gap, one property over.`);
  } else {
    ok(`blocks: the screen's rhythm is the DOM's, so composition cannot defeat it`);
  }
}

/* -------------------------------------------- nor at the top of a screen --- */

/**
 * ⚠️ THE SAME FAULT ONE LEVEL UP, AND IT IS QUIETER. `Screen` puts its content
 * in a `<Stack blocks>` and the rhythm is that container's `gap`, so a screen
 * whose `then` returns a single `Stack` wrapping everything has ONE block: the
 * screen's own gap applies between nothing, and the wrapper's applies instead.
 * It happens to look identical when the two spacings agree, which is why it
 * survived on two console screens — and it is not only spacing. The remembered
 * skeleton (`design/src/parts/recall.tsx`) measures top-level blocks, so a
 * screen wrapped like this waits behind one six-hundred-pixel slab where there
 * are five cards.
 *
 * ⚠️ A FRAGMENT IS THE ANSWER, AND IT COSTS NOTHING. Fragments produce no DOM
 * nodes, so whatever a component composed lands as siblings in the frame's own
 * container — which is the whole reason the rhythm is the DOM's.
 */
{
  let screens = 0;
  let wrapped = 0;
  /* ⚠️ The opening of a `then` or `children`, and what it returns first. */
  const RETURNS = /\bthen=\{\s*\([^)]*\)\s*=>\s*\(\s*(?:\{\s*\/\*[\s\S]*?\*\/\s*\}\s*|\/\*[\s\S]*?\*\/\s*)*<([A-Z][A-Za-z]*)/g;
  for (const file of FILES) {
    const src = readFileSync(file, "utf8");
    /* ⚠️ Only where the `then` belongs to a `Screen` — a nested `Await` inside a
       card is a different container with a rhythm of its own. */
    if (!/<Screen\b/.test(src)) continue;
    for (const m of src.matchAll(RETURNS)) {
      screens++;
      if (!RESTACKS.test(m[1])) continue;
      /* ⚠️ Attributed to a `Screen` only when one opens before this `then` and
         no other `then` sits between — the cheap test, and it is enough because
         a nested `Await`'s `then` would be the nearer match. */
      const before = src.slice(0, m.index);
      if (!/<Screen\b[^>]*$|<Screen\b(?![\s\S]*<Await\b)/.test(before.slice(-4000))) continue;
      wrapped++;
      fail(`${rel(file)}:${before.split("\n").length}: a screen's content is one `
        + `<${m[1]}>.\n`
        + `       The frame already puts every top-level block in a column at the scale, so\n`
        + `       this collapses the whole screen into ONE block — the gap applies between\n`
        + `       nothing, and the remembered skeleton draws one slab where there are five\n`
        + `       cards. Return a fragment; fragments make no DOM nodes.`);
    }
  }
  if (!wrapped) ok(`screens: ${screens} content block(s), none wrapped in a second column`);
}

console.log(bad
  ? `\nrhythm: ${bad} finding(s) — a second rhythm inside one container.`
  : `\nrhythm: one rhythm per container, and the screen's is the DOM's.`);
process.exit(bad ? 1 : 0);
