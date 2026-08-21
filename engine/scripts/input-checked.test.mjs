/**
 * WHAT AN OPERATION DECLARED ABOUT ITS INPUT IS ENFORCED AT THE DOOR.
 *
 * ⚠️ FOR SEVENTEEN STAGES IT WAS ENFORCED NOWHERE. `checkAll` was reached by
 * collection records and by settings, and by nothing else — so an operation's
 * `input` map was a declaration the tool catalogue, the OpenAPI document and
 * every generated form were written from, with nothing standing behind it. A
 * required field could be absent. A `max` of four hundred thousand characters
 * was advisory. A `day` could be any string in the world.
 *
 * ⚠️ AND THE SYMPTOM WAS NEVER A 400. A missing required field arrived at the
 * handler as `undefined`, went into a statement, and D1 answered
 * `D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'` — a 503
 * naming a value, raised from whichever bind happened to hold it, pointing at
 * neither the field nor the caller. That is how it was found: by making a real
 * request to a real worker, which no unit test in this repository does.
 *
 * ⚠️ THE GENERATED VERBS ARE THE ONE EXEMPTION, AND IT IS A REAL ONE. A create
 * demands every required field and an update must not — an edit that had to
 * resend a body in order to rename a note is not an edit — so `records.ts` owns
 * that difference, together with the vault rules a door cannot see. `Resolved`
 * carries `generated` for exactly this, and the guard checks the exemption is
 * still spelled that way rather than widened to something else.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/* ⚠️ The header above names every symbol this looks for, so comments are
   blanked before anything is matched. */
const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/^(\s*)\/\/.*$/gm, "$1");

const SERVE = join(ENGINE, "runtime/src/serve.ts");
const COMPOSE = join(ENGINE, "runtime/src/compose.ts");

for (const path of [SERVE, COMPOSE]) {
  if (!existsSync(path)) {
    fail(`input-checked: ${path.slice(ENGINE.length + 1)} does not exist — this guard names it.`);
  }
}

if (!bad) {
  const serve = strip(readFileSync(SERVE, "utf8"));
  const compose = strip(readFileSync(COMPOSE, "utf8"));

  /* ⚠️ THE CHECK ITSELF, AND IT IS ASKED FOR BY NAME. A door that validated
     something OTHER than the operation's own declaration would be checking a
     shape nothing else in the framework reads.

     ⚠️ SPELLED AS A LITERAL, because the guard REGISTRY quotes it — a check
     matched only by a regular expression is one the registry cannot name, and a
     registry that cannot name its assertion is a list. */
  const CALL = "checkAll(op.spec.input";
  const checks = serve.includes(CALL);
  if (!checks) {
    fail("input-checked: nothing in `serve.ts` checks `op.spec.input` against the input.\n"
      + "       An operation's declared input is what the tool catalogue, the OpenAPI\n"
      + "       document and every generated form are written from. Unenforced, a required\n"
      + "       field arrives as `undefined`, reaches a statement, and the caller is told\n"
      + "       `Type 'undefined' not supported` in a 503.");
  }

  /*
    ⚠️ AND IT HAPPENS BEFORE THE HANDLER, WHICH IS THE WHOLE OF IT. A check
    after the run is a check of what already happened.
  */
  const at = serve.indexOf(CALL);
  const runs = serve.search(/await\s+op\.run\(/);
  if (checks && runs >= 0 && at > runs) {
    fail("input-checked: the input is checked AFTER the handler ran.\n"
      + "       A refusal that arrives once the write has landed is not a refusal.");
  }

  /* ⚠️ THE EXEMPTION IS THE GENERATED VERBS AND NOTHING ELSE. Widened to, say,
     "reads", every list and read in the platform would go unchecked. */
  if (checks && !/!op\.generated/.test(serve)) {
    fail("input-checked: the check does not exempt the generated verbs by name.\n"
      + "       `records.ts` owns create-versus-update, so the door must skip exactly\n"
      + "       those and nothing else — `!op.generated`.");
  }
  if (!/generated:\s*true/.test(compose)) {
    fail("input-checked: `compose.ts` no longer marks the generated verbs.\n"
      + "       Without the mark the door cannot tell them apart, and `checkAll` would\n"
      + "       demand every required field of a partial update — so renaming a note\n"
      + "       would have to resend its body.");
  }

  /* ⚠️ AND THE REFUSAL NAMES THE FIELD. "Check the highlighted fields" with
     nothing highlighted is the shape this repository refuses one layer up. */
  if (checks && !/fields:\s*checked\.fields/.test(serve)) {
    fail("input-checked: the refusal does not carry the per-field messages.\n"
      + "       `Problem.fields` is what an edit sheet reads; without it the sentence\n"
      + "       lands over the form rather than under the input that caused it.");
  }
}

if (!bad) {
  ok("input-checked: every declared operation's input is checked at the door, before the handler");
  ok("input-checked: the generated verbs are exempt by name, and the refusal names the field");
}

console.log(bad
  ? `\ninput-checked: ${bad} finding(s) — a declaration with nothing behind it.`
  : "\ninput-checked: what an operation says about its input is true of what reaches it.");
process.exit(bad ? 1 : 0);
