import { describe, expect, it } from "vitest";
import { FEATURES, gateSpecOf, type FeatureSpec } from "../src/features.js";
import { FEATURE_KEYS } from "../src/entitlements.js";
import { CLIENT_FLAG_KEYS, CLIENT_FLAG_META } from "../src/clientFlags.js";
import { PERMISSION_CATALOG } from "../src/perms.js";
import { NOTIF_TYPES } from "../src/notifications.js";

const specs: FeatureSpec[] = Object.values(FEATURES);

describe("feature registry conformance", () => {
  it("the map key matches each spec's own key", () => {
    for (const [k, spec] of Object.entries(FEATURES)) expect(spec.key).toBe(k);
  });

  it("every entitlement reference is a real platform feature", () => {
    for (const s of specs) if (s.entitlement) expect(FEATURE_KEYS, s.key).toContain(s.entitlement);
  });

  it("every clientFlag reference is a real client flag", () => {
    for (const s of specs) if (s.clientFlag) expect(CLIENT_FLAG_KEYS, s.key).toContain(s.clientFlag);
  });

  it("every permission reference is a real catalog resource", () => {
    for (const s of specs) if (s.permission) expect(Object.keys(PERMISSION_CATALOG), s.key).toContain(s.permission);
  });

  it("every notif type reference is a real notification type", () => {
    for (const s of specs) for (const t of s.notifTypes ?? []) expect(NOTIF_TYPES[t], `${s.key} → ${t}`).toBeDefined();
  });

  it("a feature's entitlement agrees with its client flag's requiresFeature", () => {
    // The two flag systems must not contradict: if a feature pairs an entitlement
    // with a client flag that itself declares requiresFeature, they must match.
    for (const s of specs) {
      if (!s.clientFlag || !s.entitlement) continue;
      const req = CLIENT_FLAG_META[s.clientFlag].requiresFeature;
      if (req) expect(req, `${s.key}: flag ${s.clientFlag} requires ${req} but feature declares ${s.entitlement}`).toBe(s.entitlement);
    }
  });

  it("gateSpecOf derives the enforcement pairing from the spec", () => {
    expect(gateSpecOf("aiMealTools")).toEqual({ entitlement: "aiSuite", clientFlag: "aiMealTools" });
    expect(gateSpecOf("bodyScan")).toEqual({ entitlement: "bfCamera", clientFlag: "canUseBodyScan" });
    expect(gateSpecOf("commerce")).toEqual({ entitlement: "commerce", clientFlag: undefined });
    expect(gateSpecOf("foodLogging")).toEqual({ entitlement: undefined, clientFlag: "canLogOwnFood" });
  });

  it("every entitlement-gated platform feature is represented in the registry", () => {
    // Each non-reserved entitlement should back at least one feature (so the
    // registry is a complete view of what the platform sells).
    const gated = new Set(specs.map((s) => s.entitlement).filter(Boolean));
    for (const key of ["commerce", "aiSuite", "bfCamera", "externalSearch", "supplementsLabs", "frontDesk", "branding"] as const) {
      expect(gated, `entitlement ${key} has no feature`).toContain(key);
    }
  });
});
