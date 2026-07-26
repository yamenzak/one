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
import { gateFeature } from "./client-flags.js";
import { requireClientAccess, visibleClientIds } from "./clients.js";
import { loadGoalTimeline } from "./goals.js";
import { newId, nowIso } from "./ids.js";
import { parseJson, j } from "./db.js";
import { notify } from "./notify.js";
import { recordAudit } from "./audit.js";

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
    // Default is ACTIVE-only — the loggable surfaces (Today, Wellness, widgets)
    // must never show a paused supplement, whoever is viewing them (a client, or
    // a coach looking at the client's Today tab, or an owner in train mode). Only
    // the coach's management view opts in with ?includePaused=1 (staff only) so
    // it can list paused rows to resume them.
    const includePaused = c.req.query("includePaused") === "1" && c.get("role") !== "client";
    const statusFilter = includePaused ? "status != 'discontinued'" : "status = 'active'";
    const rows = await c.env.DB.prepare(
      `SELECT * FROM supplements WHERE client_id = ? AND ${statusFilter} ORDER BY created_at DESC`,
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
    { const g = await gateFeature(c, "supplementsLabs"); if (g) return g; }
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
    if (access.client.user_id) {
      await notify(c.env, { tenantId: who.tenantId, userId: access.client.user_id, type: "supplement_added", message: `${d.name}${d.dose ? ` — ${d.dose}` : ""}` });
    }
    await recordAudit(c.env, { tenantId: who.tenantId, clientId: access.client.id, actorUserId: who.userId, action: "supplement.add", summary: d.name, ref: id });
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
    // Resolve the row's owning client BEFORE writing, and enforce row-level scope
    // on it. `WHERE id = ? AND tenant_id = ?` alone is NOT sufficient for a
    // client-owned row: a trainer who is a member of the studio but absent from
    // client_trainers for this client could otherwise change the dose or flip the
    // status to discontinued on someone else's prescription — a clinical change,
    // pushed to that client as a notification, from a coach with no relationship
    // to them. Same defect class as the swap-decide check below.
    const sup = await c.env.DB.prepare("SELECT s.client_id, s.name, cl.user_id FROM supplements s JOIN clients cl ON cl.id = s.client_id WHERE s.id = ? AND s.tenant_id = ?").bind(c.req.param("id"), who.tenantId).first<{ client_id: string; name: string; user_id: string | null }>();
    if (!sup) return c.json({ error: "not found" }, 404);
    const access = await requireClientAccess(c, sup.client_id);
    if ("response" in access) return access.response;
    await c.env.DB.prepare(`UPDATE supplements SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`)
      .bind(...binds, c.req.param("id"), who.tenantId)
      .run();
    await recordAudit(c.env, { tenantId: who.tenantId, clientId: sup.client_id, actorUserId: who.userId, action: "supplement.update", summary: `${sup.name}${d.status ? ` · ${d.status}` : ""}`, ref: c.req.param("id") });
    // Tell the client when the change is one they'd act on — a status flip
    // (paused/resumed/stopped) or a dose change. A notes-only tweak is silent.
    if (sup.user_id && (d.status || d.dose !== undefined)) {
      const change = d.status ? `marked ${d.status}` : "dose updated";
      await notify(c.env, {
        tenantId: who.tenantId,
        userId: sup.user_id,
        type: "supplement_updated",
        message: `${sup.name} — ${change}`,
        vars: { coachName: c.get("user")?.name || "Your coach", supplementName: sup.name },
      });
    }
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
    // A paused/discontinued supplement isn't loggable — reject even if a stale
    // client (or a direct call) tries to toggle it.
    const sup = await c.env.DB.prepare("SELECT status FROM supplements WHERE id = ? AND client_id = ?").bind(supId, clientId).first<{ status: string }>();
    if (!sup) return c.json({ error: "supplement not found" }, 404);
    if (sup.status !== "active") return c.json({ error: "supplement is not active" }, 409);
    // Atomic toggle: DELETE first (idempotent) — if it removed a row the slot was
    // taken, so it's now cleared. Otherwise INSERT OR IGNORE marks it taken. This
    // avoids the SELECT-then-INSERT TOCTOU that 500s on a double-tap (both taps
    // saw "not logged" and the second INSERT hit the composite PK).
    const del = await c.env.DB.prepare(
      "DELETE FROM supplement_logs WHERE client_id = ? AND supplement_id = ? AND date_local = ? AND slot = ?",
    )
      .bind(clientId, supId, date, slot)
      .run();
    if ((del.meta?.changes ?? 0) > 0) return c.json({ ok: true, taken: false });
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO supplement_logs (client_id, supplement_id, date_local, slot, tenant_id, taken_at) VALUES (?, ?, ?, ?, ?, ?)",
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
    { const g = await gateFeature(c, "supplementsLabs"); if (g) return g; }
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
      await notify(c.env, { tenantId: who.tenantId, userId: access.client.user_id, type: "lab_requested", message: d.displayName ?? d.type, link: `/wellness?lab=${id}` });
    }
    await recordAudit(c.env, { tenantId: who.tenantId, clientId: access.client.id, actorUserId: who.userId, action: "lab.request", summary: d.displayName ?? d.type, ref: id });
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
      await notify(c.env, { tenantId: access.client.tenant_id, userId: primary.trainer_user_id, type: "lab_uploaded", title: `${access.client.display_name} uploaded a lab result`, link: `/clients/${access.client.id}/manage?lab=${c.req.param("id")}` });
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
    // Resolve the lab's owning client BEFORE writing, and enforce row-level scope.
    // Tenant match alone let an UNASSIGNED trainer overwrite any same-tenant
    // client's values_json + trainer_feedback and flip the status to 'reviewed' —
    // forged clinical data that the client and their real coach then read as
    // authoritative. The row-level guard is the only thing that stops it.
    const lab = await c.env.DB.prepare("SELECT c.user_id AS user_id, c.id AS client_id, l.display_name AS name FROM lab_tests l JOIN clients c ON c.id = l.client_id WHERE l.id = ? AND l.tenant_id = ?").bind(c.req.param("id"), who.tenantId).first<{ user_id: string | null; client_id: string; name: string | null }>();
    if (!lab) return c.json({ error: "not found" }, 404);
    const access = await requireClientAccess(c, lab.client_id);
    if ("response" in access) return access.response;
    await c.env.DB.prepare(`UPDATE lab_tests SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`)
      .bind(...binds, c.req.param("id"), who.tenantId)
      .run();
    if (d.status === "reviewed") {
      if (lab.user_id) await notify(c.env, { tenantId: who.tenantId, userId: lab.user_id, type: "lab_reviewed", message: lab.name ?? "", link: `/wellness?lab=${c.req.param("id")}` });
      await recordAudit(c.env, { tenantId: who.tenantId, clientId: lab.client_id, actorUserId: who.userId, action: "lab.review", summary: lab.name ?? "", ref: c.req.param("id") });
    }
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

    const [foods, sessionsWk, sessionsHist, acts, water, checkins, sleeps, moods, supps, suppLogs, measures, timeline] = await Promise.all([
      db.prepare("SELECT date_local, COALESCE(SUM(calories),0) AS cal, COALESCE(SUM(protein_g),0) AS pro, MAX(target_calories) AS tcal, MAX(target_protein_g) AS tpro FROM food_entries WHERE client_id=? AND date_local>=? AND date_local<=? GROUP BY date_local").bind(cid, start, end).all<{ date_local: string; cal: number; pro: number; tcal: number | null; tpro: number | null }>(),
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
      loadGoalTimeline(db, cid),
    ]);

    // Headline targets (water + relevance) = the goal active today. Per-day
    // calorie/protein adherence resolves the goal in force on each logged day
    // (frozen per-log snapshot first, then the goal timeline).
    const targets = timeline.active;
    const loggedDays = new Set<string>();
    const mark = (d: string) => loggedDays.add(d);

    // Nutrition: continuous adherence over logged days, each graded against the
    // day's own target so a later goal change never re-grades past days.
    const calParts: number[] = [];
    const proParts: number[] = [];
    for (const f of foods.results ?? []) {
      mark(f.date_local);
      const dayCal = f.tcal ?? timeline.resolve(f.date_local)?.targetCalories ?? null;
      const dayPro = f.tpro ?? timeline.resolve(f.date_local)?.targetProteinG ?? null;
      if (dayCal && f.cal > 0) calParts.push(1 - Math.min(1, Math.abs(f.cal - dayCal) / dayCal));
      if (dayPro && f.pro > 0) proParts.push(Math.min(1, f.pro / dayPro));
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
    const bodyProgress = computeBodyProgress(measures.results ?? [], (timeline.derivation as { primaryGoal?: string })?.primaryGoal);

    const input: WellnessInput = {
      activeDays: activeDaySet.size,
      weeklyLoad,
      weeklyLoadTarget: timeline.weeklyLoadTarget ?? DEFAULT_WEEKLY_LOAD_TARGET,
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
    // No clientId = the COACH's pending-swaps queue. Two things have to hold here.
    //
    // 1. This route rides `tracking:["read"]`, a permission the CLIENT role holds,
    //    so without an explicit reject any signed-in client could call it with no
    //    query params and read every other client's pending swap: their client_id,
    //    workout_plan_id, the client-authored `reason` free text (typically injury
    //    or pain detail), the coach's trainer_note and resolved_by. A client must
    //    always ask for their own id, which then goes through requireClientAccess.
    if (c.get("role") === "client") return c.json({ error: "clientId required" }, 400);
    // 2. "Roster-scoped in the UI" is not scope. Tenant match alone handed an
    //    UNASSIGNED trainer a tenant-wide queue, breaking the client_trainers
    //    invariant; scope the query to the ids they may actually see (owners and
    //    assistants legitimately see the whole roster → "all").
    const scope = await visibleClientIds(c);
    if (scope !== "all" && scope.length === 0) return c.json({ swaps: [] });
    const where =
      scope === "all"
        ? "tenant_id = ? AND status = 'pending'"
        : `tenant_id = ? AND status = 'pending' AND client_id IN (${scope.map(() => "?").join(",")})`;
    const binds = scope === "all" ? [who.tenantId] : [who.tenantId, ...scope];
    const rows = await c.env.DB.prepare(`SELECT * FROM swap_requests WHERE ${where} ORDER BY created_at DESC`)
      .bind(...binds)
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

    // The plan being swapped must belong to THIS client — requireClientAccess
    // above only scoped the clientId, not the workoutPlanId. Without this a
    // client could pass their own clientId but another client's plan id and,
    // on the auto-approve path, overwrite that client's plan (cross-client IDOR
    // write, tenant scope alone doesn't stop it). Mirror plan-routes: resolve
    // the plan's owner and require access to it.
    const planRow = await c.env.DB.prepare("SELECT client_id FROM workout_plans WHERE id = ? AND tenant_id = ?")
      .bind(d.workoutPlanId, access.client.tenant_id)
      .first<{ client_id: string }>();
    if (!planRow || planRow.client_id !== access.client.id) return c.json({ error: "plan not found" }, 404);

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
        await notify(c.env, { tenantId: access.client.tenant_id, userId: primary.trainer_user_id, type: "swap_request", title: `${access.client.display_name} requested an exercise swap`, link: `/clients/${access.client.id}/manage?swap=${id}` });
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
    // Tenant match alone lets an UNASSIGNED trainer mutate any client's plan.
    // Enforce row-level scope on the swap's client (trainer = assignment).
    const access = await requireClientAccess(c, row.client_id);
    if ("response" in access) return access.response;
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
      const client = await c.env.DB.prepare("SELECT user_id FROM clients WHERE id = ?").bind(row.client_id).first<{ user_id: string | null }>();
      if (client?.user_id) await notify(c.env, { tenantId: who.tenantId, userId: client.user_id, type: "swap_approved" });
    } else if (parsed.data.status === "rejected") {
      // Previously silent — the client was left waiting. Tell them the coach kept the original.
      const client = await c.env.DB.prepare("SELECT user_id FROM clients WHERE id = ?").bind(row.client_id).first<{ user_id: string | null }>();
      if (client?.user_id) await notify(c.env, { tenantId: who.tenantId, userId: client.user_id, type: "swap_rejected", message: parsed.data.trainerNote ?? "" });
    }
    await recordAudit(c.env, { tenantId: who.tenantId, clientId: row.client_id, actorUserId: who.userId, action: "swap.decide", summary: parsed.data.status, ref: c.req.param("id") });
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
