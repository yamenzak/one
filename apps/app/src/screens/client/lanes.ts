/**
 * WHICH PLAN IS "THE" PLAN — the lane rule, in one place.
 *
 * A client runs ONE published plan **per lane** ("Work week" vs "Off week",
 * "Night shift" vs "Morning shift"). So "the published plan" is not a question
 * a plan list can answer on its own: it needs the lane the client is currently
 * on, which `/api/workout-plans` and `/api/meal-plans` return beside the plans
 * as `currentVariantId`.
 *
 * ── Why this is a module and not three lines at each call site ───────────────
 *
 * Because it was three lines at each call site, and four of them forgot the
 * lane. `Eat` and `Train` filtered correctly; the surfaces they OPEN did not —
 * `MealPlanDrawer`, `TodayAgenda`, `WorkoutPlayer` and `PlanHistorySheet` each
 * did `plans.find((p) => p.status === "published")` and took whichever plan the
 * server happened to return first.
 *
 * The symptom is the worst kind: with three lanes each holding a published
 * plan, the summary card names the right plan and the drawer you open from it
 * shows a DIFFERENT lane's meals. Nothing errors, nothing is empty, and every
 * lane looks like the first one. A coach reads that as the app losing their
 * work.
 *
 * `lanes.conformance.test.ts` makes a bare `status === "published"` in these
 * screens a test failure, because the next person to add a plan surface will
 * write those three lines too.
 */

/** A plan, as far as the lane rule is concerned. */
export interface LanedPlan {
  status: string;
  /** `null` / absent is the DEFAULT lane — the single-plan case, unchanged. */
  variantId?: string | null;
}

/** The lane a plan belongs to. Absent and `null` are the same lane. */
export const laneOf = (p: LanedPlan): string | null => p.variantId ?? null;

/**
 * The one plan a client is running right now: published, in the lane they are
 * on. `null` when this lane has nothing published — which is a real state and
 * must read as "no plan in this lane", never as another lane's plan.
 */
export function publishedInLane<T extends LanedPlan>(plans: readonly T[], lane: string | null): T | null {
  return plans.find((p) => p.status === "published" && laneOf(p) === (lane ?? null)) ?? null;
}

/**
 * This lane's history. A superseded plan from another lane is not this lane's
 * past — it is another plan that is still current somewhere else, and listing
 * it under "Past plans" invites a client to compare against a plan they were
 * never on.
 */
export function supersededInLane<T extends LanedPlan>(plans: readonly T[], lane: string | null): T[] {
  return plans.filter((p) => p.status === "superseded" && laneOf(p) === (lane ?? null));
}
