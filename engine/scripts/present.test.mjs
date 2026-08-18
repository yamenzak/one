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
