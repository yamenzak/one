/**
 * THE OPERATOR MUST BE ABLE TO TAKE BACK WHAT THE OPERATOR GAVE.
 *
 * `overrides_json` carried two different promises through one grant-only write
 * path: grandfathering (a plan edited down, existing tenants held at what they
 * were sold — must only ratchet) and an operator's deliberate per-tenant setting
 * (must move in both directions). The second was impossible: `raiseOverride`
 * merges with `max`, `raiseQuota` makes `-1` absorbing, and the only way down
 * was a reset that discarded the grandfathering too.
 *
 * Adjustments are the second promise, given its own layer.
 */

import { describe, expect, it } from "vitest";
import {
  resolveEntitlements,
  mergeOverrides,
  adjustEntitlements,
  setEntitlementAdjustment,
  explainEntitlements,
  raiseOverride,
  snapshotDowngrade,
} from "../src/entitlements.js";

const plan = resolveEntitlements(JSON.stringify({
  quotas: { staffSeats: 5, activeClients: 100, templates: 50, storageMb: 10_000 },
  features: { commerce: true, aiSuite: true, bfCamera: false },
  aiCredits: { monthlyGrant: 6_000 },
}));

describe("the old lane still ratchets — grandfathering must not erode", () => {
  it("a grant can only raise, and a second grant cannot lower the first", () => {
    let ov = raiseOverride(null, { quotas: { staffSeats: 10 } });
    ov = raiseOverride(ov, { quotas: { staffSeats: 2 } });
    expect(mergeOverrides(plan, ov).quotas.staffSeats).toBe(10);
  });

  it("a feature grant cannot be un-granted through the same lane", () => {
    let ov = raiseOverride(null, { features: { bfCamera: true } });
    ov = raiseOverride(ov, { features: { bfCamera: false } });
    expect(mergeOverrides(plan, ov).features.bfCamera).toBe(true);
  });
});

describe("adjustments are absolute, and they go DOWN", () => {
  it("lowers a quota below the plan", () => {
    const adj = setEntitlementAdjustment(null, "quotas", "activeClients", 20);
    expect(adjustEntitlements(plan, adj).quotas.activeClients).toBe(20);
  });

  it("takes back a gift without touching the grandfathering underneath", () => {
    // The tenant was grandfathered to 10 seats by a plan edit…
    const ov = raiseOverride(null, { quotas: { staffSeats: 10 } });
    expect(mergeOverrides(plan, ov).quotas.staffSeats).toBe(10);
    // …an operator sets 6 for support reasons…
    const adj = setEntitlementAdjustment(null, "quotas", "staffSeats", 6);
    expect(adjustEntitlements(mergeOverrides(plan, ov), adj).quotas.staffSeats).toBe(6);
    // …and clearing the adjustment restores the grandfathered 10, not the plan's 5.
    const cleared = setEntitlementAdjustment(adj, "quotas", "staffSeats", null);
    expect(cleared).toBeNull();
    expect(adjustEntitlements(mergeOverrides(plan, ov), cleared).quotas.staffSeats).toBe(10);
  });

  it("REVERSES an unlimited grant, which the old lane could not", () => {
    // `raiseQuota` makes -1 absorbing: once unlimited, always unlimited.
    const ov = raiseOverride(null, { quotas: { activeClients: -1 } });
    expect(mergeOverrides(plan, ov).quotas.activeClients).toBe(-1);
    const adj = setEntitlementAdjustment(null, "quotas", "activeClients", 100);
    expect(adjustEntitlements(mergeOverrides(plan, ov), adj).quotas.activeClients).toBe(100);
  });

  it("turns a feature OFF that the plan turns on", () => {
    const adj = setEntitlementAdjustment(null, "features", "commerce", false);
    expect(adjustEntitlements(plan, adj).features.commerce).toBe(false);
  });

  it("turns one ON that the plan does not carry", () => {
    const adj = setEntitlementAdjustment(null, "features", "bfCamera", true);
    expect(adjustEntitlements(plan, adj).features.bfCamera).toBe(true);
  });

  it("sets the monthly credit grant in either direction", () => {
    expect(adjustEntitlements(plan, setEntitlementAdjustment(null, "aiCredits", "monthlyGrant", 500)).aiCredits.monthlyGrant).toBe(500);
    expect(adjustEntitlements(plan, setEntitlementAdjustment(null, "aiCredits", "monthlyGrant", 99_000)).aiCredits.monthlyGrant).toBe(99_000);
  });

  it("is sparse — an untouched key falls through rather than reading as zero", () => {
    const adj = setEntitlementAdjustment(null, "quotas", "staffSeats", 2);
    const out = adjustEntitlements(plan, adj);
    expect(out.quotas.staffSeats).toBe(2);
    expect(out.quotas.activeClients).toBe(100);
    expect(out.features.commerce).toBe(true);
    expect(out.aiCredits.monthlyGrant).toBe(6_000);
  });

  it("clearing the last key leaves NO blob, so nothing claims the tenant is special", () => {
    let adj = setEntitlementAdjustment(null, "quotas", "staffSeats", 2);
    adj = setEntitlementAdjustment(adj, "features", "commerce", false);
    adj = setEntitlementAdjustment(adj, "quotas", "staffSeats", null);
    expect(adj).not.toBeNull();
    adj = setEntitlementAdjustment(adj, "features", "commerce", null);
    expect(adj).toBeNull();
  });

  it("coerces by type, like every other layer — a typo cannot set a ceiling", () => {
    const junk = JSON.stringify({ quotas: { staffSeats: "9" }, features: { commerce: 1 } });
    const out = adjustEntitlements(plan, junk);
    expect(out.quotas.staffSeats).toBe(5);      // the plan's
    expect(out.features.commerce).toBe(true);   // the plan's
  });

  it("survives malformed JSON without changing anything", () => {
    expect(adjustEntitlements(plan, "{not json")).toEqual(plan);
  });

  it("floors a negative below -1 at unlimited rather than inverting the gate", () => {
    expect(adjustEntitlements(plan, setEntitlementAdjustment(null, "quotas", "templates", -7)).quotas.templates).toBe(-1);
  });
});

describe("explainEntitlements says where each number came from", () => {
  it("distinguishes plan, grandfathered and adjusted", () => {
    const ov = raiseOverride(null, { quotas: { staffSeats: 10 } });
    const adj = setEntitlementAdjustment(null, "quotas", "activeClients", 20);
    const t = explainEntitlements(plan, ov, adj);
    expect(t.quotas.staffSeats).toEqual({ value: 10, plan: 5, source: "grandfathered" });
    expect(t.quotas.activeClients).toEqual({ value: 20, plan: 100, source: "adjusted" });
    expect(t.quotas.templates).toEqual({ value: 50, plan: 50, source: "plan" });
  });

  it("reports an adjustment that happens to MATCH the plan as adjusted, not as plan", () => {
    // It is still a decision somebody made and can clear — reporting it as
    // "plan" would hide the pin and make the reset button look like a no-op.
    const adj = setEntitlementAdjustment(null, "quotas", "templates", 50);
    expect(explainEntitlements(plan, null, adj).quotas.templates!.source).toBe("adjusted");
  });

  it("its effective values are exactly what the layers produce", () => {
    const ov = raiseOverride(null, { features: { bfCamera: true } });
    const adj = setEntitlementAdjustment(null, "features", "commerce", false);
    const t = explainEntitlements(plan, ov, adj);
    expect(t.effective).toEqual(adjustEntitlements(mergeOverrides(plan, ov), adj));
  });

  it("traces a real plan-edit grandfathering end to end", () => {
    const older = resolveEntitlements(JSON.stringify({ quotas: { staffSeats: 20 }, features: { supplementsLabs: true } }));
    const grants = snapshotDowngrade(older, plan);
    const ov = raiseOverride(null, grants);
    const t = explainEntitlements(plan, ov, null);
    expect(t.quotas.staffSeats).toEqual({ value: 20, plan: 5, source: "grandfathered" });
    expect(t.features.supplementsLabs!.source).toBe("grandfathered");
  });
});
