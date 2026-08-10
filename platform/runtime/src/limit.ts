/**
 * HOW OFTEN SOMEBODY MAY ASK — declared per operation, counted per window.
 *
 * ⚠️ `OperationSpec.rateLimit` HAS EXISTED SINCE STAGE 0 AND NOTHING COUNTED
 * ANYTHING. MANIFEST.md §9 lists it as day-zero because it "shapes the request
 * pipeline", and the shape it was given was a field an app could fill in and
 * believe.
 *
 * ⚠️ IT IS NOT A GENERAL DEFENCE, and pretending otherwise is how a product ends
 * up with one. A worker in front of a global network already has a layer that
 * absorbs volume; what this is for is the handful of operations where a SINGLE
 * caller repeating themselves is expensive or dangerous — a code that can be
 * guessed, a message that can be sent to somebody, a generation that costs
 * money. So it is declared per operation and counted only where declared, and an
 * operation that names none pays nothing at all.
 */

import type { Instant, JobSpec, RateLimit, SchemaModule, SqlHandle } from "@one/kernel";

export const LIMIT_SCHEMA: SchemaModule = {
  id: "limit",
  ddl: [
    /*
      ⚠️ THE WINDOW IS PART OF THE KEY RATHER THAN A TIMESTAMP TO COMPARE. A
      fixed window is one row per caller per period that stops being matched the
      moment the period rolls over, so nothing has to expire anything — the old
      rows simply stop being read, and the sweep that removes them is a tidy-up
      rather than the thing correctness depends on.
    */
    `CREATE TABLE IF NOT EXISTS request_counts (key TEXT PRIMARY KEY, n INTEGER NOT NULL, at TEXT NOT NULL);`,
    `CREATE INDEX IF NOT EXISTS idx_request_counts_at ON request_counts(at);`,
  ],
};

/**
 * The window this instant falls in, as text.
 *
 * ⚠️ A FIXED WINDOW, NOT A SLIDING ONE, and the trade is worth stating: a fixed
 * window lets somebody spend their whole allowance at the end of one and again
 * at the start of the next, so the real ceiling over a boundary is twice the
 * declared number. A sliding window costs a row per request and a range scan on
 * the hot path. For "you may ask for a sign-in code five times an hour" the
 * cheap answer is the right one; anything where 2× matters is something that
 * should not be rate-limited at all, it should be refused.
 */
export function windowOf(at: Instant, window: RateLimit["window"]): string {
  const iso = String(at);
  switch (window) {
    case "minute": return iso.slice(0, 16);
    case "hour": return iso.slice(0, 13);
    case "day": return iso.slice(0, 10);
  }
}

export interface Asker {
  readonly actorId: string | null;
  readonly tenantId: string | null;
  readonly ip: string | null;
}

/**
 * Who is being counted.
 *
 * ⚠️ AN UNIDENTIFIABLE CALLER IS COUNTED AS ONE CALLER, NOT AS NOBODY. A request
 * with no actor, no workspace and no address is rare and is exactly the shape
 * somebody probing arrives in — falling through to "unlimited" would make the
 * limit apply to everybody except the person it is for.
 */
export const askerFor = (per: RateLimit["per"], who: Asker): string =>
  (per === "actor" ? who.actorId : per === "tenant" ? who.tenantId : who.ip) ?? "anonymous";

export interface Verdict {
  readonly allowed: boolean;
  /** How many of the allowance are gone, including this one. */
  readonly used: number;
  readonly max: number;
}

/**
 * Count one request, and say whether it may proceed.
 *
 * ⚠️ COUNTED BEFORE THE HANDLER RUNS AND NEVER GIVEN BACK. A limit that only
 * counts successes is one somebody exhausts our resources against for free by
 * sending requests that fail — which for the operations worth limiting is the
 * whole of the attack.
 *
 * ⚠️ AND THE UPSERT IS THE COUNT. A read-then-write leaves a window exactly one
 * round trip wide, which for anything worth limiting is a window that gets used.
 */
export async function countRequest(
  db: SqlHandle,
  operationId: string,
  limit: RateLimit,
  who: Asker,
  at: Instant,
): Promise<Verdict> {
  const key = `${operationId}:${limit.per}:${askerFor(limit.per, who)}:${windowOf(at, limit.window)}`;
  await db.run(
    `INSERT INTO request_counts (key, n, at) VALUES (?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET n = n + 1`,
    key, at,
  ).catch(() => undefined);
  const row = await db.first<{ n: number }>(`SELECT n FROM request_counts WHERE key = ?`, key).catch(() => null);
  /*
    ⚠️ A STORE THAT CANNOT ANSWER ALLOWS THE REQUEST. A rate limiter that fails
    closed turns one broken table into a product nobody can use, which is a
    larger outage than the one it was protecting against — and every operation
    behind it still has its own permission, its own gate and its own quota.
  */
  const used = row?.n ?? 0;
  return { allowed: used === 0 || used <= limit.max, used, max: limit.max };
}

/** Old windows nobody will ever match again. A tidy-up, not a correctness step. */
export const forgetOldCounts = (db: SqlHandle, before: string): Promise<void> =>
  db.run(`DELETE FROM request_counts WHERE at < ?`, before);

/** How long a spent window is kept before it is swept. Two days, for one reason. */
export const KEEP_WINDOWS_DAYS = 2;

/**
 * ⚠️ A TIDY-UP RATHER THAN THE THING CORRECTNESS DEPENDS ON, and the distinction
 * is why this job is allowed to be unreliable. A fixed window stops being matched
 * the moment it rolls over, so a sweep that never runs costs disk and nothing
 * else — which is the opposite of a limiter that expires rows lazily, where the
 * sweep failing means the limit failing.
 *
 * ⚠️ AND IT IS `platform` SCOPE, because the table is not a workspace's. Its key
 * is a composite that may name an address rather than anybody, so sweeping it
 * per workspace would be the same delete run once per tenant.
 */
export const limitJob = (): JobSpec => ({
  id: "platform.limits",
  summary: "Forget request windows nobody will ever match again.",
  every: "daily",
  scope: "platform",
  batch: 1,
  async handler(ctx) {
    const before = new Date(Date.parse(ctx.now()) - KEEP_WINDOWS_DAYS * 86_400_000).toISOString();
    await forgetOldCounts(ctx.bind.db as SqlHandle, before).catch(() => undefined);
    return { done: 1, more: false };
  },
});
