/**
 * ONE FILE HOLDS EVERY MEASUREMENT, AND NOTHING ELSE WRITES ONE.
 *
 * ⚠️ THIS IS THE GUARD THAT WOULD HAVE PREVENTED THE MESS IT WAS WRITTEN AFTER.
 * A `SPACE` scale existed and was used by the layout; the ROWS then padded
 * themselves `py-1`, `py-2` and `py-3` — each defensible on its own, and the
 * result a list with no rhythm that nobody could point at a wrong line in. That
 * is drift, and drift is not a review problem: every individual diff looks fine.
 *
 * ⚠️ AND A PRESSABLE ROW HAS A FLOOR. 44px is the accessibility minimum and it
 * is a floor on a MOUSE too — a 32px row is one people miss on a laptop, not
 * only on a phone. Every row here is at least `ROW.tap`, which is 56.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const QUAD = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(QUAD.length + 1);

const filesIn = (dir) => {
  const at = join(QUAD, dir);
  if (!existsSync(at)) return [];
  const out = [];
  const walk = (path) => {
    for (const e of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name)) out.push(full);
    }
  };
  walk(at);
  return out;
};

/**
 * ⚠️ THE SHARED PACKAGE ONLY. An app assembling a one-off screen may place
 * something by hand; a COMPONENT everything is built from may not, because its
 * choice is repeated everywhere and its drift is the product's.
 */
const FILES = filesIn("design/src");
const SOURCE = "design/src/tokens/metrics.ts";

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* -------------------------------------------------------- one source only --- */

/**
 * ⚠️ PADDING AND GAP, NOT MARGIN AND WIDTH. Padding is a thing's own density and
 * gap is the rhythm between siblings — those are the two that must agree across
 * the system. A `w-16` on a quick action is a decision local to that component,
 * and forbidding it would make the rule unusable rather than strict.
 */
const SPACING = /\b(?:p|px|py|pt|pb|pl|pr|gap|gap-x|gap-y)-(?:\d+|\[[^\]]+\])/g;

let loose = 0;
for (const file of FILES) {
  const name = rel(file);
  if (name === SOURCE) continue;
  const src = strip(readFileSync(file, "utf8"));
  const found = new Set([...src.matchAll(SPACING)].map((m) => m[0]));
  /* ⚠️ `gap-1` and `gap-0.5` are INSIDE a component — the distance between a
     label and its own caption — rather than between components. They are the one
     scale a component legitimately owns, because nothing else can see them. */
  for (const one of found) {
    if (/^gap-(?:0\.5|1)$/.test(one)) continue;
    loose++;
    fail(`${name}: writes "${one}" itself.\n` +
         `       Every padding and gap comes from \`metrics.ts\`. One file picking its own\n` +
         `       is how a list ends up with three rhythms and no wrong line to point at.`);
  }
}
if (!loose) ok(`spacing: ${FILES.length - 1} component file(s), none picks its own padding or gap`);

/* ------------------------------------------------------------ the floor --- */

const metrics = readFileSync(join(QUAD, SOURCE), "utf8");
const tap = /tap:\s*"min-h-(\d+)"/.exec(metrics);
if (!tap) {
  fail(`${SOURCE}: no \`ROW.tap\` — the touch-target floor is what makes a row hittable.`);
} else if (Number(tap[1]) * 4 < 44) {
  fail(`${SOURCE}: ROW.tap is ${Number(tap[1]) * 4}px, under the 44px floor.\n` +
       `       Below it a control is measurably harder to hit — with a mouse as well as a thumb.`);
} else {
  ok(`target: a pressable row is at least ${Number(tap[1]) * 4}px`);
}

/**
 * ⚠️ EVERY PRESSABLE ROW CARRIES IT, and that is separate from the number being
 * right. A floor defined and applied to three of five rows is a floor that reads
 * as enforced and is not.
 */
const surfaces = strip(readFileSync(join(QUAD, "design/src/parts/surfaces.tsx"), "utf8"));
/* ⚠️ SPLIT ON THE DECLARATIONS, not a non-greedy match to the next `\n}` — that
   stops at the first brace at column zero, which is inside the first function.
   It reported "all 1 pressable rows" over eight of them, which is the exact
   false-green this file exists to refuse. */
const blocks = surfaces.split(/\nexport /).filter((b) => /^function \w*Row\b/.test(b));
const pressable = blocks
  .map((b) => [null, /^function (\w*Row)/.exec(b)[1], b])
  /* ⚠️ THE ROW ITSELF IS THE BUTTON, not a row that merely contains one. A field
     row holds a "Change" control and is not pressable as a row; demanding the
     floor of it would make the rule wrong rather than strict — and a rule that is
     wrong is one somebody waives. */
  .filter(([, , body]) => /return \(\s*\n?\s*<Button/.test(body));
const missing = pressable.filter(([, , body]) => !/ROW\.tap/.test(body)).map(([, name]) => name);
if (missing.length) {
  fail(`surfaces.tsx: ${missing.join(", ")} can be pressed and does not carry \`ROW.tap\`.`);
} else {
  ok(`rows: all ${pressable.length} pressable row(s) carry the floor`);
}

/**
 * ⚠️ AND CARRYING THE FLOOR IS NOT THE SAME AS HAVING IT, WHICH IS WHY THIS
 * CHECK EXISTS BESIDE THE ONE ABOVE. `.button` is `h-10 md:h-9` — a HARD 40px
 * that gets SHORTER on a desktop — so a row that set `min-h-16` on a span inside
 * the button was a 40px control with 68px of content hanging out of it. Every
 * list in the product was that, the rule above was green throughout, and the
 * only way anybody found out was measuring a rendered page.
 *
 * ⚠️ SO THE ROW MUST RELEASE THE LIBRARY'S HEIGHT AND ITS PADDING ON THE BUTTON
 * ITSELF. `ROW.free` drops `h-10`; `ROW.flush` drops the `px-4` that, added to
 * the card's own `p-4`, indented every row 32px past the separator meant to line
 * up with it. A string on the inner span reaches neither.
 */
const unfree = pressable
  .filter(([, , body]) => !/<Button[\s\S]*?ROW\.free[\s\S]*?ROW\.flush/.test(body))
  .map(([, name]) => name);
if (unfree.length) {
  fail(`surfaces.tsx: ${unfree.join(", ")} keeps the library's own height and padding.\n` +
       `       \`.button\` is h-10 md:h-9 px-4. Without \`ROW.free\` and \`ROW.flush\` ON THE\n` +
       `       BUTTON, the row renders 40px tall with its content overflowing, and the\n` +
       `       floor above is satisfied by a string that changes nothing.`);
} else {
  ok(`released: all ${pressable.length} row(s) drop the button's own height and gutter`);
}

/**
 * ⚠️ A ROW WITHOUT A GLYPH DECLARES SO, OR ITS SEPARATOR STARTS IN MIDAIR.
 * `Group` derives each rule's inset from the row below it and defaults to the
 * glyph column, which is right for most rows and wrong for exactly two kinds:
 * one that leads with a face (52px, not 36) and one that leads with nothing at
 * all (flush). Both shipped wrong — a list of people ruled at the glyph inset,
 * and a card of copyable fields ruled 36px in from labels that were flush
 * against the card.
 *
 * ⚠️ SO A ROW THAT RENDERS NO `<Lead>` MUST BE IN THE DECLARATION BLOCK. It is a
 * property rather than a name because the minifier renames functions — see
 * `surfaces.tsx` — and it is checked here because the default is silent: a new
 * row type gets the glyph inset and nobody finds out until somebody looks at a
 * render.
 */
const declared = new Set(
  [...surfaces.matchAll(/\((\w+) as Ruled\)\.lead\s*=/g)].map((m) => m[1]),
);
const leadless = blocks
  .map((b) => [/^function (\w*Row)/.exec(b)[1], b])
  .filter(([name, body]) => !/<Lead\b/.test(body) && !declared.has(name))
  .map(([name]) => name);
if (leadless.length) {
  fail(`surfaces.tsx: ${leadless.join(", ")} renders no <Lead> and declares no \`lead\`.\n` +
       `       Group will rule it at the glyph inset, so its separator starts 36px in\n` +
       `       from labels that are flush. Add \`(${leadless[0]} as Ruled).lead = "none"\`.`);
} else {
  ok(`insets: every row either leads with a glyph or says what it leads with`);
}

/**
 * ⚠️ AND THE PAGE RESERVES ROOM FOR ITS NAV. A sticky island floats over what
 * precedes it, so without this the last card of every screen is cropped under
 * the nav — which is what shipped, on both specimens, until somebody looked at a
 * photograph of it.
 */
const layout = readFileSync(join(QUAD, "design/src/frame/layout.tsx"), "utf8");
if (!/NAV_SPACE/.test(layout) || !/nav\?: React\.ReactNode/.test(layout)) {
  fail(`layout.tsx: \`Page\` does not reserve room for a nav.\n` +
       `       The island cannot do it: by the time it lays out, the content is sized.`);
} else {
  ok(`chrome: the page reserves room for its nav`);
}

console.log(bad
  ? `\nmetrics: ${bad} finding(s) — spacing nobody owns drifts, and drift is invisible per diff.`
  : `\nmetrics: one source for every measurement, and a floor under every control.`);
process.exit(bad ? 1 : 0);
