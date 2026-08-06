/**
 * Health alerting (BLUEPRINT §23). The dead-man's-switch already flows through
 * the ScreenDO alarm; this turns those transitions into alert events: an offline
 * alert when a screen stops heartbeating, a recovery alert when it returns.
 * Delivery is dashboard-only by default, with optional webhook (email via
 * Email Workers/Resend is the same sender introduced here — wired later).
 */

import { ensureSchema, DEMO_TENANT } from "./db.js";
import { sendEmail, emailShell } from "./mailer.js";
import type { SendEmailBinding } from "./env.js";

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
export async function raiseAlert(db: D1Database, a: { tenantId?: string; screenId: string; type: string; message: string }, email?: SendEmailBinding): Promise<void> {
  const tenantId = a.tenantId ?? DEMO_TENANT;
  await ensureSchema(db);
  await db.prepare("INSERT INTO alerts (id, tenant_id, screen_id, type, message, at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, NULL)").bind(`al_${randomHex(6)}`, tenantId, a.screenId, a.type, a.message, Date.now()).run();
  await deliver(db, tenantId, a, email);
}

/** Mark the latest open alert of a type for a screen resolved, and log recovery. */
export async function resolveAlert(db: D1Database, screenId: string, type: string, message: string, tenantId = DEMO_TENANT, email?: SendEmailBinding): Promise<void> {
  await ensureSchema(db);
  const open = await db.prepare("SELECT id FROM alerts WHERE tenant_id = ? AND screen_id = ? AND type = ? AND resolved_at IS NULL ORDER BY at DESC LIMIT 1").bind(tenantId, screenId, type).first<{ id: string }>();
  if (!open) return; // nothing was open — don't log a spurious recovery
  await db.prepare("UPDATE alerts SET resolved_at = ? WHERE id = ?").bind(Date.now(), open.id).run();
  await db.prepare("INSERT INTO alerts (id, tenant_id, screen_id, type, message, at, resolved_at) VALUES (?, ?, ?, 'recovery', ?, ?, ?)").bind(`al_${randomHex(6)}`, tenantId, screenId, message, Date.now(), Date.now()).run();
  await deliver(db, tenantId, { screenId, type: "recovery", message }, email);
}

async function deliver(db: D1Database, tenantId: string, a: { screenId: string; type: string; message: string }, email?: SendEmailBinding): Promise<void> {
  const rules = await listRules(db, tenantId);
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
      await sendEmail(db, {
        to: r.target,
        subject: `${recovered ? "✅ Recovered" : "⚠️ Alert"}: ${a.screenId}`,
        html: emailShell(recovered ? "Screen recovered" : "Screen alert", `<p>${a.message}</p><p style="color:#8a8494">Screen <code>${a.screenId}</code> · ${new Date().toLocaleString()}</p>`),
      }, email).catch(() => undefined);
    }
  }
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export { sendEmail, emailShell };
