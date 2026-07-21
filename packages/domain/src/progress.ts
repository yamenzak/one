/**
 * Progress aggregates (SPEC §8.7) — pure, string-date (YYYY-MM-DD), tz-agnostic.
 * The caller buckets rows to the client's local day BEFORE calling in.
 */

const DAY_MS = 86_400_000;

export function addDays(dateLocal: string, days: number): string {
  const d = new Date(Date.parse(dateLocal) + days * DAY_MS);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
}

export function daysInRange(startLocal: string, endLocal: string): string[] {
  const out: string[] = [];
  for (let d = startLocal; d <= endLocal; d = addDays(d, 1)) out.push(d);
  return out;
}

export type RangePreset = "7d" | "30d" | "90d";

export function presetRange(preset: RangePreset, todayLocal: string): { start: string; end: string } {
  const back = preset === "7d" ? 6 : preset === "30d" ? 29 : 89;
  return { start: addDays(todayLocal, -back), end: todayLocal };
}

/**
 * Current streak of consecutive logged days ending today — with a ONE-DAY
 * GRACE: if today has no log yet, the streak counts from yesterday instead of
 * resetting to zero (ByShujaa parity).
 */
export function currentStreak(loggedDays: Set<string>, todayLocal: string): number {
  let cursor = loggedDays.has(todayLocal) ? todayLocal : addDays(todayLocal, -1);
  let streak = 0;
  while (loggedDays.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function longestStreak(loggedDays: Set<string>): number {
  let best = 0;
  for (const day of loggedDays) {
    // Only count from streak starts (previous day absent).
    if (loggedDays.has(addDays(day, -1))) continue;
    let len = 0;
    let cursor = day;
    while (loggedDays.has(cursor)) {
      len++;
      cursor = addDays(cursor, 1);
    }
    if (len > best) best = len;
  }
  return best;
}

export function consistencyPct(loggedDays: Set<string>, start: string, end: string): number {
  const range = daysInRange(start, end);
  if (range.length === 0) return 0;
  const logged = range.filter((d) => loggedDays.has(d)).length;
  return Math.round((logged / range.length) * 100);
}

/**
 * A goal's targets with the day it took effect — the atom of the goal timeline.
 * `start` is the goal's effective local day (YYYY-MM-DD); `createdAt` (ISO)
 * tie-breaks two goals that started the same day (the later-created wins).
 */
export interface GoalPeriod<T = Record<string, number>> {
  start: string;
  createdAt: string;
  targets: T | null;
}

/**
 * Build a per-day target resolver from a client's *whole* goal history so
 * adherence grades each day against the goal that was actually in force THEN —
 * not whatever goal happens to be active now. Each goal is effective from its
 * start day until the next goal begins; the most recent goal starting on or
 * before `date` wins. Days before the first goal resolve to `null` (ungraded).
 */
export function resolveGoalTimeline<T>(goals: GoalPeriod<T>[]): (date: string) => T | null {
  const sorted = [...goals].sort((a, b) =>
    a.start !== b.start ? a.start.localeCompare(b.start) : a.createdAt.localeCompare(b.createdAt),
  );
  return (date: string) => {
    let picked: T | null = null;
    for (const g of sorted) {
      if (g.start <= date) picked = g.targets;
      else break;
    }
    return picked;
  };
}

/** A per-day calorie target: a fixed number, or a resolver keyed by local day. */
export type CalorieTarget = number | null | undefined | ((date: string) => number | null | undefined);

/**
 * Calorie adherence: % of LOGGED days within ±10% of target. Null when no
 * logged day has a target. `target` may be a single number (legacy) or a
 * per-day resolver — a day with no target for it (before any goal existed) is
 * simply not graded rather than counted as a miss.
 */
export function calorieAdherencePct(
  dailyCalories: Map<string, number>,
  target: CalorieTarget,
): number | null {
  const resolve = typeof target === "function" ? target : () => target;
  let graded = 0;
  let within = 0;
  for (const [date, cal] of dailyCalories) {
    if (!(cal > 0)) continue;
    const t = resolve(date);
    if (!t || t <= 0) continue;
    graded++;
    if (Math.abs(cal - t) <= t * 0.1) within++;
  }
  if (graded === 0) return null;
  return Math.round((within / graded) * 100);
}

/** Mean of 1-5 ratings, 1dp; null when empty. */
export function averageRating(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => x != null && x >= 1 && x <= 5);
  if (v.length === 0) return null;
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10;
}

/**
 * Wellness index: (mood + energy + sleepQuality)/3 − (stress − 3)·0.25,
 * clamped 1..5. Null unless all four are present.
 */
export function wellnessIndex(input: {
  mood?: number | null;
  energy?: number | null;
  sleepQuality?: number | null;
  stress?: number | null;
}): number | null {
  const { mood, energy, sleepQuality, stress } = input;
  if (mood == null || energy == null || sleepQuality == null || stress == null) return null;
  const raw = (mood + energy + sleepQuality) / 3 - (stress - 3) * 0.25;
  return Math.round(Math.min(5, Math.max(1, raw)) * 100) / 100;
}

export interface SeriesDelta {
  first: number;
  last: number;
  delta: number;
  pct: number | null;
}

/** First→last delta over a sorted series; null with fewer than 2 points. */
export function seriesDelta(values: number[]): SeriesDelta | null {
  if (values.length < 2) return null;
  const first = values[0]!;
  const last = values[values.length - 1]!;
  const delta = Math.round((last - first) * 10) / 10;
  const pct = first !== 0 ? Math.round((delta / Math.abs(first)) * 1000) / 10 : null;
  return { first, last, delta, pct };
}

export interface GoalProgress {
  pct: number;
  delta: number;
  remaining: number;
  direction: "down" | "up";
}

/** Progress from start→target, clamped 0..100. */
export function goalProgress(current: number, start: number, target: number): GoalProgress | null {
  if (start === target) return null;
  const direction: GoalProgress["direction"] = target < start ? "down" : "up";
  const pct = Math.round(Math.min(1, Math.max(0, (current - start) / (target - start))) * 100);
  return {
    pct,
    delta: Math.round((current - start) * 10) / 10,
    remaining: Math.round((target - current) * 10) / 10,
    direction,
  };
}

/**
 * Metric ranges → status (SPEC §8.11): trainer-set healthy band per metric.
 * `null` bound = unbounded on that side.
 */
export type RangeStatus = "in_range" | "below" | "above";

export function rangeStatus(
  value: number,
  min: number | null | undefined,
  max: number | null | undefined,
): RangeStatus {
  if (min != null && value < min) return "below";
  if (max != null && value > max) return "above";
  return "in_range";
}
