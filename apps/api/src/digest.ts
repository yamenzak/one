/**
 * Weekly digest (Mondays 08:00 UTC). Per role, a plain-numbers recap of the last
 * 7 days, emailed through the tenant's provider — but only to users who've kept
 * the `digest` email channel on. Best-effort per user/tenant so one failure
 * doesn't sink the sweep.
 */

import { resolveChannels, parseNotifPrefs, parseNotifPolicy, emailAllowedByPolicy, ATTENTION_TYPES, currentStreak, wellnessIndex, averageRating, seriesDelta, type NotifRole, type AttentionType } from "@kova/domain";
import type { Env } from "./env.js";
import { sendTenantEmail } from "./email-provider.js";
import { emailShell, emailButton, escapeHtml, emailStatRow, emailBar, emailBars, emailSparkline, emailRing, emailPanel, emailDivider, emailListRow, type EmailStat, type EmailTone, type BrandKit } from "./mailer.js";
import { tenantBrandKit } from "./notify.js";
import { rollupAttention, type AttentionClientRow } from "./attention-routes.js";
import { rosterAnalytics, type RosterAnalytics } from "./report-routes.js";

/** Add `n` days to a YYYY-MM-DD date string (UTC-safe, no Date.now dependency). */
function shiftDate(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function weekdayLabel(dateStr: string): string {
  return WEEKDAY[new Date(`${dateStr}T00:00:00Z`).getUTCDay()] ?? "";
}
/** The last `n` calendar dates ending at `endDate`, oldest first, with weekday labels. */
function lastNDates(endDate: string, n: number): { date: string; label: string }[] {
  return Array.from({ length: n }, (_, i) => {
    const date = shiftDate(endDate, -(n - 1 - i));
    return { date, label: weekdayLabel(date) };
  });
}

const ATTENTION_COLUMNS = "id, display_name, email, avatar_url, gender, date_of_birth, height_cm, preferences_json";
/** The attention breakdown as label+count rows (registry-ordered, non-zero). */
function attentionList(totals: Record<string, number>): { label: string; count: number }[] {
  return (Object.keys(ATTENTION_TYPES) as AttentionType[])
    .filter((t) => (totals[t] ?? 0) > 0)
    .map((t) => ({ label: ATTENTION_TYPES[t].label, count: totals[t]! }));
}

/** Everything a client's rich weekly recap needs — gathered per client, then
 *  rendered into charts. All fields degrade gracefully (nulls hide a block). */
interface ClientDigestData {
  name: string;
  intro: string;
  stats: EmailStat[];
  dayBars: { label: string; value: number; tone?: EmailTone }[];
  weightSeries: number[];
  weightCaption: string | null;
  wellness: number | null; // 1..5 index, or null
  adherence: { label: string; pct: number; value: string; tone?: EmailTone }[];
  labs: number;
}

/** A premium, chart-led client digest: a ring for the week's wellness, a stat
 *  ledger, a day-by-day consistency histogram, a weight sparkline with delta,
 *  and adherence bars — all email-safe, all skinned to the studio. */
export function clientDigestHtml(brand: BrandKit, d: ClientDigestData, ctaHref: string | null): string {
  const parts: string[] = [`<p style="margin:0 0 4px">${escapeHtml(d.intro)}</p>`];

  // Wellness ring (centred) — only when the week has complete check-ins.
  if (d.wellness != null) {
    const pct = d.wellness / 5;
    const tone: EmailTone = d.wellness >= 3.75 ? "good" : d.wellness >= 2.75 ? "warn" : "bad";
    parts.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 2px"><tr><td align="center">` +
        emailRing(pct, d.wellness.toFixed(1), { brand, tone, sub: "of 5" }) +
        `<div style="font-family:'Inter',sans-serif;font-size:12px;color:#8a9099;margin:8px 0 0">Wellness this week</div>` +
        `</td></tr></table>`,
    );
  }

  if (d.stats.length) parts.push(emailStatRow(d.stats));

  // Day-by-day consistency histogram (pillars logged per day, tone by intensity).
  if (d.dayBars.some((b) => b.value > 0)) {
    parts.push(emailPanel(emailBars(d.dayBars, { brand }), { title: "Your week, day by day" }));
  }

  // Weight trend sparkline + delta caption.
  if (d.weightSeries.length >= 2) {
    parts.push(
      emailPanel(
        emailSparkline(d.weightSeries, { brand }) +
          (d.weightCaption ? `<div style="font-family:'Inter',sans-serif;font-size:13px;color:#b6bbc2;margin:12px 0 0">${escapeHtml(d.weightCaption)}</div>` : ""),
        { title: "Weight trend" },
      ),
    );
  }

  // Adherence bars.
  if (d.adherence.length) {
    parts.push(emailPanel(d.adherence.map((a) => emailBar(a.label, a.value, a.pct, { brand, tone: a.tone })).join(""), { title: "How consistent you were" }));
  }

  if (d.labs > 0) {
    parts.push(`<p style="margin:20px 0 0;color:#8a9099;font-size:13px;line-height:1.6">You have ${d.labs} lab test${d.labs === 1 ? "" : "s"} to complete — open ${escapeHtml(brand.name)} to get them done.</p>`);
  }

  if (ctaHref) parts.push(emailButton(`Open ${brand.name}`, ctaHref, brand));
  return emailShell(escapeHtml("Your week"), parts.join(""), { brand, preheader: d.intro, eyebrow: "Weekly recap" });
}

/** Everything a coach's (owner or trainer) rich weekly digest renders. */
interface CoachDigestData {
  heading: string;
  intro: string;
  stats: EmailStat[];
  activeTrend: number[];
  avgActive: number;
  engagement: { checkInRate: number; workoutRate: number };
  topClients: { name: string; logs: number }[];
  attention: { label: string; count: number }[];
  attentionTotal: number;
  mostImproved: { name: string; delta: number } | null;
  ctaHref: string | null;
  ctaLabel: string;
  footer: string;
}

/** A premium coach digest: a stat ledger, a 14-day active-clients sparkline,
 *  engagement bars, a most-improved callout, the most-active clients, and an
 *  attention breakdown — every block reused from the same rollups the in-app
 *  analytics + attention queue show, so email and app never disagree. */
export function coachDigestHtml(brand: BrandKit, d: CoachDigestData): string {
  const parts: string[] = [`<p style="margin:0 0 4px">${escapeHtml(d.intro)}</p>`];
  if (d.stats.length) parts.push(emailStatRow(d.stats));

  if (d.activeTrend.filter((v) => v > 0).length >= 2) {
    parts.push(
      emailPanel(
        emailSparkline(d.activeTrend, { brand }) +
          `<div style="font-family:'Inter',sans-serif;font-size:13px;color:#b6bbc2;margin:12px 0 0">Averaging ${d.avgActive} active client${d.avgActive === 1 ? "" : "s"} a day over the last two weeks.</div>`,
        { title: "Active clients, last 14 days" },
      ),
    );
  }

  parts.push(
    emailPanel(
      emailBar("Checked in this week", `${d.engagement.checkInRate}%`, d.engagement.checkInRate / 100, { tone: d.engagement.checkInRate >= 50 ? "good" : d.engagement.checkInRate >= 25 ? "warn" : "bad" }) +
        emailBar("Trained this week", `${d.engagement.workoutRate}%`, d.engagement.workoutRate / 100, { tone: d.engagement.workoutRate >= 50 ? "good" : d.engagement.workoutRate >= 25 ? "warn" : "bad" }),
      { title: "Engagement" },
    ),
  );

  if (d.mostImproved) {
    parts.push(emailPanel(emailListRow(`Most improved · ${d.mostImproved.name}`, `${d.mostImproved.delta} pt body-fat`, { tone: "good" }), { title: "Standout" }));
  }

  if (d.topClients.length) {
    parts.push(emailPanel(d.topClients.map((t) => emailListRow(t.name, `${t.logs} log${t.logs === 1 ? "" : "s"}`, { brand })).join(""), { title: "Most active" }));
  }

  if (d.attention.length) {
    parts.push(
      emailPanel(
        d.attention.map((a) => emailListRow(a.label, String(a.count), { tone: "warn" })).join(""),
        { title: `Needs attention · ${d.attentionTotal}` },
      ),
    );
  }

  parts.push(emailDivider());
  parts.push(`<p style="margin:0;color:#8a9099;font-size:13px;line-height:1.6">${escapeHtml(d.footer)}</p>`);
  if (d.ctaHref) parts.push(emailButton(d.ctaLabel, d.ctaHref, brand));
  return emailShell(escapeHtml(d.heading), parts.join(""), { brand, preheader: d.intro, eyebrow: "Weekly digest" });
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
  // every other notification: if the owner disabled the `digest` category for an
  // audience, no digests are emailed to that audience (members still keep it in
  // their own prefs, but the studio-level email switch wins).
  //
  // Resolved PER AUDIENCE, like `notify()` does. It used to be one audience-less
  // check that returned early for the whole tenant, and that made the switch
  // INERT: the owner UI writes only `emailAudience`, so an audience-less lookup
  // fell through to the legacy `emailCategories` map — which nothing writes any
  // more — and read the `?? true` default. Every studio that turned the weekly
  // digest off kept receiving it. It also could not express the setting the UI
  // offers, which is digest-off-for-clients-but-on-for-staff.
  const policyRow = await db.prepare("SELECT notif_policy_json FROM tenant_settings WHERE tenant_id = ?").bind(tenantId).first<{ notif_policy_json: string | null }>();
  const policy = parseNotifPolicy(policyRow?.notif_policy_json ?? null);
  const digestTo = { staff: emailAllowedByPolicy(policy, "digest", "staff"), client: emailAllowedByPolicy(policy, "digest", "client") };
  if (!digestTo.staff && !digestTo.client) return;
  const brand = await tenantBrandKit(db, tenantId);
  // Every CTA carries the tenant hint (?t=) so a multi-studio recipient lands in
  // THIS studio; the coach CTA deep-links to /today, where the attention queue
  // lives. The app reads + strips ?t= at boot before routing.
  const base = env.BETTER_AUTH_URL?.replace(/\/$/, "") || null;
  const hint = (path: string): string | null => (base ? `${base}${path}${path.includes("?") ? "&" : "?"}t=${encodeURIComponent(tenantId)}` : null);
  const appHref = hint("/today");

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
  if (digestTo.staff && (owners.results ?? []).some((o) => o.userId)) {
    // Tenant-wide engagement analytics — the SAME rollup /reports/roster-analytics
    // serves the in-app screen, so the digest's charts never drift from the app.
    const ownerAnalytics = await rosterAnalytics(db, activeRows.map((r) => r.id), period, 14);
    for (const o of owners.results ?? []) {
      if (!o.userId || !(await digestOn(db, o.userId, "owner"))) continue;
      if (!(await claimSend(db, o.userId, period, "owner", sentAt))) continue;
      const email = (await db.prepare('SELECT email FROM "user" WHERE id = ?').bind(o.userId).first<{ email: string | null }>())?.email;
      if (!email) continue;
      const stats: EmailStat[] = [
        { value: String(active), label: "Active clients" },
        { value: String(engaged), label: "Engaged this week" },
        { value: String(tenantAttention.total), label: "Need attention", deltaTone: tenantAttention.total > 0 ? "warn" : "good" },
        { value: String(num(newSales)), label: num(newSales) === 1 ? "New sale" : "New sales", deltaTone: num(newSales) > 0 ? "good" : undefined },
      ];
      const html = coachDigestHtml(brand, {
        heading: "Your studio this week",
        intro: `Here's how ${brand.name} did over the last 7 days.`,
        stats,
        activeTrend: ownerAnalytics.daily.map((d) => d.active),
        avgActive: ownerAnalytics.engagement.avgActivePerDay,
        engagement: ownerAnalytics.engagement,
        topClients: ownerAnalytics.topClients.slice(0, 5).map((t) => ({ name: t.name, logs: t.logs })),
        attention: attentionList(tenantAttention.totals),
        attentionTotal: tenantAttention.total,
        mostImproved: ownerAnalytics.composition.mostImproved ? { name: ownerAnalytics.composition.mostImproved.name, delta: ownerAnalytics.composition.mostImproved.delta } : null,
        ctaHref: appHref,
        ctaLabel: tenantAttention.total > 0 ? "Open the attention queue" : `Open ${brand.name}`,
        footer: tenantAttention.total > 0
          ? `${tenantAttention.total} client${tenantAttention.total === 1 ? "" : "s"} need${tenantAttention.total === 1 ? "s" : ""} attention — open the queue to triage.`
          : "Nice week — the roster's on track.",
      });
      await sendTenantEmail(env, tenantId, { to: email, subject: `${brand.name} — your week`, html, brandName: brand.name }).catch(() => undefined);
    }
  }

  // ── Trainers: their assigned clients this week ─────────────────────────────
  const trainers = await db.prepare("SELECT DISTINCT trainer_user_id FROM client_trainers WHERE tenant_id = ?").bind(tenantId).all<{ trainer_user_id: string }>();
  for (const tr of trainers.results ?? []) {
    if (!digestTo.staff) break;
    if (!tr.trainer_user_id || !(await digestOn(db, tr.trainer_user_id, "trainer"))) continue;
    if (!(await claimSend(db, tr.trainer_user_id, period, "trainer", sentAt))) continue;
    const email = (await db.prepare('SELECT email FROM "user" WHERE id = ?').bind(tr.trainer_user_id).first<{ email: string | null }>())?.email;
    if (!email) continue;
    // Filter the tenant-wide attention rollup to this trainer's assigned clients —
    // the exact same signals + thresholds the in-app queue shows them.
    const assignedList = ((await db.prepare("SELECT client_id FROM client_trainers WHERE tenant_id = ? AND trainer_user_id = ?").bind(tenantId, tr.trainer_user_id).all<{ client_id: string }>()).results ?? []).map((r) => r.client_id);
    const assignedIds = new Set(assignedList);
    const mine = tenantAttention.clients.filter((r) => assignedIds.has(r.clientId));
    const totals: Record<string, number> = {};
    for (const r of mine) for (const it of r.items) totals[it.type] = (totals[it.type] ?? 0) + 1;
    const trAnalytics = await rosterAnalytics(db, assignedList, period, 14);
    const stats: EmailStat[] = [
      { value: String(assignedIds.size), label: assignedIds.size === 1 ? "Assigned client" : "Assigned clients" },
      { value: String(trAnalytics.roster.active7), label: "Active this week" },
      { value: String(mine.length), label: "Need attention", deltaTone: mine.length > 0 ? "warn" : "good" },
    ];
    const html = coachDigestHtml(brand, {
      heading: "Your clients this week",
      intro: "How the clients assigned to you did over the last 7 days.",
      stats,
      activeTrend: trAnalytics.daily.map((d) => d.active),
      avgActive: trAnalytics.engagement.avgActivePerDay,
      engagement: trAnalytics.engagement,
      topClients: trAnalytics.topClients.slice(0, 5).map((t) => ({ name: t.name, logs: t.logs })),
      attention: attentionList(totals),
      attentionTotal: mine.length,
      mostImproved: trAnalytics.composition.mostImproved ? { name: trAnalytics.composition.mostImproved.name, delta: trAnalytics.composition.mostImproved.delta } : null,
      ctaHref: appHref,
      ctaLabel: mine.length > 0 ? "Open the attention queue" : `Open ${brand.name}`,
      footer: mine.length > 0 ? `${mine.length} client${mine.length === 1 ? "" : "s"} need${mine.length === 1 ? "s" : ""} your attention.` : "Everyone's on track — nice work.",
    });
    await sendTenantEmail(env, tenantId, { to: email, subject: `${brand.name} — your clients this week`, html, brandName: brand.name }).catch(() => undefined);
  }

  // ── Clients: their own week — a rich, chart-led recap ──────────────────────
  const clients = await db.prepare("SELECT id, user_id, display_name FROM clients WHERE tenant_id = ? AND status = 'active' AND user_id IS NOT NULL").bind(tenantId).all<{ id: string; user_id: string; display_name: string }>();
  const monthAgo = shiftDate(period, -30);
  const eightWeeksAgo = shiftDate(period, -56);
  const week = lastNDates(period, 7);
  for (const cl of clients.results ?? []) {
    if (!digestTo.client) break;
    try {
      if (!(await digestOn(db, cl.user_id, "client"))) continue;
      if (!(await claimSend(db, cl.user_id, period, "client", sentAt))) continue;
      const email = (await db.prepare('SELECT email FROM "user" WHERE id = ?').bind(cl.user_id).first<{ email: string | null }>())?.email;
      if (!email) continue;

      // A few cheap gathers (weekly sweep) — dates for consistency + streak, the
      // week's wellness ratings, a weight series for the trend, and PR count.
      const [woRows, foodRows, ciRows, measRows, prRow, labsRow] = await Promise.all([
        db.prepare("SELECT DISTINCT date_local AS d FROM exercise_logs WHERE client_id = ? AND date_local >= ?").bind(cl.id, monthAgo).all<{ d: string }>(),
        db.prepare("SELECT DISTINCT date_local AS d FROM food_entries WHERE client_id = ? AND date_local >= ?").bind(cl.id, monthAgo).all<{ d: string }>(),
        db.prepare("SELECT date_local AS d, mood, energy, stress, sleep_quality FROM check_ins WHERE client_id = ? AND date_local >= ?").bind(cl.id, monthAgo).all<{ d: string; mood: number | null; energy: number | null; stress: number | null; sleep_quality: number | null }>(),
        db.prepare("SELECT date_local AS d, weight_kg FROM measurements WHERE client_id = ? AND weight_kg IS NOT NULL AND date_local >= ? ORDER BY date_local").bind(cl.id, eightWeeksAgo).all<{ d: string; weight_kg: number }>(),
        db.prepare("SELECT COUNT(*) AS n FROM exercise_prs WHERE client_id = ? AND achieved_on >= ?").bind(cl.id, weekAgoDate).first(),
        db.prepare("SELECT COUNT(*) AS n FROM lab_tests WHERE client_id = ? AND status = 'requested'").bind(cl.id).first(),
      ]);
      const woDays = new Set((woRows.results ?? []).map((r) => r.d));
      const foodDaysSet = new Set((foodRows.results ?? []).map((r) => r.d));
      const ciDays = new Set((ciRows.results ?? []).map((r) => r.d));
      const measDays = new Set((measRows.results ?? []).map((r) => r.d));
      const weekSet = new Set(week.map((w) => w.date));
      const inWeek = (s: Set<string>) => [...s].filter((d) => weekSet.has(d)).length;
      const woWeek = inWeek(woDays);
      const foodWeek = inWeek(foodDaysSet);
      const ciWeek = inWeek(ciDays);

      // Per-day consistency: how many of the four pillars were logged each day.
      const dayBars = week.map((w) => {
        const v = (woDays.has(w.date) ? 1 : 0) + (foodDaysSet.has(w.date) ? 1 : 0) + (ciDays.has(w.date) ? 1 : 0) + (measDays.has(w.date) ? 1 : 0);
        const tone: EmailTone | undefined = v >= 3 ? "good" : v === 0 ? undefined : "warn";
        return { label: w.label, value: v, tone };
      });

      // Streak over any activity (workout ∪ food ∪ check-in ∪ measurement).
      const allDays = new Set<string>([...woDays, ...foodDaysSet, ...ciDays, ...measDays]);
      const streak = currentStreak(allDays, period);

      // Week's wellness = index over the 7-day averages (needs all four ratings).
      const ciWeekRows = (ciRows.results ?? []).filter((r) => weekSet.has(r.d));
      const wellness = wellnessIndex({
        mood: averageRating(ciWeekRows.map((r) => r.mood)),
        energy: averageRating(ciWeekRows.map((r) => r.energy)),
        sleepQuality: averageRating(ciWeekRows.map((r) => r.sleep_quality)),
        stress: averageRating(ciWeekRows.map((r) => r.stress)),
      });

      // Weight trend + delta caption.
      const weightSeries = (measRows.results ?? []).map((r) => r.weight_kg);
      const wDelta = seriesDelta(weightSeries);
      const weightCaption = wDelta
        ? `${wDelta.delta === 0 ? "Holding steady at" : wDelta.delta < 0 ? "Down" : "Up"} ${wDelta.delta === 0 ? `${wDelta.last} kg` : `${Math.abs(wDelta.delta)} kg`} over ${weightSeries.length} readings — now ${wDelta.last} kg.`
        : null;

      const prCount = num(prRow);
      const stats: EmailStat[] = [
        { value: `${woWeek}`, label: woWeek === 1 ? "Workout day" : "Workout days" },
        { value: `${streak}`, label: streak === 1 ? "Day streak" : "Day streak", deltaTone: streak >= 3 ? "good" : undefined, delta: streak >= 3 ? "🔥 on a roll" : undefined },
        { value: `${prCount}`, label: prCount === 1 ? "New PR" : "New PRs", deltaTone: prCount > 0 ? "good" : undefined },
      ];
      if (wDelta) stats.push({ value: `${wDelta.delta > 0 ? "+" : ""}${wDelta.delta}kg`, label: "Weight change", deltaTone: wDelta.delta <= 0 ? "good" : "warn" });

      const adherence = [
        { label: "Training days", value: `${woWeek}/7`, pct: woWeek / 7, tone: (woWeek >= 3 ? "good" : woWeek >= 1 ? "warn" : "bad") as EmailTone },
        { label: "Days you logged food", value: `${foodWeek}/7`, pct: foodWeek / 7, tone: (foodWeek >= 5 ? "good" : foodWeek >= 2 ? "warn" : "bad") as EmailTone },
        { label: "Check-ins", value: `${ciWeek}/7`, pct: ciWeek / 7, tone: (ciWeek >= 3 ? "good" : ciWeek >= 1 ? "warn" : "bad") as EmailTone },
      ];

      const first = (cl.display_name || "").split(/\s+/)[0] || "there";
      const intro = streak >= 3
        ? `${streak} days in a row, ${first} — here's your week at ${brand.name}.`
        : woWeek > 0
          ? `Nice work this week, ${first} — here's your recap.`
          : `Here's your week, ${first}. A small step this week goes a long way.`;

      const html = clientDigestHtml(brand, { name: cl.display_name, intro, stats, dayBars, weightSeries, weightCaption, wellness, adherence, labs: num(labsRow) }, appHref);
      await sendTenantEmail(env, tenantId, { to: email, subject: `${brand.name} — your week`, html, brandName: brand.name }).catch(() => undefined);
    } catch { /* skip this client */ }
  }
}
