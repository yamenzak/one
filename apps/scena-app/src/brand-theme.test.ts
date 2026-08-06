/**
 * THE BRAND KIT'S SELECTORS, which are silent when wrong.
 *
 * A tenant's shadcn tokens are injected as a live stylesheet. Which SELECTOR
 * each half lands on is the whole contract with `@4dl/ui`'s tokens, and getting
 * it wrong does not throw, does not fail to compile, and does not produce a
 * blank screen — it produces a workspace with colours, just the wrong ones.
 *
 * That is exactly what shipped between Stage 7a and 7f: `brandCss` emitted
 * `:root { …light… }` / `.dark { …dark… }`, correct for the light-first
 * `.dark`-class scheme Scena arrived with, and wrong for the dark-first
 * `data-theme` scheme it moved to. Dark tokens applied nowhere; light tokens
 * applied to the DARK theme.
 *
 * These assertions are about the selectors, not the values, because the
 * selectors are the part no screenshot review catches.
 */

import { describe, expect, it } from "vitest";
import { brandCss, isDefaultBrand, parseThemeCss, type BrandKit } from "./brand-theme.js";

const kit = (over: Partial<BrandKit> = {}): BrandKit => ({
  radius: 16,
  bodyFont: "Inter",
  theme: { light: {}, dark: {} },
  ...over,
});

describe("brandCss selectors", () => {
  it("puts the DARK tokens on :root, because dark is the absence of data-theme", () => {
    const css = brandCss(kit({ theme: { light: {}, dark: { primary: "oklch(0.7 0.2 300)" } } }));
    expect(css).toMatch(/:root\s*\{[^}]*--primary:\s*oklch\(0\.7 0\.2 300\)/);
  });

  it("puts the LIGHT tokens behind :root[data-theme=\"light\"]", () => {
    const css = brandCss(kit({ theme: { light: { primary: "oklch(0.4 0.2 300)" }, dark: {} } }));
    expect(css).toContain(':root[data-theme="light"] {');
    expect(css).toMatch(/:root\[data-theme="light"\]\s*\{[^}]*--primary:\s*oklch\(0\.4 0\.2 300\)/);
  });

  it("never emits a bare .dark selector — nothing has carried that class since 7a", () => {
    const css = brandCss(kit({ theme: { light: { primary: "#111" }, dark: { primary: "#eee" } } }));
    expect(css).not.toMatch(/(^|\s|,)\.dark\s*\{/);
  });

  it("keeps the light block AFTER the dark one, so equal-specificity order cannot bite", () => {
    const css = brandCss(kit({ theme: { light: { primary: "#111" }, dark: { primary: "#eee" } } }));
    expect(css.indexOf(":root {")).toBeLessThan(css.indexOf(':root[data-theme="light"]'));
  });

  it("still emits radius and font for a kit with no dark tokens at all", () => {
    // The theme-independent values ride the `:root` block, so a light-only kit
    // must not lose them.
    const css = brandCss(kit({ radius: 4, bodyFont: "Poppins", theme: { light: { primary: "#111" }, dark: {} } }));
    expect(css).toContain("--radius: 4px;");
    expect(css).toContain('--font-sans: "Poppins"');
  });

  it("clamps the radius rather than trusting the stored number", () => {
    expect(brandCss(kit({ radius: 9999, theme: { light: { primary: "#111" }, dark: {} } }))).toContain("--radius: 64px;");
    expect(brandCss(kit({ radius: -20, theme: { light: { primary: "#111" }, dark: {} } }))).toContain("--radius: 0px;");
  });
});

describe("isDefaultBrand", () => {
  it("is true for the untouched kit, so nothing is injected at all", () => {
    expect(isDefaultBrand(kit())).toBe(true);
  });

  it("is false as soon as one token, the radius or the font differs", () => {
    expect(isDefaultBrand(kit({ theme: { light: { primary: "#111" }, dark: {} } }))).toBe(false);
    expect(isDefaultBrand(kit({ radius: 4 }))).toBe(false);
    expect(isDefaultBrand(kit({ bodyFont: "Poppins" }))).toBe(false);
  });
});

describe("parseThemeCss", () => {
  it("reads the shadcn shape people actually paste — :root plus a .dark class", () => {
    // The INPUT selectors stay shadcn's on purpose: every theme on the internet
    // is written light-first with a `.dark` class. What Scena emits is a
    // separate decision, asserted above.
    const parsed = parseThemeCss(`
      :root { --primary: oklch(0.4 0.2 300); --background: oklch(1 0 0); }
      .dark { --primary: oklch(0.8 0.2 300); }
    `);
    expect(parsed.light.primary).toBe("oklch(0.4 0.2 300)");
    expect(parsed.light.background).toBe("oklch(1 0 0)");
    expect(parsed.dark.primary).toBe("oklch(0.8 0.2 300)");
  });

  it("drops tokens that are not in the allow-list", () => {
    const parsed = parseThemeCss(":root { --primary: #111; --not-a-real-token: #222; }");
    expect(parsed.light.primary).toBe("#111");
    expect(parsed.light["not-a-real-token"]).toBeUndefined();
  });

  it("returns empty maps for text that is not a theme, so the caller can refuse", () => {
    const parsed = parseThemeCss("hello");
    expect(Object.keys(parsed.light)).toHaveLength(0);
    expect(Object.keys(parsed.dark)).toHaveLength(0);
  });
});
