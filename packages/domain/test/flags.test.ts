import { describe, expect, it } from "vitest";
import { FREE_ENTITLEMENTS, mergeOverrides, resolveEntitlements, checkDowngrade, RESERVED_FEATURES, FEATURE_KEYS } from "../src/entitlements.js";
import { DEFAULT_CLIENT_FLAGS, resolveClientFlags, unionClientFlags, CLIENT_FLAG_META, CLIENT_FLAG_KEYS } from "../src/clientFlags.js";
import { grantSatisfies, resolvePermissions, sanitizePermissions, ROLE_PRESETS } from "../src/perms.js";
import type { Budget } from "@4dl/commerce/model";

const NOW = "2026-07-10T12:00:00.000Z";
const days = (n: number) => new Date(Date.parse(NOW) + n * 86_400_000).toISOString();

const paidEnt = resolveEntitlements(
  JSON.stringify({
    quotas: { staffSeats: 4, activeClients: 100, templates: -1, storageMb: 25_000 },
    features: { commerce: true, aiSuite: true, bfCamera: true, supplementsLabs: true, frontDesk: true, branding: true },
    aiCredits: { monthlyGrant: 2500 },
  }),
);

describe("entitlements", () => {
  it("resolves onto the free baseline; bad json = free", () => {
    expect(resolveEntitlements(null)).toEqual(FREE_ENTITLEMENTS);
    expect(resolveEntitlements("{nope")).toEqual(FREE_ENTITLEMENTS);
    expect(paidEnt.features.aiSuite).toBe(true);
    expect(paidEnt.features.integrations).toBe(false); // inherited from baseline
  });

  it("per-tenant overrides layer on top", () => {
    const gifted = mergeOverrides(FREE_ENTITLEMENTS, JSON.stringify({ aiCredits: { monthlyGrant: 500 } }));
    expect(gifted.aiCredits.monthlyGrant).toBe(500);
    expect(gifted.quotas.activeClients).toBe(3);
  });

  it("downgrade is compliance-gated with -1 = unlimited", () => {
    const usage = { staffSeats: 3, activeClients: 50, templates: 80, storageMb: 100, activeCommerceSubs: 2 };
    const r = checkDowngrade(usage, FREE_ENTITLEMENTS);
    expect(r.eligible).toBe(false);
    expect(r.violations.some((v) => v.type === "feature" && v.resource === "commerce")).toBe(true);
    const rUnlimited = checkDowngrade({ ...usage, activeCommerceSubs: 0, staffSeats: 1, activeClients: 2, storageMb: 10, templates: 80 }, {
      ...FREE_ENTITLEMENTS,
      quotas: { ...FREE_ENTITLEMENTS.quotas, templates: -1 },
    });
    expect(rUnlimited.eligible).toBe(true);
  });
});

describe("client flags resolver", () => {
  it("defaults are permissive except fasting", () => {
    const f = resolveClientFlags({ entitlements: paidEnt, nowIso: NOW });
    expect(f.canLogOwnFood).toBe(true);
    expect(f.canTrackFasting).toBe(false);
  });

  it("budget gating forces workout/meal flags off when lapsed", () => {
    const lapsedWorkout: Budget[] = [
      { feature: "workout", daysTotal: 30, startedAt: days(-40), expiresAt: days(-10) },
      { feature: "meal", daysTotal: 30, startedAt: days(-10), expiresAt: days(20) },
    ];
    const f = resolveClientFlags({ entitlements: paidEnt, budgets: lapsedWorkout, nowIso: NOW });
    expect(f.canRequestExerciseSwap).toBe(false);
    expect(f.canViewExerciseReport).toBe(false);
    expect(f.canEditMealPlan).toBe(true); // meal budget alive
  });

  it("budget gating is derived from CLIENT_FLAG_META.budgetGate (no hardcoded lists)", () => {
    // Every flag META-tagged budgetGate is forced off when that budget lapses;
    // untagged flags are never budget-gated.
    const noBudgets: Budget[] = []; // has a subscription context, all lapsed
    const f = resolveClientFlags({ entitlements: paidEnt, budgets: noBudgets, nowIso: NOW });
    for (const key of CLIENT_FLAG_KEYS) {
      if (CLIENT_FLAG_META[key].budgetGate) expect(f[key], `${key} should gate off`).toBe(false);
    }
    // A flag with no budgetGate (e.g. canLogOwnFood) survives an empty budget set.
    expect(CLIENT_FLAG_META.canLogOwnFood.budgetGate).toBeUndefined();
    expect(f.canLogOwnFood).toBe(true);
  });

  it("reserved features are exactly the unenforced roadmap flags", () => {
    expect([...RESERVED_FEATURES].sort()).toEqual(["chat", "integrations"]);
    for (const k of RESERVED_FEATURES) expect(FEATURE_KEYS).toContain(k);
  });

  it("tenant entitlements are the outer bound (no aiSuite -> no client AI)", () => {
    const f = resolveClientFlags({ entitlements: FREE_ENTITLEMENTS, nowIso: NOW });
    expect(f.canUseAi).toBe(false);
  });

  it("subscription overrides beat package defaults", () => {
    const f = resolveClientFlags({
      packageFlags: { canLogOwnFood: false },
      subscriptionFlags: { canLogOwnFood: true },
      entitlements: paidEnt,
      nowIso: NOW,
    });
    expect(f.canLogOwnFood).toBe(true);
    // Unknown keys are ignored, defaults intact elsewhere.
    expect(f.showMacroBreakdown).toBe(DEFAULT_CLIENT_FLAGS.showMacroBreakdown);
  });

  it("plan-access follows the budget: workout-only package hides the meal plan", () => {
    // A workout-only package = a workout budget, no meal budget.
    const workoutOnly: Budget[] = [{ feature: "workout", daysTotal: 30, startedAt: days(-5), expiresAt: days(25) }];
    const f = resolveClientFlags({ entitlements: paidEnt, budgets: workoutOnly, nowIso: NOW });
    expect(f.canAccessWorkoutPlan).toBe(true);
    expect(f.canAccessMealPlan).toBe(false); // no meal budget → gated off
    // ...and the mirror: a meal-only package.
    const mealOnly: Budget[] = [{ feature: "meal", daysTotal: 30, startedAt: days(-5), expiresAt: days(25) }];
    const g = resolveClientFlags({ entitlements: paidEnt, budgets: mealOnly, nowIso: NOW });
    expect(g.canAccessMealPlan).toBe(true);
    expect(g.canAccessWorkoutPlan).toBe(false);
  });

  it("AI groups are decomposable and bounded by the master + aiSuite", () => {
    // No aiSuite → master off → every AI group off.
    const none = resolveClientFlags({ entitlements: FREE_ENTITLEMENTS, nowIso: NOW });
    expect(none.canUseAi).toBe(false);
    expect(none.aiMealTools).toBe(false);
    expect(none.aiCoachInsights).toBe(false);
    // aiSuite on, but a package sells food tools only (insights off).
    const foodOnly = resolveClientFlags({ packageFlags: { aiCoachInsights: false }, entitlements: paidEnt, nowIso: NOW });
    expect(foodOnly.aiMealTools).toBe(true);
    expect(foodOnly.aiCoachInsights).toBe(false);
    // Master kill cascades to the groups even if a group was set true.
    const masterOff = resolveClientFlags({ packageFlags: { canUseAi: false, aiMealTools: true }, entitlements: paidEnt, nowIso: NOW });
    expect(masterOff.aiMealTools).toBe(false);
  });
});

describe("client flags union (stacked packages)", () => {
  const live: Budget[] = [{ feature: "all", daysTotal: 30, startedAt: days(-5), expiresAt: days(25) }];
  const workoutOnly: Budget[] = [{ feature: "workout", daysTotal: 30, startedAt: days(-1), expiresAt: days(29) }];

  it("a capability from ANY live package survives (the newest row can't revoke it)", () => {
    // Membership: sells the fasting timer (default-off, so it can only come from
    // a package) on a full-access budget.
    const membership = resolveClientFlags({ packageFlags: { canTrackFasting: true }, budgets: live, entitlements: paidEnt, nowIso: NOW });
    // A one-time workout package bought later: no fasting, no meal budget.
    const oneTime = resolveClientFlags({ packageFlags: { canTrackFasting: false }, budgets: workoutOnly, entitlements: paidEnt, nowIso: NOW });
    expect(oneTime.canTrackFasting).toBe(false);
    expect(oneTime.canAccessMealPlan).toBe(false);

    const both = [membership, oneTime].reduce(unionClientFlags);
    expect(both.canTrackFasting).toBe(true); // union, not "newest row wins"
    expect(both.canAccessMealPlan).toBe(true); // the membership's meal coverage holds
    expect(both.canAccessWorkoutPlan).toBe(true);
  });

  it("is order-independent and never widens the entitlement bound", () => {
    // Free plan → no aiSuite; a package that claims AI still can't grant it, and
    // the union of two such rows can't either.
    const a = resolveClientFlags({ packageFlags: { canUseAi: true, aiMealTools: true }, budgets: live, entitlements: FREE_ENTITLEMENTS, nowIso: NOW });
    const b = resolveClientFlags({ packageFlags: { aiCoachInsights: true }, budgets: live, entitlements: FREE_ENTITLEMENTS, nowIso: NOW });
    expect(unionClientFlags(a, b)).toEqual(unionClientFlags(b, a));
    const u = unionClientFlags(a, b);
    expect([u.canUseAi, u.aiMealTools, u.aiCoachInsights]).toEqual([false, false, false]);
  });

  it("unioning one set with itself is a no-op (idempotent)", () => {
    const one = resolveClientFlags({ packageFlags: { showMacroBreakdown: false }, budgets: workoutOnly, entitlements: paidEnt, nowIso: NOW });
    expect(unionClientFlags(one, one)).toEqual(one);
  });
});

describe("permissions", () => {
  it("role presets: trainer can publish plans, client cannot", () => {
    expect(grantSatisfies(ROLE_PRESETS.trainer!, { plan: ["publish"] })).toBe(true);
    expect(grantSatisfies(ROLE_PRESETS.client!, { plan: ["publish"] })).toBe(false);
    expect(grantSatisfies(ROLE_PRESETS.owner!, { billing: ["manage"] })).toBe(true);
    expect(grantSatisfies(ROLE_PRESETS.trainer!, { billing: ["read"] })).toBe(false);
  });

  it("custom grants sanitize to the catalog and beat role presets", () => {
    const g = sanitizePermissions({ billing: ["read", "hack"], bogus: ["x"] });
    expect(g).toEqual({ billing: ["read"] });
    const effective = resolvePermissions("trainer", JSON.stringify({ client: ["read"] }));
    expect(grantSatisfies(effective, { plan: ["update"] })).toBe(false); // custom grant replaced preset
  });

  it("falls back to client preset on junk", () => {
    const effective = resolvePermissions("nonsense", "{broken");
    expect(effective).toEqual(ROLE_PRESETS.client);
  });
});
