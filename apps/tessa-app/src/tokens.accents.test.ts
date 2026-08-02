/**
 * TESSA'S ACCENTS, held to the same bar the design system holds its own to.
 *
 * This file exists because of a bug that shipped: Tessa used `cardio`,
 * `nutrition`, `activity` and `sleep` — Kova's accent names — and defined none
 * of them. `@4dl/ui` resolves an unknown tone by convention, so nothing errored:
 * `var(--cardio)` was undefined and `bg-cardio-soft` was a class Tailwind never
 * emitted. The badges rendered uncoloured and every test passed.
 *
 * Four things are checked, each a way an accent silently stops working:
 *
 *   COMPLETENESS  a registered tone with no CSS variable behind it, which
 *                 renders as an unstyled `var(--foo)` — i.e. as nothing.
 *   THE LITERALS  a tone whose class names are not spelled out, so Tailwind
 *                 never emits them. `@4dl/ui` builds `text-${tone}` by
 *                 concatenation, which the scanner cannot see.
 *   CONTRAST      a tone drawn on its own `-soft` tint that misses AA.
 *                 Unreadable, and invisible to review: OKLCH lightness is
 *                 perceptual, so a pair can look generous and measure 3:1.
 *   NO BORROWING  a tone used in a screen that this app has not registered —
 *                 the original bug, caught at its source rather than by eye.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AA, contrastRatio, cssTokens } from "@4dl/ui";
import { ACCENT_CLASSES, ALLOWED_TONES, DOMAIN_TONES, type DomainTone } from "./tones.js";

const SRC = fileURLToPath(new URL(".", import.meta.url));
const css = readFileSync(join(SRC, "tokens.accents.css"), "utf8");
const registryText = readFileSync(join(SRC, "tones.ts"), "utf8");
const TONES = Object.keys(DOMAIN_TONES) as DomainTone[];

/** Every `.tsx` under src/, so a borrowed tone anywhere is caught. */
function screens(dir = SRC, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) screens(p, out);
    else if (entry.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("completeness", () => {
  it("defines both variables for every registered tone, in both modes", () => {
    for (const mode of [":root", ':root[data-theme="light"]']) {
      const tokens = cssTokens(css, mode);
      for (const tone of TONES) {
        expect(tokens[`--${tone}`], `${tone} in ${mode}`).toBeTruthy();
        expect(tokens[`--${tone}-soft`], `${tone}-soft in ${mode}`).toBeTruthy();
      }
    }
  });

  it("maps every tone into @theme, or Tailwind emits no utility for it", () => {
    for (const tone of TONES) {
      expect(css).toContain(`--color-${tone}: var(--${tone});`);
      expect(css).toContain(`--color-${tone}-soft: var(--${tone}-soft);`);
    }
  });
});

describe("the class literals", () => {
  it("spells out every class, so the scanner can see it", () => {
    for (const tone of TONES) {
      const c = ACCENT_CLASSES[tone];
      expect(c.text).toBe(`text-${tone}`);
      expect(c.soft).toBe(`bg-${tone}-soft text-${tone}`);
      // Spelled out IN THE SOURCE, not merely equal to a template result — the
      // whole point is that a concatenated name is invisible to Tailwind.
      expect(registryText, `${tone} literals`).toContain(`"text-${tone}"`);
      expect(registryText, `${tone} literals`).toContain(`"bg-${tone}-soft text-${tone}"`);
    }
  });
});

describe("contrast", () => {
  it("clears AA for tone-coloured ink on its own soft tint, in both modes", () => {
    for (const mode of [":root", ':root[data-theme="light"]']) {
      const tokens = cssTokens(css, mode);
      for (const tone of TONES) {
        const ratio = contrastRatio(tokens[`--${tone}`]!, tokens[`--${tone}-soft`]!);
        expect(ratio, `${tone} on ${tone}-soft in ${mode} — ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
      }
    }
  });
});

describe("no borrowed vocabulary", () => {
  it("uses no tone this app has not registered", () => {
    /**
     * The original bug, caught where it happens. A `tone="cardio"` in a screen
     * resolves to `var(--cardio)` — undefined — and renders as nothing.
     *
     * Matches the literal prop only. A tone passed through a variable is beyond
     * a regex, and pretending otherwise would be a check that reads as complete
     * and is not.
     */
    const allowed = new Set(ALLOWED_TONES as readonly string[]);
    const offenders: string[] = [];
    for (const file of screens()) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/\btone\s*[:=]\s*"([a-zA-Z]+)"/g)) {
        if (!allowed.has(m[1]!)) offenders.push(`${file.replace(SRC, "")}: tone="${m[1]}"`);
      }
    }
    expect(offenders, `unregistered tones — they render uncoloured:\n${offenders.join("\n")}`).toEqual([]);
  });
});
