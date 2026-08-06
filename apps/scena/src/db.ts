import { schemaGate, type SchemaModule } from "@4dl/core";
import { SCENA_SCHEMA, DEMO_TENANT } from "./schema.js";

export { DEMO_TENANT };

/**
 * D1 authoring store (BLUEPRINT §2, §4).
 *
 * D1 is the relational source of truth the dashboard queries — tenants,
 * screens, profiles, channels, and so on. This slice uses the `screens`
 * registry so the dashboard can list a tenant's fleet; runtime state stays in
 * the DOs. Schema is applied lazily with CREATE TABLE IF NOT EXISTS (once per
 * isolate) to keep local `wrangler dev` frictionless; real migrations arrive
 * with the monetization/schema phase.
 */


export interface ScreenRow {
  id: string;
  tenant_id: string;
  name: string;
  channel_id: string | null;
  status: string;
  paired_at: number;
  last_seen: number;
  width: number | null;
  height: number | null;
  orientation: string | null;
  tags: string | null;
}

/**
 * EVERY MODULE THIS APP APPLIES, in dependency order.
 *
 * One entry today, and that is the point: this list is the migration's progress
 * bar. Scena's module currently carries Better Auth's seven tables and the
 * billing/AI/media catalogs because it owns them at Stage 1 — each moves OUT to
 * its package as that stage lands (`AUTH_SCHEMA` in Stage 2, `BILLING_SCHEMA`
 * in Stage 4, and so on), and the diff that removes a table from `SCENA_SCHEMA`
 * is the same diff that adds its package here. `docs/SCENA-REWRITE.md` has the
 * order.
 *
 * `schemaGate` supplies the per-isolate memo and the retry-on-failure that this
 * file used to hand-roll, and short-circuits on a marker row — so once the
 * module is at version, a request costs one indexed SELECT rather than 44
 * `CREATE … IF NOT EXISTS`.
 */
export const SCHEMA_MODULES: readonly SchemaModule[] = [SCENA_SCHEMA];

const gate = schemaGate(SCHEMA_MODULES);
export const ensureSchema = (db: D1Database): Promise<void> => gate({ DB: db });

/** Register (or re-register) a screen at claim time. */
export async function registerScreen(
  db: D1Database,
  screen: { id: string; name: string; channelId: string | null; tenantId?: string },
): Promise<void> {
  await ensureSchema(db);
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO screens (id, tenant_id, name, channel_id, status, paired_at, last_seen)
       VALUES (?, ?, ?, ?, 'online', ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, channel_id = excluded.channel_id,
         status = 'online', last_seen = excluded.last_seen`,
    )
    .bind(screen.id, screen.tenantId ?? DEMO_TENANT, screen.name, screen.channelId, now, now)
    .run();
}

export async function listScreens(db: D1Database, tenantId = DEMO_TENANT): Promise<ScreenRow[]> {
  await ensureSchema(db);
  const res = await db
    .prepare("SELECT * FROM screens WHERE tenant_id = ? ORDER BY paired_at DESC")
    .bind(tenantId)
    .all<ScreenRow>();
  return res.results ?? [];
}

export async function getScreen(db: D1Database, id: string): Promise<ScreenRow | null> {
  await ensureSchema(db);
  return db.prepare("SELECT * FROM screens WHERE id = ?").bind(id).first<ScreenRow>();
}

/** Record a device's detected resolution (reported by the player on pair/boot). */
export async function setDeviceDimensions(db: D1Database, id: string, dims: { width: number; height: number; orientation?: string }): Promise<void> {
  await ensureSchema(db);
  const orientation = dims.orientation || (dims.width >= dims.height ? "landscape" : "portrait");
  await db.prepare("UPDATE screens SET width = ?, height = ?, orientation = ? WHERE id = ?").bind(Math.round(dims.width), Math.round(dims.height), orientation, id).run();
}

/** Update a device's active/default channel. */
export async function setDeviceChannel(db: D1Database, id: string, channelId: string | null): Promise<void> {
  await ensureSchema(db);
  await db.prepare("UPDATE screens SET channel_id = ? WHERE id = ?").bind(channelId, id).run();
}

/**
 * Coerce a slide duration to a positive integer of milliseconds, or null when
 * absent/invalid. Stored durations must satisfy the manifest schema
 * (`z.number().int().positive()`); an unvalidated negative/zero/float value would
 * be accepted into D1 but then fail at manifest-compile, wedging publish. Null
 * means "use the playlist/channel default".
 */
export function sanitizeDurationMs(v: number | null | undefined): number | null {
  return typeof v === "number" && isFinite(v) && v > 0 ? Math.round(v) : null;
}

/** Parse a stored JSON tags column into a clean string[]. */
export function parseTags(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((t) => typeof t === "string" && t.trim()).map((t: string) => t.trim()) : [];
  } catch {
    return [];
  }
}

/** Rename a device and/or set its tags. */
export async function renameScreen(db: D1Database, id: string, patch: { name?: string; tags?: string[] }): Promise<void> {
  await ensureSchema(db);
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.name !== undefined) { sets.push("name = ?"); vals.push(patch.name); }
  if (patch.tags !== undefined) { sets.push("tags = ?"); vals.push(JSON.stringify(patch.tags)); }
  if (!sets.length) return;
  vals.push(id);
  await db.prepare(`UPDATE screens SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
}

/** Mark a device as unpaired (returned to a pairing code) + drop its channel. */
export async function markScreenUnpaired(db: D1Database, id: string): Promise<void> {
  await ensureSchema(db);
  await db.prepare("UPDATE screens SET status = 'unpaired', channel_id = NULL WHERE id = ?").bind(id).run();
}

/** Permanently remove a device: its row + any channel assignments. */
export async function deleteScreen(db: D1Database, id: string): Promise<void> {
  await ensureSchema(db);
  await db.batch([
    db.prepare("DELETE FROM device_channels WHERE device_id = ?").bind(id),
    db.prepare("DELETE FROM screens WHERE id = ?").bind(id),
  ]);
}

/** The channels assigned to a device (multi-channel), in display order. */
export async function listDeviceChannels(db: D1Database, deviceId: string): Promise<string[]> {
  await ensureSchema(db);
  const r = await db.prepare("SELECT channel_id FROM device_channels WHERE device_id = ? ORDER BY ord").bind(deviceId).all<{ channel_id: string }>();
  return (r.results ?? []).map((x) => x.channel_id);
}

/** Replace a device's assigned channel set (ordered). */
export async function setDeviceChannels(db: D1Database, deviceId: string, channelIds: string[]): Promise<void> {
  await ensureSchema(db);
  await db.prepare("DELETE FROM device_channels WHERE device_id = ?").bind(deviceId).run();
  if (channelIds.length) {
    const stmt = db.prepare("INSERT INTO device_channels (device_id, channel_id, ord) VALUES (?, ?, ?)");
    await db.batch(channelIds.map((cid, i) => stmt.bind(deviceId, cid, i)));
  }
}

/** Count paired devices for a tenant — used by the pairing quota check (§25). */
export async function countScreens(db: D1Database, tenantId = DEMO_TENANT): Promise<number> {
  await ensureSchema(db);
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM screens WHERE tenant_id = ?")
    .bind(tenantId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
