/**
 * Does a package's day budget agree with its capability toggles?
 *
 * The builder sets the two independently, so they can be made to contradict
 * each other in both directions — and the one that costs a client money is the
 * package that SELLS meal days with the meal plan switched off. Nothing in the
 * resolver notices: budget gating only ever turns a flag OFF, so days with no
 * enabled flag behind them are simply days that unlock nothing, tick down on
 * schedule, and can even carry the headline runway (`overallDaysRemaining` is a
 * MAX across scopes).
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLIENT_FLAGS,
  packageContradictions,
  flagsGatedByScope,
  resolveClientFlags,
  explainClientFlags,
  CLIENT_FLAG_META,
} from "../src/clientFlags.js";
import { BUDGET_SCOPES } from "../src/budgets.js";
import { resolveEntitlements } from "../src/entitlements.js";
import type { Budget } from "@4dl/commerce/model";

const NOW = "2026-07-10T12:00:00.000Z";
const inDays = (n: number) => new Date(Date.parse(NOW) + n * 86_400_000).toISOString();
const ent = resolveEntitlements(JSON.stringify({ features: { commerce: true, aiSuite: true, bfCamera: true } }));

describe("which flags a budget scope actually buys", () => {
  it("meal days buy the meal plan and meal-option swaps, and nothing else", () => {
    expect(flagsGatedByScope("meal").sort()).toEqual(["canAccessMealPlan", "canEditMealPlan"]);
  });

  it("workout days buy the training plan, swap requests and the strength report", () => {
    expect(flagsGatedByScope("workout").sort()).toEqual([
      "canAccessWorkoutPlan",
      "canRequestExerciseSwap",
      "canReorderExercises", // reserved — declared, grants nothing, excluded below
      "canViewExerciseReport",
    ].sort());
  });

  it("food logging is NOT budget-gated — a lapsed package still lets a client log", () => {
    expect(CLIENT_FLAG_META.canLogOwnFood.budgetGate).toBeUndefined();
    expect(CLIENT_FLAG_META.canLogSleep.budgetGate).toBeUndefined();
  });
});

describe("packageContradictions", () => {
  const budgets = (...features: string[]) => features.map((feature) => ({ feature }));

  it("THE case: workout AND meal days sold with the meal plan switched off", () => {
    // Both meal-gated flags off ⇒ the meal days buy nothing at all.
    const found = packageContradictions(
      { canAccessMealPlan: false, canEditMealPlan: false },
      budgets("workout", "meal"),
      BUDGET_SCOPES,
    );
    expect(found).toEqual([{ kind: "budget-buys-nothing", scope: "meal", flags: ["canAccessMealPlan", "canEditMealPlan"] }]);
  });

  it("…and the resolver confirms it: the days are live and grant nothing", () => {
    const live: Budget[] = [
      { feature: "workout", daysTotal: 30, startedAt: NOW, expiresAt: inDays(30) },
      { feature: "meal", daysTotal: 30, startedAt: NOW, expiresAt: inDays(30) },
    ];
    const flags = resolveClientFlags({
      packageFlags: { canAccessMealPlan: false, canEditMealPlan: false },
      budgets: live,
      entitlements: ent,
      nowIso: NOW,
    });
    expect(flags.canAccessWorkoutPlan).toBe(true);
    expect(flags.canAccessMealPlan).toBe(false);
    expect(flags.canEditMealPlan).toBe(false);
  });

  it("one meal flag still on is NOT a contradiction — the days buy that one thing", () => {
    expect(packageContradictions({ canAccessMealPlan: false }, budgets("workout", "meal"), BUDGET_SCOPES)).toEqual([]);
  });

  it("the other direction: the meal plan on with no meal days", () => {
    const found = packageContradictions({ canAccessMealPlan: true, canEditMealPlan: false }, budgets("workout"), BUDGET_SCOPES);
    expect(found).toEqual([{ kind: "flag-has-no-days", scope: "meal", flags: ["canAccessMealPlan"] }]);
  });

  it("…and the resolver confirms THAT too: no covering budget forces the flag off", () => {
    const flags = resolveClientFlags({
      packageFlags: { canAccessMealPlan: true },
      budgets: [{ feature: "workout", daysTotal: 30, startedAt: NOW, expiresAt: inDays(30) }],
      entitlements: ent,
      nowIso: NOW,
    });
    expect(flags.canAccessMealPlan).toBe(false);
  });

  it("an `all` budget covers every scope, so it is never reported as missing", () => {
    expect(packageContradictions(null, budgets("all"), BUDGET_SCOPES)).toEqual([]);
  });

  it("a plain workout-only package is coherent and says nothing", () => {
    expect(packageContradictions(
      { canAccessMealPlan: false, canEditMealPlan: false },
      budgets("workout"),
      BUDGET_SCOPES,
    )).toEqual([]);
  });

  it("the default package (no flags set) is coherent for any scope it sells", () => {
    for (const scope of BUDGET_SCOPES) {
      expect(packageContradictions(null, budgets(scope), BUDGET_SCOPES).filter((c) => c.scope === scope && c.kind === "budget-buys-nothing")).toEqual([]);
    }
  });

  it("a reserved flag cannot be what a day buys", () => {
    // `canReorderExercises` is workout-gated AND reserved. With the three real
    // workout flags off it must still report the days as dead — otherwise a
    // toggle that grants nothing would silently justify a whole budget scope.
    const found = packageContradictions(
      // Meal flags off too, so the only thing left to report is the workout scope.
      { canAccessWorkoutPlan: false, canRequestExerciseSwap: false, canViewExerciseReport: false, canReorderExercises: true, canAccessMealPlan: false, canEditMealPlan: false },
      budgets("workout"),
      BUDGET_SCOPES,
    );
    expect(found.map((f) => f.kind)).toEqual(["budget-buys-nothing"]);
    expect(found[0]!.flags).not.toContain("canReorderExercises");
  });

  it("reports both directions at once when a package manages both", () => {
    const found = packageContradictions(
      { canAccessWorkoutPlan: false, canRequestExerciseSwap: false, canViewExerciseReport: false, canAccessMealPlan: true },
      budgets("workout"),
      BUDGET_SCOPES,
    );
    expect(found.map((f) => `${f.kind}:${f.scope}`).sort()).toEqual(["budget-buys-nothing:workout", "flag-has-no-days:meal"]);
  });

  it("is a report, not a resolver — it never changes a flag", () => {
    const before = { ...DEFAULT_CLIENT_FLAGS };
    packageContradictions(before, [{ feature: "meal" }], BUDGET_SCOPES);
    expect(before).toEqual(DEFAULT_CLIENT_FLAGS);
  });
});

/**
 * The OVERRIDE lane: one client, one capability, without minting a package to
 * hold it. What matters is not that it works — it is a fourth `applyPartial`
 * — but that it cannot reach past the two gates underneath it.
 */
describe("per-client overrides", () => {
  const live = (feature: string): Budget => ({ feature, daysTotal: 30, startedAt: NOW, expiresAt: inDays(30) });
  const lapsed = (feature: string): Budget => ({ feature, daysTotal: 30, startedAt: inDays(-60), expiresAt: inDays(-1) });

  it("grants a capability the package left off", () => {
    const e = explainClientFlags({
      packageFlags: { canViewExerciseReport: false },
      overrideFlags: { canViewExerciseReport: true },
      budgets: [live("all")],
      entitlements: ent,
      nowIso: NOW,
    });
    expect(e.canViewExerciseReport.value).toBe(true);
    expect(e.canViewExerciseReport.source).toBe("override");
  });

  it("takes one away that the package included", () => {
    const e = explainClientFlags({
      packageFlags: { canLogOwnFood: true },
      overrideFlags: { canLogOwnFood: false },
      budgets: [live("all")],
      entitlements: ent,
      nowIso: NOW,
    });
    expect(e.canLogOwnFood.value).toBe(false);
    expect(e.canLogOwnFood.source).toBe("override");
  });

  it("CANNOT outrun a lapsed budget", () => {
    const e = explainClientFlags({
      packageFlags: null,
      overrideFlags: { canAccessMealPlan: true },
      budgets: [live("workout"), lapsed("meal")],
      entitlements: ent,
      nowIso: NOW,
    });
    expect(e.canAccessMealPlan.value).toBe(false);
    // The grant is real and the gate is what stopped it — which is the
    // difference between "your coach didn't include this" and "buy more days".
    expect(e.canAccessMealPlan.granted).toBe(true);
    expect(e.canAccessMealPlan.blockedBy).toBe("budget");
  });

  it("CANNOT outrun the studio's own Kova plan", () => {
    const noAi = resolveEntitlements(JSON.stringify({ features: { aiSuite: false } }));
    const e = explainClientFlags({
      packageFlags: null,
      overrideFlags: { canUseAi: true, aiCoachInsights: true },
      budgets: [live("all")],
      entitlements: noAi,
      nowIso: NOW,
    });
    expect(e.canUseAi.value).toBe(false);
    expect(e.canUseAi.blockedBy).toBe("entitlement");
    expect(e.aiCoachInsights.value).toBe(false);
  });

  it("an AI group override still dies with the master switch", () => {
    const e = explainClientFlags({
      packageFlags: { canUseAi: false },
      overrideFlags: { aiMealTools: true },
      budgets: [live("all")],
      entitlements: ent,
      nowIso: NOW,
    });
    expect(e.aiMealTools.value).toBe(false);
    expect(e.aiMealTools.blockedBy).toBe("ai-master");
  });

  it("reports the SOURCE so a screen can say 'from the package' or 'you changed this'", () => {
    const e = explainClientFlags({
      packageFlags: { canLogWater: false },
      overrideFlags: { canTrackFasting: true },
      budgets: [live("all")],
      entitlements: ent,
      nowIso: NOW,
    });
    expect(e.canLogWater.source).toBe("package");
    expect(e.canTrackFasting.source).toBe("override");
    expect(e.canLogSleep.source).toBe("default");
  });

  it("explainClientFlags and resolveClientFlags never disagree", () => {
    // The whole point of the projection: two implementations of "what can this
    // client do" is how a screen comes to promise what a route refuses.
    const input = {
      packageFlags: { canAccessMealPlan: false, canUseAi: true },
      subscriptionFlags: { canLogOwnFood: false },
      overrideFlags: { canViewExerciseReport: false, canTrackFasting: true },
      budgets: [live("workout"), lapsed("meal")],
      entitlements: ent,
      nowIso: NOW,
    };
    const flags = resolveClientFlags(input);
    const explained = explainClientFlags(input);
    for (const key of Object.keys(flags) as (keyof typeof flags)[]) {
      expect(explained[key].value, key).toBe(flags[key]);
    }
  });
});
