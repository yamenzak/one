/**
 * THE INVENTORY IS THE ACCEPTANCE CONTRACT, SO IT IS CHECKED LIKE ONE.
 *
 * ⚠️ THE FAILURE THIS EXISTS FOR IS THE INVENTORY BECOMING A SCREEN LIST. That
 * is risk #1 in KOVA.md §7: the moment a capability is written as "the Progress
 * tab has four lenses", the rewrite is a port and every inconsistency the
 * platform exists to end comes back with it.
 *
 * It is a script rather than a paragraph because the paragraph already existed
 * and the author of it wrote three violations in the first sitting.
 */

import { join } from "node:path";
import { PERSONAS, STATUSES, counts, load } from "./capabilities.mjs";

/** Everything wrong with the registry, in one pass. */
export function problems(caps) {
  const out = [];
  const seen = new Set();
  for (const c of caps) {
    const at = c.id ?? "(no id)";
    if (!c.id) out.push(`an entry with no id`);
    else if (seen.has(c.id)) out.push(`${at}: declared twice`);
    seen.add(c.id);
    if (!PERSONAS.includes(c.persona)) out.push(`${at}: persona "${c.persona}" is not one of ${PERSONAS.join(", ")}`);
    if (!STATUSES.includes(c.status)) out.push(`${at}: status "${c.status}" is not one of ${STATUSES.join(", ")}`);
    if (!c.area) out.push(`${at}: names no area`);
    if (!c.outcome) out.push(`${at}: has no outcome`);
    /*
      ⚠️ AN OUTCOME IS A SENTENCE ABOUT A PERSON, NOT A NOUN PHRASE ABOUT A
      SCREEN. "The Progress tab" is an implementation and writing it down that
      way is how a rewrite becomes a port wearing different colours — so the
      check is crude on purpose: it refuses the vocabulary of interfaces.
    */
    for (const word of ["tab", "screen", "page", "modal", "sidebar", "endpoint", "button", "dropdown"]) {
      if (new RegExp(`\\b${word}s?\\b`, "i").test(c.outcome ?? "")) {
        out.push(`${at}: says "${word}" — an outcome describes what a person accomplishes, not where`);
      }
    }
    /*
      ⚠️ A DROPPED CAPABILITY CARRIES A REASON. A removal and an oversight look
      identical in a diff, and the difference is the whole point of writing the
      inventory before the code.
    */
    if (c.status === "dropped" && !c.why) out.push(`${at}: is dropped with no reason`);
  }
  return out;
}


const ROOT = join(import.meta.dirname, "..");
let failed = 0;
const ok = (m) => console.log(`ok   ${m}`);
const fail = (m) => { failed++; console.log(`BAD  ${m}`); };

const caps = load(ROOT);

/* ------------------------------------------------------------- the shape --- */

const wrong = problems(caps);
for (const p of wrong) fail(p);
if (!wrong.length) ok(`shape: ${caps.length} capability(s), every one an outcome with a persona and a status`);

/*
  ⚠️ A CONTRACT WITH NOTHING IN IT IS NOT A CONTRACT. An empty inventory would
  pass every other check here and would mean stage 8's acceptance test is
  "confirm nothing", which is the shape of a green run over a product nobody can
  use.
*/
if (caps.length < 50) fail(`inventory: ${caps.length} capability(s) — too few to be the whole of a two-month product`);
else ok(`coverage: ${caps.length} capability(s) across ${new Set(caps.map((c) => c.area)).size} area(s)`);

/*
  ⚠️ EVERY PERSONA IS SOMEBODY'S. A capability list that covers only staff is one
  written from the studio's side, and the client half is where most of the
  product's daily use actually is.
*/
const byPersona = new Map();
for (const c of caps) byPersona.set(c.persona, (byPersona.get(c.persona) ?? 0) + 1);
for (const who of ["owner", "trainer", "client", "operator"]) {
  if (!byPersona.get(who)) fail(`personas: nothing at all is declared for "${who}"`);
}
if (byPersona.get("client") < 20) fail(`personas: only ${byPersona.get("client")} client capability(s) — the client half is most of the daily use`);
else ok(`personas: ${[...byPersona].map(([k, v]) => `${k} ${v}`).join(", ")}`);

/* ---------------------------------------------------------- the progress --- */

const by = counts(caps);
ok(`progress: ${by.built ?? 0} built, ${by.old ?? 0} outstanding, ${by.dropped ?? 0} dropped on purpose`);

console.log(
  failed
    ? `\n${failed} inventory failure(s).`
    : `\ninventory: outcomes not screens, every persona represented, progress derived.`,
);
process.exit(failed ? 1 : 0);
