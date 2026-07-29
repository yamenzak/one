/**
 * A heading is ONE class, not four.
 *
 * `UI-LANGUAGE` §5 defines eight type roles, and each carries its own size,
 * line-height, tracking AND weight — so `text-title-2` is the complete
 * instruction. The point is not tidiness: when the scale is spelled out as
 * separate utilities, every occurrence is free to drift a step, and it did.
 * Before this lint the app carried three different "section heading" spellings
 * and 73 hand-rolled overlines, several of which had picked up a different
 * weight or tracking from their neighbours.
 *
 * So this reads the source and fails on any hand-rolled spelling of a role that
 * already exists. It is a lint in the same spirit as `design-tokens.conformance`
 * next door: the scale is worth nothing if a screen can quietly opt out of it.
 *
 * ── Escaping it ──
 * Put `type-scale-exempt: <why>` in a comment on the line, or up to 3 lines
 * above it. The reason is mandatory. Genuine cases exist — a marketing hero or a
 * number sized to fit its container is not a role — but they should be argued in
 * the diff rather than assumed.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");
const ROOTS = ["apps/app/src", "packages/ui/src"];
const EXEMPT_FILES = [
  // tokens.css DEFINES the scale; it is the one file that must spell it out.
  "packages/ui/src/tokens.css",
  // This file carries the banned spellings as test DATA, so it matches itself.
  "apps/app/src/type-scale.conformance.test.ts",
];
const EXEMPT_WINDOW = 3;

/**
 * Each pattern is a spelling of a role that already exists. The message names
 * the role to use, so a failure is a fix rather than a puzzle.
 */
const BANNED: { re: RegExp; use: string }[] = [
  { re: /text-2xl\s+font-bold\s+tracking-tight/, use: "text-title-2" },
  { re: /text-xl\s+font-semibold\s+tracking-tight/, use: "text-title-3" },
  { re: /text-lg\s+font-semibold\s+tracking-tight/, use: "text-body-lg" },
  { re: /text-xs\s+font-(?:semibold|medium)\s+uppercase\s+tracking-wide/, use: "text-micro uppercase" },
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

interface Hit { file: string; line: number; text: string; use: string }

function scan(): Hit[] {
  const hits: Hit[] = [];
  for (const r of ROOTS) {
    for (const file of walk(join(ROOT, r))) {
      const rel = relative(ROOT, file);
      if (EXEMPT_FILES.includes(rel)) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((text, i) => {
        for (const { re, use } of BANNED) {
          if (!re.test(text)) continue;
          const window = lines.slice(Math.max(0, i - EXEMPT_WINDOW), i + 1).join("\n");
          if (/type-scale-exempt:\s*\S/.test(window)) continue;
          hits.push({ file: rel, line: i + 1, text: text.trim().slice(0, 100), use });
        }
      });
    }
  }
  return hits;
}

describe("type scale (UI-LANGUAGE §5)", () => {
  it("no screen spells out a role the scale already names", () => {
    const hits = scan();
    const report = hits.map((h) => `  ${h.file}:${h.line} → use \`${h.use}\`\n    ${h.text}`).join("\n");
    expect(hits, hits.length ? `\n${hits.length} hand-rolled type role(s):\n${report}\n` : "").toHaveLength(0);
  });

  it("the lint can actually see a violation", () => {
    // A lint that silently stops matching passes everything. Pin the patterns
    // against strings they must catch, so a bad edit to `BANNED` fails here
    // rather than going quiet.
    const samples = [
      'className="text-2xl font-bold tracking-tight"',
      'className="text-xl font-semibold tracking-tight"',
      'className="text-lg font-semibold tracking-tight"',
      'className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"',
      'className="text-xs font-medium uppercase tracking-wide"',
    ];
    for (const s of samples) {
      expect(BANNED.some((b) => b.re.test(s)), s).toBe(true);
    }
    // …and does NOT fire on the correct spellings.
    for (const ok of ['className="text-title-2"', 'className="text-micro uppercase"', 'className="text-body-lg"']) {
      expect(BANNED.some((b) => b.re.test(ok)), ok).toBe(false);
    }
  });
});
