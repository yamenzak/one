#!/usr/bin/env node
/**
 * WHAT KOVA SELLS A TENANT MUST BE CHECKED BY SOMETHING.
 *
 * The sibling guard (`flag-enforcement.test.mjs`) does this for the flags a
 * TENANT sells a CLIENT. This one does the other rail: the entitlements Kova
 * sells a tenant. Same failure mode, and it is invisible the same way — an
 * entitlement is a key in a JSON blob, and a key nobody reads type-checks
 * perfectly while the plan page keeps advertising it.
 *
 * Two rules:
 *
 *   every non-reserved FEATURE is named by a `gateFeature`/`requireFeature`
 *   call in `apps/api/src`, directly or through the feature registry;
 *
 *   every QUOTA is named by a ceiling check — `withinQuota`, or an injected
 *   resolver that reads `quotas.<key>`.
 *
 * `reserved` features are the deliberate exception and are pinned by name, so
 * the roadmap list cannot quietly grow to cover an oversight.
 *
 * Plain Node, no dependencies, like the rest of `scripts/`.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const ENT_SRC = readFileSync(join(root, "packages/domain/src/entitlements.ts"), "utf8");
const FEATURES_SRC = readFileSync(join(root, "packages/domain/src/features.ts"), "utf8");
const API_DIR = join(root, "apps/api/src");

let failures = 0;
const fail = (msg) => { console.error(`✗ ${msg}`); failures++; };
const pass = (msg) => console.log(`✓ ${msg}`);

// ── The registry, read from the free-tier baseline (which IS the key set) ────
const freeBlock = ENT_SRC.slice(ENT_SRC.indexOf("FREE_ENTITLEMENTS"));
const quotaKeys = [...(freeBlock.match(/quotas:\s*\{([^}]*)\}/)?.[1] ?? "").matchAll(/([a-zA-Z]+)\s*:/g)].map((m) => m[1]);
const featureKeys = [...(freeBlock.match(/features:\s*\{([^}]*)\}/)?.[1] ?? "").matchAll(/([a-zA-Z]+)\s*:/g)].map((m) => m[1]);
// `RESERVED_FEATURES` is DERIVED (`FEATURE_KEYS.filter(k => FEATURE_META[k].reserved)`),
// so the source of truth is the `reserved: true` marker in FEATURE_META, not a
// literal list. Read the markers — a derived export cannot be regex'd, and
// guessing at one is how a guard silently checks nothing.
const reserved = [...ENT_SRC.matchAll(/^\s{2}([a-zA-Z]+):\s*\{[^\n]*reserved:\s*true/gm)].map((m) => m[1]);

if (quotaKeys.length < 3 || featureKeys.length < 5) {
  fail(`parsed only ${quotaKeys.length} quotas and ${featureKeys.length} features — the parser is broken, not the registry`);
} else {
  pass(`parsed ${quotaKeys.length} quotas and ${featureKeys.length} features from the free-tier baseline`);
}

// ── What the API actually checks ────────────────────────────────────────────
const gatedFeatures = new Set();
const gatedQuotas = new Set();
// A FeatureSpec's `entitlement` is how a feature key reaches `gateFeature`, so a
// gate naming the SPEC counts as a gate on the entitlement behind it.
const specEntitlement = new Map();
for (const block of FEATURES_SRC.split(/\n  (?=[a-zA-Z]+: \{)/).slice(1)) {
  const key = block.match(/^([a-zA-Z]+): \{/)?.[1];
  const ent = block.match(/entitlement:\s*"([a-zA-Z]+)"/)?.[1];
  if (key && ent) specEntitlement.set(key, ent);
}

const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith(".ts")) {
      const src = readFileSync(p, "utf8");
      for (const m of src.matchAll(/gateFeature\(\s*[^,]+,\s*"([a-zA-Z]+)"/g)) {
        const ent = specEntitlement.get(m[1]);
        if (ent) gatedFeatures.add(ent);
      }
      for (const m of src.matchAll(/requireFeature\(\s*[^,]+,\s*"([a-zA-Z]+)"/g)) gatedFeatures.add(m[1]);
      for (const m of src.matchAll(/hasFeature\([^)]*"([a-zA-Z]+)"/g)) gatedFeatures.add(m[1]);
      for (const m of src.matchAll(/withinQuota\(\s*[^,]+,\s*[^,]+,\s*"([a-zA-Z]+)"/g)) gatedQuotas.add(m[1]);
      // An injected ceiling — `quotas.staffSeats` handed to a shared package's
      // guard is enforcement too, it just does not go through `withinQuota`.
      for (const m of src.matchAll(/\.quotas\.([a-zA-Z]+)/g)) gatedQuotas.add(m[1]);
    }
  }
};
walk(API_DIR);

// ── The rules ───────────────────────────────────────────────────────────────
const liveFeatures = featureKeys.filter((k) => !reserved.includes(k));
const unenforcedFeatures = liveFeatures.filter((k) => !gatedFeatures.has(k));
if (unenforcedFeatures.length) {
  for (const k of unenforcedFeatures) {
    fail(`entitlement "${k}" is sold on the plan page and no route checks it.\n` +
         `    Gate it — gateFeature(c, "<featureKey>") through a FeatureSpec that declares\n` +
         `    entitlement: "${k}", or requireFeature(c, "${k}") directly. If it is roadmap only,\n` +
         `    add it to RESERVED_FEATURES so nothing can advertise it as live.`);
  }
} else {
  pass(`all ${liveFeatures.length} live entitlements are checked somewhere in apps/api/src`);
}

// A reserved feature that IS gated is the opposite error: it is real, and the
// registry is lying about it in the direction that hides the work.
for (const k of reserved.filter((k) => gatedFeatures.has(k))) {
  fail(`entitlement "${k}" is RESERVED but IS gated — take it out of RESERVED_FEATURES`);
}

const unenforcedQuotas = quotaKeys.filter((k) => !gatedQuotas.has(k));
if (unenforcedQuotas.length) {
  for (const k of unenforcedQuotas) {
    fail(`quota "${k}" has a number on every plan and nothing counts against it.\n` +
         `    Check it with withinQuota(db, tenantId, "${k}", used) before the write it caps.`);
  }
} else {
  pass(`all ${quotaKeys.length} quotas are counted against somewhere in apps/api/src`);
}

const EXPECTED_RESERVED = ["chat", "integrations"];
if (JSON.stringify([...reserved].sort()) !== JSON.stringify(EXPECTED_RESERVED)) {
  fail(`RESERVED_FEATURES changed: ${JSON.stringify([...reserved].sort())} (expected ${JSON.stringify(EXPECTED_RESERVED)}).\n` +
       `    Every entry is an entitlement the product does not have. Adding one is how this\n` +
       `    check gets defeated, so it takes a deliberate edit here and a reason in review.`);
} else {
  pass(`the reserved list still holds exactly ${EXPECTED_RESERVED.length}: ${EXPECTED_RESERVED.join(", ")}`);
}

console.log(failures ? `\n${failures} failure(s)` : "\nentitlements: everything Kova sells a tenant is enforced");
process.exit(failures ? 1 : 0);
