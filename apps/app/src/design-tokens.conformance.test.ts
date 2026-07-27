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

/**
 * Files that draw ON TOP OF photographs or live camera video, where `white` and
 * `black` are the correct vocabulary and must NOT follow the brand.
 *
 * This is the one place the rules bend, and the reasoning matters. A cover-image
 * caption, a scrim gradient over a meal photo, a viewfinder frame — these sit over
 * content the theme does not control. Forcing them through the tokens makes them
 * WORSE: a studio on a pale primary would get a near-white caption over a bright
 * photo and lose it entirely. So white-on-media stays white.
 *
 * Scoped to a file list rather than waived globally, because the same class of
 * value on app CHROME is a real bug and was found three times while writing this:
 * a white skeleton shimmer that vanished on a light theme (`AiAnalyzing`), a
 * `bg-black/15` code panel invisible on a dark one (`AiError`), and white overlays
 * on `bg-primary` in the Snap-a-Meal hero that would disappear under a pale brand
 * colour (`FoodSearchSheet` — now `primary-foreground`, the token that exists for
 * exactly that). A new `bg-white/20` in any file NOT on this list fails the lint.
 *
 * Named palettes (zinc, slate, red…) are never allowed anywhere, on this list or
 * off it — there is no legitimate use for one in this app.
 */
const MEDIA_OVERLAY_FILES = [
  // Photo/video viewers and the chrome drawn over them.
  "packages/ui/src/media.tsx",
  "apps/app/src/screens/client/BarcodeScanner.tsx",
  "apps/app/src/screens/client/bodyscan/BodyScanFlow.tsx",
  // Cards and headers whose background is a cover image, with a scrim + caption.
  "apps/app/src/screens/client/Explore.tsx",
  "apps/app/src/screens/client/Today.tsx",
  "apps/app/src/screens/client/Train.tsx",
  "apps/app/src/screens/client/WorkoutPlayer.tsx",
  "apps/app/src/screens/client/MealPlanDrawer.tsx",
  "apps/app/src/screens/coach/WorkoutBuilder.tsx",
  "apps/app/src/screens/coach/MealBuilder.tsx",
  // Full-screen modal scrims (black dimming is correct in both modes).
  "apps/app/src/tour.tsx",
];
/** `white`/`black` only — the palette rule still applies in full. */
const NEUTRAL_OVERLAY = /\b(?:bg|text|from|via|to|ring|divide|outline)-(?:white|black)\b(?:\/\d+)?/;

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
    id: "palette-surface-colour",
    // A named-palette colour cannot track the brand tokens, so a surface painted
    // with one keeps the shipped grey while everything around it re-skins — and
    // the SURFACE TINT in particular reaches nothing it touches. Arbitrary values
    // are matched only when they look like a colour, so `text-[0.95rem]` (a font
    // size) and `bg-[url(…)]` are not false-flagged.
    re: /\b(?:bg|text|from|via|to|ring|divide|decoration|caret|accent|outline|shadow)-(?:white|black|zinc|slate|gray|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)\b(?:-\d{2,3})?(?:\/\d+)?|\b(?:bg|text|from|via|to|ring)-\[(?:#|rgba?\(|oklch\(|hsla?\()/g,
    why: "use a token utility (bg-card, bg-surface-2, text-muted-foreground, bg-primary/10…) so the surface follows the brand and its tint",
  },
  {
    id: "literal-colour-in-style",
    // Inline style bypasses Tailwind, so it bypasses the tokens. `var(--…)` is
    // fine — including with a fallback, which only fires if the token is absent.
    re: /(?:background|backgroundColor|borderColor|color|fill|stroke)\s*:\s*[`"'][^`"']*(?:#[0-9a-fA-F]{3,8}|rgba?\(|oklch\(|hsla?\()/g,
    why: "reference a token — var(--card), var(--primary) — instead of a literal colour",
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

interface Violation { file: string; line: number; rule: string; match: string; why: string; text: string;
  /** How it got through, when it did: a written marker, or the media-overlay list. */
  via?: "marker" | "media" }

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
            // A white/black overlay is allowed only in a file whose job is drawing
            // over media. Everywhere else it is the bug this rule exists to find.
            const marked = lines.slice(Math.max(0, i - EXEMPT_WINDOW), i + 1).some((l) => EXEMPT.test(l));
            const overMedia = MEDIA_OVERLAY_FILES.includes(rel) && NEUTRAL_OVERLAY.test(m[0]);
            if (marked) exempted.push({ ...v, via: "marker" });
            else if (overMedia) exempted.push({ ...v, via: "media" });
            else violations.push(v);
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

  it("nothing is exempt by accident", () => {
    // Two ways through: an inline marker with a written reason, or a white/black
    // overlay in a file on the enumerated media list. Both are bounded — this
    // asserts nothing ELSE slipped in, and that the media list has not quietly
    // become the place hard-coded colours go to hide.
    // Only two routes exist, and `scan` labels which one each took — so anything
    // unlabelled would mean a third route had appeared.
    for (const v of exempted) expect(v.via, `${v.file}:${v.line} got through unlabelled`).toMatch(/^(marker|media)$/);
    // The media allowance may only be spent on white/black. A named palette in a
    // media file is still a bug.
    for (const v of exempted.filter((x) => x.via === "media")) {
      expect(NEUTRAL_OVERLAY.test(v.match), `${v.file}:${v.line} used the media allowance for ${v.match}, which is not white/black`).toBe(true);
    }
    // Every file on the media list must still be USING it. A stale entry is a
    // hole nobody is watching.
    const mediaFiles = new Set(exempted.filter((v) => v.via === "media").map((v) => v.file));
    for (const f of MEDIA_OVERLAY_FILES) {
      expect(mediaFiles.has(f), `${f} is on the media-overlay list but no longer needs it — remove it`).toBe(true);
    }
  });
});
