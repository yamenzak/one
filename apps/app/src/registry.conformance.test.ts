/**
 * Cross-package registry conformance. The feature spine lives in @mossa/domain
 * (logic) and can't import the presentation atoms in @mossa/ui, so the join it
 * can't check itself — every metric a FeatureSpec surfaces must be a real METRICS
 * key — is validated here, where the app already depends on both.
 */
import { describe, expect, it } from "vitest";
import { FEATURES, type FeatureSpec } from "@mossa/domain";
import { METRICS } from "@mossa/ui";

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
