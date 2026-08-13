/**
 * WHAT THE PLATFORM OWNS, AND WHICH AN APP MAY NEVER ANSWER FOR ITSELF.
 *
 * ⚠️ THE FAILURE THIS EXISTS FOR HAS HAPPENED TWICE IN THIS REPOSITORY, ONCE IN
 * EACH DIRECTION, AND NEITHER TIME DID ANYTHING FAIL.
 *
 * The first: a sweep that acts on a workspace's own customers asked whether the
 * workspace was in arrears by reading a `subscription` row directly. The payer
 * then moved from the workspace to the account, that row stopped being written,
 * and the read kept succeeding against a table nothing maintains — so the freeze
 * silently never fired again and every suspended workspace resumed acting on
 * records it could no longer see. The sweep reported clean runs throughout.
 *
 * The second, in the old repository: three apps each grew their own copy of the
 * identity door, and one of them mounted the send-guard after the catch-all —
 * which typechecks, passes every test, and is invisible in a route list.
 *
 * ⚠️ SO THE RULE IS STRUCTURAL RATHER THAN CULTURAL. An app may not name a
 * platform-owned TABLE, and may not import a platform-owned STORE function. What
 * it gets instead is an answer resolved once, by the runtime, and handed to it —
 * `ctx.standing` on a job, `caller.entitlements` on a request. A copy of the
 * question is a copy that can go out of date, and the way it goes out of date is
 * always by continuing to work.
 *
 * ⚠️ AND IT CHECKS THE APPS RATHER THAN THE PACKAGES. `runtime/` is where these
 * tables live and reading them there is the point; the rule is about who ELSE
 * may. An app is a directory under `platform/` with a `src/manifest.ts`, which
 * is the same discriminator every other guard here uses.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");

let bad = 0;
const fail = (m) => { bad++; console.error(`BAD  ${m}`); };
const ok = (m) => console.log(`ok   ${m}`);

/**
 * ⚠️ EVERY TABLE HERE IS ONE WHOSE CONTENTS ARE ABOUT THE RELATIONSHIP BETWEEN
 * THE PLATFORM AND SOMEBODY, rather than about what an app does. An app reading
 * one is an app that has an opinion about money, identity or standing — and the
 * opinion is a second answer to a question the runtime already resolves.
 */
const OWNED_TABLES = [
  /* Money. */
  "account_subscription", "account_credit", "subscription", "ledger",
  "provider_customer", "parked_event", "applied_event", "plan_override",
  /* Identity. */
  "accounts", "credentials", "challenges", "sessions", "session_directory",
  "otp_codes", "provisioning",
  /* Addressing. */
  "tenant_directory", "tenant_domains",
];

/**
 * ⚠️ THE STORE FUNCTIONS, because an import is the other way to reach the same
 * row. Naming the table alone would leave `subscriptionForTenant(...)` — the
 * exact call the live defect was made of — passing a guard written to catch it.
 */
const OWNED_CALLS = [
  "subscriptionForTenant", "subscriptionsOf", "subscriptionById", "startSubscription",
  "claimSubscription", "claimableFor", "applyToSubscription", "compSubscription",
  "grantCredits", "spendCredits", "refundCredits", "balanceFor", "grantAllowance",
  "readSubscription", "standingFor", "standingOf", "choosePlanFor", "setAdjustments",
  "placeTenant", "recordSession", "issueCode",
];

/**
 * ⚠️ A STATED EXEMPTION, NAMING THE FILE AND THE REASON — never a blanket one.
 * The form is the same as the vocabulary guard's, for the same reason: an
 * exemption somebody has to write out is one somebody has to justify, and one
 * that lives in a list at the top of a script is one nobody reads again.
 */
const MARKER = /platform-owned-exempt:\s*(\S)/;

const walk = (dir) => {
  let out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(full));
    else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) out.push(full);
  }
  return out;
};

const apps = readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && exists(join(ROOT, e.name, "src", "manifest.ts")))
  .map((e) => e.name);

function exists(p) {
  try { statSync(p); return true; } catch { return false; }
}

if (apps.length === 0) fail("no app found under platform/ — this guard has nothing to check.");

/*
  ⚠️ SOURCE ONLY, NOT TESTS. A test may reach past the surface to age a row or
  seed a state — that is what a fixture IS, and the honest ones say so. What may
  not happen is an app SHIPPING a read of somebody else's table.
*/
const files = apps.flatMap((app) => walk(join(ROOT, app, "src")));

const TABLE_RE = new RegExp(`\\b(?:FROM|INTO|UPDATE|JOIN)\\s+(${OWNED_TABLES.join("|")})\\b`, "gi");
const CALL_RE = new RegExp(`\\b(${OWNED_CALLS.join("|")})\\s*\\(`, "g");

let hits = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  const at = (index) => src.slice(0, index).split("\n").length;
  /*
    ⚠️ THE WHOLE COMMENT ATTACHED TO THE STATEMENT, NOT A FIXED NUMBER OF LINES
    ABOVE IT. Every other marker in this repo looks two lines back, which is
    right where the reason is one sentence — and wrong here, because the reasons
    this guard accepts are the ones that take a paragraph. A fixed window makes
    the fix "write less about why", which is precisely backwards.
  */
  const exempted = (line) => {
    /*
      Walk up to the opening of the comment block immediately above, and read the
      whole of it. Bounded so a file with no comment above a statement does not
      scan to the top of the file looking for one.
    */
    const start = Math.max(0, line - 40);
    for (let i = line - 2; i >= start; i--) {
      const text = lines[i] ?? "";
      if (text.includes("*/") && i < line - 2) break;
      if (text.includes("/*")) {
        return MARKER.test(lines.slice(i, line - 1).join("\n"));
      }
    }
    return MARKER.test(lines.slice(Math.max(0, line - 3), line - 1).join("\n"));
  };

  for (const m of src.matchAll(TABLE_RE)) {
    const line = at(m.index);
    if (exempted(line)) continue;
    hits++;
    fail(`${relative(ROOT, file)}:${line}: reads the platform's own \`${m[1]}\`.\n` +
         `       An app with its own answer about money, identity or standing has a SECOND\n` +
         `       answer — and it goes out of date by continuing to work. Ask the runtime for\n` +
         `       it, or state why with \`platform-owned-exempt: <reason>\` above the line.`);
  }
  for (const m of src.matchAll(CALL_RE)) {
    const line = at(m.index);
    if (exempted(line)) continue;
    hits++;
    fail(`${relative(ROOT, file)}:${line}: calls the platform's own \`${m[1]}\`.\n` +
         `       Naming the table alone would leave exactly this call passing a guard written\n` +
         `       to catch it, which is how the live defect was made. Ask the runtime, or state\n` +
         `       why with \`platform-owned-exempt: <reason>\` above the line.`);
  }
}
ok(`owned: ${apps.length} app(s), ${files.length} source file(s), ${hits} reach(es) past the runtime`);

/*
  ⚠️ AND THE ANSWER HAS TO BE THERE TO ASK FOR. A rule that forbids an app from
  resolving standing itself, on a runtime that never hands standing down, is a
  rule that forces every app to break it — so the seam is asserted rather than
  assumed.
*/
const jobCtx = readFileSync(join(ROOT, "kernel", "src", "job.ts"), "utf8");
if (!/readonly standing:\s*StandingState \| null/.test(jobCtx)) {
  fail(`kernel/src/job.ts: a scoped job is not given its workspace's standing.\n` +
       `       Without it every app that must not act on a suspended workspace has to read a\n` +
       `       billing table to find out, which is the thing this guard forbids.`);
} else {
  ok("seam: a scoped job is handed its workspace's standing");
}

const runner = readFileSync(join(ROOT, "runtime", "src", "jobs.ts"), "utf8");
if (!/standing:\s*tenantId \?/.test(runner)) {
  fail(`runtime/src/jobs.ts: the job runner declares a standing it never resolves.\n` +
       `       A field that is always absent is worse than none: every handler reads it as\n` +
       `       "nothing is wrong" and the freeze it exists for never fires.`);
} else {
  ok("seam: the runner resolves it per tenant, and null for a platform-scoped job");
}

/*
  ⚠️ AND THE PLATFORM'S OWN OPERATIONS ARE MOUNTED UNCONDITIONALLY, which is the
  auth half of the same rule. The failure it prevents is the one this whole
  repository is a reaction to: in the old codebase three apps each grew their own
  identity door, and one mounted the send-guard AFTER the catch-all — a bypass
  that typechecks, passes every test, and looks identical in a route list.

  Here an app cannot forget, because it never mounts anything: the route table is
  built from the registry and these three families are always in it. That is a
  stronger property than any test of a particular app, and it is worth asserting
  because it is one `if` away from being a per-app decision again.
*/
const registry = readFileSync(join(ROOT, "runtime", "src", "runtime.ts"), "utf8");
const mounted = registry.match(/for \(const op of \[([^\]]*)\]\)/s)?.[1] ?? "";
for (const family of ["platformOperations", "identityOperations", "marketOperations"]) {
  if (!mounted.includes(`...${family}(app)`)) {
    fail(`runtime/src/runtime.ts: \`${family}\` is not mounted for every app.\n` +
         `       An app that can decline the identity door is an app that can grow its own —\n` +
         `       which is how a send-guard came to sit after the catch-all, invisibly.`);
  }
}
if (!bad) ok(`mounted: platform, identity and marketplace operations, for every app, unconditionally`);

/*
  ⚠️ AND EVERY APP PUBLISHES WHAT IT DECLARES, at boot, or the console cannot
  describe it.

  The store is shared and its rows are keyed by app, so one operator door can
  already WRITE every product's configuration and its prices. What it cannot do
  is read what a product SHIPPED — the plans, the entitlement keys, the settings,
  the sellable flags live in that worker's bundle — so an override with no
  declaration beside it makes every edit look like the first.

  ⚠️ AND A MISSING PUBLISH IS THE QUIETEST FAILURE IN THE SET. `publishApp`
  swallows its own errors on purpose (boot must not throw over a console in
  another product), an unpublished app is simply absent from `app_specs`, and an
  absent row looks exactly like a product that declares nothing. Every suite
  stays green. It has happened once already, to `vault_specs`, for the life of
  that feature.
*/
for (const app of apps) {
  const boot = join(ROOT, app, "src", "worker.ts");
  const text = existsSync(boot) ? readFileSync(boot, "utf8") : "";
  if (!/publishApp\(/.test(text)) {
    fail(`${app}/src/worker.ts never calls \`publishApp\`.\n` +
         `       Its vault wants, its legal documents, its catalogue and its settings are then\n` +
         `       absent from the store every other product reads — and absent is indistinguishable\n` +
         `       from "this product declares nothing". Nothing fails; the console is just empty.`);
  }
}
if (!bad) ok(`published: ${apps.length} app(s) hand their declarations to the store the console reads`);

if (bad) {
  console.error(`\n${bad} ownership failure(s).`);
  process.exit(1);
}
console.log(`\nowned: money, identity and addressing are the platform's — no app answers them for itself.`);
