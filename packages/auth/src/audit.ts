/**
 * The auth trail — and the rate limiter's backing store.
 *
 * One table, because the limiter's question ("how many codes went to this
 * address in the last hour", "how many did this IP ask for") is a query over the
 * trail. Keeping them separate would mean writing the same row twice and letting
 * the two drift.
 *
 * Every write is best-effort: an audit failure must never be the thing that stops
 * someone signing in.
 */

import type { HasDb } from "@4dl/core";
import { newId, nowMs } from "@4dl/core";

export async function logAuthEvent(
  db: D1Database,
  event: string,
  email: string,
  success: boolean,
  ip?: string,
): Promise<void> {
  await db
    .prepare("INSERT INTO auth_logs (id, event, email, ip, success, at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(newId("alog"), event, email.toLowerCase(), ip ?? null, success ? 1 : 0, nowMs())
    .run()
    .catch(() => undefined);
}

/** How many of `event` this address triggered inside `windowMs`. */
export async function recentAuthEvents(
  db: D1Database,
  event: string,
  email: string,
  windowMs: number,
): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM auth_logs WHERE event = ? AND email = ? AND at > ?")
    .bind(event, email.toLowerCase(), nowMs() - windowMs)
    .first<{ n: number }>()
    .catch(() => null);
  return row?.n ?? 0;
}

/** When this address last triggered `event`, in ms since epoch, or null. */
export async function lastAuthEventAt(db: D1Database, event: string, email: string): Promise<number | null> {
  const row = await db
    .prepare("SELECT MAX(at) AS at FROM auth_logs WHERE event = ? AND email = ?")
    .bind(event, email.toLowerCase())
    .first<{ at: number | null }>()
    .catch(() => null);
  return row?.at ?? null;
}

/** How many of `event` this SOURCE triggered inside `windowMs`. */
export async function recentAuthEventsByIp(
  db: D1Database,
  event: string,
  ip: string,
  windowMs: number,
): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM auth_logs WHERE event = ? AND ip = ? AND at > ?")
    .bind(event, ip, nowMs() - windowMs)
    .first<{ n: number }>()
    .catch(() => null);
  return row?.n ?? 0;
}

/** Bound the trail's growth. Called from the app's daily sweep. */
export async function pruneAuthLogs(env: HasDb, olderThanMs: number): Promise<void> {
  await env.DB.prepare("DELETE FROM auth_logs WHERE at < ?").bind(nowMs() - olderThanMs).run().catch(() => undefined);
}
