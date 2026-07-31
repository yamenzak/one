/**
 * WCAG contrast, enforced on the SHIPPED tokens. UI-LANGUAGE §12.
 *
 * This exists because the light-mode primary shipped at 3.27:1 as a button fill
 * — a clear AA failure on the most-pressed control in the product — and nothing
 * caught it. It was not found by reading the token file either: `oklch(0.62 0.14
 * 164)` and `oklch(0.99 0.01 164)` look like a perfectly reasonable pair, and
 * lightness in oklch is perceptual, not photometric, so "0.62 vs 0.99 is a big
 * gap" is the wrong intuition. It was found by resolving both through a real
 * browser and measuring.
 *
 * So the check is arithmetic, and it runs on the actual values in `tokens.css`
 * rather than on a copy. `oklch()` is converted here (oklch → oklab → linear
 * sRGB → sRGB) instead of being taken on faith.
 *
 * WHAT THIS CANNOT SEE, stated plainly so nobody reads a green run as more than
 * it is: this checks the token PAIRS the components are documented to use. It
 * cannot see a component that pairs two tokens nobody expected, text over a
 * gradient, or anything set in a class rather than a variable. Those need the
 * browser probe. This is the floor, not the ceiling.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AA, AA_NON_TEXT, contrastRatio as ratio, cssTokens, luminance } from "../src/lib/contrast.js";

const CSS = readFileSync(fileURLToPath(new URL("../src/tokens.css", import.meta.url)), "utf8");
const DARK = cssTokens(CSS, ":root");
const LIGHT = { ...DARK, ...cssTokens(CSS, ':root[data-theme="light"]') };

// ── The pairs components actually render ────────────────────────────────────


const TEXT_PAIRS: [string, string, string][] = [
  ["body on canvas", "--foreground", "--background"],
  ["body on a card", "--card-foreground", "--card"],
  ["muted on canvas", "--muted-foreground", "--background"],
  ["muted on a card", "--muted-foreground", "--card"],
  ["muted on surface-2", "--muted-foreground", "--surface-2"],
  ["primary button", "--primary-foreground", "--primary"],
  ["secondary button", "--secondary-foreground", "--secondary"],
  ["destructive button", "--destructive-foreground", "--destructive"],
  ["popover text", "--popover-foreground", "--popover"],
];

/**
 * Status tones are rendered as tone-on-`-soft`, never on canvas.
 *
 * The design system's own tones only. An app's ACCENT tones are measured by the
 * app against the same bar, using the same exported helpers — Kova's are in
 * `apps/app/src/tokens.accents.contrast.test.ts`. Neither half can be checked
 * from the other: this file reads the stylesheet it ships.
 */
const TONES = ["success", "warning", "danger"];

describe.each([
  ["dark", DARK],
  ["light", LIGHT],
])("%s theme contrast", (mode, tokens) => {
  it.each(TEXT_PAIRS)("%s clears AA", (_name, fg, bg) => {
    const r = ratio(tokens[fg]!, tokens[bg]!);
    expect(r, `${tokens[fg]} on ${tokens[bg]} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
  });

  it.each(TONES)("tone %s on its own soft container clears AA", (tone) => {
    const r = ratio(tokens[`--${tone}`]!, tokens[`--${tone}-soft`]!);
    expect(r, `--${tone} on --${tone}-soft = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
  });

  it("the focus ring is visible against every surface it can land on", () => {
    for (const surface of ["--background", "--card", "--surface-2", "--popover"]) {
      const r = ratio(tokens["--ring"]!, tokens[surface]!);
      expect(r, `--ring on ${surface} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });

  it("every step of the surface ladder is actually visible", () => {
    // A four-step ladder whose middle two steps are a rounding apart is a
    // three-step ladder with a bug in it — depth comes from tone here (§3), so a
    // step nobody can see means a card and its nested card merge.
    //
    // Deliberately NOT a monotonic check. Light mode is not monotonic and should
    // not be: the canvas is a hair grey, `card` is pure WHITE above it, and
    // surface-2/3 then step back down for pressed and hover. §3 calls that the
    // polarity inverting while the structure holds. The invariant that survives
    // both modes is adjacency — neighbours must be distinguishable — so that is
    // what gets asserted rather than an ordering only dark mode has.
    const ladder = ["--background", "--card", "--surface-2", "--surface-3"].map((k) => luminance(tokens[k]!));
    for (let i = 1; i < ladder.length; i++) {
      const step = Math.abs(ladder[i]! - ladder[i - 1]!);
      expect(step, `step ${i} is invisible (${step.toFixed(5)}) — ${ladder.map((v) => v.toFixed(4)).join(" → ")}`).toBeGreaterThan(0.002);
    }
  });
});

describe("the arithmetic itself", () => {
  // A contrast test that silently computes nonsense passes everything, so the
  // conversion is pinned against values with known answers.
  it("matches known ratios", () => {
    expect(ratio("#ffffff", "#000000")).toBeCloseTo(21, 1);
    expect(ratio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // oklch(1 0 0) is white and oklch(0 0 0) is black; if the conversion were
    // wrong these would not agree with the hex path above.
    expect(ratio("oklch(1 0 0)", "oklch(0 0 0)")).toBeCloseTo(21, 0);
  });

  it("agrees with a browser-measured value", () => {
    // Measured in headless Chromium on the real login screen: the light-mode
    // primary button reads 4.80:1. If this drifts, the conversion drifted.
    expect(ratio("oklch(0.99 0.01 164)", "oklch(0.52 0.14 164)")).toBeCloseTo(4.8, 1);
  });
});
