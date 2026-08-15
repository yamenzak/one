/**
 * THE OPERATOR DOOR, AND THE SWITCH BEHIND IT (D18).
 *
 * ⚠️ THE CONSOLE'S TWO BOUNDS ARE STRUCTURAL BECAUSE BOTH FAIL SILENTLY OPEN.
 * An operation that loses `doors: ["operator"]` answers on every hostname —
 * including a workspace's own address, where any member can try it — and every
 * suite stays green because the suites drive the operator door. One that loses
 * its `isOperator` check admits anybody with a session, which looks exactly
 * like working software.
 *
 * ⚠️ AND MAINTENANCE MUST BE ASKED IN THE ONE OPERATION PATH. Asked in the HTTP
 * route instead, the agent door serves right through a closed deployment — the
 * D12 failure, invisibly, for agents only.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const QUAD = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const RAW = readFileSync(join(QUAD, "runtime/src/operator.ts"), "utf8");
const operator = strip(RAW);
const serve = strip(readFileSync(join(QUAD, "runtime/src/serve.ts"), "utf8"));

/* ------------------------------------------------------------------ door --- */

/**
 * ⚠️ EVERY OPERATOR OPERATION IS ON THE OPERATOR DOOR AND ASKS WHO IS THERE.
 * Both are per-operation, so the check is per-operation too: a new one added
 * without either is the one that ships open.
 */
const blocks = [...RAW.matchAll(/"(op\.[a-z.]+)":\s*\{([\s\S]*?)\n    \},/g)];
if (blocks.length < 5) {
  fail(`runtime/src/operator.ts: only ${blocks.length} operator operation(s) found — the\n` +
       `       parser or the console has changed shape, and an unchecked operation\n` +
       `       would now pass unnoticed.`);
} else {
  const open = blocks.filter(([, , body]) => !/doors:\s*\["operator"\]/.test(body));
  const unasked = blocks.filter(([, , body]) => !/operator\(ctx\)/.test(body));
  if (open.length) {
    fail(`runtime/src/operator.ts: ${open.map((b) => b[1]).join(", ")} answers on doors other\n` +
         `       than the operator's — the console is reachable at a workspace's own\n` +
         `       address, where any member can try it.`);
  } else if (unasked.length) {
    fail(`runtime/src/operator.ts: ${unasked.map((b) => b[1]).join(", ")} does not ask whether\n` +
         `       the caller is an operator — a session is enough, which looks exactly\n` +
         `       like working software.`);
  } else if (!/deps\.isOperator\(ctx\.email\)/.test(operator)) {
    fail(`runtime/src/operator.ts: who counts as an operator is no longer the\n` +
         `       DEPLOYMENT's injected answer — a role or a claim decides it now, and\n` +
         `       an operator stands outside every workspace where roles live.`);
  } else {
    ok(`door: all ${blocks.length} operator operations are on the operator door, and ask who is there`);
  }
}

/* ----------------------------------------------------------- maintenance --- */

if (!/maintenanceMode\(wiring\.directory\)/.test(serve)) {
  fail(`runtime/src/serve.ts: the one operation path no longer asks about\n` +
       `       maintenance — a closed deployment serves right through the agent door,\n` +
       `       and nothing anywhere says so.`);
} else if (!/care === "full" \|\| \(care === "readonly" && op\.kind === "write"\)/.test(serve)) {
  fail(`runtime/src/serve.ts: maintenance no longer distinguishes reading from\n` +
       `       writing — "readonly" either withholds the records people came to look\n` +
       `       at, or refuses nothing at all.`);
} else if (!/catch\s*\{[\s\S]{0,120}return "off"/.test(operator)) {
  fail(`runtime/src/operator.ts: the maintenance read no longer fails OPEN — a\n` +
       `       deployment that never provisioned the table now refuses every request\n` +
       `       over our own missing row.`);
} else {
  ok(`maintenance: asked once, in the one operation path, and it fails open`);
}

/* ------------------------------------------------------------------ end --- */

console.log(`\noperator: one door, one allow-list, one switch.`);
if (bad) process.exit(1);
