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
import { activityByKey, estimateBurnedCalories } from "@mossa/domain";
import { type AppEnv } from "./auth-context.js";
import { requireClientAccess } from "./clients.js";
import { newId, nowIso } from "./ids.js";
import { parseJson, j } from "./db.js";

/** Every log payload arrives wrapped with the target clientId. */
const withClient = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({ clientId: z.string().min(1), data: schema });

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
      "INSERT INTO food_entries (id, tenant_id, client_id, date_local, meal_type, food_id, label, quantity, unit, calories, protein_g, carbs_g, fat_g, source, meal_plan_id, meal_option_index, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
      "SELECT fe.*, f.image_url AS image_url FROM food_entries fe LEFT JOIN foods f ON f.id = fe.food_id WHERE fe.client_id = ? AND fe.date_local = ? ORDER BY fe.created_at",
    )
      .bind(clientId, date)
      .all();
    return c.json({ entries: rows.results ?? [] });
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
          `/clients/${access.client.id}/check-ins`,
          nowIso(),
        )
        .run()
        .catch(() => undefined);
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
      checkInDates: (checkInDates.results ?? []).map((r) => r.date_local),
      pendingLabs: pendingLabs?.n ?? 0,
      weightSeries: (weights.results ?? []).map((r) => ({ kg: r.weight_kg, date: r.date_local })).reverse(),
    });
  });
