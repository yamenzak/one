/**
 * Client context builder (SPEC §6) — assembles EVERYTHING the AI needs to be
 * genuinely personal: who the client is, their goal + targets, the moment
 * (date / weekday / part of day), today's status, this week's training and
 * adherence, their active plans, supplements, labs, and the latest check-in
 * with any coach feedback. Returned as a compact labeled text block plus a
 * `signalHash` that changes whenever anything material changes — the cache key
 * for personalized messages (fresh on every real update, cheap otherwise).
 */

import { sessionLoad, epley1Rm, activityByKey, currentStreak, fmtWeight, kgToDisplay, weightLabel, bodyComposition, classifyBodyFat, type BodyFatCategory, type LoggedSetLike, type UnitPrefs } from "@mossa/domain";
import type { Env } from "./env.js";
import { parseJson } from "./db.js";

interface ClientRow { id: string; tenant_id: string; display_name: string; gender: string | null; height_cm: number | null; intake_json: string | null }

const BF_CAT_LABEL: Record<BodyFatCategory, string> = {
  essential: "very lean", athletic: "athletic", fitness: "fit", average: "average", above_average: "above average",
};

/**
 * A compact body-composition line for AI prompts: the client's most recent
 * body-fat reading (from `measurements` — the canonical table both manual logs
 * and body-scans mirror into), its category, and — when weight + height are
 * known — lean/fat mass and FFMI. Returns null when there's no body-fat on file
 * so callers can omit it cleanly. Shared so every AI surface reads body
 * composition the same way.
 */
export async function bodyCompLine(
  db: Env["DB"],
  client: { id: string; gender: string | null; height_cm: number | null },
): Promise<string | null> {
  const bf = await db
    .prepare("SELECT date_local, body_fat_percent, weight_kg FROM measurements WHERE client_id=? AND body_fat_percent IS NOT NULL ORDER BY date_local DESC LIMIT 1")
    .bind(client.id)
    .first<{ date_local: string; body_fat_percent: number; weight_kg: number | null }>();
  if (!bf?.body_fat_percent) return null;
  const gender = client.gender === "female" ? "female" : "male";
  const cat = classifyBodyFat(bf.body_fat_percent, gender);
  let weightKg = bf.weight_kg;
  if (weightKg == null) {
    const w = await db.prepare("SELECT weight_kg FROM measurements WHERE client_id=? AND weight_kg IS NOT NULL ORDER BY date_local DESC LIMIT 1").bind(client.id).first<{ weight_kg: number }>();
    weightKg = w?.weight_kg ?? null;
  }
  const comp = weightKg != null && client.height_cm != null ? bodyComposition(weightKg, bf.body_fat_percent, client.height_cm) : null;
  const parts = [`${bf.body_fat_percent.toFixed(1)}% body fat${cat ? ` (${BF_CAT_LABEL[cat]})` : ""}`];
  if (comp) parts.push(`lean ${comp.leanMassKg}kg`, `fat ${comp.fatMassKg}kg`, `FFMI ${comp.ffmi}`);
  return `BODY COMPOSITION (as of ${bf.date_local}): ${parts.join(", ")}.`;
}
interface SessionEntry { exerciseId: string; sets: LoggedSetLike[] }

const shiftDay = (date: string, delta: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};

export function partOfDay(hour: number): "morning" | "afternoon" | "evening" | "night" {
  if (hour < 5) return "night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 22) return "evening";
  return "night";
}

/** djb2 → base36; a short stable hash of the context's material signals. */
export function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export interface ClientContext {
  text: string;
  /** Changes when anything material changes → the personalized-message cache key. */
  signalHash: string;
}

export async function buildClientContext(
  env: Env,
  client: ClientRow,
  opts: { today: string; hour: number; units: UnitPrefs },
): Promise<ClientContext> {
  const db = env.DB;
  const cid = client.id;
  const { today, hour, units } = opts;
  const weekAgo = shiftDay(today, -6);
  const twoWeeks = shiftDay(today, -13);

  const [goal, todayFood, water, todaySets, checkedIn, sessions, acts, measures, checkins, supps, suppLogs, labs, wplan, mplan] = await Promise.all([
    db.prepare("SELECT targets_json, derivation_json, weekly_load_target FROM client_goals WHERE client_id=? AND status='active' ORDER BY created_at DESC LIMIT 1").bind(cid).first<{ targets_json: string | null; derivation_json: string | null; weekly_load_target: number | null }>(),
    db.prepare("SELECT COALESCE(SUM(calories),0) cal, COALESCE(SUM(protein_g),0) pro FROM food_entries WHERE client_id=? AND date_local=?").bind(cid, today).first<{ cal: number; pro: number }>(),
    db.prepare("SELECT total_ml FROM water_logs WHERE client_id=? AND date_local=?").bind(cid, today).first<{ total_ml: number }>(),
    db.prepare("SELECT entries_json FROM exercise_logs WHERE client_id=? AND date_local=?").bind(cid, today).all<{ entries_json: string | null }>(),
    db.prepare("SELECT 1 x FROM check_ins WHERE client_id=? AND date_local=?").bind(cid, today).first<{ x: number }>(),
    db.prepare("SELECT date_local, entries_json FROM exercise_logs WHERE client_id=? AND date_local>=?").bind(cid, twoWeeks).all<{ date_local: string; entries_json: string | null }>(),
    db.prepare("SELECT date_local, activity_key, duration_min FROM activity_logs WHERE client_id=? AND date_local>=?").bind(cid, weekAgo).all<{ date_local: string; activity_key: string | null; duration_min: number | null }>(),
    db.prepare("SELECT date_local, weight_kg, body_fat_percent FROM measurements WHERE client_id=? AND weight_kg IS NOT NULL ORDER BY date_local DESC LIMIT 10").bind(cid).all<{ date_local: string; weight_kg: number | null; body_fat_percent: number | null }>(),
    db.prepare("SELECT date_local, mood, energy, stress, sleep_hours, notes, trainer_feedback FROM check_ins WHERE client_id=? ORDER BY date_local DESC LIMIT 5").bind(cid).all<{ date_local: string; mood: number | null; energy: number | null; stress: number | null; sleep_hours: number | null; notes: string | null; trainer_feedback: string | null }>(),
    db.prepare("SELECT id, name, dose, schedule_json FROM supplements WHERE client_id=? AND status='active'").bind(cid).all<{ id: string; name: string; dose: string | null; schedule_json: string | null }>(),
    db.prepare("SELECT COUNT(*) n FROM supplement_logs WHERE client_id=? AND date_local=?").bind(cid, today).first<{ n: number }>(),
    db.prepare("SELECT display_name, status, values_json FROM lab_tests WHERE client_id=? ORDER BY created_at DESC LIMIT 4").bind(cid).all<{ display_name: string; status: string; values_json: string | null }>(),
    db.prepare("SELECT name, body_json FROM workout_plans WHERE client_id=? AND status='published' LIMIT 1").bind(cid).first<{ name: string; body_json: string | null }>(),
    db.prepare("SELECT name, body_json FROM meal_plans WHERE client_id=? AND status='published' LIMIT 1").bind(cid).first<{ name: string; body_json: string | null }>(),
  ]);

  const targets = parseJson<{ targetCalories?: number; targetProteinG?: number; targetWaterMl?: number }>(goal?.targets_json, {});
  const primaryGoal = parseJson<{ primaryGoal?: string }>(goal?.derivation_json, {}).primaryGoal;
  const intake = parseJson<Record<string, unknown>>(client.intake_json, {});

  // This week's training.
  const activeDays = new Set<string>();
  let weekLoad = 0;
  const best = new Map<string, { e1: number; date: string }>();
  for (const s of (sessions.results ?? [])) {
    const entries = parseJson<SessionEntry[]>(s.entries_json, []);
    const sets = entries.flatMap((e) => e.sets);
    if (s.date_local >= weekAgo && sets.some((x) => x.completed !== false)) { activeDays.add(s.date_local); weekLoad += sessionLoad({ sets }); }
    for (const e of entries) for (const set of e.sets) {
      if (set.completed === false || !set.weightKg || !set.reps) continue;
      const e1 = epley1Rm(set.weightKg, set.reps); if (e1 == null) continue;
      const cur = best.get(e.exerciseId); if (!cur || e1 > cur.e1) best.set(e.exerciseId, { e1, date: s.date_local });
    }
  }
  for (const a of (acts.results ?? [])) { activeDays.add(a.date_local); weekLoad += sessionLoad({ cardio: [{ met: activityByKey(a.activity_key ?? "").met, durationMin: a.duration_min ?? 0 }] }); }
  const prsThisWeek = [...best.values()].filter((b) => b.date >= weekAgo).length;

  const checkinDates = new Set((checkins.results ?? []).map((r) => r.date_local));
  const sleepVals = (checkins.results ?? []).map((r) => r.sleep_hours).filter((h): h is number => h != null);
  const avgSleep = sleepVals.length ? Math.round((sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length) * 10) / 10 : null;

  const weights = (measures.results ?? []).filter((m) => m.weight_kg != null);
  let weightLine: string | null = null;
  if (weights.length >= 2) {
    const latest = weights[0]!.weight_kg!, prior = weights[weights.length - 1]!.weight_kg!;
    const delta = Math.round((kgToDisplay(latest, units) - kgToDisplay(prior, units)) * 10) / 10;
    weightLine = `${fmtWeight(latest, units)} now (${delta > 0 ? "+" : ""}${delta} ${weightLabel(units)} over ${weights.length} weigh-ins)`;
  }

  const suppSlots = (supps.results ?? []).reduce((n, s) => n + Math.max(1, parseJson<{ slot: string }[]>(s.schedule_json, []).length), 0);
  const wplanDays = wplan ? parseJson<{ days?: { name?: string; isRestDay?: boolean }[] }>(wplan.body_json, {}).days ?? [] : [];
  const mealTypes = mplan ? [...new Set(parseJson<{ mealOptions?: { mealType: string }[] }>(mplan.body_json, {}).mealOptions?.map((o) => o.mealType) ?? [])] : [];
  const latestCheckin = (checkins.results ?? [])[0];
  const labLine = (labs.results ?? []).map((l) => {
    const vals = parseJson<{ marker: string; flag?: string }[]>(l.values_json, []);
    const flagged = vals.filter((v) => v.flag && v.flag !== "normal").map((v) => `${v.marker} ${v.flag}`);
    return `${l.display_name} (${l.status}${flagged.length ? `; ${flagged.join(", ")}` : ""})`;
  });

  const compLine = await bodyCompLine(db, client);
  const cal = Math.round(todayFood?.cal ?? 0), pro = Math.round(todayFood?.pro ?? 0);
  const lines = [
    `NOW: ${new Date(`${today}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })} ${today}, ${partOfDay(hour)}.`,
    `CLIENT: ${client.display_name}${client.gender ? `, ${client.gender}` : ""}. Goal: ${primaryGoal ?? "general fitness"}.`,
    targets.targetCalories ? `TARGETS: ${targets.targetCalories} kcal, ${targets.targetProteinG ?? "?"}g protein, ${targets.targetWaterMl ?? "?"}ml water/day. Weekly training load target ${goal?.weekly_load_target ?? 300}.` : `TARGETS: none set yet.`,
    `TODAY: ${checkedIn ? "checked in" : "not checked in"}; ${cal} kcal / ${pro}g protein logged; ${water?.total_ml ?? 0}ml water; ${todaySets.results?.length ? "workout logged" : "no workout logged yet"}; supplements ${suppLogs?.n ?? 0}/${suppSlots} taken.`,
    `THIS WEEK: ${activeDays.size} active days; training load ${Math.round(weekLoad)}; ${prsThisWeek} new PR${prsThisWeek === 1 ? "" : "s"}; check-ins on ${checkinDates.size} days (streak ${currentStreak(checkinDates, today)}); avg sleep ${avgSleep ?? "?"}h.`,
    weightLine ? `BODY: ${weightLine}.` : null,
    compLine,
    wplan ? `WORKOUT PLAN: "${wplan.name}" — ${wplanDays.filter((d) => !d.isRestDay).length} training days.` : `WORKOUT PLAN: none published.`,
    mplan ? `MEAL PLAN: "${mplan.name}" — meals: ${mealTypes.join(", ") || "n/a"}.` : `MEAL PLAN: none published.`,
    (supps.results ?? []).length ? `SUPPLEMENTS: ${(supps.results ?? []).map((s) => s.name + (s.dose ? ` ${s.dose}` : "")).join(", ")}.` : null,
    labLine.length ? `LABS: ${labLine.join("; ")}.` : null,
    latestCheckin ? `LATEST CHECK-IN (${latestCheckin.date_local}): mood ${latestCheckin.mood ?? "?"}/5, energy ${latestCheckin.energy ?? "?"}/5, sleep ${latestCheckin.sleep_hours ?? "?"}h${latestCheckin.notes ? `; note: "${latestCheckin.notes.slice(0, 160)}"` : ""}${latestCheckin.trainer_feedback ? `; coach said: "${latestCheckin.trainer_feedback.slice(0, 160)}"` : ""}.` : null,
    Object.keys(intake).length ? `INTAKE: ${JSON.stringify(intake).slice(0, 400)}.` : null,
  ].filter(Boolean);

  const text = lines.join("\n");
  // Hash the MATERIAL signals only (coarse time bucket, not the exact hour) so a
  // message caches within a part-of-day but refreshes the moment data changes.
  const signalHash = shortHash(text);
  return { text, signalHash };
}
