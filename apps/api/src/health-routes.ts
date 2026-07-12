/**
 * Supplements + lab tests + exercise swap requests (SPEC §8.3, §8.8).
 * Supplement logging is a tap-to-toggle per (date, supplement, slot); lab
 * tests move request → uploaded → reviewed; swaps carry slot coordinates and
 * auto-approve when the suggestion is a listed alternative.
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  wellnessScore, sessionLoad, epley1Rm, activityByKey, presetRange, addDays,
  DEFAULT_WEEKLY_LOAD_TARGET, type LoggedSetLike, type WellnessInput,
} from "@mossa/domain";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { requireClientAccess } from "./clients.js";
import { newId, nowIso } from "./ids.js";
import { parseJson, j } from "./db.js";
import { notifyUser } from "./inbox-do.js";

interface SessionEntry { exerciseId: string; sets: LoggedSetLike[] }

const staffOnly = (c: { get: (k: "role") => string | null }) =>
  c.get("role") === "owner" || c.get("role") === "trainer";

export const healthRoutes = new Hono<AppEnv>()
  // ── Supplements ────────────────────────────────────────────────────────────
  .get("/supplements", async (c) => {
    const clientId = c.req.query("clientId");
    if (!clientId) return c.json({ error: "clientId required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    const rows = await c.env.DB.prepare(
      "SELECT * FROM supplements WHERE client_id = ? AND status != 'discontinued' ORDER BY created_at DESC",
    )
      .bind(clientId)
      .all();
    return c.json({
      supplements: (rows.results ?? []).map((s) => ({
        ...s,
        schedule: parseJson(s.schedule_json as string | null, []),
        schedule_json: undefined,
      })),
    });
  })

  .post("/supplements", async (c) => {
    const who = requireTenant(c)!;
    if (!staffOnly(c)) return c.json({ error: "forbidden" }, 403);
    const parsed = z
      .object({
        clientId: z.string(),
        name: z.string().min(1).max(120),
        brand: z.string().max(120).nullish(),
        kind: z.string().max(40).default("other"),
        dose: z.string().max(80).nullish(),
        schedule: z.array(z.object({ slot: z.string().max(40), notes: z.string().max(200).nullish() })).default([]),
        notes: z.string().max(1000).nullish(),
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const d = parsed.data;
    const id = newId("sup");
    await c.env.DB.prepare(
      `INSERT INTO supplements (id, tenant_id, client_id, prescribed_by, name, brand, kind, dose, schedule_json, notes, start_date, end_date, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    )
      .bind(id, who.tenantId, access.client.id, who.userId, d.name, d.brand ?? null, d.kind, d.dose ?? null, j(d.schedule), d.notes ?? null, d.startDate ?? null, d.endDate ?? null, nowIso())
      .run();
    return c.json({ ok: true, id }, 201);
  })

  .patch("/supplements/:id", async (c) => {
    const who = requireTenant(c)!;
    if (!staffOnly(c)) return c.json({ error: "forbidden" }, 403);
    const parsed = z
      .object({ status: z.enum(["active", "paused", "discontinued"]).optional(), dose: z.string().max(80).optional(), notes: z.string().max(1000).nullish() })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const d = parsed.data;
    const sets: string[] = [];
    const binds: unknown[] = [];
    if (d.status) (sets.push("status = ?"), binds.push(d.status));
    if (d.dose !== undefined) (sets.push("dose = ?"), binds.push(d.dose));
    if (d.notes !== undefined) (sets.push("notes = ?"), binds.push(d.notes));
    if (!sets.length) return c.json({ ok: true });
    await c.env.DB.prepare(`UPDATE supplements SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`)
      .bind(...binds, c.req.param("id"), who.tenantId)
      .run();
    return c.json({ ok: true });
  })

  // Tap-to-toggle a supplement slot for a day (client action).
  .post("/supplements/:id/log", async (c) => {
    const parsed = z
      .object({ clientId: z.string(), date: z.string(), slot: z.string().max(40) })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const { clientId, date, slot } = parsed.data;
    const supId = c.req.param("id");
    const existing = await c.env.DB.prepare(
      "SELECT 1 AS x FROM supplement_logs WHERE client_id = ? AND supplement_id = ? AND date_local = ? AND slot = ?",
    )
      .bind(clientId, supId, date, slot)
      .first();
    if (existing) {
      await c.env.DB.prepare(
        "DELETE FROM supplement_logs WHERE client_id = ? AND supplement_id = ? AND date_local = ? AND slot = ?",
      )
        .bind(clientId, supId, date, slot)
        .run();
      return c.json({ ok: true, taken: false });
    }
    await c.env.DB.prepare(
      "INSERT INTO supplement_logs (client_id, supplement_id, date_local, slot, tenant_id, taken_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(clientId, supId, date, slot, access.client.tenant_id, nowIso())
      .run();
    return c.json({ ok: true, taken: true });
  })

  .get("/supplements/logs", async (c) => {
    const clientId = c.req.query("clientId");
    const date = c.req.query("date");
    if (!clientId || !date) return c.json({ error: "clientId + date required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    const rows = await c.env.DB.prepare(
      "SELECT supplement_id, slot FROM supplement_logs WHERE client_id = ? AND date_local = ?",
    )
      .bind(clientId, date)
      .all();
    return c.json({ taken: rows.results ?? [] });
  })

  // ── Lab tests ──────────────────────────────────────────────────────────────
  .get("/labs", async (c) => {
    const clientId = c.req.query("clientId");
    if (!clientId) return c.json({ error: "clientId required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    const rows = await c.env.DB.prepare(
      "SELECT * FROM lab_tests WHERE client_id = ? ORDER BY created_at DESC",
    )
      .bind(clientId)
      .all();
    return c.json({
      labs: (rows.results ?? []).map((l) => ({ ...l, values: parseJson(l.values_json as string | null, null), values_json: undefined })),
    });
  })

  .post("/labs", async (c) => {
    const who = requireTenant(c)!;
    if (!staffOnly(c)) return c.json({ error: "forbidden" }, 403);
    const parsed = z
      .object({
        clientId: z.string(),
        type: z.string().max(60),
        customType: z.string().max(120).nullish(),
        displayName: z.string().max(120).nullish(),
        instructions: z.string().max(2000).nullish(),
        dueBy: z.string().nullish(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const d = parsed.data;
    const id = newId("lab");
    await c.env.DB.prepare(
      `INSERT INTO lab_tests (id, tenant_id, client_id, requested_by, type, custom_type, display_name, instructions, due_by, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?)`,
    )
      .bind(id, who.tenantId, access.client.id, who.userId, d.type, d.customType ?? null, d.displayName ?? d.customType ?? d.type, d.instructions ?? null, d.dueBy ?? null, nowIso())
      .run();
    // Notify the client to complete the request.
    if (access.client.user_id) {
      await c.env.DB.prepare(
        "INSERT INTO notifications (id, tenant_id, recipient_user_id, type, title, message, link, created_at) VALUES (?, ?, ?, 'lab_requested', ?, ?, '/progress', ?)",
      )
        .bind(newId("ntf"), who.tenantId, access.client.user_id, "New lab test requested", d.displayName ?? d.type, nowIso())
        .run()
        .catch(() => undefined);
      await notifyUser(c.env, access.client.user_id);
    }
    return c.json({ ok: true, id }, 201);
  })

  // Client flips requested → uploaded (attaches a file key + notes).
  .post("/labs/:id/upload", async (c) => {
    const parsed = z
      .object({ clientId: z.string(), fileKey: z.string().max(200), clientNotes: z.string().max(1000).nullish() })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    await c.env.DB.prepare(
      "UPDATE lab_tests SET status = 'uploaded', file_key = ?, client_notes = ?, uploaded_at = ? WHERE id = ? AND client_id = ?",
    )
      .bind(parsed.data.fileKey, parsed.data.clientNotes ?? null, nowIso(), c.req.param("id"), access.client.id)
      .run();
    // Notify the primary trainer to review.
    const primary = await c.env.DB.prepare(
      "SELECT trainer_user_id FROM client_trainers WHERE client_id = ? ORDER BY is_primary DESC LIMIT 1",
    )
      .bind(access.client.id)
      .first<{ trainer_user_id: string }>();
    if (primary) {
      await c.env.DB.prepare(
        "INSERT INTO notifications (id, tenant_id, recipient_user_id, type, title, message, link, created_at) VALUES (?, ?, ?, 'lab_uploaded', ?, '', ?, ?)",
      )
        .bind(newId("ntf"), access.client.tenant_id, primary.trainer_user_id, `${access.client.display_name} uploaded a lab result`, `/clients/${access.client.id}/manage`, nowIso())
        .run()
        .catch(() => undefined);
      await notifyUser(c.env, primary.trainer_user_id);
    }
    return c.json({ ok: true });
  })

  // Trainer reviews: attach extracted values + feedback.
  .patch("/labs/:id", async (c) => {
    const who = requireTenant(c)!;
    if (!staffOnly(c)) return c.json({ error: "forbidden" }, 403);
    const parsed = z
      .object({
        status: z.enum(["requested", "scheduled", "uploaded", "reviewed", "cancelled"]).optional(),
        values: z.array(z.object({ marker: z.string(), value: z.string(), unit: z.string().nullish(), refRange: z.string().nullish(), flag: z.enum(["low", "normal", "high"]).nullish() })).nullish(),
        trainerFeedback: z.string().max(2000).nullish(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const d = parsed.data;
    const sets: string[] = [];
    const binds: unknown[] = [];
    if (d.status) {
      sets.push("status = ?");
      binds.push(d.status);
      if (d.status === "reviewed") (sets.push("reviewed_at = ?"), binds.push(nowIso()));
    }
    if (d.values !== undefined) (sets.push("values_json = ?"), binds.push(d.values ? j(d.values) : null));
    if (d.trainerFeedback !== undefined) (sets.push("trainer_feedback = ?"), binds.push(d.trainerFeedback));
    if (!sets.length) return c.json({ ok: true });
    await c.env.DB.prepare(`UPDATE lab_tests SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`)
      .bind(...binds, c.req.param("id"), who.tenantId)
      .run();
    return c.json({ ok: true });
  })

  // ── Wellness Score: one composite 0-100 over the last 7 days ────────────────
  .get("/wellness/score", async (c) => {
    const clientId = c.req.query("clientId");
    if (!clientId) return c.json({ error: "clientId required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    const db = c.env.DB;
    const cid = access.client.id;
    const today = c.req.query("today") ?? new Date().toISOString().slice(0, 10);
    const { start, end } = presetRange("7d", today);
    const prStart = addDays(today, -83); // longer window for a PR baseline

    const [foods, sessionsWk, sessionsHist, acts, water, checkins, sleeps, moods, supps, suppLogs, measures, goal] = await Promise.all([
      db.prepare("SELECT date_local, COALESCE(SUM(calories),0) AS cal, COALESCE(SUM(protein_g),0) AS pro FROM food_entries WHERE client_id=? AND date_local>=? AND date_local<=? GROUP BY date_local").bind(cid, start, end).all<{ date_local: string; cal: number; pro: number }>(),
      db.prepare("SELECT date_local, entries_json FROM exercise_logs WHERE client_id=? AND date_local>=? AND date_local<=?").bind(cid, start, end).all<{ date_local: string; entries_json: string | null }>(),
      db.prepare("SELECT date_local, entries_json FROM exercise_logs WHERE client_id=? AND date_local>=? AND date_local<=?").bind(cid, prStart, end).all<{ date_local: string; entries_json: string | null }>(),
      db.prepare("SELECT date_local, activity_key, duration_min FROM activity_logs WHERE client_id=? AND date_local>=? AND date_local<=?").bind(cid, start, end).all<{ date_local: string; activity_key: string | null; duration_min: number | null }>(),
      db.prepare("SELECT date_local, total_ml FROM water_logs WHERE client_id=? AND date_local>=? AND date_local<=?").bind(cid, start, end).all<{ date_local: string; total_ml: number }>(),
      db.prepare("SELECT date_local, mood, energy, stress, sleep_hours FROM check_ins WHERE client_id=? AND date_local>=? AND date_local<=?").bind(cid, start, end).all<{ date_local: string; mood: number | null; energy: number | null; stress: number | null; sleep_hours: number | null }>(),
      db.prepare("SELECT date_local, duration_minutes FROM sleep_logs WHERE client_id=? AND date_local>=? AND date_local<=?").bind(cid, start, end).all<{ date_local: string; duration_minutes: number }>(),
      db.prepare("SELECT date_local, mood, energy, stress FROM mood_logs WHERE client_id=? AND date_local>=? AND date_local<=?").bind(cid, start, end).all<{ date_local: string; mood: number | null; energy: number | null; stress: number | null }>(),
      db.prepare("SELECT id, schedule_json FROM supplements WHERE client_id=? AND status='active'").bind(cid).all<{ id: string; schedule_json: string | null }>(),
      db.prepare("SELECT COUNT(*) AS n FROM supplement_logs WHERE client_id=? AND date_local>=? AND date_local<=?").bind(cid, start, end).first<{ n: number }>(),
      db.prepare("SELECT date_local, weight_kg, body_fat_percent FROM measurements WHERE client_id=? AND date_local>=? ORDER BY date_local").bind(cid, addDays(today, -45)).all<{ date_local: string; weight_kg: number | null; body_fat_percent: number | null }>(),
      db.prepare("SELECT targets_json, weekly_load_target, derivation_json FROM client_goals WHERE client_id=? AND status='active' ORDER BY created_at DESC LIMIT 1").bind(cid).first<{ targets_json: string | null; weekly_load_target: number | null; derivation_json: string | null }>(),
    ]);

    const targets = parseJson<{ targetCalories?: number; targetProteinG?: number; targetWaterMl?: number }>(goal?.targets_json, {});
    const loggedDays = new Set<string>();
    const mark = (d: string) => loggedDays.add(d);

    // Nutrition: continuous adherence over logged days.
    const calParts: number[] = [];
    const proParts: number[] = [];
    for (const f of foods.results ?? []) {
      mark(f.date_local);
      if (targets.targetCalories && f.cal > 0) calParts.push(1 - Math.min(1, Math.abs(f.cal - targets.targetCalories) / targets.targetCalories));
      if (targets.targetProteinG && f.pro > 0) proParts.push(Math.min(1, f.pro / targets.targetProteinG));
    }
    const foodLoggedDays = (foods.results ?? []).filter((f) => f.cal > 0).length;
    // Nutrition only counts once it's relevant — the client has a calorie target
    // or has actually logged food. A brand-new client with neither isn't scored 0.
    const nutritionRelevant = !!targets.targetCalories || foodLoggedDays > 0;

    // Training: active days + weekly load; PRs from a longer baseline.
    const activeDaySet = new Set<string>();
    let weeklyLoad = 0;
    for (const s of sessionsWk.results ?? []) {
      const entries = parseJson<SessionEntry[]>(s.entries_json, []);
      const sets = entries.flatMap((e) => e.sets);
      if (sets.some((x) => x.completed !== false)) { activeDaySet.add(s.date_local); mark(s.date_local); }
      weeklyLoad += sessionLoad({ sets });
    }
    for (const a of acts.results ?? []) {
      activeDaySet.add(a.date_local); mark(a.date_local);
      weeklyLoad += sessionLoad({ cardio: [{ met: activityByKey(a.activity_key ?? "").met, durationMin: a.duration_min ?? 0 }] });
    }
    // PRs this week: best e1RM per exercise across the baseline window, counted
    // fresh when the best set falls inside the current week.
    const best = new Map<string, { e1: number; date: string }>();
    for (const s of [...(sessionsHist.results ?? [])].sort((a, b) => a.date_local.localeCompare(b.date_local))) {
      for (const e of parseJson<SessionEntry[]>(s.entries_json, [])) {
        for (const set of e.sets) {
          if (set.completed === false || !set.weightKg || !set.reps) continue;
          const e1 = epley1Rm(set.weightKg, set.reps);
          if (e1 == null) continue;
          const cur = best.get(e.exerciseId);
          if (!cur || e1 > cur.e1) best.set(e.exerciseId, { e1, date: s.date_local });
        }
      }
    }
    const prsThisWeek = [...best.values()].filter((b) => b.date >= start && b.date <= end).length;

    // Hydration: average of daily fill vs target over 7 calendar days.
    let hydrationRatio: number | null = null;
    if (targets.targetWaterMl && targets.targetWaterMl > 0) {
      const byDay = new Map<string, number>();
      for (const w of water.results ?? []) { byDay.set(w.date_local, w.total_ml); if (w.total_ml > 0) mark(w.date_local); }
      let sum = 0;
      for (let d = start; d <= end; d = addDays(d, 1)) sum += Math.min(1, (byDay.get(d) ?? 0) / targets.targetWaterMl);
      hydrationRatio = sum / 7;
    }

    // Sleep: prefer sleep logs, fall back to check-in hours.
    const sleepHours: number[] = [];
    for (const s of sleeps.results ?? []) { sleepHours.push(s.duration_minutes / 60); mark(s.date_local); }
    for (const ci of checkins.results ?? []) if (ci.sleep_hours != null && !(sleeps.results ?? []).some((s) => s.date_local === ci.date_local)) sleepHours.push(ci.sleep_hours);
    const avgSleepHours = sleepHours.length ? sleepHours.reduce((a, b) => a + b, 0) / sleepHours.length : null;

    // Mood/energy/stress: check-ins + mood logs.
    const moodV: number[] = [], enV: number[] = [], stV: number[] = [];
    for (const r of [...(checkins.results ?? []), ...(moods.results ?? [])]) {
      if (r.mood != null) moodV.push(r.mood);
      if (r.energy != null) enV.push(r.energy);
      if (r.stress != null) stV.push(r.stress);
    }
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

    // Consistency.
    const checkInDays = new Set<string>();
    for (const ci of checkins.results ?? []) { checkInDays.add(ci.date_local); mark(ci.date_local); }
    for (const m of moods.results ?? []) mark(m.date_local);

    // Supplements: taken / (active slots × 7).
    let supplementAdherence: number | null = null;
    if ((supps.results ?? []).length > 0) {
      const slots = (supps.results ?? []).reduce((n, s) => n + Math.max(1, parseJson<{ slot: string }[]>(s.schedule_json, []).length), 0);
      const expected = slots * 7;
      supplementAdherence = expected > 0 ? Math.min(1, (suppLogs?.n ?? 0) / expected) : null;
    }

    // Body: favourable weight movement given goal direction.
    const bodyProgress = computeBodyProgress(measures.results ?? [], parseJson<{ primaryGoal?: string }>(goal?.derivation_json, {}).primaryGoal);

    const input: WellnessInput = {
      activeDays: activeDaySet.size,
      weeklyLoad,
      weeklyLoadTarget: goal?.weekly_load_target ?? DEFAULT_WEEKLY_LOAD_TARGET,
      prsThisWeek,
      calorieAdherence: calParts.length ? calParts.reduce((a, b) => a + b, 0) / calParts.length : null,
      proteinAdherence: proParts.length ? proParts.reduce((a, b) => a + b, 0) / proParts.length : null,
      foodLoggedDays: nutritionRelevant ? foodLoggedDays : null,
      hydrationRatio,
      avgSleepHours,
      avgMood: mean(moodV),
      avgEnergy: mean(enV),
      avgStress: mean(stV),
      loggedDays: loggedDays.size,
      checkInDays: checkInDays.size,
      supplementAdherence,
      bodyProgress,
    };
    return c.json({ ...wellnessScore(input), input });
  })

  // ── Exercise swap requests ─────────────────────────────────────────────────
  .get("/swaps", async (c) => {
    const who = requireTenant(c)!;
    const clientId = c.req.query("clientId");
    if (clientId) {
      const access = await requireClientAccess(c, clientId);
      if ("response" in access) return access.response;
      const rows = await c.env.DB.prepare(
        "SELECT * FROM swap_requests WHERE client_id = ? ORDER BY created_at DESC",
      )
        .bind(clientId)
        .all();
      return c.json({ swaps: rows.results ?? [] });
    }
    // Trainer view: all pending swaps in the tenant (roster-scoped in UI).
    const rows = await c.env.DB.prepare(
      "SELECT * FROM swap_requests WHERE tenant_id = ? AND status = 'pending' ORDER BY created_at DESC",
    )
      .bind(who.tenantId)
      .all();
    return c.json({ swaps: rows.results ?? [] });
  })

  .post("/swaps", async (c) => {
    const parsed = z
      .object({
        clientId: z.string(),
        workoutPlanId: z.string(),
        dayIndex: z.number().int().min(0),
        blockIndex: z.number().int().min(0),
        slotIndex: z.number().int().min(0),
        currentExerciseId: z.string(),
        // Optional: a bound alternative the client picked (auto-applies). Absent
        // = an open request — the client just asks, the coach picks + approves.
        suggestedExerciseId: z.string().nullish(),
        reason: z.string().max(500).nullish(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const d = parsed.data;

    // Auto-approve ONLY when the client picked a bound alternative (per tenant).
    const alt = d.suggestedExerciseId
      ? await c.env.DB.prepare(
          "SELECT 1 AS x FROM exercise_alternatives WHERE ((exercise_a = ? AND exercise_b = ?) OR (exercise_a = ? AND exercise_b = ?)) AND (tenant_id = ? OR tenant_id IS NULL)",
        )
          .bind(d.currentExerciseId, d.suggestedExerciseId, d.suggestedExerciseId, d.currentExerciseId, access.client.tenant_id)
          .first()
      : null;
    const id = newId("swap");
    const autoApprove = Boolean(alt);
    await c.env.DB.prepare(
      `INSERT INTO swap_requests (id, tenant_id, client_id, workout_plan_id, day_index, block_index, slot_index, current_exercise_id, suggested_exercise_id, reason, status, created_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, access.client.tenant_id, access.client.id, d.workoutPlanId, d.dayIndex, d.blockIndex, d.slotIndex, d.currentExerciseId, d.suggestedExerciseId ?? null, d.reason ?? null, autoApprove ? "approved" : "pending", nowIso(), autoApprove ? nowIso() : null)
      .run();
    if (autoApprove && d.suggestedExerciseId) await applySwap(c.env.DB, access.client.tenant_id, { ...d, suggestedExerciseId: d.suggestedExerciseId });
    else {
      const primary = await c.env.DB.prepare(
        "SELECT trainer_user_id FROM client_trainers WHERE client_id = ? ORDER BY is_primary DESC LIMIT 1",
      )
        .bind(access.client.id)
        .first<{ trainer_user_id: string }>();
      if (primary) {
        await c.env.DB.prepare(
          "INSERT INTO notifications (id, tenant_id, recipient_user_id, type, title, message, link, created_at) VALUES (?, ?, ?, 'swap_request', ?, '', ?, ?)",
        )
          .bind(newId("ntf"), access.client.tenant_id, primary.trainer_user_id, `${access.client.display_name} requested an exercise swap`, `/clients/${access.client.id}/manage`, nowIso())
          .run()
          .catch(() => undefined);
        await notifyUser(c.env, primary.trainer_user_id);
      }
    }
    return c.json({ ok: true, id, autoApproved: autoApprove }, 201);
  })

  .patch("/swaps/:id", async (c) => {
    const who = requireTenant(c)!;
    if (!staffOnly(c)) return c.json({ error: "forbidden" }, 403);
    const parsed = z
      // `replacementExerciseId` = the coach's chosen replacement for an open
      // request (or an override). Falls back to whatever the client suggested.
      .object({ status: z.enum(["approved", "rejected"]), trainerNote: z.string().max(500).nullish(), replacementExerciseId: z.string().nullish() })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const row = await c.env.DB.prepare("SELECT * FROM swap_requests WHERE id = ? AND tenant_id = ?")
      .bind(c.req.param("id"), who.tenantId)
      .first<{ client_id: string; workout_plan_id: string; day_index: number; block_index: number; slot_index: number; current_exercise_id: string; suggested_exercise_id: string | null }>();
    if (!row) return c.json({ error: "not found" }, 404);
    const replacement = parsed.data.replacementExerciseId ?? row.suggested_exercise_id;
    if (parsed.data.status === "approved" && !replacement) return c.json({ error: "choose a replacement exercise to approve" }, 400);
    await c.env.DB.prepare("UPDATE swap_requests SET status = ?, trainer_note = ?, suggested_exercise_id = ?, resolved_by = ?, resolved_at = ? WHERE id = ?")
      .bind(parsed.data.status, parsed.data.trainerNote ?? null, replacement, who.userId, nowIso(), c.req.param("id"))
      .run();
    if (parsed.data.status === "approved" && replacement) {
      await applySwap(c.env.DB, who.tenantId, {
        workoutPlanId: row.workout_plan_id,
        dayIndex: row.day_index,
        blockIndex: row.block_index,
        slotIndex: row.slot_index,
        suggestedExerciseId: replacement,
      });
      // Notify the client their swap was applied.
      const client = await c.env.DB.prepare("SELECT user_id, display_name FROM clients WHERE id = ?").bind(row.client_id).first<{ user_id: string | null; display_name: string }>();
      if (client?.user_id) {
        await c.env.DB.prepare(
          "INSERT INTO notifications (id, tenant_id, recipient_user_id, type, title, message, link, created_at) VALUES (?, ?, ?, 'swap_approved', 'Your exercise swap was applied', '', '/train', ?)",
        )
          .bind(newId("ntf"), who.tenantId, client.user_id, nowIso())
          .run()
          .catch(() => undefined);
        await notifyUser(c.env, client.user_id);
      }
    }
    return c.json({ ok: true });
  });

/**
 * Body-progress pillar (0..1): rewards weight moving toward the goal direction
 * (lose/build) or staying stable when maintaining. Null with < 2 weigh-ins so
 * the pillar simply doesn't count until there's a trend to read.
 */
function computeBodyProgress(measures: { weight_kg: number | null }[], primaryGoal?: string): number | null {
  const weights = measures.map((m) => m.weight_kg).filter((w): w is number => w != null);
  if (weights.length < 2) return null;
  const startW = weights[0]!;
  const lastW = weights[weights.length - 1]!;
  if (startW <= 0) return null;
  const pctChange = (lastW - startW) / startW; // signed
  if (primaryGoal === "lose_weight") return Math.min(1, Math.max(0, 0.5 - pctChange * 12)); // −4% ≈ 1.0
  if (primaryGoal === "build_muscle") return Math.min(1, Math.max(0, 0.5 + pctChange * 12));
  return Math.min(1, Math.max(0, 1 - Math.abs(pctChange) * 20)); // maintain/unknown: stability
}

/** Apply an approved swap directly into the plan's JSON body. */
async function applySwap(
  db: D1Database,
  tenantId: string,
  d: { workoutPlanId: string; dayIndex: number; blockIndex: number; slotIndex: number; suggestedExerciseId: string },
): Promise<void> {
  const plan = await db
    .prepare("SELECT body_json FROM workout_plans WHERE id = ? AND tenant_id = ?")
    .bind(d.workoutPlanId, tenantId)
    .first<{ body_json: string | null }>();
  if (!plan) return;
  const body = parseJson<{ days: { blocks: { slots: { exerciseId: string }[] }[] }[] }>(plan.body_json, { days: [] });
  const slot = body.days[d.dayIndex]?.blocks[d.blockIndex]?.slots[d.slotIndex];
  if (slot) {
    slot.exerciseId = d.suggestedExerciseId;
    await db
      .prepare("UPDATE workout_plans SET body_json = ?, updated_at = ? WHERE id = ?")
      .bind(j(body), nowIso(), d.workoutPlanId)
      .run();
  }
}
