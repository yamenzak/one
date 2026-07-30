import { describe, expect, it } from "vitest";
import { findBoundaryViolations, formatViolations, violationKeys } from "@4dl/core/boundary";

/**
 * The debt this package carries today, frozen.
 *
 * `@4dl/ui`'s README has documented one leak (`Tone`) since it was written. The
 * checker finds it in three files rather than one, which is the point of having a
 * checker: the prose said "the one known leak" and there were thirteen.
 *
 *   primitives.tsx   `Tone` — the tonal union — includes `nutrition`, `calorie`,
 *                    `hydration`, `supplement`. These are DOMAIN tones: semantic
 *                    colours for kinds of data. The mechanism is right and the
 *                    membership is Kova's. The fix is to split `Tone` into the
 *                    universal intents (positive/warning/danger/neutral/accent,
 *                    which every app needs) and an app-supplied domain set — the
 *                    same registry-injection shape `@4dl/platform` already uses.
 *   lib/icons.tsx    a `Domain` type repeating the same members, plus a `barcode`
 *                    icon export (which is app #2's noun arriving early).
 *   lib/theme.ts     `localStorage["kova-theme"]`, `<style id="kova-branding">`,
 *                    a preset described as "The Kova default", the AI-coach
 *                    persona fields, and the domain token table.
 *
 * theme.ts's `kova-*` keys are the cheapest and most urgent: two apps served from
 * the same origin would fight over one storage key.
 *
 * Scheduled for Stage 0b of docs/PLATFORM-EXTRACTION.md — before any app but Kova
 * consumes this package.
 */
const ALLOW = [
  "src/lib/icons.tsx:barcode",
  "src/lib/icons.tsx:hydration",
  "src/lib/icons.tsx:nutrition",
  "src/lib/theme.ts:calorie",
  "src/lib/theme.ts:hydration",
  "src/lib/theme.ts:kova",
  "src/lib/theme.ts:macro",
  "src/lib/theme.ts:nutrition",
  "src/lib/theme.ts:supplement",
  "src/primitives.tsx:calorie",
  "src/primitives.tsx:hydration",
  "src/primitives.tsx:nutrition",
  "src/primitives.tsx:supplement",
];

describe("package boundary", () => {
  it("imports nothing from an app", () => {
    const v = findBoundaryViolations({ dir: new URL("..", import.meta.url).pathname }).filter(
      (x) => x.kind === "app-import",
    );
    expect(v, `\n${formatViolations(v)}`).toHaveLength(0);
  });

  it("acquires no NEW product vocabulary", () => {
    const v = findBoundaryViolations({ dir: new URL("..", import.meta.url).pathname, allow: ALLOW });
    expect(v, `\n${formatViolations(v)}`).toHaveLength(0);
  });

  it("keeps the frozen list honest", () => {
    const all = violationKeys(findBoundaryViolations({ dir: new URL("..", import.meta.url).pathname }));
    expect(ALLOW.filter((a) => !all.includes(a))).toEqual([]);
  });
});
