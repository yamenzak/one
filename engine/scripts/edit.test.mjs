/**
 * ONE WAY TO CHANGE ONE FACT (D7).
 *
 * ⚠️ THE RULE IS EASY TO STATE AND INVISIBLE TO BREAK: outside a form, a
 * generic surface shows a value and a way to change it, never the control
 * itself. Dropping a `<Field>` into a row typechecks, renders, and looks
 * finished — and what ships is a column of live inputs where nothing says which
 * one is dirty, a stray tap on a phone edits a setting somebody was scrolling
 * past, and every control has to carry its own pending and failed state inline.
 * Nothing goes red. It is a grammar failure, so it needs a grammar check.
 *
 * ⚠️ AND THE SECOND HALF IS THE ONE THAT COSTS. A sheet that closes whatever
 * the server said throws away what somebody typed at the exact moment they need
 * it back, and reports the refusal in a toast that is gone before they look at
 * the control again. The lifecycle is written once, in `edit.tsx`, and this
 * asserts it is still the one written there.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const read = (p) => readFileSync(join(ENGINE, p), "utf8");

/* ------------------------------------------------------------------ inline --- */

/*
  ⚠️ THE TWO EXEMPTIONS ARE THE DEFINITION AND THE SHEET, and neither is a
  loophole: `field.tsx` IS the control, and `edit.tsx` is the one place a
  control is allowed to be — behind a deliberate press, in a tray, with a Save.
*/
const ALLOWED = new Set(["field.tsx", "edit.tsx"]);

const RENDERED = "design/src/rendered";
const strays = readdirSync(join(ENGINE, RENDERED))
  .filter((f) => f.endsWith(".tsx") && !ALLOWED.has(f))
  .filter((f) => /<Field\b/.test(read(join(RENDERED, f))));

if (strays.length) {
  fail(`inline: ${strays.join(", ")} render a control in a row. Show the value and an edit — see rendered/edit.tsx.`);
} else {
  ok(`inline: ${readdirSync(join(ENGINE, RENDERED)).filter((f) => f.endsWith(".tsx")).length} generic surface(s), none rendering a bare control`);
}

/*
  ⚠️ AND THE HUB IS HELD TO IT TOO, because it is the surface every workspace
  shares — its brand editor was four inline controls in one card, in two
  grammars, saving on a keystroke against a server that refuses a colour pair it
  cannot read. An APP may render a control: a form is the stated exception and an
  app is where forms live.
*/
const hubStrays = [];
/* ⚠️ COUNTED, BECAUSE A WALK THAT FINDS NOTHING AND A WALK THAT LOOKED AT
   NOTHING PRINT THE SAME SENTENCE — see `guards.test.mjs`. */
let walked = 0;
const walk = (dir) => {
  for (const entry of readdirSync(join(ENGINE, dir), { withFileTypes: true })) {
    const at = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(at);
    else if (entry.name.endsWith(".tsx")) {
      walked++;
      if (/<Field\b/.test(read(at))) hubStrays.push(at);
    }
  }
};
walk("one-space/src");

if (hubStrays.length) {
  fail(`hub: ${hubStrays.join(", ")} render a control in a row rather than a value and an edit.`);
} else {
  ok(`hub: ${walked} file(s) in the hub, every changeable fact a value and an edit`);
}

/* ------------------------------------------------------------------- sheet --- */

const edit = read("design/src/rendered/edit.tsx");

/*
  ⚠️ OPEN ON A REFUSAL, CLOSED ON A SAVE — asserted against the branch itself,
  because both halves look correct in isolation. A sheet that always closes
  passes any test of "does it save"; what it loses is the draft, and only when
  the server says no.
*/
if (/if \(said\) \{ setRefused\(said\); return; \}/.test(edit)
  && /onOpen\(false\)/.test(edit)) {
  ok("sheet: a refusal keeps the sheet and its draft; a save closes it");
} else {
  fail("sheet: edit.tsx no longer keeps the sheet open on a refusal — a refused change loses what was typed");
}

/*
  ⚠️ AGAINST THE FIELD, NOT IN A TOAST. A refusal about what somebody typed a
  second ago has to be readable while they fix it.
*/
if (/<Trouble/.test(edit)) {
  ok("sheet: the refusal renders against the field");
} else {
  fail("sheet: edit.tsx reports a refusal somewhere other than in the sheet, where it is gone before it is read");
}

/*
  ⚠️ AND THE DRAFT IS RESEEDED ON OPEN. Seeded once at mount, a sheet reopened
  after a save shows the value from before it — a stale draft that overwrites a
  good value the moment somebody presses Save without looking.
*/
if (/if \(open\) \{ setDraft\(value\); setRefused\(null\); \}/.test(edit)) {
  ok("sheet: the draft is what is stored, every time it opens");
} else {
  fail("sheet: edit.tsx no longer reseeds its draft on open — a reopened sheet offers to save a stale value");
}

/* ---------------------------------------------------------------- refusals --- */

/*
  ⚠️ THE SAVE HAS TO BE ABLE TO ANSWER. A `void` write cannot tell the sheet it
  was refused, so the sheet would close on a failure and the row would repaint
  with a value the server threw away.
*/
/*
  ⚠️ AND WHAT IT ANSWERS WITH IS A `Problem`, NOT A SENTENCE. A string is the
  server's refusal with everything but one line thrown away — the code, the
  detail, the tone, the retryability, the reference — and a sheet handed one then
  has to invent a `Problem` back to render it, which is how a code no catalogue
  has came to exist. `problem.test.mjs` refuses the invention; this refuses the
  narrowing that made it necessary.
*/
if (/export type Refusal = Problem \| null \| undefined \| void;/.test(edit)
  && /onSave: \(next: unknown\) => Refusal \| Promise<Refusal>/.test(edit)) {
  ok("refusals: a save answers with the refusal or with nothing");
} else {
  fail("refusals: edit.tsx's save no longer returns a refusal, so a failed change closes the sheet looking successful");
}

console.log(bad ? `\nedit: ${bad} problem(s).` : "\nedit: green.");
process.exit(bad ? 1 : 0);
