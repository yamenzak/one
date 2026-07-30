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
} from "@kova/protocol";
import { activityByKey, estimateBurnedCalories, resolveWeeklyLoadTarget, sessionTonnage, bodyComposition, calculateBMI, calculateBMR, ageFromDob, profileGaps, overallDaysRemaining, isFullyExpired, hasActiveBudget, epley1Rm, SUSPENDED_STATUSES, type ClientPreferences, type Budget } from "@kova/domain";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { requireClientAccess, type ClientRow } from "./clients.js";
import { newId, nowIso } from "./ids.js";
import { notify } from "./notify.js";
import { recordAudit } from "./audit.js";
import { parseJson, j } from "./db.js";
import { loadGoalTimeline } from "./goals.js";
import { loadClientAccessRows, accessBudgetsOf, REPORTED_ACCESS_STATUSES, gateFeature } from "./client-flags.js";

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

// ── Log-detail contract (shared with the app's Today-item detail page). Values
//    are RAW METRIC numbers (kg / m / ml / kcal); the client formats to the
//    user's units. `unit` is the semantic kind, not a fixed display unit. ──────
type UnitKind =
  | "energy" | "weight" | "volume" | "distance" | "length" | "count"
  | "minutes" | "hours" | "percent" | "rating" | "bpm" | "raw";
interface Stat { label: string; value: number | null; unit: UnitKind }
interface SeriesPoint { date?: string; label?: string; value: number }
interface DetailSeries { title: string; unit: UnitKind; chart: "area" | "bar"; points: SeriesPoint[]; targetValue?: number | null }
interface LogDetailResponse {
  kind: string;
  date: string;
  title: string;
  subtitle?: string | null;
  tone: string;
  hero?: { value: number; unit: UnitKind; label: string } | null;
  stats: Stat[];
  items: { title: string; sub?: string | null }[];
  rows: { label: string; value: string }[];
  note?: string | null;
  series?: DetailSeries | null;
}

const DETAIL_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-07-24" → "Jul 24" (deterministic, ICU-free) for chart point labels. */
function shortDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? "");
  if (!m) return d ?? "";
  return `${DETAIL_MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`;
}
const detailMealLabel = (t: string): string =>
  ({ breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack", pre_workout: "Pre-workout", post_workout: "Post-workout", free: "Free meal" } as Record<string, string>)[t] ??
  t.replace(/_/g, " ").replace(/^\w/, (x) => x.toUpperCase());
const round1 = (n: number): number => Math.round(n * 10) / 10;
/** N local dates (oldest→newest) ending inclusive at `end`. */
function lastNDates(end: string, n: number): string[] {
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(endMs)) return [end];
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(new Date(endMs - i * 86_400_000).toISOString().slice(0, 10));
  return out;
}
const pt = (d: string, value: number): SeriesPoint => ({ date: d, label: shortDate(d), value });

/**
 * Fan a submitted check-in out to the per-metric tables the log drawer writes.
 *
 * Last write wins, deliberately: the check-in form pre-fills from these very
 * tables, so an unchanged field submits the value it already held (a no-op) and
 * a changed one is an intentional correction. `COALESCE(?, column)` guards the
 * fields a partial submit omits, so sending a note does not erase a rating.
 */
async function writeThroughCheckIn(
  db: D1Database,
  client: { id: string; tenant_id: string },
  d: {
    date: string; weightKg?: number | null; sleepHours?: number | null; sleepQuality?: number | null;
    mood?: number | null; energy?: number | null; stress?: number | null;
  },
): Promise<void> {
  const now = nowIso();
  const stmts: D1PreparedStatement[] = [];

  if (d.weightKg != null) {
    stmts.push(
      db.prepare(
        "INSERT INTO measurements (id, tenant_id, client_id, date_local, weight_kg, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(client_id, date_local) DO UPDATE SET weight_kg = excluded.weight_kg",
      ).bind(newId("mea"), client.tenant_id, client.id, d.date, d.weightKg, now),
    );
  }
  if (d.sleepHours != null || d.sleepQuality != null) {
    const minutes = d.sleepHours != null ? Math.round(d.sleepHours * 60) : null;
    stmts.push(
      db.prepare(
        `INSERT INTO sleep_logs (client_id, date_local, tenant_id, duration_minutes, quality, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(client_id, date_local) DO UPDATE SET
           duration_minutes = COALESCE(excluded.duration_minutes, sleep_logs.duration_minutes),
           quality = COALESCE(excluded.quality, sleep_logs.quality),
           updated_at = excluded.updated_at`,
      ).bind(client.id, d.date, client.tenant_id, minutes, d.sleepQuality ?? null, now),
    );
  }
  if (d.mood != null || d.energy != null || d.stress != null) {
    stmts.push(
      db.prepare(
        `INSERT INTO mood_logs (client_id, date_local, tenant_id, mood, energy, stress, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(client_id, date_local) DO UPDATE SET
           mood = COALESCE(excluded.mood, mood_logs.mood),
           energy = COALESCE(excluded.energy, mood_logs.energy),
           stress = COALESCE(excluded.stress, mood_logs.stress),
           updated_at = excluded.updated_at`,
      ).bind(client.id, d.date, client.tenant_id, d.mood ?? null, d.energy ?? null, d.stress ?? null, now),
    );
  }
  if (stmts.length) await db.batch(stmts);
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

    // Read-merge-write under optimistic concurrency. Two devices (or an offline
    // batch flush) logging the same session must not clobber each other's sets
    // (last-writer-wins) or 500 on the unique-session index. Each attempt
    // re-reads, merges its sets, and commits only if the row is unchanged since
    // the read (compare-and-swap on entries_json); a lost race re-reads and
    // retries so both writers' sets survive.
    const MAX_ATTEMPTS = 5;
    for (let attempt = 1; ; attempt++) {
      let log = await db
        .prepare(
          "SELECT id, entries_json FROM exercise_logs WHERE client_id = ? AND workout_plan_id = ? AND plan_day_index = ? AND date_local = ?",
        )
        .bind(access.client.id, d.workoutPlanId, d.planDayIndex, d.date)
        .first<{ id: string; entries_json: string | null }>();

      if (!log) {
        const id = newId("elog");
        // OR IGNORE: if a concurrent request created the session first, this is a
        // no-op and we re-select the winner below rather than throwing on the
        // unique index.
        await db
          .prepare(
            "INSERT OR IGNORE INTO exercise_logs (id, tenant_id, client_id, date_local, workout_plan_id, plan_day_index, entries_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .bind(id, access.client.tenant_id, access.client.id, d.date, d.workoutPlanId, d.planDayIndex, j([]), nowIso(), nowIso())
          .run();
        log = await db
          .prepare(
            "SELECT id, entries_json FROM exercise_logs WHERE client_id = ? AND workout_plan_id = ? AND plan_day_index = ? AND date_local = ?",
          )
          .bind(access.client.id, d.workoutPlanId, d.planDayIndex, d.date)
          .first<{ id: string; entries_json: string | null }>();
        if (!log) {
          if (attempt < MAX_ATTEMPTS) continue;
          return c.json({ error: "could not create session, retry" }, 409);
        }
      }

      const prev = log.entries_json ?? "[]";
      const entries = parseJson<SessionEntry[]>(prev, []);
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
      const nextJson = j(entries);
      const res = await db
        .prepare("UPDATE exercise_logs SET entries_json = ?, updated_at = ? WHERE id = ? AND entries_json IS ?")
        .bind(nextJson, nowIso(), log.id, log.entries_json)
        .run();
      if ((res.meta?.changes ?? 0) > 0) {
        // A logged set that beats the client's all-time estimated 1RM for this
        // exercise is a PR: keep the authoritative ledger current (O(1), no
        // full-history fold) and — on a genuine improvement over an EXISTING
        // best — tell the primary trainer, once per exercise per day. Only
        // weighted sets yield an e1RM; bodyweight/timed sets update nothing.
        const submittedBest = d.sets.reduce<{ e1rm: number; weight: number; reps: number } | null>((best, s) => {
          if (s.completed === false || !s.weightKg || !s.reps) return best;
          const e = epley1Rm(s.weightKg, s.reps);
          if (e == null) return best;
          return !best || e > best.e1rm ? { e1rm: e, weight: s.weightKg, reps: s.reps } : best;
        }, null);
        if (submittedBest) {
          const prior = await db.prepare("SELECT best_e1rm FROM exercise_prs WHERE client_id = ? AND exercise_id = ?").bind(access.client.id, d.exerciseId).first<{ best_e1rm: number }>();
          if (!prior || submittedBest.e1rm > prior.best_e1rm) {
            await db.prepare(
              "INSERT INTO exercise_prs (client_id, exercise_id, best_e1rm, weight_kg, reps, tenant_id, achieved_on, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(client_id, exercise_id) DO UPDATE SET best_e1rm=excluded.best_e1rm, weight_kg=excluded.weight_kg, reps=excluded.reps, achieved_on=excluded.achieved_on, updated_at=excluded.updated_at WHERE excluded.best_e1rm > exercise_prs.best_e1rm",
            ).bind(access.client.id, d.exerciseId, submittedBest.e1rm, submittedBest.weight, submittedBest.reps, access.client.tenant_id, d.date, nowIso()).run().catch(() => undefined);
            // First-ever lift sets the baseline silently; a beat over a prior best
            // is the moment worth surfacing (never the coach's own logging).
            if (prior) {
              const actorId = requireTenant(c)?.userId;
              const primary = await db.prepare("SELECT trainer_user_id FROM client_trainers WHERE client_id = ? ORDER BY is_primary DESC LIMIT 1").bind(access.client.id).first<{ trainer_user_id: string }>();
              if (primary?.trainer_user_id && primary.trainer_user_id !== actorId) {
                // Tenant-scoped (own library or the global one): the id comes from
                // a client-supplied log payload, so an unscoped lookup would echo
                // ANOTHER tenant's private exercise name into this coach's
                // notification.
                const ex = await db.prepare("SELECT name FROM exercises WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)").bind(d.exerciseId, access.client.tenant_id).first<{ name: string }>();
                const lift = ex?.name ?? "an exercise";
                await notify(c.env, {
                  tenantId: access.client.tenant_id,
                  userId: primary.trainer_user_id,
                  type: "pr_achieved",
                  title: `${access.client.display_name} hit a PR on ${lift}`,
                  message: `${submittedBest.weight} kg × ${submittedBest.reps} — new est. 1RM ${submittedBest.e1rm} kg`,
                  link: `/clients/${access.client.id}/progress`,
                  dedupeKey: `pr_${access.client.id}_${d.exerciseId}_${d.date}`,
                });
              }
            }
          }
        }
        return c.json({ ok: true, logId: log.id, entries });
      }
      // CAS lost (a concurrent writer changed the row) — retry the merge.
      if (attempt >= MAX_ATTEMPTS) return c.json({ error: "conflict, retry" }, 409);
    }
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

  // "Last time" for a given exercise — the most recent prior session that logged
  // it, with the completed sets, for the progressive-overload hint + one-tap
  // repeat in the player. `before` (YYYY-MM-DD) excludes an in-progress day so
  // "last time" means the previous session, not today's.
  .get("/logs/exercise-last", async (c) => {
    const clientId = c.req.query("clientId");
    const exerciseId = c.req.query("exerciseId");
    if (!clientId || !exerciseId) return c.json({ error: "clientId and exerciseId required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    const before = c.req.query("before") ?? "";
    const rows = await c.env.DB.prepare(
      `SELECT date_local, entries_json FROM exercise_logs
       WHERE client_id = ? AND (? = '' OR date_local < ?)
       ORDER BY date_local DESC LIMIT 120`,
    )
      .bind(clientId, before, before)
      .all<{ date_local: string; entries_json: string | null }>();
    interface Ent { exerciseId: string; sets: { reps?: number | null; weightKg?: number | null; durationSeconds?: number | null; distanceM?: number | null; effortLabel?: string | null; completed?: boolean }[] }
    for (const r of rows.results ?? []) {
      const entries = parseJson<Ent[]>(r.entries_json, []);
      const hit = entries.find((e) => e.exerciseId === exerciseId && (e.sets ?? []).some((s) => s.completed !== false));
      if (hit) {
        const sets = hit.sets.filter((s) => s.completed !== false).map((s) => ({ reps: s.reps ?? null, weightKg: s.weightKg ?? null, durationSeconds: s.durationSeconds ?? null, distanceM: s.distanceM ?? null, effortLabel: s.effortLabel ?? null }));
        return c.json({ last: { date: r.date_local, sets } });
      }
    }
    return c.json({ last: null });
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
      "SELECT id, date_local, activity_key, label, start_time, duration_min, avg_hr_bpm, distance_m, reps, notes, calories, calories_locked FROM activity_logs WHERE client_id = ? AND date_local >= ? AND date_local <= ? ORDER BY date_local DESC, created_at DESC LIMIT 60",
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
    { const g = await gateFeature(c, "extraWorkouts", access.client.id); if (g) return g; }
    const d = parsed.data.data;
    let calories = d.caloriesBurned ?? null;
    let locked = calories != null;
    // MET estimate needs a duration; rep-only logs (push-ups) leave it null.
    if (calories == null && d.durationMin) {
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
      "INSERT INTO activity_logs (id, tenant_id, client_id, date_local, activity_key, label, start_time, duration_min, avg_hr_bpm, distance_m, reps, notes, calories, calories_locked, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        id,
        access.client.tenant_id,
        access.client.id,
        d.date,
        d.activityKey ?? null,
        d.label ?? null,
        d.startTime ?? null,
        d.durationMin ?? null,
        d.avgHrBpm ?? null,
        d.distanceM ?? null,
        d.reps ?? null,
        d.notes ?? null,
        calories,
        locked ? 1 : 0,
        nowIso(),
      )
      .run();
    return c.json({ ok: true, id, calories }, 201);
  })

  // Edit a logged activity. A user/wearable calorie number locks the row; if
  // duration/activity/HR change and calories aren't locked, re-estimate.
  .patch("/logs/activity/:id", async (c) => {
    const parsed = z
      .object({
        clientId: z.string(),
        activityKey: z.string().max(40).nullish(),
        label: z.string().max(80).nullish(),
        startTime: z.string().max(8).nullish(),
        durationMin: z.number().int().positive().nullish(),
        avgHrBpm: z.number().int().positive().nullish(),
        distanceM: z.number().min(0).nullish(),
        reps: z.number().int().positive().nullish(),
        notes: z.string().max(300).nullish(),
        caloriesBurned: z.number().int().min(0).nullish(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    { const g = await gateFeature(c, "extraWorkouts", access.client.id); if (g) return g; }
    const d = parsed.data;
    const row = await c.env.DB.prepare("SELECT activity_key, duration_min, avg_hr_bpm, calories_locked FROM activity_logs WHERE id = ? AND client_id = ?")
      .bind(c.req.param("id"), access.client.id)
      .first<{ activity_key: string | null; duration_min: number; avg_hr_bpm: number | null; calories_locked: number }>();
    if (!row) return c.json({ error: "not found" }, 404);

    const map: Record<string, unknown> = {
      activity_key: d.activityKey, label: d.label, start_time: d.startTime,
      duration_min: d.durationMin, avg_hr_bpm: d.avgHrBpm, distance_m: d.distanceM, reps: d.reps, notes: d.notes,
    };
    // Calories: an explicit number locks; otherwise re-estimate when a driver
    // changed and the row isn't already a locked (user-supplied) value.
    if (d.caloriesBurned != null) {
      map.calories = d.caloriesBurned;
      map.calories_locked = 1;
    } else if (!row.calories_locked && (d.durationMin !== undefined || d.activityKey !== undefined || d.avgHrBpm !== undefined)) {
      const weight = await c.env.DB.prepare("SELECT weight_kg FROM measurements WHERE client_id = ? AND weight_kg IS NOT NULL ORDER BY date_local DESC LIMIT 1").bind(access.client.id).first<{ weight_kg: number }>();
      if (weight?.weight_kg) {
        map.calories = estimateBurnedCalories({
          met: activityByKey((d.activityKey ?? row.activity_key) ?? "other").met,
          weightKg: weight.weight_kg,
          durationMin: d.durationMin ?? row.duration_min,
          avgHrBpm: d.avgHrBpm !== undefined ? d.avgHrBpm : row.avg_hr_bpm,
        });
      }
    }
    const sets = Object.entries(map).filter(([, v]) => v !== undefined);
    if (!sets.length) return c.json({ ok: true });
    await c.env.DB.prepare(`UPDATE activity_logs SET ${sets.map(([k]) => `${k} = ?`).join(", ")} WHERE id = ? AND client_id = ?`)
      .bind(...sets.map(([, v]) => v), c.req.param("id"), access.client.id)
      .run();
    return c.json({ ok: true, calories: map.calories });
  })

  .delete("/logs/activity/:id", async (c) => {
    const clientId = c.req.query("clientId");
    if (!clientId) return c.json({ error: "clientId required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    { const g = await gateFeature(c, "extraWorkouts", access.client.id); if (g) return g; }
    await c.env.DB.prepare("DELETE FROM activity_logs WHERE id = ? AND client_id = ?")
      .bind(c.req.param("id"), access.client.id)
      .run();
    return c.json({ ok: true });
  })

  // ── Food diary. ────────────────────────────────────────────────────────────
  .post("/logs/food", async (c) => {
    const parsed = withClient(LogFoodEntry).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    { const g = await gateFeature(c, "foodLogging", access.client.id); if (g) return g; }
    const d = parsed.data.data;
    const id = newId("fen");
    // Freeze the calorie/protein target that was in force for THIS day onto the
    // row, so a later goal change never re-grades this entry's adherence. Resolve
    // the goal whose window covers d.date (a back-dated log gets the goal that
    // applied then, which may since have been superseded).
    const goalAtLog = await c.env.DB.prepare(
      "SELECT targets_json FROM client_goals WHERE client_id = ? AND COALESCE(start_date, substr(created_at, 1, 10)) <= ? ORDER BY COALESCE(start_date, substr(created_at, 1, 10)) DESC, created_at DESC LIMIT 1",
    ).bind(access.client.id, d.date).first<{ targets_json: string | null }>();
    const snap = parseJson<{ targetCalories?: number | null; targetProteinG?: number | null }>(goalAtLog?.targets_json, {});
    await c.env.DB.prepare(
      "INSERT INTO food_entries (id, tenant_id, client_id, date_local, meal_type, food_id, label, quantity, unit, calories, protein_g, carbs_g, fat_g, source, meal_plan_id, meal_option_index, image_url, target_calories, target_protein_g, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
        snap.targetCalories ?? null,
        snap.targetProteinG ?? null,
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
    { const g = await gateFeature(c, "foodLogging", access.client.id); if (g) return g; }
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
    { const g = await gateFeature(c, "foodLogging", access.client.id); if (g) return g; }
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
    // The nutrition-trend surface itself (`showNutritionReports`), not the diary.
    { const g = await gateFeature(c, "nutritionReports", access.client.id); if (g) return g; }
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
    const fromRaw = c.req.query("from");
    const toRaw = c.req.query("to");
    if (!clientId || !fromRaw || !toRaw) return c.json({ error: "clientId + from + to required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    const db = c.env.DB;
    const cid = access.client.id;
    // Bound the window span server-side (~13 months) so a wide range can't scan
    // years of rows into memory. Anchor on the effective upper bound (min(to,
    // today) — there are no future rows) and clamp `from` UP to that minus the
    // span. This keeps the MOST RECENT window: a far-past `from` is pulled
    // forward, and a far-future `to` still catches recent rows (unlike anchoring
    // on `from`, which would drop everything after from+span).
    const MAX_SPAN_DAYS = 400;
    const to = toRaw;
    const from = (() => {
      const today = new Date().toISOString().slice(0, 10);
      const upper = toRaw < today ? toRaw : today;
      const u = Date.parse(`${upper}T00:00:00Z`);
      if (Number.isNaN(u)) return fromRaw;
      const floor = new Date(u - MAX_SPAN_DAYS * 86_400_000).toISOString().slice(0, 10);
      return fromRaw < floor ? floor : fromRaw;
    })();
    const inRange = (day: string | null | undefined) => !!day && day >= from && day <= to;
    const dayOf = (ts: string | null | undefined) => (ts ? ts.slice(0, 10) : null);

    interface Ev { id: string; kind: string; date: string; at: string; title: string; subtitle: string | null; ref?: string; actor?: string; metric?: { unit: "energy" | "volume" | "weight"; value: number } }
    const events: Ev[] = [];

    const [food, water, workouts, activities, measures, checkins, sleeps, moods, fasts, swaps, labs, wPlans, mPlans, supps, sessions, bodyScans, goals, auditRows] = await Promise.all([
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
      db.prepare("SELECT id, date_local, body_fat_percent, weight_kg, created_at FROM body_scans WHERE client_id=? AND date_local>=? AND date_local<=?").bind(cid, from, to).all<{ id: string; date_local: string; body_fat_percent: number | null; weight_kg: number | null; created_at: string }>(),
      db.prepare("SELECT id, label, created_at FROM client_goals WHERE client_id=? AND created_at>=? AND created_at<=? ORDER BY created_at DESC LIMIT 40").bind(cid, `${from}T00:00:00`, `${to}T23:59:59.999Z`).all<{ id: string; label: string; created_at: string }>(),
      // Actor attribution: which staff member drove a coach-authored event. The
      // audit log records `who did what` (ref → the affected row); we join it in
      // so the feed can say "Coach Jane published your plan" — WITHOUT exposing the
      // raw audit trail (which includes internal actions like client.archive).
      db.prepare("SELECT ref, actor_user_id, u.name AS actor FROM audit_log a LEFT JOIN \"user\" u ON u.id = a.actor_user_id WHERE a.client_id = ? ORDER BY a.at DESC LIMIT 300").bind(cid).all<{ ref: string | null; actor: string | null }>(),
    ]);
    const actorByRef = new Map<string, string>();
    for (const r of auditRows.results ?? []) if (r.ref && r.actor) actorByRef.set(r.ref, r.actor);

    const mealLabel = (t: string) => ({ breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack", pre_workout: "Pre-workout", post_workout: "Post-workout", free: "Free meal" } as Record<string, string>)[t] ?? t.replace(/_/g, " ").replace(/^\w/, (x) => x.toUpperCase());
    const dur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`);
    const atFor = (day: string, ts?: string | null) => (ts && ts.length >= 10 ? ts : `${day}T12:00:00.000Z`);

    for (const f of food.results ?? []) events.push({ id: `food-${f.date_local}-${f.meal_type}`, kind: `food:${f.meal_type}`, date: f.date_local, ref: f.date_local, at: atFor(f.date_local, f.at), title: mealLabel(f.meal_type), subtitle: `${f.n} item${f.n === 1 ? "" : "s"}`, metric: { unit: "energy", value: Math.round(f.cal) } });
    for (const w of water.results ?? []) events.push({ id: `water-${w.date_local}`, kind: "water", date: w.date_local, ref: w.date_local, at: atFor(w.date_local, w.updated_at), title: "Hydration", subtitle: null, metric: { unit: "volume", value: w.total_ml } });
    for (const s of workouts.results ?? []) {
      const entries = parseJson<SessionEntry[]>(s.entries_json, []);
      const sets = entries.reduce((n, e) => n + e.sets.filter((x) => x.completed !== false).length, 0);
      if (sets === 0) continue;
      events.push({ id: `workout-${s.date_local}`, kind: "workout", date: s.date_local, ref: s.date_local, at: atFor(s.date_local, s.updated_at || s.created_at), title: "Workout", subtitle: `${sets} set${sets === 1 ? "" : "s"}`, ...(s.session_calories && s.session_calories > 0 ? { metric: { unit: "energy" as const, value: s.session_calories } } : {}) });
    }
    for (const a of activities.results ?? []) events.push({ id: `act-${a.id}`, kind: "activity", date: a.date_local, ref: a.id, at: atFor(a.date_local, a.created_at), title: a.label || (a.activity_key ?? "Activity").replace(/_/g, " "), subtitle: [a.duration_min ? dur(a.duration_min) : null, a.avg_hr_bpm ? `HR ${a.avg_hr_bpm}` : null].filter(Boolean).join(" · ") || null, ...(a.calories ? { metric: { unit: "energy" as const, value: a.calories } } : {}) });
    for (const m of measures.results ?? []) { if (m.weight_kg == null && m.body_fat_percent == null && m.waist_cm == null) continue; events.push({ id: `meas-${m.date_local}`, kind: "measurement", date: m.date_local, ref: m.date_local, at: atFor(m.date_local, m.created_at), title: m.weight_kg != null ? "Weigh-in" : "Measurements", subtitle: [m.body_fat_percent != null ? `${m.body_fat_percent}% body fat` : null, m.waist_cm != null ? `${m.waist_cm} cm waist` : null].filter(Boolean).join(" · ") || null, ...(m.weight_kg != null ? { metric: { unit: "weight" as const, value: m.weight_kg } } : {}) }); }
    for (const ci of checkins.results ?? []) {
      const parts = [ci.mood != null ? `mood ${ci.mood}/5` : null, ci.energy != null ? `energy ${ci.energy}/5` : null].filter(Boolean).join(" · ");
      events.push({ id: `checkin-${ci.date_local}`, kind: "checkin", date: ci.date_local, at: atFor(ci.date_local, ci.created_at), title: "Check-in", subtitle: parts || "logged", ref: ci.date_local });
      if (ci.trainer_feedback && inRange(dayOf(ci.feedback_at))) events.push({ id: `fb-${ci.id}`, kind: "feedback", date: dayOf(ci.feedback_at)!, at: ci.feedback_at!, title: "Coach feedback", subtitle: ci.trainer_feedback.slice(0, 90), ref: ci.date_local, ...(actorByRef.get(ci.id) ? { actor: actorByRef.get(ci.id)! } : {}) });
    }
    for (const s of sleeps.results ?? []) events.push({ id: `sleep-${s.date_local}`, kind: "sleep", date: s.date_local, ref: s.date_local, at: atFor(s.date_local, s.updated_at), title: "Sleep", subtitle: [dur(s.duration_minutes), s.quality != null ? `quality ${s.quality}/5` : null].filter(Boolean).join(" · ") });
    for (const m of moods.results ?? []) events.push({ id: `mood-${m.date_local}`, kind: "mood", date: m.date_local, ref: m.date_local, at: atFor(m.date_local, m.updated_at), title: "Mood", subtitle: [m.mood != null ? `mood ${m.mood}/5` : null, m.energy != null ? `energy ${m.energy}/5` : null, m.stress != null ? `stress ${m.stress}/5` : null].filter(Boolean).join(" · ") || "logged" });
    for (const f of fasts.results ?? []) {
      if (f.ended_at && inRange(dayOf(f.ended_at))) events.push({ id: `fast-end-${f.id}`, kind: "fast", date: dayOf(f.ended_at)!, ref: f.id, at: f.ended_at, title: "Fast complete", subtitle: [f.duration_minutes != null ? dur(f.duration_minutes) : null, f.target_hours ? `target ${f.target_hours}h` : null].filter(Boolean).join(" · ") || null });
      else if (!f.ended_at && inRange(dayOf(f.started_at))) events.push({ id: `fast-start-${f.id}`, kind: "fast", date: dayOf(f.started_at)!, ref: f.id, at: f.started_at, title: "Fast started", subtitle: f.target_hours ? `target ${f.target_hours}h` : null });
    }
    for (const s of swaps.results ?? []) {
      const names = s.current_name ? `${s.current_name}${s.suggested_name ? ` → ${s.suggested_name}` : ""}` : null;
      if (s.resolved_at && s.status !== "pending" && inRange(dayOf(s.resolved_at))) events.push({ id: `swap-res-${s.id}`, kind: "swap", date: dayOf(s.resolved_at)!, at: s.resolved_at, title: s.status === "approved" ? "Swap approved" : "Swap declined", subtitle: names || s.trainer_note || null, ...(actorByRef.get(s.id) ? { actor: actorByRef.get(s.id)! } : {}) });
      else if (inRange(dayOf(s.created_at))) events.push({ id: `swap-req-${s.id}`, kind: "swap", date: dayOf(s.created_at)!, at: s.created_at, title: "Swap requested", subtitle: s.current_name ? `${s.current_name}${s.reason ? ` · ${s.reason}` : ""}` : s.reason || null });
    }
    for (const l of labs.results ?? []) {
      if (l.reviewed_at && inRange(dayOf(l.reviewed_at))) events.push({ id: `lab-rev-${l.id}`, kind: "lab", date: dayOf(l.reviewed_at)!, at: l.reviewed_at, title: "Lab reviewed", subtitle: l.display_name, ref: l.id, ...(actorByRef.get(l.id) ? { actor: actorByRef.get(l.id)! } : {}) });
      else if (l.uploaded_at && inRange(dayOf(l.uploaded_at))) events.push({ id: `lab-up-${l.id}`, kind: "lab", date: dayOf(l.uploaded_at)!, at: l.uploaded_at, title: "Lab uploaded", subtitle: l.display_name, ref: l.id });
      else if (inRange(dayOf(l.created_at))) events.push({ id: `lab-req-${l.id}`, kind: "lab", date: dayOf(l.created_at)!, at: l.created_at, title: "Lab requested", subtitle: l.display_name, ref: l.id });
    }
    for (const p of wPlans.results ?? []) if (inRange(dayOf(p.published_at))) events.push({ id: `wplan-${p.id}`, kind: "plan_workout", date: dayOf(p.published_at)!, at: p.published_at, title: "New workout plan", subtitle: p.name, ref: p.id, ...(actorByRef.get(p.id) ? { actor: actorByRef.get(p.id)! } : {}) });
    for (const p of mPlans.results ?? []) if (inRange(dayOf(p.published_at))) events.push({ id: `mplan-${p.id}`, kind: "plan_meal", date: dayOf(p.published_at)!, at: p.published_at, title: "New meal plan", subtitle: p.name, ref: p.id, ...(actorByRef.get(p.id) ? { actor: actorByRef.get(p.id)! } : {}) });
    for (const s of supps.results ?? []) events.push({ id: `supp-${s.date_local}-${s.name}-${s.slot}`, kind: "supplement", date: s.date_local, ref: s.date_local, at: atFor(s.date_local, s.taken_at), title: s.name || "Supplement", subtitle: s.slot ? s.slot.replace(/_/g, " ") : "taken" });
    for (const s of sessions.results ?? []) {
      const day = s.status === "completed" ? dayOf(s.completed_at) ?? dayOf(s.scheduled_at) : dayOf(s.scheduled_at);
      if (!inRange(day)) continue;
      const title = s.status === "completed" ? "Session completed" : s.status === "cancelled" ? "Session cancelled" : s.status === "no_show" ? "Session missed" : "Session";
      events.push({ id: `sess-${s.id}`, kind: "session", date: day!, at: atFor(day!, s.status === "completed" ? s.completed_at : s.scheduled_at), title, subtitle: s.duration_minutes ? `${s.duration_minutes} min` : null, ref: s.id });
    }

    for (const b of bodyScans.results ?? []) events.push({ id: `scan-${b.id}`, kind: "bodyscan", date: b.date_local, at: atFor(b.date_local, b.created_at), title: "Body scan", subtitle: b.body_fat_percent != null ? `${Math.round(b.body_fat_percent * 10) / 10}% body fat` : "captured", ref: b.id, ...(b.weight_kg != null ? { metric: { unit: "weight" as const, value: b.weight_kg } } : {}) });
    for (const g of goals.results ?? []) { const day = dayOf(g.created_at); if (!inRange(day)) continue; events.push({ id: `goal-${g.id}`, kind: "goal", date: day!, at: g.created_at, title: "New goal set", subtitle: g.label, ref: g.id, ...(actorByRef.get(g.id) ? { actor: actorByRef.get(g.id)! } : {}) }); }

    events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return c.json({ events });
  })

  // ── Log detail: normalized detail + analytics for ONE Today-feed item, so the
  //    app can render a detail page for any kind. `kind` is the feed kind (food
  //    kinds arrive as `food.<meal>` — the `:` is dot-encoded on the wire). `ref`
  //    is the row id (activity/bodyscan/goal/fast) or the local date (everything
  //    day-bucketed). All values are RAW METRIC numbers; the client formats. ────
  .get("/logs/detail", async (c) => {
    const clientId = c.req.query("clientId");
    const kind = c.req.query("kind");
    const ref = c.req.query("ref");
    if (!clientId || !kind || !ref) return c.json({ error: "clientId + kind + ref required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    const db = c.env.DB;
    const cid = access.client.id;
    const parts = kind.split(".");
    const base = parts[0]!;
    const notFound = () => c.json({ error: "not found" }, 404);

    switch (base) {
      case "activity": {
        const row = await db
          .prepare("SELECT id, date_local, activity_key, label, start_time, duration_min, avg_hr_bpm, distance_m, reps, notes, calories FROM activity_logs WHERE id = ? AND client_id = ?")
          .bind(ref, cid)
          .first<{ id: string; date_local: string; activity_key: string | null; label: string | null; start_time: string | null; duration_min: number | null; avg_hr_bpm: number | null; distance_m: number | null; reps: number | null; notes: string | null; calories: number | null }>();
        if (!row) return notFound();
        const key = row.activity_key ?? "other";
        const label = row.label || activityByKey(key).label;
        const stats: Stat[] = [];
        if (row.duration_min != null) stats.push({ label: "Duration", value: row.duration_min, unit: "minutes" });
        if (row.distance_m != null) stats.push({ label: "Distance", value: row.distance_m, unit: "distance" });
        if (row.reps != null) stats.push({ label: "Reps", value: row.reps, unit: "count" });
        if (row.avg_hr_bpm != null) stats.push({ label: "Avg HR", value: row.avg_hr_bpm, unit: "bpm" });
        // Recent history of THIS activity_key: calories over its last ~14 logs.
        const hist = await db
          .prepare("SELECT date_local, calories FROM activity_logs WHERE client_id = ? AND activity_key IS ? AND calories IS NOT NULL ORDER BY date_local DESC, created_at DESC LIMIT 14")
          .bind(cid, row.activity_key)
          .all<{ date_local: string; calories: number }>();
        const count = await db.prepare("SELECT COUNT(*) AS n FROM activity_logs WHERE client_id = ? AND activity_key IS ?").bind(cid, row.activity_key).first<{ n: number }>();
        stats.push({ label: "Times logged", value: count?.n ?? 0, unit: "count" });
        const points = (hist.results ?? []).slice().reverse().map((h) => pt(h.date_local, h.calories));
        const body: LogDetailResponse = {
          kind, date: row.date_local, title: label, subtitle: row.start_time ?? null, tone: "cardio",
          hero: row.calories != null ? { value: row.calories, unit: "energy", label: "Calories" } : null,
          stats, items: [], rows: [], note: row.notes ?? null,
          series: points.length ? { title: `Recent ${label}`, unit: "energy", chart: "bar", points } : null,
        };
        return c.json(body);
      }

      case "food": {
        const mealType = parts[1] ?? "";
        const entries = await db
          .prepare("SELECT label, quantity, unit, calories, protein_g, carbs_g, fat_g FROM food_entries WHERE client_id = ? AND date_local = ? AND meal_type = ? ORDER BY created_at")
          .bind(cid, ref, mealType)
          .all<{ label: string | null; quantity: number | null; unit: string | null; calories: number; protein_g: number; carbs_g: number; fat_g: number }>();
        const rows = entries.results ?? [];
        if (!rows.length) return notFound();
        const sum = rows.reduce((a, r) => ({ cal: a.cal + (r.calories ?? 0), p: a.p + (r.protein_g ?? 0), cb: a.cb + (r.carbs_g ?? 0), f: a.f + (r.fat_g ?? 0) }), { cal: 0, p: 0, cb: 0, f: 0 });
        // This meal's total calories per day over the trailing 7 days.
        const days = lastNDates(ref, 7);
        const dayRows = await db
          .prepare("SELECT date_local, COALESCE(SUM(calories),0) AS cal FROM food_entries WHERE client_id = ? AND meal_type = ? AND date_local >= ? AND date_local <= ? GROUP BY date_local")
          .bind(cid, mealType, days[0]!, ref)
          .all<{ date_local: string; cal: number }>();
        const byDay = new Map((dayRows.results ?? []).map((r) => [r.date_local, Math.round(r.cal)]));
        const label = detailMealLabel(mealType);
        const body: LogDetailResponse = {
          kind, date: ref, title: label, subtitle: `${rows.length} item${rows.length === 1 ? "" : "s"}`, tone: "nutrition",
          hero: { value: Math.round(sum.cal), unit: "energy", label: "Calories" },
          stats: [
            { label: "Protein g", value: Math.round(sum.p), unit: "raw" },
            { label: "Carbs g", value: Math.round(sum.cb), unit: "raw" },
            { label: "Fat g", value: Math.round(sum.f), unit: "raw" },
          ],
          items: rows.map((r) => ({
            title: r.label || "Item",
            sub: [r.quantity != null ? `${r.quantity}${r.unit ?? ""}` : null, `${Math.round(r.calories ?? 0)} kcal`].filter(Boolean).join(" · "),
          })),
          rows: [],
          series: { title: `Recent ${label}`, unit: "energy", chart: "bar", points: days.map((d) => pt(d, byDay.get(d) ?? 0)) },
        };
        return c.json(body);
      }

      case "workout": {
        const logs = await db
          .prepare("SELECT entries_json, session_calories FROM exercise_logs WHERE client_id = ? AND date_local = ?")
          .bind(cid, ref)
          .all<{ entries_json: string | null; session_calories: number | null }>();
        const rows = logs.results ?? [];
        if (!rows.length) return notFound();
        const entries: SessionEntry[] = [];
        let sessionCalories = 0;
        for (const r of rows) {
          entries.push(...parseJson<SessionEntry[]>(r.entries_json, []));
          sessionCalories += r.session_calories ?? 0;
        }
        const allSets = entries.flatMap((e) => e.sets ?? []);
        const completedSets = allSets.filter((s) => s.completed !== false).length;
        const tonnage = sessionTonnage(allSets);
        // Exercise names for the item rows. Tenant-scoped for the same reason as
        // the PR notification above: the ids ride on client-written log entries.
        const ids = [...new Set(entries.map((e) => e.exerciseId).filter(Boolean))];
        const nameById = new Map<string, string>();
        if (ids.length) {
          const ex = await db.prepare(`SELECT id, name FROM exercises WHERE id IN (${ids.map(() => "?").join(",")}) AND (tenant_id = ? OR tenant_id IS NULL)`).bind(...ids, access.client.tenant_id).all<{ id: string; name: string }>();
          for (const e of ex.results ?? []) nameById.set(e.id, e.name);
        }
        // Tonnage per session over the last ~10 sessions.
        const hist = await db.prepare("SELECT date_local, entries_json FROM exercise_logs WHERE client_id = ? ORDER BY date_local DESC LIMIT 40").bind(cid).all<{ date_local: string; entries_json: string | null }>();
        const tonByDate = new Map<string, number>();
        for (const h of hist.results ?? []) {
          const es = parseJson<SessionEntry[]>(h.entries_json, []);
          const t = sessionTonnage(es.flatMap((e) => e.sets ?? []));
          tonByDate.set(h.date_local, (tonByDate.get(h.date_local) ?? 0) + t);
        }
        const dates = [...tonByDate.keys()].sort().slice(-10);
        const body: LogDetailResponse = {
          kind, date: ref, title: "Workout", subtitle: `${completedSets} set${completedSets === 1 ? "" : "s"}`, tone: "activity",
          hero: sessionCalories > 0 ? { value: sessionCalories, unit: "energy", label: "Calories" } : { value: tonnage, unit: "weight", label: "Tonnage" },
          stats: [
            { label: "Exercises", value: entries.length, unit: "count" },
            { label: "Sets", value: completedSets, unit: "count" },
            { label: "Tonnage", value: tonnage, unit: "weight" },
          ],
          items: entries.map((e) => ({ title: nameById.get(e.exerciseId) ?? "Exercise", sub: `${(e.sets ?? []).filter((s) => s.completed !== false).length} sets` })),
          rows: [],
          series: dates.length ? { title: "Tonnage per session", unit: "weight", chart: "area", points: dates.map((d) => pt(d, tonByDate.get(d)!)) } : null,
        };
        return c.json(body);
      }

      case "checkin": {
        const row = await db
          .prepare("SELECT mood, energy, stress, sleep_hours, weight_kg, steps_count, notes, trainer_feedback FROM check_ins WHERE client_id = ? AND date_local = ?")
          .bind(cid, ref)
          .first<{ mood: number | null; energy: number | null; stress: number | null; sleep_hours: number | null; weight_kg: number | null; steps_count: number | null; notes: string | null; trainer_feedback: string | null }>();
        if (!row) return notFound();
        const stats: Stat[] = [];
        if (row.mood != null) stats.push({ label: "Mood", value: row.mood, unit: "rating" });
        if (row.energy != null) stats.push({ label: "Energy", value: row.energy, unit: "rating" });
        if (row.stress != null) stats.push({ label: "Stress", value: row.stress, unit: "rating" });
        if (row.sleep_hours != null) stats.push({ label: "Sleep", value: row.sleep_hours, unit: "hours" });
        const hist = await db.prepare("SELECT date_local, mood FROM check_ins WHERE client_id = ? AND mood IS NOT NULL ORDER BY date_local DESC LIMIT 14").bind(cid).all<{ date_local: string; mood: number }>();
        const points = (hist.results ?? []).slice().reverse().map((h) => pt(h.date_local, h.mood));
        const body: LogDetailResponse = {
          kind, date: ref, title: "Check-in", tone: "nutrition",
          hero: row.weight_kg != null ? { value: row.weight_kg, unit: "weight", label: "Weight" } : null,
          stats, items: [],
          rows: row.steps_count != null ? [{ label: "Steps", value: String(row.steps_count) }] : [],
          note: [row.notes, row.trainer_feedback ? `Coach: ${row.trainer_feedback}` : null].filter(Boolean).join("\n\n") || null,
          series: points.length ? { title: "Mood", unit: "rating", chart: "area", points } : null,
        };
        return c.json(body);
      }

      case "water": {
        const row = await db.prepare("SELECT total_ml FROM water_logs WHERE client_id = ? AND date_local = ?").bind(cid, ref).first<{ total_ml: number }>();
        if (!row) return notFound();
        const goal = await db.prepare("SELECT targets_json FROM client_goals WHERE client_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").bind(cid).first<{ targets_json: string | null }>();
        const targetWaterMl = parseJson<{ targetWaterMl?: number | null }>(goal?.targets_json, {}).targetWaterMl ?? null;
        const days = lastNDates(ref, 7);
        const dayRows = await db.prepare("SELECT date_local, total_ml FROM water_logs WHERE client_id = ? AND date_local >= ? AND date_local <= ?").bind(cid, days[0]!, ref).all<{ date_local: string; total_ml: number }>();
        const byDay = new Map((dayRows.results ?? []).map((r) => [r.date_local, r.total_ml]));
        const body: LogDetailResponse = {
          kind, date: ref, title: "Hydration", tone: "hydration",
          hero: { value: row.total_ml, unit: "volume", label: "Water" },
          stats: [], items: [], rows: [],
          series: { title: "Water", unit: "volume", chart: "bar", points: days.map((d) => pt(d, byDay.get(d) ?? 0)), targetValue: targetWaterMl },
        };
        return c.json(body);
      }

      case "sleep": {
        const row = await db.prepare("SELECT duration_minutes, quality FROM sleep_logs WHERE client_id = ? AND date_local = ?").bind(cid, ref).first<{ duration_minutes: number; quality: number | null }>();
        if (!row) return notFound();
        const hist = await db.prepare("SELECT date_local, duration_minutes FROM sleep_logs WHERE client_id = ? ORDER BY date_local DESC LIMIT 10").bind(cid).all<{ date_local: string; duration_minutes: number }>();
        const points = (hist.results ?? []).slice().reverse().map((h) => pt(h.date_local, round1(h.duration_minutes / 60)));
        const stats: Stat[] = [];
        if (row.quality != null) stats.push({ label: "Quality", value: row.quality, unit: "rating" });
        const body: LogDetailResponse = {
          kind, date: ref, title: "Sleep", tone: "sleep",
          hero: { value: round1(row.duration_minutes / 60), unit: "hours", label: "Sleep" },
          stats, items: [], rows: [],
          series: points.length ? { title: "Sleep", unit: "hours", chart: "bar", points } : null,
        };
        return c.json(body);
      }

      case "mood": {
        const row = await db.prepare("SELECT mood, energy, stress FROM mood_logs WHERE client_id = ? AND date_local = ?").bind(cid, ref).first<{ mood: number | null; energy: number | null; stress: number | null }>();
        if (!row) return notFound();
        const stats: Stat[] = [];
        if (row.mood != null) stats.push({ label: "Mood", value: row.mood, unit: "rating" });
        if (row.energy != null) stats.push({ label: "Energy", value: row.energy, unit: "rating" });
        if (row.stress != null) stats.push({ label: "Stress", value: row.stress, unit: "rating" });
        const hist = await db.prepare("SELECT date_local, mood FROM mood_logs WHERE client_id = ? AND mood IS NOT NULL ORDER BY date_local DESC LIMIT 14").bind(cid).all<{ date_local: string; mood: number }>();
        const points = (hist.results ?? []).slice().reverse().map((h) => pt(h.date_local, h.mood));
        const body: LogDetailResponse = {
          kind, date: ref, title: "Mood", tone: "nutrition", hero: null,
          stats, items: [], rows: [],
          series: points.length ? { title: "Mood", unit: "rating", chart: "area", points } : null,
        };
        return c.json(body);
      }

      case "measurement": {
        const row = await db
          .prepare("SELECT weight_kg, body_fat_percent, waist_cm, neck_cm, hips_cm, chest_cm FROM measurements WHERE client_id = ? AND date_local = ?")
          .bind(cid, ref)
          .first<{ weight_kg: number | null; body_fat_percent: number | null; waist_cm: number | null; neck_cm: number | null; hips_cm: number | null; chest_cm: number | null }>();
        if (!row) return notFound();
        const stats: Stat[] = [];
        if (row.body_fat_percent != null) stats.push({ label: "Body fat", value: row.body_fat_percent, unit: "percent" });
        if (row.waist_cm != null) stats.push({ label: "Waist", value: row.waist_cm, unit: "length" });
        if (row.neck_cm != null) stats.push({ label: "Neck", value: row.neck_cm, unit: "length" });
        if (row.hips_cm != null) stats.push({ label: "Hips", value: row.hips_cm, unit: "length" });
        if (row.chest_cm != null) stats.push({ label: "Chest", value: row.chest_cm, unit: "length" });
        const hist = await db.prepare("SELECT date_local, weight_kg FROM measurements WHERE client_id = ? AND weight_kg IS NOT NULL ORDER BY date_local DESC LIMIT 30").bind(cid).all<{ date_local: string; weight_kg: number }>();
        const points = (hist.results ?? []).slice().reverse().map((h) => pt(h.date_local, h.weight_kg));
        const body: LogDetailResponse = {
          kind, date: ref, title: row.weight_kg != null ? "Weigh-in" : "Measurements", tone: "cardio",
          hero: row.weight_kg != null ? { value: row.weight_kg, unit: "weight", label: "Weight" } : row.body_fat_percent != null ? { value: row.body_fat_percent, unit: "percent", label: "Body fat" } : null,
          stats, items: [], rows: [],
          series: points.length ? { title: "Weight", unit: "weight", chart: "area", points } : null,
        };
        return c.json(body);
      }

      case "bodyscan": {
        const row = await db
          .prepare("SELECT date_local, body_fat_percent, weight_kg, height_cm, posture_severity, somatotype FROM body_scans WHERE id = ? AND client_id = ?")
          .bind(ref, cid)
          .first<{ date_local: string; body_fat_percent: number | null; weight_kg: number | null; height_cm: number | null; posture_severity: string | null; somatotype: string | null }>();
        if (!row) return notFound();
        const stats: Stat[] = [];
        if (row.weight_kg != null) stats.push({ label: "Weight", value: row.weight_kg, unit: "weight" });
        const heightCm = access.client.height_cm ?? row.height_cm ?? null;
        if (row.weight_kg != null && row.body_fat_percent != null && heightCm) {
          const comp = bodyComposition(row.weight_kg, row.body_fat_percent, heightCm);
          if (comp) {
            stats.push({ label: "Lean", value: comp.leanMassKg, unit: "weight" });
            stats.push({ label: "Fat", value: comp.fatMassKg, unit: "weight" });
            stats.push({ label: "FFMI", value: comp.ffmi, unit: "raw" });
          }
        }
        const rows: { label: string; value: string }[] = [];
        if (row.posture_severity) rows.push({ label: "Posture", value: row.posture_severity });
        if (row.somatotype) rows.push({ label: "Somatotype", value: row.somatotype });
        const hist = await db.prepare("SELECT date_local, body_fat_percent FROM body_scans WHERE client_id = ? AND body_fat_percent IS NOT NULL ORDER BY date_local DESC LIMIT 30").bind(cid).all<{ date_local: string; body_fat_percent: number }>();
        const points = (hist.results ?? []).slice().reverse().map((h) => pt(h.date_local, h.body_fat_percent));
        const body: LogDetailResponse = {
          kind, date: row.date_local, title: "Body scan", tone: "sleep",
          hero: row.body_fat_percent != null ? { value: row.body_fat_percent, unit: "percent", label: "Body fat" } : null,
          stats, items: [], rows,
          series: points.length ? { title: "Body fat", unit: "percent", chart: "area", points } : null,
        };
        return c.json(body);
      }

      case "goal": {
        const row = await db
          .prepare("SELECT label, start_date, created_at, targets_json, derivation_json FROM client_goals WHERE id = ? AND client_id = ?")
          .bind(ref, cid)
          .first<{ label: string | null; start_date: string | null; created_at: string | null; targets_json: string | null; derivation_json: string | null }>();
        if (!row) return notFound();
        const t = parseJson<{ targetCalories?: number | null; targetProteinG?: number | null; targetCarbsG?: number | null; targetFatG?: number | null; targetWaterMl?: number | null }>(row.targets_json, {});
        const dv = parseJson<{ tdee?: number | null; bmr?: number | null; primaryGoal?: string | null; macroSplit?: unknown }>(row.derivation_json, {});
        const stats: Stat[] = [];
        if (t.targetProteinG != null) stats.push({ label: "Protein g", value: t.targetProteinG, unit: "raw" });
        if (t.targetCarbsG != null) stats.push({ label: "Carbs g", value: t.targetCarbsG, unit: "raw" });
        if (t.targetFatG != null) stats.push({ label: "Fat g", value: t.targetFatG, unit: "raw" });
        if (t.targetWaterMl != null) stats.push({ label: "Water", value: t.targetWaterMl, unit: "volume" });
        const rows: { label: string; value: string }[] = [];
        if (dv.tdee != null) rows.push({ label: "TDEE", value: `${Math.round(dv.tdee)} kcal` });
        if (dv.bmr != null) rows.push({ label: "BMR", value: `${Math.round(dv.bmr)} kcal` });
        if (row.label) rows.push({ label: "Goal", value: row.label });
        if (dv.primaryGoal) rows.push({ label: "Focus", value: dv.primaryGoal });
        const body: LogDetailResponse = {
          kind, date: row.start_date ?? (row.created_at ?? "").slice(0, 10), title: row.label || "Goal", tone: "cardio",
          hero: t.targetCalories != null ? { value: t.targetCalories, unit: "energy", label: "Daily calories" } : null,
          stats, items: [], rows, series: null,
        };
        return c.json(body);
      }

      case "supplement": {
        const active = await db.prepare("SELECT id, name, dose FROM supplements WHERE client_id = ? AND status = 'active' ORDER BY created_at").bind(cid).all<{ id: string; name: string | null; dose: string | null }>();
        const taken = await db.prepare("SELECT DISTINCT supplement_id FROM supplement_logs WHERE client_id = ? AND date_local = ?").bind(cid, ref).all<{ supplement_id: string }>();
        const takenIds = new Set((taken.results ?? []).map((r) => r.supplement_id));
        const list = active.results ?? [];
        const takenCount = list.filter((s) => takenIds.has(s.id)).length;
        const body: LogDetailResponse = {
          kind, date: ref, title: "Supplements", subtitle: `${takenCount}/${list.length} taken`, tone: "supplement",
          hero: { value: takenCount, unit: "count", label: "Taken" },
          stats: [{ label: "Stack", value: list.length, unit: "count" }],
          items: list.map((s) => ({ title: [s.name || "Supplement", s.dose].filter(Boolean).join(" · "), sub: takenIds.has(s.id) ? "Taken" : "Not logged" })),
          rows: [], series: null,
        };
        return c.json(body);
      }

      case "fast": {
        const row = await db.prepare("SELECT started_at, ended_at, duration_minutes, target_hours FROM fasting_sessions WHERE id = ? AND client_id = ?").bind(ref, cid).first<{ started_at: string; ended_at: string | null; duration_minutes: number | null; target_hours: number | null }>();
        if (!row) return notFound();
        const stats: Stat[] = [];
        if (row.target_hours != null) stats.push({ label: "Target", value: row.target_hours, unit: "hours" });
        const hist = await db.prepare("SELECT started_at, ended_at, duration_minutes FROM fasting_sessions WHERE client_id = ? AND duration_minutes IS NOT NULL ORDER BY started_at DESC LIMIT 10").bind(cid).all<{ started_at: string; ended_at: string | null; duration_minutes: number | null }>();
        const points = (hist.results ?? []).slice().reverse().map((h) => pt(((h.ended_at ?? h.started_at) || "").slice(0, 10), round1((h.duration_minutes ?? 0) / 60)));
        const date = ((row.ended_at ?? row.started_at) || "").slice(0, 10);
        const body: LogDetailResponse = {
          kind, date, title: "Fast", tone: "sleep",
          hero: row.duration_minutes != null ? { value: round1(row.duration_minutes / 60), unit: "hours", label: "Fasted" } : null,
          stats, items: [], rows: [],
          series: points.length ? { title: "Recent fasts", unit: "hours", chart: "bar", points } : null,
        };
        return c.json(body);
      }

      default: {
        const body: LogDetailResponse = { kind, date: "", title: "Log", tone: "neutral", stats: [], items: [], rows: [] };
        return c.json(body);
      }
    }
  })

  // ── Water / sleep / mood: per-day upserts. ─────────────────────────────────
  .post("/logs/water", async (c) => {
    const parsed = withClient(LogWater).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    { const g = await gateFeature(c, "waterLogging", access.client.id); if (g) return g; }
    const d = parsed.data.data;
    // Atomic increment: the conflict clause adds THIS amount to the stored total
    // and appends the entry via json_insert, so two near-simultaneous logs can't
    // both read the same base and lose one increment (last-writer-wins). The new
    // total is returned by RETURNING so we never round-trip a stale read.
    const now = nowIso();
    const entry = JSON.stringify({ amountMl: d.amountMl, at: now });
    const row = await c.env.DB.prepare(
      "INSERT INTO water_logs (client_id, date_local, tenant_id, total_ml, entries_json, updated_at) VALUES (?, ?, ?, ?, json_array(json(?)), ?) " +
        "ON CONFLICT(client_id, date_local) DO UPDATE SET total_ml = water_logs.total_ml + excluded.total_ml, entries_json = json_insert(COALESCE(water_logs.entries_json, '[]'), '$[#]', json(?)), updated_at = excluded.updated_at " +
        "RETURNING total_ml",
    )
      .bind(access.client.id, d.date, access.client.tenant_id, d.amountMl, entry, now, entry)
      .first<{ total_ml: number }>();
    return c.json({ ok: true, totalMl: row?.total_ml ?? d.amountMl });
  })

  .post("/logs/sleep", async (c) => {
    const parsed = withClient(LogSleep).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    { const g = await gateFeature(c, "sleepLogging", access.client.id); if (g) return g; }
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
    { const g = await gateFeature(c, "moodLogging", access.client.id); if (g) return g; }
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
    { const g = await gateFeature(c, "measurementLogging", access.client.id); if (g) return g; }
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

    // A new body-fat reading (body scan or manual entry) is coaching signal —
    // notify the client's primary trainer, unless they logged it themselves.
    // Deduped per client per day so a re-log doesn't re-notify.
    if (d.bodyFatPercent != null) {
      const actorId = requireTenant(c)?.userId;
      const primary = await c.env.DB
        .prepare("SELECT trainer_user_id FROM client_trainers WHERE client_id = ? ORDER BY is_primary DESC LIMIT 1")
        .bind(access.client.id)
        .first<{ trainer_user_id: string }>();
      if (primary?.trainer_user_id && primary.trainer_user_id !== actorId) {
        await notify(c.env, {
          tenantId: access.client.tenant_id,
          userId: primary.trainer_user_id,
          type: "body_fat_logged",
          title: `${access.client.display_name} logged a body-fat reading`,
          message: `${d.bodyFatPercent}% body fat${d.weightKg != null ? ` · ${d.weightKg} kg` : ""}`,
          link: `/clients/${access.client.id}/manage`,
          dedupeKey: `bf_${access.client.id}_${d.date}`,
        });
      }
    }
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
  //
  // A check-in is a REPORT, not a second place to store facts. Every metric it
  // carries also has a purpose-built table, and for a long time only weight was
  // mirrored across ("Mirror weight into measurements so progress prefers the
  // dedicated table") — so sleep and mood lived in two independent stores, and
  // each reader invented its own reconciliation: the home widget preferred the
  // dedicated table, Progress read check_ins alone and therefore never showed a
  // sleep logged from the log drawer, and the wellness score double-counted a
  // day rated in both.
  //
  // `writeThroughCheckIn` closes that: the check-in writes every fact it holds
  // into the same table the log drawer writes, and its own columns stay as a
  // frozen as-at-submission SNAPSHOT for the coach's review. The snapshot is
  // derived, so it cannot disagree with the logs the way an independently typed
  // value could.
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
      // COALESCE, not a bare `?`: every column used to be set to `d.x ?? null`,
      // so re-submitting a check-in to add a NOTE erased the mood, sleep and
      // weight sent the first time. A field the caller omits now survives.
      await c.env.DB.prepare(
        `UPDATE check_ins SET
           weight_kg = COALESCE(?, weight_kg), mood = COALESCE(?, mood), energy = COALESCE(?, energy),
           stress = COALESCE(?, stress), sleep_quality = COALESCE(?, sleep_quality),
           sleep_hours = COALESCE(?, sleep_hours), water_ml = COALESCE(?, water_ml),
           steps_count = COALESCE(?, steps_count), notes = COALESCE(?, notes),
           photos_json = COALESCE(?, photos_json), updated_at = ?
         WHERE id = ?`,
      )
        .bind(
          d.weightKg ?? null, d.mood ?? null, d.energy ?? null, d.stress ?? null, d.sleepQuality ?? null,
          d.sleepHours ?? null, d.waterMl ?? null, d.stepsCount ?? null, d.notes ?? null, photosJson, nowIso(), existing.id,
        )
        .run();
      // The mirror used to run on the INSERT path only, so EDITING a check-in
      // never reached the dedicated tables — the correction stayed invisible to
      // Progress and to the wellness score.
      await writeThroughCheckIn(c.env.DB, access.client, d);
      if (d.weightKg != null) await recomputeBodyMetrics(c.env.DB, access.client, d.date);
      return c.json({ ok: true, id: existing.id, updated: true });
    }
    const id = newId("chk");
    // Upsert on the unique (client_id, date_local) day index: a double-submit
    // that races the SELECT above no longer collides into a 500 — the loser
    // updates the row instead. RETURNING id tells us which happened.
    const inserted = await c.env.DB.prepare(
      `INSERT INTO check_ins (id, tenant_id, client_id, date_local, weight_kg, mood, energy, stress, sleep_quality, sleep_hours, water_ml, steps_count, notes, photos_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(client_id, date_local) DO UPDATE SET
         weight_kg = excluded.weight_kg, mood = excluded.mood, energy = excluded.energy, stress = excluded.stress,
         sleep_quality = excluded.sleep_quality, sleep_hours = excluded.sleep_hours, water_ml = excluded.water_ml,
         steps_count = excluded.steps_count, notes = excluded.notes,
         photos_json = COALESCE(excluded.photos_json, check_ins.photos_json), updated_at = excluded.updated_at
       RETURNING id`,
    )
      .bind(
        id, access.client.tenant_id, access.client.id, d.date, d.weightKg ?? null, d.mood ?? null,
        d.energy ?? null, d.stress ?? null, d.sleepQuality ?? null, d.sleepHours ?? null,
        d.waterMl ?? null, d.stepsCount ?? null, d.notes ?? null, photosJson, nowIso(), nowIso(),
      )
      .first<{ id: string }>();
    const rowId = inserted?.id ?? id;
    // A conflict (rowId !== id) means a concurrent submit already created the
    // day's row — treat that as an update, skipping the mirror + trainer notify
    // so a raced double-submit can't fire the "checked in" notification twice.
    if (rowId !== id) return c.json({ ok: true, id: rowId, updated: true });
    // Every fact the check-in carries, into the table that owns it.
    await writeThroughCheckIn(c.env.DB, access.client, d);
    if (d.weightKg != null) await recomputeBodyMetrics(c.env.DB, access.client, d.date);
    // Notify the primary trainer (fan-out fix: primary only, SPEC §2).
    const primary = await c.env.DB.prepare(
      "SELECT trainer_user_id FROM client_trainers WHERE client_id = ? ORDER BY is_primary DESC LIMIT 1",
    )
      .bind(access.client.id)
      .first<{ trainer_user_id: string }>();
    if (primary && primary.trainer_user_id !== c.get("user")?.id) {
      await notify(c.env, { tenantId: access.client.tenant_id, userId: primary.trainer_user_id, type: "check_in", title: `${access.client.display_name} checked in`, message: d.notes ?? "", link: `/clients/${access.client.id}/manage?checkin=${id}` });
    }
    return c.json({ ok: true, id }, 201);
  })

  .get("/check-ins", async (c) => {
    const clientId = c.req.query("clientId");
    if (!clientId) return c.json({ error: "clientId required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    const rows = await c.env.DB.prepare(
      // Attach the body-fat reading as of each check-in's date (latest measured
      // body-fat on or before that day) so the detail view can show it alongside
      // weight without the client re-entering it. measurements is canonical —
      // both manual logs and body-scans mirror into it.
      `SELECT ci.*, (
         SELECT m.body_fat_percent FROM measurements m
         WHERE m.client_id = ci.client_id AND m.body_fat_percent IS NOT NULL AND m.date_local <= ci.date_local
         ORDER BY m.date_local DESC LIMIT 1
       ) AS body_fat_percent
       FROM check_ins ci WHERE ci.client_id = ? ORDER BY ci.date_local DESC LIMIT 90`,
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
      // Deep-link to the exact check-in on the client's Wellness screen, which
      // keys check-ins by their local date (?checkin=<date_local>).
      const ci = await c.env.DB.prepare("SELECT date_local FROM check_ins WHERE id = ? AND client_id = ?").bind(c.req.param("id"), access.client.id).first<{ date_local: string }>();
      await notify(c.env, { tenantId: access.client.tenant_id, userId: access.client.user_id, type: "feedback", message: parsed.data.feedback.slice(0, 200), link: ci?.date_local ? `/wellness?checkin=${ci.date_local}` : undefined, vars: { coachName: user.name || "Your coach" } });
    }
    await recordAudit(c.env, { tenantId: access.client.tenant_id, clientId: access.client.id, actorUserId: user.id, action: "checkin.feedback", summary: parsed.data.feedback.slice(0, 80), ref: c.req.param("id") });
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
    { const g = await gateFeature(c, "fastingTimer", access.client.id); if (g) return g; }
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
    // Picking/customising meal-plan options is what `canEditMealPlan` sells.
    { const g = await gateFeature(c, "mealPlanEditing", access.client.id); if (g) return g; }
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
    const [food, water, workout, activities, checkIn, timeline, plans, checkInDates, pendingLabs, weights, sleep, mood, bodyMeasures, scans, suppTaken, supps] = await Promise.all([
      db
        .prepare(
          "SELECT COALESCE(SUM(calories),0) AS calories, COALESCE(SUM(protein_g),0) AS protein, COALESCE(SUM(carbs_g),0) AS carbs, COALESCE(SUM(fat_g),0) AS fat, MAX(target_calories) AS day_target_cal FROM food_entries WHERE client_id = ? AND date_local = ?",
        )
        .bind(clientId, date)
        .first<{ calories: number; protein: number; carbs: number; fat: number; day_target_cal: number | null }>(),
      db
        .prepare("SELECT total_ml FROM water_logs WHERE client_id = ? AND date_local = ?")
        .bind(clientId, date)
        .first<{ total_ml: number }>(),
      db
        .prepare("SELECT id, workout_plan_id, plan_day_index, entries_json, session_calories FROM exercise_logs WHERE client_id = ? AND date_local = ?")
        .bind(clientId, date)
        .all<{ id: string; workout_plan_id: string; plan_day_index: number; entries_json: string | null; session_calories: number | null }>(),
      db
        .prepare("SELECT COALESCE(SUM(calories),0) AS burned, COALESCE(SUM(duration_min),0) AS minutes, COUNT(*) AS n FROM activity_logs WHERE client_id = ? AND date_local = ?")
        .bind(clientId, date)
        .first<{ burned: number; minutes: number; n: number }>(),
      db
        .prepare("SELECT id, mood, energy, stress, sleep_quality, sleep_hours, steps_count FROM check_ins WHERE client_id = ? AND date_local = ?")
        .bind(clientId, date)
        .first<{ id: string; mood: number | null; energy: number | null; stress: number | null; sleep_quality: number | null; sleep_hours: number | null; steps_count: number | null }>(),
      loadGoalTimeline(db, clientId),
      db
        // Resolve the published workout plan for the lane the client is on.
        .prepare("SELECT id, name, status, published_at, body_json FROM workout_plans WHERE client_id = ? AND status = 'published' AND COALESCE(variant_id, '') = COALESCE(?, '') ORDER BY published_at DESC LIMIT 1")
        .bind(clientId, access.client.current_variant_id ?? null)
        .all<{ id: string; name: string; status: string; published_at: string; body_json: string | null }>(),
      db
        // `<= date`, like every other read here. Unbounded, the streak and the
        // week dots for a day in the past were computed from check-ins that had
        // not happened yet on that day.
        .prepare("SELECT date_local FROM check_ins WHERE client_id = ? AND date_local <= ? ORDER BY date_local DESC LIMIT 30")
        .bind(clientId, date)
        .all<{ date_local: string }>(),
      db
        .prepare("SELECT COUNT(*) AS n FROM lab_tests WHERE client_id = ? AND status IN ('requested','scheduled')")
        .bind(clientId)
        .first<{ n: number }>(),
      db
        // Same: the 7-day weight trend on a past day was reading FUTURE weigh-ins.
        .prepare("SELECT weight_kg, date_local FROM measurements WHERE client_id = ? AND weight_kg IS NOT NULL AND date_local <= ? ORDER BY date_local DESC LIMIT 30")
        .bind(clientId, date)
        .all<{ weight_kg: number; date_local: string }>(),
      // ── Day-scoped extras for the home widgets ──────────────────────────────
      // Everything below is keyed on `date` (or "latest AS OF date"), because a
      // widget that self-fetches is a widget that ignores the day you are
      // looking at — which is precisely how the hero drifted out of sync with
      // its own date picker.
      db
        .prepare("SELECT duration_minutes, quality FROM sleep_logs WHERE client_id = ? AND date_local = ?")
        .bind(clientId, date)
        .first<{ duration_minutes: number | null; quality: number | null }>(),
      db
        .prepare("SELECT mood, energy, stress FROM mood_logs WHERE client_id = ? AND date_local = ?")
        .bind(clientId, date)
        .first<{ mood: number | null; energy: number | null; stress: number | null }>(),
      db
        .prepare("SELECT body_fat_percent, waist_cm, chest_cm, hips_cm, date_local FROM measurements WHERE client_id = ? AND date_local <= ? AND body_fat_percent IS NOT NULL ORDER BY date_local DESC LIMIT 2")
        .bind(clientId, date)
        .all<{ body_fat_percent: number | null; waist_cm: number | null; chest_cm: number | null; hips_cm: number | null; date_local: string }>(),
      db
        .prepare("SELECT body_fat_percent, posture_severity, somatotype, date_local FROM body_scans WHERE client_id = ? AND date_local <= ? ORDER BY date_local DESC LIMIT 2")
        .bind(clientId, date)
        .all<{ body_fat_percent: number | null; posture_severity: string | null; somatotype: string | null; date_local: string }>(),
      db
        .prepare("SELECT COUNT(*) AS n FROM supplement_logs WHERE client_id = ? AND date_local = ?")
        .bind(clientId, date)
        .first<{ n: number }>(),
      db
        // Scoped to the day as well: a supplement prescribed after `date`, or
        // already ended before it, was not part of that day's regimen and must
        // not inflate its denominator.
        .prepare("SELECT schedule_json FROM supplements WHERE client_id = ? AND status = 'active' AND (start_date IS NULL OR start_date <= ?) AND (end_date IS NULL OR end_date >= ?)")
        .bind(clientId, date, date)
        .all<{ schedule_json: string | null }>(),
    ]);

    // Access lifecycle — powers the client's no-plan / expiring / expired /
    // coach-account notices. Only surfaces a "buy" prompt in tenancies that
    // actually sell packages (`sellsPackages`); generous tenancies stay silent.
    const nowInstant = new Date().toISOString();
    const [accessRows, sells, tenantSub] = await Promise.all([
      // EVERY access row, not just the newest: a client on a membership who also
      // bought a one-time package holds two, and the enforcing gate
      // (`resolveClientFlagsFor`) unions both. Reading one row here made this
      // banner disagree with what the routes actually allow.
      loadClientAccessRows(db, access.client.tenant_id, clientId, REPORTED_ACCESS_STATUSES),
      db.prepare("SELECT COUNT(*) AS n FROM packages WHERE tenant_id = ? AND active = 1 AND visibility = 'marketplace'").bind(access.client.tenant_id).first<{ n: number }>(),
      db.prepare("SELECT status FROM subscriptions WHERE tenant_id = ?").bind(access.client.tenant_id).first<{ status: string }>(),
    ]);
    const hasAccessSub = accessRows.length > 0;
    const accessBudgets = accessBudgetsOf(accessRows);
    const accessSummary = {
      hasSubscription: hasAccessSub,
      daysRemaining: hasAccessSub ? overallDaysRemaining(accessBudgets, nowInstant) : null,
      expired: hasAccessSub && isFullyExpired(accessBudgets, nowInstant),
      workoutActive: !hasAccessSub || hasActiveBudget(accessBudgets, "workout", nowInstant),
      mealActive: !hasAccessSub || hasActiveBudget(accessBudgets, "meal", nowInstant),
      sellsPackages: (sells?.n ?? 0) > 0,
      // Passthrough: when the tenant is suspended for non-payment to Kova, the
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
    // Volume lifted on this day, kg. `sessionTonnage` is the same pure helper the
    // strength report uses, so the hero widget and the report can never disagree.
    const workoutTonnage = Math.round(
      (workout.results ?? []).reduce(
        (n, row) => n + sessionTonnage(parseJson<SessionEntry[]>(row.entries_json, []).flatMap((e) => e.sets)),
        0,
      ),
    );
    const suppSlots = (supps.results ?? []).reduce(
      (n, r) => n + Math.max(1, parseJson<{ slot: string }[]>(r.schedule_json, []).length),
      0,
    );
    const measureNow = (bodyMeasures.results ?? [])[0] ?? null;
    const measurePrev = (bodyMeasures.results ?? [])[1] ?? null;
    const scanNow = (scans.results ?? [])[0] ?? null;
    const scanPrev = (scans.results ?? [])[1] ?? null;
    // Body fat has two possible sources — a manual measurement and a camera scan.
    // Prefer whichever is NEARER the day being viewed rather than always
    // preferring one kind, so the number tracks the day instead of the method.
    const bfPick = (m: { body_fat_percent: number | null; date_local: string } | null, sc: { body_fat_percent: number | null; date_local: string } | null) => {
      const cands = [m, sc].filter((x): x is { body_fat_percent: number | null; date_local: string } => !!x && x.body_fat_percent != null);
      if (!cands.length) return null;
      return cands.reduce((a, b) => (a.date_local >= b.date_local ? a : b));
    };
    const bfNow = bfPick(measureNow, scanNow);
    const bfPrev = bfPick(measurePrev, scanPrev);

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
      workout: { loggedSets: workoutSets, tonnageKg: workoutTonnage, sessions: workout.results ?? [] },
      checkedIn: Boolean(checkIn),
      /**
       * Everything the home widgets need, resolved FOR `date`.
       *
       * It lives in the bundle rather than in each widget because the widgets
       * that fetched for themselves are exactly the ones that ignored the date
       * picker: the supplements widget asked for `todayLocal()` no matter which
       * day you were on, and body fat took the newest scan even when you were
       * looking at a day before it happened. A widget cannot get the day wrong
       * if it is never the thing that chooses the day.
       *
       * `null` means "nothing recorded" and is passed through as `null` all the
       * way to the value slot, so §5's NoData path renders instead of a zero.
       */
      metrics: {
        sleepHours: sleep?.duration_minutes != null ? Math.round((sleep.duration_minutes / 60) * 10) / 10 : checkIn?.sleep_hours ?? null,
        sleepQuality: sleep?.quality ?? checkIn?.sleep_quality ?? null,
        mood: mood?.mood ?? checkIn?.mood ?? null,
        energy: mood?.energy ?? checkIn?.energy ?? null,
        stress: mood?.stress ?? checkIn?.stress ?? null,
        steps: checkIn?.steps_count ?? null,
        activeMinutes: Math.round(activities?.minutes ?? 0),
        activityCount: activities?.n ?? 0,
        bodyFatPercent: bfNow?.body_fat_percent ?? null,
        bodyFatPrev: bfPrev?.body_fat_percent ?? null,
        waistCm: measureNow?.waist_cm ?? null,
        chestCm: measureNow?.chest_cm ?? null,
        hipsCm: measureNow?.hips_cm ?? null,
        postureSeverity: scanNow?.posture_severity ?? null,
        somatotype: scanNow?.somatotype ?? null,
        supplementsTaken: suppTaken?.n ?? 0,
        supplementsTotal: suppSlots,
      },
      // The goal IN FORCE ON `date`, not the goal in force now.
      //
      // This route used to read `WHERE status = 'active'` with no date bound —
      // the only query in the bundle that ignored the day it was answering for.
      // So Today rendered a historical day's intake against TODAY's target: raise
      // a client from 2,100 to 2,600 and every past day silently re-graded
      // against the new number, while /progress and the client report (which do
      // use the timeline) kept showing the old one. Same client, same day, two
      // different denominators depending on the screen.
      //
      // Same precedence as progress-routes, so the two agree by construction:
      // the target FROZEN onto that day's food rows first — it is what the
      // client actually saw when they logged — then the timeline resolved at
      // that date.
      goal: timeline.hasGoal
        ? (() => {
            const forDay = timeline.resolve(date) ?? {};
            const snap = food?.day_target_cal ?? null;
            const targets = { ...forDay, ...(snap != null ? { targetCalories: snap } : {}) };
            return { targets, weeklyLoadTarget: resolveWeeklyLoadTarget(targets, timeline.weeklyLoadTarget) };
          })()
        : null,
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
