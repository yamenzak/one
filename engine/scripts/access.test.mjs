/**
 * TWO AUTHORITIES ON ONE MEMBERSHIP, RESOLVED PER APP (D15).
 *
 * ⚠️ THE CLASS THIS CATCHES PASSES EVERY OTHER TEST. A flat permission set on
 * the caller typechecks, serves, and answers every single-app suite green — and
 * resolves against whichever app happens to be first on the tenant's list, so a
 * role in the second product grants nothing, silently, for everybody. The same
 * shape on the granting side is worse: bounding a role assignment with the
 * wrong authority's keys is a two-step escalation that no runtime test can
 * prove absent for every app a deployment will ever serve. Structural, because
 * the defect is an ABSENCE.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const serve = strip(readFileSync(join(ENGINE, "runtime/src/serve.ts"), "utf8"));
const membership = strip(readFileSync(join(ENGINE, "runtime/src/membership.ts"), "utf8"));
const inbox = strip(readFileSync(join(ENGINE, "runtime/src/inbox.ts"), "utf8"));
const one = strip(readFileSync(join(ENGINE, "one/src/index.ts"), "utf8"));

/* -------------------------------------------------------------- context --- */

/**
 * ⚠️ THE GATE'S SET IS THE OPERATION'S OWN APP'S. `performOperation` must build
 * the caller from `permissionsIn(composed.app.id)` — anything else is a set
 * resolved in some other context, and the gate then answers a different
 * question than the one it is asked.
 */
if (!/permissionsIn\(composed\.app\.id\)/.test(serve)) {
  fail(`runtime/src/serve.ts: the gate no longer resolves the caller's keys for the\n` +
       `       operation's own app — whatever context the set came from, it is the\n` +
       `       wrong one for every app after the first.`);
} else if (/located\.apps\[0\]/.test(one)) {
  fail(`one/src/index.ts: identity resolves against \`located.apps[0]\` — the exact\n` +
       `       bug D15 closed: a role in the second product grants nothing, silently.`);
} else if (!/permissionsResolver\(/.test(one)) {
  fail(`one/src/index.ts: does not build \`permissionsIn\` from the runtime's\n` +
       `       resolver — a hand-rolled copy is the second implementation of "what\n` +
       `       can this person do", and the one that drifts.`);
} else {
  ok(`context: the caller's keys are resolved for the app the operation belongs to`);
}

/* -------------------------------------------------------------- bounded --- */

/**
 * ⚠️ EVERY ROLE IN AN ASSIGNMENT IS BOUNDED AGAINST ITS OWN AUTHORITY — the
 * platform role against the granter's platform keys, each app's role against
 * the granter's keys IN THAT APP. A previous platform carried the checking
 * function with no caller at all; the cheap regression is checking one
 * authority and not the other.
 */
const bounds = membership.match(/async function beyondGranter[\s\S]*?\n}/);
if (!bounds) {
  fail(`runtime/src/membership.ts: \`beyondGranter\` is gone — the function that\n` +
       `       bounds an assignment has no successor, which is how a previous\n` +
       `       platform shipped invite-yourself-as-owner.`);
} else {
  const body = bounds[0];
  const platform = /canAssign\(by\.platform,[\s\S]*?PLATFORM_ROLES\)/.test(body);
  const perApp = /canAssign\(await by\.inApp\(appId\),/.test(body);
  if (!platform) {
    fail(`runtime/src/membership.ts: \`beyondGranter\` no longer bounds the PLATFORM\n` +
         `       role — anybody who can invite can mint an owner.`);
  } else if (!perApp) {
    fail(`runtime/src/membership.ts: \`beyondGranter\` no longer bounds each APP role\n` +
         `       against the granter's keys in that app — the same escalation with a\n` +
         `       shorter first step.`);
  } else if (!/await beyondGranter\(by, input, registryFor\)/.test(membership) ||
             !/await beyondGranter\(by, target, registryFor\)/.test(membership)) {
    fail(`runtime/src/membership.ts: \`beyondGranter\` is not asked at both doors —\n` +
         `       the invitation and the removal. Bounding one and not the other is\n` +
         `       the door somebody leaves open.`);
  } else {
    ok(`bounded: platform role and every app role, each against its own authority`);
  }
}

/* ------------------------------------------------------------- audience --- */

/**
 * ⚠️ A NOTIFICATION'S AUDIENCE IS WHAT EACH MEMBER MAY DO IN THE APP THAT
 * RAISED IT. Resolved app-blind, a role in one product rings bells about
 * another product's events for people who cannot even open it.
 */
if (!/permissionsFor\(member,\s*appId/.test(inbox)) {
  fail(`runtime/src/inbox.ts: the audience is resolved without the app — a role in\n` +
       `       one product is told about every product's events.`);
} else {
  ok(`audience: told about an app's events by what you may do in that app`);
}

/* --------------------------------------------------------------- target --- */

/**
 * ⚠️ A CROSS-APP PLATFORM OPERATION NAMES ITS TARGET APP IN THE INPUT. Every
 * composition carries the same op ids, and the route resolves whichever app is
 * FIRST on the tenant's list — an op bound to its composing app answers for
 * that app for ever, so the second product's packages and settings are simply
 * unreachable, with every single-app suite green.
 */
const rails = ["runtime/src/packages.ts", "runtime/src/settings.ts"]
  .map((f) => [f, strip(readFileSync(join(ENGINE, f), "utf8"))]);
const untargeted = rails.filter(([, src]) =>
  !/const targetOf/.test(src) || !/ctx\.enabledApps\.includes\(named\)/.test(src));
if (untargeted.length) {
  fail(`${untargeted.map(([f]) => f).join(", ")}: the platform ops no longer resolve a\n` +
       `       target app from the input — they answer for whichever app is first on\n` +
       `       the tenant's list, and only that one, for ever.`);
} else {
  ok(`target: packages and settings answer for the app the input names`);
}

/* ------------------------------------------------------------------ end --- */

console.log(`\naccess: two authorities on one membership, resolved per app.`);
if (bad) process.exit(1);
