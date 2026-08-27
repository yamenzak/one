/**
 * AN APP IS A MANIFEST, AND IT REACHES FOR NOTHING (D12, D4).
 *
 * ⚠️ THE MOMENT AN APP CAN CALL A CROSS-CUTTING CONCERN, IT CAN FORGET ONE. A
 * gate that is invoked is a gate somebody can leave out of the next handler; an
 * audit entry that is written by hand is an audit entry twenty handlers do not
 * write. Neither failure is visible — no error, no failing test, a capability
 * that silently does not apply — so the rule is that an app cannot reach the
 * machinery at all, not that it should remember to use it.
 *
 * ⚠️ WHICH MAKES THE IMPORT THE CHECK. An app's source imports `@engine/kernel`
 * and nothing else of ours. The runtime is what the deployment wires; a manifest
 * that needed it would be a manifest doing something the platform should be
 * doing for every app.
 *
 * ⚠️ AND COMPOSITION HAPPENS INSIDE A REQUEST (D4). A `compose(...)` at module
 * scope runs at startup, for every app, on every cold start of every product —
 * so the catalogue that was meant to grow becomes the reason cold start does.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");
const APPS = join(ENGINE, "apps");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(ENGINE.length + 1);

const appDirs = existsSync(APPS)
  ? readdirSync(APPS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
  : [];

const sourcesOf = (app) => {
  const dir = join(APPS, app, "src");
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

/* --------------------------------------------------------------- the reach --- */

/**
 * ⚠️ THE LIST IS WHAT AN APP MAY IMPORT, not what it may not. A deny-list is one
 * package behind for ever: the next cross-cutting module is reachable the day it
 * is written, and nobody finds out until it is being called from three apps.
 */
const APP_MAY_IMPORT = ["kernel", "design"];

let reached = 0;
for (const app of appDirs) {
  for (const file of sourcesOf(app)) {
    for (const m of readFileSync(file, "utf8").matchAll(/from\s+["']@one\/([a-z-]+)/g)) {
      if (!APP_MAY_IMPORT.includes(m[1])) {
        reached++;
        fail(`${rel(file)}: an app imports @engine/${m[1]} (D12).\n` +
             `       A manifest declares; the platform does. Anything it could call, it could forget.`);
      }
    }
  }
}
if (!reached) ok(`reach: ${appDirs.length} app(s), none import the machinery`);

/* --------------------------------------------------------- the concerns --- */

/**
 * ⚠️ AND NOT BY ANY OTHER ROUTE EITHER. The import check is the shape; these are
 * the names, in case one of them ever arrives through a re-export or a helper.
 * Each is a concern the runtime applies to EVERY operation — an app calling one
 * is an app where it applies to the operations somebody remembered.
 */
const CONCERNS = [
  [/\bcheck\s*\(\s*\{/, "the gate"],
  [/\bapplySchema\s*\(/, "the schema runner"],
  [/\brecord\s*\(\s*\w+\s*,/, "the audit"],
  [/\bserve\s*\(\s*\{/, "the request path"],
];
let raised = 0;
for (const app of appDirs) {
  for (const file of sourcesOf(app)) {
    const code = stripComments(readFileSync(file, "utf8"));
    for (const [re, what] of CONCERNS) {
      if (re.test(code)) {
        raised++;
        fail(`${rel(file)}: an app raises ${what} itself (D12).\n` +
             `       It happens once, to every operation, or it happens to the ones somebody remembered.`);
      }
    }
  }
}
if (!raised) ok(`concerns: no app applies a gate, a schema, an audit or a route itself`);

/* ------------------------------------------------------------------- lazy --- */

/**
 * ⚠️ A `compose(...)` AT COLUMN ZERO RUNS AT STARTUP. Workers charge for
 * top-level module evaluation, so every app composed at module scope is in the
 * cold-start budget of every request to every other product — and the symptom is
 * not a failure, it is a deployment that gets slower each time it grows.
 */
const TOP_LEVEL = /^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*compose\s*\(/gm;
let eager = 0;
for (const dir of ["runtime/src", "design/src", ...appDirs.map((a) => `apps/${a}/src`)]) {
  const at = join(ENGINE, dir);
  if (!existsSync(at)) continue;
  const walk = (path) => {
    for (const e of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx)$/.test(e.name)) continue;
      const code = stripComments(readFileSync(full, "utf8"));
      for (const m of code.matchAll(TOP_LEVEL)) {
        eager++;
        fail(`${rel(full)}: \`${m[0].trim()}\` at module scope (D4).\n` +
             `       Composition belongs inside a request, so a product pays for the apps it serves.`);
      }
    }
  };
  walk(at);
}
if (!eager) ok(`lazy: nothing composes an app at startup`);

/* ------------------------------------------------------------- unbuilt --- */

/**
 * ⚠️ AND `defineApp` AT COLUMN ZERO IS THE SAME COST ONE STEP EARLIER. It builds
 * the literal and runs the whole refusal suite — the collections walk,
 * reachability, the roles walk, the ladder — so a manifest declared as a
 * top-level `const` is re-validated on every cold isolate over declarations that
 * cannot have changed since the deploy. Composition was already lazy; the
 * CONSTRUCTION above it was not, and the check that caught the one did not see
 * the other.
 *
 * ⚠️ THE THUNK IS THE WHOLE FIX, so what is checked is that the call is inside
 * one. A product nobody opens is then never built, and the four modules that ask
 * for one product's manifest build one between them.
 */
{
  const DECLARED = /^(?:export\s+)?(?:const|let|var)\s+\w+\s*(?::[^=\n]*)?=\s*defineApp\s*\(/gm;
  const built = [];
  for (const app of appDirs) {
    const at = join(ENGINE, `apps/${app}/src/index.ts`);
    if (!existsSync(at)) continue;
    const code = stripComments(readFileSync(at, "utf8"));
    for (const m of code.matchAll(DECLARED)) built.push(`apps/${app}/src/index.ts: ${m[0].trim()}`);
  }
  /* ⚠️ A floor, because no app and a clean tree read the same in green. */
  if (!appDirs.length) {
    fail("apps: no product directories were found at all, so this is passing over nothing.");
  } else if (built.length) {
    fail(`${built.join("\n       ")}\n` +
         "       builds a manifest at module scope. `defineApp` runs every refusal, so\n" +
         "       this is the whole check suite on every cold isolate over declarations\n" +
         "       that have not changed since the deploy. Put the literal inside the\n" +
         "       thunk the deployment already calls.");
  } else {
    ok(`unbuilt: ${appDirs.length} product(s), none builds its manifest at startup`);
  }
}

/* ------------------------------------------------------------------ suites --- */

/**
 * ⚠️ A SUITE THAT RETRIES IS A SUITE THAT IS WRONG SOME OF THE TIME AND GREEN ALL
 * OF IT. Every Workers-pool suite here writes the same fixture names into the
 * same databases — `northwind` is created by nine tests, one wallet is spent by a
 * dozen — so without a per-test storage stack each of those is a test of whichever
 * ran first. Measured on `@engine/ground`: roughly one run in two failed with
 * retries off, and the failure was never near the code that caused it.
 *
 * ⚠️ AND `retry` IS THE FIX SOMEBODY REACHES FOR, because it works: it turns the
 * red run green in one line, leaves the shared store in place, and absorbs the
 * next real intermittent failure along with this one. That is the whole reason
 * this is a script rather than a note — the wrong fix is a one-line edit made by
 * somebody in a hurry, and it looks exactly like a fix.
 */
const CONFIGS = [];
const findConfigs = (dir) => {
  const at = join(ENGINE, dir);
  if (!existsSync(at)) return;
  for (const e of readdirSync(at, { withFileTypes: true })) {
    if (e.isFile() && /^vitest\..*config\.[cm]?ts$/.test(e.name)) CONFIGS.push(join(at, e.name));
  }
};
for (const dir of ["one", "one-space", "runtime", "design", "kernel", ...appDirs.map((a) => `apps/${a}`)]) {
  findConfigs(dir);
}

let suites = 0;
for (const file of CONFIGS) {
  const code = stripComments(readFileSync(file, "utf8"));
  if (/\bretry\s*:/.test(code)) {
    suites++;
    fail(`${rel(file)}: sets \`retry\`.\n` +
         `       A retry is what a suite has instead of isolation. Give every test its\n` +
         `       own world (\`isolatedStorage: true\`) and let a genuine failure be red.`);
  }
  /* ⚠️ Only a suite that HAS a store can share one — a pure package has none. */
  if (/isolatedStorage\s*:\s*false/.test(code)) {
    suites++;
    fail(`${rel(file)}: turns the per-test storage stack OFF.\n` +
         `       Every test then reads whatever the last one left, and the assertion that\n` +
         `       fails is somewhere else entirely.`);
  }
}
if (!suites) ok(`suites: ${CONFIGS.length} vitest config(s), each giving every test its own world`);

/* --------------------------------------------------- and the other way --- */

/**
 * ⚠️ AND THE PLATFORM MUST NOT NAME A PRODUCT'S ROUTE, WHICH IS THE SAME RULE
 * READ FROM THE OTHER END. `Declared.tsx` renders whatever screens an app
 * declares — it is the one file in the deployment that is about every product
 * at once — and it ended every flow with `go("/products")`, because the first
 * flow anybody wrote happened to be a product's. The second app's flow would
 * have finished by moving somebody to a route it does not have: no error, no
 * failing test, a blank page after the one press that mattered.
 *
 * ⚠️ THE CHECK IS A PATH LITERAL, because that is the only shape the mistake
 * takes. A destination in these files is a screen's ID resolved through the
 * manifest (`Has.onGo`, `StorySpec.lands`); a string starting with a slash is
 * somebody spelling out an address the manifest already holds.
 */
const RENDERS_ANY_APP = ["one-space/src/centre/Declared.tsx", "one-space/src/centre/AppSurface.tsx"];

let named = 0;
for (const file of RENDERS_ANY_APP) {
  const code = readFileSync(join(ENGINE, file), "utf8")
    /* ⚠️ COMMENTS FIRST. This file's own header quotes the route it exists to
       have removed, and a guard that read its own argument as the offence would
       be one nobody could write the explanation for. */
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const [, path] of code.matchAll(/["'`](\/[a-z][\w-]*)["'`]/g)) {
    named++;
    fail(`${file}: names the route "${path}".\n` +
         `       This file draws every product's screens. A destination here is a screen's\n` +
         `       ID through the manifest — a path is one product's address in the platform.`);
  }
}
if (!named) {
  ok(`routes: ${RENDERS_ANY_APP.length} file(s) that draw any app, none naming one's address`);
}

/*
  ⚠️ ONE SCREEN, ONE `Declared` — and only a key makes that true. A lateral move
  is not a rebuild, so without one the component persists across it and carries
  the answer it already held into the next screen: `useLoad` deliberately keeps a
  `ready` rather than blanking, which is right within a screen and wrong across
  two. What that produced was a flow reading another screen's `acts` and
  reporting its own write as missing, and a body reading views by ids the old
  answer does not have and drawing them as confidently empty — for one render,
  on every open, which is long enough to see and short enough to disbelieve.

  ⚠️ AND IT IS CHECKED HERE RATHER THAN RENDERED, because what has to be true is
  about the MOUNT rather than about any output: two screens drawn by one
  component instance. A test would have to navigate and catch a single frame; the
  key either is on the element or it is not.
*/
const MOUNT = "one-space/src/centre/AppSurface.tsx";
const mounted = readFileSync(join(ENGINE, MOUNT), "utf8");
const opens = mounted.indexOf("<Declared");
if (opens < 0) {
  fail(`${MOUNT}: draws no <Declared>, so this guard covers nothing.\n` +
       `       It moved — point this at the file that mounts it.`);
} else if (!/^\s*key=\{/m.test(mounted.slice(opens, opens + 400))) {
  fail(`${MOUNT}: <Declared> is mounted with no \`key\`.\n` +
       `       One instance would then draw two screens, and the second would open on\n` +
       `       the first's answer for a render — see the note above this check.`);
} else {
  ok("mounting: a screen change replaces the component that draws it");
}

/*
  ⚠️ A DECLARED BODY GOES IN A `Screen`, IN THE FIXTURE **AND** IN THE
  DEPLOYMENT. `Body` places blocks and nothing else: the rhythm between them, the
  gutter, the reading width, the shape's skeleton and the arrival stagger are all
  the frame's. The board has wrapped one since it was written and says so; the
  deployment did not, so the hero and the blocks under it were not siblings in
  anything with a gap and sat touching, while the grid inside kept its own — one
  column, two rhythms, on the screen a product is read on first.

  ⚠️ AND IT IS A SOURCE CHECK BECAUSE NO BROWSER SUITE MOUNTS THE SHIPPED
  COMPOSITION. Every sweep mounts a ground, or a shell whose child is inert on
  purpose — so `AppSurface → Declared → Body` is measured by nothing, and the
  fixture reported one rhythm while a phone showed two. Until something drives
  that path, the cheapest true statement is that both callers frame a body the
  same way.
*/
const FRAMES_A_BODY = [
  "one-space/src/centre/Declared.tsx",
  "apps/inventory/src/screens/ground.tsx",
];
let bare = 0;
for (const file of FRAMES_A_BODY) {
  const code = readFileSync(join(ENGINE, file), "utf8");
  if (!code.includes("<Body")) {
    fail(`${file}: draws no <Body>, so this guard covers nothing.\n` +
         `       It moved — point this at the file that draws one.`);
    bare++;
  } else if (!code.includes("<Screen")) {
    fail(`${file}: draws a <Body> outside any <Screen>.\n` +
         `       The frame carries the rhythm between blocks, the gutter, the reading\n` +
         `       width and the shape's skeleton — see the note above this check.`);
    bare++;
  }
}
if (!bare) ok(`framing: ${FRAMES_A_BODY.length} caller(s) draw a declared body inside its frame`);

console.log(bad
  ? `\napps: ${bad} finding(s) — an app doing what the platform is for.`
  : `\napps: manifests declare, the platform does, and composition waits for a request.`);
process.exit(bad ? 1 : 0);
