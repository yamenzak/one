/**
 * Weekly digest (Mondays 08:00 UTC). Per role, a plain-numbers recap of the last
 * 7 days, emailed through the tenant's provider — but only to users who've kept
 * the `digest` email channel on. Best-effort per user/tenant so one failure
 * doesn't sink the sweep.
 */

import { resolveChannels, parseNotifPrefs, parseNotifPolicy, emailAllowedByPolicy, ATTENTION_TYPES, type NotifRole, type AttentionType } from "@mossa/domain";
import type { Env } from "./env.js";
import { sendTenantEmail } from "./email-provider.js";
import { emailShell, emailButton, escapeHtml, type BrandKit } from "./mailer.js";
import { tenantBrandKit } from "./notify.js";
import { rollupAttention, type AttentionClientRow } from "./attention-routes.js";

const ATTENTION_COLUMNS = "id, display_name, email, avatar_url, gender, date_of_birth, height_cm, preferences_json";
/** Turn an attention-rollup's totals into digest ledger rows (non-zero only). */
function attentionStats(totals: Record<string, number>): Stat[] {
  return (Object.keys(ATTENTION_TYPES) as AttentionType[])
    .filter((t) => (totals[t] ?? 0) > 0)
    .map((t) => ({ label: ATTENTION_TYPES[t].label, value: totals[t]! }));
}

interface Stat { label: string; value: string | number }

/** A premium branded digest: intro, a stat ledger (label left, big value right,
 *  hairline dividers), an optional nudge, and a CTA into the app. */
function digestHtml(brand: BrandKit, heading: string, intro: string, stats: Stat[], ctaHref: string | null, footer?: string): string {
  const rows = stats
    .map((s, i) => `<tr><td style="padding:14px 0;${i ? "border-top:1px solid #23262c;" : ""}font-size:15px;color:#c8cbd0">${escapeHtml(s.label)}</td><td style="padding:14px 0;${i ? "border-top:1px solid #23262c;" : ""}text-align:right;font-size:20px;font-weight:800;color:#e8eaed;font-variant-numeric:tabular-nums">${escapeHtml(String(s.value))}</td></tr>`)
    .join("");
  const body =
    `<p style="margin:0 0 20px">${escapeHtml(intro)}</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1e2126;border-radius:18px;padding:4px 18px;margin:0">${rows}</table>` +
    (footer ? `<p style="margin:20px 0 0;color:#8b9099;font-size:13px;line-height:1.6">${escapeHtml(footer)}</p>` : "") +
    (ctaHref ? emailButton(`Open ${brand.name}`, ctaHref, brand) : "");
  return emailShell(escapeHtml(heading), body, { brand, preheader: intro });
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

async function digestForTenant(env: Env, tenantId: string, _brand: string, weekAgoDate: string, weekAgoIso: string, period: string): Promise<void> {
  const db = env.DB;
  const sentAt = new Date().toISOString();
  // The digest goes out over email, so it honors the same owner email policy as
  // every other notification: if the owner disabled the `digest` category
  // studio-wide, no digests are emailed for this tenant (members still keep it
  // in their own prefs, but the studio-level email switch wins).
  const policyRow = await db.prepare("SELECT notif_policy_json FROM tenant_settings WHERE tenant_id = ?").bind(tenantId).first<{ notif_policy_json: string | null }>();
  if (!emailAllowedByPolicy(parseNotifPolicy(policyRow?.notif_policy_json ?? null), "digest")) return;
  const brand = await tenantBrandKit(db, tenantId);
  const appHref = env.BETTER_AUTH_URL?.replace(/\/$/, "") || null;

  // Attention rollup over the whole active roster — the SAME computation the
  // in-app "Needs attention" queue uses, so email and app never disagree. Owners
  // get the tenant-wide view; each trainer filters it to their assigned clients.
  const activeRows = (await db.prepare(`SELECT ${ATTENTION_COLUMNS} FROM clients WHERE tenant_id = ? AND status = 'active'`).bind(tenantId).all<AttentionClientRow>()).results ?? [];
  const tenantAttention = await rollupAttention(db, activeRows);

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
  const owners = await db.prepare("SELECT userId FROM member WHERE organizationId = ? AND role = 'owner'").bind(tenantId).all<{ userId: string | null }>();
  for (const o of owners.results ?? []) {
    if (!o.userId || !(await digestOn(db, o.userId, "owner"))) continue;
    if (!(await claimSend(db, o.userId, period, "owner", sentAt))) continue;
    const email = (await db.prepare('SELECT email FROM "user" WHERE id = ?').bind(o.userId).first<{ email: string | null }>())?.email;
    if (!email) continue;
    const html = digestHtml(brand, "Your studio this week", `Here's how ${brand.name} did over the last 7 days.`, [
      { label: "Active clients", value: active },
      { label: "Engaged this week", value: engaged },
      { label: "Need attention", value: tenantAttention.total },
      { label: "Check-ins received", value: num(checkIns) },
      { label: "New sales", value: num(newSales) },
      { label: "Subscription", value: sub?.status ?? "active" },
    ], appHref, tenantAttention.total > 0 ? `${tenantAttention.total} client${tenantAttention.total === 1 ? "" : "s"} need${tenantAttention.total === 1 ? "s" : ""} attention — open the queue to triage.` : "Nice week — the roster's on track.");
    await sendTenantEmail(env, tenantId, { to: email, subject: `${brand.name} — your week`, html, brandName: brand.name }).catch(() => undefined);
  }

  // ── Trainers: their assigned clients this week ─────────────────────────────
  const trainers = await db.prepare("SELECT DISTINCT trainer_user_id FROM client_trainers WHERE tenant_id = ?").bind(tenantId).all<{ trainer_user_id: string }>();
  for (const tr of trainers.results ?? []) {
    if (!tr.trainer_user_id || !(await digestOn(db, tr.trainer_user_id, "trainer"))) continue;
    if (!(await claimSend(db, tr.trainer_user_id, period, "trainer", sentAt))) continue;
    const email = (await db.prepare('SELECT email FROM "user" WHERE id = ?').bind(tr.trainer_user_id).first<{ email: string | null }>())?.email;
    if (!email) continue;
    // Filter the tenant-wide attention rollup to this trainer's assigned clients —
    // the exact same signals + thresholds the in-app queue shows them.
    const assignedIds = new Set(((await db.prepare("SELECT client_id FROM client_trainers WHERE tenant_id = ? AND trainer_user_id = ?").bind(tenantId, tr.trainer_user_id).all<{ client_id: string }>()).results ?? []).map((r) => r.client_id));
    const mine = tenantAttention.clients.filter((r) => assignedIds.has(r.clientId));
    const totals: Record<string, number> = {};
    for (const r of mine) for (const it of r.items) totals[it.type] = (totals[it.type] ?? 0) + 1;
    const stats: Stat[] = [
      { label: "Assigned clients", value: assignedIds.size },
      { label: "Need attention", value: mine.length },
      ...attentionStats(totals),
    ];
    const html = digestHtml(brand, "Your clients this week", "The clients assigned to you that need a look.", stats, appHref, mine.length > 0 ? `${mine.length} client${mine.length === 1 ? "" : "s"} need${mine.length === 1 ? "s" : ""} your attention.` : "Everyone's on track — nice work.");
    await sendTenantEmail(env, tenantId, { to: email, subject: `${brand.name} — your clients this week`, html, brandName: brand.name }).catch(() => undefined);
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
      const html = digestHtml(brand, "Your week", "Here's your last 7 days at a glance — keep it going.", stats, appHref);
      await sendTenantEmail(env, tenantId, { to: email, subject: `${brand.name} — your week`, html, brandName: brand.name }).catch(() => undefined);
    } catch { /* skip this client */ }
  }
}
