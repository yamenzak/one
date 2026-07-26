import { describe, expect, it } from "vitest";
import {
  FREE_ENTITLEMENTS, resolveEntitlements, mergeOverrides, snapshotDowngrade, raiseOverride, raiseQuota,
  clampEntitlementsForStatus, SUSPENDED_STATUSES, trialPeriodDays,
  FEATURE_KEYS, QUOTA_KEYS, type Entitlements, type Quotas, type Features,
} from "../src/entitlements.js";

const plan = (over: { quotas?: Partial<Quotas>; features?: Partial<Features>; aiCredits?: { monthlyGrant: number }; trialDays?: number }): Entitlements => ({
  quotas: { ...FREE_ENTITLEMENTS.quotas, ...(over.quotas ?? {}) },
  features: { ...FREE_ENTITLEMENTS.features, ...(over.features ?? {}) },
  aiCredits: { ...FREE_ENTITLEMENTS.aiCredits, ...(over.aiCredits ?? {}) },
  trialDays: over.trialDays ?? FREE_ENTITLEMENTS.trialDays,
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

describe("status clamp (delinquency teeth + client passthrough)", () => {
  const paid = plan({ features: { aiSuite: true, commerce: true, branding: true }, quotas: { activeClients: 100 }, aiCredits: { monthlyGrant: 2500 } });

  it("keeps full entitlements while active / trialing / past_due (grace)", () => {
    for (const s of ["active", "trialing", "past_due"]) {
      const e = clampEntitlementsForStatus(paid, s);
      expect(e.features.aiSuite, s).toBe(true);
      expect(e.features.commerce, s).toBe(true);
      expect(e.quotas.activeClients, s).toBe(100);
    }
  });

  it("clamps to free when suspended / canceled / unpaid", () => {
    for (const s of ["suspended", "canceled", "unpaid"]) {
      const e = clampEntitlementsForStatus(paid, s);
      expect(e, s).toEqual(FREE_ENTITLEMENTS);
      expect(e.features.aiSuite, s).toBe(false);
      expect(e.features.commerce, s).toBe(false);
      expect(e.aiCredits.monthlyGrant, s).toBe(0);
    }
  });

  it("SUSPENDED_STATUSES is exactly the suspending set (past_due excluded)", () => {
    expect([...SUSPENDED_STATUSES].sort()).toEqual(["canceled", "suspended", "unpaid"]);
    expect(SUSPENDED_STATUSES.has("past_due")).toBe(false);
    expect(SUSPENDED_STATUSES.has("active")).toBe(false);
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

// ── Free trials (SPEC §5) ─────────────────────────────────────────────────────
// `trialDays` rides in `entitlements_json` rather than a `plans` column, so it
// has to survive the same coercion discipline as everything else in the blob:
// fail closed on junk, never overridable, never invented.

describe("plan trial days", () => {
  it("resolves a trial off the blob and defaults to none", () => {
    expect(resolveEntitlements(JSON.stringify({ trialDays: 30 })).trialDays).toBe(30);
    expect(resolveEntitlements(JSON.stringify({ quotas: { activeClients: 5 } })).trialDays).toBe(0);
    expect(resolveEntitlements(null).trialDays).toBe(0);
    expect(FREE_ENTITLEMENTS.trialDays).toBe(0);
  });

  it("fails closed on junk — a typo can never hand out an unbounded trial", () => {
    for (const bad of ['"30"', "true", "null", "-5", "NaN", "{}"]) {
      expect(resolveEntitlements(`{"trialDays":${bad}}`).trialDays, bad).toBe(0);
    }
    // Fractional days are floored, not rounded up.
    expect(resolveEntitlements('{"trialDays":30.9}').trialDays).toBe(30);
  });

  it("trialPeriodDays returns null for no trial so Stripe's param is OMITTED", () => {
    // Stripe rejects trial_period_days=0; the caller must leave it out entirely.
    expect(trialPeriodDays({ trialDays: 0 })).toBeNull();
    expect(trialPeriodDays({ trialDays: -1 })).toBeNull();
    expect(trialPeriodDays({ trialDays: 30 })).toBe(30);
    expect(trialPeriodDays({ trialDays: 14.7 })).toBe(14);
    // Clamped to Stripe's ceiling so an admin typo can't produce a 400.
    expect(trialPeriodDays({ trialDays: 99_999 })).toBe(730);
  });

  it("is NOT overridable per tenant — a gift can't extend a trial", () => {
    const withTrial = plan({ trialDays: 30 });
    expect(mergeOverrides(withTrial, JSON.stringify({ trialDays: 365 })).trialDays).toBe(30);
    expect(mergeOverrides(plan({}), JSON.stringify({ trialDays: 90 })).trialDays).toBe(0);
    // …and it is not a capability, so lowering it never grandfathers anyone.
    expect(snapshotDowngrade(withTrial, plan({}))).toEqual({});
  });
});
