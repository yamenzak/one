#!/usr/bin/env node
/**
 * THE SURFACE — three rules about how a capability is reached, each of which
 * fails by SUCCEEDING at something it should not.
 *
 *   1. REGISTRY   a route, tool or webhook that did not come from `operation()`.
 *                 A hand-registered handler is one the gate does not run for,
 *                 the tool filter cannot see, and the API document does not
 *                 mention — and it answers perfectly well.
 *   2. TOOL ⊆ ROUTE  a second catalogue anywhere. The whole safety argument for
 *                 the AI surface is that it is ONE registry filtered by the
 *                 caller; a parallel list kept in step by hand is how a product
 *                 ships an agent that can do more than the person driving it.
 *   3. PROBLEM    a failure that leaves the boundary as anything but a
 *                 `Problem`. A provider's prose carries model names, quota
 *                 internals, account identifiers and sometimes a slice of a
 *                 prompt — all written for us, none written for a customer.
 *
 * Dependency-free Node — these run before `pnpm install` in CI.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let bad = 0;
const fail = (m) => (console.error(`BAD  ${m}`), bad++);
const ok = (m) => console.log(`ok   ${m}`);

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
};
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
     .replace(/(^|[^:\w])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));

const packages = readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(ROOT, e.name, "src")))
  .map((e) => e.name);
const files = packages.flatMap((p) => walk(join(ROOT, p, "src")));
const rel = (f) => relative(ROOT, f);

/* --------------------------------------------------------- 1. REGISTRY --- */

/**
 * ⚠️ THE ROUTER IS BUILT FROM THE OPERATION REGISTRY, ONCE, in this one file.
 * Anything else that answers a path is a capability the gate did not run for.
 */
const ROUTER = "runtime/src/runtime.ts";

/** How a handler gets reached without going through `operation()`. */
const HAND_ROUTED = [
  [/\.(get|post|put|patch|delete|all)\s*\(\s*["'`]\//, "a hand-registered route"],
  [/addEventListener\s*\(\s*["'`]fetch/, "a bare fetch listener"],
  [/new\s+Router\b/, "a second router"],
];

let routed = 0;
for (const file of files) {
  const r = rel(file);
  const code = stripComments(readFileSync(file, "utf8"));
  code.split("\n").forEach((line, i) => {
    for (const [re, what] of HAND_ROUTED) {
      if (!re.test(line)) continue;
      routed++;
      fail(`${r}:${i + 1}: ${what}.\n` +
           `       Every path answers because an \`operation()\` declared it — a handler\n` +
           `       reached any other way skips the gate, is invisible to the tool filter,\n` +
           `       and appears in no API document. It also works perfectly.`);
    }
  });
}

/**
 * ⚠️ AND EXACTLY ONE FILE MAY DISPATCH. Two dispatch paths is how an agent ends
 * up able to do something a route cannot: the divergence is invisible until
 * somebody goes looking for it, because both halves pass their own tests.
 */
const dispatchers = files.filter((f) => /\bop\.handler\s*\(|\btarget\.handler\s*\(/.test(stripComments(readFileSync(f, "utf8"))));
if (dispatchers.length !== 1 || rel(dispatchers[0]) !== ROUTER) {
  fail(`dispatch: ${dispatchers.length} file(s) invoke a handler — ${dispatchers.map(rel).join(", ") || "none"}.\n` +
       `       Exactly one may, and it must be ${ROUTER}.`);
}
ok(`registry: ${files.length} source file(s), ${routed} hand-registered route(s), 1 dispatcher`);

/* ------------------------------------------------------ 2. TOOL ⊆ ROUTE --- */

const kernelSurface = readFileSync(join(ROOT, "kernel/src/surface.ts"), "utf8");
/*
  The equivalence is BEHAVIOURAL and is asserted by tests over the cross-product
  of operations and callers. What a script can check is the thing those tests
  cannot see: that the catalogue is still derived from one filter over one
  registry rather than from a list somebody began maintaining.
*/
if (!/export function toolsFor[\s\S]{0,400}?\.filter\(\(op\) => check\(op, caller\)\.allowed\)/.test(kernelSurface)) {
  fail(`kernel/src/surface.ts: \`toolsFor\` no longer filters the registry with \`check\`.\n` +
       `       The AI surface is safe BECAUSE it is the route surface masked by the caller.\n` +
       `       A separate list — however carefully maintained — removes the argument.`);
} else ok(`tool ⊆ route: one filter, over one registry`);

if (!/op\.tool !== false/.test(kernelSurface)) {
  fail(`kernel/src/surface.ts: exposure is no longer opt-out.\n` +
       `       An opt-IN list is one somebody forgets to extend, and the symptom is an\n` +
       `       assistant that mysteriously cannot do what the person in front of it can.`);
}

/* ---------------------------------------------------------- 3. PROBLEM --- */

/**
 * ⚠️ NOTHING MAY SERIALISE A CAUGHT ERROR INTO A RESPONSE. `String(e)`,
 * `e.message` and `JSON.stringify(e)` on a failure path are the three shapes
 * this takes, and every one of them is a disclosure nobody decided to make.
 */
const LEAKS = /(?:body|detail|title|message)\s*:\s*(?:String\(\s*e|e\.message|`\$\{\s*e)/;
let leaks = 0;
for (const file of files) {
  const code = stripComments(readFileSync(file, "utf8"));
  code.split("\n").forEach((line, i) => {
    if (!LEAKS.test(line)) return;
    leaks++;
    fail(`${rel(file)}:${i + 1}: a caught error is being put into a response.\n` +
         `       A provider's prose carries model names, quota internals, account ids and\n` +
         `       sometimes a slice of the prompt. It becomes \`platform.unavailable\` with a\n` +
         `       \`ref\`, and the raw text goes to the log where the ref can find it.`);
  });
}

/** Every declared code needs copy, or a client renders an empty box. */
const catalogues = files.filter((f) => /declareProblems\(\{|PLATFORM_PROBLEMS = declareProblems/.test(readFileSync(f, "utf8")));
let codeless = 0;
for (const file of catalogues) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/"([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)":\s*\{([^}]*)\}/g)) {
    if (/title:\s*"[^"]+"/.test(m[2])) continue;
    codeless++;
    fail(`${rel(file)}: "${m[1]}" is declared with no title — a code with no copy cannot ship.`);
  }
}

/*
  ⚠️ AND THE PLATFORM'S OWN CODES MUST BE PRESENT WHEREVER AN APP'S ARE. The gate
  and the resolver raise them on an operation's behalf, before its handler runs,
  so a catalogue that is only the app's turns a specific answer into a generic
  503 the first time one is raised.
*/
const router = readFileSync(join(ROOT, ROUTER), "utf8");
if (!/\{\s*\.\.\.app\.problems,\s*\.\.\.PLATFORM_PROBLEMS\s*\}/.test(router)) {
  fail(`${ROUTER}: the platform's problem catalogue is not merged last.\n` +
       `       Merged first, an app could redefine \`platform.forbidden\` as a 200; absent,\n` +
       `       a code the gate raises has no copy and answers 503 instead.`);
}
ok(`problem: ${catalogues.length} catalogue(s), ${leaks} leak(s), ${codeless} code(s) without copy`);

/* ------------------------------------------------------------ 4. PARSED --- */

/**
 * ⚠️ AN OPERATION'S INPUT IS A `Shape`, WHICH PARSES — never a cast that reads
 * like one. `{} as { _t?: … }` was the stage 0 stand-in and it is exactly the
 * shape of the mistake: it compiles, it documents the intent, and it checks
 * nothing at all.
 */
let unparsed = 0;
for (const file of files) {
  const code = stripComments(readFileSync(file, "utf8"));
  code.split("\n").forEach((line, i) => {
    if (!/^\s*(input|output):\s*\{\}\s+as\b/.test(line)) return;
    unparsed++;
    fail(`${rel(file)}:${i + 1}: an operation's input is asserted rather than parsed.\n` +
         `       A cast compiles and checks nothing. Declare a \`Shape\` — the input type is\n` +
         `       then INFERRED from it, so there is one declaration rather than two that drift.`);
  });
}
ok(`parsed: ${unparsed} operation(s) asserting their input`);

/* -------------------------------------------------------------------------- */

if (bad) {
  console.error(`\n${bad} surface failure(s).`);
  process.exit(1);
}
console.log(`\nsurface: one registry, one dispatcher, one filter — and no provider's words on the wire.`);
