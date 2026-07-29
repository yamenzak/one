/**
 * Coach attention — one roster rollup of everything across a coach's visible
 * clients that needs their eyes (SPEC §8.11 generalized). The catalog of types
 * + severity lives in `@kova/domain` (`ATTENTION_TYPES`); this fills each with
 * real data. `rollupAttention` is the shared computation — the route serves it
 * to the app, and the weekly digest reuses it so email + in-app never drift.
 */

import { Hono } from "hono";
import {
  ATTENTION_TYPES, SEVERITY_RANK, rankByAttention, goalStaleness, calculateBMR, ageFromDob, profileGaps, rangeStatus,
  overallDaysRemaining, isFullyExpired, addDays, type AttentionType, type AttentionSeverity, type Budget, type ClientPreferences,
} from "@kova/domain";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { REPORTED_ACCESS_STATUSES } from "./client-flags.js";
import { visibleClientIds } from "./clients.js";
import { parseJson } from "./db.js";

interface OutItem { type: AttentionType; severity: AttentionSeverity; label: string; actionLabel: string; detail: string | null; link: string }
export interface AttentionClientRow { id: string; user_id: string | null; created_at?: string | null; display_name: string; email: string | null; avatar_url: string | null; gender: string | null; date_of_birth: string | null; height_cm: number | null; preferences_json: string | null }
export interface AttentionRollup {
  clients: { clientId: string; name: string; email: string | null; avatarUrl: string | null; items: OutItem[] }[];
  totals: Record<string, number>;
  total: number;
}

const SELECT_CLIENT = "id, user_id, created_at, display_name, email, avatar_url, gender, date_of_birth, height_cm, preferences_json";

/** Compute the attention rollup for a specific set of client rows. */
export async function rollupAttention(db: D1Database, clients: AttentionClientRow[]): Promise<AttentionRollup> {
  const ids = clients.map((r) => r.id);
  if (ids.length === 0) return { clients: [], totals: {}, total: 0 };
  const ph = ids.map(() => "?").join(",");
  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();
  const since14 = addDays(today, -14);
  const since60 = addDays(today, -60);

  const [lastRows, goalRows, measRows, checkRows, labRows, swapRows, subRows, foodRows, wPlanRows, mPlanRows, labFlagRows] = await Promise.all([
    db.prepare(`SELECT client_id, MAX(d) AS last FROM (
        SELECT client_id, MAX(date_local) AS d FROM check_ins WHERE client_id IN (${ph}) GROUP BY client_id
        UNION ALL SELECT client_id, MAX(date_local) FROM exercise_logs WHERE client_id IN (${ph}) GROUP BY client_id
        UNION ALL SELECT client_id, MAX(date_local) FROM food_entries WHERE client_id IN (${ph}) GROUP BY client_id
      ) GROUP BY client_id`).bind(...ids, ...ids, ...ids).all<{ client_id: string; last: string | null }>(),
    db.prepare(`SELECT client_id, targets_json, ranges_json, derivation_json FROM client_goals WHERE client_id IN (${ph}) AND status = 'active'`).bind(...ids).all<{ client_id: string; targets_json: string | null; ranges_json: string | null; derivation_json: string | null }>(),
    db.prepare(`SELECT m.client_id, m.weight_kg, m.body_fat_percent FROM measurements m JOIN (
        SELECT client_id, MAX(date_local) AS d FROM measurements WHERE weight_kg IS NOT NULL AND client_id IN (${ph}) GROUP BY client_id
      ) x ON m.client_id = x.client_id AND m.date_local = x.d`).bind(...ids).all<{ client_id: string; weight_kg: number | null; body_fat_percent: number | null }>(),
    db.prepare(`SELECT client_id, COUNT(*) AS n FROM check_ins WHERE client_id IN (${ph}) AND trainer_feedback IS NULL AND date_local >= ? GROUP BY client_id`).bind(...ids, since14).all<{ client_id: string; n: number }>(),
    db.prepare(`SELECT client_id, COUNT(*) AS n FROM lab_tests WHERE client_id IN (${ph}) AND status = 'uploaded' GROUP BY client_id`).bind(...ids).all<{ client_id: string; n: number }>(),
    db.prepare(`SELECT client_id, COUNT(*) AS n FROM swap_requests WHERE client_id IN (${ph}) AND status = 'pending' GROUP BY client_id`).bind(...ids).all<{ client_id: string; n: number }>(),
    // EVERY access row per client, not just the newest one. Days STACK across
    // packages (BILLING-PLAN §7) and a client legitimately holds several rows (a
    // membership row per Stripe subscription + the non-recurring row one-time
    // purchases fold into), so "newest row wins" flagged access as
    // expiring/expired while another live package still covered them — and
    // disagreed with the enforcing gate in `client-flags.ts`. The join on
    // `clients` also pins each row to its client's OWN tenant, so a mis-tenanted
    // row can't feed this rollup (the batched read is per-roster, hence SQL here
    // rather than the per-client `loadClientAccessRows` helper).
    db.prepare(`SELECT s.client_id, s.budgets_json FROM client_subscriptions s
        JOIN clients c ON c.id = s.client_id AND c.tenant_id = s.tenant_id
        WHERE s.client_id IN (${ph}) AND s.status IN (${REPORTED_ACCESS_STATUSES.map(() => "?").join(",")})`).bind(...ids, ...REPORTED_ACCESS_STATUSES).all<{ client_id: string; budgets_json: string | null }>(),
    db.prepare(`SELECT client_id, date_local, SUM(calories) AS cal, MAX(target_calories) AS tcal FROM food_entries WHERE client_id IN (${ph}) AND date_local >= ? GROUP BY client_id, date_local`).bind(...ids, since14).all<{ client_id: string; date_local: string; cal: number; tcal: number | null }>(),
    db.prepare(`SELECT DISTINCT client_id FROM workout_plans WHERE client_id IN (${ph}) AND status = 'published'`).bind(...ids).all<{ client_id: string }>(),
    db.prepare(`SELECT DISTINCT client_id FROM meal_plans WHERE client_id IN (${ph}) AND status = 'published'`).bind(...ids).all<{ client_id: string }>(),
    db.prepare(`SELECT client_id, values_json FROM lab_tests WHERE client_id IN (${ph}) AND status = 'reviewed' AND reviewed_at >= ?`).bind(...ids, since60).all<{ client_id: string; values_json: string | null }>(),
  ]);

  const lastBy = new Map((lastRows.results ?? []).map((r) => [r.client_id, r.last]));
  const goalBy = new Map((goalRows.results ?? []).map((r) => [r.client_id, {
    targets: parseJson<{ targetCalories?: number }>(r.targets_json, {}),
    ranges: parseJson<{ weightKg?: { min: number | null; max: number | null } }>(r.ranges_json, {}),
    deriv: parseJson<{ snapshotWeightKg?: number; bmr?: number }>(r.derivation_json, {}),
  }]));
  const measBy = new Map((measRows.results ?? []).map((r) => [r.client_id, r]));
  const countBy = (rows: { client_id: string; n: number }[]) => new Map(rows.map((r) => [r.client_id, r.n]));
  const checkBy = countBy(checkRows.results ?? []);
  const labBy = countBy(labRows.results ?? []);
  const swapBy = countBy(swapRows.results ?? []);
  // Concatenate every row's budgets per client (queue-not-sum: each entry carries
  // its own expiry, so the engine derives remaining days from the whole set).
  const subBy = new Map<string, Budget[]>();
  for (const r of subRows.results ?? []) {
    subBy.set(r.client_id, [...(subBy.get(r.client_id) ?? []), ...parseJson<Budget[]>(r.budgets_json, [])]);
  }
  const hasWorkout = new Set((wPlanRows.results ?? []).map((r) => r.client_id));
  const hasMeal = new Set((mPlanRows.results ?? []).map((r) => r.client_id));
  const flaggedBy = new Set<string>();
  for (const r of labFlagRows.results ?? []) {
    const vals = parseJson<{ flag?: string | null }[]>(r.values_json, []);
    if (vals.some((v) => v.flag === "low" || v.flag === "high")) flaggedBy.add(r.client_id);
  }
  // Per-client calorie adherence over the logged days in the window.
  const adhBy = new Map<string, { graded: number; within: number }>();
  for (const r of foodRows.results ?? []) {
    const target = r.tcal ?? goalBy.get(r.client_id)?.targets.targetCalories ?? null;
    if (!target || !(r.cal > 0)) continue;
    const acc = adhBy.get(r.client_id) ?? { graded: 0, within: 0 };
    acc.graded++;
    if (Math.abs(r.cal - target) <= target * 0.1) acc.within++;
    adhBy.set(r.client_id, acc);
  }

  const totals: Record<string, number> = {};
  const bump = (t: AttentionType) => { totals[t] = (totals[t] ?? 0) + 1; };
  const mk = (type: AttentionType, severity: AttentionSeverity, detail: string | null, clientId: string): OutItem => {
    const meta = ATTENTION_TYPES[type];
    bump(type);
    return { type, severity, label: meta.label, actionLabel: meta.actionLabel, detail, link: `/clients/${clientId}/${meta.clientTab}` };
  };

  const rows: AttentionRollup["clients"] = [];
  for (const cl of clients) {
    const items: OutItem[] = [];
    const goal = goalBy.get(cl.id);
    const meas = measBy.get(cl.id);

    /*
      NEVER SIGNED IN → one item, and it is not a lapse.

      Every rule below assumes an active client who stopped doing something.
      Run against someone who has not started, they compound into "Gone quiet ·
      No activity logged yet · No published plan · Profile incomplete" for a
      client invited five seconds ago — four accusations for a state that has a
      name. `user_id` is null until the first sign-in, so that is the signal.
    */
    if (cl.user_id == null) {
      // The detail says something the label does not: how long it has been
      // waiting, which is what decides whether to resend.
      const invitedDays = cl.created_at ? Math.floor((Date.parse(today) - Date.parse(cl.created_at.slice(0, 10))) / 86_400_000) : null;
      const detail = invitedDays == null ? null
        : invitedDays <= 0 ? "Invited today"
        : invitedDays === 1 ? "Invited yesterday"
        : `Invited ${invitedDays} days ago`;
      items.push(mk("invite_pending", "info", detail, cl.id));
      rows.push({ clientId: cl.id, name: cl.display_name, email: cl.email, avatarUrl: cl.avatar_url, items });
      continue;
    }

    // Gone quiet.
    const last = lastBy.get(cl.id) ?? null;
    const daysSince = last ? Math.round((Date.parse(today) - Date.parse(last)) / 86_400_000) : null;
    if (daysSince === null || daysSince >= 5) {
      items.push(mk("client_quiet", daysSince === null || daysSince >= 10 ? "urgent" : "warn", daysSince === null ? "No activity logged yet" : `No logs in ${daysSince} days`, cl.id));
    }

    // Stale goal — body drifted from the active goal's snapshot.
    if (goal) {
      const age = ageFromDob(cl.date_of_birth);
      const curW = meas?.weight_kg ?? null;
      const curBmr = curW != null && cl.height_cm && age != null && cl.gender
        ? calculateBMR({ weightKg: curW, heightCm: cl.height_cm, ageYears: age, gender: cl.gender as "male" | "female", bodyFatPercent: meas?.body_fat_percent ?? null })?.bmr ?? null
        : null;
      const st = goalStaleness({ goalWeightKg: goal.deriv.snapshotWeightKg ?? null, currentWeightKg: curW, goalBmr: goal.deriv.bmr ?? null, currentBmr: curBmr });
      if (st.stale) items.push(mk("goal_stale", "warn", st.reason, cl.id));

      // Off target weight — latest weigh-in outside the goal's healthy band.
      const wr = goal.ranges.weightKg;
      if (curW != null && wr && (wr.min != null || wr.max != null)) {
        const status = rangeStatus(curW, wr.min, wr.max);
        if (status !== "in_range") items.push(mk("weight_off_range", "warn", status === "above" ? "Above target range" : "Below target range", cl.id));
      }
    }

    const cn = checkBy.get(cl.id) ?? 0;
    if (cn > 0) items.push(mk("checkin_unanswered", "warn", `${cn} check-in${cn > 1 ? "s" : ""} to answer`, cl.id));
    const ln = labBy.get(cl.id) ?? 0;
    if (ln > 0) items.push(mk("lab_review", "warn", `${ln} lab${ln > 1 ? "s" : ""} to review`, cl.id));
    if (flaggedBy.has(cl.id)) items.push(mk("lab_flagged", "urgent", "Out-of-range result", cl.id));
    const sn = swapBy.get(cl.id) ?? 0;
    if (sn > 0) items.push(mk("swap_pending", "warn", `${sn} swap${sn > 1 ? "s" : ""} to decide`, cl.id));

    // Low calorie adherence over the window (needs enough logged days to be fair).
    const adh = adhBy.get(cl.id);
    if (adh && adh.graded >= 5) { const pct = adh.within / adh.graded; if (pct < 0.4) items.push(mk("adherence_low", "info", `${Math.round(pct * 100)}% of days on target`, cl.id)); }

    // No active plan — neither a published workout nor meal plan.
    if (!hasWorkout.has(cl.id) && !hasMeal.has(cl.id)) items.push(mk("no_active_plan", "warn", "No published plan", cl.id));

    // Access lapsing — only clients who actually hold a package.
    const budgets = subBy.get(cl.id);
    if (budgets && budgets.length) {
      if (isFullyExpired(budgets, nowIso)) items.push(mk("access_expired", "urgent", "Access expired", cl.id));
      else { const dr = overallDaysRemaining(budgets, nowIso); if (dr <= 7) items.push(mk("access_expiring", "warn", `Access ends in ${dr} day${dr !== 1 ? "s" : ""}`, cl.id)); }
    }

    // Profile incomplete.
    const gaps = profileGaps({ gender: cl.gender, dateOfBirth: cl.date_of_birth, heightCm: cl.height_cm, prefs: parseJson<ClientPreferences>(cl.preferences_json, {}) });
    if (gaps.length > 0) items.push(mk("profile_incomplete", "info", `${gaps.length} field${gaps.length > 1 ? "s" : ""} missing`, cl.id));

    if (items.length) {
      items.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]); // worst first
      rows.push({ clientId: cl.id, name: cl.display_name, email: cl.email, avatarUrl: cl.avatar_url, items });
    }
  }

  return { clients: rankByAttention(rows), totals, total: rows.length };
}

export const attentionRoutes = new Hono<AppEnv>().get("/coach/attention", async (c) => {
  const who = requireTenant(c)!;
  if (c.get("role") === "client") return c.json({ error: "forbidden" }, 403);
  const scope = await visibleClientIds(c);
  if (scope !== "all" && scope.length === 0) return c.json({ clients: [], totals: {}, total: 0 });
  const where = scope === "all" ? "tenant_id = ? AND status = 'active'" : `tenant_id = ? AND status = 'active' AND id IN (${scope.map(() => "?").join(",")})`;
  const binds = scope === "all" ? [who.tenantId] : [who.tenantId, ...scope];
  const clients = (await c.env.DB.prepare(`SELECT ${SELECT_CLIENT} FROM clients WHERE ${where}`).bind(...binds).all<AttentionClientRow>()).results ?? [];
  return c.json(await rollupAttention(c.env.DB, clients));
});
