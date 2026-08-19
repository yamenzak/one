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

const SOURCES = [
  ...filesIn("design/src"),
  ...filesIn("one-space/src"),
  ...readdirSync(join(ENGINE, "apps"), { withFileTypes: true })
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
const EXEMPT = new Set(["kernel/src/tone.ts", "design/src/tokens/type.ts", "scripts/tone.test.mjs"]);

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

/* -------------------------------------------------------- the prose block --- */

/*
  ⚠️ THE ONE PLACE COPY HID FROM THIS CHECK: NOT A PROP, BUT CHILDREN. Every
  string above is `label="…"` or `under: "…"` — a `NoteRow`'s words are BETWEEN
  its tags, so the account-deletion card carried forty-five words in three
  sentences with nothing to catch it. A rule that only reads props is a rule
  with a hole exactly the shape of a paragraph.

  ⚠️ AND ONLY WHERE THE TEXT IS LITERAL. A block holding `{name}` is assembled
  at render and its length is not this file's to judge, so it is skipped rather
  than guessed at — a guard that scolds about an interpolation is one people
  learn to route around.
*/
/*
  ⚠️ AND THE OTHER PLACE IT HID: A ROW'S SECOND LINE WRITTEN AS AN ELEMENT. The
  props walk above reads `under="…"` and `under: "…"`; the moment a row needs a
  TONE on that line it becomes `under={(<span data-ink="warning">…</span>)}`, and
  the words are children again. Every warning line in the operator console is
  written that way, so the longest copy in the product was in the one voice with
  the tightest limit and nothing was reading it — thirty words under a heading on
  the gateway screen, which is what "a wall of text" was reported for.

  ⚠️ THE VOICE IS STILL `under`, BECAUSE THE SLOT DECIDES THE VOICE. A row's
  second line is a fact whatever element it is wrapped in (DESIGN.md §2), and
  letting the wrapper change the rule is how the rule comes to have an exception
  for exactly the rows that most need it.

  ⚠️ INTERPOLATIONS ARE SKIPPED, like the block below — a line assembled at render
  has a length this file cannot know.
*/
const UNDER_NODES = /\bunder=\{\s*\(?\s*<(?:span|small|p)\b[^>]*>([\s\S]*?)<\/(?:span|small|p)>/g;

for (const file of SOURCES) {
  const name = rel(file);
  if (EXEMPT.has(name)) continue;
  const src = strip(readFileSync(file, "utf8"));

  for (const [, inner] of src.matchAll(UNDER_NODES)) {
    if (/[{<]/.test(inner)) continue;
    const text = inner.replace(/\s+/g, " ").trim();
    if (text.length < 2) continue;
    checked++;
    for (const why of refuseCopy("under", text)) {
      found++;
      fail(`${name}: a row's second line "${text.slice(0, 56)}…"\n       ${why.rule} — ${why.why}`);
    }
  }
}

const BLOCKS = /<NoteRow[^>]*>([\s\S]*?)<\/NoteRow>/g;

for (const file of SOURCES) {
  const name = rel(file);
  if (EXEMPT.has(name)) continue;
  const src = strip(readFileSync(file, "utf8"));

  for (const [, inner] of src.matchAll(BLOCKS)) {
    if (/[{<]/.test(inner)) continue;
    const text = inner.replace(/\s+/g, " ").trim();
    if (text.length < 2) continue;
    checked++;
    for (const why of refuseCopy("body", text)) {
      found++;
      fail(`${name}: a card's paragraph "${text.slice(0, 56)}…"\n       ${why.rule} — ${why.why}`);
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
  /* ⚠️ The wall of text that had no rule to break — see the `body` voice. */
  ["body", "One. Two. Three sentences is one past what a card is read for.", "length"],
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
