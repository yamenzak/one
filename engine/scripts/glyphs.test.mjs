/**
 * A MARK THAT HAS A CHARACTER IS NEVER DRAWN WITHOUT IT.
 *
 * ⚠️ AN ANIMATED BELL AND A STILL ONE ARE THE SAME PICTURE UNTIL SOMEBODY
 * TOUCHES THEM, which is what makes this worth a guard rather than a review
 * note. Two screens imported `BellRing` straight from lucide and drew a mark
 * that did nothing; every other bell in the product rang. Nothing was broken,
 * nothing looked wrong, and the inconsistency was only reachable by pressing.
 *
 * ⚠️ SO THE REGISTRY IS THE ONLY DOOR. `glyphOf` wraps every mark in `Glyph`,
 * which is what carries the character and the reduced-motion opt-outs — a
 * component importing an icon directly gets none of that, and gets it silently.
 *
 * ⚠️ AND EVERY MARK IN THE REGISTRY IS ACCOUNTED FOR. A name with no entry in
 * `LIVELY` is indistinguishable from one somebody forgot, so a mark that is
 * deliberately still has to say so in `STILL`. The count can only be argued
 * with in review, which is the point.
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

const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/^(\s*)\/\/.*$/gm, "$1");

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

/** ⚠️ The one file that may name an icon — it is the registry. */
const HOME = "design/src/frame/shell.tsx";
const SHELL = strip(readFileSync(join(ENGINE, HOME), "utf8"));

/* ------------------------------------------------------------------ named --- */

const between = (src, open, close) => {
  const at = src.indexOf(open);
  if (at < 0) return "";
  return src.slice(at, src.indexOf(close, at));
};

const GLYPHS = new Set(
  [...between(SHELL, "const GLYPHS:", "\n};").matchAll(/(?:^|[\s,{])"?([\w-]+)"?:\s*</g)]
    .map((m) => m[1]));
const LIVELY = new Set(
  [...between(SHELL, "export const LIVELY:", "\n};").matchAll(/"?([\w-]+)"?:\s*"/g)]
    .map((m) => m[1]));
/* ⚠️ It closes on its own line, so the terminator is `];` rather than `\n];` —
   the first version read to the next line-initial `];` in the file and reported
   nineteen still marks, which would have excused fourteen real omissions. */
const STILL = new Set(
  [...between(SHELL, "export const STILL:", "];").matchAll(/"([\w-]+)"/g)].map((m) => m[1]));

if (GLYPHS.size < 10) fail(`${HOME}: read ${GLYPHS.size} glyph(s) — this guard is parsing the wrong thing.`);

/* ----------------------------------------------------------- accounted for --- */

const orphans = [...GLYPHS].filter((n) => !LIVELY.has(n) && !STILL.has(n));
if (orphans.length) {
  fail(`${HOME}: ${orphans.length} mark(s) with no character and no exemption: ${orphans.join(", ")}.\n`
    + `       Give each one an entry in \`LIVELY\`, or name it in \`STILL\` on purpose.\n`
    + `       A mark that is merely missing from both reads exactly like one forgotten.`);
} else {
  ok(`every mark is animated or deliberately still (${LIVELY.size} lively, ${STILL.size} still)`);
}

/* ------------------------------------------------------- one door for icons --- */

/**
 * ⚠️ ONLY THE MARKS THAT HAVE A CHARACTER, and the narrowing is the rule rather
 * than a concession. A still mark drawn directly is the same picture as one
 * drawn through the registry — there is nothing to lose — so refusing it would
 * be a rule about imports rather than about what somebody sees. `Circle` is the
 * neutral fallback and `state.tsx` draws it itself, which is correct.
 *
 * ⚠️ AND IT IS DERIVED FROM THE MAP, not listed here. A list would stop covering
 * the icon added next week, which is the one somebody is in a hurry about — the
 * same failure this guard is about, one level up.
 */
const KNOWN = new Set();
for (const m of between(SHELL, "const GLYPHS:", "\n};").matchAll(/"?([\w-]+)"?:\s*<(\w+)\s?\/>/g)) {
  if (LIVELY.has(m[1])) KNOWN.add(m[2]);
}

let looked = 0;
let stolen = 0;
for (const file of [...filesIn("design/src"), ...filesIn("one-space/src"), ...filesIn("apps")]) {
  if (rel(file) === HOME || /\.test\.tsx?$/.test(file)) continue;
  looked++;
  const src = strip(readFileSync(file, "utf8"));
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*"lucide-react"/g)) {
    for (const one of m[1].split(",")) {
      const name = one.trim().split(/\s+as\s+/)[0];
      if (!KNOWN.has(name)) continue;
      stolen++;
      const line = src.slice(0, m.index).split("\n").length;
      fail(`${rel(file)}:${line} imports \`${name}\` straight from lucide.\n`
        + `       The registry already draws it, so this is the same picture without\n`
        + `       the character or the reduced-motion opt-outs — and the difference\n`
        + `       is only visible to somebody who presses it. Use \`glyphOf\`.`);
    }
  }
}
if (!stolen) ok(`no screen draws a registered mark itself (${looked} files, ${KNOWN.size} registered icons)`);

process.exit(bad ? 1 : 0);
