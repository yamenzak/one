/**
 * Health alerting (BLUEPRINT §23). The dead-man's-switch already flows through
 * the ScreenDO alarm; this turns those transitions into alert events: an offline
 * alert when a screen stops heartbeating, a recovery alert when it returns.
 * Delivery is dashboard-only by default, with optional webhook (email via
 * Email Workers/Resend is the same sender introduced here — wired later).
 */

import { ensureSchema, DEMO_TENANT } from "./db.js";
import { sendEmail, emailShell, escapeHtml } from "./mailer.js";
import { notifyCategoryAudience } from "./notify.js";
import type { Env } from "./env.js";

export interface AlertRule {
  id: string;
  type: string; // offline | wedged | cache_fail
  threshold_sec: number;
  channel: string; // dashboard | webhook
  target: string | null;
  enabled: number;
}
export interface AlertRow {
  id: string;
  screen_id: string;
  screen_name: string | null;
  type: string;
  message: string;
  at: number;
  resolved_at: number | null;
}

/** Seed a sensible default: dashboard-only offline alerts at 90s. */
export async function ensureDefaultRule(db: D1Database, tenantId = DEMO_TENANT): Promise<void> {
  await ensureSchema(db);
  const has = await db.prepare("SELECT id FROM alert_rules WHERE tenant_id = ? LIMIT 1").bind(tenantId).first();
  if (!has) {
    await db
      .prepare("INSERT INTO alert_rules (id, tenant_id, type, threshold_sec, channel, target, enabled) VALUES (?, ?, 'offline', 90, 'dashboard', NULL, 1)")
      .bind(`ar_${randomHex(6)}`, tenantId)
      .run();
  }
}

export async function listRules(db: D1Database, tenantId = DEMO_TENANT): Promise<AlertRule[]> {
  await ensureDefaultRule(db, tenantId);
  return (await db.prepare("SELECT id, type, threshold_sec, channel, target, enabled FROM alert_rules WHERE tenant_id = ?").bind(tenantId).all<AlertRule>()).results ?? [];
}

export async function addRule(db: D1Database, tenantId: string, r: { type: string; thresholdSec: number; channel: string; target?: string }): Promise<string> {
  await ensureSchema(db);
  const id = `ar_${randomHex(6)}`;
  await db.prepare("INSERT INTO alert_rules (id, tenant_id, type, threshold_sec, channel, target, enabled) VALUES (?, ?, ?, ?, ?, ?, 1)").bind(id, tenantId, r.type, r.thresholdSec, r.channel, r.target ?? null).run();
  return id;
}

export async function deleteRule(db: D1Database, id: string, tenantId: string): Promise<void> {
  // Scoped to the tenant so a rule id from another workspace can't be deleted.
  await db.prepare("DELETE FROM alert_rules WHERE id = ? AND tenant_id = ?").bind(id, tenantId).run();
}

export async function listAlerts(db: D1Database, tenantId = DEMO_TENANT, limit = 50): Promise<AlertRow[]> {
  await ensureSchema(db);
  // Join the screen name (ids now unify with `screens.id`, §22/§23) so the log
  // shows a human name, not a raw id.
  return (await db.prepare("SELECT a.id, a.screen_id, s.name AS screen_name, a.type, a.message, a.at, a.resolved_at FROM alerts a LEFT JOIN screens s ON s.id = a.screen_id WHERE a.tenant_id = ? ORDER BY a.at DESC LIMIT ?").bind(tenantId, limit).all<AlertRow>()).results ?? [];
}

/** Raise an alert and deliver it per the tenant's rules (§23). */
export async function raiseAlert(env: Env, a: { tenantId?: string; screenId: string; type: string; message: string }): Promise<void> {
  const db = env.DB;
  const tenantId = a.tenantId ?? DEMO_TENANT;
  await ensureSchema(db);
  await db.prepare("INSERT INTO alerts (id, tenant_id, screen_id, type, message, at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, NULL)").bind(`al_${randomHex(6)}`, tenantId, a.screenId, a.type, a.message, Date.now()).run();
  await deliver(env, tenantId, a);
}

/** Mark the latest open alert of a type for a screen resolved, and log recovery. */
export async function resolveAlert(env: Env, screenId: string, type: string, message: string, tenantId = DEMO_TENANT): Promise<void> {
  const db = env.DB;
  await ensureSchema(db);
  const open = await db.prepare("SELECT id FROM alerts WHERE tenant_id = ? AND screen_id = ? AND type = ? AND resolved_at IS NULL ORDER BY at DESC LIMIT 1").bind(tenantId, screenId, type).first<{ id: string }>();
  if (!open) return; // nothing was open — don't log a spurious recovery
  await db.prepare("UPDATE alerts SET resolved_at = ? WHERE id = ?").bind(Date.now(), open.id).run();
  await db.prepare("INSERT INTO alerts (id, tenant_id, screen_id, type, message, at, resolved_at) VALUES (?, ?, ?, 'recovery', ?, ?, ?)").bind(`al_${randomHex(6)}`, tenantId, screenId, message, Date.now(), Date.now()).run();
  await deliver(env, tenantId, { screenId, type: "recovery", message });
}

async function deliver(env: Env, tenantId: string, a: { screenId: string; type: string; message: string }): Promise<void> {
  /*
    THE INBOX IS UNCONDITIONAL; the rules are the OUTBOUND channels.

    An `alert_rules` row addresses a webhook URL or a bare email string — not a
    user — so before Stage 6 an operator who had not configured one learned that
    a screen went dark by walking past it. The people the workspace belongs to
    are now told regardless, through the channel resolution every other
    notification uses; a rule remains what reaches somebody who is not a Scena
    user at all (a monitoring system, an on-call address).

    Best-effort, like every other delivery here: an inbox write must never be
    the reason a screen's alert is lost.
  */
  const recovery = a.type === "recovery";
  const screen = await env.DB.prepare("SELECT name FROM screens WHERE id = ?").bind(a.screenId).first<{ name: string }>().catch(() => null);
  const named = screen?.name || a.screenId;
  await notifyCategoryAudience(env, tenantId, {
    type: recovery ? "screen_recovered" : "screen_offline",
    title: recovery ? `${named} is back online` : `${named} stopped responding`,
    message: a.message,
    // One row per screen per transition, so a flapping panel does not fill an
    // inbox with the same line.
    dedupeKey: `${a.screenId}:${a.type}:${Math.floor(Date.now() / 60_000)}`,
  }).catch(() => undefined);

  const rules = await listRules(env.DB, tenantId);
  for (const r of rules) {
    if (!r.enabled || !r.target) continue;
    if (r.channel === "webhook") {
      try {
        await fetch(r.target, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ screenId: a.screenId, type: a.type, message: a.message, at: Date.now() }) });
      } catch {
        /* webhook delivery is best-effort */
      }
    } else if (r.channel === "email") {
      const recovered = a.type === "recovery";
      await sendEmail(env, {
        to: r.target,
        subject: `${recovered ? "✅ Recovered" : "⚠️ Alert"}: ${a.screenId}`,
        // ESCAPED. Both fields reach here from a device record an operator
        // named, and this HTML lands in somebody's inbox.
        html: emailShell(
          recovered ? "Screen recovered" : "Screen alert",
          `<p>${escapeHtml(a.message)}</p><p style="color:#8a8494">Screen <code>${escapeHtml(a.screenId)}</code></p>`,
        ),
      }).catch(() => undefined);
    }
  }
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export { sendEmail, emailShell };
