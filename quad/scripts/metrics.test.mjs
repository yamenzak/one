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
const FILES = filesIn("web/src");
const SOURCE = "web/src/metrics.ts";

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
const surfaces = strip(readFileSync(join(QUAD, "web/src/surfaces.tsx"), "utf8"));
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
 * ⚠️ AND THE PAGE RESERVES ROOM FOR ITS NAV. A sticky island floats over what
 * precedes it, so without this the last card of every screen is cropped under
 * the nav — which is what shipped, on both specimens, until somebody looked at a
 * photograph of it.
 */
const layout = readFileSync(join(QUAD, "web/src/layout.tsx"), "utf8");
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
