/**
 * Proof-of-play storage + reporting (BLUEPRINT §22).
 *
 * Screens fire playout events (slide shown, ad played, …) with a stable
 * `eventId`; we persist them deduped by that id so replays of buffered offline
 * events on reconnect can't double-count — the integrity property advertisers
 * pay for (§29.5). Locally we store in D1 for queryable reports; in production
 * the same events also flow to Analytics Engine (high-cardinality telemetry),
 * dual-written best-effort by the ScreenDO.
 */

import { ensureSchema, DEMO_TENANT } from "./db.js";

export interface PlayoutEvent {
  eventId: string;
  contentId: string;
  kind: string;
  ts: number;
  durationMs?: number;
}

/** Persist a batch of events for a screen, ignoring duplicates (§29.5). */
export async function recordEvents(
  db: D1Database,
  ctx: { tenantId?: string; screenId: string; channelId: string | null },
  events: PlayoutEvent[],
): Promise<number> {
  if (events.length === 0) return 0;
  await ensureSchema(db);
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO playout_events
       (event_id, tenant_id, screen_id, channel_id, content_id, kind, ts, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const batch = events.map((e) =>
    stmt.bind(e.eventId, ctx.tenantId ?? DEMO_TENANT, ctx.screenId, ctx.channelId, e.contentId, e.kind, e.ts, e.durationMs ?? null),
  );
  await db.batch(batch);
  return events.length;
}

export interface AnalyticsSummary {
  totalPlays: number;
  activeScreens: number;
  byContent: { contentId: string; plays: number; totalMs: number }[];
  byScreen: { screenId: string; name: string | null; plays: number }[];
  byDay: { day: string; plays: number }[];
}

/** Aggregate proof-of-play reports for a tenant (§22). */
export async function summary(db: D1Database, tenantId = DEMO_TENANT): Promise<AnalyticsSummary> {
  await ensureSchema(db);

  const total = await db.prepare("SELECT COUNT(*) AS n FROM playout_events WHERE tenant_id = ?").bind(tenantId).first<{ n: number }>();
  const screens = await db.prepare("SELECT COUNT(DISTINCT screen_id) AS n FROM playout_events WHERE tenant_id = ?").bind(tenantId).first<{ n: number }>();

  const byContent = await db
    .prepare(
      `SELECT content_id AS contentId, COUNT(*) AS plays, COALESCE(SUM(duration_ms), 0) AS totalMs
         FROM playout_events WHERE tenant_id = ?
         GROUP BY content_id ORDER BY plays DESC LIMIT 20`,
    )
    .bind(tenantId)
    .all<{ contentId: string; plays: number; totalMs: number }>();

  const byScreen = await db
    .prepare(
      `SELECT e.screen_id AS screenId, s.name AS name, COUNT(*) AS plays
         FROM playout_events e LEFT JOIN screens s ON s.id = e.screen_id
         WHERE e.tenant_id = ? GROUP BY e.screen_id ORDER BY plays DESC LIMIT 20`,
    )
    .bind(tenantId)
    .all<{ screenId: string; name: string | null; plays: number }>();

  const byDay = await db
    .prepare(
      `SELECT strftime('%Y-%m-%d', ts / 1000, 'unixepoch') AS day, COUNT(*) AS plays
         FROM playout_events WHERE tenant_id = ?
         GROUP BY day ORDER BY day DESC LIMIT 14`,
    )
    .bind(tenantId)
    .all<{ day: string; plays: number }>();

  return {
    totalPlays: total?.n ?? 0,
    activeScreens: screens?.n ?? 0,
    byContent: byContent.results ?? [],
    byScreen: byScreen.results ?? [],
    byDay: (byDay.results ?? []).reverse(),
  };
}

/** Proof-of-play rows as CSV for export (§22). */
export async function exportCsv(db: D1Database, tenantId = DEMO_TENANT): Promise<string> {
  await ensureSchema(db);
  const rows = await db
    .prepare(
      `SELECT ts, screen_id, channel_id, content_id, kind, duration_ms
         FROM playout_events WHERE tenant_id = ? ORDER BY ts DESC LIMIT 10000`,
    )
    .bind(tenantId)
    .all<{ ts: number; screen_id: string; channel_id: string; content_id: string; kind: string; duration_ms: number | null }>();

  const header = "timestamp,screen_id,channel_id,content_id,kind,duration_ms";
  const lines = (rows.results ?? []).map(
    (r) => `${new Date(r.ts).toISOString()},${r.screen_id},${r.channel_id ?? ""},${r.content_id},${r.kind},${r.duration_ms ?? ""}`,
  );
  return [header, ...lines].join("\n");
}
