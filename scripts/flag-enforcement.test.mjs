#!/usr/bin/env node
/**
 * A CAPABILITY A TENANT SELLS ITS OWN CUSTOMERS MUST BE ENFORCED BY A ROUTE.
 *
 * The package builder auto-renders a toggle for every entry in
 * `SELLABLE_CLIENT_FLAG_KEYS`, which is what makes adding a flag cheap — and
 * what makes forgetting to enforce one invisible. The registry conformance tests
 * already prove a flag is REACHABLE from a FeatureSpec. They cannot prove
 * anything CALLS it: `gateFeature` is a function, and a function nobody calls
 * type-checks perfectly.
 *
 * Two flags were in exactly that state when this file was written, both sold
 * with a price and a description and enforced nowhere:
 *
 *   canViewExerciseReport  `/api/progress` returned every PR and the whole
 *                          tonnage series to a client whose package excluded
 *                          the strength report. The UI hid the tab. The wire
 *                          did not.
 *   showMacroBreakdown     genuinely has no route to gate — the macros are
 *                          computed from the client's own food entries — so it
 *                          is now declared `uiOnly` rather than left looking
 *                          like the same oversight.
 *
 * The rule: every feature that names a `clientFlag` must be named by at least
 * one `gateFeature(…)` or `featureShaper(…)`-guarded call in that app's `src`,
 * or declare `uiOnly: true` and say why.
 *
 * ── Why this reads apps.json now ────────────────────────────────────────────
 *
 * It checked `apps/api` and nothing else, which was right in the sense that Kova
 * is the only product with this rail — and wrong in the sense that NOTHING SAID
 * SO. "Tessa and Scena have no customer-facing flags" was a fact about the code
 * that only a person could know, and the day one of them grows one, a guard
 * pointed at a hardcoded directory does not notice.
 *
 * So the rail is DETECTED rather than assumed: an app that declares a
 * `clientFlag` anywhere is checked, and an app that declares none is reported as
 * having no customer rail — a claim this file re-derives on every run instead of
 * a silence it inherits. Both other apps genuinely have none: neither has a
 * customer ROLE at all (`configureNotify`'s `customerRole` is `"__none__"` in
 * Scena, and Tessa's every member is staff), so there is nobody to sell to.
 *
 * Plain Node, no dependencies, like the rest of `scripts/`.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const REGISTRY = JSON.parse(readFileSync(join(root, "apps.json"), "utf8"));

let failures = 0;
const fail = (msg) => { console.error(`✗ ${msg}`); failures++; };
const pass = (msg) => console.log(`✓ ${msg}`);

/**
 * Per app with a customer rail: the uiOnly escape hatch, and how big its feature
 * registry should parse to.
 *
 * `uiOnly` — every entry is a capability sold with no server-side enforcement.
 * Adding one is how this whole check gets defeated, one entry at a time, so it
 * takes a deliberate edit here and a reason in review.
 *
 * `minSpecs` — the partial-parse floor, which has to be per app because it is a
 * fact about that app's registry. A shared floor of 20 was fine while Kova was
 * the only entry and gave a second app a flatly WRONG message ("the parser is
 * broken, not the registry") for the ordinary case of having twelve features.
 * A guard's failure text is read by someone who does not yet know what is wrong,
 * so it must not assert the wrong cause.
 */
const RAILED = {
  kova: { uiOnly: ["macroBreakdown"], minSpecs: 20 },
};

// ── Reading a workspace ─────────────────────────────────────────────────────

const tsFiles = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) tsFiles(p, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
};

const workspaceDirs = (() => {
  const map = new Map();
  for (const base of ["packages", "apps"]) {
    for (const entry of readdirSync(join(root, base), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(root, base, entry.name);
      const pkg = join(dir, "package.json");
      if (!existsSync(pkg)) continue;
      const name = JSON.parse(readFileSync(pkg, "utf8")).name;
      if (name) map.set(name, dir);
    }
  }
  return map;
})();

/** The app's own source plus every workspace package it depends on — Kova's
 *  feature registry lives in `@kova/domain`, not in `apps/api/src`. */
function appSources(appDir) {
  const files = tsFiles(join(root, appDir, "src"));
  const pkgPath = join(root, appDir, "package.json");
  if (!existsSync(pkgPath)) return files;
  for (const [name, spec] of Object.entries(JSON.parse(readFileSync(pkgPath, "utf8")).dependencies ?? {})) {
    if (!String(spec).startsWith("workspace:")) continue;
    const dir = workspaceDirs.get(name);
    if (dir) files.push(...tsFiles(join(dir, "src")));
  }
  return files;
}

// ── Parse a feature registry ────────────────────────────────────────────────
/*
  A regex over the source rather than an import: this runs before any build, in
  plain Node, and the shape it reads (`key: { … },` blocks) is the shape the file
  has had since it was written. A parse that finds nothing FAILS below, so a
  reformat that breaks it cannot silently pass the whole check.
*/
function readSpecs(files) {
  const specs = [];
  let source = null;
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("clientFlag:")) continue;
    for (const block of src.split(/\n  (?=[a-zA-Z]+: \{)/).slice(1)) {
      const key = block.match(/^([a-zA-Z]+): \{/)?.[1];
      if (!key) continue;
      const end = block.indexOf("\n  },");
      const body = end < 0 ? block : block.slice(0, end);
      specs.push({
        key,
        clientFlag: body.match(/clientFlag:\s*"([a-zA-Z]+)"/)?.[1] ?? null,
        uiOnly: /uiOnly:\s*true/.test(body),
      });
    }
    source ??= file;
  }
  return { specs, source };
}

// ── Collect every feature key an app's own routes gate on ───────────────────
function readGated(files) {
  const gated = new Set();
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    // `gateFeature(c, "x")` / `gateFeature(c as never, "x")` — the 403 gate.
    for (const m of src.matchAll(/gateFeature\(\s*[^,]+,\s*"([a-zA-Z]+)"/g)) gated.add(m[1]);
    // `may("x")` / `mayReport("x")` — the shaping predicate `featureShaper`
    // returns. A shaped payload is enforcement too: the block is withheld.
    if (src.includes("featureShaper")) {
      for (const m of src.matchAll(/\bmay[A-Za-z]*\(\s*"([a-zA-Z]+)"/g)) gated.add(m[1]);
    }
    // `planFeature(kind)` resolves to the two plan features by table.
    if (/planFeature\s*=/.test(src)) {
      for (const m of src.matchAll(/\?\s*\("([a-zA-Z]+)" as const\)\s*:\s*\("([a-zA-Z]+)" as const\)/g)) {
        gated.add(m[1]); gated.add(m[2]);
      }
    }
  }
  return gated;
}

// ── Per app ─────────────────────────────────────────────────────────────────

const products = REGISTRY.apps.filter((a) => a.provision?.d1);
if (products.length < 2) {
  fail(`found only ${products.length} product app(s) in apps.json — the registry reader is broken, not the registry`);
}

let railed = 0;
for (const app of products) {
  const { specs, source } = readSpecs(appSources(app.dir));
  const clientFeatures = specs.filter((s) => s.clientFlag);

  if (!clientFeatures.length) {
    /*
      No customer rail. This is a REPORT, not a skip — an app reaching this
      branch has been looked at and found to sell its tenants' customers
      nothing, which is the fact the old hardcoded path left unstated.
    */
    if (RAILED[app.id]) {
      fail(`${app.id}: pinned in RAILED but declares no clientFlag at all.\n` +
           `    Either its feature registry moved and the parser lost it — the failure this\n` +
           `    check exists to make loud — or the pin is stale and should be deleted.`);
    } else {
      pass(`${app.id}: no customer rail — nothing its tenants sell on, so nothing to gate`);
    }
    continue;
  }
  railed += 1;

  // The pin is checked FIRST, so a newly-railed app gets the message that fits
  // it — "add yourself to RAILED" — rather than a partial-parse accusation
  // sized to somebody else's registry.
  const pin = RAILED[app.id];
  if (!pin) {
    fail(`${app.id} sells client capabilities (${clientFeatures.length} flag(s)) and is not in RAILED.\n` +
         `    Add it: \`{ uiOnly: [], minSpecs: <however many its registry has> }\`. An app that can\n` +
         `    appear without a pin is an app whose ungated capabilities are unpinned.`);
    continue;
  }
  if (specs.length < pin.minSpecs) {
    fail(`${app.id}: parsed only ${specs.length} feature specs from ${source} (expected at least ${pin.minSpecs})\n` +
         `    — the parser is broken, not the registry.`);
    continue;
  }
  pass(`${app.id}: parsed ${specs.length} feature specs from ${source.slice(root.length)}`);

  // Gates are collected from the app's OWN src only. A gate in a shared package
  // is that package's business; counting it would let an app pass on a check it
  // never makes.
  const gated = readGated(tsFiles(join(root, app.dir, "src")));
  if (gated.size < 15) {
    fail(`${app.id}: found only ${gated.size} gated feature keys in ${app.dir}/src — the scan is broken`);
  } else {
    pass(`${app.id}: found ${gated.size} feature keys enforced in ${app.dir}/src`);
  }

  const unenforced = clientFeatures.filter((s) => !s.uiOnly && !gated.has(s.key));
  for (const s of unenforced) {
    fail(`${app.id}: feature "${s.key}" sells the client flag "${s.clientFlag}" and no route enforces it.\n` +
         `    Gate it with gateFeature(c, "${s.key}", clientId) — or, if there is genuinely nothing\n` +
         `    to check because the data is the client's own, declare uiOnly: true and say why.`);
  }
  if (!unenforced.length) pass(`${app.id}: all ${clientFeatures.length} client-capability features are enforced or declared uiOnly`);

  // A uiOnly feature that DOES have a gate is the opposite mistake: the
  // declaration is now a lie, and the next reader believes it over the code.
  for (const s of specs.filter((s) => s.uiOnly && gated.has(s.key))) {
    fail(`${app.id}: feature "${s.key}" is declared uiOnly but IS gated — drop the declaration`);
  }

  const uiOnly = specs.filter((s) => s.uiOnly).map((s) => s.key).sort();
  const expected = pin.uiOnly;
  if (JSON.stringify(uiOnly) !== JSON.stringify([...expected].sort())) {
    fail(`${app.id}: the uiOnly set changed: ${JSON.stringify(uiOnly)} (expected ${JSON.stringify(expected)}).\n` +
         `    Every entry here is a capability sold with no server-side enforcement. If the new one\n` +
         `    really cannot be gated, update EXPECTED_UI_ONLY in this file and explain it in the commit.`);
  } else {
    pass(`${app.id}: the uiOnly escape hatch still holds ${expected.length}: ${expected.join(", ")}`);
  }
}

/*
  ⚠️ If NO app has a customer rail, this guard checked nothing and said so
  cheerfully three times over. That is the shape it was written to prevent, so it
  is a failure rather than a quiet pass — a registry that moved out of the
  dependency walk would otherwise read as "no app sells anything".
*/
if (!railed) {
  fail("no app in apps.json declares a single `clientFlag`. Either every customer rail was\n" +
       "    removed, or the parser stopped finding the registry — and the second is far more likely.");
}

console.log(failures ? `\n${failures} failure(s)` : `\nflag enforcement: every sold capability is checked, across ${products.length} product(s)`);
process.exit(failures ? 1 : 0);
