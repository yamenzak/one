/**
 * Registry COVERAGE conformance (audit round-6) — the anti-dead-flag net.
 *
 * `features.test.ts` proves every reference in a FeatureSpec points at a real
 * atom. This file proves the other direction: every atom in the two flag systems
 * is reachable FROM the registry, because that is the only way `gateFeature`
 * (server) and `featureEnabled` (UI) can ever see it.
 *
 * A flag with no FeatureSpec is one of exactly three things, and it must say
 * which: a real capability (→ must have a spec), form composition (→ formOnly),
 * or a capability the product does not have (→ reserved). Anything else is a
 * flag a tenant can sell and nothing enforces — the bug class this file exists
 * to keep out.
 */

import { describe, expect, it } from "vitest";
import { FEATURES, featureForClientFlag, featuresForEntitlement, FEATURE_REGISTRY_KEYS, type FeatureSpec } from "../src/features.js";
import { FEATURE_KEYS, RESERVED_FEATURES } from "../src/entitlements.js";
import {
  CLIENT_FLAG_KEYS,
  CLIENT_FLAG_META,
  RESERVED_CLIENT_FLAGS,
  FORM_ONLY_CLIENT_FLAGS,
  SELLABLE_CLIENT_FLAG_KEYS,
} from "../src/clientFlags.js";

describe("client-flag coverage", () => {
  it("every client flag is EITHER owned by a feature, form-only, or reserved", () => {
    const orphans = CLIENT_FLAG_KEYS.filter(
      (k) => !featureForClientFlag(k) && !CLIENT_FLAG_META[k].formOnly && !CLIENT_FLAG_META[k].reserved,
    );
    expect(orphans, "these flags are sold in the package builder and enforced by nothing").toEqual([]);
  });

  it("the three categories are disjoint", () => {
    for (const k of CLIENT_FLAG_KEYS) {
      const owned = !!featureForClientFlag(k);
      const form = !!CLIENT_FLAG_META[k].formOnly;
      const reserved = !!CLIENT_FLAG_META[k].reserved;
      expect([owned, form, reserved].filter(Boolean).length, `${k} claims more than one category`).toBeLessThanOrEqual(1);
    }
  });

  it("names the flags that grant nothing today, so the list can't grow silently", () => {
    // Both were live toggles in the package builder with zero backing: there is
    // no reorder affordance and nothing requires/nags a check-in.
    expect([...RESERVED_CLIENT_FLAGS].sort()).toEqual(["canReorderExercises", "checkInRequired"]);
  });

  it("names the form-composition flags (they gate fields, never routes)", () => {
    expect([...FORM_ONLY_CLIENT_FLAGS].sort()).toEqual([
      "checkInIncludesMeasurements",
      "checkInIncludesMood",
      "checkInIncludesPhotos",
      "checkInIncludesSleep",
      "checkInIncludesStress",
    ]);
  });

  it("reserved flags are excluded from the sellable set but still resolve", () => {
    for (const k of RESERVED_CLIENT_FLAGS) expect(SELLABLE_CLIENT_FLAG_KEYS).not.toContain(k);
    // Still a real key, so a package that already carries it keeps working —
    // reserving hides a toggle, it never revokes what was sold.
    for (const k of RESERVED_CLIENT_FLAGS) expect(CLIENT_FLAG_KEYS).toContain(k);
    expect(SELLABLE_CLIENT_FLAG_KEYS.length).toBe(CLIENT_FLAG_KEYS.length - RESERVED_CLIENT_FLAGS.length);
  });

  it("featureForClientFlag is the exact inverse of FeatureSpec.clientFlag", () => {
    for (const key of FEATURE_REGISTRY_KEYS) {
      const flag = (FEATURES[key] as FeatureSpec).clientFlag;
      if (flag) expect(featureForClientFlag(flag)).toBe(key);
    }
    for (const k of [...RESERVED_CLIENT_FLAGS, ...FORM_ONLY_CLIENT_FLAGS]) {
      expect(featureForClientFlag(k)).toBeUndefined();
    }
  });

  it("no two features claim the same client flag", () => {
    const seen = new Map<string, string>();
    for (const key of FEATURE_REGISTRY_KEYS) {
      const flag = (FEATURES[key] as FeatureSpec).clientFlag;
      if (!flag) continue;
      expect(seen.get(flag), `${flag} claimed by both ${seen.get(flag)} and ${key}`).toBeUndefined();
      seen.set(flag, key);
    }
  });
});

describe("platform-entitlement coverage", () => {
  it("every LIVE entitlement is reachable through the registry", () => {
    for (const key of FEATURE_KEYS) {
      if (RESERVED_FEATURES.includes(key)) continue;
      expect(featuresForEntitlement(key).length, `entitlement ${key} has no FeatureSpec — nothing can gate on it`).toBeGreaterThan(0);
    }
  });

  it("every RESERVED entitlement is reachable through nothing", () => {
    // This is what makes "reserved features are unenforced by construction" true
    // rather than aspirational: enforcement derives from FEATURES, so a feature
    // no spec names can neither be gated nor let through.
    for (const key of RESERVED_FEATURES) expect(featuresForEntitlement(key)).toEqual([]);
    expect([...RESERVED_FEATURES].sort()).toEqual(["chat", "integrations"]);
  });

  it("frontDesk is fully enforced through ONE spec, used twice", () => {
    // SPEC §5 sells frontDesk as "Assistant role + sessions/booking". This
    // assertion used to be titled "only HALF enforced" and pinned the gap: the
    // sessions half was gated and promotion to `assistant` was an ungated role
    // string. That gap is CLOSED — `@4dl/auth`'s staff routes take a `checkRole`
    // seam and Kova binds it to `gateFeature(c, "sessions")` (staff-routes.ts),
    // so both halves resolve through this one spec.
    //
    // The list stays a single key on purpose: the assistant seat reuses the
    // sessions spec rather than minting a second record for the same
    // entitlement, and a spec per call site is how a registry stops being a
    // registry. `scripts/entitlement-enforcement.test.mjs` is what proves the
    // entitlement is reached at all.
    expect(featuresForEntitlement("frontDesk")).toEqual(["sessions"]);
  });

  it("externalSearch covers the food AND exercise provider fan-outs", () => {
    expect(featuresForEntitlement("externalSearch").sort()).toEqual(["externalExerciseSearch", "externalFoodSearch"]);
  });
});
