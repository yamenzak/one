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
import { CREATOR_ROLE } from "./access.js";

const TENANT_CASCADE = tenantCascade(SCHEMA_MODULES);
const SUBJECT_CASCADE = subjectCascade(SCHEMA_MODULES);

/**
 * Everything keyed to a USER, in one list.
 *
 * ⚠️ ONE list, because there are two callers — the tenant sweep below and the
 * self-delete at the bottom — and two copies drift in the direction that leaves
 * rows behind. A purge swallows every delete error by construction (an old
 * database may legitimately lack a table), so a table missing from one copy is
 * invisible at runtime, forever.
 */
const IDENTITY_DELETES = [
  'DELETE FROM "user" WHERE id = ?',
  'DELETE FROM "session" WHERE userId = ?',
  'DELETE FROM "account" WHERE userId = ?',
  'DELETE FROM "passkey" WHERE userId = ?',
  "DELETE FROM user_prefs WHERE user_id = ?",
  "DELETE FROM digest_sent WHERE user_id = ?",
  "DELETE FROM notifications WHERE recipient_user_id = ?",
  "DELETE FROM action_otps WHERE subject = ?",
] as const;

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
    for (const sql of IDENTITY_DELETES) await run(env.DB, sql, m.userId);
    await env.INBOX.get(env.INBOX.idFromName(m.userId)).wipe().catch(() => undefined);
  }
}

/* ─────────────── LEAVING, which is not the same as being purged ──────────── */

/**
 * ⚠️ THE GRACE WINDOW IS THE FEATURE.
 *
 * A close is deliberately NOT immediate. Nobody should be charged for a product
 * they have ended, so the subscription stops at once — but an irreversible wipe
 * with no way back is how a mis-click becomes a support ticket nobody can
 * answer. The daily sweep is what finally calls `purgeTenant`.
 */
export const TENANT_CLOSE_GRACE_DAYS = 7;

/** Stop the billing NOW, hold the data, hand back the date the purge runs. */
export async function scheduleTenantClose(env: Env, tenantId: string): Promise<{ deleteAt: string }> {
  const deleteAt = new Date(Date.now() + TENANT_CLOSE_GRACE_DAYS * 86_400_000).toISOString();
  await run(
    env.DB,
    "UPDATE subscriptions SET status = 'closing', suspend_at = ?, delete_at = ? WHERE tenant_id = ?",
    new Date().toISOString(),
    deleteAt,
    tenantId,
  );
  return { deleteAt };
}

/**
 * Undo a pending close inside the window.
 *
 * `AND status = 'closing'` is load-bearing: without it this is a route that sets
 * any subscription to `active`, which would let a tenant the platform SUSPENDED
 * for non-payment cancel their way back into service.
 */
export async function cancelTenantClose(env: Env, tenantId: string): Promise<void> {
  await run(
    env.DB,
    "UPDATE subscriptions SET status = 'active', suspend_at = NULL, delete_at = NULL WHERE tenant_id = ? AND status = 'closing'",
    tenantId,
  );
}

/** True when this user runs any tenant. An owner cannot self-delete out from
 *  under one — that leaves a tenant nobody can administer, still billing, holding
 *  records other people are responsible for. They close it instead. */
export async function isOwnerAnywhere(db: D1Database, userId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS x FROM "member" WHERE userId = ? AND role = ? LIMIT 1')
    .bind(userId, CREATOR_ROLE)
    .first<{ x: number }>()
    .catch(() => null);
  return !!row;
}

/**
 * Erase a USER — the self-delete behind the right to erasure.
 *
 * Their memberships go and their identity goes. What survives is a decision each
 * app has to make deliberately: a column naming WHO performed an act is often
 * the thing a record consists of, and deleting it does not anonymise the record,
 * it destroys it. Tessa keeps `released_by` for exactly that reason (a Freigabe
 * with no named releaser is not a record under MPBetreibV) — an opaque id whose
 * subject row is gone, which is the pseudonymisation both the obligation and the
 * right are satisfied by. Decide this for the app's own tables, in writing.
 *
 * Guarded by the caller: never reached while this user still owns a tenant.
 */
export async function purgeUser(env: Env, userId: string): Promise<void> {
  await run(env.DB, 'DELETE FROM "member" WHERE userId = ?', userId);
  for (const sql of IDENTITY_DELETES) await run(env.DB, sql, userId);
  await env.INBOX.get(env.INBOX.idFromName(userId)).wipe().catch(() => undefined);
}
