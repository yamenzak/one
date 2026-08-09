#!/usr/bin/env node
/**
 * EVERY API CALL IN A DASHBOARD GOES THROUGH ONE DOOR.
 *
 * ── The bug this exists to keep closed ──────────────────────────────────────
 *
 * Scena's `api.ts` was 167 bare `fetch` calls — what an app written before the
 * platform looks like. Kova and Tessa go through `@4dl/app-kit`'s `api`, which
 * has a hook for an expired session (`setUnauthorizedHandler`); Scena had none,
 * so a dead cookie did not LOOK dead. `getMe` is read once at boot, so the Shell
 * stayed mounted, every screen rendered whatever empty state its failed poll
 * produced, and every save failed into a toast. An expired session was
 * indistinguishable from a deleted workspace.
 *
 * A door — `@4dl/app-kit`'s `api`, or Scena's own `apiFetch` over it — is the
 * fix, and this check is the half that makes it STAY fixed. Without it the next
 * endpoint somebody adds goes back to a bare `fetch`: valid TypeScript, passes
 * every test, renders correctly in every screenshot, and the symptom reappears
 * for exactly the calls that were added last.
 *
 * ── Why it reads apps.json ──────────────────────────────────────────────────
 *
 * This was `scena-fetch-chokepoint.test.mjs` and looked at one directory. Kova's
 * and Tessa's SPAs happen to be clean, which is the reason nobody noticed the
 * guard did not cover them — a check that passes because of a habit rather than
 * because of a rule is one refactor away from meaning nothing. The SPA list is
 * `apps.json` now, so a fourth product's dashboard is checked the day it is
 * registered, and an unrecognised SPA is a FAILURE rather than a silent skip.
 *
 * ── Why it is structural ────────────────────────────────────────────────────
 *
 * The property is "no call site bypasses the hook", which is a fact about the
 * SOURCE. A behavioural test would need a browser, an expired cookie, and a
 * separate assertion per endpoint — 167 of them, each of which would pass while
 * the 168th was wrong.
 *
 * Plain Node, no dependencies, like the rest of `scripts/`.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Source with comments blanked out.
 *
 * `api.ts` and `host.ts` both explain in prose exactly what they used to do and
 * why one of them still does it — the words "bare `fetch`" appear in both. A
 * guard that matched raw text would fail on the documentation of the fix, which
 * is the most obviously wrong way for a check like this to behave. Newlines are
 * preserved so line numbers stay usable in the error.
 */
const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));

const ROOT = new URL("..", import.meta.url).pathname;
const REGISTRY = JSON.parse(readFileSync(join(ROOT, "apps.json"), "utf8"));
let bad = 0;
const fail = (m) => (console.error(`BAD  ${m}`), bad++);
const ok = (m) => console.log(`ok   ${m}`);

/**
 * The rule per SPA package.
 *
 * `door` names what every call must go through, for the failure message.
 * `allow` lists the files that may hold a bare `fetch`, each with a reason and a
 * ceiling — a file list rather than a pattern, on purpose: adding an entry is an
 * edit somebody reviews, while a pattern absorbs the next bypass silently. Every
 * named file is asserted to EXIST and to still CONTAIN one, so neither a rename
 * nor a migration can leave this watching a path that means nothing.
 *
 * `exempt` is for a bundle that is not a dashboard at all.
 */
const RULES = {
  /*
    Kova and Tessa go through the KIT, so the door's behaviour is the kit's and
    is tested there (`@4dl/app-kit`). What is checked here is the same thing for
    both: nothing bypasses it.
  */
  "@kova/app": { door: "`api` from @4dl/app-kit", allow: [] },
  "@tessa/app": { door: "`api` from @4dl/app-kit", allow: [] },
  "@scena/app": {
    door: "`apiFetch` from api.ts",
    /**
     * Scena's door is its OWN, so its behaviour is asserted here — a chokepoint
     * in front of a door that does nothing is a chokepoint in front of nothing,
     * and every one of these three has to hold for the guard above to be worth
     * running.
     */
    behaviour: [
      { file: "App.tsx", must: /setUnauthorizedHandler\s*\(/, why: "installs setUnauthorizedHandler — apiFetch now reports a 401 to nobody" },
      { file: "api.ts", must: /res\.status\s*===\s*401/, why: "detects a 401 in apiFetch" },
      { file: "api.ts", must: /onUnauthorized\?\.\(\)/, why: "REPORTS the 401 apiFetch detected" },
      /*
        ⚠️ And only if it exempts the auth lane. Better Auth's endpoints
        self-report 401 for a wrong OTP, so firing the global re-auth on them
        reloads the session on the login screen on every mistyped code.
      */
      { file: "api.ts", must: /api\/auth\//, why: "exempts /api/auth/ — a mistyped OTP will now trigger a re-auth" },
    ],
    allow: [
      { file: "api.ts", max: 1, why: "it DEFINES apiFetch — the one call that must be the real fetch" },
      {
        file: "host.ts",
        max: 1,
        why: "`/api/host` is the PUBLIC probe every boot makes before there is a session — a 401 there is not an expiry, and routing it through the hook would fire re-auth on a request whose purpose is to run without auth",
      },
    ],
  },
  /**
   * ⚠️ THE PLAYER IS A DEVICE, NOT A DASHBOARD, and exempting it is the design
   * rather than a concession.
   *
   * It holds no session and no cookie: it resolves no tenant from its host, and
   * its authority is a pairing claim. There is no 401 for a hook to catch, so
   * there is nothing for a door to be a door to. It is also deliberately
   * dependency-free — a TV render loop and a Service Worker with full control of
   * both — so importing the kit's fetch layer to satisfy a guard would put
   * React-shaped weight on a device with 512 MB of RAM. See SCENA.md.
   */
  "@scena/player": { exempt: "a paired device with no session — see SCENA.md" },
  /* The template goes through the kit, like the two apps above it — and it is
     checked precisely because it is what app #5 copies. */
  "@4dl/template-app": { door: "`api` from @4dl/app-kit", allow: [] },
};

/** Every `.ts`/`.tsx` file under `dir`, recursively, skipping build output. */
function sources(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (name === "node_modules" || name === "dist" || name === ".turbo") continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name) && !name.endsWith(".d.ts") && !/\.test\.tsx?$/.test(name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** Where a workspace package's sources live, by package name. */
const spaDir = (pkgName) => {
  for (const base of ["apps", "packages"]) {
    for (const entry of readdirSync(join(ROOT, base), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pkg = join(ROOT, base, entry.name, "package.json");
      if (!existsSync(pkg)) continue;
      if (JSON.parse(readFileSync(pkg, "utf8")).name === pkgName) return join(ROOT, base, entry.name, "src");
    }
  }
  return null;
};

/*
  `fetch(` not preceded by an identifier character or a dot, so `apiFetch(` and
  a hypothetical `this.fetch(` do not match. `useFetch(`-style names are excluded
  by the same guard.
*/
const BARE = /(?<![A-Za-z0-9_$.])fetch\s*\(/g;

/**
 * ⚠️ THE TEMPLATE'S SPA IS APPENDED BY HAND.
 *
 * `apps/_template-app` is deliberately absent from `apps.json` — it deploys
 * nowhere — so a guard that derives its list from the registry alone would leave
 * the one SPA every future app is COPIED FROM as the only unchecked one in the
 * repo. That is this guard's own failure mode, one level up.
 */
const TEMPLATE_SPA = "@4dl/template-app";

const spas = [...REGISTRY.apps.map((a) => a.spa).filter(Boolean), TEMPLATE_SPA];
if (spas.length < 3) {
  fail(`apps.json lists ${spas.length} SPA(s) — the registry reader is broken, not the registry.`);
}

for (const spa of spas) {
  const rule = RULES[spa];
  if (!rule) {
    /*
      An unrecognised SPA is a failure, not a skip. Skipping is what the previous
      version of this file did to two thirds of the repo, by looking at one
      hardcoded path — and the two it missed passed only because nobody happened
      to write a bare fetch in them.
    */
    fail(`${spa} is registered in apps.json and has no rule in this file. Add one:\n` +
         `       an ordinary dashboard is \`{ door: "…", allow: [] }\`; something that is not a\n` +
         `       dashboard needs \`{ exempt: "<why>" }\` and a reason that survives review.`);
    continue;
  }
  if (rule.exempt) {
    ok(`${spa}: exempt — ${rule.exempt}`);
    continue;
  }

  const dir = spaDir(spa);
  if (!dir || !existsSync(dir)) {
    fail(`${spa}: no src directory found — this check would pass vacuously.`);
    continue;
  }
  for (const { file } of rule.allow) {
    if (!existsSync(join(dir, file))) {
      fail(`${spa}: the allow-list names ${file}, which does not exist — a rename made this check vacuous`);
    }
  }

  const offenders = [];
  let allowedSeen = 0;
  let scanned = 0;
  for (const path of sources(dir)) {
    scanned++;
    const rel = relative(dir, path);
    const src = stripComments(readFileSync(path, "utf8"));
    const hits = [...src.matchAll(BARE)];
    if (!hits.length) continue;
    const allow = rule.allow.find((a) => a.file === rel);
    if (!allow) {
      for (const h of hits) offenders.push(`${rel}:${src.slice(0, h.index).split("\n").length}`);
      continue;
    }
    allowedSeen++;
    if (hits.length > allow.max) {
      fail(`${spa}/${rel} holds ${hits.length} bare fetch(es); ${allow.max} is allowed because ${allow.why}`);
    }
  }

  if (!scanned) {
    fail(`${spa}: the walk found no source files — this check would pass vacuously.`);
    continue;
  }
  if (offenders.length) {
    fail(`${spa}: ${offenders.length} bare fetch call(s) bypass ${rule.door}, so a 401 there will not reach the app:\n` +
         offenders.map((o) => `       ${o}`).join("\n") +
         `\n       Use ${rule.door}. If a call genuinely must run before there is a session,\n` +
         `       add it to this SPA's \`allow\` in scripts/api-door.test.mjs with the reason.`);
    continue;
  }
  if (allowedSeen !== rule.allow.length) {
    /*
      Every exempt file is supposed to CONTAIN a bare fetch. If one stops, either
      it was migrated (delete its entry) or the regex stopped matching — and the
      second failure mode is the dangerous one, because it turns the whole guard
      into a no-op that reports success.
    */
    fail(`${spa}: ${allowedSeen} of ${rule.allow.length} allow-listed file(s) still hold a bare fetch.\n` +
         `       Either one was migrated — delete its entry — or the detection broke, which would\n` +
         `       make this whole check a no-op that reports success.`);
    continue;
  }
  /* The door itself, for an app that owns one. */
  for (const { file, must, why } of rule.behaviour ?? []) {
    const path = join(dir, file);
    if (!existsSync(path)) {
      fail(`${spa}: ${file} is named in \`behaviour\` and does not exist — a rename made this check vacuous`);
      continue;
    }
    if (!must.test(stripComments(readFileSync(path, "utf8")))) {
      fail(`${spa}/${file} no longer ${why}. Every call site then goes through a door that does nothing.`);
    }
  }

  ok(`${spa}: ${scanned} files, every API call goes through ${rule.door}` +
     (rule.allow.length ? ` (${rule.allow.length} stated exception${rule.allow.length === 1 ? "" : "s"})` : "") +
     (rule.behaviour ? ` · ${rule.behaviour.length} door behaviours asserted` : ""));
}

if (bad) {
  console.error(`\n${bad} problem${bad === 1 ? "" : "s"}.`);
  process.exit(1);
}
console.log("\nevery registered dashboard has one API door.");
