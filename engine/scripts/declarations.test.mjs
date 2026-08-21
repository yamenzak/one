/**
 * A DECLARATION IS A LITERAL, AND A LIBRARY IS A DECISION (D8, D9).
 *
 * ⚠️ BOTH OF THESE ARE ABOUT HOW CODE IS WRITTEN RATHER THAN WHAT IT DOES, WHICH
 * IS EXACTLY THE KIND THAT ERODES. Nothing fails when a declaration starts
 * hiding its data in a closure, or when a package arrives that quietly owns one
 * of our rules — the tests still pass, because the behaviour is still right on
 * the day it is written. What goes is the ability to ASK the declarations
 * anything, and every generated surface in this framework is a question asked of
 * them.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(ENGINE.length + 1);

const sourcesIn = (pkg) => {
  const dir = join(ENGINE, pkg, "src");
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = (at) => {
    for (const e of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, e.name);
      if (e.isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(path);
    }
  };
  walk(dir);
  return out;
};

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PACKAGES = ["kernel", "runtime", "design"];
const everySource = () => PACKAGES.flatMap(sourcesIn);

/* ------------------------------------------------------------ decorators --- */

/**
 * ⚠️ NO DECORATORS (D8). They were considered and rejected: a decorator runs, so
 * what it declares exists only once the module has been evaluated and only in
 * the shape the decorator chose to keep. Every guard here WALKS the
 * declarations, and a guard cannot walk something that has to be executed first.
 */
/* ⚠️ TEMPLATE LITERALS ARE STRIPPED FIRST, because CSS lives in them and `@media`
   is not a decorator. A guard whose first finding is its own false positive is a
   guard whose next real finding gets waived. */
const stripTemplates = (s) => s.replace(/`(?:[^`\\]|\\.)*`/gs, "``");

let decorated = 0;
for (const file of everySource()) {
  const code = stripTemplates(stripComments(readFileSync(file, "utf8")));
  for (const m of code.matchAll(/^[ \t]*@[A-Za-z_$][\w$]*\s*[({\n]/gm)) {
    decorated++;
    fail(`${rel(file)}: a decorator (${m[0].trim()}) — declarations are literals (D8).\n` +
         `       A decorator has to RUN before it declares anything, so nothing can walk it.`);
  }
}
if (!decorated) ok("decorators: none in the shared tree");

/* --------------------------------------------------------------- builders --- */

/**
 * ⚠️ A DECLARATION BUILDER RETURNS ITS ARGUMENT UNCHANGED. `collection(spec)`
 * exists for autocomplete and for refusing a bad shape at the keyboard — the
 * moment it starts computing, normalising or defaulting, the literal in the app
 * stops being the thing the framework reads, and two sources of truth exist for
 * every question asked of it.
 *
 * Found by shape rather than by a list, so a builder added tomorrow is checked
 * the day it is written: any exported `const <name> = (<arg>: T): T => …` where
 * `T` is a declared shape. ⚠️ The capital is load-bearing — `verbOf(id: string):
 * string` is a helper, not a builder, and reporting it would teach whoever meets
 * this guard first that its findings are noise.
 */
let builders = 0;
let computing = 0;
const BUILDER = /export const (\w+)\s*=\s*\((\w+):\s*(\w+)\)\s*:\s*(\w+)\s*=>\s*([^;]+);/g;
for (const file of sourcesIn("kernel")) {
  const code = stripComments(readFileSync(file, "utf8"));
  for (const m of code.matchAll(BUILDER)) {
    const [, name, arg, from, to, body] = m;
    if (from !== to || !/^[A-Z]/.test(from)) continue;
    builders++;
    if (body.trim() !== arg) {
      computing++;
      fail(`${rel(file)}: \`${name}\` takes a ${from} and returns something else (D8).\n` +
           `       A builder that computes makes the literal in the app stop being what the framework reads.`);
    }
  }
}
if (!computing) ok(`builders: ${builders} declaration builder(s), each returns its literal untouched`);

/* ------------------------------------------------------------ dependencies --- */

/**
 * ⚠️ A LIBRARY MAY ENCODE A DECISION THE WORLD ALREADY SETTLED; IT MAY NOT OWN
 * ONE OF OUR INVARIANTS (D9). Formatting a date, framing MIME, checking a shape
 * — take the library. The gate order, how entitlements resolve, who a
 * notification is for, what a reserve is: no library enforces those, so adopting
 * one means writing them anyway, on top of it.
 *
 * The kernel is where that line is guarded, because it is where the invariants
 * live. Each entry says what the library decides FOR us — an entry nobody can
 * write a reason for is the one that should not be there.
 */
const KERNEL_MAY_USE = {
  valibot: "what a well-formed value is, and how to say why it is not",
};

const deps = JSON.parse(readFileSync(join(ENGINE, "kernel/package.json"), "utf8")).dependencies ?? {};
let unstated = 0;
for (const name of Object.keys(deps)) {
  if (!KERNEL_MAY_USE[name]) {
    unstated++;
    fail(`kernel/package.json: depends on "${name}", which nothing here says is a settled decision (D9).\n` +
         `       Add it to KERNEL_MAY_USE with what it decides for us, or keep the invariant ours.`);
  }
}
if (!unstated) ok(`libraries: the kernel depends on ${Object.keys(deps).length} package(s), each a stated decision`);

/* ------------------------------------------------------------------ data --- */

/**
 * ⚠️ A DECLARATION IS DATA, SO IT IS NOT AN INSTANCE. A class carries behaviour
 * and identity: it cannot be serialised to the operator console, diffed against
 * last week's manifest, or read by a script that never imported the module it
 * came from — and all three are things this framework does.
 */
let classes = 0;
for (const file of sourcesIn("kernel")) {
  const code = stripComments(readFileSync(file, "utf8"));
  for (const m of code.matchAll(/^\s*(export\s+)?(abstract\s+)?class\s+(\w+)/gm)) {
    classes++;
    fail(`${rel(file)}: \`class ${m[3]}\` in the kernel — a declaration is data (D8).\n` +
         `       An instance cannot be serialised, diffed, or read by a script that never imported it.`);
  }
}
if (!classes) ok("data: the kernel declares no classes");

/* ------------------------------------------------------------------ read --- */

/**
 * ⚠️ EVERY FIELD A DECLARATION OFFERS IS ONE SOMETHING CONSULTS (D12).
 *
 * ⚠️ THIS IS THE LAYER BELOW THE ONE `capability` CAN SEE, AND IT IS WHERE THE
 * SILENCE IS DEEPEST. That guard asks whether a MODULE is mounted — tables
 * applied, a store bound, no route. This asks whether a FIELD is read, and a
 * field nothing reads has no module, no route and no schema, so nothing anywhere
 * goes red. A manifest sets it, the type accepts it, the console draws around
 * it, and the capability it names does not exist.
 *
 * ⚠️ IT FOUND SIX ON ITS FIRST RUN, AND ONE OF THEM WAS ARGUED FOR AT LENGTH IN
 * THE FILE THAT HAD STOPPED READING IT. `offline` promised a phone with no
 * signal; `versioned` promised that every version was kept; `rerunnable`'s own
 * header said it was going to happen either way. Each was true of the intention
 * and false of the deployment.
 *
 * ⚠️ AND THE ONLY HONEST ANSWERS ARE THE SAME THREE THE RULES GUARD GIVES: wire
 * it, defer it with a `DEFER(engine-N)` marker so it is in the deferral list
 * rather than in the silence, or delete it. Two were deleted here, because a
 * field promising a guarantee nothing keeps is worse than its absence and
 * re-adding one is a line.
 *
 * ⚠️ THE MATCH IS BY NAME, AND WHAT THAT COSTS IS WRITTEN DOWN RATHER THAN
 * HIDDEN. Resolving which shape a `.field` belongs to needs the compiler, so a
 * field whose name is unique in the tree is checked exactly and one that shares
 * a name with a wire type's field is checked loosely — measured: deleting the
 * only lane that reads `JobDef.rerunnable` leaves this green, because the
 * console's own `JobShown.rerunnable` carries the same word. That is the
 * FAVOURABLE direction of the two: it can miss a field going idle, and it
 * cannot invent one. A guard that reported the other way round would be one
 * whose findings are argued with.
 */

/* ⚠️ FOUND BY SHAPE RATHER THAN BY A LIST, so a declaration added tomorrow is
   checked the day it is written. `Spec` and `Def` are what this tree names a
   declaration; a shape called neither is a wire type or an answer. */
const SHAPE = /export interface (\w+(?:Spec|Def))\b[^{]*\{/g;

const shapesIn = (code) => {
  const out = [];
  for (const m of code.matchAll(SHAPE)) {
    let i = m.index + m[0].length, depth = 1, body = "";
    while (i < code.length && depth > 0) {
      const c = code[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      if (depth > 0) body += c;
      i++;
    }
    /* ⚠️ ONLY THE TOP LEVEL. A field whose type is an inline object would
       otherwise contribute its own inner names, and `{ of: "tenant" }` would
       have this guard hunting for a lane that reads `of`. */
    let d = 0;
    const fields = [];
    for (const line of body.split("\n")) {
      const at = d;
      for (const c of line) { if ("{([".includes(c)) d++; else if ("})]".includes(c)) d--; }
      if (at !== 0) continue;
      const f = line.match(/^\s*(?:readonly\s+)?(\w+)\??\s*:/);
      if (f) fields.push(f[1]);
    }
    out.push({ shape: m[1], body, fields });
  }
  return out;
};

/*
  ⚠️ A FIELD CARRYING A `DEFER` MARKER IS EXEMPT, AND THE MARKER HAS TO SIT ON
  THE FIELD. The same three answers the rules guard gives, and the same reason:
  a capability that does not exist yet is legitimate as long as it is in the
  deferral list rather than in the silence. Found by walking forward from each
  marker to the next declared property, because "somewhere in this file" would
  exempt every field in a file that defers one.
*/
const deferredIn = (raw) => {
  const out = new Set();
  for (const m of raw.matchAll(/DEFER\(engine-\d+\)/g)) {
    const after = raw.slice(m.index).match(/\n\s*(?:readonly\s+)?(\w+)\??\s*:/);
    if (after) out.add(after[1]);
  }
  return out;
};

const shapes = [];
for (const file of sourcesIn("kernel")) {
  const raw = readFileSync(file, "utf8");
  const code = stripTemplates(stripComments(raw));
  const deferred = deferredIn(raw);
  for (const s of shapesIn(code)) shapes.push({ ...s, file, deferred });
}

/*
  ⚠️ THE LANES ARE WHERE A DECLARATION IS CONSULTED, AND AN APP IS ONE OF THEM.
  A product's own screen reading `SPEC.guide` is exactly the surface the
  declaration is for — and it cannot be confused with a manifest SETTING one,
  because setting is `guide:` and reading is `.guide`.
*/
const LANE_DIRS = ["kernel", "runtime", "design", "one-space", "one",
  ...readdirSync(join(ENGINE, "apps")).map((a) => `apps/${a}`)];

/*
  ⚠️ THE SHAPE BODIES ARE CUT OUT BEFORE ANYTHING IS SEARCHED, and this is the
  whole difference between a guard and a decoration. A declaration's own line is
  a MENTION; what proves it is consulted is a property access somewhere else.
  Comments and template literals go for the same reason — the rules guard passed
  two mutations that deleted a rule's only caller because the comment beside the
  call kept the identifier in the file.
*/
const bodies = [];
for (const dir of LANE_DIRS) {
  for (const file of sourcesIn(dir)) {
    let code = stripTemplates(stripComments(readFileSync(file, "utf8")));
    for (const s of shapes) code = code.split(s.body).join("");
    bodies.push(code);
  }
}

/* ⚠️ Three ways a field is genuinely read, and no fourth: a dot, a bracket, or
   a destructuring. A bare identifier is not one — that is the mention again. */
const consulted = (field) => {
  const dot = new RegExp(`\\.${field}\\b`);
  const brk = new RegExp(`\\[\\s*["']${field}["']\\s*\\]`);
  const des = new RegExp(`\\{[^{}]*\\b${field}\\b[^{}]*\\}\\s*=`);
  return bodies.some((code) => dot.test(code) || brk.test(code) || des.test(code));
};

/* ⚠️ A FLOOR, BECAUSE A BROKEN MATCHER PRINTS A CONFIDENT GREEN LINE. "No
   findings" and "nothing was looked at" are the same sentence without a
   number. */
const walked = shapes.reduce((n, s) => n + s.fields.length, 0);
if (shapes.length < 20 || walked < 150) {
  fail(`read: walked ${shapes.length} shape(s) and ${walked} field(s) — the kernel declares more than that,`
     + ` so the matcher is broken rather than the tree being clean.`);
} else {
  let idle = 0;
  let waiting = 0;
  for (const s of shapes) {
    for (const field of s.fields) {
      if (consulted(field)) continue;
      if (s.deferred.has(field)) { waiting++; continue; }
      idle++;
      fail(`${rel(s.file)}: \`${s.shape}.${field}\` is declared and no lane reads it (D12).\n`
         + `       A manifest can set it and nothing happens. Wire it, mark it DEFER(engine-N), or delete it.`);
    }
  }
  if (!idle) {
    ok(`read: ${walked} declared field(s) across ${shapes.length} shape(s), every one consulted by a lane`
     + `${waiting ? `, ${waiting} deferred` : ""}`);
  }
}

/* ⚠️ A closing line that reads like a pass beside a failure is the shape every
   guard here exists to refuse. */
console.log(bad
  ? `\ndeclarations: ${bad} finding(s) — a declaration nothing can walk, or a library that rules.`
  : `\ndeclarations: literals a script can walk, and libraries that decide rather than rule.`);
process.exit(bad ? 1 : 0);
