/**
 * THE AGENT DOOR IS THE SAME BUILDING (D13).
 *
 * ⚠️ AN MCP CALL IS AN OPERATION CALL WITH A DIFFERENT ENVELOPE. Everything
 * between the envelope and the handler — the replay, the seven gates, the audit
 * — must be `performOperation`, the one path the HTTP door also ends in (D12).
 * The moment the agent door runs a handler or applies a gate itself, it is a
 * second place every cross-cutting concern has to be remembered, and the first
 * forgotten one is invisible: no error, no failing test, a gate that silently
 * does not apply to agents.
 *
 * ⚠️ AND THE OPT-OUT MUST HOLD ON BOTH SIDES OF THE DOOR. `tool: { why }` marks
 * what a model must not reach — granting, spending, minting. Filtering the
 * LISTING but not the CALL ships a hidden-but-callable tool; a distinct refusal
 * for the CALL confirms the name to the model that was refused it. Both halves
 * are structural here because no runtime test can prove an absence for every
 * operation an app will ever declare.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const MCP = readFileSync(join(ENGINE, "runtime/src/mcp.ts"), "utf8");
const SERVE = readFileSync(join(ENGINE, "runtime/src/serve.ts"), "utf8");
const MEMBER_OPS = readFileSync(join(ENGINE, "runtime/src/member-ops.ts"), "utf8");
const mcp = strip(MCP);

/* ------------------------------------------------------------- one path --- */

/**
 * ⚠️ THE DOOR MAY PARSE AND WRAP, NEVER RUN. `performOperation` is required;
 * `.run(` and `check(` are the two ways to bypass it — running the handler
 * directly skips every gate, and calling the gate itself is a second copy of
 * the order that will drift from the kernel's.
 */
if (!/performOperation\(/.test(mcp)) {
  fail(`runtime/src/mcp.ts: does not call \`performOperation\` — the agent door has\n` +
       `       stopped ending in the one operation path, so the gates it applies are\n` +
       `       whatever it remembered to copy.`);
} else if (/\.run\(/.test(mcp)) {
  fail(`runtime/src/mcp.ts: calls \`.run(\` itself — a handler reached without the\n` +
       `       replay, the gates and the audit. Everything goes through \`performOperation\`.`);
} else if (/\bcheck\(/.test(mcp)) {
  fail(`runtime/src/mcp.ts: applies a gate itself — the kernel's order lives in one\n` +
       `       place, and a second copy is the one that drifts.`);
} else if (!/answerMcp\(/.test(strip(SERVE))) {
  fail(`runtime/src/serve.ts: no longer routes the agent door — \`/mcp\` answers as a\n` +
       `       404 and every client reads it as the feature not existing.`);
} else {
  ok(`path: the agent door parses and wraps; the one operation path runs`);
}

/* -------------------------------------------------------------- opt-outs --- */

/**
 * ⚠️ BOTH HALVES, AND THE SAME SENTENCE FOR BOTH ABSENCES. `toolFor` filters
 * the listing; `isTool` refuses the call; and the refusal for an opted-out
 * name must be the same "no such tool" an unknown name gets — anything
 * distinct confirms the name exists.
 */
const listingFiltered = /toolFor\(/.test(mcp);
const callFiltered = /isTool\(/.test(mcp);
const oneSentence = (MCP.match(/no such tool/g) ?? []).length === 1;
if (!listingFiltered) {
  fail(`runtime/src/mcp.ts: the listing no longer projects through \`toolFor\` — an\n` +
       `       opted-out operation is in the catalogue.`);
} else if (!callFiltered) {
  fail(`runtime/src/mcp.ts: the call no longer checks \`isTool\` — an opted-out\n` +
       `       operation is hidden from the list and still callable, which is worse.`);
} else if (!oneSentence) {
  fail(`runtime/src/mcp.ts: an opted-out tool and an unknown one no longer share one\n` +
       `       sentence — the distinct refusal confirms the name to the model.`);
} else {
  ok(`optout: hidden from the list, refused on the call, one sentence for both`);
}

/* --------------------------------------------------------------- listing --- */

/**
 * ⚠️ LISTED MEANS CALLABLE BY THIS CALLER — the navigation's own rule (D10). A
 * catalogue of tools the permission gate will refuse teaches an agent to try
 * them, and every attempt is an audit row for a call that was never going to
 * run.
 */
if (!/permissions\.has\(/.test(mcp) || !/PUBLIC/.test(mcp)) {
  fail(`runtime/src/mcp.ts: the listing no longer asks what the caller may call —\n` +
       `       every signed-in agent is shown every tool, including the refusals.`);
} else {
  ok(`listed: the catalogue is what this caller may actually call`);
}

/* ------------------------------------------------------- granting opt-out --- */

/**
 * ⚠️ THE ROSTER'S GRANTING OPERATIONS ARE THE KERNEL'S OWN CANONICAL OPT-OUT —
 * "a model that can invite somebody from a sentence in a document is a model
 * that can be asked to." They are generated, so no app review ever sees them;
 * this is the review.
 */
for (const id of ["member.invite", "member.role", "member.remove"]) {
  const at = MEMBER_OPS.indexOf(`"${id}"`);
  /* ⚠️ The block ends where the NEXT book entry begins (a key at four-space
     indent) — a blank line is not a boundary, because the bodies have them. */
  const next = MEMBER_OPS.indexOf(`\n    "`, at + 1);
  const block = at === -1 ? "" : MEMBER_OPS.slice(at, next === -1 ? undefined : next);
  if (at === -1) {
    fail(`runtime/src/member-ops.ts: no \`${id}\` to check — if the roster changed, update this list.`);
  } else if (!/why:/.test(block)) {
    fail(`runtime/src/member-ops.ts: \`${id}\` no longer opts out of the tool catalogue —\n` +
         `       a model can ${id === "member.invite" ? "grant access" : "change or take access"} from a sentence.`);
  }
}
if (!bad) ok(`granting: the roster's three granting operations are not tools`);

console.log(bad
  ? `\nagents: ${bad} finding(s) — the agent door has stopped being the same building.`
  : `\nagents: one path, opt-outs that hold, a catalogue that means callable.`);
process.exit(bad ? 1 : 0);
