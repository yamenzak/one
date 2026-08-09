#!/usr/bin/env node
/**
 * WHAT AN APP SELLS A TENANT MUST BE CHECKED BY SOMETHING — IN EVERY APP.
 *
 * The sibling guard (`flag-enforcement.test.mjs`) does this for the flags a
 * TENANT sells a CLIENT. This one does the other rail: the entitlements a
 * product sells a tenant. Same failure mode, and it is invisible the same way —
 * an entitlement is a key in a JSON blob, and a key nobody reads type-checks
 * perfectly while the plan page keeps advertising it.
 *
 * ── Why this file changed shape ─────────────────────────────────────────────
 *
 * It checked `apps/api` and nothing else. Two other products have shipped since,
 * both selling entitlements through the same engine, and neither was looked at —
 * so the guard that exists to stop a capability being sold unenforced was itself
 * a per-app step nobody duplicated. That is finding #7 of
 * `docs/PLATFORM-AUDIT.md`, and it is the same lesson `apps.json` already
 * encodes for deployment: **derive the list, do not repeat it.**
 *
 * ── How an app is found, and why nothing is hardcoded ───────────────────────
 *
 * The app LIST is `apps.json` — every entry that provisions a D1, because an app
 * with no database sells nothing. The REGISTRY inside each app is found by the
 * one call every one of them must make: `bindEntitlements<T>(BASELINE)`. Kova's
 * is in `packages/domain`, Tessa's and Scena's are in their own `src/`; the
 * search follows each app's workspace dependencies, so a fourth product is found
 * wherever it puts the file.
 *
 * Two rules, per app:
 *
 *   every non-reserved FEATURE is named by a gate — `gateFeature`/
 *   `requireFeature`/`hasFeature`, or a direct `.features.<key>` read;
 *
 *   every QUOTA is named by a ceiling check — `withinQuota`, or an injected
 *   resolver that reads `.quotas.<key>`.
 *
 * ⚠️ A DIRECT PROPERTY READ COUNTS, and that is a deliberate weakening. The
 * guard cannot tell `if (!ent.features.ai) return 403` from rendering the value
 * on a screen. Refusing to count it would fail two apps for gating correctly in
 * the idiom they actually use; counting it means a feature that is only ever
 * DISPLAYED reads as enforced. The narrower check is the one that gets waived,
 * and a waived guard checks nothing at all.
 *
 * `reserved` features are the deliberate exception and are pinned by name, per
 * app, so a roadmap list cannot quietly grow to cover an oversight.
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
 * The reserved list, per app — an ASSERTION, not a derivation.
 *
 * Every entry is an entitlement the product does not have. Adding one is how
 * this check gets defeated, so it takes a deliberate edit here and a reason in
 * review. An app absent from this map must have no reserved features at all.
 */
const EXPECTED_RESERVED = {
  kova: ["chat", "integrations"],
  tessa: [],
  scena: [],
};

/**
 * ACKNOWLEDGED DEBT — keys this guard found unenforced when it first ran across
 * all three apps, with what each one costs.
 *
 * ⚠️ This list can only SHRINK, and the guard enforces that: an entry that
 * becomes enforced fails here until it is deleted. So it cannot rot into a
 * permanent exemption the way a `skip` does, and adding to it is a deliberate
 * edit with a reason, in review.
 *
 * Why a list at all rather than fixing them in the same commit: this guard was
 * `apps/api`-only, and widening it is the change. Every entry below is real
 * product work in an app — counting rows before a write, plumbing a number to a
 * device — and doing five of those inside a commit about a test script is how a
 * diff becomes unreviewable. They are written up as findings in
 * `docs/PLATFORM-AUDIT.md`; this is the thing that stops a SIXTH appearing
 * unnoticed, which is the whole point.
 */
const KNOWN_UNENFORCED = {
  kova: {},
  tessa: {
    // 50 free, unlimited on every paid tier, and nothing counts the rows. A
    // free centre can hold ten thousand catalog items.
    catalogItems: "sold 50/unlimited, no count before the insert",
  },
  scena: {
    // `gateWidgets` drops a ticker widget without `ticker`, and never looks at
    // `tickerAdvanced` — so the advanced ticker config a paid tier buys is
    // available on every tier that has a ticker at all.
    tickerAdvanced: "sold on Plus and above, `gateWidgets` only checks `ticker`",
    // 1/2/6 per tier. Nothing counts a station's boards before adding one.
    boardsPerStation: "sold 1/2/6, no count when a board is attached to a station",
    /*
      The sharpest of the five, because the number IS the product: a paid
      workspace's screens are meant to re-fetch their manifest sooner. The
      player's interval is not read from this quota anywhere, so every tier
      resyncs on the same schedule and the faster one is sold and not delivered.
    */
    resyncIntervalSec: "sold per tier, never reaches the player's fetch loop",
    /*
      These two are a DIFFERENT class and the fix is in the registry, not a
      route: both are `true` in the free baseline and `true` on every plan, so no
      tier withholds them and there is nothing for a gate to refuse.
      `emergencyOverride` is deliberate and documented (SCENA.md — the
      fire/evacuation path is the one capability the free tier grants
      unconditionally, and the route guard exempts it from read-only).
      `screenSaver` looks like the same decision without the argument.
    */
    emergencyOverride: "granted unconditionally by design — nothing withholds it",
    screenSaver: "true on every tier, so it is not a plan differentiator at all",
  },
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

/** Every workspace package directory, by package name. */
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

/**
 * The app's own source, plus the source of every workspace package it depends
 * on. Kova keeps its registry in `@kova/domain`; the other two keep theirs in
 * `src/`. Following the dependency edge finds both without naming either.
 */
function appSources(appDir) {
  const files = tsFiles(join(root, appDir, "src"));
  const pkgPath = join(root, appDir, "package.json");
  if (!existsSync(pkgPath)) return files;
  const deps = Object.entries(JSON.parse(readFileSync(pkgPath, "utf8")).dependencies ?? {});
  for (const [name, spec] of deps) {
    if (!String(spec).startsWith("workspace:")) continue;
    const dir = workspaceDirs.get(name);
    if (dir) files.push(...tsFiles(join(dir, "src")));
  }
  return files;
}

// ── The registry, found by the one call every app makes ─────────────────────

/**
 * `bindEntitlements<T>(BASELINE)` is the seam. Locate the call, then the
 * BASELINE object it was handed, and read the key set off it — the free tier IS
 * the key set, because the engine merges a stored blob onto it key by key and a
 * key missing there can never be set by a plan.
 */
/** Keys of a flat object literal body, comments stripped first.
 *  ⚠️ Comments MUST go before the keys are read: every baseline in this repo
 *  documents its quotas inline, and `// 100 MB — enough for:` parses as a key. */
const keysOf = (body) =>
  [...body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").matchAll(/([a-zA-Z][a-zA-Z0-9]*)\s*:/g)].map((m) => m[1]);

function readRegistry(files) {
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    // ⚠️ `[^)]*` after the baseline, not `\)`. Kova passes a second argument
    // (`{ suspendedStatuses }`), and requiring the paren to close immediately
    // found no call at all there — which the guard then reported as "this app
    // sells nothing", i.e. it silently stopped checking the app it was written
    // for.
    const name = src.match(/bindEntitlements<[^>]*>\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*[,)]/)?.[1];
    if (!name) continue;
    const from = src.indexOf(`const ${name}`);
    if (from < 0) continue;
    const block = src.slice(from);
    // ⚠️ Not anchored to start-of-line: Tessa writes its whole baseline on one
    // line, and an anchored key regex read exactly one quota and one feature
    // from it — a pass-shaped result over a registry it had not parsed.
    const quotas = keysOf(block.match(/quotas:\s*\{([^}]*)\}/)?.[1] ?? "");
    const features = keysOf(block.match(/features:\s*\{([^}]*)\}/)?.[1] ?? "");
    /*
      `RESERVED_FEATURES` is DERIVED in every app (`FEATURE_KEYS.filter(k =>
      FEATURE_META[k].reserved)`), so the source of truth is the `reserved: true`
      marker rather than a literal list. Read the markers — a derived export
      cannot be regex'd, and guessing at one is how a guard silently checks
      nothing.
    */
    const reserved = [...src.matchAll(/^\s{2}([a-zA-Z]+):\s*\{[^\n]*reserved:\s*true/gm)].map((m) => m[1]);
    return { file, quotas, features, reserved };
  }
  return null;
}

// ── What the app actually checks ────────────────────────────────────────────

/**
 * A FeatureSpec's `entitlement` is how a feature key reaches `gateFeature`, so a
 * gate naming the SPEC counts as a gate on the entitlement behind it.
 *
 * ⚠️ Built from the app's WHOLE source graph, while the gate calls below are
 * collected from the app's own `src` only. Kova's spec registry lives in
 * `@kova/domain`, and building this map from `apps/api/src` alone reported five
 * of its entitlements as ungated — a guard failing the app it was written for,
 * on capabilities that are in fact gated.
 */
function readSpecMap(files) {
  const specEntitlement = new Map();
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const block of src.split(/\n  (?=[a-zA-Z]+: \{)/).slice(1)) {
      const key = block.match(/^([a-zA-Z]+): \{/)?.[1];
      const ent = block.match(/entitlement:\s*"([a-zA-Z]+)"/)?.[1];
      if (key && ent) specEntitlement.set(key, ent);
    }
  }
  return specEntitlement;
}

/**
 * Every entitlement key the app's own code CONSULTS.
 *
 * ── Why this is two regexes and not a list of call shapes ───────────────────
 *
 * The first version of this looked for `gateFeature` / `requireFeature` /
 * `hasFeature` / `.features.<key>` / `withinQuota` — the five shapes Kova uses.
 * Run against three apps it reported eight of Scena's entitlements as ungated,
 * and every one of them was gated:
 *
 *     if (w?.type === "ticker" && !f.ticker) return false;   // content.ts
 *     if (!aEnt.features[needed]) return c.json(…, 403);     // index.ts, where
 *       // `needed` comes from CHANNEL_FLAG = { webhook: "alertsWebhook", … }
 *
 * The first is a destructured `Features` object, so there is no `.features.`
 * prefix to match. The second is a DYNAMIC lookup — the key exists in the source
 * only as a string in a lookup table. No amount of call-shape matching finds
 * either, and a guard that reports eight false failures gets waived within a
 * day, at which point it checks nothing at all.
 *
 * So the question is weaker and answerable: **does any of the app's own code
 * name this key** — as a property access or as a string literal — outside the
 * registry that declares it?
 *
 * ⚠️ What that CANNOT distinguish: enforcing a key from merely displaying it.
 * `ent.features.ai` in a route guard and in a settings payload look identical.
 * The narrower check was strictly worse, because it was wrong about real gates
 * rather than generous about fake ones — and what this still catches is the
 * failure that has actually happened: a key that is sold on every plan and
 * appears NOWHERE in the app but its own registry and the seed that prices it.
 *
 * The seed is not a false pass, incidentally: a catalog writes `ticker: true` as
 * an object-literal key, which is neither a property access nor a string.
 */
function readEnforcement(files, specEntitlement, registryFile) {
  const named = new Set();
  /** The high-confidence subset: an unambiguous gate call. Used only where a
   *  false positive would ACCUSE rather than excuse. */
  const strict = new Set();
  for (const file of files) {
    if (file === registryFile) continue; // declaring a key is not consulting it
    const src = readFileSync(file, "utf8");
    // The one INDIRECTION worth resolving explicitly: a gate names a
    // FeatureSpec and the spec names the entitlement, so the entitlement key is
    // nowhere in the calling file's text.
    for (const m of src.matchAll(/gateFeature\(\s*[^,]+,\s*"([a-zA-Z]+)"/g)) {
      const ent = specEntitlement.get(m[1]);
      if (ent) { named.add(ent); strict.add(ent); }
    }
    for (const m of src.matchAll(/requireFeature\(\s*[^,]+,\s*"([a-zA-Z]+)"/g)) strict.add(m[1]);
    for (const m of src.matchAll(/hasFeature\([^)]*"([a-zA-Z]+)"/g)) strict.add(m[1]);
    for (const m of src.matchAll(/\.features\.([a-zA-Z]+)/g)) strict.add(m[1]);
    for (const m of src.matchAll(/withinQuota\(\s*[^,]+,\s*[^,]+,\s*"([a-zA-Z]+)"/g)) strict.add(m[1]);
    for (const m of src.matchAll(/\.([a-zA-Z][a-zA-Z0-9]*)/g)) named.add(m[1]);
    for (const m of src.matchAll(/"([a-zA-Z][a-zA-Z0-9]*)"/g)) named.add(m[1]);
  }
  return { named, strict };
}

// ── Per app ─────────────────────────────────────────────────────────────────

/**
 * An app with no D1 sells nothing. `www` and the Scena player are workers with
 * no database and no catalog, and asking them to enforce an entitlement would
 * be asking about a rail they are not on.
 */
const products = REGISTRY.apps.filter((a) => a.provision?.d1);
if (products.length < 2) {
  fail(`found only ${products.length} product app(s) in apps.json — the registry reader is broken, not the registry`);
}

for (const app of products) {
  // The app's OWN source is what must contain the gates. The dependency walk is
  // only for finding the registry: a gate in a shared package is that package's
  // business, and counting it would let an app pass on a check it never makes.
  const ownFiles = tsFiles(join(root, app.dir, "src"));
  const registry = readRegistry([...ownFiles, ...appSources(app.dir)]);
  if (!registry) {
    fail(`${app.id}: no \`bindEntitlements<T>(BASELINE)\` call found in ${app.dir}/src or its workspace dependencies.\n` +
         `    Every app that sells a plan binds the engine exactly once. If this one genuinely\n` +
         `    does not, it should not be provisioning a D1 catalog either.`);
    continue;
  }
  const { quotas, features, reserved } = registry;
  if (quotas.length < 2 || features.length < 2) {
    fail(`${app.id}: parsed only ${quotas.length} quotas and ${features.length} features — the parser is broken, not the registry`);
    continue;
  }

  const { named: consulted, strict } = readEnforcement(ownFiles, readSpecMap(appSources(app.dir)), registry.file);

  const known = KNOWN_UNENFORCED[app.id] ?? {};
  const live = features.filter((k) => !reserved.includes(k));
  const unenforced = live.filter((k) => !consulted.has(k));
  for (const k of unenforced.filter((k) => !(k in known))) {
    fail(`${app.id}: entitlement "${k}" is sold on the plan page and no route checks it.\n` +
         `    Gate it before the capability it names. If it is roadmap only, mark it\n` +
         `    \`reserved: true\` in FEATURE_META so nothing can advertise it as live.`);
  }
  const carried = unenforced.filter((k) => k in known);
  if (!unenforced.length) pass(`${app.id}: all ${live.length} live entitlements are checked in ${app.dir}/src`);
  else if (unenforced.length === carried.length) {
    pass(`${app.id}: ${live.length - carried.length}/${live.length} entitlements checked · ${carried.length} known: ${carried.join(", ")}`);
  }

  /*
    A reserved feature that IS gated is the opposite error: it is real, and the
    registry is lying about it in the direction that hides the work.

    ⚠️ This one reads the STRICT signal, not `consulted`. The loose match says
    "the app names this key somewhere", which for a reserved feature is true of
    the plan page that greys it out — and it fired on Kova's `integrations` for
    exactly that reason. Claiming a roadmap feature is secretly finished needs
    the high-confidence evidence: a gate call naming it.
  */
  for (const k of reserved.filter((k) => strict.has(k))) {
    fail(`${app.id}: entitlement "${k}" is RESERVED but IS gated — drop the \`reserved\` marker`);
  }

  const unenforcedQuotas = quotas.filter((k) => !consulted.has(k));
  for (const k of unenforcedQuotas.filter((k) => !(k in known))) {
    fail(`${app.id}: quota "${k}" has a number on every plan and nothing counts against it.\n` +
         `    Check it with withinQuota(db, tenantId, "${k}", used) before the write it caps.`);
  }
  const carriedQuotas = unenforcedQuotas.filter((k) => k in known);
  if (!unenforcedQuotas.length) pass(`${app.id}: all ${quotas.length} quotas are counted against in ${app.dir}/src`);
  else if (unenforcedQuotas.length === carriedQuotas.length) {
    pass(`${app.id}: ${quotas.length - carriedQuotas.length}/${quotas.length} quotas counted · ${carriedQuotas.length} known: ${carriedQuotas.join(", ")}`);
  }

  /*
    THE LIST CAN ONLY SHRINK. An entry that is now enforced — or that names a key
    the registry no longer has — must be deleted, or the next reader trusts a
    debt list describing work that is already done.
  */
  for (const k of Object.keys(known)) {
    if (!features.includes(k) && !quotas.includes(k)) {
      fail(`${app.id}: KNOWN_UNENFORCED names "${k}", which is not in the registry any more — delete the entry`);
    } else if (consulted.has(k)) {
      fail(`${app.id}: "${k}" IS enforced now — delete it from KNOWN_UNENFORCED.\n` +
           `    A debt list that outlives the debt is worse than none: it tells the next reader\n` +
           `    the work is outstanding when it is done.`);
    }
  }

  const expected = EXPECTED_RESERVED[app.id];
  if (!expected) {
    fail(`${app.id} is not in EXPECTED_RESERVED. Add it — \`[]\` if it reserves nothing.\n` +
         `    An app that can appear without a pinned list is an app whose roadmap features\n` +
         `    are unpinned, which is the whole thing this assertion exists to stop.`);
  } else if (JSON.stringify([...reserved].sort()) !== JSON.stringify([...expected].sort())) {
    fail(`${app.id}: reserved features changed: ${JSON.stringify([...reserved].sort())} (expected ${JSON.stringify(expected)}).\n` +
         `    Every entry is an entitlement the product does not have. Adding one is how this\n` +
         `    check gets defeated, so it takes a deliberate edit here and a reason in review.`);
  } else {
    pass(`${app.id}: reserved list still holds ${expected.length}${expected.length ? `: ${expected.join(", ")}` : ""}`);
  }
}

console.log(failures ? `\n${failures} failure(s)` : `\nentitlements: every product in apps.json enforces what it sells`);
process.exit(failures ? 1 : 0);
