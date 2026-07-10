/**
 * Reports (SPEC §8.7, §8.11) — the trainer per-client report and the
 * roster-level Retention Radar (at-risk clients by engagement heuristics).
 * All aggregate math is the pure @mossa/domain functions; this layer just
 * gathers rows and buckets them by the client's local day.
 */

import { Hono } from "hono";
import {
  calorieAdherencePct,
  consistencyPct,
  currentStreak,
  epley1Rm,
  presetRange,
  sessionTonnage,
  type LoggedSetLike,
} from "@mossa/domain";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { requireClientAccess, visibleClientIds } from "./clients.js";
import { parseJson } from "./db.js";

interface SessionEntry {
  exerciseId: string;
  sets: LoggedSetLike[];
}

export const reportRoutes = new Hono<AppEnv>()
  .get("/reports/client/:clientId", async (c) => {
    const access = await requireClientAccess(c, c.req.param("clientId"));
    if ("response" in access) return access.response;
    const range = (c.req.query("range") as "7d" | "30d" | "90d") ?? "30d";
    // "today" comes from the caller's tz; fall back to server date.
    const today = c.req.query("today") ?? new Date().toISOString().slice(0, 10);
    const { start, end } = presetRange(range, today);
    const clientId = access.client.id;
    const db = c.env.DB;

    const [checkIns, foods, sessions, measurements, goal] = await Promise.all([
      db.prepare("SELECT date_local, mood, sleep_hours, weight_kg FROM check_ins WHERE client_id = ? AND date_local >= ? AND date_local <= ?").bind(clientId, start, end).all<{ date_local: string; mood: number | null; sleep_hours: number | null; weight_kg: number | null }>(),
      db.prepare("SELECT date_local, calories FROM food_entries WHERE client_id = ? AND date_local >= ? AND date_local <= ?").bind(clientId, start, end).all<{ date_local: string; calories: number }>(),
      db.prepare("SELECT date_local, entries_json FROM exercise_logs WHERE client_id = ? AND date_local >= ? AND date_local <= ?").bind(clientId, start, end).all<{ date_local: string; entries_json: string | null }>(),
      db.prepare("SELECT date_local, weight_kg, body_fat_percent FROM measurements WHERE client_id = ? AND date_local >= ? AND date_local <= ? ORDER BY date_local").bind(clientId, start, end).all<{ date_local: string; weight_kg: number | null; body_fat_percent: number | null }>(),
      db.prepare("SELECT targets_json FROM client_goals WHERE client_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").bind(clientId).first<{ targets_json: string | null }>(),
    ]);

    const checkInDays = new Set((checkIns.results ?? []).map((r) => r.date_local));
    const foodByDay = new Map<string, number>();
    for (const f of foods.results ?? []) foodByDay.set(f.date_local, (foodByDay.get(f.date_local) ?? 0) + f.calories);
    const workoutDays = new Set((sessions.results ?? []).map((r) => r.date_local));

    // PR table (top by Epley e1RM) + weekly tonnage.
    const bestByExercise = new Map<string, { e1rm: number; weight: number; reps: number }>();
    let totalTonnage = 0;
    for (const s of sessions.results ?? []) {
      const entries = parseJson<SessionEntry[]>(s.entries_json, []);
      for (const e of entries) {
        totalTonnage += sessionTonnage(e.sets);
        for (const set of e.sets) {
          if (set.weightKg && set.reps && set.completed !== false) {
            const e1 = epley1Rm(set.weightKg, set.reps) ?? 0;
            const cur = bestByExercise.get(e.exerciseId);
            if (!cur || e1 > cur.e1rm) bestByExercise.set(e.exerciseId, { e1rm: e1, weight: set.weightKg, reps: set.reps });
          }
        }
      }
    }
    const prs = [...bestByExercise.entries()]
      .map(([exerciseId, v]) => ({ exerciseId, ...v }))
      .sort((a, b) => b.e1rm - a.e1rm)
      .slice(0, 15);

    const targets = parseJson<{ targetCalories?: number }>(goal?.targets_json, {});
    const moods = (checkIns.results ?? []).map((r) => r.mood).filter((m): m is number => m != null);
    const sleeps = (checkIns.results ?? []).map((r) => r.sleep_hours).filter((s): s is number => s != null);

    return c.json({
      range: { start, end },
      compliance: {
        checkInDays: checkInDays.size,
        foodDays: foodByDay.size,
        workoutDays: workoutDays.size,
        checkInConsistencyPct: consistencyPct(checkInDays, start, end),
        currentStreak: currentStreak(checkInDays, today),
        calorieAdherencePct: calorieAdherencePct(foodByDay, targets.targetCalories),
      },
      averages: {
        mood: moods.length ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : null,
        sleepHours: sleeps.length ? Math.round((sleeps.reduce((a, b) => a + b, 0) / sleeps.length) * 10) / 10 : null,
      },
      weightSeries: (measurements.results ?? []).filter((m) => m.weight_kg != null).map((m) => ({ date: m.date_local, kg: m.weight_kg })),
      totalTonnage,
      prs,
    });
  })

  // Roster Retention Radar (SPEC §8.11): at-risk clients by log-gap + expiry.
  .get("/reports/retention", async (c) => {
    const who = requireTenant(c)!;
    const scope = await visibleClientIds(c);
    if (scope !== "all" && scope.length === 0) return c.json({ atRisk: [] });
    const where = scope === "all" ? "tenant_id = ? AND status = 'active'" : `tenant_id = ? AND status = 'active' AND id IN (${scope.map(() => "?").join(",")})`;
    const binds = scope === "all" ? [who.tenantId] : [who.tenantId, ...scope];
    const clients = await c.env.DB.prepare(`SELECT id, display_name FROM clients WHERE ${where}`)
      .bind(...binds)
      .all<{ id: string; display_name: string }>();

    const today = new Date().toISOString().slice(0, 10);
    const atRisk: { clientId: string; name: string; daysSinceLog: number | null; reason: string }[] = [];
    for (const client of clients.results ?? []) {
      const last = await c.env.DB.prepare(
        `SELECT MAX(d) AS last FROM (
           SELECT MAX(date_local) AS d FROM check_ins WHERE client_id = ?
           UNION SELECT MAX(date_local) FROM exercise_logs WHERE client_id = ?
           UNION SELECT MAX(date_local) FROM food_entries WHERE client_id = ?
         )`,
      )
        .bind(client.id, client.id, client.id)
        .first<{ last: string | null }>();
      const daysSince = last?.last ? Math.round((Date.parse(today) - Date.parse(last.last)) / 86_400_000) : null;
      if (daysSince === null || daysSince >= 5) {
        atRisk.push({
          clientId: client.id,
          name: client.display_name,
          daysSinceLog: daysSince,
          reason: daysSince === null ? "No activity logged yet" : `No logs in ${daysSince} days`,
        });
      }
    }
    atRisk.sort((a, b) => (b.daysSinceLog ?? 999) - (a.daysSinceLog ?? 999));
    return c.json({ atRisk });
  });
