/**
 * NO APP OWNS A DESIGN SYSTEM.
 *
 * `@4dl/ui` is the platform's, and the whole value of it is that improving a
 * control improves it everywhere. An app that keeps its own `Button` gets none
 * of that, and — worse — nobody notices, because a private copy compiles, looks
 * approximately right, and drifts one small edit at a time.
 *
 * This is not hypothetical. Scena arrived from its own repository with
 * EIGHTEEN private primitives under `src/components/ui/` and 256 call sites
 * pointing at them, while Kova and Tessa had zero. Same tokens, same colours, a
 * different-feeling product: different button heights, different radii, a
 * different focus ring, and a `cn` that was a byte-identical copy of the shared
 * one. None of it failed anything.
 *
 * So the rule is structural rather than stylistic, and it is checked here
 * rather than in an app's own suite: a shared-UI rule that each app opts into
 * is a rule the next app forgets.
 *
 * ── What it checks ───────────────────────────────────────────────────────────
 *
 *  1. No app carries a `src/components/ui/` directory.
 *  2. No app defines a component whose name the platform already exports.
 *  3. No app ships its own `cn` / `clsx`+`twMerge` class merger.
 *
 * ── The escape hatch, and why it is a LIST ───────────────────────────────────
 *
 * `KNOWN` names the files that are allowed to exist today, each with a reason
 * and, where it applies, the task that removes it. It is a list rather than a
 * pattern on purpose: adding an entry is an edit somebody reviews, while a
 * pattern silently absorbs the next violation too.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const APPS = join(ROOT, "apps");
const UI_SRC = join(ROOT, "packages/ui/src");

/**
 * Files an app is still allowed to own, and why.
 *
 * EMPTY, and that is the intended steady state. It held
 * `scena-app/src/components/ui/table.tsx` through UI-1 and UI-2 while its eight
 * users were redesigned; UI-3 finished them and the file is gone. Adding an
 * entry here is a deliberate, reviewed exception with a reason and, if it is
 * temporary, the work that removes it.
 */
const KNOWN = new Set([]);

/** Every `.tsx`/`.ts` file under a directory, relative to `apps/`. */
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !name.includes(".test.")) out.push(full);
  }
  return out;
}

/**
 * Component and hook names `@4dl/ui` exports.
 *
 * ⚠️ `lib/icons.tsx` is EXCLUDED, and that exclusion is the difference between
 * a useful check and a nuisance one. It re-exports ~200 lucide glyphs —
 * `Settings`, `Barcode`, `Users`, `Search` — so without this every app's
 * `Settings` screen and Tessa's `Barcode` module read as collisions with the
 * design system. They are not components the platform owns; they are pictures.
 */
function platformExports() {
  const names = new Set();
  for (const f of walk(UI_SRC)) {
    if (f.endsWith("lib/icons.tsx")) continue;
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/^export (?:function|const|interface|type|class) ([A-Za-z0-9_]+)/gm)) names.add(m[1]);
    for (const m of src.matchAll(/^export \{([^}]*)\}/gm)) {
      for (const part of m[1].split(",")) {
        const n = part.trim().split(/\s+as\s+/).pop()?.trim();
        if (n) names.add(n);
      }
    }
  }
  return names;
}

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
};

const appDirs = existsSync(APPS) ? readdirSync(APPS).filter((d) => statSync(join(APPS, d)).isDirectory()) : [];
const rel = (f) => f.slice(APPS.length + 1);

/* ── 1. no private `components/ui/` ─────────────────────────────────────────
   The directory name is shadcn's convention and is what every one of these
   started as: a `pnpm dlx shadcn add button` that nobody revisited. */
let uiFiles = 0;
for (const app of appDirs) {
  for (const f of walk(join(APPS, app, "src/components/ui"))) {
    uiFiles++;
    if (!KNOWN.has(rel(f))) {
      fail(`${rel(f)} is a private copy of a design-system component. Use @4dl/ui, or add it there if the platform is missing it.`);
    }
  }
}

/* ── 2. no app redefines a name the platform exports ────────────────────────
   Catches the same drift under a different directory — `src/ui/Button.tsx`,
   `src/widgets/Card.tsx` — which is where it would move if only rule 1 held. */
const platform = platformExports();
// Names too generic to own: an app may legitimately define these for itself.
const GENERIC = new Set(["Page", "Screen", "Section", "Media", "Thumb", "Unit", "Tone", "Delta", "Photo", "Rail", "Filters", "Choice", "Field"]);
for (const app of appDirs) {
  for (const f of walk(join(APPS, app, "src"))) {
    if (KNOWN.has(rel(f))) continue;
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/^export (?:function|const) ([A-Z][A-Za-z0-9_]*)/gm)) {
      const name = m[1];
      if (!platform.has(name) || GENERIC.has(name)) continue;
      fail(`${rel(f)} exports \`${name}\`, which @4dl/ui already exports. Two components with one name is how a design system stops being one.`);
    }
  }
}

/* ── 3. one class merger ────────────────────────────────────────────────────
   `cn` is four lines, so every app writes its own — and then a Tailwind-merge
   version bump lands in one of them and not the others. */
for (const app of appDirs) {
  for (const f of walk(join(APPS, app, "src"))) {
    if (KNOWN.has(rel(f))) continue;
    const src = readFileSync(f, "utf8");
    if (/twMerge\s*\(\s*clsx\s*\(/.test(src) || /^export function cn\(/m.test(src)) {
      fail(`${rel(f)} defines its own class merger. \`cn\` is exported by @4dl/ui.`);
    }
  }
}

/* ── the guard on the guard ─────────────────────────────────────────────────
   Every check above passes vacuously if the walk finds nothing — a moved
   directory, a renamed `src`, a bad join. Assert the scan reached real code. */
const scanned = appDirs.flatMap((a) => walk(join(APPS, a, "src")));
if (scanned.length < 100) fail(`only ${scanned.length} app source files scanned — the walk is not reaching the apps.`);
if (platform.size < 100) fail(`only ${platform.size} @4dl/ui exports found — the export scan is broken, so check 2 proves nothing.`);
for (const k of KNOWN) {
  if (!existsSync(join(APPS, k))) fail(`KNOWN names ${k}, which does not exist. Delete the entry — a stale waiver hides the next violation.`);
}

if (!process.exitCode) {
  console.log(`✓ ui ownership: ${scanned.length} app files, ${platform.size} platform exports, ${uiFiles} waived (${[...KNOWN].join(", ") || "none"})`);
}
