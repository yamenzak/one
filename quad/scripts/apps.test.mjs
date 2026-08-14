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
 * ⚠️ WHICH MAKES THE IMPORT THE CHECK. An app's source imports `@quad/kernel`
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
const QUAD = join(HERE, "..");
const APPS = join(QUAD, "apps");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(QUAD.length + 1);

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
const APP_MAY_IMPORT = ["kernel", "web"];

let reached = 0;
for (const app of appDirs) {
  for (const file of sourcesOf(app)) {
    for (const m of readFileSync(file, "utf8").matchAll(/from\s+["']@quad\/([a-z-]+)/g)) {
      if (!APP_MAY_IMPORT.includes(m[1])) {
        reached++;
        fail(`${rel(file)}: an app imports @quad/${m[1]} (D12).\n` +
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
for (const dir of ["runtime/src", "web/src", ...appDirs.map((a) => `apps/${a}/src`)]) {
  const at = join(QUAD, dir);
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

console.log(bad
  ? `\napps: ${bad} finding(s) — an app doing what the platform is for.`
  : `\napps: manifests declare, the platform does, and composition waits for a request.`);
process.exit(bad ? 1 : 0);
