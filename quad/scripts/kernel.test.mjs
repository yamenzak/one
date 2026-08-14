/**
 * THE LAYERS, AND WHAT MAY NOT CROSS THEM.
 *
 * ⚠️ THE ARROW POINTS ONE WAY: apps → web → runtime → kernel. Every one of these
 * checks is about a property that is invisible at the call site — an import that
 * compiles, a noun that reads naturally, a binding touched one layer too high —
 * and each of them is how a shared layer stops being shared.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const QUAD = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const sourcesIn = (pkg) => {
  const dir = join(QUAD, pkg, "src");
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

/** Comments state the rules and would match them; only declarations are read. */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* --------------------------------------------------------------- purity: --- */

/**
 * ⚠️ THE KERNEL IS PROVABLE WITH NO FIXTURE AT ALL, and that is the whole reason
 * the rules live there instead of beside whichever code needed them first. The
 * moment it needs a binding to test, the rules become fixtures and stop being
 * things anybody can reason about on their own.
 */
const FORBIDDEN_IN_KERNEL = [
  [/\bfetch\s*\(/, "fetch"],
  [/\bcrypto\.subtle\b/, "crypto.subtle"],
  [/\bfrom\s+["']react["']/, "react"],
  [/\benv\./, "an environment binding"],
  [/\bD1Database\b|\bR2Bucket\b|\bKVNamespace\b|\bDurableObject/, "a Cloudflare binding type"],
];
let kernelFiles = 0;
for (const file of sourcesIn("kernel")) {
  kernelFiles++;
  const code = stripComments(readFileSync(file, "utf8"));
  for (const [re, what] of FORBIDDEN_IN_KERNEL) {
    if (re.test(code)) {
      fail(`${file.slice(QUAD.length + 1)}: the kernel reaches for ${what}.\n` +
           `       A contract layer that needs a binding to test is one whose rules stop being provable.`);
    }
  }
}
ok(`purity: ${kernelFiles} kernel file(s), none reach for a binding`);

/* ----------------------------------------------------------- vocabulary: --- */

/**
 * ⚠️ A SHARED MODULE THAT KNOWS WHAT A CLIENT IS HAS STOPPED BEING SHARED. These
 * are the nouns our products own; they belong in `apps/`, never in the layers
 * every app stands on.
 *
 * A file may exempt ONE noun with a reason — `vocabulary-exempt-file(client):
 * WebAuthn's own field names` — because a wire protocol's field names appear a
 * dozen times in the file implementing it, and a dozen line exemptions teach
 * everybody that exemptions are routine.
 *
 * ⚠️ `screen` IS DELIBERATELY ABSENT, AND THE ABSENCE IS THE INTERESTING PART. A
 * UI framework's shared layers have to be able to name the thing they render —
 * that is framework vocabulary, not product knowledge. The collision is real
 * (one of our products calls a television a screen) and it is that product's to
 * resolve: a physical panel is a `display` in its manifest. Putting the word on
 * this list instead would have meant either 120 exemptions or a framework that
 * cannot say what a page is.
 */
const NOUNS = /\b(client|clients|workout|workouts|meal|meals|coach|coaches|trainer|trainers|studio|studios|slide|slides|playlist|playlists)\b/gi;
const exemptions = (src) =>
  new Set([...src.matchAll(/vocabulary-exempt-file\(([a-z]+)\):\s*\S/g)].map((m) => m[1]));

let shared = 0;
let hits = 0;
for (const pkg of ["kernel", "runtime", "web"]) {
  for (const file of sourcesIn(pkg)) {
    shared++;
    const src = readFileSync(file, "utf8");
    const code = stripComments(src);
    const exempt = exemptions(src);
    for (const m of code.matchAll(NOUNS)) {
      const noun = m[0].toLowerCase().replace(/s$/, "");
      if (exempt.has(noun)) continue;
      hits++;
      fail(`${file.slice(QUAD.length + 1)}: product vocabulary "${m[0]}" in shared code.\n` +
           `       Rename it, or state why with \`vocabulary-exempt-file(${noun}): <reason>\`.`);
    }
  }
}
ok(`vocabulary: ${shared} shared file(s), ${hits} unexplained product noun(s)`);

/* ------------------------------------------------------------- reserved: --- */

/**
 * ⚠️ THE FRAMEWORK'S OWN NAME IS RESERVED INSIDE IT (D2). `quad` is also a
 * geometry word and a CSS word, so without this it becomes a local variable in
 * `@quad/web` and the name of the thing stops naming the thing.
 */
let reservedHits = 0;
for (const pkg of ["kernel", "runtime", "web"]) {
  for (const file of sourcesIn(pkg)) {
    const code = stripComments(readFileSync(file, "utf8"));
    for (const m of code.matchAll(/\b(const|let|var|function|interface|type|class)\s+(quad)\b/gi)) {
      reservedHits++;
      fail(`${file.slice(QUAD.length + 1)}: "${m[2]}" is the framework's own name (D2).`);
    }
  }
}
ok(`reserved: the framework's name is not a symbol inside it (${reservedHits} hit(s))`);

/* ------------------------------------------------------------- boundary --- */

/**
 * ⚠️ THE ARROW POINTS ONE WAY. A kernel that imports the runtime is a kernel
 * that cannot be tested alone; a runtime that imports the web is a worker that
 * bundles React.
 */
const ALLOWED = { kernel: [], runtime: ["kernel"], web: ["kernel"] };
for (const [pkg, allowed] of Object.entries(ALLOWED)) {
  for (const file of sourcesIn(pkg)) {
    for (const m of readFileSync(file, "utf8").matchAll(/from\s+["']@quad\/([a-z-]+)/g)) {
      if (!allowed.includes(m[1])) {
        fail(`${file.slice(QUAD.length + 1)}: @quad/${pkg} imports @quad/${m[1]}, which the layering forbids.`);
      }
    }
  }
}
ok(`boundary: kernel imports nothing of ours; runtime and web import only the kernel`);

console.log(`\nlayers: the kernel is pure, the shared tree carries no product vocabulary.`);
process.exit(bad ? 1 : 0);
