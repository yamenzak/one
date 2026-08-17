/**
 * EVERY PATH THE PLATFORM ANSWERS IS A PATH THE DEPLOYMENT ROUTES TO IT.
 *
 * ⚠️ THIS HAS FAILED TWICE, THE SAME WAY, AND SILENTLY BOTH TIMES. The worker
 * asks `isPlatformPath` once and hands everything else to the static assets. The
 * manifest and the icon were answered by `serve.ts` and left out of that list, so
 * a phone asking for the manifest got `index.html` with a 200 on it. Then
 * `/webhook/stripe` was added the same way — and every Stripe event came back
 * `405` from the asset handler, which Stripe retries and then gives up on: money
 * captured, nothing granted, and no error anywhere, because from the worker's
 * side no request was ever refused.
 *
 * ⚠️ NEITHER SHOWED UP IN A TEST, AND NEITHER COULD. The route existed, the
 * handler existed, every unit test of both passed. What was missing was one
 * string in one list, one file away — which is a question about SHAPE, so it is
 * asked here rather than by a fixture.
 *
 * ⚠️ AND IT READS THE TWO HALVES SEPARATELY ON PURPOSE. Deriving both from one
 * place would make this guard agree with itself; the whole failure is the two
 * disagreeing.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVE = "runtime/src/serve.ts";
const src = readFileSync(join(ENGINE, SERVE), "utf8");

let bad = 0;
const fail = (why) => { bad++; console.log(`BAD  ${why}`); };
const ok = (said) => console.log(`ok   ${said}`);

/* ------------------------------------------------------- the constants --- */

/**
 * ⚠️ A PATH MAY BE A NAMED CONSTANT, and naming it is the fix this guard exists
 * to encourage — so a check that only understood literals would refuse the
 * shape it is asking for.
 */
const CONSTS = Object.fromEntries(
  [...src.matchAll(/(?:export )?const (\w+) = "(\/[^"]*)"/g)].map((m) => [m[1], m[2]]),
);
const literal = (token) => (token.startsWith('"') ? token.slice(1, -1) : CONSTS[token]);

/* --------------------------------------------------------- what it answers --- */

/** Every path compared against the request's own, however it is written. */
const answers = new Set();
for (const m of src.matchAll(/url\.pathname (?:===|!==) ("(?:\/[^"]*)"|\w+)/g)) {
  const path = literal(m[1]);
  if (path) answers.add(path);
}
for (const m of src.matchAll(/url\.pathname\.startsWith\(("\/[^"]*"|\w+)\)/g)) {
  const path = literal(m[1]);
  if (path) answers.add(path);
}

/* ⚠️ AND THE SET IT DISPATCHES OFF, whose members are answered by a lookup
   rather than by a comparison — which is exactly why they were missed. */
const set = /const INSTALLABLE = new Set\(\[([\s\S]*?)\]\)/.exec(src);
const installable = new Set(
  set ? [...set[1].matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]) : [],
);
for (const path of installable) answers.add(path);

if (!answers.size) {
  fail(`${SERVE}: no path found at all — this guard has stopped reading the file it checks`);
}

/* ---------------------------------------------------------- what is routed --- */

const asked = /export const isPlatformPath[\s\S]*?;\n/.exec(src);
if (!asked) {
  fail(`${SERVE}: no \`isPlatformPath\` — the one question the deployment asks before\n` +
       `       handing a request to the static assets`);
}
const routed = asked ? asked[0] : "";

/**
 * ⚠️ `INSTALLABLE.has(...)` ROUTES EVERY MEMBER, which is the one indirection
 * this expression is allowed to have — the set is right beside it and both
 * halves read it.
 */
const routesInstallable = /INSTALLABLE\.has\(/.test(routed);

const accepted = new Set(
  [...routed.matchAll(/(?:=== |startsWith\()("\/[^"]*"|\w+)\)?/g)]
    .map((m) => literal(m[1]))
    .filter(Boolean),
);
if (routesInstallable) for (const path of installable) accepted.add(path);

/* ------------------------------------------------------------- the check --- */

const missed = [...answers].filter((path) => !accepted.has(path)).sort();
for (const path of missed) {
  fail(`${SERVE} answers "${path}" and \`isPlatformPath\` does not name it.\n` +
       `       The worker hands everything that question refuses to the static\n` +
       `       assets, so this path answers whatever they say — 200 with the page\n` +
       `       on it for a GET, 405 for anything else — and nothing fails anywhere.`);
}
if (!missed.length) {
  ok(`routed: ${answers.size} path(s) answered by ${SERVE}, every one of them reached`);
}

/* ⚠️ AND THE OTHER DIRECTION IS NOT CHECKED, deliberately. A path routed here
   and answered nowhere gets the platform's own 404, which is a correct answer
   and a visible one — the opposite of the failure above. */

console.log("");
console.log(bad
  ? `routing: ${bad} path(s) answered and unreachable.`
  : "routing: every path the platform answers is one the deployment routes to it.");
process.exit(bad ? 1 : 0);
