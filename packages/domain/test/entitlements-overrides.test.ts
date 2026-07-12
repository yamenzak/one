import { describe, expect, it } from "vitest";
import {
  FREE_ENTITLEMENTS, resolveEntitlements, mergeOverrides, snapshotDowngrade, raiseOverride, raiseQuota,
  FEATURE_KEYS, QUOTA_KEYS, type Entitlements, type Quotas, type Features,
} from "../src/entitlements.js";

const plan = (over: { quotas?: Partial<Quotas>; features?: Partial<Features>; aiCredits?: { monthlyGrant: number } }): Entitlements => ({
  quotas: { ...FREE_ENTITLEMENTS.quotas, ...(over.quotas ?? {}) },
  features: { ...FREE_ENTITLEMENTS.features, ...(over.features ?? {}) },
  aiCredits: { ...FREE_ENTITLEMENTS.aiCredits, ...(over.aiCredits ?? {}) },
});

describe("grant-only overrides", () => {
  it("raiseQuota keeps unlimited and takes the max, never lowers", () => {
    expect(raiseQuota(5, 10)).toBe(10);
    expect(raiseQuota(10, 5)).toBe(10); // override can't lower
    expect(raiseQuota(-1, 5)).toBe(-1); // unlimited wins
    expect(raiseQuota(5, -1)).toBe(-1); // override to unlimited
  });

  it("an override can enable a feature but never disable one", () => {
    const base = plan({ features: { aiSuite: true } });
    // Try to DISABLE aiSuite and enable branding via override.
    const merged = mergeOverrides(base, JSON.stringify({ features: { aiSuite: false, branding: true } }));
    expect(merged.features.aiSuite).toBe(true); // disable ignored
    expect(merged.features.branding).toBe(true); // enable honored
  });

  it("an override can raise a limit but never lower it", () => {
    const base = plan({ quotas: { activeClients: 100 } });
    const merged = mergeOverrides(base, JSON.stringify({ quotas: { activeClients: 50 } }));
    expect(merged.quotas.activeClients).toBe(100); // lower ignored
    const gifted = mergeOverrides(base, JSON.stringify({ quotas: { activeClients: 250 } }));
    expect(gifted.quotas.activeClients).toBe(250); // raise honored
  });

  it("credits grant takes the max", () => {
    const base = plan({ aiCredits: { monthlyGrant: 500 } });
    expect(mergeOverrides(base, JSON.stringify({ aiCredits: { monthlyGrant: 100 } })).aiCredits.monthlyGrant).toBe(500);
    expect(mergeOverrides(base, JSON.stringify({ aiCredits: { monthlyGrant: 9000 } })).aiCredits.monthlyGrant).toBe(9000);
  });
});

describe("grandfather on plan downgrade", () => {
  it("snapshots only the fields that got worse, at their old value", () => {
    const oldE = plan({ quotas: { activeClients: 100, staffSeats: 4 }, features: { branding: true, aiSuite: true }, aiCredits: { monthlyGrant: 2500 } });
    const newE = plan({ quotas: { activeClients: 50, staffSeats: 4 }, features: { branding: false, aiSuite: true }, aiCredits: { monthlyGrant: 2500 } });
    const snap = snapshotDowngrade(oldE, newE);
    expect(snap.quotas?.activeClients).toBe(100); // lowered → preserved
    expect(snap.quotas?.staffSeats).toBeUndefined(); // unchanged → not snapshotted
    expect(snap.features?.branding).toBe(true); // disabled → preserved
    expect(snap.features?.aiSuite).toBeUndefined(); // still on → not snapshotted
    expect(snap.aiCredits).toBeUndefined(); // grant unchanged
  });

  it("end-to-end: lowering a plan limit doesn't reduce a grandfathered tenant", () => {
    const oldPlan = plan({ quotas: { activeClients: 100 }, features: { branding: true } });
    const newPlan = plan({ quotas: { activeClients: 25 }, features: { branding: false } });
    const snap = snapshotDowngrade(oldPlan, newPlan);
    const tenantOverride = raiseOverride(null, snap); // grandfather this tenant
    // Now the tenant resolves against the NEW (lower) plan + their override.
    const eff = mergeOverrides(newPlan, tenantOverride);
    expect(eff.quotas.activeClients).toBe(100); // kept the old ceiling
    expect(eff.features.branding).toBe(true); // kept the feature
    // A brand-new tenant on the new plan gets the lower limits.
    expect(mergeOverrides(newPlan, null).quotas.activeClients).toBe(25);
    expect(mergeOverrides(newPlan, null).features.branding).toBe(false);
  });

  it("raiseOverride never lowers an existing gift", () => {
    const existing = JSON.stringify({ quotas: { activeClients: 300 }, features: { chat: true }, aiCredits: { monthlyGrant: 5000 } });
    const merged = raiseOverride(existing, { quotas: { activeClients: 100 }, aiCredits: { monthlyGrant: 1000 } });
    const parsed = JSON.parse(merged) as { quotas: { activeClients: number }; features: { chat: boolean }; aiCredits: { monthlyGrant: number } };
    expect(parsed.quotas.activeClients).toBe(300); // kept the higher gift
    expect(parsed.features.chat).toBe(true);
    expect(parsed.aiCredits.monthlyGrant).toBe(5000);
  });
});

describe("self-discovery keys", () => {
  it("exposes every feature + quota key from the baseline", () => {
    expect(FEATURE_KEYS).toContain("aiSuite");
    expect(FEATURE_KEYS.length).toBe(Object.keys(FREE_ENTITLEMENTS.features).length);
    expect(QUOTA_KEYS).toContain("activeClients");
    // resolveEntitlements always fills every key, so the admin UI can render them all.
    const e = resolveEntitlements(JSON.stringify({ features: { aiSuite: true } }));
    expect(Object.keys(e.features).sort()).toEqual([...FEATURE_KEYS].sort());
  });
});
