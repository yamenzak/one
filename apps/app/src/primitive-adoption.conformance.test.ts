/**
 * A primitive nobody adopts enforces nothing.
 *
 * This lint exists because of a specific, embarrassing finding: `Anchor` had
 * been in `packages/ui/src/layout.tsx` since early in the rewrite, exported,
 * documented, and described in the file header as the reason a screen "cannot
 * accidentally have two anchors" — and **exactly one file used it**. Sixteen
 * screens hand-rolled `<TierAnchor className="flex flex-col items-center gap-1
 * pb-1 pt-2 text-center">` around three `<p>`s instead.
 *
 * Nothing caught it. Every existing conformance layer checks that a screen uses
 * the right TOKENS — the type scale, the radius ladder, the motion constants —
 * and all sixteen copies passed all of them, because a hand-rolled anchor is
 * built entirely out of legal parts. The gap is one level up: the right tokens
 * assembled by hand instead of the component that already assembles them.
 *
 * So this checks ADOPTION, not spelling. Where a component owns a composition,
 * the composition's private spelling may not appear outside it.
 *
 * ── What it looks for ──
 *  • `numeral text-display` outside `packages/ui` — the anchor's value slot.
 *    Use `<Anchor>`; it renders exactly this, and it takes `word` for the case
 *    where the value is words rather than a number (§5).
 *  • The anchor's own layout class string on a `TierAnchor`.
 *  • A native `<select>`. `Select` (Radix) has existed and been adopted in a
 *    dozen screens, but the AI model pickers were still native — and one of
 *    them was actively lying. A native `<select>` given a `value` that none of
 *    its `<option>`s carry renders the FIRST option instead, silently: when an
 *    operator withdrew a model, every studio that had picked it saw "Default
 *    (auto)" while the database still held the withdrawn id. `Select` renders
 *    its placeholder in that case, which forces the caller to decide what to
 *    say. Native `<select>` also ignores nearly every style on iOS.
 *
 * ── What it deliberately allows ──
 * `TierAnchor` itself, used for a T1 that is NOT a value: the sign-in screen's
 * logo + studio name, and the onboarding wizard's address preview. Those are
 * anchors in the motion/hierarchy sense with nothing to count, and forcing them
 * through a value component would be the mirror of the mistake this file is
 * about.
 *
 * ── Escaping it ──
 * `primitive-exempt: <why>` in a comment on the line, or up to 3 lines above.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");
const ROOTS = ["apps/app/src"];
const EXEMPT_FILES = [
  // This file carries the banned spellings as test DATA.
  "apps/app/src/primitive-adoption.conformance.test.ts",
];
const EXEMPT_WINDOW = 3;

const BANNED: { re: RegExp; why: string }[] = [
  {
    re: /className="[^"]*\bnumeral\b[^"]*\btext-display\b[^"]*"/,
    why: "the anchor's value slot — use `<Anchor>` (and `word` when the value is words)",
  },
  {
    re: /<TierAnchor[^>]*className="flex flex-col items-center gap-1 /,
    why: "a hand-rolled anchor — use `<Anchor eyebrow sub>`",
  },
  {
    re: /<select[\s>]/,
    why: "a native <select> — use `<Select>`, which cannot silently render a value that is not in its options",
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

interface Hit { file: string; line: number; text: string; why: string }

function scan(): Hit[] {
  const hits: Hit[] = [];
  for (const r of ROOTS) {
    for (const file of walk(join(ROOT, r))) {
      const rel = relative(ROOT, file);
      if (EXEMPT_FILES.includes(rel)) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((text, i) => {
        // A banned spelling QUOTED IN PROSE is documentation, not code — and
        // these rules are explained in comments that necessarily name the thing
        // they ban. Without this the lint flags its own rationale.
        if (/^\s*(\*|\/\/)/.test(text)) return;
        for (const { re, why } of BANNED) {
          if (!re.test(text)) continue;
          const window = lines.slice(Math.max(0, i - EXEMPT_WINDOW), i + 1).join("\n");
          if (/primitive-exempt:\s*\S/.test(window)) continue;
          hits.push({ file: rel, line: i + 1, text: text.trim().slice(0, 110), why });
        }
      });
    }
  }
  return hits;
}

describe("screens use the primitives that exist (UI-LANGUAGE §1, §13)", () => {
  it("no screen hand-rolls an anchor", () => {
    const hits = scan();
    const report = hits.map((h) => `  ${h.file}:${h.line} → ${h.why}\n    ${h.text}`).join("\n");
    expect(hits, hits.length ? `\n${hits.length} hand-rolled composition(s):\n${report}\n` : "").toHaveLength(0);
  });

  it("the lint can actually see a violation", () => {
    // A lint that silently stops matching passes everything.
    const samples = [
      '<p className="numeral text-display"><CountUp value={n} /></p>',
      '<TierAnchor className="flex flex-col items-center gap-1 pb-1 pt-2 text-center">',
      '<select value={v.flag} onChange={onChange}>',
      "<select>",
    ];
    for (const s of samples) expect(BANNED.some((b) => b.re.test(s)), s).toBe(true);

    // …and leaves alone the legitimate uses: the component itself, and a
    // TierAnchor wrapping a T1 that has no value to render.
    const ok = [
      "<Anchor eyebrow=\"Clients\" sub={sub}><CountUp value={n} /></Anchor>",
      '<TierAnchor className="flex flex-col items-center gap-3 pb-8 text-center">',
      '<p className="numeral text-title-1">{n}</p>',
      // Not a native select: the component, and a word that merely starts the
      // same way.
      '<Select value={v} onChange={set} options={opts} />',
      "const selected = rows.filter(Boolean);",
    ];
    for (const s of ok) expect(BANNED.some((b) => b.re.test(s)), s).toBe(false);
  });
});
