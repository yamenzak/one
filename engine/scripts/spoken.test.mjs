/**
 * A WRITE THAT FAILS SAYS SO, AND THE FAILURE TO SAY SO IS INVISIBLE.
 *
 * @design every refused mutation reaches a person; none returns into silence.
 *
 * ⚠️ THIS IS THE FAULT THAT WAS REPORTED AS "THE SAVE BUTTON DOESN'T DO
 * ANYTHING", AND THAT IS EXACTLY WHAT IT LOOKED LIKE. Registering a product is
 * six uploads and a write; every one of them ended
 * `if (!got.ok) { setBusy(false); return; }`. The spinner stopped, the form
 * stayed as it was, and nothing anywhere said a photograph had been refused. A
 * person pressing the only button on a screen and getting the same screen back
 * has no way to tell a refusal from a dead control.
 *
 * ⚠️ AND IT PASSED EVERY OTHER CHECK IN THIS REPOSITORY. The types are right,
 * the `Problem` is handled — it is checked, which is what `ok` is for — and the
 * branch that drops it is one line that reads like caution. Eight more of them
 * were in the same file: an undo, a movement mid-worklist, closing a count,
 * minting labels before printing, an import, a supplier, and two scans that
 * resolved into a blank panel.
 *
 * ⚠️ WHAT IS CHECKED IS THE BRANCH, NOT THE INTENT. A `!x.ok` that returns,
 * breaks or falls through without the problem reaching `tell.failed`, `trouble`
 * or a `Problem`-shaped setter is a swallow. That is mechanical, and mechanical
 * is the only kind of check worth having here — whether the SENTENCE is good is
 * a person's judgement and this makes no attempt at it.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { appDirs } from "./lib/trees.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(ENGINE.length + 1);

/* ⚠️ Comments are prose and a guard that reads prose fires on documentation. */
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
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(full);
    }
  };
  walk(at);
  return out;
};

/**
 * ⚠️ THE BRANCH, TAKEN WHOLE, AND THE FIRST DRAFT DID NOT. It read the three
 * lines after the `if` and called anything else a swallow — which reported five
 * branches that handle the refusal perfectly, in `one-space`, because the
 * handling sits under an explanatory comment. Comments are blanked rather than
 * removed (so line numbers survive), so a well-documented branch pushed its own
 * fix out of the window: the guard was fooled by the exact thing that makes the
 * code good.
 *
 * ⚠️ SO A BRACED BRANCH IS READ TO ITS CLOSING BRACE and a bare one to the end
 * of its statement. That is more text than a window and is the right amount:
 * the question is whether the problem reaches anybody ANYWHERE in the branch,
 * not whether it does so in the first three lines.
 */
const REFUSED = /if\s*\(\s*!\s*([A-Za-z_$][\w$]*)\.ok\s*\)\s*/g;

/** ⚠️ From just after the `if (…)`, the branch and nothing after it. */
const branchAt = (src, from) => {
  if (src[from] !== "{") {
    /* A bare branch: one statement, to its semicolon or the line's end. */
    const end = src.indexOf(";", from);
    return src.slice(from, end === -1 ? from + 200 : end + 1);
  }
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (!depth) return src.slice(from, i + 1);
    }
  }
  return src.slice(from);
};

/**
 * ⚠️ WHAT COUNTS AS REACHING A PERSON. The announcement channel, the `Loaded`
 * trouble state a screen renders, or handing the whole `Problem` to something —
 * a setter, a callback, a thrown value. Anything else is the value being looked
 * at and dropped.
 */
const HEARD = /\btell\.failed\b|\btrouble\s*\(|\bproblem\b|\bfailed\s*\(|\bthrow\b/;

/**
 * ⚠️ AND RETURNING AN ANSWER IS PASSING IT ON, WHICH IS THE FOURTH DOOR AND THE
 * ONE THE FIRST DRAFT MISSED. `turnPushOn` answers `"refused"` — its caller is
 * what has a screen to say it on, and a function that reports its own outcome by
 * VALUE is doing exactly what it should. What is silent is a BARE `return`,
 * which ends the work and tells nobody: that is the whole distinction.
 */
const HANDED = /\breturn\s+[^;\s}][^;]*;/;

const FILES = [
  ...appDirs().flatMap((d) => filesIn(d)),
  ...filesIn("one-space/src"),
];

let swallowed = 0;
let checked = 0;
for (const file of FILES) {
  const src = strip(readFileSync(file, "utf8"));
  for (const hit of src.matchAll(REFUSED)) {
    const held = hit[1] ?? "";
    const after = branchAt(src, (hit.index ?? 0) + hit[0].length);
    checked++;
    if (HEARD.test(after) || HANDED.test(after)) continue;
    /*
      ⚠️ A GUARD THAT ONLY RE-ASKS IS NOT SILENT. `again()` and a refetch put the
      screen back into a state that will report for itself — the read's own
      `trouble` renders. This is about the branch that does neither.
    */
    if (/\.again\s*\(/.test(after)) continue;
    swallowed++;
    /* ⚠️ Counted from the match's own offset, so two identical branches in one
       file are two different line numbers rather than the same one twice. */
    const at = src.slice(0, hit.index ?? 0).split("\n").length;
    fail(`${rel(file)}${at > 0 ? `:${at}` : ""}: \`!${held}.ok\` returns without saying so.\n`
      + `       A refusal that reaches nobody is a control that appears to do nothing —\n`
      + `       hand the problem to \`tell.failed\`, to \`trouble()\`, or on to a caller.`);
  }
}
if (!swallowed) {
  ok(`spoken: ${checked} refusal branch(es) across ${FILES.length} file(s), every one reaches somebody`);
}

process.exit(bad ? 1 : 0);
