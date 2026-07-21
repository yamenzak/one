/**
 * Reports (SPEC §8.7, §8.11) — the trainer per-client report and the
 * roster-level Retention Radar (at-risk clients by engagement heuristics).
 * All aggregate math is the pure @mossa/domain functions; this layer just
 * gathers rows and buckets them by the client's local day.
 */

import { Hono } from "hono";
import {
  addDays,
  calorieAdherencePct,
  consistencyPct,
  currentStreak,
  daysInRange,
  epley1Rm,
  presetRange,
  sessionTonnage,
  type LoggedSetLike,
} from "@mossa/domain";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { requireClientAccess, visibleClientIds } from "./clients.js";
import { parseJson } from "./db.js";
import { loadGoalTimeline, dayCalorieTarget } from "./goals.js";

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

    const [checkIns, foods, sessions, measurements, timeline] = await Promise.all([
      db.prepare("SELECT date_local, mood, sleep_hours, weight_kg FROM check_ins WHERE client_id = ? AND date_local >= ? AND date_local <= ?").bind(clientId, start, end).all<{ date_local: string; mood: number | null; sleep_hours: number | null; weight_kg: number | null }>(),
      db.prepare("SELECT date_local, SUM(calories) AS calories, MAX(target_calories) AS day_target_cal FROM food_entries WHERE client_id = ? AND date_local >= ? AND date_local <= ? GROUP BY date_local").bind(clientId, start, end).all<{ date_local: string; calories: number; day_target_cal: number | null }>(),
      db.prepare("SELECT date_local, entries_json FROM exercise_logs WHERE client_id = ? AND date_local >= ? AND date_local <= ?").bind(clientId, start, end).all<{ date_local: string; entries_json: string | null }>(),
      db.prepare("SELECT date_local, weight_kg, body_fat_percent FROM measurements WHERE client_id = ? AND date_local >= ? AND date_local <= ? ORDER BY date_local").bind(clientId, start, end).all<{ date_local: string; weight_kg: number | null; body_fat_percent: number | null }>(),
      loadGoalTimeline(db, clientId),
    ]);

    const checkInDays = new Set((checkIns.results ?? []).map((r) => r.date_local));
    const foodByDay = new Map<string, number>();
    const calTargetSnap = new Map<string, number>();
    for (const f of foods.results ?? []) {
      foodByDay.set(f.date_local, (foodByDay.get(f.date_local) ?? 0) + f.calories);
      if (f.day_target_cal != null) calTargetSnap.set(f.date_local, f.day_target_cal);
    }
    const calTargetForDay = dayCalorieTarget(timeline, calTargetSnap);
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
        calorieAdherencePct: calorieAdherencePct(foodByDay, calTargetForDay),
      },
      averages: {
        mood: moods.length ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : null,
        sleepHours: sleeps.length ? Math.round((sleeps.reduce((a, b) => a + b, 0) / sleeps.length) * 10) / 10 : null,
      },
      weightSeries: (measurements.results ?? []).filter((m) => m.weight_kg != null).map((m) => ({ date: m.date_local, kg: m.weight_kg })),
      bodyFatSeries: (measurements.results ?? []).filter((m) => m.body_fat_percent != null).map((m) => ({ date: m.date_local, pct: m.body_fat_percent })),
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
    const roster = clients.results ?? [];
    // One grouped query for the whole roster instead of a per-client round trip
    // (owner scope = every active client — that was N sequential D1 reads).
    const ids = roster.map((r) => r.id);
    const lastByClient = new Map<string, string | null>();
    if (ids.length) {
      const ph = ids.map(() => "?").join(",");
      const lastRows = await c.env.DB.prepare(
        `SELECT client_id, MAX(d) AS last FROM (
           SELECT client_id, MAX(date_local) AS d FROM check_ins WHERE client_id IN (${ph}) GROUP BY client_id
           UNION ALL SELECT client_id, MAX(date_local) FROM exercise_logs WHERE client_id IN (${ph}) GROUP BY client_id
           UNION ALL SELECT client_id, MAX(date_local) FROM food_entries WHERE client_id IN (${ph}) GROUP BY client_id
         ) GROUP BY client_id`,
      )
        .bind(...ids, ...ids, ...ids)
        .all<{ client_id: string; last: string | null }>();
      for (const r of lastRows.results ?? []) lastByClient.set(r.client_id, r.last);
    }
    for (const client of roster) {
      const last = lastByClient.get(client.id) ?? null;
      const daysSince = last ? Math.round((Date.parse(today) - Date.parse(last)) / 86_400_000) : null;
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
  })

  // Roster activity pulse — high-signal recent events across the coach's
  // visible clients (workouts, check-ins, weigh-ins, activities, swap requests,
  // lab uploads), each tagged with the client so the coach Today can link in.
  .get("/reports/roster-activity", async (c) => {
    const who = requireTenant(c)!;
    const scope = await visibleClientIds(c);
    if (scope !== "all" && scope.length === 0) return c.json({ events: [] });
    const from = c.req.query("from") ?? new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    const to = c.req.query("to") ?? new Date().toISOString().slice(0, 10);
    const db = c.env.DB;

    let ids: string[];
    if (scope === "all") {
      const rows = await db.prepare("SELECT id FROM clients WHERE tenant_id = ? AND status = 'active'").bind(who.tenantId).all<{ id: string }>();
      ids = (rows.results ?? []).map((r) => r.id);
    } else ids = scope;
    ids = ids.slice(0, 200);
    if (ids.length === 0) return c.json({ events: [] });
    const ph = ids.map(() => "?").join(",");
    const names = new Map<string, string>();
    const nameRows = await db.prepare(`SELECT id, display_name FROM clients WHERE id IN (${ph})`).bind(...ids).all<{ id: string; display_name: string }>();
    for (const r of nameRows.results ?? []) names.set(r.id, r.display_name);
    const nameOf = (id: string) => names.get(id) ?? "Client";
    const inRange = (day: string | null | undefined) => !!day && day >= from && day <= to;
    const dayOf = (ts: string | null | undefined) => (ts ? ts.slice(0, 10) : null);
    const atFor = (day: string, ts?: string | null) => (ts && ts.length >= 10 ? ts : `${day}T12:00:00.000Z`);

    interface REv { id: string; clientId: string; clientName: string; kind: string; date: string; at: string; title: string; subtitle: string | null; metric?: { unit: "weight"; value: number } }
    const events: REv[] = [];

    const [workouts, checkins, weights, acts, swaps, labs] = await Promise.all([
      db.prepare(`SELECT client_id, date_local, entries_json, updated_at FROM exercise_logs WHERE client_id IN (${ph}) AND date_local>=? AND date_local<=?`).bind(...ids, from, to).all<{ client_id: string; date_local: string; entries_json: string | null; updated_at: string }>(),
      db.prepare(`SELECT client_id, date_local, mood, energy, created_at FROM check_ins WHERE client_id IN (${ph}) AND date_local>=? AND date_local<=?`).bind(...ids, from, to).all<{ client_id: string; date_local: string; mood: number | null; energy: number | null; created_at: string }>(),
      db.prepare(`SELECT client_id, date_local, weight_kg, created_at FROM measurements WHERE client_id IN (${ph}) AND date_local>=? AND date_local<=? AND weight_kg IS NOT NULL`).bind(...ids, from, to).all<{ client_id: string; date_local: string; weight_kg: number; created_at: string }>(),
      db.prepare(`SELECT id, client_id, date_local, label, activity_key, duration_min, created_at FROM activity_logs WHERE client_id IN (${ph}) AND date_local>=? AND date_local<=?`).bind(...ids, from, to).all<{ id: string; client_id: string; date_local: string; label: string | null; activity_key: string | null; duration_min: number | null; created_at: string }>(),
      db.prepare(`SELECT id, client_id, status, reason, created_at FROM swap_requests WHERE client_id IN (${ph}) ORDER BY created_at DESC LIMIT 80`).bind(...ids).all<{ id: string; client_id: string; status: string; reason: string | null; created_at: string }>(),
      db.prepare(`SELECT id, client_id, display_name AS lab_name, uploaded_at FROM lab_tests WHERE client_id IN (${ph}) AND uploaded_at IS NOT NULL ORDER BY uploaded_at DESC LIMIT 80`).bind(...ids).all<{ id: string; client_id: string; lab_name: string; uploaded_at: string }>(),
    ]);

    for (const w of workouts.results ?? []) {
      const entries = parseJson<SessionEntry[]>(w.entries_json, []);
      const sets = entries.reduce((n, e) => n + e.sets.filter((s) => s.completed !== false).length, 0);
      if (sets === 0) continue;
      events.push({ id: `w-${w.client_id}-${w.date_local}`, clientId: w.client_id, clientName: nameOf(w.client_id), kind: "workout", date: w.date_local, at: atFor(w.date_local, w.updated_at), title: "Logged a workout", subtitle: `${sets} set${sets === 1 ? "" : "s"}` });
    }
    for (const ci of checkins.results ?? []) events.push({ id: `c-${ci.client_id}-${ci.date_local}`, clientId: ci.client_id, clientName: nameOf(ci.client_id), kind: "checkin", date: ci.date_local, at: atFor(ci.date_local, ci.created_at), title: "Checked in", subtitle: ci.mood != null ? `mood ${ci.mood}/5` : null });
    for (const m of weights.results ?? []) events.push({ id: `m-${m.client_id}-${m.date_local}`, clientId: m.client_id, clientName: nameOf(m.client_id), kind: "measurement", date: m.date_local, at: atFor(m.date_local, m.created_at), title: "Weighed in", subtitle: null, metric: { unit: "weight", value: m.weight_kg } });
    for (const a of acts.results ?? []) events.push({ id: `a-${a.id}`, clientId: a.client_id, clientName: nameOf(a.client_id), kind: "activity", date: a.date_local, at: atFor(a.date_local, a.created_at), title: a.label || (a.activity_key ?? "Activity").replace(/_/g, " "), subtitle: a.duration_min ? `${a.duration_min} min` : null });
    for (const s of swaps.results ?? []) if (inRange(dayOf(s.created_at))) events.push({ id: `s-${s.id}`, clientId: s.client_id, clientName: nameOf(s.client_id), kind: "swap", date: dayOf(s.created_at)!, at: s.created_at, title: "Requested a swap", subtitle: s.reason || (s.status === "pending" ? "needs your pick" : s.status) });
    for (const l of labs.results ?? []) if (inRange(dayOf(l.uploaded_at))) events.push({ id: `l-${l.id}`, clientId: l.client_id, clientName: nameOf(l.client_id), kind: "lab", date: dayOf(l.uploaded_at)!, at: l.uploaded_at, title: "Uploaded a lab", subtitle: l.lab_name });

    events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return c.json({ events: events.slice(0, 40) });
  })

  // Roster analytics (SPEC §8.11) — studio-wide engagement over a window: a
  // daily active-clients trend, 7-day check-in/workout rates, at-risk count and
  // the most-active clients. Coach-scoped to the caller's visible roster.
  .get("/reports/roster-analytics", async (c) => {
    const who = requireTenant(c)!;
    const scope = await visibleClientIds(c);
    const today = c.req.query("today") ?? new Date().toISOString().slice(0, 10);
    const days = Math.min(30, Math.max(7, Number(c.req.query("days")) || 14));
    let ids: string[];
    if (scope === "all") {
      const rows = await c.env.DB.prepare("SELECT id FROM clients WHERE tenant_id = ? AND status = 'active'").bind(who.tenantId).all<{ id: string }>();
      ids = (rows.results ?? []).map((r) => r.id);
    } else ids = scope;
    return c.json(await rosterAnalytics(c.env.DB, ids, today, days));
  });

/** The studio-engagement rollup behind /reports/roster-analytics — a daily
 *  active-clients trend, 7-day check-in/workout rates, at-risk count, the most
 *  active clients, and a body-composition pulse. Extracted so the weekly coach
 *  digest reuses the EXACT same computation the in-app analytics screen shows
 *  (no drift), the way the attention queue shares `rollupAttention`. */
export interface RosterAnalytics {
  range: { start: string; end: string; days: string[] };
  roster: { total: number; active7: number; atRisk: number };
  daily: { date: string; active: number; logs: number }[];
  engagement: { checkInRate: number; workoutRate: number; avgActivePerDay: number };
  topClients: { clientId: string; name: string; logs: number }[];
  composition: { tracked: number; withTrend: number; improving: number; avgDeltaPct: number | null; mostImproved: { clientId: string; name: string; delta: number } | null };
}

export async function rosterAnalytics(db: D1Database, idsIn: string[], today: string, days: number): Promise<RosterAnalytics> {
  const window = daysInRange(addDays(today, -(days - 1)), today);
  const start = window[0]!;
  if (idsIn.length === 0) {
    return { range: { start, end: today, days: window }, roster: { total: 0, active7: 0, atRisk: 0 }, daily: window.map((d) => ({ date: d, active: 0, logs: 0 })), engagement: { checkInRate: 0, workoutRate: 0, avgActivePerDay: 0 }, topClients: [], composition: { tracked: 0, withTrend: 0, improving: 0, avgDeltaPct: null, mostImproved: null } };
  }
  const ids = idsIn.slice(0, 500);
  const ph = ids.map(() => "?").join(",");

  const names = new Map<string, string>();
  const nrows = await db.prepare(`SELECT id, display_name FROM clients WHERE id IN (${ph})`).bind(...ids).all<{ id: string; display_name: string }>();
  for (const r of nrows.results ?? []) names.set(r.id, r.display_name);

  const q = (table: string) => db.prepare(`SELECT DISTINCT client_id, date_local FROM ${table} WHERE client_id IN (${ph}) AND date_local >= ? AND date_local <= ?`).bind(...ids, start, today).all<{ client_id: string; date_local: string }>();
  const [ci, fe, xl, al] = await Promise.all([q("check_ins"), q("food_entries"), q("exercise_logs"), q("activity_logs")]);

  const activeByDay = new Map<string, Set<string>>();
  const logsByDay = new Map<string, number>();
  const perClient = new Map<string, number>();
  const active5 = new Set<string>();
  const active7 = new Set<string>();
  const checkin7 = new Set<string>();
  const workout7 = new Set<string>();
  const d7 = addDays(today, -6), d5 = addDays(today, -4);
  const add = (cid: string, date: string, kind: string) => {
    let s = activeByDay.get(date); if (!s) { s = new Set(); activeByDay.set(date, s); }
    s.add(cid);
    logsByDay.set(date, (logsByDay.get(date) ?? 0) + 1);
    perClient.set(cid, (perClient.get(cid) ?? 0) + 1);
    if (date >= d5) active5.add(cid);
    if (date >= d7) { active7.add(cid); if (kind === "checkin") checkin7.add(cid); if (kind === "workout") workout7.add(cid); }
  };
  for (const r of ci.results ?? []) add(r.client_id, r.date_local, "checkin");
  for (const r of fe.results ?? []) add(r.client_id, r.date_local, "food");
  for (const r of xl.results ?? []) add(r.client_id, r.date_local, "workout");
  for (const r of al.results ?? []) add(r.client_id, r.date_local, "activity");

  const daily = window.map((d) => ({ date: d, active: activeByDay.get(d)?.size ?? 0, logs: logsByDay.get(d) ?? 0 }));
  const total = ids.length;
  const topClients = [...perClient.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, logs]) => ({ clientId: id, name: names.get(id) ?? "Client", logs }));

  // Body-composition pulse — a wider (~90d) window since fat-loss trends over
  // weeks, not days. First vs last body-fat reading per client → roster deltas.
  const bfRows = await db.prepare(`SELECT client_id, date_local, body_fat_percent FROM measurements WHERE client_id IN (${ph}) AND body_fat_percent IS NOT NULL AND date_local >= ? AND date_local <= ? ORDER BY date_local`).bind(...ids, addDays(today, -89), today).all<{ client_id: string; body_fat_percent: number }>();
  const bf = new Map<string, { first: number; last: number; n: number }>();
  for (const r of bfRows.results ?? []) {
    const e = bf.get(r.client_id);
    if (!e) bf.set(r.client_id, { first: r.body_fat_percent, last: r.body_fat_percent, n: 1 });
    else { e.last = r.body_fat_percent; e.n++; }
  }
  let deltaSum = 0, deltaN = 0, improving = 0;
  let mostImproved: { clientId: string; name: string; delta: number } | null = null;
  for (const [cid, e] of bf) {
    if (e.n < 2) continue;
    const delta = Math.round((e.last - e.first) * 10) / 10;
    deltaSum += delta; deltaN++;
    if (delta <= -0.5) improving++;
    if (!mostImproved || delta < mostImproved.delta) mostImproved = { clientId: cid, name: names.get(cid) ?? "Client", delta };
  }
  const composition = {
    tracked: bf.size,
    withTrend: deltaN,
    improving,
    avgDeltaPct: deltaN ? Math.round((deltaSum / deltaN) * 10) / 10 : null,
    mostImproved: mostImproved && mostImproved.delta < 0 ? mostImproved : null,
  };
  return {
    composition,
    range: { start, end: today, days: window },
    roster: { total, active7: active7.size, atRisk: Math.max(0, total - active5.size) },
    daily,
    engagement: {
      checkInRate: total ? Math.round((checkin7.size / total) * 100) : 0,
      workoutRate: total ? Math.round((workout7.size / total) * 100) : 0,
      avgActivePerDay: Math.round(daily.reduce((n, x) => n + x.active, 0) / daily.length),
    },
    topClients,
  };
}
