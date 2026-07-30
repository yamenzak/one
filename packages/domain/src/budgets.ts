/**
 * Kova's budget SCOPES, over `@4dl/commerce`'s access-economy math.
 *
 * The arithmetic — queue-don't-sum, derive days from `expiresAt` at read time,
 * expand a wildcard purchase into per-scope runways — is product-agnostic and
 * lives in `@4dl/commerce` `budgets.ts`. What is Kova's is WHAT is being sold:
 * a workout plan, a meal plan, or both.
 *
 * `@4dl/commerce` deliberately holds no scope list. It needs the concrete one in
 * exactly one place — expanding a wildcard — so `buildBudgetsForPurchase` is
 * re-bound here rather than making nine call sites pass it.
 */

import { buildBudgetsForPurchase as build, type Budget, type BudgetFeature, type PackageBudgetSpec } from "@4dl/commerce/model";

export * from "@4dl/commerce/model";

/** The scopes Kova sells timed access to, plus the wildcard that covers them. */
export const BUDGET_FEATURES = ["workout", "meal", "all"] as const;

/** The concrete scopes an `all` purchase expands into — wildcard excluded. */
export const BUDGET_SCOPES: readonly BudgetFeature[] = ["workout", "meal"];

/**
 * Budgets created by purchasing a package, each queued behind ITS OWN runway.
 *
 * The per-scope expansion is what stops an `all` purchase stranding a scope the
 * buyer just paid for: a single queued `all` budget starts behind the LONGEST
 * existing runway, so with a meal budget running to day 40 and no workout
 * budget, workout would stay uncovered until day 40.
 */
export const buildBudgetsForPurchase = (
  existing: Budget[],
  specs: PackageBudgetSpec[],
  nowIso: string,
): Budget[] => build(existing, specs, nowIso, BUDGET_SCOPES);
