/**
 * A dash is not a value.
 *
 * `UI-LANGUAGE` §5: an em-dash set at a numeral size stops reading as
 * punctuation and starts reading as a horizontal RULE. At 26px/700 in a
 * `StatCard` it looks like a divider fell into the card; four of them in a
 * 2×2 grid look like the layout broke. It is also the one placeholder a screen
 * reader cannot convey — "em dash" is what gets announced, if anything.
 *
 * The fix is structural rather than editorial: every value-bearing component
 * (`StatCard`, `MetricPill`, `GlanceStrip`, `ProgressRing`, `ChartCard`) renders
 * `NoData` on its own when its `value` is null, so the correct call site passes
 * `null` and says nothing about presentation. This lint stops the old spelling
 * coming back through a copy-paste.
 *
 * ── What it looks for ──
 * A dash reaching a value slot: `value={… : "—"}`, `value="—"`, or a dash
 * inside an element carrying the `numeral` class. It deliberately does NOT
 * flag a dash in ordinary muted caption text — an empty cell in a dense
 * metadata line is exactly what a dash is for.
 *
 * ── Escaping it ──
 * `no-data-exempt: <why>` in a comment on the line, or up to 3 lines above.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");
const ROOTS = ["apps/app/src", "packages/ui/src"];
const EXEMPT_FILES = [
  // This file carries the banned spellings as test DATA.
  "apps/app/src/no-data.conformance.test.ts",
];
const EXEMPT_WINDOW = 3;

const DASH = "[—–]";
const BANNED: { re: RegExp; why: string }[] = [
  { re: new RegExp(`\\bvalue=\\{[^}]*["'\`]${DASH}["'\`]`), why: "pass `null` — the component renders `NoData`" },
  { re: new RegExp(`\\bvalue=["']${DASH}["']`), why: "pass `null` — the component renders `NoData`" },
  { re: new RegExp(`\\bnumeral\\b[^\\n]*["'\`]${DASH}["'\`]`), why: "a dash at numeral size reads as a rule — render `NoData`" },
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
        for (const { re, why } of BANNED) {
          if (!re.test(text)) continue;
          const window = lines.slice(Math.max(0, i - EXEMPT_WINDOW), i + 1).join("\n");
          if (/no-data-exempt:\s*\S/.test(window)) continue;
          hits.push({ file: rel, line: i + 1, text: text.trim().slice(0, 110), why });
        }
      });
    }
  }
  return hits;
}

describe("no dash as a value (UI-LANGUAGE §5)", () => {
  it("no screen renders a dash where a number belongs", () => {
    const hits = scan();
    const report = hits.map((h) => `  ${h.file}:${h.line} → ${h.why}\n    ${h.text}`).join("\n");
    expect(hits, hits.length ? `\n${hits.length} dash placeholder(s):\n${report}\n` : "").toHaveLength(0);
  });

  it("the lint can actually see a violation", () => {
    // A lint that silently stops matching passes everything.
    const samples = [
      'value={x != null ? x.toFixed(1) : "—"}',
      '<StatCard label="Avg mood" value="—" />',
      '<div className="numeral text-xl font-bold">{v ?? "—"}</div>',
    ];
    for (const s of samples) expect(BANNED.some((b) => b.re.test(s)), s).toBe(true);

    // …and leaves the legitimate uses alone: a dash in muted caption text, and
    // a real value passed the right way.
    const ok = [
      '<div className="text-xs text-muted-foreground">{metaText(e) || "—"}</div>',
      'value={x != null ? x.toFixed(1) : null}',
      '<span className="numeral">{count}</span>',
    ];
    for (const s of ok) expect(BANNED.some((b) => b.re.test(s)), s).toBe(false);
  });
});
