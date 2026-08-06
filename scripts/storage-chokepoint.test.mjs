#!/usr/bin/env node
/**
 * TWO CHOKEPOINTS, BOTH OF WHICH FAIL SILENTLY WHEN THEY ARE BYPASSED.
 *
 * 1. **Every R2 write goes through the storage adapter.** `@4dl/storage`'s whole
 *    premise is that `media_assets` IS the index — R2 has no queryable metadata,
 *    so an object written straight to the bucket is invisible to the quota, to
 *    the usage screen and to the erasure sweep, forever. A bare
 *    `env.MEDIA.put(...)` is valid TypeScript, passes every test, and shows up
 *    only as a storage bill that does not match what any workspace is charged
 *    for. Scena had three of them before Stage 5.
 *
 * 2. **The mock lane is gated on the ENVIRONMENT.** `shouldUseMockLane` puts
 *    `ENVIRONMENT === "development"` outside every mode, but only if the caller
 *    actually passes it. Hardcoding `isDevelopment: true` — or reintroducing a
 *    bare `app_config` read — puts fabricated output back in production, billed
 *    at the real model's rate. That is what Scena shipped, in three places, and
 *    what a passing test suite cannot see: the suites run in development, where
 *    mocking is correct.
 *
 * Both are STRUCTURAL properties of the source, so they are checked structurally
 * — which is also the only way to check the second one at all, because no test
 * running in a Workers pool can change the binding it would need to observe.
 *
 * Plain Node, no dependencies, like the rest of `scripts/`.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Source with comments blanked out.
 *
 * Both checks below are about what the code DOES, and both files they guard
 * explain in prose exactly what they used to do wrong — `env.MEDIA.put(hash,
 * bytes)`, `"ai.mock"`. Matching raw text would fail on the documentation of
 * the fix, which is the most obviously wrong way for a guard like this to
 * behave. Newlines are preserved so offsets stay usable.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

const ROOT = new URL("..", import.meta.url).pathname;
let bad = 0;
const fail = (m) => (console.error(`BAD  ${m}`), bad++);
const ok = (m) => console.log(`ok   ${m}`);

/** Every `.ts` file under `dir`, recursively, skipping build output. */
function sources(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (name === "node_modules" || name === "dist" || name === ".wrangler" || name === ".turbo") continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/* ─────────────── 1. the R2 chokepoint ──────────────────────────────────── */

/**
 * Apps with an R2 bucket, and the ONE module in each that may touch it.
 *
 * A per-app allow-list rather than a global one, because the adapter's filename
 * is the app's choice and a typo'd path would make this check pass vacuously —
 * so every entry is asserted to exist.
 */
const R2_OWNERS = [
  { app: "apps/scena", adapters: ["src/storage.ts"] },
  // Kova predates the package and routes its writes through `@4dl/storage`
  // directly from its own adapter; `purge.ts` deletes by prefix, which is the
  // package's own escape hatch for objects the ledger never recorded.
  { app: "apps/api", adapters: ["src/storage.ts", "src/purge.ts"] },
];

// `MEDIA.put(` / `MEDIA.delete(` on anything — `c.env.MEDIA`, `env.MEDIA`, `this.env.MEDIA`.
const BARE_R2 = /\bMEDIA\s*\.\s*(put|delete)\s*\(/;

for (const { app, adapters } of R2_OWNERS) {
  const appDir = join(ROOT, app);
  let files;
  try {
    files = sources(join(appDir, "src"));
  } catch {
    fail(`${app}/src does not exist — this check would pass vacuously.`);
    continue;
  }
  for (const a of adapters) {
    try {
      statSync(join(appDir, a));
    } catch {
      fail(`${app}/${a} is named as an R2 adapter but does not exist — the allow-list is stale.`);
    }
  }
  const allowed = new Set(adapters.map((a) => join(appDir, a)));
  let checked = 0;
  for (const f of files) {
    if (allowed.has(f)) continue;
    const src = stripComments(readFileSync(f, "utf8"));
    checked++;
    if (BARE_R2.test(src)) {
      fail(
        `${relative(ROOT, f)} writes to R2 directly. Every write must go through ${app}/${adapters[0]} ` +
          `so it lands in the media ledger — an object written behind the ledger is invisible to the quota and to erasure.`,
      );
    }
  }
  if (checked === 0) fail(`${app}: no non-adapter sources were scanned — the walk found nothing.`);
  else ok(`${app}: ${checked} source files, no bare R2 writes outside ${adapters.join(", ")}`);
}

/* ─────────────── 2. the mock-lane environment gate ─────────────────────── */

/**
 * Where the mock decision is made, for every app that meters generation.
 *
 * Two shapes are correct and both are checked. An app may DELEGATE — Kova runs
 * its generation through `@4dl/ai`'s `generate()`, which calls
 * `shouldUseMockLane` itself, so Kova's own `ai.ts` never needs to — or it may
 * decide for itself, as Scena does, because its five media tasks do not fit the
 * shared runner's text-in/text-out shape (see docs/SCENA-REWRITE.md §5).
 *
 * What is NOT correct, in either shape, is reading `ai.mock` and deciding
 * without the environment. That is one line, it typechecks, every suite passes
 * — and it puts fabricated output, billed at the real model's rate, back into
 * production. It is what Scena shipped, in three places.
 */
const AI_DECIDERS = ["apps/scena/src/ai.ts", "packages/ai/src/generate.ts"];
/** Files that must NOT decide for themselves — they delegate. */
const AI_DELEGATES = ["apps/api/src/ai.ts"];

for (const rel of AI_DECIDERS) {
  let src;
  try {
    src = stripComments(readFileSync(join(ROOT, rel), "utf8"));
  } catch {
    fail(`${rel} does not exist — this check would pass vacuously.`);
    continue;
  }
  // EVERY call site, not the first: `@4dl/ai` has three (text, image, speech),
  // and a check that looked only at the first would let the other two say
  // `isDevelopment: true` unnoticed.
  const calls = [];
  for (let at = src.indexOf("shouldUseMockLane("); at >= 0; at = src.indexOf("shouldUseMockLane(", at + 1)) {
    const rest = src.slice(at);
    const end = rest.indexOf("})");
    calls.push(end < 0 ? rest.slice(0, 400) : rest.slice(0, end + 2));
  }
  if (!calls.length) {
    fail(`${rel} does not CALL shouldUseMockLane. The mock decision must be the shared one — see @4dl/ai/mock-lane.ts.`);
    continue;
  }
  let gated = 0;
  for (const args of calls) {
    const dev = args.match(/isDevelopment\s*:\s*([^,\n}]+)/);
    if (!dev) fail(`${rel}: a shouldUseMockLane call has no \`isDevelopment\` argument.`);
    else if (!/ENVIRONMENT/.test(dev[1])) {
      fail(
        `${rel}: \`isDevelopment: ${dev[1].trim()}\` is not derived from ENVIRONMENT. ` +
          `A hardcoded value puts fabricated output — billed at the real model's rate — back in production.`,
      );
    } else gated++;
  }
  if (gated === calls.length) ok(`${rel}: ${calls.length} mock decision${calls.length === 1 ? "" : "s"}, all gated on ENVIRONMENT`);

  /*
    And no READ of the key may go anywhere else.

    One read per decision is the shape: each `generate*` in the package reads
    `ai.mock` into a local and hands it straight to `shouldUseMockLane`. More
    reads than decisions means somebody consulted the setting and acted on it
    without the environment — which is exactly the function this replaced.
  */
  const reads = (src.match(/["']ai\.mock["']/g) ?? []).length;
  if (reads > calls.length) {
    fail(
      `${rel}: ${reads} reads of "ai.mock" against ${calls.length} mock decision${calls.length === 1 ? "" : "s"}. ` +
        `A read that does not feed shouldUseMockLane is a decision that skips the environment check.`,
    );
  }
}

for (const rel of AI_DELEGATES) {
  let src;
  try {
    src = stripComments(readFileSync(join(ROOT, rel), "utf8"));
  } catch {
    fail(`${rel} does not exist — this check would pass vacuously.`);
    continue;
  }
  if (/["']ai\.mock["']/.test(src)) {
    fail(`${rel} reads "ai.mock" but is supposed to delegate the decision to @4dl/ai's generate(). Two decisions is one too many.`);
  } else ok(`${rel}: delegates the mock decision`);
}

if (bad) {
  console.error(`\n${bad} problem${bad === 1 ? "" : "s"}.`);
  process.exit(1);
}
console.log("\nstorage + mock-lane chokepoints hold.");
