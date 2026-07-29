/**
 * A control that kills its outline has to draw its own.
 *
 * `UI-LANGUAGE` §12: keyboard focus must be visible on everything operable.
 * `outline-none` is a completely legitimate thing to write — the native outline
 * is square, ignores the radius ladder, and looks wrong on a pill — but it is
 * only legitimate *if something replaces it*. Thirteen form controls in the app
 * wrote it and replaced it with nothing, so tabbing through the lab-value editor,
 * the model pickers or the package budget fields moved an invisible cursor.
 *
 * ── What it looks for ──
 * A raw `<input>`, `<select>` or `<textarea>` whose class list contains
 * `outline-none` and no `focus:` / `focus-visible:` / `focus-within:` rule.
 *
 * Deliberately narrow. It does NOT flag focus CONTAINERS — a `Drawer.Content`, a
 * `DialogPrimitive.Content`, the workout player's shell — which set
 * `outline-none` on an element that receives focus programmatically so the
 * *contents* can be reached. Drawing a ring around the whole sheet would be the
 * bug, not the fix. The `Input`/`Textarea` primitives are also fine as written:
 * they signal focus with a border and background change rather than a ring.
 *
 * ── Escaping it ──
 * `focus-exempt: <why>` in a comment on the line, or up to 3 lines above.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");
const ROOTS = ["apps/app/src", "packages/ui/src"];
const EXEMPT_FILES = ["apps/app/src/focus.conformance.test.ts"];
const EXEMPT_WINDOW = 3;

const CONTROL = /<(input|select|textarea)\b/;
const KILLS_OUTLINE = /\boutline-none\b/;
const HAS_FOCUS = /\bfocus(-visible|-within)?:/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(name)) out.push(full);
  }
  return out;
}

interface Hit { file: string; line: number; text: string }

function scan(): Hit[] {
  const hits: Hit[] = [];
  for (const r of ROOTS) {
    for (const file of walk(join(ROOT, r))) {
      const rel = relative(ROOT, file);
      if (EXEMPT_FILES.includes(rel)) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((text, i) => {
        if (!CONTROL.test(text) || !KILLS_OUTLINE.test(text) || HAS_FOCUS.test(text)) return;
        const window = lines.slice(Math.max(0, i - EXEMPT_WINDOW), i + 1).join("\n");
        if (/focus-exempt:\s*\S/.test(window)) return;
        hits.push({ file: rel, line: i + 1, text: text.trim().slice(0, 110) });
      });
    }
  }
  return hits;
}

describe("visible focus (UI-LANGUAGE §12)", () => {
  it("no control removes its outline without replacing it", () => {
    const hits = scan();
    const report = hits
      .map((h) => `  ${h.file}:${h.line} → add \`focus-visible:ring-2 focus-visible:ring-ring/70\`\n    ${h.text}`)
      .join("\n");
    expect(hits, hits.length ? `\n${hits.length} control(s) with no focus indicator:\n${report}\n` : "").toHaveLength(0);
  });

  it("the lint can actually see a violation", () => {
    const bad = '<input value={v} className="rounded-lg bg-surface-3 px-2 outline-none" />';
    expect(CONTROL.test(bad) && KILLS_OUTLINE.test(bad) && !HAS_FOCUS.test(bad)).toBe(true);

    const ok = [
      // replaced with the house ring
      '<input className="outline-none focus-visible:ring-2 focus-visible:ring-ring/70" />',
      // replaced with a border change, as the Input primitive does
      '<input className="outline-none focus:border-primary/70" />',
      // a focus CONTAINER, not a control — correctly ignored
      '<Drawer.Content className="fixed inset-x-0 bottom-0 outline-none">',
      // a control that never touched its outline
      '<input className="rounded-lg bg-surface-3 px-2" />',
    ];
    for (const s of ok) {
      expect(CONTROL.test(s) && KILLS_OUTLINE.test(s) && !HAS_FOCUS.test(s), s).toBe(false);
    }
  });
});
