import { describe, it, expect } from "vitest";
import { brandBrief, brandImageHint, brandKey, BRAND_DEFAULTS, type Branding } from "../src/branding-store.js";
import { playbackFreeRunKey } from "../src/content.js";

const kit = (theme: Branding["theme"], extra: Partial<Branding> = {}): Branding => ({
  ...BRAND_DEFAULTS, theme, ...extra,
});

describe("brandBrief", () => {
  it("is empty for an untouched default kit (don't constrain the model)", () => {
    expect(brandBrief({ ...BRAND_DEFAULTS, theme: { light: {}, dark: {} } })).toBe("");
    expect(brandImageHint({ ...BRAND_DEFAULTS, theme: { light: {}, dark: {} } })).toBe("");
  });

  it("reads colours from the resolved shadcn tokens", () => {
    const b = kit({ light: {}, dark: { primary: "oklch(0.7 0.18 30)" } }, { brandName: "Acme" });
    const brief = brandBrief(b);
    expect(brief).toContain("Acme");
    expect(brief).toContain("oklch(0.7 0.18 30)"); // the set --primary
    expect(brief).toContain("body font \"Inter\"");
  });

  it("resolves unset tokens against the shipped defaults", () => {
    // Only --primary set → --background/--foreground come from defaults.
    const b = kit({ light: {}, dark: { primary: "oklch(0.7 0.18 30)" } }, { brandName: "Acme" });
    const brief = brandBrief(b);
    expect(brief).toContain("background oklch(0.18 0.01 300)");
  });

  it("image hint names the brand primary + accent", () => {
    const b = kit({ light: {}, dark: { primary: "oklch(0.7 0.18 30)", "chart-2": "oklch(0.72 0.16 190)" } }, { brandName: "Acme" });
    const hint = brandImageHint(b);
    expect(hint).toContain("oklch(0.7 0.18 30)");
    expect(hint).toContain("oklch(0.72 0.16 190)");
  });
});

// Per-tenant settings live in the global app_config table, so they MUST be keyed
// by tenant — an un-keyed key was the branding-leak bug (every tenant sharing one
// blob). These lock the derivation: stable per tenant, distinct across tenants.
describe("per-tenant config keys (isolation)", () => {
  it("brand kit key is namespaced by tenant", () => {
    expect(brandKey("tenant_a")).toBe("brand.json:tenant_a");
    expect(brandKey("tenant_a")).not.toBe(brandKey("tenant_b"));
  });
  it("playback free-run key is namespaced by tenant", () => {
    expect(playbackFreeRunKey("tenant_a")).toBe("playback.freeRun:tenant_a");
    expect(playbackFreeRunKey("tenant_a")).not.toBe(playbackFreeRunKey("tenant_b"));
  });
  it("keys are stable for the same tenant (no cross-tenant collision)", () => {
    const a1 = new Set(["tenant_a"].map(brandKey));
    expect(brandKey("tenant_a")).toBe([...a1][0]);
    expect(brandKey("tenant_b")).not.toBe(brandKey("tenant_a"));
  });
});
