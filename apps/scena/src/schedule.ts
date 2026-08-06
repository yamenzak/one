/**
 * Dayparting resolver (BLUEPRINT §13) — pure, testable.
 *
 * Given a set of rules and the wall clock, decide which channel a screen should
 * show *now*, and when the next boundary is (so the ScreenDO can arm an alarm
 * and swap at exactly the right moment instead of polling). Timezone-aware via
 * Intl; no other I/O. `now` is passed in, so this is deterministic under test.
 *
 * Precedence among schedule rules: highest `priority` wins; ties break by array
 * order. The broader precedence chain (emergency > manual > saver > schedule >
 * default) lives in the ScreenDO — this resolver only ranks schedule rules.
 */

export interface DaypartRule {
  id: string;
  /** Higher wins. */
  priority: number;
  /** Days of week this rule applies to (0 = Sunday … 6 = Saturday). */
  days: number[];
  /** Window start, minutes since local midnight [0, 1440). */
  startMin: number;
  /** Window end, minutes since local midnight (1..1440]; must be > startMin. */
  endMin: number;
  channelId: string;
}

export interface DaypartResult {
  /** The channel to show now, or null → fall back to the profile default. */
  channelId: string | null;
  /** Wall-clock ms of the next rule edge (minute-aligned), or null if none. */
  nextBoundaryMs: number | null;
}

const WEEK_MIN = 7 * 24 * 60;

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Local weekday + minute-of-day for a timezone at an instant. */
function localNow(nowMs: number, tz: string): { weekday: number; minOfDay: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(nowMs));
  let weekday = 0;
  let hour = 0;
  let minute = 0;
  for (const p of parts) {
    if (p.type === "weekday") weekday = WEEKDAY_INDEX[p.value] ?? 0;
    else if (p.type === "hour") hour = parseInt(p.value, 10) % 24;
    else if (p.type === "minute") minute = parseInt(p.value, 10);
  }
  return { weekday, minOfDay: hour * 60 + minute };
}

/** The timezone's UTC offset in minutes at an instant (local − UTC; e.g. −240
 *  for US-Eastern in summer). Used to correct a wall-clock boundary projection
 *  across a DST transition. */
function tzOffsetMin(nowMs: number, tz: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(nowMs));
  const g = (t: string) => parseInt(p.find((x) => x.type === t)?.value ?? "0", 10);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second"));
  return Math.round((asUtc - nowMs) / 60000);
}

/** Project `alignedNow + wall-clock minutes` to an epoch, correcting for a DST
 *  transition in the interval (where wall-clock minutes ≠ elapsed real minutes). */
function projectBoundary(alignedNow: number, minDelta: number, tz: string): number {
  const naive = alignedNow + minDelta * 60000;
  const off = tzOffsetMin(naive, tz) - tzOffsetMin(alignedNow, tz);
  return off ? naive - off * 60000 : naive;
}

/** Resolve the active channel + next boundary at `nowMs` in timezone `tz`. */
export function resolveDaypart(rules: readonly DaypartRule[], tz: string, nowMs: number): DaypartResult {
  const { weekday, minOfDay } = localNow(nowMs, tz);
  const minOfWeek = weekday * 1440 + minOfDay;

  // Active channel: highest-priority rule whose window contains now.
  let best: DaypartRule | null = null;
  for (const r of rules) {
    if (!r.days.includes(weekday)) continue;
    if (minOfDay >= r.startMin && minOfDay < r.endMin) {
      if (!best || r.priority > best.priority) best = r;
    }
  }

  // Next boundary: the soonest upcoming rule edge (start or end), across the week.
  let minDelta = Infinity;
  for (const r of rules) {
    for (const d of r.days) {
      for (const edge of [d * 1440 + r.startMin, d * 1440 + r.endMin]) {
        let delta = (edge - minOfWeek) % WEEK_MIN;
        if (delta <= 0) delta += WEEK_MIN; // strictly in the future
        if (delta < minDelta) minDelta = delta;
      }
    }
  }

  const alignedNow = Math.floor(nowMs / 60000) * 60000;
  const nextBoundaryMs = Number.isFinite(minDelta) ? projectBoundary(alignedNow, minDelta, tz) : null;

  return { channelId: best ? best.channelId : null, nextBoundaryMs };
}

/** Result of resolving a boolean "window" track (mute / screensaver). */
export interface WindowResult {
  /** Whether `now` falls inside any window. */
  active: boolean;
  /** Wall-clock ms of the next window edge (minute-aligned), or null if none. */
  nextBoundaryMs: number | null;
}

/**
 * Resolve a boolean daypart track (mute or screensaver): is `now` inside any of
 * the windows, and when is the next edge? Same day/time/tz semantics as
 * `resolveDaypart`, but the payload is on/off rather than a channel — a window
 * means "this track is ON" (muted / screensaver active) during it.
 */
export function resolveWindows(rules: readonly DaypartRule[], tz: string, nowMs: number): WindowResult {
  const { weekday, minOfDay } = localNow(nowMs, tz);
  const minOfWeek = weekday * 1440 + minOfDay;

  // A window with endMin <= startMin wraps past midnight (e.g. 22:00→07:00): its
  // late portion belongs to the selected day, its early portion to the next day.
  let active = false;
  for (const r of rules) {
    const overnight = r.endMin <= r.startMin;
    if (!overnight) {
      if (r.days.includes(weekday) && minOfDay >= r.startMin && minOfDay < r.endMin) { active = true; break; }
    } else {
      const prevDay = (weekday + 6) % 7;
      if ((r.days.includes(weekday) && minOfDay >= r.startMin) || (r.days.includes(prevDay) && minOfDay < r.endMin)) { active = true; break; }
    }
  }

  let minDelta = Infinity;
  for (const r of rules) {
    const overnight = r.endMin <= r.startMin;
    for (const d of r.days) {
      const startEdge = d * 1440 + r.startMin;
      const endEdge = overnight ? ((d + 1) % 7) * 1440 + r.endMin : d * 1440 + r.endMin;
      for (const edge of [startEdge, endEdge]) {
        let delta = (edge - minOfWeek) % WEEK_MIN;
        if (delta <= 0) delta += WEEK_MIN;
        if (delta < minDelta) minDelta = delta;
      }
    }
  }

  const alignedNow = Math.floor(nowMs / 60000) * 60000;
  const nextBoundaryMs = Number.isFinite(minDelta) ? projectBoundary(alignedNow, minDelta, tz) : null;
  return { active, nextBoundaryMs };
}

/** The soonest of several boundary timestamps (nulls ignored), or null. */
export function soonestBoundary(...edges: (number | null)[]): number | null {
  const times = edges.filter((e): e is number => typeof e === "number");
  return times.length ? Math.min(...times) : null;
}
