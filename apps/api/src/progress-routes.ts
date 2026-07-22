/**
 * Progress analytics (SPEC §8) — one rich, client-accessible aggregation that
 * powers the Progress page's charts. Groups every tracked signal by the
 * client's local day over a range and returns tidy per-day series plus the
 * derived summaries (deltas, weekly training buckets, a wellness radar, a
 * consistency heatmap, PRs). All math is the pure @mossa/domain functions.
 */

import { Hono } from "hono";
import {
  presetRange,
  daysInRange,
  addDays,
  daysBetween,
  currentStreak,
  longestStreak,
  consistencyPct,
  calorieAdherencePct,
  rangeStatus,
  averageRating,
  wellnessIndex,
  seriesDelta,
  epley1Rm,
  sessionTonnage,
  sessionLoad,
  bodyComposition,
  type LoggedSetLike,
} from "@mossa/domain";
import { type AppEnv } from "./auth-context.js";
import { requireClientAccess } from "./clients.js";
import { parseJson } from "./db.js";
import { loadGoalTimeline, dayCalorieTarget } from "./goals.js";

interface SessionEntry { exerciseId: string; sets: LoggedSetLike[] }

/** Monday (UTC) of the ISO week containing `date`, as YYYY-MM-DD. Pinned to UTC
 *  (not the runtime-local naked parse) so week bucketing is stable off-UTC. */
function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export const progressRoutes = new Hono<AppEnv>().get("/progress/:clientId", async (c) => {
  const access = await requireClientAccess(c, c.req.param("clientId"));
  if ("response" in access) return access.response;
  const range = (c.req.query("range") as "7d" | "30d" | "90d") ?? "30d";
  const today = c.req.query("today") ?? new Date().toISOString().slice(0, 10);
  // Range is either a preset (7d/30d/90d) or an explicit custom window via
  // `start`/`end` (YYYY-MM-DD). A valid custom pair wins; anything malformed
  // falls back to the preset. The window is clamped to today and capped at
  // 366 days so a hand-crafted query can't scan an unbounded history.
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const qStart = c.req.query("start"), qEnd = c.req.query("end");
  let start: string, end: string;
  if (qStart && qEnd && DATE_RE.test(qStart) && DATE_RE.test(qEnd) && qStart <= qEnd) {
    end = qEnd > today ? today : qEnd;
    start = qStart > end ? end : qStart;
    if (daysBetween(start, end) > 366) start = addDays(end, -366);
  } else {
    ({ start, end } = presetRange(range, today));
  }
  const clientId = access.client.id;
  const db = c.env.DB;
  const days = daysInRange(start, end);

  const [measurements, checkIns, foods, sessions, activities, timeline, scans] = await Promise.all([
    db.prepare("SELECT date_local, weight_kg, body_fat_percent, waist_cm, neck_cm, hips_cm, chest_cm FROM measurements WHERE client_id=? AND date_local>=? AND date_local<=? ORDER BY date_local").bind(clientId, start, end).all<{ date_local: string; weight_kg: number | null; body_fat_percent: number | null; waist_cm: number | null; neck_cm: number | null; hips_cm: number | null; chest_cm: number | null }>(),
    db.prepare("SELECT date_local, mood, energy, stress, sleep_quality, sleep_hours FROM check_ins WHERE client_id=? AND date_local>=? AND date_local<=? ORDER BY date_local").bind(clientId, start, end).all<{ date_local: string; mood: number | null; energy: number | null; stress: number | null; sleep_quality: number | null; sleep_hours: number | null }>(),
    db.prepare("SELECT date_local, SUM(calories) AS calories, SUM(protein_g) AS protein, SUM(carbs_g) AS carbs, SUM(fat_g) AS fat, MAX(target_calories) AS day_target_cal FROM food_entries WHERE client_id=? AND date_local>=? AND date_local<=? GROUP BY date_local").bind(clientId, start, end).all<{ date_local: string; calories: number; protein: number; carbs: number; fat: number; day_target_cal: number | null }>(),
    db.prepare("SELECT date_local, entries_json FROM exercise_logs WHERE client_id=? AND date_local>=? AND date_local<=?").bind(clientId, start, end).all<{ date_local: string; entries_json: string | null }>(),
    db.prepare("SELECT date_local, duration_min, calories FROM activity_logs WHERE client_id=? AND date_local>=? AND date_local<=?").bind(clientId, start, end).all<{ date_local: string; duration_min: number | null; calories: number | null }>(),
    loadGoalTimeline(db, clientId),
    db.prepare("SELECT date_local, posture_cva_deg, posture_severity, somatotype FROM body_scans WHERE client_id=? AND date_local>=? AND date_local<=? ORDER BY date_local").bind(clientId, start, end).all<{ date_local: string; posture_cva_deg: number | null; posture_severity: string | null; somatotype: string | null }>(),
  ]);

  const mRows = measurements.results ?? [];
  const sRows = scans.results ?? [];
  const posture = sRows.filter((s) => s.posture_cva_deg != null).map((s) => ({ date: s.date_local, v: s.posture_cva_deg as number }));
  const latestScan = sRows.length ? sRows[sRows.length - 1]! : null;
  const ciRows = checkIns.results ?? [];
  const fRows = foods.results ?? [];
  // Headline targets = the goal active today (drives the "target" display).
  // Per-day adherence resolves the goal that was in force on each logged day.
  const targets = timeline.active as { targetCalories?: number; targetProteinG?: number; targetCarbsG?: number; targetFatG?: number };
  const calTargetSnap = new Map<string, number>();
  for (const r of fRows) if (r.day_target_cal != null) calTargetSnap.set(r.date_local, r.day_target_cal);
  const calTargetForDay = dayCalorieTarget(timeline, calTargetSnap);

  // ── Body composition series + latest + deltas ──
  const pickSeries = <K extends keyof (typeof mRows)[number]>(key: K) =>
    mRows.filter((m) => m[key] != null).map((m) => ({ date: m.date_local, v: m[key] as number }));
  const weight = pickSeries("weight_kg"), bodyFat = pickSeries("body_fat_percent"), waist = pickSeries("waist_cm");
  const chest = pickSeries("chest_cm"), hips = pickSeries("hips_cm");
  const latestOf = <K extends keyof (typeof mRows)[number]>(key: K): number | null => { for (let i = mRows.length - 1; i >= 0; i--) if (mRows[i]![key] != null) return mRows[i]![key] as number; return null; };
  const deltaOf = (s: { v: number }[]) => (s.length >= 2 ? seriesDelta(s.map((p) => p.v)) : null);

  // Derived composition per day (weight + body-fat + height → lean/fat/FFMI).
  const height = access.client.height_cm ?? null;
  const comp = height
    ? mRows.flatMap((m) => {
        if (m.weight_kg == null || m.body_fat_percent == null) return [];
        const bc = bodyComposition(m.weight_kg, m.body_fat_percent, height);
        return bc ? [{ date: m.date_local, lean: bc.leanMassKg, fat: bc.fatMassKg, ffmi: bc.ffmi }] : [];
      })
    : [];
  const leanMass = comp.map((r) => ({ date: r.date, v: r.lean }));
  const fatMass = comp.map((r) => ({ date: r.date, v: r.fat }));
  const ffmi = comp.map((r) => ({ date: r.date, v: r.ffmi }));

  // ── Nutrition per day (over every range day, with a logged flag) ──
  const fByDay = new Map(fRows.map((r) => [r.date_local, r]));
  const calByDay = new Map<string, number>();
  for (const r of fRows) calByDay.set(r.date_local, r.calories ?? 0);
  const nutritionPerDay = days.map((d) => { const r = fByDay.get(d); return { date: d, calories: Math.round(r?.calories ?? 0), protein: Math.round(r?.protein ?? 0), carbs: Math.round(r?.carbs ?? 0), fat: Math.round(r?.fat ?? 0), logged: !!r, target: calTargetForDay(d) }; });

  // ── Training: per-day tonnage/load/sets, weekly buckets, totals, PRs ──
  const trainByDay = new Map<string, { tonnage: number; load: number; sets: number }>();
  const bestByExercise = new Map<string, { e1rm: number; weight: number; reps: number }>();
  let totalTonnage = 0, totalSets = 0;
  const workoutDaySet = new Set<string>();
  for (const s of sessions.results ?? []) {
    const entries = parseJson<SessionEntry[]>(s.entries_json, []);
    const allSets = entries.flatMap((e) => e.sets);
    const doneSets = allSets.filter((x) => x.completed !== false);
    if (doneSets.length === 0) continue;
    workoutDaySet.add(s.date_local);
    const ton = entries.reduce((n, e) => n + sessionTonnage(e.sets), 0);
    const load = sessionLoad({ sets: allSets });
    const cur = trainByDay.get(s.date_local) ?? { tonnage: 0, load: 0, sets: 0 };
    trainByDay.set(s.date_local, { tonnage: cur.tonnage + ton, load: cur.load + load, sets: cur.sets + doneSets.length });
    totalTonnage += ton; totalSets += doneSets.length;
    for (const e of entries) for (const set of e.sets) {
      if (set.weightKg && set.reps && set.completed !== false) {
        const e1 = epley1Rm(set.weightKg, set.reps) ?? 0;
        const b = bestByExercise.get(e.exerciseId);
        if (!b || e1 > b.e1rm) bestByExercise.set(e.exerciseId, { e1rm: e1, weight: set.weightKg, reps: set.reps });
      }
    }
  }
  const trainingPerDay = days.map((d) => ({ date: d, ...(trainByDay.get(d) ?? { tonnage: 0, load: 0, sets: 0 }) }));
  const weekMap = new Map<string, { tonnage: number; load: number; sets: number }>();
  for (const t of trainingPerDay) { const w = weekStart(t.date); const cur = weekMap.get(w) ?? { tonnage: 0, load: 0, sets: 0 }; weekMap.set(w, { tonnage: cur.tonnage + t.tonnage, load: cur.load + t.load, sets: cur.sets + t.sets }); }
  const weekly = [...weekMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, v]) => ({ week, ...v, tonnage: Math.round(v.tonnage), load: Math.round(v.load) }));

  const prIds = [...bestByExercise.keys()];
  const nameById = new Map<string, { name: string; thumb: string | null }>();
  if (prIds.length) {
    const rows = await db.prepare(`SELECT id, name, thumb_url FROM exercises WHERE id IN (${prIds.map(() => "?").join(",")}) AND (tenant_id = ? OR tenant_id IS NULL)`).bind(...prIds, access.client.tenant_id).all<{ id: string; name: string; thumb_url: string | null }>();
    for (const r of rows.results ?? []) nameById.set(r.id, { name: r.name, thumb: r.thumb_url });
  }
  const prs = [...bestByExercise.entries()].map(([id, v]) => ({ exerciseId: id, name: nameById.get(id)?.name ?? "Exercise", thumb: nameById.get(id)?.thumb ?? null, e1rm: Math.round(v.e1rm * 10) / 10, weight: v.weight, reps: v.reps })).sort((a, b) => b.e1rm - a.e1rm).slice(0, 12);

  // ── Wellness: per-day ratings, averages, radar, index ──
  const wellnessPerDay = days.map((d) => { const r = ciRows.find((x) => x.date_local === d); return { date: d, mood: r?.mood ?? null, energy: r?.energy ?? null, stress: r?.stress ?? null, sleepQuality: r?.sleep_quality ?? null, sleepHours: r?.sleep_hours ?? null }; });
  const avgMood = averageRating(ciRows.map((r) => r.mood));
  const avgEnergy = averageRating(ciRows.map((r) => r.energy));
  const avgStress = averageRating(ciRows.map((r) => r.stress));
  const avgSleepQ = averageRating(ciRows.map((r) => r.sleep_quality));
  const sleepH = ciRows.map((r) => r.sleep_hours).filter((h): h is number => h != null);
  const avgSleepHours = sleepH.length ? Math.round((sleepH.reduce((a, b) => a + b, 0) / sleepH.length) * 10) / 10 : null;
  const index = wellnessIndex({ mood: avgMood, energy: avgEnergy, sleepQuality: avgSleepQ, stress: avgStress });

  // ── Consistency: heatmap intensity + streaks ──
  const checkInDays = new Set(ciRows.map((r) => r.date_local));
  const foodDays = new Set(fRows.map((r) => r.date_local));
  const measureDays = new Set(mRows.map((r) => r.date_local));
  const activityDays = new Set((activities.results ?? []).map((r) => r.date_local));
  const heatmap: Record<string, number> = {};
  for (const d of days) {
    let n = 0;
    if (checkInDays.has(d)) n++;
    if (workoutDaySet.has(d)) n++;
    if (foodDays.has(d)) n++;
    if (activityDays.has(d)) n++;
    if (measureDays.has(d)) n++;
    if (n) heatmap[d] = n;
  }
  const weekFlags: boolean[] = [];
  const mon = new Date(`${today}T00:00:00`); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  for (let i = 0; i < 7; i++) { const dd = new Date(mon); dd.setDate(mon.getDate() + i); weekFlags.push(checkInDays.has(dd.toISOString().slice(0, 10))); }

  const radarNorm = (v: number | null, max = 5) => (v == null ? 0 : Math.max(0, Math.min(1, v / max)));
  // Healthy-range status (SPEC §8.11): the coach-set band the metric should sit
  // in, compared against the latest value shown.
  const latestWeight = latestOf("weight_kg");
  const wRange = timeline.ranges.weightKg;
  const weightStatus = latestWeight != null && wRange ? rangeStatus(latestWeight, wRange.min, wRange.max) : null;
  return c.json({
    range: { start, end, days },
    today,
    body: {
      weight, bodyFat, waist, chest, hips, posture, leanMass, fatMass, ffmi,
      ranges: timeline.ranges,
      latest: {
        weightKg: latestWeight, bodyFatPct: latestOf("body_fat_percent"), waistCm: latestOf("waist_cm"),
        neckCm: latestOf("neck_cm"), hipsCm: latestOf("hips_cm"), chestCm: latestOf("chest_cm"),
        leanMassKg: leanMass.at(-1)?.v ?? null, fatMassKg: fatMass.at(-1)?.v ?? null, ffmi: ffmi.at(-1)?.v ?? null,
        somatotype: latestScan?.somatotype ?? null, postureSeverity: latestScan?.posture_severity ?? null, postureCva: latestScan?.posture_cva_deg ?? null,
        weightStatus,
      },
      deltas: { weight: deltaOf(weight), bodyFat: deltaOf(bodyFat), waist: deltaOf(waist), chest: deltaOf(chest), hips: deltaOf(hips) },
    },
    nutrition: { perDay: nutritionPerDay, targets, adherencePct: calorieAdherencePct(calByDay, calTargetForDay), loggedDays: foodDays.size },
    training: { perDay: trainingPerDay, weekly, totalTonnage: Math.round(totalTonnage), totalSets, workoutDays: workoutDaySet.size, prs },
    wellness: {
      perDay: wellnessPerDay,
      averages: { mood: avgMood, energy: avgEnergy, stress: avgStress, sleepQuality: avgSleepQ, sleepHours: avgSleepHours },
      radar: { mood: radarNorm(avgMood), energy: radarNorm(avgEnergy), sleep: radarNorm(avgSleepQ) || radarNorm(avgSleepHours, 8), calm: avgStress != null ? Math.max(0, Math.min(1, (5 - avgStress) / 4)) : 0, consistency: consistencyPct(checkInDays, start, end) / 100 },
      index,
    },
    consistency: { heatmap, checkInDays: checkInDays.size, streak: currentStreak(checkInDays, today), longestStreak: longestStreak(checkInDays), consistencyPct: consistencyPct(checkInDays, start, end), weekFlags },
  });
});
