/**
 * Cross-package registry conformance. The feature spine lives in @mossa/domain
 * (logic) and can't import the presentation atoms in @mossa/ui, so the join it
 * can't check itself — every metric a FeatureSpec surfaces must be a real METRICS
 * key — is validated here, where the app already depends on both.
 */
import { describe, expect, it } from "vitest";
import { FEATURES, TENANT_ROLES, FEATURE_KEYS, STUDIO_SETTINGS_SECTIONS, settingsSectionVisible, FREE_ENTITLEMENTS, type FeatureSpec } from "@mossa/domain";
import { METRICS, personaLabel, PERSONA_LABELS } from "@mossa/ui";

describe("feature ↔ metric registry join", () => {
  it("every metric a feature surfaces is a real METRICS key", () => {
    const metricKeys = new Set(Object.keys(METRICS));
    for (const spec of Object.values(FEATURES) as FeatureSpec[]) {
      for (const m of spec.metrics ?? []) {
        expect(metricKeys, `${spec.key} → ${m}`).toContain(m);
      }
    }
  });
});

describe("persona labels", () => {
  it("the internal trainer role is surfaced as 'Coach'", () => {
    expect(personaLabel("trainer")).toBe("Coach");
    expect(personaLabel("owner")).toBe("Owner");
    expect(personaLabel("assistant")).toBe("Assistant");
    expect(personaLabel("client")).toBe("Client");
  });

  it("the self variant renders 'You'", () => {
    expect(personaLabel("trainer", { self: true })).toBe("You");
  });

  it("every tenant role has a persona label", () => {
    for (const role of TENANT_ROLES) expect(PERSONA_LABELS, role).toHaveProperty(role);
  });
});

describe("studio settings registry", () => {
  it("every section's requiresFeature is a real platform feature", () => {
    for (const s of STUDIO_SETTINGS_SECTIONS) {
      if (s.requiresFeature) expect(FEATURE_KEYS, s.key).toContain(s.requiresFeature);
    }
  });

  it("entitlement-gated sections hide on the free plan; ungated ones stay", () => {
    const free = FREE_ENTITLEMENTS.features;
    const brand = STUDIO_SETTINGS_SECTIONS.find((s) => s.key === "brand")!;
    const signin = STUDIO_SETTINGS_SECTIONS.find((s) => s.key === "signin")!;
    expect(settingsSectionVisible(brand, free)).toBe(false); // branding not on free
    expect(settingsSectionVisible(signin, free)).toBe(true); // always available
  });
});
