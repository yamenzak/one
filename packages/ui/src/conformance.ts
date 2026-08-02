/**
 * THE DESIGN SYSTEM'S OWN LINTS — the part that makes it a system.
 *
 * A design system is a set of components plus a set of rules about not going
 * around them. Kova had both: seven lints over its whole rendering surface,
 * enforcing UI-LANGUAGE.md. Tessa had the components and none of the rules.
 *
 * That asymmetry is invisible while an app is young. Tessa's drift on the day
 * this was written was four instances — 2 raw hex values, 2 arbitrary text
 * sizes — which reads as "fine" and is really "six days old". Kova's numbers
 * were small once too; the lints exist because they stopped being small. Before
 * the type-scale rule the app carried three spellings of "section heading" and
 * 73 hand-rolled overlines, several with drifted weight or tracking.
 *
 * So the rules move here, next to the components they defend, and an app opts
 * in with four lines instead of nine hundred.
 *
 * ── Every rule carries the samples that prove it still works ────────────────
 *
 * A lint that silently stops matching passes everything, and a vacuous pass is
 * indistinguishable from a clean codebase. Each rule ships `samples.bad` (must
 * fire) and `samples.good` (must not), and `ruleSelfTest()` checks all of them —
 * so a careless edit to a regex fails loudly rather than going quiet. That
 * property was in every one of Kova's lints and it is the reason to keep them as
 * data rather than as seven hand-written test files.
 *
 * ── Escaping a rule ────────────────────────────────────────────────────────
 *
 * `<rule-id>-exempt: <why>` in a comment on the offending line, or up to
 * `window` lines above it. The reason is MANDATORY — the marker alone does not
 * count — because a waiver nobody has to justify is a waiver everybody takes.
 *
 * Node-only (`node:fs`), exported from `@4dl/ui/conformance` rather than the
 * root, so the browser bundle never sees it.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface UiRule {
  /** Also the exemption marker: `<id>-exempt: <why>`. */
  id: string;
  /** Where the rule comes from, for the failure message. */
  section: string;
  /** Which files it reads. A rule that scans nothing passes vacuously. */
  ext: RegExp;
  /** How far above a line its exemption marker may sit. */
  window: number;
  /** Fires on one line: the fix, or null. */
  check: (line: string) => string | null;
  /**
   * On a file the app has waived for this rule, matches of THIS pattern are
   * ignored and every other match still fires.
   *
   * One rule needs it and the reasoning is worth keeping: a caption or scrim
   * drawn over a photograph or live camera feed is the one place `white` and
   * `black` are correct and must NOT follow the brand — a tenant on a pale
   * primary would get a near-white caption over a bright photo and lose it. But
   * the same value on app CHROME is a real bug (it was found three times in
   * Kova), and a named palette is never right anywhere. So the waiver is narrow
   * by construction: it relaxes white/black on named files, nothing else.
   */
  waivedPattern?: RegExp;
  /**
   * Files INSIDE the design system that define what this rule enforces, so the
   * rule must not fire on them. `tokens.css` declares the tokens; `theme.ts`
   * writes them; `animation.ts` is where `type: "spring"` is supposed to live.
   *
   * Paths are relative to `@4dl/ui/src`, and the module resolves that itself —
   * no app has to know where the design system is on disk.
   */
  definedIn?: string[];
  /**
   * The rule is about CONSUMERS not hand-rolling something, so it cannot apply
   * to the design system, which is where the hand-rolling belongs. `<Select>`
   * contains the only legitimate `<select>` in the repo.
   */
  consumersOnly?: boolean;
  samples: { bad: string[]; good: string[] };
}

/**
 * Where the design system's own source lives.
 *
 * Derived rather than configured: the rules need to know which files are the
 * system so they can exempt its definitions and skip it for consumer-only
 * rules, and making every app pass that path is three chances to pass a wrong
 * one.
 */
const SYSTEM_SRC = new URL(".", import.meta.url).pathname.replace(/\/$/, "");

const PALETTE = "white|black|zinc|slate|gray|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

/** `white`/`black` only — the named-palette half of the rule still applies. */
const NEUTRAL_OVERLAY = /\b(?:bg|text|from|via|to|ring|divide|outline)-(?:white|black)\b(?:\/\d+)?/;

/** Helper for the common shape: a list of banned spellings, each naming its fix. */
const banned = (list: { re: RegExp; use: string }[]) => (line: string): string | null => {
  for (const { re, use } of list) if (re.test(line)) return use;
  return null;
};

export const UI_RULES: UiRule[] = [
  // ── §4 tokens: a value that cannot follow the brand ──────────────────────
  {
    id: "design-tokens",
    section: "UI-LANGUAGE §4",
    ext: /\.(tsx?|css)$/,
    // Small on purpose: enough to cover one JSX element's attributes, not
    // enough to blanket a file.
    window: 4,
    waivedPattern: NEUTRAL_OVERLAY,
    definedIn: ["tokens.css", "lib/theme.ts"],
    check: banned([
      { re: /\brounded-\[[^\]]+\]/, use: "a rounded-* step (they resolve to --radius, which branding sets) or rounded-full" },
      { re: /\bshadow-\[[^\]]+\]/, use: "shadow-sm/md/lg (they resolve to --shadow-*, set by the branding elevation preset) or shadow-glow" },
      { re: new RegExp(`\\bborder-(?:${PALETTE})\\b(?:-\\d{2,3})?(?:\\/\\d+)?|\\bborder-\\[[^\\]]+\\]`), use: "border-border (or a semantic token like border-primary/40) so the hairline follows branding" },
      { re: /(?:borderRadius|boxShadow)\s*:/, use: "a utility class, so radius/elevation resolve through the tokens" },
      // Arbitrary values match only when they LOOK like a colour, so
      // `text-[0.95rem]` (a size) and `bg-[url(…)]` are not false-flagged.
      { re: new RegExp(`\\b(?:bg|text|from|via|to|ring|divide|decoration|caret|accent|outline|shadow)-(?:${PALETTE})\\b(?:-\\d{2,3})?(?:\\/\\d+)?|\\b(?:bg|text|from|via|to|ring)-\\[(?:#|rgba?\\(|oklch\\(|hsla?\\()`), use: "a token utility (bg-card, bg-surface-2, text-muted-foreground, bg-primary/10…) so the surface follows the brand and its tint" },
      { re: /(?:background|backgroundColor|borderColor|color|fill|stroke)\s*:\s*[`"'][^`"']*(?:#[0-9a-fA-F]{3,8}|rgba?\(|oklch\(|hsla?\()/, use: "a token — var(--card), var(--primary) — instead of a literal colour" },
      { re: /border-radius\s*:\s*(?!var\()[^;]*\d/, use: "var(--radius…) instead of a literal length" },
    ]),
    samples: {
      bad: [
        'className="rounded-[14px]"',
        'className="shadow-[0_2px_8px_rgba(0,0,0,.2)]"',
        'className="border-slate-200"',
        'style={{ borderRadius: 12 }}',
        'className="bg-zinc-900 text-white"',
        'style={{ color: "#ff0000" }}',
        "  border-radius: 12px;",
      ],
      good: [
        'className="rounded-2xl"',
        'className="shadow-md"',
        'className="border-border"',
        'className="bg-surface-2 text-muted-foreground"',
        'style={{ color: "var(--primary)" }}',
        "  border-radius: var(--radius);",
        // A size, not a colour.
        'className="text-[0.95rem]"',
      ],
    },
  },

  // ── §5 type: a heading is ONE class, not four ────────────────────────────
  {
    id: "type-scale",
    section: "UI-LANGUAGE §5",
    ext: /\.(tsx?|css)$/,
    window: 3,
    check: banned([
      { re: /text-2xl\s+font-bold\s+tracking-tight/, use: "text-title-2" },
      { re: /text-xl\s+font-semibold\s+tracking-tight/, use: "text-title-3" },
      { re: /text-lg\s+font-semibold\s+tracking-tight/, use: "text-body-lg" },
      { re: /text-xl\s+font-bold\s+tracking-tight/, use: "text-title-3" },
      { re: /text-xs\s+font-(?:semibold|medium)\s+uppercase\s+tracking-wide/, use: "text-micro uppercase" },
    ]),
    samples: {
      bad: [
        'className="text-2xl font-bold tracking-tight"',
        'className="text-xl font-semibold tracking-tight"',
        'className="text-lg font-semibold tracking-tight"',
        'className="text-xl font-bold tracking-tight"',
        'className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"',
        'className="text-xs font-medium uppercase tracking-wide"',
      ],
      good: ['className="text-title-2"', 'className="text-micro uppercase"', 'className="text-body-lg"'],
    },
  },

  // ── §12 focus: an outline removed and not replaced ───────────────────────
  {
    id: "focus",
    section: "UI-LANGUAGE §12",
    ext: /\.tsx$/,
    window: 3,
    check: (line) =>
      /<(input|select|textarea)\b/.test(line) && /\boutline-none\b/.test(line) && !/\bfocus(-visible|-within)?:/.test(line)
        ? "add a focus-visible ring — a control with no visible focus is unusable by keyboard"
        : null,
    samples: {
      bad: ['<input className="outline-none" />', '<textarea className="w-full outline-none" />'],
      good: [
        '<input className="outline-none focus-visible:ring-2" />',
        '<div className="outline-none" />',
        '<input className="rounded-xl" />',
      ],
    },
  },

  // ── §11 motion: a hand-written spring or duration ────────────────────────
  {
    id: "motion",
    section: "UI-LANGUAGE §11",
    ext: /\.tsx?$/,
    window: 3,
    // An ambient loop — a pulse, a shimmer — is a different class from a
    // transition: it has no start and no end to match, so the scale's durations
    // do not describe it. `repeat:` is the marker, and dropping this clause
    // during the extraction turned ten correct animations into failures.
    check: (line) => (/\brepeat:/.test(line) ? null : banned([
      { re: /type:\s*"spring"/, use: "SPRING · SPRING_SNAP · SPRING_SOFT · SPRING_DRAG" },
      { re: /\bduration:\s*\d+(\.\d+)?/, use: "DUR.instant · fast · base · slow · draw" },
    ])(line)),
    definedIn: ["lib/animation.ts"],
    samples: {
      bad: ['transition={{ type: "spring", stiffness: 300 }}', "transition={{ duration: 0.25 }}"],
      good: ["transition={SPRING}", "transition={{ duration: DUR.fast }}"],
    },
  },

  // ── §7 primitives: hand-rolling something the system already draws ───────
  {
    id: "primitive",
    section: "UI-LANGUAGE §7",
    ext: /\.tsx$/,
    window: 3,
    consumersOnly: true,
    // A comment explaining why `<select>` is banned is not a `<select>`. This
    // rule's patterns are short enough to match prose, which the others' are not.
    check: (line) => (/^\s*(\*|\/\/)/.test(line) ? null : banned([
      { re: /className="[^"]*\bnumeral\b[^"]*\btext-display\b[^"]*"/, use: "`<Anchor>` (and `word` when the value is words)" },
      { re: /<TierAnchor[^>]*className="flex flex-col items-center gap-1 /, use: "`<Anchor eyebrow sub>` instead of a hand-rolled one" },
      { re: /<select[\s>]/, use: "`<Select>`, which cannot silently render a value that is not in its options" },
    ])(line)),
    samples: {
      bad: ['<div className="numeral text-display">', "<select onChange={x}>"],
      good: ["<Anchor value={n} />", "<Select options={opts} />"],
    },
  },

  // ── §9 empty states: a dash where a number belongs ───────────────────────
  {
    id: "no-data",
    section: "UI-LANGUAGE §9",
    ext: /\.tsx$/,
    window: 3,
    check: banned([
      { re: /\bvalue=\{[^}]*["'`][—–-]["'`]/, use: "`null` — the component renders `NoData` itself" },
      { re: /\bvalue=["'][—–-]["']/, use: "`null` — the component renders `NoData` itself" },
      { re: /\bnumeral\b[^\n]*["'`][—–-]["'`]/, use: "`NoData` — a dash at numeral size reads as a rule, not as an absence" },
    ]),
    samples: {
      bad: ['value={x ?? "—"}', 'value="—"', '<div className="numeral">{x ?? "—"}</div>'],
      good: ["value={x ?? null}", '<NoData>Nothing logged yet</NoData>'],
    },
  },

  // ── A write that can fail silently ───────────────────────────────────────
  {
    id: "save-lifecycle",
    section: "CLAUDE.md · conventions",
    ext: /\.tsx$/,
    window: 3,
    check: banned([
      {
        re: /api\.(patch|post|put|del)\b[^;]*\.catch\(\s*\(\s*\)\s*=>\s*(undefined|\{\s*\}|void 0)\s*\)/,
        use: "`useConfirmedState` — a swallowed write leaves the control showing a value the server refused",
      },
      {
        // `try {` … `} finally {` with no `} catch` between them, on one line.
        re: /\btry\s*\{(?:(?!\}\s*catch).)*api\.(patch|post|put|del)\b(?:(?!\}\s*catch).)*\}\s*finally\b/,
        use: "`useAction`, whose `run` cannot leave a rejection unhandled — a save with no catch rejects into the generic runtime toast",
      },
    ]),
    samples: {
      bad: [
        "void api.patch('/x', b).catch(() => undefined)",
        "try { await api.post('/x', b) } finally { setBusy(false) }",
      ],
      good: [
        "try { await api.post('/x', b) } catch (e) { setErr(errorText(e)) } finally { setBusy(false) }",
        "await run('save', async () => { await api.patch('/x', b); return 'Saved.' })",
      ],
    },
  },
];

export interface UiViolation {
  rule: string;
  section: string;
  file: string;
  line: number;
  text: string;
  use: string;
}

export interface UiConformanceOptions {
  /** Absolute directories to scan. A rule that reads nothing passes vacuously. */
  roots: string[];
  /** Reported paths are relative to this. */
  repoRoot: string;
  /** Files no rule applies to — the token definitions, this file's own callers. */
  exemptFiles?: string[];
  /**
   * Per-rule, per-file waivers: `{ "design-tokens": ["apps/x/src/Camera.tsx"] }`.
   * Only relaxes that rule's `waivedPattern`; everything else still fires.
   */
  waive?: Record<string, string[]>;
  /** Skip rules by id — for an app that has not adopted one yet. Say why in the test. */
  skip?: string[];
  /**
   * Narrow a rule to named files: `{ "save-lifecycle": ["…/Settings.tsx"] }`.
   *
   * Kova's save-lifecycle lint has always run over its four settings screens
   * rather than the whole app, and widening it here would have surfaced nine
   * pre-existing instances in an extraction commit — mixing "moved the rule"
   * with "changed what it catches". Widening is worth doing; it is worth doing
   * on its own.
   */
  scopeTo?: Record<string, string[]>;
}

function walk(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, ext, out);
    else if (ext.test(name)) out.push(full);
  }
  return out;
}

export function uiConformance(opts: UiConformanceOptions): UiViolation[] {
  const exempt = new Set(opts.exemptFiles ?? []);
  const skip = new Set(opts.skip ?? []);
  const out: UiViolation[] = [];

  for (const rule of UI_RULES) {
    if (skip.has(rule.id)) continue;
    const waived = new Set(opts.waive?.[rule.id] ?? []);
    const defines = new Set((rule.definedIn ?? []).map((f) => join(SYSTEM_SRC, f)));
    const scope = opts.scopeTo?.[rule.id] ? new Set(opts.scopeTo[rule.id]) : null;
    const marker = new RegExp(`${rule.id}-exempt[^:]*:\\s*\\S`);

    for (const root of opts.roots) {
      for (const file of walk(root, rule.ext)) {
        // The design system defines what the rules enforce, so its definitions
        // are exempt and consumer-only rules skip it entirely.
        if (defines.has(file)) continue;
        if (rule.consumersOnly && file.startsWith(SYSTEM_SRC)) continue;
        const rel = relative(opts.repoRoot, file);
        if (exempt.has(rel)) continue;
        if (scope && !scope.has(rel)) continue;
        const isWaived = waived.has(rel);
        const lines = readFileSync(file, "utf8").split("\n");

        lines.forEach((text, i) => {
          // On a waived file the relaxed spelling is removed BEFORE the check,
          // so any other violation on the same line still reports.
          const subject = isWaived && rule.waivedPattern ? text.replace(new RegExp(rule.waivedPattern, "g"), "") : text;
          const use = rule.check(subject);
          if (!use) return;
          const window = lines.slice(Math.max(0, i - rule.window), i + 1).join("\n");
          if (marker.test(window)) return;
          out.push({ rule: rule.id, section: rule.section, file: rel, line: i + 1, text: text.trim().slice(0, 120), use });
        });
      }
    }
  }
  return out;
}

/** Human-readable, grouped by rule — a failure should be a fix, not a puzzle. */
export function formatUiViolations(v: UiViolation[]): string {
  const byRule = new Map<string, UiViolation[]>();
  for (const x of v) (byRule.get(x.rule) ?? byRule.set(x.rule, []).get(x.rule)!).push(x);
  return [...byRule].map(([rule, hits]) => {
    const section = hits[0]!.section;
    const body = hits.map((h) => `    ${h.file}:${h.line}\n      ${h.text}\n      → use ${h.use}`).join("\n");
    return `  ${rule} (${section}) — ${hits.length}\n${body}`;
  }).join("\n\n");
}

/**
 * Every rule still sees its own samples.
 *
 * Returns a list of complaints; empty means every rule fires on all of its `bad`
 * samples and on none of its `good` ones. This is the check that stops a lint
 * from going quiet, and it is why the rules are data.
 */
export function ruleSelfTest(): string[] {
  const problems: string[] = [];
  for (const rule of UI_RULES) {
    for (const s of rule.samples.bad) {
      if (!rule.check(s)) problems.push(`${rule.id}: no longer fires on a violation it must catch — ${s}`);
    }
    for (const s of rule.samples.good) {
      const use = rule.check(s);
      if (use) problems.push(`${rule.id}: fires on correct code — ${s} (said: use ${use})`);
    }
  }
  return problems;
}
