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

/* ⚠️ A closing line that reads like a pass beside a failure is the shape every
   guard here exists to refuse. */
console.log(bad
  ? `\ndeclarations: ${bad} finding(s) — a declaration nothing can walk, or a library that rules.`
  : `\ndeclarations: literals a script can walk, and libraries that decide rather than rule.`);
process.exit(bad ? 1 : 0);
