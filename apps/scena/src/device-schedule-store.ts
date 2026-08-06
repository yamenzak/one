/**
 * Per-device schedule store (§13). Each screen is scheduled independently across
 * three tracks:
 *   - channel: a daypart → which channel plays in a window (else the default).
 *   - mute:    a window ⇒ audio is muted.
 *   - saver:   a window ⇒ the screensaver is on (screen sleeps).
 *
 * A track is only *managed* by the schedule when it has ≥1 rule — otherwise the
 * operator's manual toggle (Screen commands) stays in control. The pure resolver
 * lives in schedule.ts; this is the DB glue + the per-device combine step the
 * ScreenDO calls on each boundary.
 */
import { ensureSchema } from "./db.js";
import { resolveDaypart, resolveWindows, soonestBoundary, type DaypartRule } from "./schedule.js";

export type RuleKind = "channel" | "mute" | "saver";

interface DeviceRuleRow {
  id: string;
  screen_id: string;
  kind: string;
  priority: number;
  days_csv: string;
  start_min: number;
  end_min: number;
  channel_id: string | null;
  created_at: number;
}

export interface DeviceRule {
  id: string;
  kind: RuleKind;
  priority: number;
  days: number[];
  startMin: number;
  endMin: number;
  channelId: string | null;
}

function toRule(r: DeviceRuleRow): DeviceRule {
  return {
    id: r.id,
    kind: (r.kind === "mute" || r.kind === "saver" ? r.kind : "channel"),
    priority: r.priority,
    days: r.days_csv.split(",").filter(Boolean).map(Number),
    startMin: r.start_min,
    endMin: r.end_min,
    channelId: r.channel_id,
  };
}

/** A DeviceRule shaped for the pure resolvers (channelId is "" for on/off tracks). */
function toDaypart(r: DeviceRule): DaypartRule {
  return { id: r.id, priority: r.priority, days: r.days, startMin: r.startMin, endMin: r.endMin, channelId: r.channelId ?? "" };
}

/* --------------------------------- tz ------------------------------------ */

export async function getDeviceTz(db: D1Database, screenId: string): Promise<string> {
  await ensureSchema(db);
  const r = await db.prepare("SELECT tz FROM screens WHERE id = ?").bind(screenId).first<{ tz: string | null }>();
  return r?.tz || "UTC";
}

export async function setDeviceTz(db: D1Database, screenId: string, tz: string): Promise<void> {
  await ensureSchema(db);
  await db.prepare("UPDATE screens SET tz = ? WHERE id = ?").bind(tz, screenId).run();
}

/* -------------------------------- rules ---------------------------------- */

export async function listDeviceRules(db: D1Database, screenId: string): Promise<DeviceRule[]> {
  await ensureSchema(db);
  const res = await db
    .prepare("SELECT * FROM device_schedule_rules WHERE screen_id = ? ORDER BY kind, priority DESC, created_at")
    .bind(screenId)
    .all<DeviceRuleRow>();
  return (res.results ?? []).map(toRule);
}

export async function getDeviceSchedule(db: D1Database, screenId: string): Promise<{ tz: string; rules: DeviceRule[] }> {
  const [tz, rules] = await Promise.all([getDeviceTz(db, screenId), listDeviceRules(db, screenId)]);
  return { tz, rules };
}

export async function addDeviceRule(
  db: D1Database,
  screenId: string,
  rule: { kind: RuleKind; priority?: number; days: number[]; startMin: number; endMin: number; channelId?: string | null },
): Promise<string> {
  await ensureSchema(db);
  const id = `dsr_${randomHex(6)}`;
  await db
    .prepare("INSERT INTO device_schedule_rules (id, screen_id, kind, priority, days_csv, start_min, end_min, channel_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, screenId, rule.kind, rule.priority ?? 1, rule.days.join(","), rule.startMin, rule.endMin, rule.kind === "channel" ? rule.channelId ?? null : null, Date.now())
    .run();
  return id;
}

export async function deleteDeviceRule(db: D1Database, screenId: string, ruleId: string): Promise<void> {
  await ensureSchema(db);
  // Scoped to the screen so a rule id belonging to another tenant's device
  // (device_schedule_rules has no tenant_id column) can't be deleted.
  await db.prepare("DELETE FROM device_schedule_rules WHERE id = ? AND screen_id = ?").bind(ruleId, screenId).run();
}

/** Drop every rule for a screen (called when a device is deleted/unpaired). */
export async function deleteDeviceRules(db: D1Database, screenId: string): Promise<void> {
  await ensureSchema(db);
  await db.prepare("DELETE FROM device_schedule_rules WHERE screen_id = ?").bind(screenId).run();
}

/** Total schedule rules across a tenant's devices (usage for the quota check). */
export async function countTenantScheduleRules(db: D1Database, tenantId: string): Promise<number> {
  await ensureSchema(db);
  const r = await db
    .prepare("SELECT COUNT(*) AS n FROM device_schedule_rules WHERE screen_id IN (SELECT id FROM screens WHERE tenant_id = ?)")
    .bind(tenantId)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

/* ------------------------------- resolve --------------------------------- */

export interface DeviceScheduleResolution {
  /** Channel to show now (null → no channel rule active; use the device default). */
  channelId: string | null;
  /** Desired mute state, or null when no mute rules exist (leave it to manual). */
  muted: boolean | null;
  /** Desired screensaver state, or null when no saver rules exist. */
  saverActive: boolean | null;
  /** Wall-clock ms of the next edge across all tracks, or null. */
  nextBoundaryMs: number | null;
}

/** Resolve all three tracks for a device at `nowMs`. */
export async function resolveDeviceSchedule(db: D1Database, screenId: string, nowMs: number): Promise<DeviceScheduleResolution> {
  const { tz, rules } = await getDeviceSchedule(db, screenId);
  const channelRules = rules.filter((r) => r.kind === "channel").map(toDaypart);
  const muteRules = rules.filter((r) => r.kind === "mute").map(toDaypart);
  const saverRules = rules.filter((r) => r.kind === "saver").map(toDaypart);

  const ch = resolveDaypart(channelRules, tz, nowMs);
  const mute = muteRules.length ? resolveWindows(muteRules, tz, nowMs) : null;
  const saver = saverRules.length ? resolveWindows(saverRules, tz, nowMs) : null;

  return {
    channelId: ch.channelId,
    muted: mute ? mute.active : null,
    saverActive: saver ? saver.active : null,
    nextBoundaryMs: soonestBoundary(ch.nextBoundaryMs, mute?.nextBoundaryMs ?? null, saver?.nextBoundaryMs ?? null),
  };
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}
