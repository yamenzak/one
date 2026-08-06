import { describe, it, expect } from "vitest";
import { resolveEntitlements, mergeOverrides, checkDowngrade, FREE_ENTITLEMENTS, type Usage } from "../src/entitlements.js";
import { DEFAULT_PLANS } from "../src/billing-seed.js";

const plan = (id: string) => DEFAULT_PLANS.find((p) => p.id === id)!;

describe("entitlements resolution", () => {
  it("unknown/empty blob resolves to the restrictive free baseline", () => {
    expect(resolveEntitlements(null)).toEqual(FREE_ENTITLEMENTS);
    expect(resolveEntitlements("not json")).toEqual(FREE_ENTITLEMENTS);
  });

  it("a partial blob merges onto the baseline (missing keys keep defaults)", () => {
    const e = resolveEntitlements(JSON.stringify({ quotas: { pairedDevices: 9 } }));
    expect(e.quotas.pairedDevices).toBe(9);
    expect(e.quotas.slidesPerPlaylist).toBe(FREE_ENTITLEMENTS.quotas.slidesPerPlaylist);
    expect(e.features.emergencyOverride).toBe(true);
  });

  it("seed plans widen quotas and unlock features by tier", () => {
    expect(plan("pro").entitlements.quotas.pairedDevices).toBe(15);
    expect(plan("pro").entitlements.features.roomQueueManagement).toBe(true);
    expect(plan("starter").entitlements.features.roomQueueManagement).toBe(false);
    expect(plan("pro").entitlements.aiCredits.monthlyGrant).toBe(1000);
  });
});

describe("per-tenant overrides (§25 gifts)", () => {
  const base = resolveEntitlements(JSON.stringify(plan("starter").entitlements));

  it("null/empty overrides leave the plan untouched", () => {
    expect(mergeOverrides(base, null)).toEqual(base);
    expect(mergeOverrides(base, "nonsense")).toEqual(base);
  });

  it("gifts extra screens without touching other quotas", () => {
    const e = mergeOverrides(base, JSON.stringify({ quotas: { pairedDevices: base.quotas.pairedDevices + 5 } }));
    expect(e.quotas.pairedDevices).toBe(base.quotas.pairedDevices + 5);
    expect(e.quotas.feeds).toBe(base.quotas.feeds);
  });

  it("unlocks a feature and bumps the credit grant", () => {
    const e = mergeOverrides(base, JSON.stringify({ features: { ads: true }, aiCredits: { monthlyGrant: 9999 } }));
    expect(e.features.ads).toBe(true);
    expect(e.aiCredits.monthlyGrant).toBe(9999);
    expect(e.features.dayparting).toBe(base.features.dayparting);
  });
});

describe("downgrade eligibility (§25)", () => {
  const proToStarter = (usage: Usage) => checkDowngrade(usage, plan("starter").entitlements);

  it("compliant usage is eligible with no violations", () => {
    const r = proToStarter({ pairedDevices: 2, channels: 2, feeds: 1, scheduleRules: 3, liveBoards: 0, stations: 0 });
    expect(r.eligible).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  it("over-quota devices produce a quota violation with an exact removeCount", () => {
    const r = proToStarter({ pairedDevices: 7, channels: 2, feeds: 1, scheduleRules: 3, liveBoards: 0, stations: 0 });
    expect(r.eligible).toBe(false);
    const dev = r.violations.find((v) => v.type === "quota" && v.resource === "pairedDevices");
    expect(dev).toMatchObject({ have: 7, max: 3, removeCount: 4 });
  });

  it("using a gated module (boards) blocks the downgrade with a feature violation", () => {
    const r = proToStarter({ pairedDevices: 2, channels: 2, feeds: 1, scheduleRules: 3, liveBoards: 2, stations: 2 });
    expect(r.eligible).toBe(false);
    expect(r.violations.some((v) => v.type === "feature" && v.resource === "roomQueueManagement")).toBe(true);
    // Starter allows 0 boards → also a quota violation.
    expect(r.violations.some((v) => v.type === "quota" && v.resource === "liveBoards")).toBe(true);
  });
});
