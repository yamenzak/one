/**
 * Workout math (SPEC §8.3, §8.11) — pure.
 *
 * - Epley e1RM + PR detection primitives.
 * - Training Load: per-session score from tonnage/effort/MET-minutes, summed
 *   weekly against a trainer-set target (the "213 of 360" ring).
 * - Plans are recommendations, not calendar locks: `recommendNextDay` picks
 *   the stalest incomplete day; `pickPlanForDate` resolves which plan was
 *   active on a date (logs-first resolution happens in the route layer).
 */

import type { LoggedSetLike } from "./activity.js";

/** Epley estimated 1-rep max. Reps of 1 returns the weight itself. */
export function epley1Rm(weightKg: number, reps: number): number | null {
  if (!(weightKg > 0) || !(reps > 0)) return null;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

export interface ExerciseBests {
  prWeightKg: number | null;
  prReps: number | null;
  prDurationSeconds: number | null;
  bestE1Rm: number | null;
}

/** Fold a set into running bests; returns which PR kinds this set broke. */
export function detectPrs(
  bests: ExerciseBests,
  set: LoggedSetLike,
): { bests: ExerciseBests; broke: ("weight" | "reps" | "duration")[] } {
  const broke: ("weight" | "reps" | "duration")[] = [];
  const next = { ...bests };
  if (set.weightKg && set.weightKg > 0 && (next.prWeightKg === null || set.weightKg > next.prWeightKg)) {
    next.prWeightKg = set.weightKg;
    broke.push("weight");
  }
  if (set.reps && set.reps > 0 && (next.prReps === null || set.reps > next.prReps)) {
    next.prReps = set.reps;
    broke.push("reps");
  }
  if (
    set.durationSeconds &&
    set.durationSeconds > 0 &&
    (next.prDurationSeconds === null || set.durationSeconds > next.prDurationSeconds)
  ) {
    next.prDurationSeconds = set.durationSeconds;
    broke.push("duration");
  }
  if (set.weightKg && set.reps) {
    const e = epley1Rm(set.weightKg, set.reps);
    if (e !== null && (next.bestE1Rm === null || e > next.bestE1Rm)) next.bestE1Rm = e;
  }
  return { bests: next, broke };
}

/** Session tonnage: Σ reps × kg over completed sets. */
export function sessionTonnage(sets: LoggedSetLike[]): number {
  let t = 0;
  for (const s of sets) {
    if (s.completed === false) continue;
    if (s.reps && s.weightKg) t += s.reps * s.weightKg;
  }
  return Math.round(t);
}

const EFFORT_FACTOR: Record<string, number> = { easy: 0.8, perfect: 1.0, hard: 1.25 };

/**
 * Training Load (SPEC §8.11): one comparable number per session.
 *
 *   resistance: Σ over completed sets of (workMinutes × effortFactor × 10)
 *     where workMinutes = duration ?? reps×3s, effort from label/RPE.
 *   cardio/free-form: MET-minutes / 10 (so a 30-min MET-7 run ≈ 21 load).
 *
 * Both paths land in the same ballpark so mixed weeks sum sensibly. Weekly
 * target is trainer-set (default 300).
 */
export function sessionLoad(input: {
  sets?: LoggedSetLike[];
  cardio?: { met: number; durationMin: number }[];
}): number {
  let load = 0;
  for (const s of input.sets ?? []) {
    if (s.completed === false) continue;
    const workSec = s.durationSeconds && s.durationSeconds > 0 ? s.durationSeconds : (s.reps ?? 0) * 3;
    if (workSec <= 0) continue;
    const effort =
      (s.effortLabel && EFFORT_FACTOR[s.effortLabel]) ??
      (s.rpe != null ? (s.rpe <= 6 ? 0.8 : s.rpe >= 9 ? 1.25 : 1.0) : 1.0);
    load += (workSec / 60) * effort * 10;
  }
  for (const c of input.cardio ?? []) {
    if (c.met > 0 && c.durationMin > 0) load += (c.met * c.durationMin) / 10;
  }
  return Math.round(load);
}

export const DEFAULT_WEEKLY_LOAD_TARGET = 300;

/** Minimal shape of a plan day for scheduling. */
export interface PlanDayLike {
  isRestDay?: boolean | null;
  /** Total prescribed sets on the day (0 = nothing to do). */
  prescribedSets: number;
}

export interface DayLogSummary {
  /** ISO local date (YYYY-MM-DD) of the most recent session on this day index. */
  lastLoggedDate: string | null;
  /** Sets logged on the most recent date. */
  loggedSetsOnLastDate: number;
}

/**
 * Recommend the next plan day (SPEC §8.3): in-progress-today wins, else the
 * stalest active day (longest since fully completed; never-done counts as
 * infinitely stale, ties broken by day order).
 */
export function recommendNextDay(
  days: PlanDayLike[],
  logsByDay: (DayLogSummary | null)[],
  todayLocal: string,
): number | null {
  let candidate: { index: number; staleness: number } | null = null;
  for (let i = 0; i < days.length; i++) {
    const day = days[i]!;
    if (day.isRestDay || day.prescribedSets <= 0) continue;
    const log = logsByDay[i] ?? null;

    // A day partially logged today = in progress; resume it immediately.
    if (log?.lastLoggedDate === todayLocal && log.loggedSetsOnLastDate < day.prescribedSets) {
      return i;
    }
    // Fully completed today -> not a candidate (rotate elsewhere).
    if (log?.lastLoggedDate === todayLocal && log.loggedSetsOnLastDate >= day.prescribedSets) {
      continue;
    }
    const staleness = log?.lastLoggedDate
      ? Date.parse(todayLocal) - Date.parse(log.lastLoggedDate)
      : Number.POSITIVE_INFINITY;
    if (!candidate || staleness > candidate.staleness) candidate = { index: i, staleness };
  }
  return candidate?.index ?? null;
}

/** Minimal plan shape for date resolution. */
export interface PlanLike {
  id: string;
  status: "draft" | "published" | "superseded" | "archived";
  publishedAt: string | null;
}

/**
 * Which plan was active on `dateIso`? The plan with the largest
 * publishedAt <= end-of-date among published/superseded (superseded plans
 * count for their historical window). Falls back to the currently-published
 * plan when no dated match.
 */
export function pickPlanForDate<T extends PlanLike>(plans: T[], dateIso?: string | null): T | null {
  const eligible = plans.filter(
    (p) => (p.status === "published" || p.status === "superseded") && p.publishedAt,
  );
  if (eligible.length === 0) return null;
  if (dateIso) {
    const endOfDay = Date.parse(dateIso) + 86_400_000 - 1;
    let best: T | null = null;
    for (const p of eligible) {
      const pub = Date.parse(p.publishedAt!);
      if (pub <= endOfDay && (!best || pub > Date.parse(best.publishedAt!))) best = p;
    }
    if (best) return best;
  }
  return eligible.find((p) => p.status === "published") ?? null;
}
