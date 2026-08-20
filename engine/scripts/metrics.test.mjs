/**
 * ONE FILE HOLDS EVERY MEASUREMENT, AND NOTHING ELSE WRITES ONE.
 *
 * @design one source for every measurement: no screen picks its own padding, gap or tap target, and a pressable row has a floor under it.
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
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(ENGINE.length + 1);

const filesIn = (dir) => {
  const at = join(ENGINE, dir);
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
    /* ⚠️ A ZERO REMOVES A RHYTHM RATHER THAN PICKING ONE, and both in the tree
       cancel a HeroUI default the design does not want: `.card__content` ships
       `gap-1`, so four pixels sat between every row on top of the spacing that
       already said where one ended, and a contentless badge is padded for a
       digit it does not contain. There is no scale to disagree with here — the
       library's own number is what is being switched off. */
    if (/^(?:p|px|py|pt|pb|pl|pr|gap|gap-x|gap-y)-0$/.test(one)) continue;
    loose++;
    fail(`${name}: writes "${one}" itself.\n` +
         `       Every padding and gap comes from \`metrics.ts\`. One file picking its own\n` +
         `       is how a list ends up with three rhythms and no wrong line to point at.`);
  }
}
if (!loose) ok(`spacing: ${FILES.length - 1} component file(s), none picks its own padding or gap`);

/* ------------------------------------------------------------ the floor --- */

const metrics = readFileSync(join(ENGINE, SOURCE), "utf8");
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
const surfaces = strip(readFileSync(join(ENGINE, "design/src/parts/surfaces.tsx"), "utf8"));
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

/*
 * ⚠️ THE `insets:` CHECK WAS HERE AND IS DELETED, BECAUSE THE RULE IT PROTECTED
 * IS GONE. It made every row declare where its separator should start, so a
 * leadless row was not ruled at the glyph column — and separators were removed
 * from cards entirely (`surfaces.tsx`: a row is 24px from its neighbour and 4px
 * from its own second line, and the ratio already says what the line said). The
 * `Ruled` type it named does not exist in the tree.
 *
 * ⚠️ A CHECK WHOSE PREMISE DIED IS SATISFIED BY WRITING DEAD CODE. Its remedy
 * asked for `(FieldRow as Ruled).lead = "none"` — a property nothing reads, on a
 * type nothing declares, added only to make a guard stop talking. That is worse
 * than the finding: deleting a check is visible in a diff, and a line of
 * ceremonial code is not.
 */

/**
 * ⚠️ AND THE PAGE RESERVES ROOM FOR ITS NAV. A sticky island floats over what
 * precedes it, so without this the last card of every screen is cropped under
 * the nav — which is what shipped, on both specimens, until somebody looked at a
 * photograph of it.
 */
const layout = readFileSync(join(ENGINE, "design/src/frame/page.tsx"), "utf8");
if (!/NAV_SPACE/.test(layout) || !/nav\?: React\.ReactNode/.test(layout)) {
  fail(`layout.tsx: \`Page\` does not reserve room for a nav.\n` +
       `       The island cannot do it: by the time it lays out, the content is sized.`);
} else {
  ok(`chrome: the page reserves room for its nav`);
}

/**
 * ⚠️ ONE PADDER FOR THE PAGE GUTTER, AND IT IS `Band`. Three things applied it —
 * the shell's `main`, the band, and HeroUI's tab panel — so measured at 390px a
 * card sat 40px from the edge on the settings screen and 16px on the list beside
 * it. Nothing failed and no test knew: the screens simply did not line up with
 * each other, which is a fault nobody can point at and everybody feels.
 */
const shellSrc = readFileSync(join(ENGINE, "design/src/frame/shell.tsx"), "utf8");
const main = /<main\s+className=\{?["`]([^"`]*)["`]/.exec(shellSrc)?.[1] ?? null;
if (main === null) {
  fail(`shell.tsx: cannot find the <main> element, so the guard is blind to what pads it.`);
} else if (/\b(p|px|py|ps|pe|pl|pr)-\d/.test(main) || /\bPAD\b/.test(main)) {
  fail(`shell.tsx: the <main> pads the page, and \`Band\` already does.\n` +
       `       Two gutters is a card 32px from the edge on one screen and 16 on the next.`);
} else {
  ok(`gutter: the page is padded by \`Band\` and nothing else`);
}

/*
  ⚠️ AND A SNAPPING SCROLLER NEEDS THE GUTTER TWICE. `snap-start` aligns an item
  to the scroller's BORDER edge, so a rail with padding and no SCROLL padding is
  scrolled left by exactly the gutter and its first card lands flush against the
  screen — measured as `scrollLeft: 16` on a rail padded 16. It hid behind the
  double gutter for as long as that existed, because the card ate one of the two.
*/
const arrange = readFileSync(join(ENGINE, "design/src/parts/arrange.tsx"), "utf8");
/* ⚠️ To the NEXT export, not to the first `}` on its own line — that one is
   inside the JSX, so the extract stopped before the class list and the check
   passed on a rail with no scroll padding at all. */
const rail = /export function Rail[\s\S]*?(?=\nexport |\n\/\*\*)/.exec(arrange)?.[0] ?? "";
if (/snap-x/.test(rail) && !/SCROLL_GUTTER/.test(rail)) {
  fail(`arrange.tsx: \`Rail\` snaps and pads but sets no scroll padding.\n` +
       `       The browser scrolls the first card out by the gutter, flush to the screen edge.`);
} else {
  ok(`rail: a snapping scroller keeps its gutter when it snaps`);
}

/* -------------------------------------------------------------- the inset --- */

/**
 * ⚠️ A CARD'S END CAP MUST EQUAL THE GAP BETWEEN ITS ROWS, AND IT IS ARITHMETIC
 * RATHER THAN TASTE. Two adjacent rows put `2 × ROW.pad` between their texts;
 * the card's own padding plus one row's is what sits at each end. Equal, and a
 * list has one rhythm from its first line to its last.
 *
 * ⚠️ AND ZERO IS THE FAILURE THIS EXISTS TO CATCH. `py-0` was correct for a card
 * whose every child is a row and silently wrong for the three screens holding a
 * paragraph or a picker — measured at 1–2px of clearance from a 24px corner
 * radius, so the text ran into the curve. A padding that is right for one kind
 * of child is wrong on the first screen with another, and nothing about that
 * shows up in a diff, a type or a render test.
 */
const TOKENS = readFileSync(join(ENGINE, "design/src/tokens/metrics.ts"), "utf8");
const four = (cls) => Number(cls) * 4;

const cardPad = /export const CARD_ROWS = "([^"]+)"/.exec(TOKENS)?.[1] ?? "";
const rowPad = /^\s*pad: "py-(\d+)"/m.exec(TOKENS)?.[1];
const cardY = /\bpy-(\d+)\b/.exec(cardPad)?.[1];
const cardX = /\bpx?-(\d+)\b/.exec(cardPad)?.[1];

if (rowPad === undefined || cardY === undefined || cardX === undefined) {
  fail(`metrics.ts: cannot read the card's inset or the row's — the guard is blind.\n` +
       `       \`CARD_ROWS\` must name both axes and \`ROW.pad\` a vertical one.`);
} else if (four(cardY) === 0 || four(cardX) === 0) {
  fail(`metrics.ts: \`CARD_ROWS\` is ${cardPad} — an axis with no inset at all.\n` +
       `       Content that is not a row then sits against the card's edge, inside a\n` +
       `       24px corner radius. Rows pad themselves; everything else does not.`);
} else if (four(cardY) !== four(rowPad)) {
  fail(`metrics.ts: the card caps at ${four(cardY)}px and its rows sit ${four(rowPad) * 2}px apart.\n` +
       `       The end cap is card + row = ${four(cardY) + four(rowPad)}px against ${four(rowPad) * 2}px between,\n` +
       `       so the first and last rows are spaced differently from every other.`);
} else {
  ok(`inset: a card caps at ${four(cardY) + four(rowPad)}px, the same as between its rows`);
}

/* -------------------------------------------------------------- the marker --- */

/**
 * ⚠️ A ROW SAYS IT IS ONE, OR THE CARD PADS IT TWICE. `CARD_OTHERS` gives a
 * row's inset to any child of a card that is not marked `data-row` — so a row
 * component that forgets the attribute gets its own `py-3` AND the card's, and
 * lands 24px inside a list where every neighbour is at 12. It is not a crash and
 * it is not a type error; it is one row in a list sitting lower than the rest,
 * which is exactly the kind of drift nobody can point at in a diff.
 *
 * ⚠️ AND IT IS COUNTED PER COMPONENT RATHER THAN IN TOTAL, because a total is a
 * number somebody keeps in step by editing the number.
 */
const SURFACES = readFileSync(join(ENGINE, "design/src/parts/surfaces.tsx"), "utf8");
const rows = [...SURFACES.matchAll(/export function (\w*Row)\(/g)].map((m) => m[1]);
const unmarked = rows.filter((name) => {
  const at = SURFACES.indexOf(`export function ${name}(`);
  const next = SURFACES.slice(at + 1).search(/\nexport (?:function|const|interface)/);
  const body = SURFACES.slice(at, next === -1 ? undefined : at + 1 + next);
  return !/\bdata-row\b/.test(body);
});

if (!rows.length) {
  fail(`surfaces.tsx: no row component found at all — the guard is blind.`);
} else if (unmarked.length) {
  fail(`surfaces.tsx: ${unmarked.join(", ")} render no \`data-row\`.\n` +
       `       A card gives its own inset to anything not marked as a row, so this one\n` +
       `       is padded twice and sits lower than every row beside it. Put the\n` +
       `       attribute on the OUTERMOST element — a marker inside the button matches\n` +
       `       nothing, because the selector reads a direct child of the card.`);
} else {
  ok(`marker: all ${rows.length} row component(s) tell the card they are one`);
}

console.log(bad
  ? `\nmetrics: ${bad} finding(s) — spacing nobody owns drifts, and drift is invisible per diff.`
  : `\nmetrics: one source for every measurement, and a floor under every control.`);
process.exit(bad ? 1 : 0);
