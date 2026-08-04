import { describe, expect, it } from "vitest";
import {
  buildBudgetsForPurchase,
  buildRedemptionBudget,
  computeBudgetStart,
  daysRemainingForFeature,
  hasActiveBudget,
  isFullyExpired,
  latestExpiryForFeature,
  mergeAddOnBalances,
  overallDaysRemaining,
  remainingAddOnQuantity,
  daysByFeature,
  setRemainingDays,
  type Budget,
} from "../src/budgets.js";

const NOW = "2026-07-10T12:00:00.000Z";
const days = (n: number, from = NOW) => new Date(Date.parse(from) + n * 86_400_000).toISOString();

const budget = (feature: Budget["feature"], startOffset: number, endOffset: number): Budget => ({
  feature,
  daysTotal: endOffset - startOffset,
  startedAt: days(startOffset),
  expiresAt: days(endOffset),
});

describe("access economy budgets", () => {
  it("derives days remaining from expiresAt, never a counter", () => {
    const b = [budget("workout", -10, 20)];
    expect(daysRemainingForFeature(b, "workout", NOW)).toBe(20);
    expect(daysRemainingForFeature(b, "meal", NOW)).toBe(0);
  });

  it("an `all` budget covers every feature", () => {
    const b = [budget("all", 0, 30)];
    expect(hasActiveBudget(b, "workout", days(1))).toBe(true);
    expect(hasActiveBudget(b, "meal", days(1))).toBe(true);
    expect(overallDaysRemaining(b, NOW)).toBe(30);
  });

  it("queued (future) budgets count toward runway but are not active yet", () => {
    const b = [budget("meal", -5, 5), budget("meal", 5, 35)];
    expect(hasActiveBudget(b, "meal", NOW)).toBe(true);
    expect(latestExpiryForFeature(b, "meal", NOW)).toBe(days(35));
    expect(daysRemainingForFeature(b, "meal", NOW)).toBe(35);
  });

  it("repeat purchases QUEUE at the existing expiry, never sum from now", () => {
    const existing = [budget("workout", -10, 20)];
    expect(computeBudgetStart(existing, "workout", NOW)).toBe(days(20));
    const purchased = buildBudgetsForPurchase(existing, [{ feature: "workout", days: 30 }], NOW);
    expect(purchased).toHaveLength(1);
    expect(purchased[0]!.startedAt).toBe(days(20));
    expect(purchased[0]!.expiresAt).toBe(days(50));
  });

  it("an `all` purchase queues behind every existing budget", () => {
    const existing = [budget("workout", -10, 20), budget("meal", -10, 40)];
    expect(computeBudgetStart(existing, "all", NOW)).toBe(days(40));
  });

  it("two same-feature budgets in one package queue behind each other", () => {
    const purchased = buildBudgetsForPurchase(
      [],
      [
        { feature: "meal", days: 10 },
        { feature: "meal", days: 10 },
      ],
      NOW,
    );
    expect(purchased[0]!.expiresAt).toBe(days(10));
    expect(purchased[1]!.startedAt).toBe(days(10));
    expect(purchased[1]!.expiresAt).toBe(days(20));
  });

  it("fully-expired detection drives the lazy reconcile", () => {
    expect(isFullyExpired([budget("workout", -30, -1)], NOW)).toBe(true);
    expect(isFullyExpired([budget("workout", -30, 1)], NOW)).toBe(false);
    expect(isFullyExpired([], NOW)).toBe(true);
  });

  it("redemption codes extend the runway end", () => {
    const existing = [budget("meal", -5, 15)];
    const r = buildRedemptionBudget(existing, "meal", 7, NOW);
    expect(r.startedAt).toBe(days(15));
    expect(r.expiresAt).toBe(days(22));
  });

  it("add-on balances merge by type and never lose usage", () => {
    const merged = mergeAddOnBalances(
      [{ addOnTypeId: "consult", quantityTotal: 4, quantityUsed: 3 }],
      [{ addOnTypeId: "consult", quantity: 4 }],
    );
    expect(remainingAddOnQuantity(merged, "consult")).toBe(5);
    expect(remainingAddOnQuantity(merged, "unknown")).toBe(0);
  });
});


const SCOPES = ["workout", "meal"] as const;

describe("the correction primitive — setRemainingDays", () => {
  it("sets a scope to exactly the days asked for", () => {
    const out = setRemainingDays([budget("workout", -10, 200)], "workout", 30, NOW, SCOPES);
    expect(daysRemainingForFeature(out, "workout", NOW)).toBe(30);
  });

  it("collapses a stack of queued budgets into one runway", () => {
    // The shape the once-per-customer defect produced: the same package applied
    // four times, each queued behind the last.
    const stacked = [budget("workout", -5, 30), budget("workout", 30, 60), budget("workout", 60, 90), budget("workout", 90, 120)];
    expect(daysRemainingForFeature(stacked, "workout", NOW)).toBe(120);
    const out = setRemainingDays(stacked, "workout", 30, NOW, SCOPES);
    expect(daysRemainingForFeature(out, "workout", NOW)).toBe(30);
    expect(out.filter((b) => b.feature === "workout" && Date.parse(b.expiresAt) > Date.parse(NOW))).toHaveLength(1);
  });

  it("leaves LAPSED budgets alone — they are the record of what was sold", () => {
    const history = budget("workout", -60, -30);
    const out = setRemainingDays([history, budget("workout", -5, 200)], "workout", 10, NOW, SCOPES);
    expect(out).toContainEqual(history);
  });

  it("does not touch another scope", () => {
    const meal = budget("meal", -5, 45);
    const out = setRemainingDays([meal, budget("workout", -5, 200)], "workout", 10, NOW, SCOPES);
    expect(daysRemainingForFeature(out, "meal", NOW)).toBe(45);
    expect(out).toContainEqual(meal);
  });

  it("zero removes the live runway rather than minting an expired budget", () => {
    const out = setRemainingDays([budget("workout", -5, 200)], "workout", 0, NOW, SCOPES);
    expect(daysRemainingForFeature(out, "workout", NOW)).toBe(0);
    expect(out.some((b) => b.feature === "workout" && Date.parse(b.expiresAt) > Date.parse(NOW))).toBe(false);
  });

  it("splits a legacy wildcard budget so correcting one scope never revokes the other", () => {
    // A single `all` budget predates per-scope expansion. Setting `workout` to 5
    // must not silently take `meal`'s 100 days away with it.
    const out = setRemainingDays([budget("all", -5, 100)], "workout", 5, NOW, SCOPES);
    expect(daysRemainingForFeature(out, "workout", NOW)).toBe(5);
    expect(daysRemainingForFeature(out, "meal", NOW)).toBe(100);
  });

  it("a correction is the START of the next purchase's queue, not behind the old runway", () => {
    const corrected = setRemainingDays([budget("workout", -5, 200)], "workout", 10, NOW, SCOPES);
    const next = buildBudgetsForPurchase(corrected, [{ feature: "workout", days: 30 }], NOW, SCOPES);
    // 10 corrected days, then 30 purchased = 40. Not 230.
    expect(daysRemainingForFeature([...corrected, ...next], "workout", NOW)).toBe(40);
  });

  it("floors a fractional or negative request instead of minting a broken budget", () => {
    expect(daysRemainingForFeature(setRemainingDays([], "workout", -5, NOW, SCOPES), "workout", NOW)).toBe(0);
    expect(daysRemainingForFeature(setRemainingDays([], "workout", 7.9, NOW, SCOPES), "workout", NOW)).toBe(7);
  });
});

describe("the headline hides a lapsed scope, so the breakdown ships with it", () => {
  it("reports each scope on its own", () => {
    const b = [budget("workout", -5, 70), budget("meal", -30, -1)];
    expect(overallDaysRemaining(b, NOW)).toBe(70);
    expect(daysByFeature(b, SCOPES, NOW)).toEqual({ workout: 70, meal: 0 });
  });
});
