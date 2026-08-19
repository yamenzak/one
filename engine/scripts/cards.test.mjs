/**
 * A CARD IS ONE SHAPE, AND ONLY ONE FILE MAY BUILD ONE.
 *
 * ⚠️ THIS IS THE GUARD FOR A CLASS THAT HAS ALREADY COST THREE PASSES. The
 * library's `Card` is importable from anywhere and looks finished the moment it
 * is on screen — a rounded surface with the right colour — so a screen needing
 * "a box round this" reached for it directly. Eleven did. Each one then took the
 * library's own `p-4` instead of the product's inset, sat its text at a
 * different distance from the edge than the card above it, and got none of the
 * heading, the world, the foot slot or the non-row spacing that `Group` brings.
 * None of them looked broken on their own screen. All of them disagreed.
 *
 * ⚠️ AND THE FIRST SYMPTOM WAS NOT "THESE LOOK DIFFERENT", IT WAS TEXT AGAINST
 * THE EDGE — a card whose child brought no padding of its own, in a box that
 * only ever supplied a gutter. That is what a screen reports; the drift is what
 * it was. So the two checks below are the two halves: WHERE a card may be
 * built, and WHAT INSET it must name when it is.
 *
 * ⚠️ THE INSET CHECK IS THE ONE THAT WOULD HAVE CAUGHT THE PLACE TILE, which
 * lived in the allowed file and was still wrong: it named no inset at all, so it
 * took `p-4` from the library and the span inside it added another `p-4` on top.
 * Two box insets stacked inside one box, contents 32px from an edge every other
 * card holds at 16, and both paddings individually defensible — which is the
 * signature of drift and the reason a placement check alone is not enough.
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

/**
 * ⚠️ Every comment here names the shape it bans, and would each be a breach.
 *
 * ⚠️ AND IT BLANKS RATHER THAN DELETES, so the line numbers this guard prints
 * are the ones in the file. A stripper that removes a twenty-line header sends
 * whoever is fixing the finding twenty lines up from the code — which is a guard
 * that is right about the problem and wrong about where it is.
 */
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/^(\s*)\/\/.*$/gm, "$1");

/**
 * ⚠️ THE ONE FILE, AND IT IS NOT A LIST. A second entry would be the beginning
 * of the drift this exists to stop — the argument for it is always that one
 * screen is special, and every one of the eleven was.
 */
const HOME = "design/src/parts/surfaces.tsx";

const FILES = [
  ...filesIn("design/src"),
  ...filesIn("one-space/src"),
  ...filesIn("apps"),
].filter((f) => !/\.test\.tsx?$/.test(f));

/* ------------------------------------------------------------------ where --- */

/**
 * ⚠️ `<Card.Header>` AND FRIENDS COUNT. A file reaching for the sub-components
 * is assembling a card by hand even if it never types the parent — and a
 * `Card.Content` with no `Card` around it is not a thing anyone writes by
 * accident, so matching the whole family costs nothing and closes the obvious
 * way round the check.
 */
const BUILDS = /<Card(?![A-Za-z])/g;

let looked = 0;
for (const file of FILES) {
  if (rel(file) === HOME) continue;
  looked++;
  const src = strip(readFileSync(file, "utf8"));
  const hits = [...src.matchAll(BUILDS)];
  if (hits.length === 0) continue;
  const line = src.slice(0, hits[0].index).split("\n").length;
  fail(`${rel(file)}:${line} builds a Card (${hits.length}×).\n`
    + `       Use \`Group\` — heading, world, foot slot, and the product's inset.\n`
    + `       A centred panel is \`Sheet\`; a destination is \`Place\`.\n`
    + `       \`<Card>\` itself belongs to ${HOME} and nowhere else.`);
}
if (bad === 0) ok(`no Card built outside ${HOME} (${looked} files)`);

/* ------------------------------------------------------------------ inset --- */

/**
 * ⚠️ NAMED, NOT MERELY PRESENT. `p-4` happens to be the library's default, so a
 * card that spells it out and a card that says nothing render identically today
 * and diverge the day the library changes its mind. The token is the statement
 * that the number was chosen here.
 */
const HOME_SRC = strip(readFileSync(join(ENGINE, HOME), "utf8"));
const OPENERS = [...HOME_SRC.matchAll(/<Card(?![A-Za-z.])[^>]*>/g)];

if (OPENERS.length === 0) {
  fail(`${HOME} builds no Card at all — this guard is reading the wrong file.`);
} else {
  let bare = 0;
  for (const m of OPENERS) {
    if (m[0].includes("CARD_ROWS")) continue;
    bare++;
    const line = HOME_SRC.slice(0, m.index).split("\n").length;
    fail(`${HOME}:${line} builds a Card naming no inset.\n`
      + `       ${m[0].replace(/\s+/g, " ").slice(0, 72)}\n`
      + `       Every card carries \`CARD_ROWS\`, so its contents start at one\n`
      + `       distance from its edge whatever the card is for. Without it the\n`
      + `       library's \`p-4\` applies, and whatever is inside adds its own.`);
  }
  if (bare === 0) ok(`every Card in ${HOME} names CARD_ROWS (${OPENERS.length})`);
}

/* --------------------------------------------------- a row that leads nowhere --- */

/**
 * A ROW HANDED TO A SHEET AS ITS TRIGGER, WITHOUT SAYING SO.
 *
 * ⚠️ `NavRow` DRAWS A CHEVRON AND TAKES A PRESS ONLY WHEN IT LEADS SOMEWHERE.
 * That rule replaced a silent fault — a row with no destination rendered as a
 * button, took a press and did nothing, eight times across three screens — and
 * it leaves one case the component cannot see: a row used as a `Tray` or
 * `Confirm` trigger IS pressable, and react-aria supplies that press through
 * context rather than through a prop. Such a row says `opens`.
 *
 * ⚠️ AND THE NEW FAILURE IS LOUD RATHER THAN SILENT, which is the whole trade:
 * a trigger missing `opens` renders inert and the sheet does not open on the
 * first press anybody tries. This catches it before anybody has to.
 */
{
  const walk = (dir, out = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (e.name.endsWith(".tsx")) out.push(p);
    }
    return out;
  };

  let inert = 0;
  let triggers = 0;
  for (const file of walk(join(ENGINE, "one-space", "src"))) {
    const src = readFileSync(file, "utf8");
    /* ⚠️ A `trigger=` whose value contains a NavRow, however it is wrapped. */
    for (const m of src.matchAll(/trigger=\{[\s\S]{0,400}?\}\s*\n/g)) {
      if (!/<NavRow\b/.test(m[0])) continue;
      triggers++;
      if (/\bopens\b/.test(m[0])) continue;
      inert++;
      const line = src.slice(0, m.index).split("\n").length;
      fail(`${file.slice(ENGINE.length + 1)}:${line} passes a NavRow as a trigger without `
        + `\`opens\`.\n       It renders as a fact — no chevron, no press — so the sheet `
        + `never opens.`);
    }
  }
  if (!inert) ok(`triggers: ${triggers} row trigger(s), each saying it opens something`);
}

process.exit(bad ? 1 : 0);
