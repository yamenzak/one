import { describe, it, expect } from "vitest";
import { parseColor, deriveTokens, widgetTokens, resolveTokens, DEFAULT_TOKENS } from "../src/theme.js";

describe("parseColor", () => {
  it("reads an oklch() string", () => {
    const c = parseColor("oklch(0.68 0.17 300)");
    expect(c).not.toBeNull();
    expect(c!.L).toBeCloseTo(0.68, 3);
    expect(c!.C).toBeCloseTo(0.17, 3);
    expect(c!.H).toBeCloseTo(300, 1);
  });
  it("reads an oklch() string with an alpha channel", () => {
    const c = parseColor("oklch(0.18 0.02 265 / 0.62)");
    expect(c!.H).toBeCloseTo(265, 1);
  });
  it("reads a hex string", () => {
    const c = parseColor("#6366f1");
    expect(c).not.toBeNull();
    expect(c!.H).toBeGreaterThan(250); // indigo/violet hue
  });
  it("returns null for unsupported formats (e.g. hsl)", () => {
    expect(parseColor("hsl(240 60% 50%)")).toBeNull();
    expect(parseColor("")).toBeNull();
    expect(parseColor(undefined)).toBeNull();
  });
});

describe("deriveTokens", () => {
  it("produces a coherent light + dark shadcn palette from one colour", () => {
    const { light, dark } = deriveTokens({ primary: "#6366f1" });
    expect(light.primary).toMatch(/^oklch\(/);
    expect(dark.primary).toMatch(/^oklch\(/);
    expect(light.background).toMatch(/^oklch\(/);
    // Primary keeps the brand hue in both modes.
    expect(parseColor(light.primary)!.H).toBeCloseTo(parseColor(dark.primary)!.H, 0);
  });
});

describe("widgetTokens (derived from shadcn tokens)", () => {
  it("takes its accent hue from the theme's --primary", () => {
    const theme = { light: {}, dark: { primary: "oklch(0.7 0.18 30)" } };
    const w = widgetTokens({ theme, radius: 20, bodyFont: "Inter" });
    expect(parseColor(w["w-accent"])!.H).toBeCloseTo(30, 0);
    expect(w["w-radius"]).toBe("20px");
    expect(w["w-font"]).toContain("Inter");
  });
  it("falls back to shipped defaults when the theme is empty", () => {
    const w = widgetTokens({ theme: { light: {}, dark: {} }, radius: 18, bodyFont: "" });
    // Default dark --primary is hue 300 → widget accent hue ~300.
    expect(parseColor(w["w-accent"])!.H).toBeCloseTo(300, 0);
  });
});

describe("resolveTokens", () => {
  it("layers a partial theme over the shipped defaults", () => {
    const r = resolveTokens({ light: {}, dark: { primary: "oklch(0.7 0.1 120)" } }, "dark");
    expect(r.primary).toBe("oklch(0.7 0.1 120)"); // overridden
    expect(r.background).toBe(DEFAULT_TOKENS.dark.background); // default kept
  });
});
