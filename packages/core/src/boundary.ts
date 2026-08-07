/**
 * THE PACKAGE BOUNDARY, CHECKED BY A MACHINE.
 *
 * `@4dl/*` packages are the parts several apps share. The rule that keeps them
 * shareable is stated in every README — "no product vocabulary" — and a rule
 * stated in a README is a rule that decays. `@4dl/ui` carries a `Tone` union with
 * `nutrition` and `hydration` in it; `@4dl/platform` calls a tenant a "studio" in
 * its own type names. Both were written *after* the boundary was documented, by
 * people (and agents) who had read the document.
 *
 * So the boundary is a test. Two checks:
 *
 *   1. **No app imports.** A `@4dl/*` package may not import `@kova/*` or any
 *      other app scope. This is the hard one — it is what makes "shared" true
 *      rather than aspirational, and it has no exceptions.
 *   2. **No product nouns.** Identifiers, type names and user-facing strings may
 *      not name things only one app has. Warehouses have no clients; clinics have
 *      no workouts.
 *
 * ── The ratchet ─────────────────────────────────────────────────────────────
 *
 * Check 2 cannot land green on a codebase that already leaks, and a check that
 * cannot land is a check that gets deleted. So each package freezes its CURRENT
 * violations in an `allow` list. New leaks fail immediately; removing one from
 * the list is how a fix is recorded. The list is the debt, visible and countable,
 * and it only ever gets shorter.
 *
 * Node-only (it reads the filesystem) and therefore exported from
 * `@4dl/core/boundary`, never from the package root — nothing here may end up in
 * a Worker bundle.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Nouns that belong to one product and not to a platform.
 *
 * Deliberately not exhaustive and deliberately not clever: this is a list of
 * words, matched case-insensitively on word boundaries. A new app adds its own
 * nouns when it discovers one leaking, which is the only way this list can stay
 * honest — nobody can predict app #4's vocabulary.
 */
export const PRODUCT_NOUNS: readonly string[] = [
  // Kova
  "studio", "client", "coach", "trainer", "athlete", "workout", "exercise",
  "meal", "nutrition", "macro", "calorie", "hydration", "supplement", "fasting",
  "checkin", "check_in", "bodyfat", "kova",
  // reserved for the apps queued behind it, so a leak is caught on arrival
  "inventory", "barcode", "patient", "prescription", "scena", "bocca",
];

/** App package scopes. A shared package importing one of these is not shared. */
export const APP_SCOPES: readonly string[] = ["@kova/", "@scena/", "@bocca/"];

/**
 * Names from the web platform and from third-party APIs that happen to contain a
 * banned noun. `el.clientWidth` is not product vocabulary — it is the DOM, and a
 * checker that flags it teaches people to disable the checker.
 *
 * Stripe's `client_secret` is here for the same reason and ahead of need: it
 * arrives in Stage 3 with the billing extraction, and a false failure at that
 * moment would land in the middle of a money-path move.
 *
 * `clientExtensionResults` is WebAuthn's — `PublicKeyCredential`'s own field
 * name, which the passkey ceremony destructures off every credential.
 *
 * ⚠️ Add to this list only for a name a SPEC or a vendor chose. A name the
 * codebase chose is a boundary violation even when it feels incidental: the
 * `WebSocketPair` halves in `@4dl/notify` are `browserSide`/`workerSide` rather
 * than an exemption, because those were ours to rename.
 */
const EXEMPT_IDENTIFIERS: readonly string[] = [
  "clientWidth", "clientHeight", "clientTop", "clientLeft", "clientX", "clientY",
  "getBoundingClientRect", "ClientRect", "clientInformation",
  "client_secret", "clientSecret",
  "clientExtensionResults",
  // lucide's own component name for the glyph. Case-sensitive on purpose: the
  // vendor's `Barcode` is exempt, a field called `barcode` is still a leak.
  "Barcode",
];

const EXEMPT_RE = new RegExp(EXEMPT_IDENTIFIERS.join("|"), "g");

export interface BoundaryViolation {
  /** Path relative to the package root. */
  file: string;
  line: number;
  kind: "app-import" | "product-noun";
  /** The offending word or module specifier. */
  token: string;
  /** The source line, trimmed — enough to judge it from the failure message. */
  text: string;
}

export interface BoundaryOptions {
  /** Package root (the directory holding `package.json`). */
  dir: string;
  /** Subdirectory to scan. Defaults to `src`. */
  scan?: string;
  /**
   * Frozen violations. Each entry is `"<file>:<token>"`; every violation
   * matching one is ignored. File-level rather than line-level on purpose —
   * pinning line numbers makes every unrelated edit a test failure.
   */
  allow?: readonly string[];
  /** Extra nouns for this package's app neighbourhood. */
  nouns?: readonly string[];
}

const SOURCE = /\.(ts|tsx)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (SOURCE.test(name)) out.push(p);
  }
  return out;
}

/**
 * A line's code, with comments stripped.
 *
 * Comments are exempt: explaining a boundary requires naming what is on the
 * other side of it, and this module's own header would fail its own check
 * otherwise. What matters is that no *identifier, type or shipped string* names
 * a product concept — that is what a consuming app is forced to adopt.
 */
function code(line: string): string {
  const noLine = line.replace(/\/\/.*$/, "");
  return noLine.replace(/\/\*.*?\*\//g, "");
}

/**
 * Break identifiers apart so a word-boundary match can see inside them.
 *
 * `\b` treats `_` and letters as word characters, so a naive scan finds `studio`
 * in `studio: StudioStanding` (the field) and misses it in `StudioStanding`
 * (the type) — which is backwards: the TYPE name is the one every consuming app
 * is forced to adopt. Splitting on case transitions and underscores makes
 * `clientId`, `client_id` and `ClientRow` all visible.
 */
function splitIdentifiers(src: string): string {
  return src.replace(EXEMPT_RE, "").replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

export function findBoundaryViolations(opts: BoundaryOptions): BoundaryViolation[] {
  const root = join(opts.dir, opts.scan ?? "src");
  const nouns = [...PRODUCT_NOUNS, ...(opts.nouns ?? [])];
  const nounRe = new RegExp(`\\b(${nouns.join("|")})s?\\b`, "i");
  const allow = new Set(opts.allow ?? []);
  const out: BoundaryViolation[] = [];

  for (const path of walk(root)) {
    const file = relative(opts.dir, path);
    const lines = readFileSync(path, "utf8").split("\n");
    // Block comments spanning lines are the norm in this codebase; track them so
    // a prose paragraph naming "client" is not read as a declaration.
    let inBlock = false;
    lines.forEach((raw, i) => {
      const trimmed = raw.trim();
      if (inBlock) {
        if (trimmed.includes("*/")) inBlock = false;
        return;
      }
      /*
        ⚠️ `{/* … *​/}` COUNTS. A JSX block comment is the same prose in a
        different syntax, and the rule above deliberately exempts prose —
        documentation may say which apps exist; a TYPE or a shipped string may
        not, because that is what a consuming app is forced to adopt.

        Without the `{` form, identical wording was a violation or not depending
        on whether it sat above the JSX or inside it. That is not a rule anybody
        can follow, and it is the kind of arbitrariness that gets a real check
        dismissed as noise.
      */
      if (/^\{?\/\*/.test(trimmed) && !/\*\/\}?/.test(trimmed)) {
        inBlock = true;
        return;
      }
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;

      const src = code(raw);
      if (!src.trim()) return;

      for (const scope of APP_SCOPES) {
        if (src.includes(`"${scope}`) || src.includes(`'${scope}`)) {
          if (!allow.has(`${file}:${scope}`)) {
            out.push({ file, line: i + 1, kind: "app-import", token: scope, text: trimmed.slice(0, 120) });
          }
        }
      }

      const m = nounRe.exec(splitIdentifiers(src));
      if (m) {
        const token = m[1]!.toLowerCase();
        if (!allow.has(`${file}:${token}`)) {
          out.push({ file, line: i + 1, kind: "product-noun", token, text: trimmed.slice(0, 120) });
        }
      }
    });
  }
  return out;
}

/** One line per violation, ready to be the assertion message. */
export function formatViolations(v: readonly BoundaryViolation[]): string {
  return v.map((x) => `  ${x.file}:${x.line}  [${x.token}]  ${x.text}`).join("\n");
}

/**
 * Every `<file>:<token>` pair currently violating, deduplicated and sorted —
 * paste this into a package's `allow` list to freeze its debt at today's level.
 */
export function violationKeys(v: readonly BoundaryViolation[]): string[] {
  return [...new Set(v.map((x) => `${x.file}:${x.token}`))].sort();
}
