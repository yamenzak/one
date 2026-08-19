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
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const RAW = readFileSync(join(ENGINE, "runtime/src/operator.ts"), "utf8");
const operator = strip(RAW);
const serve = strip(readFileSync(join(ENGINE, "runtime/src/serve.ts"), "utf8"));

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

/* ------------------------------------------------------------------ wired --- */

/**
 * ⚠️ EVERY DEPENDENCY THE CONSOLE DECLARES IS ONE THE DEPLOYMENT SUPPLIES, AND
 * THE ONE IT FORGOT COST A DAY. `OperatorDeps` is optional almost throughout, on
 * purpose: a self-host with no account token, no shards and no catalogue is a
 * real deployment, and every screen degrades into a sentence saying what is not
 * wired instead of throwing. That is the right design and it is also the trap —
 * an omitted dependency is INDISTINGUISHABLE from a deployment that genuinely
 * has nothing, so the console reports an empty world with total confidence.
 *
 * `models` was left out. The catalogue screen drew "no models yet" and the AI
 * screen reported that no model answered any lane, on a deployment whose sync
 * had just written sixty-four rows into the very table the run path reads. Every
 * suite was green: the tests pass their own `models`, so the only caller that
 * omits it is the only one that is not a test.
 *
 * So the rule is the whole interface, not a list of the important ones — the
 * next field added is the next one that can be forgotten.
 */
{
  const index = readFileSync(join(ENGINE, "one/src/index.ts"), "utf8");

  /* The interface's own field names, so adding one extends the check by itself. */
  const shape = /export interface OperatorDeps \{([\s\S]*?)\n\}/.exec(RAW)?.[1] ?? "";
  const declared = [...strip(shape).matchAll(/^\s*readonly (\w+)\??:/gm)].map((m) => m[1]);

  /* ⚠️ The CALL, not the file. A name that happens to appear elsewhere in eight
     hundred lines of wiring is not this object being given a value. */
  const call = /\.\.\.operatorOps\(\{([\s\S]*?)\n      \}\),/.exec(index)?.[1] ?? "";
  const given = new Set([...strip(call).matchAll(/(?:^|[\s,{])(\w+)\s*[:,]/g)].map((m) => m[1]));

  if (declared.length < 8) {
    fail(`runtime/src/operator.ts: only ${declared.length} OperatorDeps field(s) parsed —\n` +
         `       the interface has changed shape, and a dependency the deployment\n` +
         `       never supplies would now pass unnoticed.`);
  } else if (!call) {
    fail(`one/src/index.ts: no operatorOps({…}) call found — the console is either\n` +
         `       unwired or wired somewhere this cannot see, and neither fails anywhere.`);
  } else {
    const missing = declared.filter((name) => !given.has(name));
    if (missing.length) {
      fail(`one/src/index.ts: operatorOps is not given ${missing.join(", ")}.\n` +
           `       Every one of these is optional and degrades into an empty answer, so\n` +
           `       the console reports a deployment with nothing in it — confidently,\n` +
           `       and identically to one that genuinely has nothing.`);
    } else {
      ok(`wired: the deployment supplies all ${declared.length} of the console's dependencies`);
    }
  }
}

/* ------------------------------------------------------------------ end --- */

console.log(`\noperator: one door, one allow-list, one switch.`);
if (bad) process.exit(1);
