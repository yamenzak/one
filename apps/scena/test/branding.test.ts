/**
 * THE BRAND KIT, AND THE THREE GENERATIONS OF BLOB IT HAS TO READ.
 *
 * Scena's kit predates the platform and has changed shape twice: an
 * Advanced-era blob with per-token `overrides`, a token-era one with a `theme`
 * map of BARE keys and a radius in PIXELS, and the current one — `@4dl/ui`'s
 * `Branding`, with PREFIXED keys and a radius in REM. It has also changed HOME,
 * from `app_config` to `tenant_settings.branding_json`.
 *
 * Every one of those transitions fails silently if it is wrong. A bare `primary`
 * that never matches a `--primary` lookup does not throw — the workspace just
 * quietly goes back to the shipped violet. A pixel radius read as rem does not
 * throw either; every card becomes a circle. So these assert against a real D1,
 * on what comes back out, rather than on the shape of a function.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";
import { setConfig } from "../src/billing-store.js";
import {
  BRAND_DEFAULTS,
  brandBrief,
  brandImageHint,
  brandKey,
  getBranding,
  manifestBrand,
  setBranding,
  type Branding,
} from "../src/branding-store.js";
import { playbackFreeRunKey } from "../src/content.js";

const kit = (tokens: Branding["tokens"], extra: Partial<Branding> = {}): Branding => ({
  ...BRAND_DEFAULTS, tokens, ...extra,
});

describe("brandBrief", () => {
  it("is empty for an untouched default kit (don't constrain the model)", () => {
    expect(brandBrief(BRAND_DEFAULTS)).toBe("");
    expect(brandImageHint(BRAND_DEFAULTS)).toBe("");
  });

  it("reads colours from the resolved shadcn tokens", () => {
    const b = kit({ light: {}, dark: { "--primary": "oklch(0.7 0.18 30)" } }, { brandName: "Acme" });
    const brief = brandBrief(b);
    expect(brief).toContain("Acme");
    expect(brief).toContain("oklch(0.7 0.18 30)"); // the set --primary
    expect(brief).toContain('body font "Inter"');
  });

  it("resolves unset tokens against the shipped defaults", () => {
    // Only --primary set → --background/--foreground come from defaults.
    const b = kit({ light: {}, dark: { "--primary": "oklch(0.7 0.18 30)" } }, { brandName: "Acme" });
    expect(brandBrief(b)).toContain("background oklch(0.18 0.01 300)");
  });

  it("image hint names the brand primary + accent", () => {
    const b = kit({ light: {}, dark: { "--primary": "oklch(0.7 0.18 30)", "--chart-2": "oklch(0.72 0.16 190)" } }, { brandName: "Acme" });
    const hint = brandImageHint(b);
    expect(hint).toContain("oklch(0.7 0.18 30)");
    expect(hint).toContain("oklch(0.72 0.16 190)");
  });
});

describe("manifestBrand — the boundary to the screen", () => {
  it("hands the compiler a PIXEL radius, because a television has no root font size", () => {
    expect(manifestBrand({ ...BRAND_DEFAULTS, radius: 1.25 }).radius).toBe(20);
    expect(manifestBrand({ ...BRAND_DEFAULTS, radius: 0.5 }).radius).toBe(8);
  });
});

describe("the brand store", () => {
  const T = "tenant_brand_test";

  beforeEach(async () => {
    await ensureSchema(env.DB);
    await env.DB.prepare("DELETE FROM tenant_settings WHERE tenant_id = ?").bind(T).run();
    await setConfig(env.DB, { [brandKey(T)]: "" });
  });

  it("round-trips a kit through tenant_settings, not app_config", async () => {
    await setBranding(env.DB, T, { brandName: "Acme", tokens: { light: {}, dark: { "--primary": "#112233" } } });
    // The row `@4dl/tenancy` reads for `/api/host` — which is the whole point of
    // the move. If this is null the pre-auth client has nothing to paint with.
    const row = await env.DB.prepare("SELECT branding_json FROM tenant_settings WHERE tenant_id = ?").bind(T).first<{ branding_json: string | null }>();
    expect(row?.branding_json).toBeTruthy();
    expect(JSON.parse(row!.branding_json!).brandName).toBe("Acme");
    expect((await getBranding(env.DB, T)).tokens.dark["--primary"]).toBe("#112233");
  });

  it("stores a bare token key the platform's way", async () => {
    // The old editor wrote `primary`; an imported theme may carry either. One
    // stored shape whatever wrote it, or `applyBranding` silently ignores half.
    const b = await setBranding(env.DB, T, { tokens: { light: {}, dark: { primary: "#445566" } as Record<string, string> } });
    expect(b.tokens.dark["--primary"]).toBe("#445566");
    expect(b.tokens.dark.primary).toBeUndefined();
  });

  it("refuses a token that is not in the allowlist, and a value carrying CSS syntax", async () => {
    const b = await setBranding(env.DB, T, {
      tokens: { light: {}, dark: { "--primary": "red; } :root { --background: black", "--not-a-token": "#fff" } },
    });
    expect(b.tokens.dark).toEqual({});
  });

  it("reads a PRE-PLATFORM blob out of app_config and converts it", async () => {
    // Bare keys, a pixel radius, and the field called `theme`.
    await setConfig(env.DB, {
      [brandKey(T)]: JSON.stringify({ brandName: "Legacy", radius: 16, bodyFont: "Poppins", theme: { light: {}, dark: { primary: "oklch(0.7 0.18 30)" } } }),
    });
    const b = await getBranding(env.DB, T);
    expect(b.brandName).toBe("Legacy");
    expect(b.bodyFont).toBe("Poppins");
    expect(b.tokens.dark["--primary"]).toBe("oklch(0.7 0.18 30)");
    // 16px was the shipped default corner; 1rem is the same corner.
    expect(b.radius).toBe(1);
  });

  it("reads a PRE-TOKEN blob and bakes its brand colour into a palette", async () => {
    await setConfig(env.DB, { [brandKey(T)]: JSON.stringify({ primary: "#ff0000", brandName: "Old" }) });
    const b = await getBranding(env.DB, T);
    expect(Object.keys(b.tokens.dark).length).toBeGreaterThan(10);
    expect(b.tokens.dark["--primary"]).toMatch(/^oklch\(/);
  });

  /*
    ⚠️ THE UNIT CHANGE, both directions, because a mistake here is loud but
    only in a browser. 16 is a pixel radius (1rem); 1.25 is already rem and must
    survive untouched. The discriminator is 4 — no legitimate rem is above it,
    no legitimate pixel value is below it.
  */
  it("converts a pixel radius and leaves a rem one alone", async () => {
    await setConfig(env.DB, { [brandKey(T)]: JSON.stringify({ radius: 24 }) });
    expect((await getBranding(env.DB, T)).radius).toBe(1.4); // 1.5rem, clamped to the editor's ceiling
    await setConfig(env.DB, { [brandKey(T)]: JSON.stringify({ radius: 1.25 }) });
    expect((await getBranding(env.DB, T)).radius).toBe(1.25);
  });

  it("a patch goes through the same clamps a stored blob does", async () => {
    const b = await setBranding(env.DB, T, { radius: 99, borderWidth: 40, shadow: "wild" as never, neutral: "purple" as never });
    expect(b.radius).toBe(1.4);
    expect(b.borderWidth).toBe(4);
    expect(b.shadow).toBe("soft");
    expect(b.neutral).toBe("brand");
  });

  it("merges rather than replaces — a patch of one field keeps the rest", async () => {
    await setBranding(env.DB, T, { brandName: "Acme", bodyFont: "Poppins" });
    const b = await setBranding(env.DB, T, { brandName: "Acme Two" });
    expect(b.brandName).toBe("Acme Two");
    expect(b.bodyFont).toBe("Poppins");
  });
});

// The pre-platform home was the global app_config table, so its key MUST be
// namespaced by tenant — an un-keyed key was the branding-leak bug (every tenant
// sharing one blob). Still read on the migration path, so still pinned.
describe("per-tenant config keys (isolation)", () => {
  it("brand kit key is namespaced by tenant", () => {
    expect(brandKey("tenant_a")).toBe("brand.json:tenant_a");
    expect(brandKey("tenant_a")).not.toBe(brandKey("tenant_b"));
  });
  it("playback free-run key is namespaced by tenant", () => {
    expect(playbackFreeRunKey("tenant_a")).toBe("playback.freeRun:tenant_a");
    expect(playbackFreeRunKey("tenant_a")).not.toBe(playbackFreeRunKey("tenant_b"));
  });
});
