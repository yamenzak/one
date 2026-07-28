/**
 * Goal timeline resolution — the read-side of time-correct adherence. A client's
 * whole goal history (active + superseded rows are retained, never deleted)
 * becomes a per-day targets resolver so any chart/metric can grade each logged
 * day against the goal that was actually in force THEN, not whatever goal is
 * active now. One query, reused by progress/report/health. Pure timeline math
 * lives in `@kova/domain` (`resolveGoalTimeline`); this layer just loads rows.
 */

import { resolveGoalTimeline, type GoalPeriod } from "@kova/domain";
import { parseJson } from "./db.js";

export interface GoalTargets {
  targetCalories?: number | null;
  targetProteinG?: number | null;
  targetCarbsG?: number | null;
  targetFatG?: number | null;
  targetFiberG?: number | null;
  targetWaterMl?: number | null;
}

/** Coach-set healthy bands (SPEC §8.11) — the acceptable window for an outcome
 *  metric, used for In-range / Off-track status. Bounds may be open on a side. */
export type MetricRange = { min: number | null; max: number | null };
export interface GoalRanges {
  weightKg?: MetricRange;
  bodyFatPercent?: MetricRange;
}

export interface GoalTimeline {
  /** Targets in force on `date` (local YYYY-MM-DD); null before the first goal. */
  resolve: (date: string) => GoalTargets | null;
  /** The goal active today — the headline for target lines and display. */
  active: GoalTargets;
  /** The active goal's healthy ranges (In-range / Off-track bands). */
  ranges: GoalRanges;
  weeklyLoadTarget: number | null;
  derivation: unknown;
  /** Whether the client has any goal at all. */
  hasGoal: boolean;
}

export async function loadGoalTimeline(db: D1Database, clientId: string): Promise<GoalTimeline> {
  const rows = await db
    .prepare(
      "SELECT status, start_date, created_at, targets_json, ranges_json, weekly_load_target, derivation_json FROM client_goals WHERE client_id = ? ORDER BY created_at DESC LIMIT 40",
    )
    .bind(clientId)
    .all<{ status: string; start_date: string | null; created_at: string; targets_json: string | null; ranges_json: string | null; weekly_load_target: number | null; derivation_json: string | null }>();
  const list = rows.results ?? [];
  const periods: GoalPeriod<GoalTargets>[] = list.map((r) => ({
    start: r.start_date || r.created_at.slice(0, 10),
    createdAt: r.created_at,
    targets: parseJson<GoalTargets>(r.targets_json, {}),
  }));
  const activeRow = list.find((r) => r.status === "active") ?? list[0] ?? null;
  return {
    resolve: resolveGoalTimeline(periods),
    active: parseJson<GoalTargets>(activeRow?.targets_json, {}),
    ranges: parseJson<GoalRanges>(activeRow?.ranges_json, {}),
    weeklyLoadTarget: activeRow?.weekly_load_target ?? null,
    derivation: parseJson(activeRow?.derivation_json, {}),
    hasGoal: list.length > 0,
  };
}

/**
 * A per-day calorie-target function: prefer the frozen per-log snapshot for the
 * day (from `MAX(target_calories)` over that day's food rows), else fall back to
 * the goal timeline. This is what makes historical days stable AND correct.
 */
export function dayCalorieTarget(timeline: GoalTimeline, snapByDay: Map<string, number>) {
  return (date: string): number | null => snapByDay.get(date) ?? timeline.resolve(date)?.targetCalories ?? null;
}

export function dayProteinTarget(timeline: GoalTimeline, snapByDay: Map<string, number>) {
  return (date: string): number | null => snapByDay.get(date) ?? timeline.resolve(date)?.targetProteinG ?? null;
}
