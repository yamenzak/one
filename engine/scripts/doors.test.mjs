/**
 * A SCREEN THE ACCOUNT DOOR RENDERS MUST KNOW WHICH DOOR IT IS ON.
 *
 * ⚠️ THE ACCOUNT DOOR HAS NO TENANCY, SO A MEMBER OPERATION 404s THERE — and a
 * screen that calls one anyway does not look broken, it looks EMPTY. "How you
 * are told" shipped on `id.` calling `centre.view` and `inbox.settings`: the
 * page drew its title, its back arrow and a small grey notice reading "That is
 * not here", over nothing. Nothing in a type, a test or a route said a word.
 *
 * ⚠️ AND IT IS A CLASS, NOT AN INCIDENT. The same shape took the inbox out of
 * the account door entirely — the row was deleted rather than the read fixed,
 * so the one address that spans every workspace could not say that any of them
 * needed somebody. Both are the same sentence: a screen offered on a door whose
 * data it cannot reach.
 *
 * ⚠️ SO THE RULE IS ABOUT THE DECISION, NOT ABOUT THE CALL. A member operation
 * reachable from an account-door screen is fine — `InboxScreen` calls one, and
 * correctly, on the door where it answers. What must exist is the SPLIT: the
 * screen asked which door this is before choosing what to read.
 *
 * ⚠️ AND THE SPLIT MUST BE IN THE FILE THE ROUTER NAMES. Asking for it anywhere
 * in the import closure made the first version of this guard INERT: `door.ts`'s
 * `isHere` compares `where.kind === "tenant"` and every screen imports it, so
 * the check passed for everything — including, when it was mutation-tested, the
 * two bugs it had just been written to catch. Requiring it in the screen's own
 * file is stricter than runtime needs, and the strictness is the feature: the
 * router's import list is then the list of door-aware screens.
 *
 * ⚠️ WHAT IT STILL CANNOT SEE is a split that guards the wrong branch. What it
 * catches is no split at all, which is what this repository has shipped twice.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");
const SPA = join(ENGINE, "one-space/src");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(ENGINE.length + 1);

/** ⚠️ Blanked, not deleted, so reported line numbers are the file's own. */
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/^(\s*)\/\/.*$/gm, "$1");

/* ---------------------------------------------------- what a member op is --- */

/**
 * ⚠️ READ FROM THE RUNTIME, NEVER LISTED HERE. A second copy of "which
 * operations need a workspace" is a list that goes stale the first time one is
 * added, and it goes stale SILENTLY — which is this guard passing while the
 * thing it is about ships.
 */
const memberOps = () => {
  const out = new Set();
  for (const file of ["runtime/src/member-ops.ts", "runtime/src/centre-ops.ts"]) {
    const src = strip(readFileSync(join(ENGINE, file), "utf8"));
    for (const m of src.matchAll(/"([a-z]+\.[a-z.]+)":\s*(?:op\(|spec\b)/g)) out.add(m[1]);
    for (const m of src.matchAll(/\bid:\s*"([a-z]+\.[a-z.]+)"/g)) out.add(m[1]);
  }
  /* ⚠️ The catalogue's own problem codes are ids in the same shape and are not
     operations. They are named rather than pattern-matched, because a pattern
     wide enough to exclude them would exclude an operation one day. */
  for (const not of ["platform.conflict", "platform.forbidden", "platform.invalid",
    "platform.unauthorized", "platform.not_found", "platform.unavailable"]) out.delete(not);
  return out;
};

const MEMBER = memberOps();

/* ------------------------------------------------- the account door's screens --- */

const ONESPACE = join(SPA, "space/OneSpace.tsx");
const ROUTER = strip(readFileSync(ONESPACE, "utf8"));

/**
 * ⚠️ THE SWITCH IS THE REGISTRY. Every screen the account door can render is a
 * case in it, so the corpus is derived from the code that decides rather than
 * from a list beside it that somebody has to remember to extend.
 */
const screens = [...ROUTER.matchAll(/case\s+"(\w+)":\s*return\s*<(\w+)/g)]
  .map((m) => ({ at: m[1], component: m[2] }));

/** ⚠️ Where a component comes from, read from this file's own imports. */
const importsIn = (src, from) => {
  const out = new Map();
  for (const m of src.matchAll(/import\s+(?:type\s+)?{([^}]*)}\s*from\s*"([^"]+)"/g)) {
    if (!m[2].startsWith(".")) continue;
    const path = resolve(dirname(from), m[2].replace(/\.js$/, ""));
    for (const name of m[1].split(",")) {
      const clean = name.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0];
      if (clean) out.set(clean, path);
    }
  }
  return out;
};

const fileFor = (base) => {
  for (const ext of [".tsx", ".ts"]) if (existsSync(`${base}${ext}`)) return `${base}${ext}`;
  return null;
};

/** Every SPA file a screen reaches, transitively. */
const closureOf = (entry) => {
  const seen = new Set();
  const walk = (file) => {
    if (!file || seen.has(file) || !file.startsWith(SPA)) return;
    seen.add(file);
    const src = strip(readFileSync(file, "utf8"));
    for (const target of new Set(importsIn(src, file).values())) walk(fileFor(target));
  };
  walk(entry);
  return seen;
};

/* ------------------------------------------------------------ attribution --- */

/**
 * ⚠️ THE OP BELONGS TO THE CALL, NOT TO THE FILE THE LITERAL SITS IN — and the
 * first version of this guard got that wrong, which is how a guard comes to
 * report two screens that are fine. `centre/data.tsx` defines `useLoad` AND a
 * one-line `useCentre` wrapper around `centre.view`; every screen in the SPA
 * imports `useLoad`, so scanning the closure for literals attributed that
 * operation to all of them.
 *
 * ⚠️ SO A WRAPPER IS A LIBRARY AND ITS OPERATION IS ITS CALLERS'. An exported
 * one-liner naming an op is resolved to that op, the definition is not counted
 * against the file it lives in, and a file that CALLS it is what names the
 * operation. One level, deliberately: two would be a call graph, and a call
 * graph in a guard is a second compiler nobody asked for.
 */
const WRAPS = new Map();
const wrappersIn = (file) => {
  const src = strip(readFileSync(file, "utf8"));
  for (const m of src.matchAll(
    /export\s+(?:const|function)\s+(\w+)[^\n]*?(?:useLoad|api\.(?:get|post))\s*(?:<[^>]*>)?\s*\(\s*"([a-z]+\.[a-z.]+)"/g)) {
    if (MEMBER.has(m[2])) WRAPS.set(m[1], m[2]);
  }
};

const allSpaFiles = (dir) => {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...allSpaFiles(full));
    else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
};
for (const f of allSpaFiles(SPA)) wrappersIn(f);

/** ⚠️ In CALL position, so a type name or a comparison is not a call. */
const CALLS = /(?:useLoad|api\.(?:get|post))\s*(?:<[^>]*>)?\s*\(\s*"([a-z]+\.[a-z.]+)"/g;

const namesIn = (file) => {
  const src = strip(readFileSync(file, "utf8"));
  const out = [];
  /* ⚠️ A WRAPPER'S OWN DEFINITION IS NOT A CALL SITE, and dropping the line it
     is on is what makes that true for the literal as well as for the name. Left
     in, `data.tsx` reports every operation it wraps and the guard blames the
     library rather than whoever used it. */
  const body = src.split("\n")
    .filter((line) => !/export\s+(?:const|function)\s+\w+[^\n]*(?:useLoad|api\.(?:get|post))/.test(line))
    .join("\n");
  for (const m of body.matchAll(CALLS)) if (MEMBER.has(m[1])) out.push(m[1]);
  for (const [helper, op] of WRAPS) {
    if (new RegExp(`export\\s+(?:const|function)\\s+${helper}\\b`).test(src)) continue;
    if (new RegExp(`\\b${helper}\\s*\\(`).test(body)) out.push(op);
  }
  return out;
};

/* ------------------------------------------------------------------ check --- */

/**
 * ⚠️ THE DECISION IS THE SCREEN'S OWN, AND ASKING FOR IT ANYWHERE IN THE CLOSURE
 * MADE THIS GUARD INERT. `door.ts`'s `isHere` compares `where.kind === "tenant"`
 * and is imported by every screen in the SPA, so the first version passed for
 * everything — including, when it was mutation-tested, the two bugs it had just
 * been written to catch. A check satisfied by a helper nobody was thinking about
 * is not a weaker check, it is no check.
 *
 * ⚠️ SO IT MUST BE IN THE FILE THE ROUTER NAMES. That is stricter than
 * necessary — a split one level down would work at runtime — and the strictness
 * is the feature: the router's own import list becomes the list of screens that
 * know which door they are on, readable without following anything.
 */
const ASKS = /\.\s*kind\s*(?:===|!==)\s*"tenant"/;

const entry = importsIn(ROUTER, ONESPACE);
let looked = 0;

for (const { at, component } of screens) {
  const base = entry.get(component);
  if (!base) continue;
  const file = fileFor(base);
  if (!file) continue;
  looked++;

  const asks = ASKS.test(strip(readFileSync(file, "utf8")));
  const calls = [];
  for (const f of closureOf(file)) {
    for (const op of namesIn(f)) calls.push(`${rel(f)} → ${op}`);
  }
  if (!calls.length || asks) continue;

  fail(`the "${at}" screen (<${component}>) reaches a member operation and never asks which door it is on.\n`
    + calls.slice(0, 4).map((c) => `       ${c}`).join("\n")
    + `\n       The account door has no tenancy, so these 404 there and the screen\n`
    + `       renders as a title over "That is not here". Split on\n`
    + `       \`where?.kind === "tenant"\` and give the account door its own answer.`);
}

if (bad === 0) ok(`every account-door screen that reaches a member op asks the door first (${looked} screens, ${MEMBER.size} member ops)`);

process.exit(bad ? 1 : 0);
