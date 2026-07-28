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

const CSS = readFileSync(fileURLToPath(new URL("../src/tokens.css", import.meta.url)), "utf8");

/** Pull one `:root` / `:root[data-theme="light"]` block's custom properties. */
function block(selector: string): Record<string, string> {
  const i = CSS.indexOf(selector + " {");
  if (i === -1) throw new Error(`no ${selector} block in tokens.css`);
  const body = CSS.slice(i + selector.length + 2, CSS.indexOf("\n}", i));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

const DARK = block(":root");
const LIGHT = { ...DARK, ...block(':root[data-theme="light"]') };

// ── oklch → sRGB ────────────────────────────────────────────────────────────

function oklchToRgb(css: string): [number, number, number] {
  const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(css);
  if (!m) throw new Error(`not an oklch() colour: ${css}`);
  const [L, C, hDeg] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  // oklab → LMS
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const [l, mm, s] = [l_ ** 3, m_ ** 3, s_ ** 3];

  // LMS → linear sRGB
  const lin = [
    +4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ];
  // Clamp out-of-gamut exactly as a browser does before display.
  return lin.map((v) => Math.min(1, Math.max(0, v))) as [number, number, number];
}

/** Relative luminance from a colour that may be oklch or a plain hex. */
function luminance(css: string): number {
  const lin = css.startsWith("oklch")
    ? oklchToRgb(css)
    : (() => {
        const h = css.replace("#", "");
        const n = h.length === 3 ? [...h].map((c) => parseInt(c + c, 16)) : [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
        return n.map((v) => {
          const c = v / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        }) as [number, number, number];
      })();
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function ratio(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

// ── The pairs components actually render ────────────────────────────────────

/** AA for normal text. `body-lg` is 17px/500 — under the 18.66px-bold threshold,
 *  so the large-text 3:1 allowance does NOT apply to buttons or rows. */
const AA = 4.5;
/** AA for non-text: focus rings, icon strokes, chart marks. */
const AA_NON_TEXT = 3;

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

/** Status and domain tones are rendered as tone-on-`-soft`, never on canvas. */
const TONES = ["success", "warning", "danger", "activity", "nutrition", "sleep", "cardio", "hydration", "supplement", "lab", "calories", "protein", "carbs", "fat"];

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
