/**
 * ERASURE — the D1 half is DERIVED from the schema; the rest is this app's.
 *
 * `@4dl/purge` computes both cascades from every module's `scoped` declaration,
 * so a table is swept because the module that creates it says who owns its rows.
 * Do not reintroduce a hand-written table list: the two failure modes are
 * invisible at runtime (a purge must swallow delete errors, since an old
 * database may legitimately lack a table), and both have shipped — a table in
 * none of the lists, and a column renamed under one that stayed.
 *
 * What stays here is everything with a side effect OUTSIDE D1: the object-store
 * sweep, the credit DO wipe, provider cancellations, and the decision about
 * whether a user's identity outlives the tenant.
 */

import { applyCascade, subjectCascade, tenantCascade } from "@4dl/purge";
import { SCHEMA_MODULES } from "./db.js";
import type { Env } from "./env.js";
import { purgePrefix } from "./storage.js";

const TENANT_CASCADE = tenantCascade(SCHEMA_MODULES);
const SUBJECT_CASCADE = subjectCascade(SCHEMA_MODULES);

/** Swallow: an old database may not have every table yet. */
const run = (db: D1Database, sql: string, ...binds: unknown[]): Promise<void> =>
  db.prepare(sql).bind(...binds).run().then(() => undefined).catch(() => undefined);

/** Erase ONE subject's rows. Does not touch the linked user identity — a user
 *  may still be a member elsewhere. */
export async function purgeSubject(env: Env, tenantId: string, subjectId: string): Promise<void> {
  await purgePrefix(env, `t/${tenantId}/s/${subjectId}/`);
  await applyCascade(SUBJECT_CASCADE, subjectId, (sql, id) => run(env.DB, sql, id));
}

/**
 * Erase an ENTIRE tenant. Idempotent.
 *
 * Members are read UP FRONT because the cascade removes them, and their ids are
 * what decides identity deletion afterwards.
 */
export async function purgeTenant(env: Env, tenantId: string): Promise<void> {
  const members = (await env.DB
    .prepare('SELECT userId FROM "member" WHERE organizationId = ?')
    .bind(tenantId)
    .all<{ userId: string }>()
    .catch(() => ({ results: [] as { userId: string }[] }))).results ?? [];

  await purgePrefix(env, `t/${tenantId}/`);
  await env.BILLING.get(env.BILLING.idFromName(tenantId)).wipe().catch(() => undefined);

  // Child rows with no tenant column, reached through their parent.
  await run(env.DB, "DELETE FROM redemption_uses WHERE code_id IN (SELECT id FROM redemption_codes WHERE tenant_id = ?)", tenantId);
  // Includes auth's `member`/`invitation`, keyed `organizationId` — which is why
  // each cascade step carries its own column rather than the loop assuming one.
  await applyCascade(TENANT_CASCADE, tenantId, (sql, id) => run(env.DB, sql, id));
  await run(env.DB, 'DELETE FROM "organization" WHERE id = ?', tenantId);

  // A user whose ONLY membership was this tenant is fully erased; anyone still a
  // member elsewhere keeps their identity. Sweeping identity with the tenant
  // would delete a stranger's account as a side effect of someone else leaving.
  for (const m of members) {
    if (!m.userId) continue;
    const other = await env.DB.prepare('SELECT 1 AS x FROM "member" WHERE userId = ? LIMIT 1').bind(m.userId).first().catch(() => null);
    if (other) continue;
    for (const sql of [
      'DELETE FROM "user" WHERE id = ?',
      'DELETE FROM "session" WHERE userId = ?',
      'DELETE FROM "account" WHERE userId = ?',
      'DELETE FROM "passkey" WHERE userId = ?',
      "DELETE FROM user_prefs WHERE user_id = ?",
      "DELETE FROM digest_sent WHERE user_id = ?",
      "DELETE FROM notifications WHERE recipient_user_id = ?",
      "DELETE FROM action_otps WHERE subject = ?",
    ]) await run(env.DB, sql, m.userId);
    await env.INBOX.get(env.INBOX.idFromName(m.userId)).wipe().catch(() => undefined);
  }
}
