import { describe, it, expect } from "vitest";
import { FEATURE_CATALOG, FEATURE_CATEGORIES, QUOTA_CATALOG } from "@scena/manifest";
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

  it("has a BOOLEAN default for every catalogued feature", () => {
    /*
      There is no other kind now. Four features were `string[]` variant lists,
      and `@4dl/billing`'s engine coerces a feature to a boolean — so a list
      would resolve to `false` on every plan, silently disabling the tiered
      feature it was describing. This assertion is what catches a list sneaking
      back in through the plan shape.
    */
    for (const f of FEATURE_CATALOG) {
      const def = (FREE_ENTITLEMENTS.features as unknown as Record<string, unknown>)[f.key];
      expect(typeof def, `${f.key} is not a boolean`).toBe("boolean");
    }
  });

  it("has a NUMERIC default for every catalogued quota", () => {
    for (const q of QUOTA_CATALOG) {
      const def = (FREE_ENTITLEMENTS.quotas as unknown as Record<string, unknown>)[q.key];
      expect(typeof def, `${q.key} is not a number`).toBe("number");
    }
  });

  it("puts every feature in a declared category", () => {
    // A category typo does not fail anything — it produces a group the admin
    // editor renders last, or not at all, depending on how it iterates.
    for (const f of FEATURE_CATALOG) {
      expect(FEATURE_CATEGORIES as readonly string[], `${f.key}: "${f.category}"`).toContain(f.category);
    }
  });
});
