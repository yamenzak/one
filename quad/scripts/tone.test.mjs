/**
 * THE PRODUCT TALKS ONE WAY, AND A SCRIPT SAYS SO.
 *
 * ⚠️ A STYLE GUIDE NOBODY CAN RUN LASTS UNTIL THE FIRST HURRIED SCREEN. Every
 * rule applied here is `refuseCopy` in the kernel — the same function a screen
 * could call — run over the strings apps actually write: a collection's labels,
 * an operation's summary, a setting's help line, a notification's sentence, and
 * the copy props in the surface components.
 *
 * ⚠️ THE FAULTS IT CATCHES ARE MECHANICAL, ON PURPOSE. Whether a sentence is
 * GOOD is a person's judgement and this makes no attempt at it. What it catches
 * is the stuff that makes a product feel like it is apologising or padding —
 * "please", "simply", an exclamation mark, a caption with a full stop on it when
 * the four beside it have none. Nobody notices any single one; everybody notices
 * the result.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { refuseCopy } from "../kernel/src/tone.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const QUAD = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(QUAD.length + 1);

const filesIn = (dir, re = /\.tsx?$/) => {
  const at = join(QUAD, dir);
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

const SOURCES = [
  ...filesIn("web/src"),
  ...filesIn("one-hub/src"),
  ...readdirSync(join(QUAD, "apps"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) => filesIn(`apps/${e.name}/src`)),
];

/**
 * ⚠️ THE PROP NAME IS THE VOICE. A declaration is a literal a script can walk
 * (D8), so which rule applies to a string is decided by what it was called
 * rather than by guessing from its contents.
 */
const VOICE = {
  title: "title",
  /* ⚠️ A row label, not a screen title — see the `name` voice. */
  label: "name",
  summary: "under",
  under: "under",
  lead: "under",
  description: "under",
  /* ⚠️ A chart's accessible name — read aloud, never rendered. A description. */
  describes: "under",
  says: "empty",
};

/** ⚠️ Comments explain the rules, and would otherwise breach every one of them. */
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * ⚠️ THE RULES' OWN DEFINITIONS ARE EXEMPT, and nothing else is. `tone.ts` lists
 * the words it refuses; a checker that read its own banned-word list as a breach
 * would fail permanently and be deleted within the week.
 */
const EXEMPT = new Set(["kernel/src/tone.ts", "web/src/type.ts", "scripts/tone.test.mjs"]);

let checked = 0;
let found = 0;

for (const file of SOURCES) {
  const name = rel(file);
  if (EXEMPT.has(name)) continue;
  const src = strip(readFileSync(file, "utf8"));

  /* `label: "…"` in a declaration, and `label="…"` on a component. */
  const written = [
    ...src.matchAll(/\b(title|label|summary|under|lead|description|describes|says)\s*:\s*"([^"\\]{2,})"/g),
    ...src.matchAll(/\b(title|label|summary|under|lead|description|describes|says)\s*=\s*"([^"\\]{2,})"/g),
  ];

  for (const [, prop, text] of written) {
    /*
      ⚠️ A `title` INSIDE A PROBLEM IS A SENTENCE, AND THE SHAPE SAYS SO. Problem
      literals carry `retryable` and `status`; nothing else in the tree does, so
      this is a structural signal rather than a guess about the words.
    */
    const problemish = prop === "title"
      && /\bretryable\s*:/.test(src) && /\bstatus\s*:/.test(src);
    const voice = problemish ? "notice" : VOICE[prop];
    if (!voice) continue;
    checked++;
    for (const why of refuseCopy(voice, text)) {
      found++;
      fail(`${name}: ${prop} "${text}"\n       ${why.rule} — ${why.why}`);
    }
  }
}

if (!found) ok(`copy: ${checked} written string(s), all in one voice`);

/**
 * ⚠️ AND THE RULES THEMSELVES ARE PROVED, because a checker whose rules do not
 * fire is a green run that means nothing. These are the four faults the tone is
 * actually about; if any stops being caught, this says so before the tree does.
 */
const MUST_CATCH = [
  ["under", "Simply tap here to continue.", "padding"],
  ["under", "Hide amounts for all balances.", "punctuation"],
  ["action", "Submit", "vague"],
  ["empty", "0 results", "system-voice"],
];

let proved = 0;
for (const [voice, text, rule] of MUST_CATCH) {
  const refusals = refuseCopy(voice, text).map((r) => r.rule);
  if (!refusals.includes(rule)) {
    fail(`the "${rule}" rule no longer fires on ${JSON.stringify(text)}.\n` +
         `       A checker whose rules do not fire is a green run that means nothing.`);
  } else proved++;
}
if (proved === MUST_CATCH.length) ok(`rules: all ${proved} fire on the copy they exist to catch`);

console.log(bad
  ? `\ntone: ${bad} finding(s) — a product that sounds like several products.`
  : `\ntone: one voice, and the rules that keep it still bite.`);
process.exit(bad ? 1 : 0);
