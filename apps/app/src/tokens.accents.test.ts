/**
 * Kova's ACCENT tokens, held to the same bar the design system holds its own to.
 *
 * `@4dl/ui` used to own these eleven colours and test them here. It no longer
 * can — a warehouse app has no `nutrition` tone — so the tokens moved to the app
 * and the measurement came with them, using the same exported helpers. Neither
 * half can check the other: each reads the stylesheet it ships.
 *
 * Three things are checked, and each corresponds to a way an accent silently
 * stops working:
 *
 *   CONTRAST     a tone rendered on its own `-soft` tint that does not clear AA.
 *                Unreadable, and invisible to review — oklch lightness is
 *                perceptual, so a pair can look generous and measure 3:1.
 *   ON-TONE      the other direction: ink laid on the tone at FULL strength.
 *                These pairs were once a single `--tone-foreground` per mode,
 *                which is only right while every accent in a mode sits at a
 *                similar lightness. Measured per tone now, so an accent moved
 *                out of the pack fails here instead of shipping dark-on-dark.
 *   COMPLETENESS a tone in the registry with no CSS variable behind it, which
 *                renders as an unstyled `var(--foo)` — i.e. nothing.
 *   THE LITERALS a tone whose class names are not spelled out, which Tailwind
 *                therefore never emits. The chip renders grey and nothing warns.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AA, contrastRatio, cssTokens } from "@4dl/ui";
import { ACCENT_CLASSES, DEFAULT_ACCENT_TOKENS, DOMAIN_TONES, MACRO_SPEC, MACRO_TONES } from "./registry/tones.js";

const CSS = readFileSync(fileURLToPath(new URL("./tokens.accents.css", import.meta.url)), "utf8");
const DARK = cssTokens(CSS, ":root");
const LIGHT = cssTokens(CSS, ':root[data-theme="light"]');

const ALL = [...MACRO_TONES, ...DOMAIN_TONES];

describe.each([
  ["dark", DARK],
  ["light", LIGHT],
])("%s theme — accent contrast", (_mode, tokens) => {
  it.each(ALL)("tone %s on its own soft container clears AA", (tone) => {
    const r = contrastRatio(tokens[`--${tone}`]!, tokens[`--${tone}-soft`]!);
    expect(r, `--${tone} on --${tone}-soft = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
  });

  it.each(ALL)("ink on a solid %s fill clears AA", (tone) => {
    // The `toneFill` / `bg-<tone> text-<tone>-foreground` pair: a logged pill, a
    // completed set marker, the tinted primary in Shell. Whether that ink is
    // near-white or near-dark is not a per-mode constant — it is whichever wins
    // the measurement against THIS colour, which is what `bestForeground`
    // computes and what this asserts is still true of the shipped values.
    const r = contrastRatio(tokens[`--${tone}`]!, tokens[`--${tone}-foreground`]!);
    expect(r, `--${tone}-foreground on --${tone} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
  });
});

describe("the accent registry and the stylesheet agree", () => {
  it("every registered tone has all three variables, in both modes", () => {
    for (const tone of ALL) {
      for (const [mode, tokens] of [["dark", DARK], ["light", LIGHT]] as const) {
        expect(tokens[`--${tone}`], `--${tone} (${mode})`).toBeTruthy();
        expect(tokens[`--${tone}-soft`], `--${tone}-soft (${mode})`).toBeTruthy();
        expect(tokens[`--${tone}-foreground`], `--${tone}-foreground (${mode})`).toBeTruthy();
      }
    }
  });

  it("every registered tone spells its classes out AS LITERALS, so Tailwind emits them", () => {
    // Read the SOURCE, not the values. `@4dl/ui` builds `text-${tone}` by
    // concatenation at runtime and a scanner cannot follow that, so what matters
    // is that the strings are written down — and comparing the values cannot
    // tell the difference, because a computed map produces identical strings.
    //
    // Measured, not assumed: replacing the map with `Object.fromEntries(...)`
    // and rebuilding drops `.text-lab` from the stylesheet entirely, while
    // `.text-nutrition` survives — it happens to appear as a literal in another
    // file. That is the failure mode. Some accents keep working, so the app
    // looks fine, and the rest render with no colour at all.
    const SRC = readFileSync(fileURLToPath(new URL("./registry/tones.ts", import.meta.url)), "utf8");
    for (const tone of ALL) {
      expect(ACCENT_CLASSES[tone].text, tone).toBe(`text-${tone}`);
      expect(ACCENT_CLASSES[tone].soft, tone).toBe(`bg-${tone}-soft text-${tone}`);
      expect(ACCENT_CLASSES[tone].fill, tone).toBe(`bg-${tone} text-${tone}-foreground`);
      expect(SRC, `text-${tone} must appear as a literal`).toContain(`"text-${tone}"`);
      expect(SRC, `bg-${tone}-soft must appear as a literal`).toContain(`"bg-${tone}-soft text-${tone}"`);
      expect(SRC, `bg-${tone} must appear as a literal`).toContain(`"bg-${tone} text-${tone}-foreground"`);
    }
  });

  it("the editor defaults mirror the stylesheet exactly", () => {
    // Two copies of the same numbers on purpose — the CSS is what the browser
    // paints, `DEFAULT_ACCENT_TOKENS` is what an empty editor field shows. A
    // drift between them is a swatch that does not match the screen.
    for (const [mode, tokens] of [["dark", DARK], ["light", LIGHT]] as const) {
      for (const [key, value] of Object.entries(DEFAULT_ACCENT_TOKENS[mode])) {
        expect(tokens[key], `${key} (${mode})`).toBe(value);
      }
    }
  });

  it("every macro tone is in the brand-derivation spec", () => {
    // Macros are re-tinted toward a studio's brand; the domain accents are
    // identity colours a studio sets per-token. A macro missing from the spec
    // keeps its shipped hue while its neighbours move — one bar in the wrong
    // palette, which reads as a rendering bug rather than a missing entry.
    expect(MACRO_SPEC.map((m) => m.name).sort()).toEqual([...MACRO_TONES].sort());
  });
});
