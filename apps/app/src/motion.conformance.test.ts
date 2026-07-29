/**
 * Motion has one source.
 *
 * `UI-LANGUAGE` §8 opens with the claim that every duration, curve and spring in
 * the product comes from `lib/animation.ts`. It was a claim, not a fact: the app
 * carried **16 hand-rolled springs with 13 different tunings**, and most of them
 * were nowhere near critically damped — one pair (stiffness 620, damping 20) has
 * a damping ratio of 0.40, which is a visible three-bounce wobble, sitting on the
 * check-off animation a client sees several times a day. §8 forbids exactly that
 * ("no visible overshoot… bounce reads as toy") and nothing was checking.
 *
 * Cohesion is the whole point: things animating at the same moment share a
 * cadence only if they share a source. So this fails on a spring or a raw
 * duration written at a call site.
 *
 * ── What it looks for ──
 * `type: "spring"` anywhere outside the animation module, and a bare numeric
 * `duration:` inside a transition.
 *
 * Two deliberate carve-outs:
 *
 *  • **`delay:`** — a per-item stagger offset is a property of the list, not of
 *    the motion language, and routing those through a constant reads worse.
 *  • **`repeat:`** — ambient looping motion (a shimmer, a thinking pulse, an
 *    indeterminate bar) is a different class from an entrance. A loop's period
 *    is a property of the EFFECT, and the entrance ladder's longest rung
 *    (`slow`, 360ms) is meaningless for something that never ends. The varied
 *    periods in `AiAnalyzing` are the point: equal ones would beat in unison
 *    and read as a progress bar rather than as thinking.
 *
 * ── Escaping it ──
 * `motion-exempt: <why>` in a comment on the line, or up to 3 lines above. The
 * pulsing attention ring in the tour is the real case: it repeats forever, so
 * none of the entrance durations apply to it.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");
const ROOTS = ["apps/app/src", "packages/ui/src"];
const EXEMPT_FILES = [
  // The source of truth. It is where these literals are supposed to live.
  "packages/ui/src/lib/animation.ts",
  // Carries the banned spellings as test DATA.
  "apps/app/src/motion.conformance.test.ts",
];
const EXEMPT_WINDOW = 3;

const BANNED: { re: RegExp; use: string }[] = [
  { re: /type:\s*"spring"/, use: "SPRING · SPRING_SNAP · SPRING_SOFT · SPRING_DRAG" },
  { re: /\bduration:\s*\d+(\.\d+)?/, use: "DUR.instant · fast · base · slow · draw" },
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
          if (/motion-exempt:\s*\S/.test(window)) continue;
          // Ambient loops are a different class — see the header.
          if (/\brepeat:/.test(text)) continue;
          hits.push({ file: rel, line: i + 1, text: text.trim().slice(0, 110), use });
        }
      });
    }
  }
  return hits;
}

describe("motion has one source (UI-LANGUAGE §8)", () => {
  it("no screen writes its own spring or duration", () => {
    const hits = scan();
    const report = hits.map((h) => `  ${h.file}:${h.line} → use \`${h.use}\`\n    ${h.text}`).join("\n");
    expect(hits, hits.length ? `\n${hits.length} hand-rolled transition(s):\n${report}\n` : "").toHaveLength(0);
  });

  it("the lint can actually see a violation", () => {
    const samples = [
      'transition={{ type: "spring", stiffness: 620, damping: 20 }}',
      "transition={{ duration: 0.3 }}",
    ];
    for (const s of samples) expect(BANNED.some((b) => b.re.test(s)), s).toBe(true);

    // …and leaves the correct spellings, and bare delays, alone.
    const ok = [
      "transition={SPRING_SNAP}",
      "transition={{ ...SPRING_SNAP, delay: 0.06 }}",
      "transition={{ duration: DUR.base, ease: EASE_OUT }}",
      "transition={{ delay: i * 0.03 }}",
    ];
    for (const s of ok) expect(BANNED.some((b) => b.re.test(s)), s).toBe(false);

    // The loop carve-out is part of the contract, so pin it too: this line
    // matches a banned pattern and must still be allowed through.
    const loop = 'transition={{ duration: 1.4, ease: "easeInOut", repeat: Infinity }}';
    expect(BANNED.some((b) => b.re.test(loop)), loop).toBe(true);
    expect(/\brepeat:/.test(loop)).toBe(true);
  });
});
