#!/usr/bin/env node
/**
 * A SCHEMA MODULE AN APP APPLIES MUST HAVE A ROUTE TREE BEHIND IT.
 *
 * ── The failure this catches, which is the whole platform audit in one shape ─
 *
 * A shared package ships three things: a `SchemaModule`, sometimes a Durable
 * Object, and a route tree. An app that adopts the first two and forgets the
 * third has TABLES for a capability, a DO bound in its `wrangler.jsonc`,
 * dispatch sites happily writing rows — and no way for a person to reach any of
 * it. **Nothing fails.** Typecheck passes, the package's own suite passes, the
 * app's suite passes, and the capability is simply absent.
 *
 * It is not hypothetical, and it is not rare:
 *
 *   Scena carried `@4dl/notify` in exactly that state for three stages — schema,
 *   `InboxDO` (migration v5), the registry, sixteen dispatch sites — with no
 *   route to read a notification back. A note in CLAUDE.md said the bell would
 *   "land with the Stage 7 UI rewrite"; Stage 7 shipped and it did not, and the
 *   sentence then became a reason not to look.
 *
 *   `otpSendGuard` — the one gate in front of the emailed sign-in code, carrying
 *   the bot check, the per-IP ceiling and the deliverability pre-flight — was
 *   mounted by one app out of three.
 *
 *   `@4dl/tenancy`'s close routes and `@4dl/auth`'s self-delete did not exist in
 *   two apps whose route guards had exempted those exact paths from every rung
 *   of the standing ladder since the day they were written. The exemption
 *   protected nothing, and a suspended tenant was in a trap.
 *
 * ── What it reads, and why it is source text ────────────────────────────────
 *
 * `SCHEMA_MODULES` in each app's `db.ts` names what is INSTALLED. `index.ts`
 * names what is MOUNTED. Both are read as source: importing them would boot a
 * worker, and the question is structural. `apps.json` supplies the app list, so
 * a fourth product is asked the same question the day it is registered.
 *
 * ⚠️ Every rule below is asserted to MATCH SOMETHING somewhere. A rule naming a
 * module no app applies, or an export no app mounts, is a rule that has silently
 * stopped checking — the exact failure mode this file exists to catch, one level
 * up.
 *
 * Plain Node, no dependencies, like the rest of `scripts/`.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const REGISTRY = JSON.parse(readFileSync(join(ROOT, "apps.json"), "utf8"));

/**
 * Source with comments blanked out.
 *
 * ⚠️ REQUIRED, not tidiness. Every file in this repo explains what it does, so
 * `notifications.ts` says "`notifyRoutes` reads that registry" in prose — and a
 * raw-text match then reports the inbox as mounted in an app that deleted the
 * mount and kept the paragraph. The mutation test that renamed `notifyRoutes`
 * passed twice before this landed: once on a substring match, once on a comment.
 * A guard that matches its own documentation of a feature is a guard that
 * verifies the feature was once described.
 */
/**
 * ⚠️ IMPORTS ARE NOT MOUNTS, and stripping them is what makes this check mean
 * anything.
 *
 * The search below is over the app's WHOLE `src`, because a route tree is often
 * mounted somewhere other than `index.ts` — Kova binds `emailAdminRoutes` in
 * `billing-routes.ts`, Scena binds `staffRoutes` in `member-routes.ts`. The cost
 * of that breadth is that an `import { fooRoutes }` line satisfies the match on
 * its own, so an app that imports a tree and never mounts it reads as wired. A
 * mutation that renamed only the CALL passed, which is the whole failure mode
 * this file is named after wearing a different hat.
 */
function stripImports(src) {
  let inImport = false;
  return src
    .split("\n")
    .map((line) => {
      if (!inImport && /^\s*import\b/.test(line)) inImport = true;
      if (!inImport) return line;
      // An import statement ends at its module specifier, on whichever line
      // that lands — these files wrap long specifier lists across many.
      if (/\bfrom\s*["'][^"']*["']\s*;?\s*$/.test(line) || /^\s*import\s*["'][^"']*["']\s*;?\s*$/.test(line)) inImport = false;
      return "";
    })
    .join("\n");
}

/**
 * Blank out comments, PRESERVING LINE STRUCTURE — and without being fooled by a
 * string.
 *
 * ⚠️ The two-regex version this replaces read the star inside `"/api/auth/*"` as
 * the start of a block comment and swallowed everything up to the next comment
 * terminator — in Kova's `index.ts`, ninety lines of route mounts. It went
 * unnoticed for as long as an IMPORT satisfied the match on its own; the moment
 * imports stopped counting, the guard accused Kova of never mounting its inbox.
 *
 * A regex literal containing `//` would still confuse this scanner. That is a
 * known limit, not an oversight: it is rare, it fails LOUD (a name goes missing
 * and the guard accuses), and the alternative is parsing TypeScript in a file
 * whose whole point is having no dependencies.
 */
function stripComments(src) {
  let out = "";
  let mode = null; // '"' | "'" | "`" | "//" | "/*"
  for (let i = 0; i < src.length; ) {
    const c = src[i];
    const d = src[i + 1];
    if (mode === null) {
      if (c === "/" && d === "/") { mode = "//"; out += "  "; i += 2; continue; }
      if (c === "/" && d === "*") { mode = "/*"; out += "  "; i += 2; continue; }
      if (c === '"' || c === "'" || c === "`") mode = c;
      out += c;
      i += 1;
      continue;
    }
    if (mode === "//") {
      if (c === "\n") { mode = null; out += c; } else out += " ";
      i += 1;
      continue;
    }
    if (mode === "/*") {
      if (c === "*" && d === "/") { mode = null; out += "  "; i += 2; continue; }
      out += c === "\n" ? "\n" : " ";
      i += 1;
      continue;
    }
    // Inside a string literal: an escape consumes its pair, a matching quote ends it.
    if (c === "\\") { out += "  "; i += 2; continue; }
    if (c === mode) mode = null;
    out += c;
    i += 1;
  }
  return out;
}

let bad = 0;
const fail = (m) => (console.error(`BAD  ${m}`), bad++);
const ok = (m) => console.log(`ok   ${m}`);

/**
 * Module id → what must appear in `index.ts` for it to be reachable, and why.
 *
 * The `why` is not decoration: it is what the failure message says, and somebody
 * reading it does not yet know what is missing or whether it matters.
 */
const REACHABLE = [
  { module: "auth", mount: "otpSendGuard", why: "the only gate in front of the emailed sign-in code" },
  { module: "auth", mount: "staffRoutes", why: "invite, revoke, re-role, remove — a tenant cannot add anybody without it" },
  { module: "auth", mount: "accountRoutes", why: "the self-delete the standing ladder exempts at every rung" },
  { module: "tenancy", mount: "tenantCloseRoutes", why: "leaving. Absent, the route guard's exemption protects nothing" },
  { module: "tenancy", mount: "domainRoutes", why: "the public host probe every boot makes, and custom domains" },
  { module: "tenancy", mount: "maintenanceAdminRoutes", why: "the deployment-wide switch — otherwise it can be turned on and never off" },
  { module: "notify", mount: "notifyRoutes", why: "the inbox. Without it every notification is written where nobody looks" },
  { module: "storage", mount: "mediaRoutes", why: "upload, the storage meter, the authed read" },
  { module: "ai", mount: "aiCatalogAdminRoutes", why: "the model catalog and the shared-selection broadcast" },
  { module: "email", mount: "emailAdminRoutes", why: "a fresh deploy cannot send a sign-in code until this is configured" },
  /*
    THE TWO HALVES OF SELLING A PLAN, and neither is any use alone.

    `planAdminRoutes` is what prices the catalog — with the grandfathering and
    the reprice id null-out an app's own editor invariably lacks. `stripeAdminRoutes`
    is the only place a secret key can be entered, so without it nothing can ever
    be charged and `@4dl/admin`'s Stripe panel 404s on every call.

    The template shipped the first and not the second, which is this guard's
    exact subject: `BILLING_SCHEMA` applied, a catalog an operator could edit,
    and no route to make any of it collect money — with every test green.
  */
  { module: "billing", mount: "planAdminRoutes", why: "the plan catalog. Without it a price can be shipped and never changed" },
  { module: "billing", mount: "stripeAdminRoutes", why: "the two-lane credentials — the only place a secret key can be entered" },
];

/**
 * ACKNOWLEDGED GAPS — an app that applies a module and does not mount its tree,
 * with the reason.
 *
 * ⚠️ Can only SHRINK: an entry that becomes mounted fails until it is deleted,
 * so it cannot rot into a permanent exemption. Adding one is a deliberate edit
 * with a reason, in review.
 */
const KNOWN_UNMOUNTED = {
  scena: {
    /*
      ⚠️ SCENA'S R2 KEY IS THE CONTENT HASH, and that is not a detail to tidy.

      A compiled manifest references an asset by hash, the player caches
      `/api/assets/<hash>` immutably for months offline, and `library_tracks` is
      a platform-wide catalog every workspace draws from — so the tenant-prefixed
      keys `mediaRoutes` issues would break all three. Scena keeps its own asset
      door and qualifies the LEDGER row instead (`<tenantId>:<hash>`): one row
      per tenant per object, one copy in the bucket. The accounting is shared;
      the addressing cannot be. See CLAUDE.md.

      So this is a deliberate divergence rather than a gap — and it is here, in
      the list that has to be re-argued, rather than as a silence.
    */
    mediaRoutes: "Scena's R2 key is the content hash, which the shared routes cannot issue — its ledger IS shared",
  },
};

/**
 * Every registered app with a worker — PLUS the template.
 *
 * ⚠️ `apps/_template` is deliberately absent from `apps.json` (it deploys
 * nowhere, and `apps-manifest.test.mjs` exempts it by name), so it has to be
 * added here by hand. It is also the app this check most needs to pass: every
 * new product starts as a copy of it, so a capability the template leaves
 * unmounted is a capability app #5 ships without and nobody notices.
 */
const apps = [
  ...REGISTRY.apps.filter((a) => existsSync(join(ROOT, a.dir, "src/index.ts"))),
  { id: "_template", dir: "apps/_template" },
];
if (apps.length < 4) {
  fail(`found ${apps.length} app(s) with a worker entry — the registry reader is broken, not the registry.`);
}

/**
 * The app's WHOLE `src`, concatenated.
 *
 * ⚠️ Not `index.ts` alone, which is what this checked first and which was wrong
 * about two apps out of three. Kova binds `emailAdminRoutes` in
 * `billing-routes.ts` and `maintenanceAdminRoutes` in `maintenance.ts`, then
 * mounts the re-exported result; Scena binds `staffRoutes` in
 * `member-routes.ts`. All three are correct, and all three are invisible to a
 * check that reads one file — which reported four false failures and would have
 * been waived by lunchtime.
 *
 * What this can no longer distinguish is IMPORTED from MOUNTED. That half is the
 * integration suites' — each app probes its own surfaces for a 404, which is a
 * behavioural question a structural check cannot answer anyway.
 */
function appSource(appDir, { keepImports = false } = {}) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(entry.name)) {
        const bare = stripComments(readFileSync(p, "utf8"));
        out.push(keepImports ? bare : stripImports(bare));
      }
    }
  };
  walk(join(ROOT, appDir, "src"));
  return out.join("\n");
}

/** Which schema modules an app APPLIES, read off its `SCHEMA_MODULES` list. */
function installedModules(appDir) {
  const dbPath = join(ROOT, appDir, "src/db.ts");
  if (!existsSync(dbPath)) return null;
  const src = readFileSync(dbPath, "utf8");
  /*
    ⚠️ Anchored on the DECLARATION, not on the first mention of the name. Every
    app's `db.ts` explains `SCHEMA_MODULES` in prose above it (purge derives the
    cascade from the same list), so `indexOf("SCHEMA_MODULES")` lands in a
    comment and the following `]` closes `SchemaModule[]` rather than the array —
    an empty parse, which this file then reports as "the parser is broken". It
    did exactly that on all three apps the first time it ran.
  */
  const decl = /SCHEMA_MODULES\s*:\s*readonly\s+SchemaModule\[\]\s*=\s*\[/.exec(src);
  if (!decl) return null;
  const from = decl.index + decl[0].length;
  const body = src.slice(from, src.indexOf("]", from));
  /*
    Matched on the IMPORTED NAMES rather than on each module's `id`, because the
    id is a string inside the package and this file cannot see it without
    importing. `AUTH_SCHEMA` → `auth`, `BILLING_RAIL_SCHEMA` → `billing_rail`.
  */
  const names = [...body.matchAll(/\b([A-Z][A-Z0-9_]*)_SCHEMA\b/g)].map((m) => m[1].toLowerCase());
  return new Set(names);
}

const matchedRules = new Set();

for (const app of apps) {
  const installed = installedModules(app.dir);
  if (!installed || installed.size < 3) {
    fail(`${app.id}: could not read SCHEMA_MODULES from ${app.dir}/src/db.ts — the parser is broken, not the app.`);
    continue;
  }
  // Two views of the same source: `index0` keeps the imports (aliases are read
  // from them), `index` has them stripped so an import alone is not a mount.
  const index0 = appSource(app.dir, { keepImports: true });
  const index = appSource(app.dir);
  const known = KNOWN_UNMOUNTED[app.id] ?? {};

  /*
    ⚠️ Word-bounded, not `includes`. A substring match reports `notifyRoutes` as
    mounted when the source says `notifyRoutesXX` — which is exactly what a
    rename looks like, and exactly the case this check exists for. The mutation
    test that renamed it passed silently until this was fixed.
  */
  const mounts = (name) => {
    /*
      An ALIASED import still counts. Scena mounts `@4dl/auth`'s tree as
      `import { staffRoutes as sharedStaffRoutes }` and wraps it, which is a
      legitimate shape — the capability is reachable, it simply travels under a
      second name. Reading the alias off the import is what keeps stripping the
      imports from turning that into a false accusation.
    */
    const names = [name, ...[...index0.matchAll(new RegExp(`\\b${name}\\s+as\\s+(\\w+)`, "g"))].map((m) => m[1])];
    return names.some((n) => new RegExp(`\\b${n}\\b`).test(index));
  };

  const applicable = REACHABLE.filter((r) => installed.has(r.module));
  const missing = [];
  const carried = [];
  for (const r of applicable) {
    matchedRules.add(r.mount);
    if (mounts(r.mount)) {
      if (r.mount in known) {
        fail(`${app.id}: "${r.mount}" IS mounted now — delete it from KNOWN_UNMOUNTED.\n` +
             `       A gap list that outlives the gap tells the next reader the work is outstanding.`);
      }
      continue;
    }
    (r.mount in known ? carried : missing).push(r);
  }

  for (const r of missing) {
    fail(`${app.id} applies the ${r.module} schema and never mounts ${r.mount}.\n` +
         `       ${r.why}.\n` +
         `       The tables exist, the package's tests pass, and the capability is unreachable.`);
  }
  if (!missing.length) {
    ok(`${app.id}: ${applicable.length - carried.length}/${applicable.length} shared capabilities reachable` +
       (carried.length ? ` · ${carried.length} known: ${carried.map((r) => r.mount).join(", ")}` : ""));
  }

  /* An entry naming a module the app does not apply is a stale exemption. */
  for (const mount of Object.keys(known)) {
    if (!applicable.some((r) => r.mount === mount)) {
      fail(`${app.id}: KNOWN_UNMOUNTED names "${mount}", which no applicable rule covers — delete the entry.`);
    }
  }
}

/*
  ⚠️ A rule nothing matched is a rule that stopped checking — a renamed export, a
  module dropped from every app, a typo. It reports success on every app forever,
  which is precisely the shape above.
*/
const dead = REACHABLE.map((r) => r.mount).filter((m) => !matchedRules.has(m));
if (dead.length) {
  fail(`these rules matched no app at all: ${[...new Set(dead)].join(", ")}.\n` +
       `       Either the export was renamed or no app applies its module any more — and a rule\n` +
       `       that matches nothing passes everything.`);
}

if (bad) {
  console.error(`\n${bad} unreachable capabilit${bad === 1 ? "y" : "ies"}.`);
  process.exit(1);
}
console.log(`\nevery schema module an app applies has a route tree behind it (${apps.length} apps).`);
