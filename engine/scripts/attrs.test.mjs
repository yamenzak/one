/**
 * AN ATTRIBUTE NOTHING READS IS A DECISION THAT NEVER REACHES A SCREEN.
 *
 * ⚠️ THIS IS WRITTEN AFTER `data-tone`, WHICH WAS SET IN SEVEN PLACES AND STYLED
 * IN NONE. A job's last run, a wallet row's amount, a figure's good-or-bad, a
 * card, a page and a band all stamped it; no stylesheet in the product had a
 * rule for it and no script read it. Measured in a browser: `danger` and
 * `neutral` computed to the SAME colour — so the one screen whose entire job is
 * "did the nightly pass run" drew a failure in exactly the grey it drew a
 * success in, and every suite was green.
 *
 * ⚠️ IT IS INVISIBLE FROM BOTH ENDS, WHICH IS WHY IT NEEDS A GUARD. From the
 * component the attribute is right there in the markup and looks wired. From the
 * stylesheet there is simply nothing — an absent rule does not fail, it declines
 * to apply, and that is indistinguishable from a design nobody wanted.
 *
 * ⚠️ AND THERE ARE FOUR HONEST WAYS TO READ ONE. A CSS selector in a stylesheet
 * we ship, a Tailwind `data-[x=…]` variant on the element itself, a DOM query
 * (`closest`, `querySelector`, `getAttribute`, `matches`), or a stated exemption
 * with a reason. Anything else is an attribute that means nothing.
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

/** ⚠️ Blanked, so a reported line is the file's own. */
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/^(\s*)\/\/.*$/gm, "$1");

const FILES = [...filesIn("design/src"), ...filesIn("one-space/src"), ...filesIn("apps")]
  .filter((f) => !/\.test\.tsx?$/.test(f));

/**
 * ⚠️ THE ONES SOMEBODY ELSE READS, NAMED ONE BY ONE. `data-slot` and `data-rac`
 * are HeroUI's and react-aria's — we set them so their own stylesheets and
 * behaviours apply. `data-theme` is stamped on the document and read by the
 * library's whole palette. `data-scroll` is the library's dialogue contract.
 * Each is a reader outside this repository, which is the one case the checks
 * below cannot see.
 */
const THEIRS = new Set(["slot", "rac", "theme", "scroll", "testid"]);

const src = new Map(FILES.map((f) => [f, strip(readFileSync(f, "utf8"))]));

/* ------------------------------------------------------------------- set --- */

const set = new Map();
for (const [file, text] of src) {
  for (const m of text.matchAll(/\bdata-([a-z][a-z0-9-]*)\s*=/g)) {
    if (!set.has(m[1])) set.set(m[1], `${rel(file)}:${text.slice(0, m.index).split("\n").length}`);
  }
  /* ⚠️ AND THE SPREAD FORM TOO — `{...{ "data-x": v }}` is the same stamp
     wearing an object, and it is how `data-tone` reached a `Band`. */
  for (const m of text.matchAll(/["']data-([a-z][a-z0-9-]*)["']\s*:/g)) {
    if (!set.has(m[1])) set.set(m[1], `${rel(file)}:${text.slice(0, m.index).split("\n").length}`);
  }
}

if (set.size < 8) {
  fail(`design/src: read ${set.size} data attribute(s) — this guard is parsing the wrong thing.\n` +
       `       Every check below would pass over an empty list, which is a green run\n` +
       `       asserting nothing.`);
}

/* ------------------------------------------------------------------ read --- */

const ALL = [...src.values()].join("\n");

/**
 * ⚠️ "INSIDE A STRING" IS NOT A CHECK, AND TWO VERSIONS OF THIS LEARNED IT.
 * `["'][^"']*data-x[^"']*["']` spans newlines, so it matched the whole file;
 * bounding it to one line did not help either, because a JSX line reads
 * `` className={`…`} data-x={a ? "b" : "c"} `` — a backtick, the attribute, and
 * a quote. Both mutations passed against both. What makes it a READ is the DOM
 * API it is handed to, so that is what is matched.
 */
const QUERIES = "closest|querySelector|querySelectorAll|getAttribute|setAttribute|hasAttribute|matches";

const readsIt = (name) => {
  /* A selector in a stylesheet we ship, or in a `<style>` string. */
  if (ALL.includes(`[data-${name}`)) return "a selector";
  /* A Tailwind variant on the element itself. */
  if (new RegExp(`data-\\[${name}[=\\]]`).test(ALL)) return "a variant";
  /* A DOM query — `closest("[data-row]")`, `getAttribute("data-glyph")`. */
  if (new RegExp(`(?:${QUERIES})\\(\\s*["'\`][^"'\`\\n]*data-${name}\\b`).test(ALL)) return "a query";
  return null;
};

let loose = 0;
for (const [name, where] of [...set].sort()) {
  if (THEIRS.has(name)) continue;
  if (readsIt(name)) continue;
  loose++;
  fail(`${where} stamps \`data-${name}\` and nothing reads it.\n` +
       `       No selector, no \`data-[${name}=…]\` variant, no DOM query — so the\n` +
       `       attribute is in the markup and means nothing, which looks exactly\n` +
       `       like a decision somebody made. Give it a rule, read it, or take it out.`);
}

if (!loose && set.size >= 8) {
  ok(`attributes: ${set.size} stamped, every one of them read (${THEIRS.size} are the library's)`);
}

console.log(bad
  ? `\nattrs: ${bad} finding(s) — an attribute that reaches nothing.`
  : `\nattrs: everything the markup says, something reads.`);
process.exit(bad ? 1 : 0);
