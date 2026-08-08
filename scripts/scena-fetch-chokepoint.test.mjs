#!/usr/bin/env node
/**
 * EVERY API CALL IN SCENA'S DASHBOARD GOES THROUGH ONE DOOR.
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
 * `apiFetch` in `api.ts` is the chokepoint, and this check is the half that
 * makes the fix STAY fixed. Without it the next endpoint somebody adds goes
 * back to a bare `fetch` — valid TypeScript, passes every test, renders
 * correctly in every screenshot — and the symptom reappears for exactly the
 * calls that were added last.
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
const APP = join(ROOT, "apps/scena-app/src");
let bad = 0;
const fail = (m) => (console.error(`BAD  ${m}`), bad++);
const ok = (m) => console.log(`ok   ${m}`);

/** Every `.ts`/`.tsx` file under `dir`, recursively, skipping build output. */
function sources(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (name === "node_modules" || name === "dist" || name === ".turbo") continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name) && !name.endsWith(".d.ts")) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/**
 * The two files that may hold a bare `fetch`, each for a stated reason.
 *
 * A file list rather than a pattern, on purpose: adding an entry is an edit
 * somebody reviews, while a pattern absorbs the next bypass silently. Each is
 * asserted to EXIST, so a rename cannot make this check pass vacuously — which
 * is how a guard comes to be watching a path that no longer means anything.
 */
const ALLOWED = [
  {
    file: "api.ts",
    why: "it DEFINES apiFetch — the one call that must be the real fetch",
    /** At most this many, so the definition cannot quietly grow neighbours. */
    max: 1,
  },
  {
    file: "host.ts",
    why: "`/api/host` is the PUBLIC probe every boot makes before there is a session — a 401 there is not an expiry, and routing it through the hook would fire re-auth on a request whose purpose is to run without auth",
    max: 1,
  },
];

for (const { file } of ALLOWED) {
  if (!existsSync(join(APP, file))) fail(`the allow-list names apps/scena-app/src/${file}, which does not exist — a rename made this check vacuous`);
}

/*
  `fetch(` not preceded by an identifier character or a dot, so `apiFetch(` and
  a hypothetical `this.fetch(` do not match. `useFetch(`-style names are excluded
  by the same guard.
*/
const BARE = /(?<![A-Za-z0-9_$.])fetch\s*\(/g;

const offenders = [];
let allowedSeen = 0;

for (const path of sources(APP)) {
  const rel = relative(APP, path);
  const src = stripComments(readFileSync(path, "utf8"));
  const hits = [...src.matchAll(BARE)];
  if (!hits.length) continue;

  const rule = ALLOWED.find((a) => a.file === rel);
  if (!rule) {
    for (const h of hits) {
      const line = src.slice(0, h.index).split("\n").length;
      offenders.push(`apps/scena-app/src/${rel}:${line}`);
    }
    continue;
  }
  allowedSeen++;
  if (hits.length > rule.max) {
    fail(`apps/scena-app/src/${rel} holds ${hits.length} bare fetch(es); ${rule.max} is allowed because ${rule.why}`);
  }
}

if (offenders.length) {
  fail(
    `${offenders.length} bare fetch call(s) bypass apiFetch, so a 401 there will not reach the app:\n` +
      offenders.map((o) => `       ${o}`).join("\n") +
      `\n       Use \`apiFetch\` from api.ts. If a call genuinely must run before there is a session,\n` +
      `       add it to ALLOWED in this file with the reason.`,
  );
}

if (allowedSeen !== ALLOWED.length) {
  /*
    Both exempt files are supposed to CONTAIN a bare fetch. If one stops, either
    it was migrated (delete its entry) or the check's regex stopped matching —
    and the second failure mode is the dangerous one, because it turns the whole
    guard into a no-op that reports success.
  */
  fail(`expected a bare fetch in all ${ALLOWED.length} allow-listed files, found ${allowedSeen} — the matcher may have stopped working`);
}

/** The hook is only worth a chokepoint if something installs it. */
const app = stripComments(readFileSync(join(APP, "App.tsx"), "utf8"));
if (!/setUnauthorizedHandler\s*\(/.test(app)) {
  fail("apps/scena-app/src/App.tsx does not install setUnauthorizedHandler — apiFetch reports a 401 to nobody");
}

/** And only if apiFetch actually reports one. */
const api = stripComments(readFileSync(join(APP, "api.ts"), "utf8"));
if (!/res\.status\s*===\s*401/.test(api) || !/onUnauthorized\?\.\(\)/.test(api)) {
  fail("apps/scena-app/src/api.ts's apiFetch no longer reports a 401 — every call site goes through a door that does nothing");
}
/*
  ⚠️ AND ONLY IF IT EXEMPTS THE AUTH LANE. Better Auth's endpoints self-report
  401 for a wrong OTP, so firing the global re-auth on them reloads the session
  on the login screen on every mistyped code.
*/
if (!/api\/auth\//.test(api)) {
  fail("apps/scena-app/src/api.ts's apiFetch no longer exempts /api/auth/ — a mistyped OTP will trigger a re-auth");
}

const total = sources(APP).length;
if (bad) {
  console.error(`\nscena fetch chokepoint: ${bad} problem(s) across ${total} files.`);
  process.exit(1);
}
ok(`scena fetch chokepoint: ${total} files, every API call goes through apiFetch (${ALLOWED.length} stated exceptions)`);
console.log("\nthe dashboard's 401 reaches the app.");
