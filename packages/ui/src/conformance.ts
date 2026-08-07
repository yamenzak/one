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
      /*
        ⚠️ NOT when the value is ALREADY a token. `boxShadow: "var(--shadow-lg)"`
        is precisely what this rule is asking for, and firing on it told the
        author to use a token they were using — which is the fastest way to
        teach somebody that a lint is noise.
      */
      /*
        The optional-quote form (`\s*(?!["\'`]?var\()`) does NOT work here, and
        the reason is worth writing down: `\s*` and `["\'`]?` both backtrack, so
        the engine simply retries with the quote unmatched and the lookahead
        then passes on the quote character itself. An ALTERNATION consumes the
        quote or asserts there is none, and cannot give it back.
      */
      { re: /(?:borderRadius|boxShadow)\s*:\s*(?:["'`](?!var\()|(?!["'`\s])(?!var\())/, use: "a utility class, so radius/elevation resolve through the tokens" },
      // Arbitrary values match only when they LOOK like a colour, so a size
      // and `bg-[url(…)]` are not false-flagged HERE — an off-scale size is the
      // `type-scale` rule's business, and each rule should name one fault.
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
        // Already a token — the rule must not ask for what is there.
        'style={{ boxShadow: "var(--shadow-lg)" }}',
        'className="bg-surface-2 text-muted-foreground"',
        'style={{ color: "var(--primary)" }}',
        "  border-radius: var(--radius);",
        // A size, not a colour — `type-scale` is what objects to this one.
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
    /**
     * THE FAR-VIEWING RELAXATION — Tailwind's size ladder and the heavy weights,
     * and nothing else.
     *
     * The scale runs 11–56px because it describes text somebody is holding or
     * sitting at. A lobby kiosk, a counter station and a scoreboard are read
     * across a room: `display` is the largest role the language has and it is
     * not large enough for a called ticket number.
     *
     * Narrow by construction, exactly like `design-tokens`' overlay waiver. On a
     * waived file a COMPOSITE spelling (`text-2xl font-bold tracking-tight`) and
     * an ARBITRARY size (`text-[10px]`) still fire, because neither is made
     * defensible by viewing distance — 10px on a kiosk is wrong at any range.
     */
    waivedPattern: /(?<![-\w])text-(?:xs|sm|base|lg|xl|[2-9]xl)\b(?!-)|\bfont-(?:extrabold|black)\b/,
    /*
      A COMMENT ABOUT `text-xs` IS NOT A `text-xs`, and this rule is the one that
      has to say so. Its patterns are now bare class names — `text-sm`, `text-lg`
      — short enough to appear in ordinary prose, which is exactly the reason the
      `primitive` rule below already skips comment lines. `rings.tsx` explains in
      a comment that an inline `fontSize` "silently beat the `text-xs`", and
      telling its author to replace a size they had already removed is the
      fastest way to teach somebody that a lint is noise.

      Only whole-line comments — a trailing `// …` on a real class string still
      counts, so nothing hides by appending one.

      ⚠️ It sees the LINE, not the block: a continuation line inside a multi-line
      JSX comment starts with prose and is indistinguishable from code here,
      because `check` is per-line by design across all seven rules. Prose that
      has to name a banned class on a middle line takes an inline
      `type-scale-exempt:` — which is the mechanism working, not a gap in it.
    */
    check: (line) => (/^\s*(\*|\/\/|\/\*)/.test(line) ? null : banned([
      { re: /text-2xl\s+font-bold\s+tracking-tight/, use: "text-title-2" },
      { re: /text-xl\s+font-semibold\s+tracking-tight/, use: "text-title-3" },
      { re: /text-lg\s+font-semibold\s+tracking-tight/, use: "text-body-lg" },
      { re: /text-xl\s+font-bold\s+tracking-tight/, use: "text-title-3" },
      { re: /text-xs\s+font-(?:semibold|medium)\s+uppercase\s+tracking-wide/, use: "text-micro uppercase" },
      /*
        An ARBITRARY SIZE is the other way out of the scale, and the quieter
        one. `text-[11px]` is `micro` spelled so the lint above cannot see it;
        `text-[10px]` is below every tier the language has, which §12 forbids
        outright. Scena arrived with 109 of these — 99 of them under the floor —
        and nothing failed, because it was the one app not running these rules.

        `em` IS ALLOWED, and the distinction is principled rather than a
        carve-out: `text-[0.72em]` on a unit suffix inside a value, or on a
        superscript, is PROPORTIONAL to whatever role its parent has — it rides
        the scale rather than leaving it, and there is no absolute tier that
        could express "a bit smaller than whatever this is". An absolute
        px/rem/pt is a size chosen instead of a role, which is the thing the
        scale exists to prevent.

        `pt` is out for the same reason: it is a PRINT unit. Tessa sets label
        text at `text-[9pt]` because a sterilisation label is a physical object
        and 9 points is a physical size — there is no screen role that means
        that, and forcing one would change what comes out of the printer.

        A non-size arbitrary like `text-[color:var(--x)]` is not matched either
        — the leading digit is what separates them.
      */
      {
        re: /\btext-\[[\d.]+(?:px|rem)\]/,
        use: "a role from the scale — display / title-1..3 / body-lg / body / caption / micro. 11px is `micro`, 13px is `caption`, and there is nothing below caption for running text (§12)",
      },
      /*
        TAILWIND'S OWN SIZE SCALE — the third way out, and by far the widest.

        The two rules above catch a role spelled as a COMPOSITE and a size
        spelled as an ARBITRARY. Neither sees `text-sm`, and `text-sm` is what
        everybody actually writes: there were 1,526 of these in this repo when
        the rule was added, 906 of them in the app the others are modelled on,
        and 87 inside `@4dl/ui` itself — so the design system shipped two
        dialects and every app inherited both.

        They are not near-misses that happen to look fine. A role carries its
        line-height, tracking AND weight (`--text-title-2--font-weight: 600`),
        which is the whole reason `text-title-2` is "the complete instruction".
        `text-sm font-semibold` is 14/1.25/inherited with the weight restated by
        hand — a different SIZE, a different RHYTHM, and a hardcoded weight that
        no longer moves when the scale does.

        The map below is nearest-role, and the two exact matches (`xl`→title-3
        at 20, `2xl`→title-2 at 24) are why it lands as cleanly as it does.

        ⚠️ `text-base` is the one with a real defence, and it is NOT a style
        argument: 16px is the threshold below which iOS Safari zooms the viewport
        on focus and does not zoom back out. `Input` and `Textarea` in this
        package keep it under a stated exemption. Anything else claiming it
        should have to write the reason down too.
      */
      {
        re: /(?<![-\w])text-(?:xs|sm|base|lg|xl|[2-9]xl)\b(?!-)/,
        use:
          "a role from the scale, not Tailwind's parallel one — xs→caption, sm→body, base/lg→body-lg, xl→title-3, 2xl→title-2, 3xl→title-1, 4xl+→display. " +
          "A role carries line-height, tracking and weight, so `text-body-lg` replaces `text-sm font-medium` whole",
      },
      // §5: "Never a weight above 700." `display` and `title-1` ARE 700, so
      // anything heavier is not emphasis, it is a fourth weight nobody chose.
      { re: /\bfont-(?:extrabold|black)\b/, use: "font-bold — §5 caps the scale at 700, and the top two roles already are 700" },
    ])(line)),
    samples: {
      bad: [
        'className="text-2xl font-bold tracking-tight"',
        'className="text-xl font-semibold tracking-tight"',
        'className="text-lg font-semibold tracking-tight"',
        'className="text-xl font-bold tracking-tight"',
        'className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"',
        'className="text-xs font-medium uppercase tracking-wide"',
        'className="text-[11px] text-muted-foreground"',
        'className="text-[10px] uppercase"',
        'className="text-[0.95rem]"',
        'className="text-sm text-muted-foreground"',
        'className="truncate text-xs"',
        'className="text-base"',
        'className="text-5xl tabular-nums"',
        'className="text-2xl font-extrabold"',
        'className="font-black"',
      ],
      good: [
        'className="text-title-2"',
        'className="text-micro uppercase"',
        'className="text-body-lg"',
        'className="text-caption"',
        'className="text-display font-bold"',
        // Not a text SIZE: the same three letters appear in width, container and
        // shadow utilities, and firing on those would make the rule noise.
        'className="max-w-sm"',
        'className="w-full max-w-lg shadow-xs"',
        'className="text-[0.55em]"',
      ],
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

  // ── §8 motion: a hand-written spring or duration ─────────────────────────
  {
    id: "motion",
    section: "UI-LANGUAGE §8",
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

  /*
    A WAIVER THAT CANNOT RELAX ANYTHING IS A CONFIGURATION BUG, AND IT USED TO
    BE SILENT.

    `waive` only removes a rule's `waivedPattern` before checking, so naming a
    rule that has no `waivedPattern` does exactly nothing — the app reads as
    having relaxed something, the rule keeps firing, and the reason the author
    wrote down is never tested against anything. Scena did this: it waived
    `type-scale` on its three far-viewing surfaces, and the waiver was a no-op.

    Throwing is right rather than harsh. This is the same failure class as every
    other guard in this repo — a check that quietly does not run — and the fix
    is one of two lines: give the rule a `waivedPattern`, or use `exemptFiles`.
  */
  for (const id of Object.keys(opts.waive ?? {})) {
    const rule = UI_RULES.find((r) => r.id === id);
    if (!rule) throw new Error(`waive names an unknown rule: "${id}"`);
    if (!rule.waivedPattern) {
      throw new Error(
        `waive["${id}"] cannot relax anything: rule "${id}" has no waivedPattern, so the waiver is a no-op. ` +
          `Give the rule a waivedPattern, or move those files to exemptFiles if no rule has anything true to say about them.`,
      );
    }
  }

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
