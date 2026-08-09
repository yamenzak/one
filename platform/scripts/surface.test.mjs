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

/* ------------------------------------------------------------- 5. DATA --- */

/**
 * ⚠️ ERASURE IS DERIVED, AND IT HAS TO STAY THAT WAY. A hand-written delete list
 * drifts from the schema in silence: a table added without a matching line is
 * one a purge steps over forever while reporting success, because a purge
 * swallows delete errors by construction. Relocation reads the SAME declaration,
 * so this one check covers both — a table that cannot be forgotten cannot be
 * moved either.
 */
const relocate = readFileSync(join(ROOT, "runtime/src/relocate.ts"), "utf8");
if (!/tenantCascade\(modules\)/.test(relocate)) {
  fail(`runtime/src/relocate.ts: relocation no longer reads the erasure cascade.\n` +
       `       A separate table list would drift, and the symptom is a workspace that\n` +
       `       arrives in its new region with one table missing.`);
} else ok(`erasure derived: relocation and erasure read one declaration`);

/*
  ⚠️ THE FLIP IS SEPARATE FROM THE COPY, and deleting is separate from both.
  Deleting as part of a move makes the whole operation irreversible at its least
  tested moment; the source staying bootable is what turns a bad relocation into
  an inconvenience.
*/
if (/dropSourceCopy[\s\S]{0,600}?await to\.run|copyTenant[\s\S]{0,2000}?DELETE FROM/.test(relocate)) {
  fail(`runtime/src/relocate.ts: the copy deletes from the source.\n` +
       `       A move that cannot be abandoned halfway is one nobody can back out of.`);
}
if (!/export async function verifyTenant/.test(relocate)) {
  fail(`runtime/src/relocate.ts: there is no verification step.\n` +
       `       The directory write is the point of no return for every request after it.`);
}

/**
 * ⚠️ A DURABLE ACTOR MUST BE ABLE TO MOVE BEFORE IT MAY HOLD ANYTHING. Storage
 * cannot be relocated across jurisdictions and a jurisdiction-scoped namespace
 * mints different ids for the same name, so every class written before the rule
 * exists is one that has to be rewritten to obey it.
 */
if (!/interface Relocatable[\s\S]{0,300}?seal\(\)[\s\S]{0,200}?exportState\(\)[\s\S]{0,200}?importState\(/.test(relocate)) {
  fail(`runtime/src/relocate.ts: the \`Relocatable\` contract is incomplete.\n` +
       `       \`seal\` matters most: an actor holding a balance that is moved wrongly\n` +
       `       either mints value or destroys it, silently, on the money path.`);
}
const actorClasses = files.flatMap((f) => {
  const src = stripComments(readFileSync(f, "utf8"));
  return [...src.matchAll(/export class (\w+)[^{]*\{/g)].map((m) => ({ file: f, name: m[1], src }));
}).filter((c) => /DurableObject|Relocatable/.test(c.src));
for (const c of actorClasses) {
  for (const method of ["seal", "exportState", "importState"]) {
    if (new RegExp(`\\b${method}\\s*\\(`).test(c.src)) continue;
    fail(`${rel(c.file)}: class ${c.name} holds durable state and cannot ${method}.`);
  }
}
ok(`relocatable: ${actorClasses.length} durable class(es) checked`);

/*
  ⚠️ A BOUNDED SWEEP THAT DOES NOT SAY WHAT IT DROPPED reads as "covered
  everything". A list with a ceiling and no report is the same silence.
*/
const collectionOps = readFileSync(join(ROOT, "runtime/src/collection-ops.ts"), "utf8");
if (!/Math\.min\(input\.limit/.test(collectionOps)) {
  fail(`runtime/src/collection-ops.ts: the list has no ceiling.\n` +
       `       An unbounded list is one row count away from a response nothing can render,\n` +
       `       and the row count is the tenant's rather than anybody's decision.`);
} else ok(`no silent cap: the derived list is bounded`);

/*
  ⚠️ AND THE TENANT PREDICATE IS DERIVED, in one place. A hand-written list that
  forgets it returns every tenant's rows and looks completely ordinary — same
  shape, same code path, more results.
*/
if (!/function scopeClause/.test(collectionOps) || !/tenant_id = \?/.test(collectionOps)) {
  fail(`runtime/src/collection-ops.ts: the tenant predicate is no longer derived in one place.`);
}

/* -------------------------------------------------------------------------- */

if (bad) {
  console.error(`\n${bad} surface failure(s).`);
  process.exit(1);
}
console.log(`\nsurface: one registry, one dispatcher, one filter — and no provider's words on the wire.`);
