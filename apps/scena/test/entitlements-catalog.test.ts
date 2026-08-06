import { describe, it, expect } from "vitest";
import { FEATURE_CATALOG, QUOTA_CATALOG } from "@scena/manifest";
import { FREE_ENTITLEMENTS } from "../src/entitlements.js";

/**
 * The shared catalog is the presentation source of truth; the entitlements
 * shape is the type/enforcement source of truth. These MUST stay in lockstep —
 * adding a feature/quota to the plan shape without cataloguing it (or vice
 * versa) would make it invisible or mislabelled in the admin + billing UIs.
 */
describe("entitlements catalog ↔ plan shape", () => {
  it("catalogues exactly the feature keys of FREE_ENTITLEMENTS", () => {
    const shape = Object.keys(FREE_ENTITLEMENTS.features).sort();
    const catalog = FEATURE_CATALOG.map((f) => f.key).sort();
    expect(catalog).toEqual(shape);
  });

  it("catalogues exactly the quota keys of FREE_ENTITLEMENTS", () => {
    const shape = Object.keys(FREE_ENTITLEMENTS.quotas).sort();
    const catalog = QUOTA_CATALOG.map((q) => q.key).sort();
    expect(catalog).toEqual(shape);
  });

  it("kinds match the default value types (bool vs list)", () => {
    for (const f of FEATURE_CATALOG) {
      const def = (FREE_ENTITLEMENTS.features as unknown as Record<string, unknown>)[f.key];
      if (f.kind === "list") expect(Array.isArray(def)).toBe(true);
      else expect(typeof def).toBe("boolean");
    }
  });

  it("list features declare their options", () => {
    for (const f of FEATURE_CATALOG) {
      if (f.kind === "list") expect(f.options && f.options.length > 0).toBe(true);
    }
  });
});
