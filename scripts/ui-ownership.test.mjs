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
const PKGS = join(ROOT, "packages");

/*
  THE PLATFORM IS MORE THAN ONE PACKAGE, AND THIS ONLY SCANNED ONE.

  It read `@4dl/ui` alone, so an app reimplementing something `@4dl/app-kit`
  owns was structurally invisible. Scena kept a whole second `ErrorBoundary` —
  same name, same job, 60 lines against the platform's 88, minus the error text
  and minus the stale-bundle escape hatch that are the reason the platform's is
  worth having. It sat next to a passing guard the entire time.

  Both packages are BROWSER surfaces an app imports and renders, which is the
  test. The server-side packages are excluded: sharing a name with `@4dl/auth`
  is not a design-system failure.
*/
const PLATFORM_UI = ["ui", "app-kit", "admin"].map((p) => join(PKGS, p, "src"));

/**
 * Files an app is still allowed to own, and why.
 *
 * EMPTY, and that is the intended steady state. It held
 * `scena-app/src/components/ui/table.tsx` through UI-1 and UI-2 while its eight
 * users were redesigned; UI-3 finished them and the file is gone. Adding an
 * entry here is a deliberate, reviewed exception with a reason and, if it is
 * temporary, the work that removes it.
 */
const KNOWN = new Set([
  /*
    ── Surfaced by widening check 2 to `@4dl/app-kit` + `@4dl/admin` ──────────

    These four are NOT waived because they are fine. They are waived because
    each needs a judgement this pass could not make honestly, and an entry with
    a reason is the mechanism this file provides for exactly that. Each names
    the question that closes it.

    They were invisible until the platform stopped meaning one package, which
    is the finding: `ErrorBoundary` — a real duplicate, 60 lines against the
    platform's 88, minus the error text and the stale-bundle escape — sat next
    to a passing guard for as long as the guard read `@4dl/ui` alone. That one
    IS fixed; these are what else the widening found.
  */

  // Kova's inbox SCREEN vs `@4dl/app-kit`'s `Inbox`. Tessa's equivalent turned
  // out to be a thin wrapper and was renamed. Is Kova's? If so, rename; if it
  // is a second implementation, delete it and bind the platform's.
  "app/src/screens/Inbox.tsx",

  // Kova's console vs `@4dl/admin`'s. CLAUDE.md says the SHELL moved and the
  // SECTIONS stayed the app's, so this is probably the section registry under
  // the platform's name — a rename. Confirm before assuming.
  "app/src/screens/admin/AdminConsole.tsx",

  // The one that is genuinely unclear. `@4dl/app-kit` exports a `ThemeProvider`
  // and Stage 10b's note says it moved there, yet Kova still has one reading
  // `useSession()`. Either the extraction left a caller behind or Kova needs
  // something the platform's does not do — and which it is decides whether this
  // is a delete or a widening of the platform's.
  "app/src/theme.tsx",

  // Scena declares `interface HostInfo { … }` with a BODY, where Kova aliases
  // the platform's generic (`HostInfo<TenantBranding>`) and is correctly not
  // flagged. Scena's is a SUBSET — no `platform` field, a narrower `tenant` —
  // so adopting the platform's means checking what `/api/host` actually sends,
  // which is a wire question rather than a UI one.
  "scena-app/src/host.ts",
]);

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
  for (const f of PLATFORM_UI.flatMap((d) => walk(d))) {
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

/**
 * The directories that RENDER — the SPAs, not the workers.
 *
 * Checks 1 and 3 are about files (`components/ui/`, a second `cn`) and are
 * right to sweep everything. Check 2 is about NAMES, and a worker sharing a
 * name with a UI component is not the failure it describes: `host-context.ts`
 * exports a `Branding` because that is the tenant's branding on the wire, and
 * Tessa's `ai.ts` exports a `Tone` because generated copy has a tone of voice.
 * Neither is a second Button.
 *
 * Derived by looking for a `vite.config`, not hardcoded — the one thing this
 * repo has learned twice is that a per-app list is a per-app list somebody
 * forgets. `apps.json` names each app's SPA by PACKAGE name, and resolving
 * those to directories costs a second read for the same answer.
 */
const spaDirs = appDirs.filter((d) => ["ts", "js", "mts"].some((e) => existsSync(join(APPS, d, `vite.config.${e}`))));
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
/*
  Names too generic to own: an app may legitimately define these for itself.

  ⚠️ `Tone` WAS ON THIS LIST, and it should never have been. It is not a generic
  noun an app might reach for — it IS the tone vocabulary, and the whole point
  of the platform's is that `success | warning | danger | primary | neutral`
  plus app-registered accents is the only set. Scena declared its own with
  `info`, `destructive` and `muted` in it, and shipped `<Badge tone="info">`
  three times in the operator console. Nothing defines `--info`, so Tailwind
  never generated `bg-info` or `text-info` (verified absent from the built CSS
  while `bg-success` and `bg-destructive` were present) — those pills rendered
  as unstyled text, silently, past every test and every screenshot.

  A second tone vocabulary is not a naming collision. It is a second set of
  colours that the tokens do not back.
*/
const GENERIC = new Set(["Page", "Screen", "Section", "Media", "Thumb", "Unit", "Delta", "Photo", "Rail", "Filters", "Choice", "Field"]);
for (const app of spaDirs) {
  for (const f of walk(join(APPS, app, "src"))) {
    if (KNOWN.has(rel(f))) continue;
    const src = readFileSync(f, "utf8");
    // `type` and `interface` too: a shadowing TYPE is how Scena's `Tone` hid
    // from this check for as long as it existed.
    for (const m of src.matchAll(/^export (?:function|const|type|interface) ([A-Z][A-Za-z0-9_]*)([^\n]*)/gm)) {
      const name = m[1];
      if (!platform.has(name) || GENERIC.has(name)) continue;
      /*
        A pure ALIAS of the platform's own type is not a second implementation —
        it is the app narrowing a generic and re-exporting it under the name its
        screens already use. `export type HostInfo = KitHostInfo<TenantBranding>`
        cannot drift from the platform's, because it IS the platform's.

        A declaration with a BODY can drift, and that is the whole failure: a
        second `interface HostInfo { … }` copies today's shape and then does not
        follow it. So the test is the brace, not the keyword.
      */
      if (/^\s*=\s*[A-Za-z_$][\w$.]*(?:<[^{;]*>)?\s*;?\s*$/.test(m[2])) continue;
      /*
        A BINDING IS NOT A FORK, AND THE IMPORT PROVES IT.

        Kova's `notices.tsx` exports `MaintenanceBanner` and `PwaUpdatePrompt`
        under the platform's own names — deliberately, so its screens import
        notices from one place — while importing the platform's as `Kit*` and
        rendering them with Kova's session and Kova's dunning copy. Tessa's
        notification bell is the same shape.

        That is the pattern the extraction plan asks for (the registry is
        injected, the presentation half stays the app's), and flagging it turns
        a correct binding into a rename. The distinguishing fact is mechanical:
        a file that IMPORTS the name from a platform package cannot be a second
        implementation of it, because it is rendering the first one.
      */
      if (new RegExp(`\\b${name}\\b[^\\n]*from "@4dl/`).test(src)) continue;
      fail(`${rel(f)} exports \`${name}\`, which a shared UI package already exports. Two components with one name is how a design system stops being one.`);
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
  // `uiFiles` counts private `components/ui/` files; `KNOWN` is the exception
  // list. Reporting the first under the second's label printed "0 waived"
  // beside four waived paths — a summary line contradicting itself.
  console.log(`✓ ui ownership: ${scanned.length} app files, ${platform.size} platform exports across ${PLATFORM_UI.length} packages`);
  console.log(`  ${uiFiles} private components/ui file(s) · ${KNOWN.size} known exception(s)${KNOWN.size ? `: ${[...KNOWN].join(", ")}` : ""}`);
}
