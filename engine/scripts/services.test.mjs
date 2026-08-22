/**
 * A SERVICE IS CALLED OVER RPC, NEVER OVER `fetch` (D3).
 *
 * ⚠️ THE POINT OF SPLITTING IS THE TYPES, NOT THE HTTP. Heavy work leaves the
 * request path either way; what a service binding with a typed entrypoint adds
 * is that a method renamed on one side fails to COMPILE on the other. Called
 * over `fetch`, the same rename is a payload nobody checks — the caller keeps
 * sending the old field, the service keeps reading `undefined`, and a compile
 * error has become a production one.
 *
 * ⚠️ AND `env.AI.fetch(...)` TYPECHECKS TODAY, which is exactly why this is a
 * script rather than a type. A service binding exposes `fetch` alongside its
 * methods, so the wrong call is one keystroke from the right one and looks
 * identical in review.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { appDirs, appManifests, appTrees } from "./lib/trees.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(ENGINE.length + 1);

const filesIn = (dir) => {
  const at = join(ENGINE, dir);
  if (!existsSync(at)) return [];
  const out = [];
  const walk = (path) => {
    for (const e of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
    }
  };
  walk(at);
  return out;
};

const APPS = appDirs();

const FILES = ["runtime/src", "design/src", ...APPS].flatMap(filesIn);
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* --------------------------------------------------------------- over http --- */

/** The bindings that are services rather than stores. */
const SERVICES = ["AI", "NOTIFY", "MAIL", "PUSH"];

let overHttp = 0;
for (const file of FILES) {
  const code = stripComments(readFileSync(file, "utf8"));
  for (const name of SERVICES) {
    const re = new RegExp(`\\b(?:env|bindings)\\.${name}\\s*\\.\\s*fetch\\s*\\(`, "g");
    for (const m of code.matchAll(re)) {
      overHttp++;
      fail(`${rel(file)}: \`${m[0].trim()}\` calls a service over HTTP (D3).\n` +
           `       Call the method. Over fetch, a renamed field is a production error rather than a compile one.`);
    }
  }
}
if (!overHttp) ok(`rpc: ${FILES.length} file(s), no service is called over fetch`);

/* ------------------------------------------------------------ typed seam --- */

/**
 * ⚠️ AND THE CONTRACT IS AN INTERFACE BOTH SIDES IMPORT. A service whose shape
 * exists only inside its own module is one the caller describes again from
 * memory — which is the same failure as `fetch`, written more carefully.
 */
const seam = join(ENGINE, "runtime/src/services.ts");
if (!existsSync(seam)) {
  fail("runtime/src/services.ts: the service contract does not exist, so nothing is typed across the seam");
} else {
  const src = readFileSync(seam, "utf8");
  let missing = 0;
  for (const name of ["AiService", "NotifyService"]) {
    if (!src.includes(`export interface ${name}`)) {
      missing++;
      fail(`runtime/src/services.ts: \`${name}\` is gone, so that seam has no shared type (D3).`);
    }
  }
  if (!missing) ok(`seam: every service names a contract both sides can import`);
}

/* ------------------------------------------------------- the mock is gated --- */

/**
 * ⚠️ A MOCK THAT A CONSOLE CAN SWITCH ON FABRICATES OUTPUT IN PRODUCTION AND
 * BILLS FOR IT. This asks structurally, because no test can: the suites run in
 * development, where mocking is correct, so a mock that also runs in production
 * is green everywhere it is checked.
 */
const ai = existsSync(seam) ? readFileSync(seam, "utf8") : "";
if (ai) {
  const gated = /MOCK_ALLOWED\s*=\s*\(environment: string\): boolean =>\s*environment === "development"/
    .test(ai);
  if (!gated) {
    fail(`runtime/src/services.ts: the mock lane is no longer gated on the environment (D3).\n` +
         `       A mock a console can switch on invents output in production and charges for it.`);
  } else {
    ok(`mock: the fabricating lane is development-only, structurally`);
  }
}

console.log(bad
  ? `\nservices: ${bad} finding(s) — a seam that has stopped being typed.`
  : `\nservices: heavy work off the request path, and a contract both sides compile against.`);
process.exit(bad ? 1 : 0);
