/**
 * Weekly digest (Mondays 08:00 UTC). Per role, a plain-numbers recap of the last
 * 7 days, emailed through the tenant's provider — but only to users who've kept
 * the `digest` email channel on. Best-effort per user/tenant so one failure
 * doesn't sink the sweep.
 */

import { resolveChannels, parseNotifPrefs, type NotifRole } from "@mossa/domain";
import type { Env } from "./env.js";
import { sendTenantEmail } from "./email-provider.js";
import { emailShell, escapeHtml } from "./mailer.js";

interface Stat { label: string; value: string | number }

function digestHtml(heading: string, intro: string, stats: Stat[], footer?: string): string {
  const rows = stats
    .map((s) => `<tr><td style="padding:8px 0;color:#c8cbd0">${s.label}</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#e8eaed">${s.value}</td></tr>`)
    .join("");
  return emailShell(heading, `<p style="margin:0 0 14px">${intro}</p><table style="width:100%;border-collapse:collapse">${rows}</table>${footer ? `<p style="margin:16px 0 0;color:#9aa0a6;font-size:13px">${footer}</p>` : ""}`);
}

/** Whether this user still wants the weekly digest by email. */
async function digestOn(db: D1Database, userId: string, role: NotifRole): Promise<boolean> {
  const row = await db.prepare("SELECT notif_json FROM user_prefs WHERE user_id = ?").bind(userId).first<{ notif_json: string | null }>();
  return resolveChannels(role, parseNotifPrefs(row?.notif_json ?? null), "digest").email;
}

const num = (v: unknown): number => Number((v as { n?: number })?.n ?? 0);

/** Idempotency + resume gate: claim this (user, week, role) send. Returns true
 *  only the first time — a cron redelivery or a re-run skips already-sent users
 *  instead of re-emailing. On a DB error it proceeds (at-least-once). */
async function claimSend(db: D1Database, userId: string, period: string, kind: string, at: string): Promise<boolean> {
  try {
    const r = await db.prepare("INSERT OR IGNORE INTO digest_sent (user_id, period, kind, at) VALUES (?, ?, ?, ?)").bind(userId, period, kind, at).run();
    return (r.meta?.changes ?? 0) > 0;
  } catch {
    return true;
  }
}

export async function runWeeklyDigest(env: Env): Promise<void> {
  const db = env.DB;
  const nowMs = Date.now();
  const weekAgoDate = new Date(nowMs - 7 * 86_400_000).toISOString().slice(0, 10);
  const weekAgoIso = new Date(nowMs - 7 * 86_400_000).toISOString();
  const period = new Date(nowMs).toISOString().slice(0, 10); // the run's Monday

  const tenants = await db.prepare("SELECT id, name FROM organization").all<{ id: string; name: string }>().catch(() => ({ results: [] as { id: string; name: string }[] }));
  for (const t of tenants.results ?? []) {
    try {
      await digestForTenant(env, t.id, t.name, weekAgoDate, weekAgoIso, period);
    } catch { /* one tenant's failure never stops the sweep */ }
  }
}

async function digestForTenant(env: Env, tenantId: string, brand: string, weekAgoDate: string, weekAgoIso: string, period: string): Promise<void> {
  const db = env.DB;
  const sentAt = new Date().toISOString();

  // ── Owners: studio health ─────────────────────────────────────────────────
  const [activeClients, activeThisWeek, checkIns, newSales, sub] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS n FROM clients WHERE tenant_id = ? AND status = 'active'").bind(tenantId).first(),
    db.prepare("SELECT COUNT(DISTINCT client_id) AS n FROM (SELECT client_id FROM exercise_logs WHERE tenant_id = ? AND date_local >= ? UNION SELECT client_id FROM check_ins WHERE tenant_id = ? AND date_local >= ? UNION SELECT client_id FROM food_entries WHERE tenant_id = ? AND date_local >= ?)").bind(tenantId, weekAgoDate, tenantId, weekAgoDate, tenantId, weekAgoDate).first(),
    db.prepare("SELECT COUNT(*) AS n FROM check_ins WHERE tenant_id = ? AND date_local >= ?").bind(tenantId, weekAgoDate).first(),
    db.prepare("SELECT COUNT(*) AS n FROM client_subscriptions WHERE tenant_id = ? AND source = 'stripe' AND started_at >= ?").bind(tenantId, weekAgoIso).first(),
    db.prepare("SELECT status FROM subscriptions WHERE tenant_id = ?").bind(tenantId).first<{ status: string }>(),
  ]);
  const active = num(activeClients);
  const engaged = num(activeThisWeek);
  const atRisk = Math.max(0, active - engaged);
  const owners = await db.prepare("SELECT userId FROM member WHERE organizationId = ? AND role = 'owner'").bind(tenantId).all<{ userId: string | null }>();
  for (const o of owners.results ?? []) {
    if (!o.userId || !(await digestOn(db, o.userId, "owner"))) continue;
    if (!(await claimSend(db, o.userId, period, "owner", sentAt))) continue;
    const email = (await db.prepare('SELECT email FROM "user" WHERE id = ?').bind(o.userId).first<{ email: string | null }>())?.email;
    if (!email) continue;
    const html = digestHtml("Your studio this week", `Here's how ${escapeHtml(brand)} did over the last 7 days.`, [
      { label: "Active clients", value: active },
      { label: "Engaged this week", value: engaged },
      { label: "Quiet (no logs 7d)", value: atRisk },
      { label: "Check-ins received", value: num(checkIns) },
      { label: "New sales", value: num(newSales) },
      { label: "Subscription", value: sub?.status ?? "active" },
    ], atRisk > 0 ? `${atRisk} client${atRisk === 1 ? "" : "s"} went quiet — a nudge goes a long way.` : "Nice week — the roster's engaged.");
    await sendTenantEmail(env, tenantId, { to: email, subject: `${brand} — your week`, html, brandName: brand }).catch(() => undefined);
  }

  // ── Trainers: their assigned clients this week ─────────────────────────────
  const trainers = await db.prepare("SELECT DISTINCT trainer_user_id FROM client_trainers WHERE tenant_id = ?").bind(tenantId).all<{ trainer_user_id: string }>();
  for (const tr of trainers.results ?? []) {
    if (!tr.trainer_user_id || !(await digestOn(db, tr.trainer_user_id, "trainer"))) continue;
    if (!(await claimSend(db, tr.trainer_user_id, period, "trainer", sentAt))) continue;
    const email = (await db.prepare('SELECT email FROM "user" WHERE id = ?').bind(tr.trainer_user_id).first<{ email: string | null }>())?.email;
    if (!email) continue;
    const [assigned, awaiting, quiet] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS n FROM client_trainers WHERE tenant_id = ? AND trainer_user_id = ?").bind(tenantId, tr.trainer_user_id).first(),
      db.prepare("SELECT COUNT(*) AS n FROM check_ins ci JOIN client_trainers ct ON ct.client_id = ci.client_id WHERE ct.trainer_user_id = ? AND ci.date_local >= ? AND ci.trainer_feedback IS NULL").bind(tr.trainer_user_id, weekAgoDate).first(),
      db.prepare("SELECT COUNT(*) AS n FROM client_trainers ct JOIN clients c ON c.id = ct.client_id WHERE ct.trainer_user_id = ? AND c.status = 'active' AND ct.client_id NOT IN (SELECT client_id FROM exercise_logs WHERE date_local >= ? UNION SELECT client_id FROM check_ins WHERE date_local >= ?)").bind(tr.trainer_user_id, weekAgoDate, weekAgoDate).first(),
    ]);
    const html = digestHtml("Your clients this week", "A quick pulse on the clients assigned to you.", [
      { label: "Assigned clients", value: num(assigned) },
      { label: "Check-ins awaiting your feedback", value: num(awaiting) },
      { label: "Clients gone quiet", value: num(quiet) },
    ], num(awaiting) > 0 ? `${num(awaiting)} check-in${num(awaiting) === 1 ? "" : "s"} still need${num(awaiting) === 1 ? "s" : ""} your reply.` : undefined);
    await sendTenantEmail(env, tenantId, { to: email, subject: `${brand} — your clients this week`, html, brandName: brand }).catch(() => undefined);
  }

  // ── Clients: their own week ────────────────────────────────────────────────
  const clients = await db.prepare("SELECT id, user_id FROM clients WHERE tenant_id = ? AND status = 'active' AND user_id IS NOT NULL").bind(tenantId).all<{ id: string; user_id: string }>();
  for (const cl of clients.results ?? []) {
    try {
      if (!(await digestOn(db, cl.user_id, "client"))) continue;
      if (!(await claimSend(db, cl.user_id, period, "client", sentAt))) continue;
      const email = (await db.prepare('SELECT email FROM "user" WHERE id = ?').bind(cl.user_id).first<{ email: string | null }>())?.email;
      if (!email) continue;
      const [workoutDays, foodDays, checkInCount, labs] = await Promise.all([
        db.prepare("SELECT COUNT(DISTINCT date_local) AS n FROM exercise_logs WHERE client_id = ? AND date_local >= ?").bind(cl.id, weekAgoDate).first(),
        db.prepare("SELECT COUNT(DISTINCT date_local) AS n FROM food_entries WHERE client_id = ? AND date_local >= ?").bind(cl.id, weekAgoDate).first(),
        db.prepare("SELECT COUNT(*) AS n FROM check_ins WHERE client_id = ? AND date_local >= ?").bind(cl.id, weekAgoDate).first(),
        db.prepare("SELECT COUNT(*) AS n FROM lab_tests WHERE client_id = ? AND status = 'requested'").bind(cl.id).first(),
      ]);
      const stats: Stat[] = [
        { label: "Workout days", value: num(workoutDays) },
        { label: "Days you logged food", value: num(foodDays) },
        { label: "Check-ins", value: num(checkInCount) },
      ];
      if (num(labs) > 0) stats.push({ label: "Labs to complete", value: num(labs) });
      const html = digestHtml("Your week", "Here's your last 7 days at a glance — keep it going.", stats);
      await sendTenantEmail(env, tenantId, { to: email, subject: `${brand} — your week`, html, brandName: brand }).catch(() => undefined);
    } catch { /* skip this client */ }
  }
}
