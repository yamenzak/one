#!/usr/bin/env node
/**
 * A CAPABILITY A PACKAGE SELLS MUST BE ENFORCED BY A ROUTE.
 *
 * The package builder auto-renders a toggle for every entry in
 * `SELLABLE_CLIENT_FLAG_KEYS`, which is what makes adding a flag cheap — and
 * what makes forgetting to enforce one invisible. The registry conformance
 * tests in `packages/domain/test` already prove a flag is REACHABLE from a
 * FeatureSpec. They cannot prove anything CALLS it: `gateFeature` is a function,
 * and a function nobody calls type-checks perfectly.
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
 * one `gateFeature(…)` or `featureShaper(…)`-guarded call in `apps/api/src`, or
 * declare `uiOnly: true` and say why. Structural, because it is the only check
 * that survives someone adding flag number twenty-four at 2am.
 *
 * Plain Node, no dependencies, like the rest of `scripts/`.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const FEATURES_SRC = readFileSync(join(root, "packages/domain/src/features.ts"), "utf8");
const API_DIR = join(root, "apps/api/src");

let failures = 0;
const fail = (msg) => { console.error(`✗ ${msg}`); failures++; };
const pass = (msg) => console.log(`✓ ${msg}`);

// ── Parse the registry ───────────────────────────────────────────────────────
// A regex over the source rather than an import: this runs before any build, in
// plain Node, and the shape it reads (`key: {  … },` blocks) is the shape the
// file has had since it was written. A parse that finds nothing FAILS below,
// so a reformat that breaks it cannot silently pass the whole check.
const specs = [];
for (const block of FEATURES_SRC.split(/\n  (?=[a-zA-Z]+: \{)/).slice(1)) {
  const key = block.match(/^([a-zA-Z]+): \{/)?.[1];
  if (!key) continue;
  const body = block.slice(0, block.indexOf("\n  },"));
  specs.push({
    key,
    clientFlag: body.match(/clientFlag:\s*"([a-zA-Z]+)"/)?.[1] ?? null,
    uiOnly: /uiOnly:\s*true/.test(body),
  });
}

if (specs.length < 20) {
  fail(`parsed only ${specs.length} feature specs from features.ts — the parser is broken, not the registry`);
} else {
  pass(`parsed ${specs.length} feature specs from the registry`);
}

// ── Collect every feature key the API actually gates on ──────────────────────
const gated = new Set();
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith(".ts")) {
      const src = readFileSync(p, "utf8");
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
  }
};
walk(API_DIR);

if (gated.size < 15) {
  fail(`found only ${gated.size} gated feature keys in apps/api/src — the scan is broken`);
} else {
  pass(`found ${gated.size} feature keys enforced somewhere in apps/api/src`);
}

// ── The rule ─────────────────────────────────────────────────────────────────
const clientFeatures = specs.filter((s) => s.clientFlag);
const unenforced = clientFeatures.filter((s) => !s.uiOnly && !gated.has(s.key));
if (unenforced.length) {
  for (const s of unenforced) {
    fail(
      `feature "${s.key}" sells the client flag "${s.clientFlag}" and no route enforces it.\n` +
      `    Gate it with gateFeature(c, "${s.key}", clientId) — or, if there is genuinely nothing\n` +
      `    to check because the data is the client's own, declare uiOnly: true and say why.`,
    );
  }
} else {
  pass(`all ${clientFeatures.length} client-capability features are enforced or declared uiOnly`);
}

// A uiOnly feature that DOES have a gate is the opposite mistake: the
// declaration is now a lie, and the next reader believes it over the code.
for (const s of specs.filter((s) => s.uiOnly && gated.has(s.key))) {
  fail(`feature "${s.key}" is declared uiOnly but IS gated in apps/api/src — drop the declaration`);
}

// Pin the uiOnly set. Adding to it is how this whole check gets defeated one
// entry at a time, so it takes a deliberate edit here with a reason in review.
const uiOnly = specs.filter((s) => s.uiOnly).map((s) => s.key).sort();
const EXPECTED_UI_ONLY = ["macroBreakdown"];
if (JSON.stringify(uiOnly) !== JSON.stringify(EXPECTED_UI_ONLY)) {
  fail(`the uiOnly set changed: ${JSON.stringify(uiOnly)} (expected ${JSON.stringify(EXPECTED_UI_ONLY)}).\n` +
       `    Every entry here is a capability sold with no server-side enforcement. If the new one\n` +
       `    really cannot be gated, update EXPECTED_UI_ONLY in this file and explain it in the commit.`);
} else {
  pass(`the uiOnly escape hatch still holds exactly ${EXPECTED_UI_ONLY.length}: ${EXPECTED_UI_ONLY.join(", ")}`);
}

console.log(failures ? `\n${failures} failure(s)` : "\nflag enforcement: every sold capability is checked");
process.exit(failures ? 1 : 0);
