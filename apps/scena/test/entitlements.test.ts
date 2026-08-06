import { describe, it, expect } from "vitest";
import {
  resolveEntitlements,
  mergeOverrides,
  clampForStatus,
  checkDowngrade,
  FREE_ENTITLEMENTS,
  INVERTED_QUOTAS,
  type Usage,
} from "../src/entitlements.js";
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

/**
 * THE THREE RULES `@4dl/billing`'s ENGINE BROUGHT, none of which was true before.
 *
 * The old resolver was `{ ...free, ...raw }` in both directions. Each of these
 * asserts a specific thing that spread could not do.
 */
describe("the engine's rules", () => {
  it("enables a feature only on a literal `true`", () => {
    // An operator typo in plan JSON must not switch on a paid capability. Every
    // one of these is truthy in JavaScript.
    for (const bad of [1, "true", "yes", {}, []]) {
      const e = resolveEntitlements(JSON.stringify({ features: { aiGeneration: bad } }));
      expect(e.features.aiGeneration, `${JSON.stringify(bad)} enabled a paid feature`).toBe(false);
    }
    expect(resolveEntitlements(JSON.stringify({ features: { aiGeneration: true } })).features.aiGeneration).toBe(true);
  });

  it("takes a quota only from a finite number", () => {
    for (const bad of ["9", null, {}, Infinity, NaN]) {
      const e = resolveEntitlements(JSON.stringify({ quotas: { pairedDevices: bad } }));
      expect(e.quotas.pairedDevices, `${JSON.stringify(bad)} became a quota`).toBe(
        FREE_ENTITLEMENTS.quotas.pairedDevices,
      );
    }
  });

  it("IGNORES a key that is not in the baseline", () => {
    // The free tier is the key registry. A plan blob naming something that does
    // not exist cannot invent it.
    const e = resolveEntitlements(JSON.stringify({ features: { timeTravel: true }, quotas: { moons: 4 } }));
    expect((e.features as unknown as Record<string, unknown>).timeTravel).toBeUndefined();
    expect((e.quotas as unknown as Record<string, unknown>).moons).toBeUndefined();
  });

  it("makes an override GRANT-ONLY — a gift can never take", () => {
    const base = resolveEntitlements(JSON.stringify({ quotas: { pairedDevices: 15 }, features: { ads: true } }));
    const spiteful = mergeOverrides(base, JSON.stringify({ quotas: { pairedDevices: 2 }, features: { ads: false } }));
    // The old `mergeOverrides` was a spread, so both of these took capability
    // away — and a plan edit could bite a tenant through their own blob.
    expect(spiteful.quotas.pairedDevices).toBe(15);
    expect(spiteful.features.ads).toBe(true);
  });

  it("CLAMPS a suspended tenant to the free baseline", () => {
    const pro = resolveEntitlements(JSON.stringify(plan("pro").entitlements));
    expect(pro.features.aiGeneration).toBe(true);
    const clamped = clampForStatus(pro, "suspended");
    expect(clamped.features.aiGeneration).toBe(false);
    expect(clamped.quotas.pairedDevices).toBe(FREE_ENTITLEMENTS.quotas.pairedDevices);
  });

  it("keeps the EMERGENCY OVERRIDE through the clamp", () => {
    /*
      The one capability that must survive every rung. Scena's screens carry
      fire, evacuation and incident messages, so this is true in the BASELINE
      rather than merely on every plan — clamping to free must not be the thing
      that takes it away.
    */
    const clamped = clampForStatus(resolveEntitlements(JSON.stringify(plan("business").entitlements)), "suspended");
    expect(clamped.features.emergencyOverride).toBe(true);
  });

  it("leaves an ACTIVE tenant alone", () => {
    const pro = resolveEntitlements(JSON.stringify(plan("pro").entitlements));
    expect(clampForStatus(pro, "active")).toEqual(pro);
    expect(clampForStatus(pro, "trialing")).toEqual(pro);
  });
});

describe("the flattened features", () => {
  it("has no list-valued feature left", () => {
    // Four were `string[]`. The engine coerces a feature to a boolean, so a list
    // would resolve to `false` on every plan — silently disabling the tiered
    // feature it was describing.
    for (const [k, v] of Object.entries(FREE_ENTITLEMENTS.features)) {
      expect(typeof v, `features.${k} is not a boolean`).toBe("boolean");
    }
  });

  it("keeps the tiers each list was carrying", () => {
    const free = resolveEntitlements(JSON.stringify(plan("free").entitlements));
    const starter = resolveEntitlements(JSON.stringify(plan("starter").entitlements));
    const pro = resolveEntitlements(JSON.stringify(plan("pro").entitlements));

    // ticker was the only list with TWO real bits: none → basic → advanced.
    expect([free.features.ticker, free.features.tickerAdvanced]).toEqual([false, false]);
    expect([starter.features.ticker, starter.features.tickerAdvanced]).toEqual([true, false]);
    expect([pro.features.ticker, pro.features.tickerAdvanced]).toEqual([true, true]);

    // The other three carried one bit each, and it lands on the same tier.
    expect(free.features.clockAnalog).toBe(false);
    expect(pro.features.clockAnalog).toBe(true);
    expect(starter.features.weather).toBe(false);
    expect(pro.features.weather).toBe(true);
    expect(starter.features.alertsWebhook).toBe(false);
    expect(pro.features.alertsWebhook).toBe(true);
  });

  it("sells the custom domain on the top tier and nowhere else", () => {
    for (const id of ["free", "starter", "pro"]) {
      expect(plan(id).entitlements.features.customDomain, id).toBe(false);
    }
    expect(plan("business").entitlements.features.customDomain).toBe(true);
  });
});

describe("the two quotas where a bigger number is WORSE", () => {
  it("names exactly the ones that are floors on an interval", () => {
    /*
      Pinned so a third cannot be added without reading the note in
      entitlements.ts. Every other quota is a ceiling on a count, and the
      engine's grant-only override (`max`) is right for those and wrong for
      these — raising a minimum interval makes a tenant's feeds slower, which is
      a gift that degrades the thing it is gifting.
    */
    expect([...INVERTED_QUOTAS].sort()).toEqual(["feedRefreshMinSec", "resyncIntervalSec"]);
    for (const k of INVERTED_QUOTAS) {
      expect(FREE_ENTITLEMENTS.quotas, `${k} is not a quota`).toHaveProperty(k);
    }
  });

  it("still varies resyncIntervalSec per plan, now that it is a quota", () => {
    // It lived in a `sync: {}` block of its own. The engine does not merge an
    // unknown top-level axis, so leaving it there would have frozen every plan
    // on the free tier's 60 seconds — silently.
    expect(resolveEntitlements(JSON.stringify(plan("free").entitlements)).quotas.resyncIntervalSec).toBe(60);
    expect(resolveEntitlements(JSON.stringify(plan("business").entitlements)).quotas.resyncIntervalSec).toBe(10);
  });
});

describe("downgrade against an UNLIMITED target", () => {
  it("does not demand you delete everything", () => {
    /*
      `have > max` with `max === -1` reported a violation for every existing row,
      so moving TO a plan with an unlimited quota would have been refused with a
      checklist telling the owner to remove all of it. No plan sets `-1` on one
      of the six checked quotas today, which is the only reason it never fired.
    */
    const usage: Usage = { pairedDevices: 40, channels: 12, feeds: 9, scheduleRules: 3, liveBoards: 2, stations: 5 };
    const unlimited = resolveEntitlements(
      JSON.stringify({
        quotas: { pairedDevices: -1, profiles: -1, channelsPerProfile: -1, feeds: -1, scheduleRules: -1, liveBoards: -1, stations: -1 },
        features: { roomQueueManagement: true },
      }),
    );
    expect(checkDowngrade(usage, unlimited)).toEqual({ eligible: true, violations: [] });
  });
});
