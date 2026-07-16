/**
 * Logging & tracking (SPEC §8.6) — every client log surface. Day bucketing
 * uses the client's local date (protocol LocalDate) computed device-side.
 * All routes go through requireClientAccess: clients hit their own record,
 * trainers their assigned roster (read + feedback), owner everything.
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  Arrangement,
  LogActivity,
  LogFoodEntry,
  LogMeasurement,
  LogMood,
  LogSleep,
  LogWater,
  LogWorkoutSets,
  SubmitCheckIn,
  type LoggedSet,
} from "@mossa/protocol";
import { activityByKey, estimateBurnedCalories, calculateBMI, calculateBMR, ageFromDob, profileGaps, overallDaysRemaining, isFullyExpired, hasActiveBudget, SUSPENDED_STATUSES, type ClientPreferences, type Budget } from "@mossa/domain";
import { type AppEnv } from "./auth-context.js";
import { requireClientAccess, type ClientRow } from "./clients.js";
import { newId, nowIso } from "./ids.js";
import { notifyUser } from "./inbox-do.js";
import { parseJson, j } from "./db.js";

/** Every log payload arrives wrapped with the target clientId. */
const withClient = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({ clientId: z.string().min(1), data: schema });

/**
 * Recompute BMI + BMR for a client's measurement on a given day and store the
 * snapshot on that row. Runs after every weight / body-fat entry so the coach
 * always reads a live basal rate and staleness detection has fresh numbers.
 * Uses the measurement's own weight/body-fat with the client's profile
 * (height/gender/DOB). No-op when weight or height is missing.
 */
async function recomputeBodyMetrics(db: D1Database, client: ClientRow, dateLocal: string): Promise<void> {
  const row = await db
    .prepare("SELECT weight_kg, body_fat_percent FROM measurements WHERE client_id = ? AND date_local = ?")
    .bind(client.id, dateLocal)
    .first<{ weight_kg: number | null; body_fat_percent: number | null }>();
  const weightKg = row?.weight_kg ?? null;
  if (weightKg == null || !client.height_cm) return;
  const bmi = calculateBMI(weightKg, client.height_cm);
  const ageYears = ageFromDob(client.date_of_birth);
  const bmr =
    ageYears != null && client.gender
      ? calculateBMR({ weightKg, heightCm: client.height_cm, ageYears, gender: client.gender as "male" | "female", bodyFatPercent: row?.body_fat_percent ?? null })?.bmr ?? null
      : null;
  await db
    .prepare("UPDATE measurements SET bmi = ?, bmr = ? WHERE client_id = ? AND date_local = ?")
    .bind(bmi, bmr, client.id, dateLocal)
    .run();
}

interface SessionEntry {
  blockIndex: number;
  slotIndex: number;
  exerciseId: string;
  sets: LoggedSet[];
}

export const logRoutes = new Hono<AppEnv>()
  // ── Structured workout sets: find-or-create one session per
  //    (client, plan, dayIndex, local day); upsert sets by setIndex. ─────────
  .post("/logs/workout-sets", async (c) => {
    const parsed = withClient(LogWorkoutSets).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body", issues: parsed.error.issues }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const d = parsed.data.data;
    const db = c.env.DB;

    let log = await db
      .prepare(
        "SELECT id, entries_json FROM exercise_logs WHERE client_id = ? AND workout_plan_id = ? AND plan_day_index = ? AND date_local = ?",
      )
      .bind(access.client.id, d.workoutPlanId, d.planDayIndex, d.date)
      .first<{ id: string; entries_json: string | null }>();

    if (!log) {
      const id = newId("elog");
      await db
        .prepare(
          "INSERT INTO exercise_logs (id, tenant_id, client_id, date_local, workout_plan_id, plan_day_index, entries_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(id, access.client.tenant_id, access.client.id, d.date, d.workoutPlanId, d.planDayIndex, j([]), nowIso(), nowIso())
        .run();
      log = { id, entries_json: "[]" };
    }

    const entries = parseJson<SessionEntry[]>(log.entries_json, []);
    let entry = entries.find(
      (e) => e.blockIndex === d.blockIndex && e.slotIndex === d.slotIndex && e.exerciseId === d.exerciseId,
    );
    if (!entry) {
      entry = { blockIndex: d.blockIndex, slotIndex: d.slotIndex, exerciseId: d.exerciseId, sets: [] };
      entries.push(entry);
    }
    for (const s of d.sets) {
      const idx = entry.sets.findIndex((x) => x.setIndex === s.setIndex);
      if (idx >= 0) entry.sets[idx] = s;
      else entry.sets.push(s);
    }
    entry.sets.sort((a, b) => a.setIndex - b.setIndex);
    await db
      .prepare("UPDATE exercise_logs SET entries_json = ?, updated_at = ? WHERE id = ?")
      .bind(j(entries), nowIso(), log.id)
      .run();
    return c.json({ ok: true, logId: log.id, entries });
  })

  .get("/logs/workout-sessions", async (c) => {
    const clientId = c.req.query("clientId");
    const from = c.req.query("from");
    const to = c.req.query("to");
    if (!clientId) return c.json({ error: "clientId required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    const rows = await c.env.DB.prepare(
      "SELECT * FROM exercise_logs WHERE client_id = ? AND date_local >= ? AND date_local <= ? ORDER BY date_local DESC",
    )
      .bind(clientId, from ?? "0000", to ?? "9999")
      .all();
    return c.json({
      sessions: (rows.results ?? []).map((r) => ({
        ...r,
        entries: parseJson(r.entries_json as string | null, []),
        entries_json: undefined,
      })),
    });
  })

  // Recent free-form activities (for the Train tab's activity feed).
  .get("/logs/activities", async (c) => {
    const clientId = c.req.query("clientId");
    const from = c.req.query("from");
    const to = c.req.query("to");
    if (!clientId) return c.json({ error: "clientId required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    const rows = await c.env.DB.prepare(
      "SELECT id, date_local, activity_key, label, start_time, duration_min, avg_hr_bpm, calories FROM activity_logs WHERE client_id = ? AND date_local >= ? AND date_local <= ? ORDER BY date_local DESC, created_at DESC LIMIT 60",
    )
      .bind(clientId, from ?? "0000", to ?? "9999")
      .all();
    return c.json({ activities: rows.results ?? [] });
  })

  // Wearable session-calories override (null/0 clears it).
  .post("/logs/session-calories", async (c) => {
    const parsed = z
      .object({ clientId: z.string(), logId: z.string(), calories: z.number().int().min(0).nullable() })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    await c.env.DB.prepare(
      "UPDATE exercise_logs SET session_calories = ?, updated_at = ? WHERE id = ? AND client_id = ?",
    )
      .bind(parsed.data.calories || null, nowIso(), parsed.data.logId, access.client.id)
      .run();
    return c.json({ ok: true });
  })

  // ── Free-form activity (MET-estimated unless the user typed a number). ────
  .post("/logs/activity", async (c) => {
    const parsed = withClient(LogActivity).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const d = parsed.data.data;
    let calories = d.caloriesBurned ?? null;
    let locked = calories != null;
    if (calories == null) {
      const weight = await c.env.DB.prepare(
        "SELECT weight_kg FROM measurements WHERE client_id = ? AND weight_kg IS NOT NULL ORDER BY date_local DESC LIMIT 1",
      )
        .bind(access.client.id)
        .first<{ weight_kg: number }>();
      if (weight?.weight_kg) {
        calories = estimateBurnedCalories({
          met: activityByKey(d.activityKey ?? "other").met,
          weightKg: weight.weight_kg,
          durationMin: d.durationMin,
          avgHrBpm: d.avgHrBpm,
        });
        locked = false;
      }
    }
    const id = newId("act");
    await c.env.DB.prepare(
      "INSERT INTO activity_logs (id, tenant_id, client_id, date_local, activity_key, label, start_time, duration_min, avg_hr_bpm, calories, calories_locked, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        id,
        access.client.tenant_id,
        access.client.id,
        d.date,
        d.activityKey ?? null,
        d.label ?? null,
        d.startTime ?? null,
        d.durationMin,
        d.avgHrBpm ?? null,
        calories,
        locked ? 1 : 0,
        nowIso(),
      )
      .run();
    return c.json({ ok: true, id, calories }, 201);
  })

  // ── Food diary. ────────────────────────────────────────────────────────────
  .post("/logs/food", async (c) => {
    const parsed = withClient(LogFoodEntry).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const d = parsed.data.data;
    const id = newId("fen");
    await c.env.DB.prepare(
      "INSERT INTO food_entries (id, tenant_id, client_id, date_local, meal_type, food_id, label, quantity, unit, calories, protein_g, carbs_g, fat_g, source, meal_plan_id, meal_option_index, image_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        id,
        access.client.tenant_id,
        access.client.id,
        d.date,
        d.mealType,
        d.foodId ?? null,
        d.label ?? null,
        d.quantity ?? null,
        d.unit ?? null,
        d.calories,
        d.proteinG,
        d.carbsG,
        d.fatG,
        d.source,
        d.mealPlanId ?? null,
        d.mealOptionIndex ?? null,
        d.imageUrl ?? null,
        nowIso(),
      )
      .run();
    return c.json({ ok: true, id }, 201);
  })

  .patch("/logs/food/:id", async (c) => {
    const parsed = z
      .object({
        clientId: z.string(),
        mealType: z.string().min(1).max(40).optional(),
        quantity: z.number().positive().nullish(),
        unit: z.string().max(20).optional(),
        calories: z.number().min(0).optional(),
        proteinG: z.number().min(0).optional(),
        carbsG: z.number().min(0).optional(),
        fatG: z.number().min(0).optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const d = parsed.data;
    const map: Record<string, unknown> = {
      meal_type: d.mealType, quantity: d.quantity, unit: d.unit,
      calories: d.calories, protein_g: d.proteinG, carbs_g: d.carbsG, fat_g: d.fatG,
    };
    const sets = Object.entries(map).filter(([, v]) => v !== undefined);
    if (!sets.length) return c.json({ ok: true });
    await c.env.DB.prepare(`UPDATE food_entries SET ${sets.map(([k]) => `${k} = ?`).join(", ")} WHERE id = ? AND client_id = ?`)
      .bind(...sets.map(([, v]) => v), c.req.param("id"), access.client.id)
      .run();
    return c.json({ ok: true });
  })

  .delete("/logs/food/:id", async (c) => {
    const clientId = c.req.query("clientId");
    if (!clientId) return c.json({ error: "clientId required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    await c.env.DB.prepare("DELETE FROM food_entries WHERE id = ? AND client_id = ?")
      .bind(c.req.param("id"), access.client.id)
      .run();
    return c.json({ ok: true });
  })

  .get("/logs/food", async (c) => {
    const clientId = c.req.query("clientId");
    const date = c.req.query("date");
    if (!clientId || !date) return c.json({ error: "clientId + date required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    const rows = await c.env.DB.prepare(
      "SELECT fe.*, COALESCE(fe.image_url, f.image_url) AS image_url FROM food_entries fe LEFT JOIN foods f ON f.id = fe.food_id WHERE fe.client_id = ? AND fe.date_local = ? ORDER BY fe.created_at",
    )
      .bind(clientId, date)
      .all();
    return c.json({ entries: rows.results ?? [] });
  })

  // ── Weekly nutrition strip: 7-day per-day calories/protein/water + targets. ─
  .get("/logs/nutrition/week", async (c) => {
    const clientId = c.req.query("clientId");
    const date = c.req.query("date");
    if (!clientId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: "clientId + date required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    const db = c.env.DB;

    // 7 local dates ending at `date` (inclusive), oldest first.
    const endMs = Date.parse(`${date}T00:00:00Z`);
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) days.push(new Date(endMs - i * 86_400_000).toISOString().slice(0, 10));
    const start = days[0]!;

    const [food, water, goal] = await Promise.all([
      db
        .prepare("SELECT date_local, COALESCE(SUM(calories),0) AS calories, COALESCE(SUM(protein_g),0) AS protein FROM food_entries WHERE client_id = ? AND date_local >= ? AND date_local <= ? GROUP BY date_local")
        .bind(clientId, start, date)
        .all<{ date_local: string; calories: number; protein: number }>(),
      db
        .prepare("SELECT date_local, total_ml FROM water_logs WHERE client_id = ? AND date_local >= ? AND date_local <= ?")
        .bind(clientId, start, date)
        .all<{ date_local: string; total_ml: number }>(),
      db
        .prepare("SELECT targets_json FROM client_goals WHERE client_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1")
        .bind(clientId)
        .first<{ targets_json: string | null }>(),
    ]);

    const foodByDay = new Map((food.results ?? []).map((r) => [r.date_local, r]));
    const waterByDay = new Map((water.results ?? []).map((r) => [r.date_local, r.total_ml]));
    const targets = parseJson<{ targetCalories?: number; targetProteinG?: number; targetWaterMl?: number }>(goal?.targets_json, {});

    return c.json({
      days: days.map((d) => {
        const f = foodByDay.get(d);
        return {
          date: d,
          calories: Math.round(f?.calories ?? 0),
          proteinG: Math.round(f?.protein ?? 0),
          waterMl: waterByDay.get(d) ?? 0,
          logged: Boolean(f),
        };
      }),
      targets: {
        calories: targets.targetCalories ?? null,
        proteinG: targets.targetProteinG ?? null,
        waterMl: targets.targetWaterMl ?? null,
      },
    });
  })

  // ── Activity history: a unified, date-bucketed timeline of everything a
  //    client logged or that happened for them, across all surfaces. Powers the
  //    Today feed (last N days) and the day-history browser. ──────────────────
  .get("/activity-history", async (c) => {
    const clientId = c.req.query("clientId");
    const from = c.req.query("from");
    const to = c.req.query("to");
    if (!clientId || !from || !to) return c.json({ error: "clientId + from + to required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    const db = c.env.DB;
    const cid = access.client.id;
    const inRange = (day: string | null | undefined) => !!day && day >= from && day <= to;
    const dayOf = (ts: string | null | undefined) => (ts ? ts.slice(0, 10) : null);

    interface Ev { id: string; kind: string; date: string; at: string; title: string; subtitle: string | null; ref?: string; metric?: { unit: "energy" | "volume" | "weight"; value: number } }
    const events: Ev[] = [];

    const [food, water, workouts, activities, measures, checkins, sleeps, moods, fasts, swaps, labs, wPlans, mPlans, supps, sessions] = await Promise.all([
      db.prepare("SELECT date_local, meal_type, COUNT(*) AS n, COALESCE(SUM(calories),0) AS cal, MAX(created_at) AS at FROM food_entries WHERE client_id=? AND date_local>=? AND date_local<=? GROUP BY date_local, meal_type").bind(cid, from, to).all<{ date_local: string; meal_type: string; n: number; cal: number; at: string }>(),
      db.prepare("SELECT date_local, total_ml, updated_at FROM water_logs WHERE client_id=? AND date_local>=? AND date_local<=? AND total_ml>0").bind(cid, from, to).all<{ date_local: string; total_ml: number; updated_at: string }>(),
      db.prepare("SELECT date_local, entries_json, session_calories, updated_at, created_at FROM exercise_logs WHERE client_id=? AND date_local>=? AND date_local<=?").bind(cid, from, to).all<{ date_local: string; entries_json: string | null; session_calories: number | null; updated_at: string; created_at: string }>(),
      db.prepare("SELECT id, date_local, activity_key, label, duration_min, avg_hr_bpm, calories, created_at FROM activity_logs WHERE client_id=? AND date_local>=? AND date_local<=?").bind(cid, from, to).all<{ id: string; date_local: string; activity_key: string | null; label: string | null; duration_min: number | null; avg_hr_bpm: number | null; calories: number | null; created_at: string }>(),
      db.prepare("SELECT date_local, weight_kg, body_fat_percent, waist_cm, created_at FROM measurements WHERE client_id=? AND date_local>=? AND date_local<=?").bind(cid, from, to).all<{ date_local: string; weight_kg: number | null; body_fat_percent: number | null; waist_cm: number | null; created_at: string }>(),
      db.prepare("SELECT id, date_local, mood, energy, stress, sleep_hours, trainer_feedback, feedback_at, created_at FROM check_ins WHERE client_id=? AND date_local>=? AND date_local<=?").bind(cid, from, to).all<{ id: string; date_local: string; mood: number | null; energy: number | null; stress: number | null; sleep_hours: number | null; trainer_feedback: string | null; feedback_at: string | null; created_at: string }>(),
      db.prepare("SELECT date_local, duration_minutes, quality, updated_at FROM sleep_logs WHERE client_id=? AND date_local>=? AND date_local<=?").bind(cid, from, to).all<{ date_local: string; duration_minutes: number; quality: number | null; updated_at: string }>(),
      db.prepare("SELECT date_local, mood, energy, stress, updated_at FROM mood_logs WHERE client_id=? AND date_local>=? AND date_local<=?").bind(cid, from, to).all<{ date_local: string; mood: number | null; energy: number | null; stress: number | null; updated_at: string }>(),
      db.prepare("SELECT id, started_at, ended_at, duration_minutes, target_hours FROM fasting_sessions WHERE client_id=? ORDER BY started_at DESC LIMIT 40").bind(cid).all<{ id: string; started_at: string; ended_at: string | null; duration_minutes: number | null; target_hours: number | null }>(),
      db.prepare("SELECT s.id, s.status, s.reason, s.trainer_note, s.created_at, s.resolved_at, ce.name AS current_name, se.name AS suggested_name FROM swap_requests s LEFT JOIN exercises ce ON ce.id=s.current_exercise_id LEFT JOIN exercises se ON se.id=s.suggested_exercise_id WHERE s.client_id=? ORDER BY s.created_at DESC LIMIT 60").bind(cid).all<{ id: string; status: string; reason: string | null; trainer_note: string | null; created_at: string; resolved_at: string | null; current_name: string | null; suggested_name: string | null }>(),
      db.prepare("SELECT id, display_name, status, created_at, uploaded_at, reviewed_at FROM lab_tests WHERE client_id=? ORDER BY created_at DESC LIMIT 60").bind(cid).all<{ id: string; display_name: string; status: string; created_at: string; uploaded_at: string | null; reviewed_at: string | null }>(),
      db.prepare("SELECT id, name, published_at FROM workout_plans WHERE client_id=? AND published_at IS NOT NULL ORDER BY published_at DESC LIMIT 30").bind(cid).all<{ id: string; name: string; published_at: string }>(),
      db.prepare("SELECT id, name, published_at FROM meal_plans WHERE client_id=? AND published_at IS NOT NULL ORDER BY published_at DESC LIMIT 30").bind(cid).all<{ id: string; name: string; published_at: string }>(),
      db.prepare("SELECT sl.date_local, sl.slot, sl.taken_at, s.name AS name FROM supplement_logs sl LEFT JOIN supplements s ON s.id=sl.supplement_id WHERE sl.client_id=? AND sl.date_local>=? AND sl.date_local<=?").bind(cid, from, to).all<{ date_local: string; slot: string; taken_at: string | null; name: string | null }>(),
      db.prepare("SELECT id, scheduled_at, duration_minutes, status, completed_at FROM trainer_sessions WHERE client_id=? ORDER BY scheduled_at DESC LIMIT 60").bind(cid).all<{ id: string; scheduled_at: string; duration_minutes: number | null; status: string; completed_at: string | null }>(),
    ]);

    const mealLabel = (t: string) => ({ breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack", pre_workout: "Pre-workout", post_workout: "Post-workout", free: "Free meal" } as Record<string, string>)[t] ?? t.replace(/_/g, " ").replace(/^\w/, (x) => x.toUpperCase());
    const dur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`);
    const atFor = (day: string, ts?: string | null) => (ts && ts.length >= 10 ? ts : `${day}T12:00:00.000Z`);

    for (const f of food.results ?? []) events.push({ id: `food-${f.date_local}-${f.meal_type}`, kind: `food:${f.meal_type}`, date: f.date_local, at: atFor(f.date_local, f.at), title: mealLabel(f.meal_type), subtitle: `${f.n} item${f.n === 1 ? "" : "s"}`, metric: { unit: "energy", value: Math.round(f.cal) } });
    for (const w of water.results ?? []) events.push({ id: `water-${w.date_local}`, kind: "water", date: w.date_local, at: atFor(w.date_local, w.updated_at), title: "Hydration", subtitle: null, metric: { unit: "volume", value: w.total_ml } });
    for (const s of workouts.results ?? []) {
      const entries = parseJson<SessionEntry[]>(s.entries_json, []);
      const sets = entries.reduce((n, e) => n + e.sets.filter((x) => x.completed !== false).length, 0);
      if (sets === 0) continue;
      events.push({ id: `workout-${s.date_local}`, kind: "workout", date: s.date_local, at: atFor(s.date_local, s.updated_at || s.created_at), title: "Workout", subtitle: `${sets} set${sets === 1 ? "" : "s"}`, ...(s.session_calories && s.session_calories > 0 ? { metric: { unit: "energy" as const, value: s.session_calories } } : {}) });
    }
    for (const a of activities.results ?? []) events.push({ id: `act-${a.id}`, kind: "activity", date: a.date_local, at: atFor(a.date_local, a.created_at), title: a.label || (a.activity_key ?? "Activity").replace(/_/g, " "), subtitle: [a.duration_min ? dur(a.duration_min) : null, a.avg_hr_bpm ? `HR ${a.avg_hr_bpm}` : null].filter(Boolean).join(" · ") || null, ...(a.calories ? { metric: { unit: "energy" as const, value: a.calories } } : {}) });
    for (const m of measures.results ?? []) { if (m.weight_kg == null && m.body_fat_percent == null && m.waist_cm == null) continue; events.push({ id: `meas-${m.date_local}`, kind: "measurement", date: m.date_local, at: atFor(m.date_local, m.created_at), title: "Body", subtitle: [m.body_fat_percent != null ? `${m.body_fat_percent}% bf` : null, m.waist_cm != null ? `waist ${m.waist_cm}` : null].filter(Boolean).join(" · ") || null, ...(m.weight_kg != null ? { metric: { unit: "weight" as const, value: m.weight_kg } } : {}) }); }
    for (const ci of checkins.results ?? []) {
      const parts = [ci.mood != null ? `mood ${ci.mood}/5` : null, ci.energy != null ? `energy ${ci.energy}/5` : null].filter(Boolean).join(" · ");
      events.push({ id: `checkin-${ci.date_local}`, kind: "checkin", date: ci.date_local, at: atFor(ci.date_local, ci.created_at), title: "Check-in", subtitle: parts || "logged", ref: ci.date_local });
      if (ci.trainer_feedback && inRange(dayOf(ci.feedback_at))) events.push({ id: `fb-${ci.id}`, kind: "feedback", date: dayOf(ci.feedback_at)!, at: ci.feedback_at!, title: "Coach feedback", subtitle: ci.trainer_feedback.slice(0, 90), ref: ci.date_local });
    }
    for (const s of sleeps.results ?? []) events.push({ id: `sleep-${s.date_local}`, kind: "sleep", date: s.date_local, at: atFor(s.date_local, s.updated_at), title: "Sleep", subtitle: [dur(s.duration_minutes), s.quality != null ? `quality ${s.quality}/5` : null].filter(Boolean).join(" · ") });
    for (const m of moods.results ?? []) events.push({ id: `mood-${m.date_local}`, kind: "mood", date: m.date_local, at: atFor(m.date_local, m.updated_at), title: "Mood", subtitle: [m.mood != null ? `mood ${m.mood}/5` : null, m.energy != null ? `energy ${m.energy}/5` : null, m.stress != null ? `stress ${m.stress}/5` : null].filter(Boolean).join(" · ") || "logged" });
    for (const f of fasts.results ?? []) {
      if (f.ended_at && inRange(dayOf(f.ended_at))) events.push({ id: `fast-end-${f.id}`, kind: "fast", date: dayOf(f.ended_at)!, at: f.ended_at, title: "Fast complete", subtitle: [f.duration_minutes != null ? dur(f.duration_minutes) : null, f.target_hours ? `target ${f.target_hours}h` : null].filter(Boolean).join(" · ") || null });
      else if (!f.ended_at && inRange(dayOf(f.started_at))) events.push({ id: `fast-start-${f.id}`, kind: "fast", date: dayOf(f.started_at)!, at: f.started_at, title: "Fast started", subtitle: f.target_hours ? `target ${f.target_hours}h` : null });
    }
    for (const s of swaps.results ?? []) {
      const names = s.current_name ? `${s.current_name}${s.suggested_name ? ` → ${s.suggested_name}` : ""}` : null;
      if (s.resolved_at && s.status !== "pending" && inRange(dayOf(s.resolved_at))) events.push({ id: `swap-res-${s.id}`, kind: "swap", date: dayOf(s.resolved_at)!, at: s.resolved_at, title: s.status === "approved" ? "Swap approved" : "Swap declined", subtitle: names || s.trainer_note || null });
      else if (inRange(dayOf(s.created_at))) events.push({ id: `swap-req-${s.id}`, kind: "swap", date: dayOf(s.created_at)!, at: s.created_at, title: "Swap requested", subtitle: s.current_name ? `${s.current_name}${s.reason ? ` · ${s.reason}` : ""}` : s.reason || null });
    }
    for (const l of labs.results ?? []) {
      if (l.reviewed_at && inRange(dayOf(l.reviewed_at))) events.push({ id: `lab-rev-${l.id}`, kind: "lab", date: dayOf(l.reviewed_at)!, at: l.reviewed_at, title: "Lab reviewed", subtitle: l.display_name, ref: l.id });
      else if (l.uploaded_at && inRange(dayOf(l.uploaded_at))) events.push({ id: `lab-up-${l.id}`, kind: "lab", date: dayOf(l.uploaded_at)!, at: l.uploaded_at, title: "Lab uploaded", subtitle: l.display_name, ref: l.id });
      else if (inRange(dayOf(l.created_at))) events.push({ id: `lab-req-${l.id}`, kind: "lab", date: dayOf(l.created_at)!, at: l.created_at, title: "Lab requested", subtitle: l.display_name, ref: l.id });
    }
    for (const p of wPlans.results ?? []) if (inRange(dayOf(p.published_at))) events.push({ id: `wplan-${p.id}`, kind: "plan_workout", date: dayOf(p.published_at)!, at: p.published_at, title: "New workout plan", subtitle: p.name });
    for (const p of mPlans.results ?? []) if (inRange(dayOf(p.published_at))) events.push({ id: `mplan-${p.id}`, kind: "plan_meal", date: dayOf(p.published_at)!, at: p.published_at, title: "New meal plan", subtitle: p.name });
    for (const s of supps.results ?? []) events.push({ id: `supp-${s.date_local}-${s.name}-${s.slot}`, kind: "supplement", date: s.date_local, at: atFor(s.date_local, s.taken_at), title: s.name || "Supplement", subtitle: s.slot ? s.slot.replace(/_/g, " ") : "taken" });
    for (const s of sessions.results ?? []) {
      const day = s.status === "completed" ? dayOf(s.completed_at) ?? dayOf(s.scheduled_at) : dayOf(s.scheduled_at);
      if (!inRange(day)) continue;
      const title = s.status === "completed" ? "Session completed" : s.status === "cancelled" ? "Session cancelled" : s.status === "no_show" ? "Session missed" : "Session";
      events.push({ id: `sess-${s.id}`, kind: "session", date: day!, at: atFor(day!, s.status === "completed" ? s.completed_at : s.scheduled_at), title, subtitle: s.duration_minutes ? `${s.duration_minutes} min` : null, ref: s.id });
    }

    events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return c.json({ events });
  })

  // ── Water / sleep / mood: per-day upserts. ─────────────────────────────────
  .post("/logs/water", async (c) => {
    const parsed = withClient(LogWater).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const d = parsed.data.data;
    const existing = await c.env.DB.prepare(
      "SELECT total_ml, entries_json FROM water_logs WHERE client_id = ? AND date_local = ?",
    )
      .bind(access.client.id, d.date)
      .first<{ total_ml: number; entries_json: string | null }>();
    const entries = parseJson<{ amountMl: number; at: string }[]>(existing?.entries_json, []);
    entries.push({ amountMl: d.amountMl, at: nowIso() });
    const total = (existing?.total_ml ?? 0) + d.amountMl;
    await c.env.DB.prepare(
      "INSERT INTO water_logs (client_id, date_local, tenant_id, total_ml, entries_json, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(client_id, date_local) DO UPDATE SET total_ml = ?, entries_json = ?, updated_at = ?",
    )
      .bind(access.client.id, d.date, access.client.tenant_id, total, j(entries), nowIso(), total, j(entries), nowIso())
      .run();
    return c.json({ ok: true, totalMl: total });
  })

  .post("/logs/sleep", async (c) => {
    const parsed = withClient(LogSleep).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const d = parsed.data.data;
    await c.env.DB.prepare(
      "INSERT INTO sleep_logs (client_id, date_local, tenant_id, duration_minutes, quality, notes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(client_id, date_local) DO UPDATE SET duration_minutes = ?, quality = ?, notes = ?, updated_at = ?",
    )
      .bind(
        access.client.id, d.date, access.client.tenant_id, d.durationMinutes, d.quality ?? null, d.notes ?? null, nowIso(),
        d.durationMinutes, d.quality ?? null, d.notes ?? null, nowIso(),
      )
      .run();
    return c.json({ ok: true });
  })

  .post("/logs/mood", async (c) => {
    const parsed = withClient(LogMood).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const d = parsed.data.data;
    await c.env.DB.prepare(
      "INSERT INTO mood_logs (client_id, date_local, tenant_id, mood, energy, stress, notes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(client_id, date_local) DO UPDATE SET mood = ?, energy = ?, stress = ?, notes = ?, updated_at = ?",
    )
      .bind(
        access.client.id, d.date, access.client.tenant_id, d.mood ?? null, d.energy ?? null, d.stress ?? null, d.notes ?? null, nowIso(),
        d.mood ?? null, d.energy ?? null, d.stress ?? null, d.notes ?? null, nowIso(),
      )
      .run();
    return c.json({ ok: true });
  })

  // ── Measurements (weight/BF/circumferences — one row per local day). ──────
  .post("/measurements", async (c) => {
    const parsed = withClient(LogMeasurement).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const d = parsed.data.data;
    await c.env.DB.prepare(
      `INSERT INTO measurements (id, tenant_id, client_id, date_local, weight_kg, body_fat_percent, neck_cm, waist_cm, hips_cm, chest_cm, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(client_id, date_local) DO UPDATE SET
         weight_kg = COALESCE(excluded.weight_kg, weight_kg),
         body_fat_percent = COALESCE(excluded.body_fat_percent, body_fat_percent),
         neck_cm = COALESCE(excluded.neck_cm, neck_cm),
         waist_cm = COALESCE(excluded.waist_cm, waist_cm),
         hips_cm = COALESCE(excluded.hips_cm, hips_cm),
         chest_cm = COALESCE(excluded.chest_cm, chest_cm),
         notes = COALESCE(excluded.notes, notes)`,
    )
      .bind(
        newId("mea"),
        access.client.tenant_id,
        access.client.id,
        d.date,
        d.weightKg ?? null,
        d.bodyFatPercent ?? null,
        d.neckCm ?? null,
        d.waistCm ?? null,
        d.hipsCm ?? null,
        d.chestCm ?? null,
        d.notes ?? null,
        nowIso(),
      )
      .run();
    await recomputeBodyMetrics(c.env.DB, access.client, d.date);
    return c.json({ ok: true });
  })

  .get("/measurements", async (c) => {
    const clientId = c.req.query("clientId");
    if (!clientId) return c.json({ error: "clientId required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    const rows = await c.env.DB.prepare(
      "SELECT * FROM measurements WHERE client_id = ? ORDER BY date_local DESC LIMIT 180",
    )
      .bind(clientId)
      .all();
    return c.json({ measurements: rows.results ?? [] });
  })

  // ── Check-ins: one per local day; trainers write feedback. ────────────────
  .post("/check-ins", async (c) => {
    const parsed = withClient(SubmitCheckIn).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const d = parsed.data.data;
    const existing = await c.env.DB.prepare(
      "SELECT id FROM check_ins WHERE client_id = ? AND date_local = ?",
    )
      .bind(access.client.id, d.date)
      .first<{ id: string }>();
    const photosJson = d.progressPhotos ? j(d.progressPhotos) : null;
    if (existing) {
      await c.env.DB.prepare(
        "UPDATE check_ins SET weight_kg = ?, mood = ?, energy = ?, stress = ?, sleep_quality = ?, sleep_hours = ?, water_ml = ?, steps_count = ?, notes = ?, photos_json = COALESCE(?, photos_json), updated_at = ? WHERE id = ?",
      )
        .bind(
          d.weightKg ?? null, d.mood ?? null, d.energy ?? null, d.stress ?? null, d.sleepQuality ?? null,
          d.sleepHours ?? null, d.waterMl ?? null, d.stepsCount ?? null, d.notes ?? null, photosJson, nowIso(), existing.id,
        )
        .run();
      return c.json({ ok: true, id: existing.id, updated: true });
    }
    const id = newId("chk");
    await c.env.DB.prepare(
      "INSERT INTO check_ins (id, tenant_id, client_id, date_local, weight_kg, mood, energy, stress, sleep_quality, sleep_hours, water_ml, steps_count, notes, photos_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        id, access.client.tenant_id, access.client.id, d.date, d.weightKg ?? null, d.mood ?? null,
        d.energy ?? null, d.stress ?? null, d.sleepQuality ?? null, d.sleepHours ?? null,
        d.waterMl ?? null, d.stepsCount ?? null, d.notes ?? null, photosJson, nowIso(), nowIso(),
      )
      .run();
    // Mirror weight into measurements so progress prefers the dedicated table.
    if (d.weightKg) {
      await c.env.DB.prepare(
        "INSERT INTO measurements (id, tenant_id, client_id, date_local, weight_kg, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(client_id, date_local) DO UPDATE SET weight_kg = COALESCE(measurements.weight_kg, excluded.weight_kg)",
      )
        .bind(newId("mea"), access.client.tenant_id, access.client.id, d.date, d.weightKg, nowIso())
        .run();
      await recomputeBodyMetrics(c.env.DB, access.client, d.date);
    }
    // Notify the primary trainer (fan-out fix: primary only, SPEC §2).
    const primary = await c.env.DB.prepare(
      "SELECT trainer_user_id FROM client_trainers WHERE client_id = ? ORDER BY is_primary DESC LIMIT 1",
    )
      .bind(access.client.id)
      .first<{ trainer_user_id: string }>();
    if (primary && primary.trainer_user_id !== c.get("user")?.id) {
      await c.env.DB.prepare(
        "INSERT INTO notifications (id, tenant_id, recipient_user_id, type, title, message, link, created_at) VALUES (?, ?, ?, 'check_in', ?, ?, ?, ?)",
      )
        .bind(
          newId("ntf"),
          access.client.tenant_id,
          primary.trainer_user_id,
          `${access.client.display_name} checked in`,
          d.notes ?? "",
          `/clients/${access.client.id}/manage`,
          nowIso(),
        )
        .run()
        .catch(() => undefined);
      await notifyUser(c.env, primary.trainer_user_id);
    }
    return c.json({ ok: true, id }, 201);
  })

  .get("/check-ins", async (c) => {
    const clientId = c.req.query("clientId");
    if (!clientId) return c.json({ error: "clientId required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    const rows = await c.env.DB.prepare(
      "SELECT * FROM check_ins WHERE client_id = ? ORDER BY date_local DESC LIMIT 90",
    )
      .bind(clientId)
      .all();
    return c.json({ checkIns: rows.results ?? [] });
  })

  // Trainer feedback → notifies the client.
  .post("/check-ins/:id/feedback", async (c) => {
    const parsed = z
      .object({ clientId: z.string(), feedback: z.string().min(1).max(2000) })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const role = c.get("role");
    if (role !== "trainer" && role !== "owner") return c.json({ error: "forbidden" }, 403);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const user = c.get("user")!;
    await c.env.DB.prepare(
      "UPDATE check_ins SET trainer_feedback = ?, feedback_by = ?, feedback_at = ? WHERE id = ? AND client_id = ?",
    )
      .bind(parsed.data.feedback, user.id, nowIso(), c.req.param("id"), access.client.id)
      .run();
    if (access.client.user_id) {
      await c.env.DB.prepare(
        "INSERT INTO notifications (id, tenant_id, recipient_user_id, type, title, message, link, created_at) VALUES (?, ?, ?, 'feedback', 'Coach feedback on your check-in', ?, '/progress', ?)",
      )
        .bind(newId("ntf"), access.client.tenant_id, access.client.user_id, parsed.data.feedback.slice(0, 200), nowIso())
        .run()
        .catch(() => undefined);
      await notifyUser(c.env, access.client.user_id);
    }
    return c.json({ ok: true });
  })

  // ── Fasting. ───────────────────────────────────────────────────────────────
  .post("/fasting", async (c) => {
    const parsed = withClient(
      z.object({ action: z.enum(["start", "end"]), targetHours: z.number().int().min(8).max(72).default(16) }),
    ).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const d = parsed.data.data;
    if (d.action === "start") {
      const active = await c.env.DB.prepare(
        "SELECT id FROM fasting_sessions WHERE client_id = ? AND ended_at IS NULL",
      )
        .bind(access.client.id)
        .first();
      if (active) return c.json({ error: "a fast is already running" }, 409);
      const id = newId("fst");
      await c.env.DB.prepare(
        "INSERT INTO fasting_sessions (id, tenant_id, client_id, started_at, target_hours, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind(id, access.client.tenant_id, access.client.id, nowIso(), d.targetHours, nowIso())
        .run();
      return c.json({ ok: true, id }, 201);
    }
    const active = await c.env.DB.prepare(
      "SELECT id, started_at FROM fasting_sessions WHERE client_id = ? AND ended_at IS NULL",
    )
      .bind(access.client.id)
      .first<{ id: string; started_at: string }>();
    if (!active) return c.json({ error: "no active fast" }, 404);
    const duration = Math.round((Date.now() - Date.parse(active.started_at)) / 60000);
    await c.env.DB.prepare("UPDATE fasting_sessions SET ended_at = ?, duration_minutes = ? WHERE id = ?")
      .bind(nowIso(), duration, active.id)
      .run();
    return c.json({ ok: true, durationMinutes: duration });
  })

  .get("/fasting", async (c) => {
    const clientId = c.req.query("clientId");
    if (!clientId) return c.json({ error: "clientId required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    const active = await c.env.DB.prepare(
      "SELECT * FROM fasting_sessions WHERE client_id = ? AND ended_at IS NULL",
    )
      .bind(clientId)
      .first();
    const recent = await c.env.DB.prepare(
      "SELECT * FROM fasting_sessions WHERE client_id = ? AND ended_at IS NOT NULL ORDER BY started_at DESC LIMIT 10",
    )
      .bind(clientId)
      .all();
    return c.json({ activeFast: active ?? null, recentFasts: recent.results ?? [] });
  })

  // ── Meal arrangements (client-private weekly mapping). ────────────────────
  .get("/arrangements", async (c) => {
    const clientId = c.req.query("clientId");
    const mealPlanId = c.req.query("mealPlanId");
    if (!clientId || !mealPlanId) return c.json({ error: "clientId + mealPlanId required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    const row = await c.env.DB.prepare(
      "SELECT slots_json FROM meal_arrangements WHERE client_id = ? AND meal_plan_id = ?",
    )
      .bind(clientId, mealPlanId)
      .first<{ slots_json: string | null }>();
    return c.json({ slots: parseJson(row?.slots_json, []) });
  })

  .put("/arrangements", async (c) => {
    const parsed = withClient(Arrangement).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const d = parsed.data.data;
    await c.env.DB.prepare(
      "INSERT INTO meal_arrangements (client_id, meal_plan_id, tenant_id, slots_json, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(client_id, meal_plan_id) DO UPDATE SET slots_json = ?, updated_at = ?",
    )
      .bind(access.client.id, d.mealPlanId, access.client.tenant_id, j(d.slots), nowIso(), j(d.slots), nowIso())
      .run();
    return c.json({ ok: true });
  })

  // ── Today bundle: what the client Today screen boots from. ────────────────
  .get("/today", async (c) => {
    const clientId = c.req.query("clientId");
    const date = c.req.query("date");
    if (!clientId || !date) return c.json({ error: "clientId + date required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    const db = c.env.DB;
    const [food, water, workout, activities, checkIn, goal, plans, checkInDates, pendingLabs, weights] = await Promise.all([
      db
        .prepare(
          "SELECT COALESCE(SUM(calories),0) AS calories, COALESCE(SUM(protein_g),0) AS protein, COALESCE(SUM(carbs_g),0) AS carbs, COALESCE(SUM(fat_g),0) AS fat FROM food_entries WHERE client_id = ? AND date_local = ?",
        )
        .bind(clientId, date)
        .first<{ calories: number; protein: number; carbs: number; fat: number }>(),
      db
        .prepare("SELECT total_ml FROM water_logs WHERE client_id = ? AND date_local = ?")
        .bind(clientId, date)
        .first<{ total_ml: number }>(),
      db
        .prepare("SELECT id, workout_plan_id, plan_day_index, entries_json, session_calories FROM exercise_logs WHERE client_id = ? AND date_local = ?")
        .bind(clientId, date)
        .all<{ id: string; workout_plan_id: string; plan_day_index: number; entries_json: string | null; session_calories: number | null }>(),
      db
        .prepare("SELECT COALESCE(SUM(calories),0) AS burned FROM activity_logs WHERE client_id = ? AND date_local = ?")
        .bind(clientId, date)
        .first<{ burned: number }>(),
      db
        .prepare("SELECT id FROM check_ins WHERE client_id = ? AND date_local = ?")
        .bind(clientId, date)
        .first<{ id: string }>(),
      db
        .prepare("SELECT targets_json, weekly_load_target FROM client_goals WHERE client_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1")
        .bind(clientId)
        .first<{ targets_json: string | null; weekly_load_target: number | null }>(),
      db
        .prepare("SELECT id, name, status, published_at, body_json FROM workout_plans WHERE client_id = ? AND status = 'published' LIMIT 1")
        .bind(clientId)
        .all<{ id: string; name: string; status: string; published_at: string; body_json: string | null }>(),
      db
        .prepare("SELECT date_local FROM check_ins WHERE client_id = ? ORDER BY date_local DESC LIMIT 30")
        .bind(clientId)
        .all<{ date_local: string }>(),
      db
        .prepare("SELECT COUNT(*) AS n FROM lab_tests WHERE client_id = ? AND status IN ('requested','scheduled')")
        .bind(clientId)
        .first<{ n: number }>(),
      db
        .prepare("SELECT weight_kg, date_local FROM measurements WHERE client_id = ? AND weight_kg IS NOT NULL ORDER BY date_local DESC LIMIT 30")
        .bind(clientId)
        .all<{ weight_kg: number; date_local: string }>(),
    ]);

    // Access lifecycle — powers the client's no-plan / expiring / expired /
    // coach-account notices. Only surfaces a "buy" prompt in tenancies that
    // actually sell packages (`sellsPackages`); generous tenancies stay silent.
    const nowInstant = new Date().toISOString();
    const [accessSub, sells, tenantSub] = await Promise.all([
      db.prepare("SELECT status, budgets_json FROM client_subscriptions WHERE client_id = ? AND status IN ('active','paused','expired') ORDER BY started_at DESC LIMIT 1").bind(clientId).first<{ status: string; budgets_json: string | null }>(),
      db.prepare("SELECT COUNT(*) AS n FROM packages WHERE tenant_id = ? AND active = 1 AND visibility = 'marketplace'").bind(access.client.tenant_id).first<{ n: number }>(),
      db.prepare("SELECT status FROM subscriptions WHERE tenant_id = ?").bind(access.client.tenant_id).first<{ status: string }>(),
    ]);
    const accessBudgets = parseJson<Budget[]>(accessSub?.budgets_json, []);
    const accessSummary = {
      hasSubscription: Boolean(accessSub),
      daysRemaining: accessSub ? overallDaysRemaining(accessBudgets, nowInstant) : null,
      expired: Boolean(accessSub) && isFullyExpired(accessBudgets, nowInstant),
      workoutActive: !accessSub || hasActiveBudget(accessBudgets, "workout", nowInstant),
      mealActive: !accessSub || hasActiveBudget(accessBudgets, "meal", nowInstant),
      sellsPackages: (sells?.n ?? 0) > 0,
      // Passthrough: when the tenant is suspended for non-payment to Mossa, the
      // client's tenant-derived paid features are already clamped off upstream —
      // this flag lets the app explain why, gently.
      tenantDelinquent: SUSPENDED_STATUSES.has(tenantSub?.status ?? "active"),
    };

    const workoutSets = (workout.results ?? []).reduce((n, row) => {
      const entries = parseJson<SessionEntry[]>(row.entries_json, []);
      return n + entries.reduce((m, e) => m + e.sets.filter((s) => s.completed !== false).length, 0);
    }, 0);
    const sessionOverride = (workout.results ?? []).reduce(
      (n, row) => n + (row.session_calories ?? 0),
      0,
    );

    return c.json({
      date,
      nutrition: {
        calories: Math.round(food?.calories ?? 0),
        proteinG: Math.round(food?.protein ?? 0),
        carbsG: Math.round(food?.carbs ?? 0),
        fatG: Math.round(food?.fat ?? 0),
      },
      waterMl: water?.total_ml ?? 0,
      burnedKcal: sessionOverride > 0 ? sessionOverride : Math.round(activities?.burned ?? 0),
      workout: { loggedSets: workoutSets, sessions: workout.results ?? [] },
      checkedIn: Boolean(checkIn),
      goal: goal ? { targets: parseJson(goal.targets_json, null), weeklyLoadTarget: goal.weekly_load_target } : null,
      publishedWorkoutPlan: (plans.results ?? [])[0]
        ? {
            id: plans.results![0]!.id,
            name: plans.results![0]!.name,
            body: parseJson(plans.results![0]!.body_json, { days: [] }),
          }
        : null,
      access: accessSummary,
      checkInDates: (checkInDates.results ?? []).map((r) => r.date_local),
      pendingLabs: pendingLabs?.n ?? 0,
      weightSeries: (weights.results ?? []).map((r) => ({ kg: r.weight_kg, date: r.date_local })).reverse(),
      // Client-scoped home widget layout (editable by the client OR their coach),
      // so a coach can arrange a client's hero on their behalf.
      widgets: parseJson<{ widgets?: unknown[] }>(access.client.dashboard_prefs_json, {}).widgets ?? null,
      // Profile completeness — drives the "finish your profile" prompt so the
      // coach can build accurate macro/goal targets.
      profile: (() => {
        const gaps = profileGaps({
          gender: access.client.gender,
          dateOfBirth: access.client.date_of_birth,
          heightCm: access.client.height_cm,
          prefs: parseJson<ClientPreferences>(access.client.preferences_json, {}),
        });
        return { complete: gaps.length === 0, gaps };
      })(),
    });
  });
