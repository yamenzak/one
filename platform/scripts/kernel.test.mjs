#!/usr/bin/env node
/**
 * WHAT THE PLATFORM SOURCE MAY NOT LACK, AND MAY NOT CARRY.
 *
 * Types catch a great deal. These are the five things they cannot, and each is a
 * failure that produces no error anywhere:
 *
 *   1. LACKS      a day-zero declaration with no type expressing it. MANIFEST.md
 *                 §9 is the list, and every entry on it implies a column, a table
 *                 or an audited behaviour — so arriving late is a migration
 *                 rather than an edit. A missing one compiles perfectly.
 *   2. OPTIONAL   a day-zero field expressed as `?`. An optional field is one an
 *                 app forgets, which is the same outcome as not having it.
 *   3. ADDS       product vocabulary in shared code. A framework that knows what
 *                 a workout is has stopped being a framework, and the first noun
 *                 is always reasonable.
 *   4. ESCAPES    a passthrough, a raw blob, an unchecked extension point. The
 *                 moment expressing something in the manifest is harder than
 *                 going around it, people go around it — and the hatch becomes
 *                 the real API within two quarters.
 *   5. DRIFTS     an exported symbol nothing exercises. Unproved surface is
 *                 speculative surface: it looks designed, it has never been run,
 *                 and it is what a later stage builds on by mistake.
 *
 * Scans the `src` of every platform package, so one added later is asked the
 * same questions the day it exists rather than the day somebody remembers.
 *
 * Dependency-free Node — these run before `pnpm install` in CI.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
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

const packages = readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(ROOT, e.name, "src")))
  .map((e) => e.name);

const srcFiles = packages.flatMap((p) => walk(join(ROOT, p, "src")));

/**
 * ⚠️ AN APP IS ALLOWED PRODUCT WORDS; THAT IS WHAT AN APP IS.
 *
 * The vocabulary rule is about SHARED code — a framework that knows what a
 * client is has a product's assumptions welded into it. A manifest that could
 * not say "client" would be a coaching product unable to name the person being
 * coached, which is the rule eating the thing it exists to protect.
 *
 * The discriminator is declared rather than a list of directory names: an app is
 * a package that has a `src/manifest.ts`, because that is precisely what makes
 * one on this platform. Every other check below still applies to it.
 */
const isApp = (p) => existsSync(join(ROOT, p, "src", "manifest.ts"));
const sharedFiles = packages.filter((p) => !isApp(p)).flatMap((p) => walk(join(ROOT, p, "src")));
const testFiles = packages.flatMap((p) => walk(join(ROOT, p, "test")));
const testCorpus = testFiles.map((f) => readFileSync(f, "utf8")).join("\n");
const read = (f) => readFileSync(f, "utf8");
const rel = (f) => relative(ROOT, f);

/**
 * Comments are rationale and may illustrate with a real product ("right for a
 * sterilisation record, wrong for a customer profile"). Code may not. So the
 * vocabulary and escape-hatch checks read source with comments removed, and the
 * exemption scanner reads the comments they came from.
 *
 */

/**
 * The same, with string CONTENTS blanked as well.
 *
 * ⚠️ FOR THE TYPE CHECKS ONLY, AND THE VOCABULARY CHECK MUST NOT USE IT. A
 * manifest holds PROSE — release notes, help articles, the copy on a refusal —
 * and reading it as code fails on ordinary English: "confirm a payment you took
 * any other way" was reported as an unstated `any`. A guard a product sentence
 * can trip is one people learn to route around, and it takes the real findings
 * with it.
 *
 * ⚠️ But a product NOUN in a string is a real finding — a shared package with
 * "client" as a default label has product vocabulary in it whether or not the
 * compiler sees it. So the vocabulary scan keeps reading strings, and only the
 * checks that are about TYPES stop.
 */
function stripStrings(src) {
  let out = "";
  let quote = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") { out += "  "; i++; continue; }
      if (c === quote) { quote = null; out += c; continue; }
      /* Length-preserving, so every reported line number stays true. */
      out += c === "\n" ? "\n" : " ";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    out += c;
  }
  return out;
}
function stripComments(src) {
  let out = "";
  let i = 0;
  const N = src.length;
  let quote = null;
  while (i < N) {
    const c = src[i];
    const d = src[i + 1];
    if (quote) {
      if (c === "\\") { out += "  "; i += 2; continue; }
      if (c === quote) quote = null;
      out += c; i++; continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; out += c; i++; continue; }
    if (c === "/" && d === "*") {
      const end = src.indexOf("*/", i + 2);
      const skipped = src.slice(i, end === -1 ? N : end + 2);
      out += skipped.replace(/[^\n]/g, " ");
      i = end === -1 ? N : end + 2;
      continue;
    }
    if (c === "/" && d === "/") {
      const end = src.indexOf("\n", i);
      out += " ".repeat((end === -1 ? N : end) - i);
      i = end === -1 ? N : end;
      continue;
    }
    out += c; i++;
  }
  return out;
}

/** An exemption is a stated reason on the line, or within two lines above it. */
const exempted = (src, line, token) => {
  const lines = src.split("\n");
  return lines.slice(Math.max(0, line - 3), line).some((l) => new RegExp(`${token}:\\s*\\S`).test(l));
};

/* ------------------------------------------------------- 1 + 2. DAY ZERO --- */

/**
 * ⚠️ MANIFEST.md §9's first list, each entry bound to the type that expresses it.
 *
 * The pattern is deliberately the REQUIRED form — `readonly x: T;` and not
 * `readonly x?: T;` — because check 2 is the same check. A day-zero field that
 * is optional has all the cost of existing and none of the benefit: an app that
 * omits it is exactly the app the list was written for.
 */
const DAY_ZERO = [
  ["bindings + regions", "kernel/src/bindings.ts", /export function defineBindings/],
  ["region resolution", "kernel/src/resolve.ts", /ResolvedRegion/],
  ["collections.version", "kernel/src/collection.ts", /readonly version: true;/],
  ["operations.idempotency", "kernel/src/operation.ts", /readonly idempotency: Idempotency;/],
  ["money as minor units + currency", "kernel/src/primitives.ts", /readonly minor: number;[\s\S]{0,200}?readonly currency:/],
  ["locale + tenant timezone", "kernel/src/app.ts", /readonly timeZone: TimeZone;/],
  ["units", "kernel/src/app.ts", /readonly units:/],
  ["media.exifStrip defaults on", "kernel/src/collection.ts", /exifStrip: true/],
  ["legal consent ledger", "kernel/src/app.ts", /readonly legal:/],
  ["audit", "kernel/src/operation.ts", /readonly audit\?:/],
  ["retention", "kernel/src/collection.ts", /readonly retention: Retention;/],
  ["seats", "kernel/src/app.ts", /readonly seats:/],
  ["impersonation", "kernel/src/app.ts", /readonly impersonation:/],
  ["soft delete", "kernel/src/collection.ts", /readonly onDelete: DeletePolicy;/],
  ["rateLimits", "kernel/src/operation.ts", /readonly rateLimit/],
];

for (const [what, file, pattern] of DAY_ZERO) {
  const path = join(ROOT, file);
  if (!existsSync(path)) { fail(`day-zero "${what}": ${file} does not exist.`); continue; }
  if (!pattern.test(read(path))) {
    fail(`day-zero "${what}" is not expressed in ${file}.\n` +
         `       MANIFEST.md §9: everything on that list implies a column, a table or an\n` +
         `       audited behaviour, so adding it later is a migration rather than an edit.`);
  }
}
ok(`day-zero: ${DAY_ZERO.length} declaration(s) present and required`);

/* --------------------------------------------------------- 3. VOCABULARY --- */

/**
 * ⚠️ The first product noun in shared code is always reasonable, and it is the
 * one that makes the second one arguable.
 *
 * Ambiguous entries stay on the list on purpose. `client` is an HTTP client and
 * somebody's customer; `cycle` is a billing period and a sterilisation run.
 * Ambiguity is the reason to look, not a reason to skip — so they are refused
 * with a stated exemption rather than quietly allowed.
 */
const PRODUCT_NOUNS = [
  "workout", "exercise", "meal", "food", "calorie", "macro", "nutrition", "trainer", "coach",
  "sterilis", "steriliz", "autoclave", "tray", "instrument",
  "playlist", "slide", "kiosk", "signage", "marquee",
  "studio", "roster", "patient", "client", "invoice", "cycle",
];
const NOUN_RE = new RegExp(`\\b(${PRODUCT_NOUNS.join("|")})[a-z]*\\b`, "gi");

/**
 * ⚠️ A FILE-SCOPED EXEMPTION NAMES ONE NOUN, and it exists because the
 * alternative is worse. A wire protocol's own field names — `clientDataJSON` —
 * appear a dozen times in the file that implements it, and a dozen line
 * exemptions teach everybody that exemptions are routine. One statement, naming
 * the single word it covers, with a reason: `vocabulary-exempt-file(client):
 * WebAuthn's own field names`. Any OTHER noun in that file still fails.
 */
const fileExemptions = (src) =>
  new Set([...src.matchAll(/vocabulary-exempt-file\(([a-z]+)\):\s*\S/g)].map((m) => m[1]));

let vocabHits = 0;
for (const file of sharedFiles) {
  const src = read(file);
  const code = stripComments(src);
  const perFile = fileExemptions(src);
  for (const m of code.matchAll(NOUN_RE)) {
    const line = code.slice(0, m.index).split("\n").length;
    if (perFile.has(m[1].toLowerCase())) continue;
    if (exempted(src, line, "vocabulary-exempt")) continue;
    vocabHits++;
    fail(`${rel(file)}:${line}: product vocabulary "${m[0]}" in code.\n` +
         `       A shared module that knows what this noun means has stopped being shared.\n` +
         `       Rename it, or state why with \`vocabulary-exempt: <reason>\` above the line.`);
  }
}
ok(`vocabulary: ${srcFiles.length} source file(s), ${vocabHits} unexplained product noun(s)`);

/* ------------------------------------------------------- 4. ESCAPE HATCH --- */

/**
 * ⚠️ PLAN.md §9 names this as risk 7: if expressing something in the manifest is
 * harder than going around it, people go around it. A hatch is not a feature
 * that got added — it is a design failure that got a name.
 */
const HATCHES = /\b(escapeHatch|passthrough|rawConfig|customJson|arbitrary|unsafe[A-Z]|extra\?:|\[key: string\]: unknown)/g;
let hatchHits = 0;
for (const file of srcFiles) {
  const src = read(file);
  const code = stripStrings(stripComments(src));
  for (const m of code.matchAll(HATCHES)) {
    const line = code.slice(0, m.index).split("\n").length;
    if (exempted(src, line, "hatch-exempt")) continue;
    hatchHits++;
    fail(`${rel(file)}:${line}: escape hatch "${m[0]}".\n` +
         `       An unchecked extension point becomes the real API. If the manifest cannot\n` +
         `       express something, that is a gap to design, not a hole to open.`);
  }
}
ok(`escape hatch: ${hatchHits} found`);

/* -------------------------------------------------------- 5. UNSTATED ANY --- */

let anyHits = 0;
for (const file of srcFiles) {
  const src = read(file);
  const code = stripStrings(stripComments(src));
  /*
    ⚠️ A TYPE POSITION, NOT THE WORD. `srcFiles` now includes `.tsx`, and JSX
    text is not a string literal — so `stripStrings` leaves it alone and the
    check read the product's own copy. "You are not in any workspace yet" is
    English, and failing the build on it is a guard that has to be worked around,
    which is the one thing a guard must never become.

    Every real form is preceded by `:` `<` `|` `&` `,` `(` or the word `as`, or
    is followed by `[]` — `x: any`, `as any`, `Record<string, any>`, `any[]`,
    `(x: any) =>`, `Promise<any>`. Prose has a letter or a space on both sides.
  */
  for (const m of code.matchAll(/(?:[:<|&,(]\s*|\bas\s+)any\b|\bany\s*\[\]/g)) {
    const line = code.slice(0, m.index).split("\n").length;
    const above = src.split("\n").slice(Math.max(0, line - 3), line).join("\n");
    // A stated reason is a `--` justification on an eslint-disable, or the token.
    if (/--\s*\S/.test(above) || exempted(src, line, "any-exempt")) continue;
    anyHits++;
    fail(`${rel(file)}:${line}: unstated any.\n` +
         `       Every \`any\` here is a place the types stopped holding. That can be the\n` +
         `       right call — say which, on the line above.`);
  }
}
ok(`unstated any: ${anyHits} found`);

/* ---------------------------------------------------- 6. UNPROVED EXPORT --- */

/**
 * ⚠️ Stage 0's whole claim is that these types were tried against real surfaces
 * rather than imagined. An export no proof touches is the part that was
 * imagined — and it is indistinguishable from the rest until a later stage
 * builds on it.
 *
 * ⚠️ REACHABILITY, NOT MENTION — and the difference is the whole check.
 *
 * A proof that builds a field never writes the word `TextField`; it calls
 * `field.text()` and the compiler does the rest. Asking whether a test NAMES a
 * symbol therefore reports most of a well-typed module as unproved, and a check
 * that cries wolf is a check that gets deleted.
 *
 * So: the roots are the symbols a test names, and a declaration is proved when
 * something proved refers to it. What survives is genuinely unreachable — no
 * proof touches it directly, and nothing that a proof touches leads to it.
 */
/** ⚠️ `async` sits between `export` and `function`, and omitting it makes every
 *  async export invisible — neither reported nor able to prove what it uses. */
const DECL_RE = /^(export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(type|interface|const|function|class|enum)\s+([A-Za-z_$][\w$]*)/gm;

/**
 * A declaration runs from its own line to the next top-level one.
 *
 * ⚠️ PRIVATE DECLARATIONS ARE NODES TOO. Only exports are REPORTED, but a
 * private type is how an exported one is reached — `StoreKind` is named by a
 * non-exported `StoreCommon` that every exported store extends. A graph of
 * exports alone reports the base of a hierarchy as dead.
 */
const decls = new Map();
/**
 * ⚠️ A FILE WITH A DEFAULT EXPORT IS AN ENTRY POINT, and its body is a root.
 * An app's worker is exercised by driving it over HTTP, not by naming its
 * symbols — so without this the whole of an app reads as unreachable while its
 * tests are in fact running every line. A BARREL is excluded for the mirror
 * reason: re-exporting everything would make everything reachable and the check
 * vacuous.
 */
const entryBodies = [];
for (const file of srcFiles) {
  const src = read(file);
  if (file.endsWith("index.ts")) continue;
  const found = [...src.matchAll(DECL_RE)];
  /*
    ⚠️ THE ROOT IS THE ENTRY'S GLUE, NOT ITS DECLARATIONS. Seeding the whole file
    would prove every symbol it happens to declare, so an unused export in an
    entry file could never be reported. What is a root is the part nothing else
    could reach: the imports and the default export itself.
  */
  if (/^export default/m.test(src)) {
    let glue = src;
    for (let i = found.length - 1; i >= 0; i--) {
      const end = i + 1 < found.length ? found[i + 1].index : src.length;
      glue = glue.slice(0, found[i].index) + glue.slice(end);
    }
    entryBodies.push(glue);
  }
  found.forEach((m, i) => {
    const end = i + 1 < found.length ? found[i + 1].index : src.length;
    decls.set(m[3], {
      name: m[3], kind: m[2], file, exported: Boolean(m[1]),
      line: src.slice(0, m.index).split("\n").length,
      body: src.slice(m.index, end),
    });
  });
}

const proved = new Set();
const frontier = [];
const seed = (name) => {
  if (proved.has(name) || !decls.has(name)) return;
  proved.add(name);
  frontier.push(decls.get(name));
};
for (const name of decls.keys()) {
  if (new RegExp(`\\b${name}\\b`).test(testCorpus)) seed(name);
  else if (entryBodies.some((b) => new RegExp(`\\b${name}\\b`).test(b))) seed(name);
}
while (frontier.length) {
  const d = frontier.pop();
  for (const name of decls.keys()) {
    if (!proved.has(name) && new RegExp(`\\b${name}\\b`).test(d.body)) seed(name);
  }
}

let exported = 0;
for (const [name, d] of decls) {
  if (!d.exported) continue;
  exported++;
  if (proved.has(name)) continue;
  const isType = d.kind === "type" || d.kind === "interface";
  fail(`${rel(d.file)}:${d.line}: "${name}" is exported and nothing reachable from a proof ${isType ? "refers to it" : "calls it"}.\n` +
       `       Exercise it, make it non-exported, or delete it — unproved surface is what\n` +
       `       a later stage builds on by mistake.`);
}
ok(`exports: ${exported} declared, ${exported - bad} reachable from a proof`);

/* ------------------------------------------------ 7. DECLARATION CONSUMED --- */

/**
 * ⚠️ A DECLARATION NOTHING ACTS ON IS DECORATION, AND IT READS EXACTLY LIKE A
 * FEATURE.
 *
 * This is check 5 one level down, and it is the failure this repository keeps
 * finding by hand. `help`, `governance.legal` and `releases` were each declared,
 * validated at composition, covered by a guard and served by no route — and the
 * thoroughness of the validation is what made them look covered. A guard that
 * asks whether a help article is short enough cannot ask whether anybody can
 * open it.
 *
 * So every field on every `*Spec` interface in the kernel must be READ by some
 * other file in the kernel or the runtime. Its own file does not count: that is
 * precisely where validation lives, and validating a thing nobody consumes is
 * the shape being caught.
 *
 * ⚠️ THE UNCONSUMED LIST IS THE STAGE'S TO-DO, WRITTEN DOWN. Every entry is a
 * field an app can write today that changes nothing, with the reason it is not
 * wired yet. It may only SHRINK — an entry that becomes consumed fails until it
 * is deleted, so it cannot rot into a permanent exemption — and a NEW unconsumed
 * declaration fails on the commit that adds it rather than at the next audit.
 */
const UNCONSUMED = {
  /* Waiting on the renderer — every one is a screen-shaped declaration. */
  "CollectionSpec.views": "the list/grid/detail layouts; nothing renders yet",
  "CollectionSpec.print": "a print view; nothing renders yet",
  "CollectionSpec.realtime": "which collections push live; there is no socket yet",
  "CollectionSpec.offline": "the precache and queue policy; there is no service worker yet",
  "AppSpec.sounds": "the surface audio map; nothing plays yet",
  "SoundSpec.pack": "which audio set; nothing plays yet",

  /* Consumed outside these two directories, which this check cannot see. */
  "AppSpec.retired": "read by each app's own lock comparison — see the `lock-exists` guard",
};


const specFiles = walk(join(ROOT, "kernel", "src")).filter((f) => f.endsWith(".ts"));
const declaredIn = new Map();
for (const file of specFiles) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/export interface (\w*Spec\w*)\s*(?:<[^>]*>)?\s*\{([\s\S]*?)\n\}/g)) {
    for (const f of m[2].matchAll(/\n  readonly (\w+)\??[:<]/g)) {
      declaredIn.set(`${m[1]}.${f[1]}`, file);
    }
  }
}
if (declaredIn.size < 40) {
  fail(`kernel/src: only ${declaredIn.size} spec field(s) found, so this check proves nothing about the rest.`);
}

const consumers = [...specFiles, ...walk(join(ROOT, "runtime", "src")).filter((f) => f.endsWith(".ts"))]
  .map((f) => [f, readFileSync(f, "utf8")]);

let consumed = 0;
for (const [key, home] of [...declaredIn].sort()) {
  const field = key.split(".")[1];
  /* ⚠️ `.field` or `["field"]` — the two ways a value is actually taken out. */
  const used = new RegExp(`(?:\\.|\\[")${field}\\b`);
  const reader = consumers.find(([file, text]) => file !== home && used.test(text));
  if (reader) {
    consumed++;
    if (key in UNCONSUMED) {
      fail(`${key} is listed as unconsumed and ${relative(ROOT, reader[0])} reads it.\n` +
           `       Delete the entry — the list may only shrink, or it stops being read.`);
    }
    continue;
  }
  if (!(key in UNCONSUMED)) {
    fail(`${key} is declared and nothing outside ${relative(ROOT, home)} reads it.\n` +
         `       An app can write it and nothing will happen. Wire it, or add it to\n` +
         `       UNCONSUMED with what it would do — a declaration nobody consumes\n` +
         `       reads exactly like a feature.`);
  }
}
ok(`consumed: ${consumed}/${declaredIn.size} spec field(s) acted on, ${Object.keys(UNCONSUMED).length} declared and not yet wired`);

/* -------------------------------------------------------------------------- */

if (bad) {
  console.error(`\n${bad} platform-source failure(s).`);
  process.exit(1);
}
console.log(`\nplatform source: ${packages.length} package(s) — day-zero present, no product vocabulary, no hatches, every export proved.`);
