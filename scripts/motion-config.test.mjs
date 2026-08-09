/**
 * EVERY SPA HONOURS "REDUCE MOTION", OR IT DOES NOT SHIP.
 *
 * UI-LANGUAGE §12 lists it in the accessibility floor: "Reduced motion removes
 * transforms, and layout never depends on animation." In a framer-motion app
 * that is one line — `<MotionConfig reducedMotion="user">` at the root — and it
 * is the kind of line that is easy to have and impossible to notice missing.
 *
 * Scena shipped without it. That was invisible for as long as the app did not
 * animate: its dashboard shell never orchestrated, so every screen's entrance
 * was inert and there was nothing for the preference to strip. The moment the
 * choreography was turned on, the same absent line became a real defect — a
 * person who has asked their operating system for less motion would have
 * started getting a staggered rise on every screen, with no way to refuse it.
 *
 * That is the shape this guard is for: a missing accessibility affordance that
 * is silent until an unrelated change makes it matter. Nothing failed when it
 * was introduced, and nothing would have failed when it started to bite.
 *
 * ── Why a script and not a test in each app ─────────────────────────────────
 *
 * The point is that it holds for EVERY app, including the next one. A per-app
 * test is one more thing a new app has to remember to write — which is the same
 * failure mode one level up. This derives its list from `apps.json`, so an app
 * is covered the day it is registered.
 *
 * Run by `pnpm gate`. Plain Node, no dependencies.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const ROOT = new URL("..", import.meta.url).pathname;
const registry = JSON.parse(readFileSync(join(ROOT, "apps.json"), "utf8"));

/**
 * `spa` in the registry is a workspace PACKAGE NAME (`@kova/app`), not a path —
 * it exists to be handed to turbo. So the directory is resolved by reading each
 * app package's `name`, rather than by guessing a folder from the scope, which
 * would quietly cover nothing the first time a package and its directory were
 * named differently.
 */
const byName = new Map();
for (const dir of readdirSync(join(ROOT, "apps"))) {
  const pkg = join(ROOT, "apps", dir, "package.json");
  if (!existsSync(pkg)) continue;
  byName.set(JSON.parse(readFileSync(pkg, "utf8")).name, join("apps", dir));
}

/**
 * ⚠️ THE TEMPLATE'S SPA IS APPENDED BY HAND.
 *
 * `apps/_template-app` is deliberately absent from `apps.json` — it deploys
 * nowhere — so a guard that derives its list from the registry alone would leave
 * the one SPA every future app is COPIED FROM as the only unchecked one in the
 * repo. That is this guard's own failure mode, one level up.
 */
const TEMPLATE_SPA = "@4dl/template-app";

const spas = [...new Set([...registry.apps.flatMap((a) => (a.spa ? [a.spa] : [])), TEMPLATE_SPA])];

let failures = 0;
const fail = (msg) => { console.error(`✘ ${msg}`); failures++; };

console.log("reduced motion is honoured by every SPA");

if (spas.length === 0) fail("no SPAs found in apps.json — this guard is checking nothing");

for (const spa of spas) {
  const dir = byName.get(spa);
  if (!dir) {
    fail(`${spa}: named in apps.json but no package under apps/ answers to it`);
    continue;
  }

  /*
    AN APP THAT DOES NOT ANIMATE WITH FRAMER HAS NOTHING TO REDUCE.

    Derived from its dependencies rather than an allow-list of names, so the
    exemption cannot outlive the reason for it: the day `@scena/player` grows a
    `motion` dependency it stops being exempt, with no edit here.

    The player is the case this exists for. It is deliberately dependency-free —
    a TV render loop and a Service Worker on a device with 512 MB of RAM, whose
    package.json lists only workspace packages (see CLAUDE.md). Demanding a
    React motion provider of it would be demanding the weight it exists without.
  */
  const pkg = JSON.parse(readFileSync(join(ROOT, dir, "package.json"), "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (!deps["motion"] && !deps["framer-motion"]) {
    console.log(`  – ${spa}: no framer dependency, nothing to reduce`);
    continue;
  }

  const entry = join(ROOT, dir, "src", "main.tsx");
  if (!existsSync(entry)) {
    // An app that DOES depend on framer and has no main.tsx is a path this
    // guard cannot see. Say so rather than passing silently.
    fail(`${spa}: depends on framer but has no src/main.tsx — it is not covered`);
    continue;
  }
  const src = readFileSync(entry, "utf8");

  if (!/<MotionConfig\b/.test(src)) {
    fail(`${spa}: no <MotionConfig> at the root — a reduce-motion preference is ignored (UI-LANGUAGE §12)`);
    continue;
  }
  if (!/reducedMotion=["']user["']/.test(src)) {
    fail(`${spa}: <MotionConfig> does not set reducedMotion="user"`);
    continue;
  }
  /*
    It has to WRAP the app, not sit beside it. `"user"` strips transforms for
    everything BELOW the provider, so a `<MotionConfig>` that encloses nothing
    reads as correct in a diff and does nothing at runtime — the same class of
    silent pass this whole file exists for.
  */
  const at = src.indexOf("<MotionConfig");
  const close = src.indexOf("</MotionConfig>");
  if (close < 0) {
    fail(`${spa}: <MotionConfig> is self-closing or unclosed — it wraps nothing`);
    continue;
  }
  if (!src.slice(at, close).includes("<App")) {
    fail(`${spa}: <App> is not inside <MotionConfig> — the preference reaches nothing`);
    continue;
  }
  console.log(`  ✓ ${spa}`);
}

if (failures > 0) {
  console.error(`\n${failures} SPA(s) ignore a reduce-motion preference.`);
  process.exit(1);
}
console.log(`✓ reduced motion: ${spas.length} SPA(s) honour the preference`);
