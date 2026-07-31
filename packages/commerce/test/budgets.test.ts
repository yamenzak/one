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
