/**
 * WHAT A WORKSPACE IS STAYS ONE ANSWER, IN ONE PLACE (D21, D22).
 *
 * ⚠️ EVERY CHECK HERE CATCHES SOMETHING NO TEST WOULD. A second `UPDATE tenant
 * SET kind` typechecks, passes, and is the one-way door opened from the side. A
 * screen asking `kind === "commercial"` for itself typechecks, passes, and is
 * correct today — it becomes wrong the moment what commercial buys changes, and
 * it becomes wrong in ONE product while the rest agree. A gate position declared
 * and never read typechecks, passes, and refuses nothing for ever.
 *
 * ⚠️ AND THE LAST ONE IS THE SHAPE THIS WHOLE FRAMEWORK IS A CATALOGUE OF: a
 * mechanism fully built, fully tested and never reached.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const sources = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (/node_modules|dist|\.turbo/.test(e.name)) continue;
    const at = join(dir, e.name);
    if (e.isDirectory()) walk(at);
    else if (/\.tsx?$/.test(e.name)) sources.push(at);
  }
};
for (const tree of ["kernel/src", "runtime/src", "design/src", "one/src", "one-space/src", "apps"]) {
  walk(join(ENGINE, tree));
}
const rel = (f) => f.slice(ENGINE.length + 1);
const read = (f) => readFileSync(f, "utf8");
/* ⚠️ Comments are stripped before every scan: a paragraph explaining the rule
   quotes the shape the rule forbids, and a guard that read its own explanation
   as a breach would teach everybody to stop explaining. */
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ------------------------------------------------------------- one writer --- */

/**
 * ⚠️ ONE STATEMENT MAY WRITE `kind`, AND IT IS THE TRANSITION. `mayBecome` is
 * asked there; a second write somewhere else would not ask, and the direction
 * nobody wants is one line of SQL away at all times.
 */
const WRITES_KIND = /UPDATE\s+tenant\s+SET[^`;]*\bkind\s*=/is;
const writers = sources.filter((f) => WRITES_KIND.test(code(f)));
const ALLOWED_WRITER = "runtime/src/directory.ts";

for (const f of writers) {
  if (rel(f) !== ALLOWED_WRITER) {
    fail(`${rel(f)}: writes tenant.kind, and only ${ALLOWED_WRITER}'s transition may.\n` +
         `       That write is where \`mayBecome\` is asked. A second one is the one-way door with a side entrance.`);
  }
}
if (!writers.length) {
  fail(`nothing writes tenant.kind — the transition is gone, and every workspace is personal for ever`);
}
ok(`one writer: ${sources.length} source file(s), tenant.kind written by the transition and nowhere else`);

/* --------------------------------------------------- one place that asks --- */

/**
 * ⚠️ WHAT COMMERCIAL BUYS IS ASKED THROUGH `mayBrand` / `mayIsolate`, NEVER BY
 * COMPARING THE KIND. A capability that compares for itself is one that can be
 * added without anybody deciding it is a commercial one — and the day the answer
 * changes, the call sites that asked properly change and the ones that compared
 * do not, so two screens in one product disagree.
 */
const COMPARES = /\bkind\s*(===|!==)\s*["'`]commercial["'`]|["'`]commercial["'`]\s*(===|!==)\s*\w*[Kk]ind\b/;
const MAY_COMPARE = new Set([
  /* The definitions themselves — `isBusiness`, `mayBrand` and `mayIsolate` ARE
     the comparison, and having exactly one home is the property being kept. */
  "kernel/src/tenancy.ts",
  /* The gate, whose whole job is this one question, in the one walk. */
  "kernel/src/gate.ts",
]);
for (const f of sources) {
  if (MAY_COMPARE.has(rel(f))) continue;
  if (COMPARES.test(code(f))) {
    fail(`${rel(f)}: compares the kind directly.\n` +
         `       Ask \`mayBrand\` or \`mayIsolate\` — a capability that compares for itself is one nobody decided was commercial.`);
  }
}
ok(`one asker: what commercial buys is asked through the kernel, not compared at a call site`);

/* ------------------------------------------------------------- the gate --- */

/**
 * ⚠️ A GATE POSITION DECLARED AND NEVER READ REFUSES NOTHING, FOR EVER, and
 * reads on every screen as a limit that is working. Both halves are checked: the
 * position exists in the order, and the walk has a branch for it.
 */
const order = code(join(ENGINE, "kernel/src/operation.ts"));
const gate = code(join(ENGINE, "kernel/src/gate.ts"));

const positions = /export const GATE_ORDER = \[([\s\S]*?)\]/.exec(order)?.[1] ?? "";
const names = [...positions.matchAll(/"(\w+)"/g)].map((m) => m[1]);
if (!names.includes("kind")) {
  fail(`kernel/src/operation.ts: GATE_ORDER has no \`kind\` position, so nothing withholds a commercial-only capability`);
}
if (!/case "kind":/.test(gate)) {
  fail(`kernel/src/gate.ts: no branch for the \`kind\` position — declared and unread is the same as absent`);
}
if (!/op\.commercial/.test(gate)) {
  fail(`kernel/src/gate.ts: the kind branch never reads \`op.commercial\`, so no declaration reaches it`);
}

/**
 * ⚠️ AND A SCREEN MAY BE COMMERCIAL-ONLY TOO, WHICH THIS GUARD DID NOT ASK. The
 * field was on `ScreenSpec` from the day the gate landed and NOTHING READ IT: a
 * screen marked business-only was drawn in the nav, navigable and reachable by
 * URL in a personal workspace. The declaration was right, the manifest composed,
 * every test passed, and the mechanism was not there — which is the exact shape
 * the rest of this file exists to catch, one declaration over.
 *
 * ⚠️ THE OFFER AND THE REFUSAL ARE SEPARATE, AND BOTH ARE REQUIRED. `reachable`
 * decides what the chrome OFFERS; the gate decides what a route ALLOWS. Hiding
 * alone is not enforcement — anybody can type the address — and refusing alone
 * advertises a destination that answers 402.
 */
const shell = code(join(ENGINE, "design/src/frame/shell.tsx"));
if (!/s\.commercial/.test(shell)) {
  fail(`design/src/frame/shell.tsx: \`reachable\` never reads a screen's \`commercial\`, so a\n` +
       `       business-only screen is offered in a personal workspace — declared and unread.`);
}
/* ⚠️ In the gate's order, so the two walks cannot come to disagree about which
   refusal somebody meets first. */
const order3 = /held\.has[\s\S]{0,200}?commercial[\s\S]{0,200}?s\.flag/.test(shell);
if (!order3) {
  fail(`design/src/frame/shell.tsx: \`reachable\` asks permission → kind → flag or it asks them\n` +
       `       in some other order than the gate does, and a nav that disagrees with the gate\n` +
       `       advertises a destination the route refuses.`);
}

/*
  ⚠️ AND THE ORDER IS THE DESIGN, NOT A PREFERENCE. Above entitlement because no
  plan a personal workspace can buy unlocks this; below permission because a
  refusal about the workspace tells a stranger it exists.
*/
const at = (name) => names.indexOf(name);
if (!(at("permission") < at("kind") && at("kind") < at("entitlement"))) {
  fail(`kernel/src/operation.ts: \`kind\` must sit after \`permission\` and before \`entitlement\` — ` +
       `got ${names.join(" → ")}.\n` +
       `       Below entitlement it offers an upgrade that cannot help; above permission it tells a stranger the workspace exists.`);
}
ok("the gate: kind is a position, it is read, and it sits where the refusals make sense");

/* ------------------------------------------------------- whose brand it is --- */

/**
 * ⚠️ AN APP DECLARES WHICH SURFACES IT HAS AND NOTHING ELSE ABOUT BRANDING
 * (D22). It carried an entitlement once, which made "may this business use its
 * own logo" a question with a different answer per product on one workspace's
 * screens.
 */
const brand = code(join(ENGINE, "kernel/src/brand.ts"));
const def = /export interface WhitelabelDef \{([\s\S]*?)\n\}/.exec(brand)?.[1] ?? "";
if (/entitlement/.test(def)) {
  fail(`kernel/src/brand.ts: WhitelabelDef names an entitlement — branding is the WORKSPACE's (D22), ` +
       `and per-app it is three switches and two of them stale`);
}
if (!/readonly surfaces/.test(def)) {
  fail(`kernel/src/brand.ts: WhitelabelDef declares no surfaces, so no app can say what it has to brand`);
}

/* ⚠️ AND THE STORE IS IN THE DIRECTORY. The sign-in page and the installable
   manifest are read with no session and before any workspace is located — a
   brand beside the records is a flash of our colours on every cold start. */
const branding = code(join(ENGINE, "runtime/src/branding.ts"));
if (!/tenant_branding/.test(branding)) {
  fail(`runtime/src/branding.ts: no tenant_branding table — the brand has nowhere to live`);
}
/* ⚠️ ASKED OF THE LIST, NOT OF THE DEPLOYMENT. This read `one/src/index.ts`,
   which held the platform's module list until nine hand-written copies of it
   were found to have drifted. The list is `runtime/src/platform-schema.ts` now
   and every deployment and every harness reads it, so that is the one place the
   question has an answer. */
const directory = code(join(ENGINE, "runtime/src/directory.ts"));
const modules = code(join(ENGINE, "runtime/src/platform-schema.ts"));
if (/tenant_branding/.test(directory) === false && !/BRANDING_SCHEMA/.test(modules)) {
  fail(`runtime/src/platform-schema.ts: BRANDING_SCHEMA is not in DIRECTORY_MODULES, so every brand write hits a missing table`);
}
ok(`the brand: declared per app as surfaces only, stored once per workspace, in the directory`);

/* ------------------------------------------------------ one tile per place --- */

/**
 * ⚠️ THE MANIFEST AND THE ICON ANSWER BEFORE THE `/api/` PREFIX CHECK AND BEFORE
 * `identify`, because a phone fetches both with no session and often with no
 * cookie jar at all. Anything behind a login installs as a browser default,
 * silently, on every device.
 */
const serve = code(join(ENGINE, "runtime/src/serve.ts"));
for (const path of ["/manifest.webmanifest", "/icon.svg"]) {
  if (!serve.includes(path)) {
    fail(`runtime/src/serve.ts: nothing answers ${path}, so no workspace is installable`);
  }
}
const manifestAt = serve.indexOf("/manifest.webmanifest");
const apiAt = serve.indexOf('startsWith("/api/")');
if (manifestAt === -1 || apiAt === -1 || manifestAt > apiAt) {
  fail(`runtime/src/serve.ts: the installable routes are answered after the /api/ prefix check, ` +
       `so an unauthenticated phone gets "that is not here"`);
}
ok(`the tile: one installable per workspace, answered with no session`);

console.log(bad
  ? `\nworkspaces: ${bad} problem(s).`
  : `\nworkspaces: one kind, one writer, one gate position, one brand, one tile.`);
process.exit(bad ? 1 : 0);
