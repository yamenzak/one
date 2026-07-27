/**
 * The token generator's reach.
 *
 * `deriveTokens` is the whole of "pick one colour and the app re-skins". If it
 * silently stops writing a surface, that surface keeps the shipped Mossa grey
 * while everything around it moves — which reads as a rendering bug, not as a
 * missing token, and is exactly the kind of thing nobody notices until a customer
 * screenshots it.
 */

import { describe, expect, it } from "vitest";
import { deriveTokens, brandingCss, SHADOW_PRESETS, BORDER_WIDTHS, type NeutralTint } from "../src/lib/theme.js";

/** Every NEUTRAL surface. Status colours and domain accents are deliberately
 *  absent — see the tint test below for why. */
const SURFACES = [
  "--background", "--card", "--surface-2", "--surface-3", "--popover",
  "--secondary", "--muted", "--accent", "--border", "--input",
];

const BLUE = "oklch(0.62 0.19 262)";
const chromaOf = (v: string): number => Number(/oklch\(\s*[\d.]+\s+([\d.]+)/.exec(v)?.[1] ?? "-1");
const hueOf = (v: string): number => Number(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/.exec(v)?.[1] ?? "-1");

describe("deriveTokens — one colour re-skins everything", () => {
  it("writes every neutral surface, in both modes", () => {
    const t = deriveTokens({ primary: BLUE });
    for (const mode of ["light", "dark"] as const) {
      for (const key of SURFACES) {
        expect(t[mode]?.[key], `${mode} ${key}`).toBeTruthy();
      }
      // …and the foreground for each surface that has one, or text lands
      // unreadable on a re-skinned background.
      for (const key of ["--foreground", "--card-foreground", "--popover-foreground", "--muted-foreground", "--primary-foreground"]) {
        expect(t[mode]?.[key], `${mode} ${key}`).toBeTruthy();
      }
    }
  });

  it("the surface tint moves EVERY neutral surface, not just some of them", () => {
    // A tint that reaches 8 of 10 surfaces is worse than one that reaches none:
    // the two stragglers read as a bug.
    const byTint = Object.fromEntries(
      (["brand", "gray", "cool", "warm"] as NeutralTint[]).map((n) => [n, deriveTokens({ primary: BLUE, neutral: n })]),
    ) as Record<NeutralTint, ReturnType<typeof deriveTokens>>;

    for (const mode of ["light", "dark"] as const) {
      for (const key of SURFACES) {
        const brand = byTint.brand[mode]![key]!;
        expect(byTint.warm[mode]![key], `${mode} ${key} ignores "warm"`).not.toBe(brand);
        expect(byTint.cool[mode]![key], `${mode} ${key} ignores "cool"`).not.toBe(brand);
        // "Neutral" must be genuinely grey — a residual chroma is a tint that
        // did not turn off.
        expect(chromaOf(byTint.gray[mode]![key]!), `${mode} ${key} is not grey under "Neutral"`).toBe(0);
      }
      // Warm and cool pull toward fixed hues; brand follows the brand hue.
      expect(hueOf(byTint.warm[mode]!["--card"]!)).toBe(70);
      expect(hueOf(byTint.cool[mode]!["--card"]!)).toBe(255);
      expect(hueOf(byTint.brand[mode]!["--card"]!)).toBeCloseTo(262, 0);
    }
  });

  it("leaves status colours and domain accents alone", () => {
    // Deliberate, not an omission: a "danger" red that drifts brand-warm stops
    // reading as danger, and the domain accents (activity, nutrition, sleep…) are
    // identity colours a studio picks per-token if it wants them changed.
    const t = deriveTokens({ primary: BLUE, neutral: "warm" });
    for (const key of ["--destructive", "--success", "--warning", "--danger", "--activity", "--nutrition", "--sleep"]) {
      expect(t.dark?.[key], `${key} should not be generated`).toBeUndefined();
      expect(t.light?.[key], `${key} should not be generated`).toBeUndefined();
    }
  });

  it("does generate the macro accents, which ARE brand-derived", () => {
    const t = deriveTokens({ primary: BLUE });
    for (const key of ["--calories", "--protein", "--carbs", "--fat"]) {
      expect(t.dark?.[key], key).toBeTruthy();
    }
  });
});

describe("brandingCss — what actually reaches the page", () => {
  it("emits radius, elevation, hairline colour and border weight", () => {
    const css = () => brandingCss({ radius: 0.55, shadow: "dramatic", borderColor: "#3a3a42", borderWidth: 0 });
    expect(css()).toContain("--radius:0.55rem");
    expect(css()).toContain("--border-width:0px");
    // The elevation preset writes all three steps together, so nothing is left
    // floating when a studio asks for flat.
    for (const step of ["--shadow-sm", "--shadow-md", "--shadow-lg"]) expect(css()).toContain(step);
    expect(css()).toContain("--border:#3a3a42");
  });

  it("`soft` reproduces the shipped elevation, so an untouched studio is unaffected", () => {
    const css = () => brandingCss({ shadow: "soft" });
    // These are the tokens.css values verbatim; if they drift, every tenant that
    // never opened the brand editor silently changes appearance.
    expect(css()).toContain("--shadow-sm:0 1px 2px 0 oklch(0 0 0 / 0.3)");
  });

  it("clamps a border weight that would break every border on the page", () => {
    expect(brandingCss({ borderWidth: -5 })).toContain("--border-width:0px");
    expect(brandingCss({ borderWidth: 99 })).toContain("--border-width:4px");
    // A NaN must not reach the stylesheet at all rather than land as a literal.
    expect(brandingCss({ borderWidth: Number.NaN })).not.toContain("--border-width");
  });

  it("ignores `neutral` — it is a generator input, not a runtime token", () => {
    expect(brandingCss({ neutral: "warm" })).not.toContain("neutral");
  });

  it("the editor's option lists are non-empty (they drive the only UI for these)", () => {
    expect(SHADOW_PRESETS.map((p) => p.id)).toEqual(["none", "subtle", "soft", "dramatic"]);
    expect(BORDER_WIDTHS.map((w) => w.value)).toContain(0);
  });
});
