/**
 * NOTHING FORMATS A VALUE FOR A PERSON EXCEPT THE ONE MODULE THAT KNOWS THEM.
 *
 * ⚠️ THE FAULT THIS CATCHES IS NOT UNTIDINESS, IT IS THE PRODUCT BEING WRONG
 * ABOUT A FACT. `toLocaleDateString("en-US")` in one screen and
 * `Intl.NumberFormat("en")` in another mean a reader in Berlin gets American
 * dates on some surfaces and German separators on none — and `08/09` names a
 * different day depending on which screen it is on. Neither the compiler nor a
 * test can see it, because both produce a perfectly good string.
 *
 * ⚠️ SO THE RULE IS STRUCTURAL: `@engine/kernel`'s `present.ts` is the only file
 * that may construct an `Intl` formatter or call a `toLocale*` method, and
 * everything else goes through `useShown`, the `said.tsx` elements or the `say*`
 * functions. A locale literal anywhere else is a reader somebody assumed.
 *
 * ⚠️ AND THE ISO SLICE IS BANNED TOO, which is the one that does not look like
 * formatting. `at.slice(0, 10)` reads as arbitrary string handling, it is
 * correct for a database key and wrong for a person — it is UTC, so it names the
 * wrong day for anybody east of Greenwich in the evening — and it got copied
 * into six screens exactly because it looks harmless.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

/** ⚠️ Comments name the shapes they ban, and each would otherwise be a breach. */
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const FILES = [
  ...filesIn("kernel/src"),
  ...filesIn("runtime/src"),
  ...filesIn("design/src"),
  ...filesIn("one-space/src"),
  ...filesIn("one/src"),
  ...filesIn("apps"),
].filter((f) => !/\.test\.tsx?$/.test(f));

/* ------------------------------------------------------------ the formatter --- */

/**
 * ⚠️ ONE FILE MAY BUILD A FORMATTER, AND THE LIST CAN ONLY SHRINK. `countries.ts`
 * is the one exemption and it is a different question: `DisplayNames` NAMES a
 * country rather than formatting a value, and it is handed the reader's own
 * locale rather than reaching for the browser's.
 */
const DEFINES = new Set([
  "kernel/src/present.ts",
  "one-space/src/countries.ts",
  /* ⚠️ `said.tsx` ASKS THE MACHINE WHAT IT IS, which is the opposite of
     formatting a value for it: `resolvedOptions().timeZone` is the one reading
     that has to come from the browser, and it is the input every `auto` above
     resolves against. */
  "design/src/parts/said.tsx",
]);

/** `new Intl.X(…)`, `Intl.X(…)`, and every `toLocale*` method. */
const FORMATS = /\bnew\s+Intl\.\w+|\bIntl\.[A-Z]\w*\s*\(|\.toLocale(?:String|DateString|TimeString)\s*\(/g;

let formatted = 0;
for (const file of FILES) {
  const name = rel(file);
  if (DEFINES.has(name)) continue;
  const src = strip(readFileSync(file, "utf8"));
  for (const [whole] of src.matchAll(FORMATS)) {
    formatted++;
    fail(`${name}: formats a value itself — \`${whole.trim()}\` (D7).\n` +
         `       That is a reader somebody assumed. Take the person's own conventions:\n` +
         `       \`useShown()\` and the \`say*\` functions, or an element from \`said.tsx\`.`);
  }
}
if (!formatted) ok(`formatters: ${FILES.length} file(s), one place builds an \`Intl\``);

/* ------------------------------------------------------------- the ISO slice --- */

/**
 * ⚠️ `dayOf` IS THE DATABASE'S ANSWER AND `dayIn` IS THE PERSON'S, and the
 * difference is a whole day. Slicing an instant takes the UTC date, so an event
 * at 23:30 in Berlin is filed under yesterday for the person who was there. The
 * slice is legitimate inside the two functions that define the split.
 */
/*
  ⚠️ ONLY WHERE THE RECEIVER IS A MOMENT. `rows.slice(0, 10)` is the first ten
  rows of a list and has nothing to do with dates — a check that flagged it would
  be one people learn to ignore, which is worse than no check. The names are the
  ones this codebase actually uses for an instant.
*/
const SLICED = /(?:toISOString\(\)|\b\w*(?:at|At|Until|After|Since|On)\b)\.slice\(\s*0\s*,\s*10\s*\)/g;
const SLICE_OK = new Set([
  "kernel/src/primitives.ts",
  "kernel/src/present.ts",
]);

let sliced = 0;
for (const file of FILES) {
  const name = rel(file);
  if (SLICE_OK.has(name)) continue;
  const src = strip(readFileSync(file, "utf8"));
  for (const [] of src.matchAll(SLICED)) {
    sliced++;
    fail(`${name}: slices an instant into a day (D7).\n` +
         `       \`slice(0, 10)\` is UTC, so it names the wrong day for anybody whose\n` +
         `       evening is another date. \`dayOf\` for a key, \`dayIn\`/\`useDay\` for a\n` +
         `       person, \`<Dated>\` to show one.`);
  }
}
if (!sliced) ok(`slices: no instant is cut into a day by hand`);

/* ---------------------------------------------------------------- the reader --- */

/**
 * ⚠️ A LOCALE LITERAL IS THE SAME BUG WEARING A STRING. `"en-US"` passed to
 * anything is a reader chosen for everybody by whoever wrote the line, and it is
 * how `1,234.56` came to be hardcoded across a product sold in Europe. Region
 * codes and language tags are DATA — from a preference, from the account, from
 * the machine — never a constant in a component.
 */
const LOCALES = /["'](?:en|de|fr|es|it|nl|pt|ja|zh|ar)-[A-Z]{2}["']/g;
const LOCALE_OK = new Set([
  "kernel/src/present.ts",
  /* ⚠️ THE ONE HONEST USE: `en-CA` renders `YYYY-MM-DD`, which is a FORMAT
     rather than a preference — it is how a sortable day key is produced. It is
     named here so the exemption is a decision rather than a silence. */
]);

let pinned = 0;
for (const file of FILES) {
  const name = rel(file);
  if (LOCALE_OK.has(name)) continue;
  const src = strip(readFileSync(file, "utf8"));
  for (const [whole] of src.matchAll(LOCALES)) {
    pinned++;
    fail(`${name}: pins a locale — ${whole} (D7).\n` +
         `       A reader is a preference resolved at render, never a constant.\n` +
         `       See \`Presentation\` and \`shownAs\`.`);
  }
}
if (!pinned) ok(`readers: no surface chooses a locale on somebody's behalf`);

/* ------------------------------------------------------------- the raw date --- */

/**
 * ⚠️ A STORED DATE PRINTED STRAIGHT INTO A SCREEN IS THE ONE THIS GUARD KEPT
 * MISSING, and it is the commonest of the four. `Version {of.version}` rendered
 * `2026-08-01` on the legal sheet — no `Intl`, no `toLocale*`, no slice and no
 * locale literal, so every check above passed it. It is the database's spelling
 * of a day shown to somebody who told us how they write one, which is exactly
 * the fault this file exists to prevent, arriving through the one door that was
 * open: not formatting at all.
 *
 * ⚠️ SO THE RECEIVERS ARE DERIVED FROM THE KERNEL'S OWN DECLARATIONS. A hand-kept
 * list of date-shaped names is the shape that stops covering the field added next
 * week — and it already had: the ISO-slice check above lists `at|At|Until|After|
 * Since|On`, and a `Day` called `version` is none of them. Every `readonly x: Day`
 * and `readonly x: Instant` in `kernel/src` is a name whose value is a date, so
 * that is the list, and it grows by itself.
 */
const DATED = new Set();
for (const file of filesIn("kernel/src")) {
  for (const [, name] of readFileSync(file, "utf8")
    .matchAll(/readonly\s+(\w+)\??\s*:\s*(?:Day|Instant)\b/g)) DATED.add(name);
}
if (DATED.size < 5) {
  fail(`kernel/src: read ${DATED.size} date-shaped field(s) — this check is parsing the wrong thing.\n` +
       `       It would then pass over an empty list, which is a green run asserting nothing.`);
}

/**
 * ⚠️ TWO SHAPES, AND BOTH HAVE TO BE A MEMBER PATH. `{at}` on its own is as often
 * a loop index as a moment — `groups.map(([from, to], at)` is in this codebase —
 * and a check people learn to ignore is worse than no check. `{row.at}` is not
 * ambiguous.
 *
 * ⚠️ AND A TEMPLATE LITERAL COUNTS, because that is where the second one was:
 * `` foot={`${n.minutes} min · ${n.at}`} `` is a raw instant under a card's title
 * and looks like string building rather than like formatting.
 */
const CHILD = /([^=$\s])\s*\{\s*([A-Za-z_$][\w$]*(?:\??\.[\w$]+)+)\s*\}/g;
const TPL = /\$\{\s*([A-Za-z_$][\w$]*(?:\??\.[\w$]+)+)\s*\}/g;

let raw = 0;
for (const file of FILES.filter((f) => /\.tsx$/.test(f))) {
  const name = rel(file);
  /* ⚠️ BLANKED RATHER THAN CUT, so a reported line is the file's own — the
     stripper above collapses lines and every number after a comment is wrong. */
  const src = readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^(\s*)\/\/.*$/gm, "$1");
  const lines = src.split("\n");
  const found = (at, path, how) => {
    if (!DATED.has(path.split(".").pop())) return;
    const line = src.slice(0, at).split("\n").length;
    /* ⚠️ A KEY IS NOT SHOWN TO ANYBODY. `key={`${row.at}-${i}`}` is React's
       identity for a row and formatting it would be a bug of its own. */
    if (how === "a template" && /key=\{`/.test(lines[line - 1].slice(0, at - src.lastIndexOf("\n", at - 1) - 1))) return;
    raw++;
    fail(`${name}:${line} draws \`${path}\` into ${how} unformatted (D7).\n` +
         `       That is a \`Day\` or an \`Instant\` — the stored spelling of a date —\n` +
         `       shown to somebody who told us how they write one. \`sayDate\`/\`sayTime\`\n` +
         `       with \`useShown()\`, or \`<Dated>\`.`);
  };
  for (const m of src.matchAll(CHILD)) found(m.index, m[2], "a screen");
  for (const m of src.matchAll(TPL)) found(m.index, m[1], "a template");
}
/* ⚠️ NOT REPORTED AS A PASS WHEN THE LIST IS EMPTY. A run that says "no screen
   prints a stored date" over nought known names is the cheerful green this file
   already learned to distrust once. */
if (!raw && DATED.size >= 5) {
  ok(`dates: no screen prints a stored date as it is stored (${DATED.size} dated field name(s))`);
}

/* ------------------------------------------------------------------ the store --- */

/**
 * ⚠️ THE STORED VALUE IS CANONICAL, AND THAT IS THE OTHER HALF OF THE RULE.
 * Formatting correctly on the way out is worth nothing if the row holds
 * "whatever the person typed": a column of masses in mixed units needs a second
 * column saying which, and the day somebody forgets to read it a weight is out
 * by a factor of 2.2. `present.ts` names the base unit per measure; this asserts
 * the table is there to be read, so the promise is checkable rather than stated.
 */
const PRESENT = readFileSync(join(ENGINE, "kernel/src/present.ts"), "utf8");
const BASES = ["mass", "length", "distance", "volume", "temperature"];
const missing = BASES.filter((m) => !new RegExp(`${m}:\\s*"`).test(PRESENT));
if (missing.length) {
  fail(`present.ts: \`BASE\` names no unit for ${missing.join(", ")}.\n` +
       `       A measure with no declared base unit is a column whose contents\n` +
       `       nobody can interpret.`);
} else {
  ok(`store: ${BASES.length} measure(s), each with one declared base unit`);
}

console.log(bad
  ? `\npresent: ${bad} finding(s) — a value written for a reader nobody asked about.`
  : `\npresent: one formatter, one store, and every reader is the person reading.`);
process.exit(bad ? 1 : 0);
