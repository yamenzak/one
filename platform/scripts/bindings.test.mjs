#!/usr/bin/env node
/**
 * THE CHOKEPOINTS — three rules about where data may be reached, each of which
 * produces no error at all when broken.
 *
 *   1. BINDING     a raw environment touched outside the one file that owns it.
 *                  The query succeeds, against the wrong database, and returns
 *                  somebody else's absence of rows.
 *   2. DIRECTORY   a column on the global directory outside the routing
 *                  allow-list. The store is global BECAUSE nothing residency
 *                  governs is in it; one convenient addition and every existing
 *                  claim about residency is false, with nothing failing.
 *   3. KV SPACE    a cache write outside the declared key space. A cache is
 *                  replicated to every point of presence on earth and has no
 *                  jurisdiction option, so a free-form key space is where a
 *                  tenant's data eventually lands.
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

/** Comments state invariants and name the very thing being refused. Strip them. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:\w])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}

const packages = readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(ROOT, e.name, "src")))
  .map((e) => e.name);
const files = packages.flatMap((p) => walk(join(ROOT, p, "src")));
const rel = (f) => relative(ROOT, f);

/* ---------------------------------------------------------- 1. BINDING --- */

/**
 * ⚠️ EXACTLY ONE FILE, NAMED HERE. Not a directory and not a package: the whole
 * value of a chokepoint is that widening it is a visible edit to this line.
 */
const BINDING_OWNER = "runtime/src/env.ts";

/**
 * How a raw store is reached: indexed off an environment, or through one of the
 * raw shapes.
 *
 * ⚠️ `env.js` and `"./env.js"` are module specifiers, not property accesses, and
 * the first version of this pattern flagged every import of the chokepoint
 * itself. A guard's first failures are its own — budget for it.
 */
const RAW = /\benv\[|\benv\.(?!js\b)[A-Za-z_$]|\bRaw(?:Sql|Objects|Cache|Actors|Inference|Queue)\b/;

let touched = 0;
for (const file of files) {
  const r = rel(file);
  if (r === BINDING_OWNER) continue;
  const src = readFileSync(file, "utf8");
  // Comments explain the rule and must not trip it. Code is what is scanned.
  stripComments(src).split("\n").forEach((line, i) => {
    if (!RAW.test(line)) return;
    /*
      `RawEnv` is the OPAQUE type — a bag whose values nothing can use without
      going through the resolver — so passing one around is the pipeline
      working, not a bypass. Reaching INTO it is the thing being refused.
    */
    if (/\bRawEnv\b/.test(line) && !/\benv\s*(?:\[|\.)/.test(line)) return;
    if (/binding-exempt:/.test(src.split("\n").slice(Math.max(0, i - 2), i + 1).join("\n"))) return;
    touched++;
    fail(`${r}:${i + 1}: reaches a raw binding outside ${BINDING_OWNER}.\n` +
         `       A query written against a raw store hits the wrong region the day a\n` +
         `       second one exists — and it succeeds, which is why nothing catches it.`);
  });
}
ok(`binding: ${files.length} source file(s), ${touched} outside ${BINDING_OWNER}`);

/* -------------------------------------------------------- 2. DIRECTORY --- */

const dirFile = join(ROOT, "runtime/src/directory.ts");
if (!existsSync(dirFile)) fail(`runtime/src/directory.ts is missing — the directory has no declared shape.`);
else {
  const src = readFileSync(dirFile, "utf8");
  const allow = /DIRECTORY_COLUMNS = \[([^\]]+)\]/.exec(src);
  const create = /CREATE TABLE IF NOT EXISTS tenant_directory \(([^;]+)\);/.exec(src);
  if (!allow || !create) fail(`runtime/src/directory.ts: could not read DIRECTORY_COLUMNS or the CREATE that must match it.`);
  else {
    const declared = [...allow[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).sort();
    const actual = create[1].split(",").map((c) => c.trim().split(/\s+/)[0]).sort();
    const extra = actual.filter((c) => !declared.includes(c));
    const missing = declared.filter((c) => !actual.includes(c));
    if (extra.length) {
      fail(`directory: column(s) ${extra.join(", ")} exist in the table and not in DIRECTORY_COLUMNS.\n` +
           `       ⚠️ Nothing about a PERSON may live here. This store is global precisely\n` +
           `       because nothing residency governs is in it — adding one field makes every\n` +
           `       residency claim false and nothing anywhere fails.`);
    }
    if (missing.length) fail(`directory: DIRECTORY_COLUMNS names ${missing.join(", ")}, which the table does not have.`);
    if (!extra.length && !missing.length) ok(`directory: ${declared.length} column(s), allow-list and table agree`);
  }
}

/* ---------------------------------------------------------- 3. KV SPACE --- */

const kernelBindings = readFileSync(join(ROOT, "kernel/src/bindings.ts"), "utf8");
const nsDecl = /export type CacheNamespace = ([^;]+);/.exec(kernelBindings);
if (!nsDecl) fail(`kernel/src/bindings.ts: CacheNamespace is not declared — the cache key space is unbounded.`);
else {
  const spaces = [...nsDecl[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
  if (!spaces.length) fail(`kernel/src/bindings.ts: CacheNamespace declares no spaces.`);
  /*
    ⚠️ THE METHODS MUST TAKE THE NAMESPACE, or the type is decoration. A
    `get(key: string)` beside the declared union is a free-form key space with a
    union nobody has to use.
  */
  const handle = /export interface CacheHandle \{([^}]+)\}/.exec(kernelBindings);
  if (!handle) fail(`kernel/src/bindings.ts: CacheHandle is not declared.`);
  else {
    const methods = [...handle[1].matchAll(/^\s*(\w+)\(([^)]*)\)/gm)];
    const loose = methods.filter(([, , params]) => !/ns:\s*CacheNamespace/.test(params));
    if (loose.length) {
      fail(`kernel/src/bindings.ts: CacheHandle.${loose.map(([, n]) => n).join(", ")} take no namespace.\n` +
           `       A globally replicated store with a free-form key space is one where a\n` +
           `       tenant's data eventually lands, and no residency claim survives it.`);
    } else ok(`kv space: ${spaces.length} declared namespace(s), every method takes one`);
  }
}

/* ------------------------------------------------------ 4. REACHABILITY --- */

/**
 * ⚠️ THE FAILURE THIS WHOLE PLATFORM WAS STARTED OVER: a capability that ships,
 * and an app that does not mount it. Here it should be unrepresentable — every
 * route comes from the operation registry — so what is left to check is the
 * schema side: a module an app composes but whose surface nothing serves, and a
 * module a surface needs that nothing composes.
 */
const appDirs = packages.filter((p) => existsSync(join(ROOT, p, "src", "worker.ts")));
let unreachable = 0;
for (const appDir of appDirs) {
  const worker = readFileSync(join(ROOT, appDir, "src", "worker.ts"), "utf8");
  const composed = new Set([...stripComments(worker).matchAll(/\b([A-Z][A-Z_]*_SCHEMA)\b/g)].map((m) => m[1]));

  /*
    Every schema the runtime's own operations read from. A module absent here is
    a table the platform will query and nobody created — which is not a missing
    feature, it is a 500 on the first request that touches it.
  */
  const REQUIRED = {
    IDENTITY_SCHEMA: "the accounts and credentials every sign-in reads",
    OTP_SCHEMA: "the sign-in codes the emailed lane writes",
    SESSION_SCHEMA: "the sessions every authenticated request validates",
    DIRECTORY_SCHEMA: "the tenant directory every request resolves through",
  };
  for (const [mod, why] of Object.entries(REQUIRED)) {
    if (composed.has(mod)) continue;
    unreachable++;
    fail(`${appDir}: mounts the platform runtime and never composes ${mod} — ${why}.\n` +
         `       A capability declared and unreachable is the failure this platform exists to end.`);
  }
}
ok(`reachable: ${appDirs.length} app(s), ${unreachable} module(s) declared and unreachable`);

/* -------------------------------------------------------------------------- */

if (bad) {
  console.error(`\n${bad} chokepoint failure(s).`);
  process.exit(1);
}
console.log(`\nchokepoints: one binding door, a directory that holds routing only, a bounded cache key space.`);
