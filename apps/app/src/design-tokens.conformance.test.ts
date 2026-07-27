/**
 * Everything visual must come from a token, so a studio can rebrand the whole
 * app from one screen.
 *
 * Radius, elevation and hairline colour are all runtime-overridable
 * (`applyBranding` writes `--radius`, `--shadow-sm/md/lg`, `--border`), and
 * Tailwind's `rounded-*` / `shadow-*` / `border-border` utilities resolve
 * straight to those variables. That machinery is worth nothing if a single
 * component hard-codes `rounded-[14px]` or `shadow-[0_4px_...]`: that component
 * silently opts out, and a tenant who dials the app flat is left with one card
 * still floating.
 *
 * So this is a lint, not a style preference. It reads the source and fails on
 * any visual value that cannot follow the brand.
 *
 * ── Escaping it ──
 * Some values genuinely must not be themeable — a guide overlay drawn on a live
 * camera feed has to read against arbitrary video, not against a theme surface.
 * Put `design-tokens-exempt: <why>` in a comment on the offending line, or on a
 * line up to EXEMPT_WINDOW lines above it (for a JSX attribute that cannot carry
 * a comment of its own). The reason is mandatory: the point is that the decision
 * is visible and argued, not that the rule can be waved away.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/** Repo root, from this file's location (apps/app/src). */
const ROOT = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");

/** Everything that renders. `packages/ui` is included deliberately — the design
 *  system is the most damaging place to hard-code a value, because every screen
 *  inherits it. */
const ROOTS = ["apps/app/src", "packages/ui/src"];

/**
 * Files allowed to contain raw values, because they are where the tokens are
 * DEFINED rather than consumed.
 *   - tokens.css: the token declarations themselves.
 *   - lib/theme.ts: SHADOW_PRESETS + applyBranding, i.e. the code that writes them.
 */
const TOKEN_SOURCES = ["packages/ui/src/tokens.css", "packages/ui/src/lib/theme.ts"];

const EXEMPT = /design-tokens-exempt[^:]*:\s*\S/;
/** How far below its marker an exemption reaches. Small on purpose: enough to
 *  cover one JSX element's attributes, not enough to blanket a file. */
const EXEMPT_WINDOW = 4;

interface Rule {
  id: string;
  /** Global, so every occurrence on a line is reported. */
  re: RegExp;
  why: string;
}

const RULES: Rule[] = [
  {
    id: "arbitrary-radius",
    re: /\brounded-\[[^\]]+\]/g,
    why: "use a rounded-* step (they resolve to --radius, which branding sets) or rounded-full",
  },
  {
    id: "arbitrary-shadow",
    re: /\bshadow-\[[^\]]+\]/g,
    why: "use shadow-sm/md/lg (they resolve to --shadow-*, which the branding elevation preset sets) or shadow-glow",
  },
  {
    id: "palette-border-colour",
    // A named-palette or literal border colour cannot track --border.
    re: /\bborder-(?:white|black|zinc|slate|gray|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)\b(?:-\d{2,3})?(?:\/\d+)?|\bborder-\[[^\]]+\]/g,
    why: "use border-border (or a semantic token like border-primary/40) so the hairline follows branding",
  },
  {
    id: "inline-visual-style",
    // Inline style bypasses Tailwind entirely, so it bypasses the tokens too.
    re: /(?:borderRadius|boxShadow)\s*:/g,
    why: "set radius/elevation with a utility class so it resolves through the tokens",
  },
  {
    id: "raw-radius-length",
    // A literal px/rem radius in CSS, outside the token definitions.
    re: /border-radius\s*:\s*(?!var\()[^;]*\d/g,
    why: "reference var(--radius…) instead of a literal length",
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(full);
  }
  return out;
}

interface Violation { file: string; line: number; rule: string; match: string; why: string; text: string }

function scan(): { violations: Violation[]; exempted: Violation[]; filesScanned: number } {
  const violations: Violation[] = [];
  const exempted: Violation[] = [];
  let filesScanned = 0;
  for (const r of ROOTS) {
    for (const file of walk(join(ROOT, r))) {
      const rel = relative(ROOT, file);
      if (TOKEN_SOURCES.includes(rel)) continue;
      // The lint's own rule table is full of the patterns it bans.
      if (rel.endsWith("design-tokens.conformance.test.ts")) continue;
      filesScanned++;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((text, i) => {
        for (const rule of RULES) {
          for (const m of text.matchAll(rule.re)) {
            const v: Violation = { file: rel, line: i + 1, rule: rule.id, match: m[0], why: rule.why, text: text.trim().slice(0, 120) };
            const covered = lines.slice(Math.max(0, i - EXEMPT_WINDOW), i + 1).some((l) => EXEMPT.test(l));
            (covered ? exempted : violations).push(v);
          }
        }
      });
    }
  }
  return { violations, exempted, filesScanned };
}

const report = (vs: Violation[]) =>
  vs.map((v) => `\n  ${v.file}:${v.line}  [${v.rule}] ${v.match}\n      ${v.why}\n      ${v.text}`).join("");

describe("design tokens — nothing visual escapes the brand", () => {
  const { violations, exempted, filesScanned } = scan();

  it("scans the whole rendering surface (a lint that reads nothing passes vacuously)", () => {
    expect(filesScanned).toBeGreaterThan(100);
  });

  it("no hard-coded radius, elevation or hairline colour anywhere", () => {
    expect(violations, `${violations.length} value(s) cannot follow the brand:${report(violations)}\n`).toEqual([]);
  });

  it("every exemption states a reason", () => {
    // `scan` only files a violation as exempted when the marker carries text, so
    // this asserts the shape of what got through: a small, enumerated set.
    expect(exempted.length, `exemptions:${report(exempted)}`).toBeLessThanOrEqual(8);
  });
});
