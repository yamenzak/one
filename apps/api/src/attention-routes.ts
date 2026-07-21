/**
 * Coach attention — one roster query that rolls up everything across a coach's
 * visible clients that needs their eyes (SPEC §8.11 generalized): stale goals,
 * clients gone quiet, check-ins awaiting feedback, labs to review, pending
 * swaps, lapsing access, incomplete profiles. The catalog of types + severity
 * lives in `@mossa/domain` (`ATTENTION_TYPES`); this route fills each with real
 * data. Replaces the coach home's ad-hoc, notification-proxied counts.
 */

import { Hono } from "hono";
import {
  ATTENTION_TYPES, SEVERITY_RANK, rankByAttention, goalStaleness, calculateBMR, ageFromDob, profileGaps,
  overallDaysRemaining, isFullyExpired, addDays, type AttentionType, type AttentionSeverity, type Budget, type ClientPreferences,
} from "@mossa/domain";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { visibleClientIds } from "./clients.js";
import { parseJson } from "./db.js";

interface OutItem { type: AttentionType; severity: AttentionSeverity; label: string; actionLabel: string; detail: string | null; link: string }

export const attentionRoutes = new Hono<AppEnv>().get("/coach/attention", async (c) => {
  const who = requireTenant(c)!;
  if (c.get("role") === "client") return c.json({ error: "forbidden" }, 403);
  const scope = await visibleClientIds(c);
  if (scope !== "all" && scope.length === 0) return c.json({ clients: [], totals: {}, total: 0 });
  const db = c.env.DB;
  const where = scope === "all" ? "tenant_id = ? AND status = 'active'" : `tenant_id = ? AND status = 'active' AND id IN (${scope.map(() => "?").join(",")})`;
  const binds = scope === "all" ? [who.tenantId] : [who.tenantId, ...scope];
  const clients = (await db.prepare(`SELECT id, display_name, email, avatar_url, avatar_seed, gender, date_of_birth, height_cm, preferences_json FROM clients WHERE ${where}`).bind(...binds).all<{ id: string; display_name: string; email: string | null; avatar_url: string | null; avatar_seed: string | null; gender: string | null; date_of_birth: string | null; height_cm: number | null; preferences_json: string | null }>()).results ?? [];
  const ids = clients.map((r) => r.id);
  if (ids.length === 0) return c.json({ clients: [], totals: {}, total: 0 });
  const ph = ids.map(() => "?").join(",");
  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();
  const since14 = addDays(today, -14);

  const [lastRows, goalRows, measRows, checkRows, labRows, swapRows, subRows] = await Promise.all([
    db.prepare(`SELECT client_id, MAX(d) AS last FROM (
        SELECT client_id, MAX(date_local) AS d FROM check_ins WHERE client_id IN (${ph}) GROUP BY client_id
        UNION ALL SELECT client_id, MAX(date_local) FROM exercise_logs WHERE client_id IN (${ph}) GROUP BY client_id
        UNION ALL SELECT client_id, MAX(date_local) FROM food_entries WHERE client_id IN (${ph}) GROUP BY client_id
      ) GROUP BY client_id`).bind(...ids, ...ids, ...ids).all<{ client_id: string; last: string | null }>(),
    db.prepare(`SELECT client_id, derivation_json FROM client_goals WHERE client_id IN (${ph}) AND status = 'active'`).bind(...ids).all<{ client_id: string; derivation_json: string | null }>(),
    db.prepare(`SELECT m.client_id, m.weight_kg, m.body_fat_percent FROM measurements m JOIN (
        SELECT client_id, MAX(date_local) AS d FROM measurements WHERE weight_kg IS NOT NULL AND client_id IN (${ph}) GROUP BY client_id
      ) x ON m.client_id = x.client_id AND m.date_local = x.d`).bind(...ids).all<{ client_id: string; weight_kg: number | null; body_fat_percent: number | null }>(),
    db.prepare(`SELECT client_id, COUNT(*) AS n FROM check_ins WHERE client_id IN (${ph}) AND trainer_feedback IS NULL AND date_local >= ? GROUP BY client_id`).bind(...ids, since14).all<{ client_id: string; n: number }>(),
    db.prepare(`SELECT client_id, COUNT(*) AS n FROM lab_tests WHERE client_id IN (${ph}) AND status = 'uploaded' GROUP BY client_id`).bind(...ids).all<{ client_id: string; n: number }>(),
    db.prepare(`SELECT client_id, COUNT(*) AS n FROM swap_requests WHERE client_id IN (${ph}) AND status = 'pending' GROUP BY client_id`).bind(...ids).all<{ client_id: string; n: number }>(),
    db.prepare(`SELECT s.client_id, s.budgets_json FROM client_subscriptions s JOIN (
        SELECT client_id, MAX(started_at) AS st FROM client_subscriptions WHERE client_id IN (${ph}) AND status IN ('active','paused','expired') GROUP BY client_id
      ) x ON s.client_id = x.client_id AND s.started_at = x.st`).bind(...ids).all<{ client_id: string; budgets_json: string | null }>(),
  ]);

  const lastBy = new Map((lastRows.results ?? []).map((r) => [r.client_id, r.last]));
  const derivBy = new Map((goalRows.results ?? []).map((r) => [r.client_id, parseJson<{ snapshotWeightKg?: number; bmr?: number }>(r.derivation_json, {})]));
  const measBy = new Map((measRows.results ?? []).map((r) => [r.client_id, r]));
  const countBy = (rows: { client_id: string; n: number }[]) => new Map(rows.map((r) => [r.client_id, r.n]));
  const checkBy = countBy(checkRows.results ?? []);
  const labBy = countBy(labRows.results ?? []);
  const swapBy = countBy(swapRows.results ?? []);
  const subBy = new Map((subRows.results ?? []).map((r) => [r.client_id, parseJson<Budget[]>(r.budgets_json, [])]));

  const totals: Record<string, number> = {};
  const bump = (t: AttentionType) => { totals[t] = (totals[t] ?? 0) + 1; };
  const mk = (type: AttentionType, severity: AttentionSeverity, detail: string | null, clientId: string): OutItem => {
    const meta = ATTENTION_TYPES[type];
    bump(type);
    return { type, severity, label: meta.label, actionLabel: meta.actionLabel, detail, link: `/clients/${clientId}/${meta.clientTab}` };
  };

  const rows: { clientId: string; name: string; email: string | null; avatarUrl: string | null; items: OutItem[] }[] = [];
  for (const cl of clients) {
    const items: OutItem[] = [];

    // Gone quiet — no logs in a while.
    const last = lastBy.get(cl.id) ?? null;
    const daysSince = last ? Math.round((Date.parse(today) - Date.parse(last)) / 86_400_000) : null;
    if (daysSince === null || daysSince >= 5) {
      items.push(mk("client_quiet", daysSince === null || daysSince >= 10 ? "urgent" : "warn", daysSince === null ? "No activity logged yet" : `No logs in ${daysSince} days`, cl.id));
    }

    // Stale goal — the body drifted from the active goal's snapshot.
    const deriv = derivBy.get(cl.id);
    if (deriv) {
      const meas = measBy.get(cl.id);
      const age = ageFromDob(cl.date_of_birth);
      const curW = meas?.weight_kg ?? null;
      const curBmr = curW != null && cl.height_cm && age != null && cl.gender
        ? calculateBMR({ weightKg: curW, heightCm: cl.height_cm, ageYears: age, gender: cl.gender as "male" | "female", bodyFatPercent: meas?.body_fat_percent ?? null })?.bmr ?? null
        : null;
      const st = goalStaleness({ goalWeightKg: deriv.snapshotWeightKg ?? null, currentWeightKg: curW, goalBmr: deriv.bmr ?? null, currentBmr: curBmr });
      if (st.stale) items.push(mk("goal_stale", "warn", st.reason, cl.id));
    }

    const cn = checkBy.get(cl.id) ?? 0;
    if (cn > 0) items.push(mk("checkin_unanswered", "warn", `${cn} check-in${cn > 1 ? "s" : ""} to answer`, cl.id));
    const ln = labBy.get(cl.id) ?? 0;
    if (ln > 0) items.push(mk("lab_review", "warn", `${ln} lab${ln > 1 ? "s" : ""} to review`, cl.id));
    const sn = swapBy.get(cl.id) ?? 0;
    if (sn > 0) items.push(mk("swap_pending", "warn", `${sn} swap${sn > 1 ? "s" : ""} to decide`, cl.id));

    // Access — only clients who actually have a package/subscription.
    const budgets = subBy.get(cl.id);
    if (budgets && budgets.length) {
      if (isFullyExpired(budgets, nowIso)) items.push(mk("access_expired", "urgent", "Access expired", cl.id));
      else { const dr = overallDaysRemaining(budgets, nowIso); if (dr <= 7) items.push(mk("access_expiring", "warn", `Access ends in ${dr} day${dr !== 1 ? "s" : ""}`, cl.id)); }
    }

    // Profile incomplete — missing fields the calc/targets need.
    const gaps = profileGaps({ gender: cl.gender, dateOfBirth: cl.date_of_birth, heightCm: cl.height_cm, prefs: parseJson<ClientPreferences>(cl.preferences_json, {}) });
    if (gaps.length > 0) items.push(mk("profile_incomplete", "info", `${gaps.length} field${gaps.length > 1 ? "s" : ""} missing`, cl.id));

    if (items.length) {
      items.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]); // worst first
      rows.push({ clientId: cl.id, name: cl.display_name, email: cl.email, avatarUrl: cl.avatar_url, items });
    }
  }

  return c.json({ clients: rankByAttention(rows), totals, total: rows.length });
});
