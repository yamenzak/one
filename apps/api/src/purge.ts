/**
 * Cascade purges (GDPR erasure + tenant teardown). The hard-delete counterpart
 * to the soft archive — used by the user self-delete, the owner close-studio
 * flow, and the platform nuclear reset. Everything keyed on a tenant / client /
 * user is removed from D1, R2 (via the storage ledger's prefix purge), the
 * billing Durable Object, and — best-effort — Stripe.
 *
 * The table inventory below is the SSOT for "what a purge must clear"; keep it in
 * step with db.ts. Global seed rows (exercises/foods with tenant_id IS NULL) are
 * naturally excluded by the `WHERE tenant_id = ?` filter. Users are cross-tenant:
 * a user in more than one studio keeps their identity; only their membership +
 * their client data in the purged tenant go.
 */

import type { Env } from "./env.js";
import { purgePrefix } from "./storage.js";
import { stripeConfig, stripeEnabled, stripeCall } from "./stripe.js";
import { notifyUser } from "./inbox-do.js";

/** Tables that carry a `client_id` — everything a single client's record owns. */
const CLIENT_TABLES = [
  "client_goals", "client_trainers", "workout_plans", "swap_requests", "meal_plans",
  "meal_arrangements", "exercise_logs", "exercise_prs", "activity_logs", "food_entries",
  "water_logs", "sleep_logs", "mood_logs", "measurements", "body_scans", "check_ins",
  "fasting_sessions", "supplements", "supplement_logs", "lab_tests", "client_subscriptions",
  "redemption_uses", "trainer_sessions", "audit_log", "plan_variants", "ai_generations",
  "media_assets",
] as const;

/** Tables that carry a `tenant_id` — everything a studio owns (plus the two by
 *  their own keys, handled separately: redemption_uses, member/org). */
const TENANT_TABLES = [
  "subscriptions", "credit_ledger", "ai_generations", "insight_feedback", "clients",
  "client_trainers", "client_goals", "exercises", "exercise_alternatives", "workout_plans",
  "workout_templates", "swap_requests", "foods", "meal_plans", "meal_templates",
  "meal_arrangements", "exercise_logs", "exercise_prs", "activity_logs", "food_entries",
  "water_logs", "sleep_logs", "mood_logs", "measurements", "body_scans", "tts_cues",
  "check_ins", "fasting_sessions", "supplements", "supplement_logs", "lab_tests", "packages",
  "client_subscriptions", "redemption_codes", "promo_codes", "addon_types", "trainer_sessions",
  "email_templates", "resources", "notifications", "tenant_settings", "tenant_domains",
  "audit_log", "plan_variants", "media_assets",
] as const;

async function run(db: D1Database, sql: string, ...binds: unknown[]): Promise<void> {
  await db.prepare(sql).bind(...binds).run().catch(() => undefined);
}

/**
 * Hard-delete ONE client: their R2 objects and every client-scoped row. Does NOT
 * touch the linked user identity (a user may still be a member elsewhere) — call
 * `purgeUser` for account-level erasure.
 */
export async function purgeClient(env: Env, tenantId: string, clientId: string): Promise<void> {
  await purgePrefix(env, `t/${tenantId}/c/${clientId}/`);
  for (const table of CLIENT_TABLES) await run(env.DB, `DELETE FROM ${table} WHERE client_id = ?`, clientId);
  await run(env.DB, "DELETE FROM clients WHERE id = ?", clientId);
}

/** Cancel a tenant's platform Stripe subscription (best-effort). */
async function cancelTenantStripe(env: Env, tenantId: string): Promise<void> {
  try {
    const sub = await env.DB.prepare("SELECT stripe_sub_id FROM subscriptions WHERE tenant_id = ?").bind(tenantId).first<{ stripe_sub_id: string | null }>();
    if (!sub?.stripe_sub_id) return;
    const cfg = await stripeConfig(env.DB);
    if (!stripeEnabled(cfg)) return;
    await stripeCall(cfg.secretKey, `subscriptions/${sub.stripe_sub_id}`, undefined, { method: "DELETE" });
  } catch { /* teardown proceeds even if Stripe is unreachable */ }
}

export const TENANT_CLOSE_GRACE_DAYS = 7;

/** Owner-initiated studio close: cancel billing NOW (charging stops immediately),
 *  then mark the subscription `closing` with a delete_at 7 days out — the daily
 *  cron hard-purges it once the hold lapses. Returns the scheduled purge date. */
export async function scheduleTenantClose(env: Env, tenantId: string): Promise<{ deleteAt: string }> {
  await cancelTenantStripe(env, tenantId);
  const deleteAt = new Date(Date.now() + TENANT_CLOSE_GRACE_DAYS * 86_400_000).toISOString();
  await env.DB
    .prepare("UPDATE subscriptions SET status = 'closing', suspend_at = ?, delete_at = ? WHERE tenant_id = ?")
    .bind(new Date().toISOString(), deleteAt, tenantId)
    .run();
  return { deleteAt };
}

/** Undo a pending close within the grace window (the studio stays; billing must
 *  be re-established separately since the Stripe sub was already canceled). */
export async function cancelTenantClose(env: Env, tenantId: string): Promise<void> {
  await env.DB
    .prepare("UPDATE subscriptions SET status = 'active', suspend_at = NULL, delete_at = NULL WHERE tenant_id = ? AND status = 'closing'")
    .bind(tenantId)
    .run();
}

/** Erase the identity + personal rows of a user who no longer belongs to ANY
 *  tenant. (Guarded by the caller — never called while a membership remains.) */
async function purgeUserIdentity(env: Env, userId: string): Promise<void> {
  for (const sql of [
    'DELETE FROM "user" WHERE id = ?',
    'DELETE FROM "session" WHERE userId = ?',
    'DELETE FROM "account" WHERE userId = ?',
    'DELETE FROM "passkey" WHERE userId = ?',
    "DELETE FROM user_prefs WHERE user_id = ?",
    "DELETE FROM digest_sent WHERE user_id = ?",
    "DELETE FROM notifications WHERE recipient_user_id = ?",
    "DELETE FROM insight_feedback WHERE user_id = ?",
    "DELETE FROM action_otps WHERE subject = ?",
  ]) await run(env.DB, sql, userId);
  await env.INBOX.get(env.INBOX.idFromName(userId)).wipe().catch(() => undefined);
}

/**
 * Hard-delete an ENTIRE tenant: Stripe cancel, all R2 objects, the billing DO,
 * every tenant-scoped row, the org/members/invitations, and — for members whose
 * ONLY studio was this one — their user identity. Idempotent.
 */
export async function purgeTenant(env: Env, tenantId: string): Promise<void> {
  await cancelTenantStripe(env, tenantId);

  // Members up front — we need their ids to decide identity deletion later.
  const members = (await env.DB.prepare('SELECT userId FROM "member" WHERE organizationId = ?').bind(tenantId).all<{ userId: string }>().catch(() => ({ results: [] as { userId: string }[] }))).results ?? [];

  await purgePrefix(env, `t/${tenantId}/`);
  await env.BILLING.get(env.BILLING.idFromName(tenantId)).wipe().catch(() => undefined);

  // Child rows without a tenant_id: redemption_uses keyed by this tenant's codes.
  await run(env.DB, "DELETE FROM redemption_uses WHERE code_id IN (SELECT id FROM redemption_codes WHERE tenant_id = ?)", tenantId);
  for (const table of TENANT_TABLES) await run(env.DB, `DELETE FROM ${table} WHERE tenant_id = ?`, tenantId);

  // Org membership + the org itself.
  await run(env.DB, 'DELETE FROM "member" WHERE organizationId = ?', tenantId);
  await run(env.DB, 'DELETE FROM "invitation" WHERE organizationId = ?', tenantId);
  await run(env.DB, 'DELETE FROM "organization" WHERE id = ?', tenantId);

  // Users whose only membership was this tenant get fully erased; others keep
  // their identity (they're still a member of another studio).
  for (const m of members) {
    if (!m.userId) continue;
    const other = await env.DB.prepare('SELECT 1 AS x FROM "member" WHERE userId = ? LIMIT 1').bind(m.userId).first().catch(() => null);
    if (!other) await purgeUserIdentity(env, m.userId);
  }
}

/**
 * Erase a USER's account (GDPR self-delete). Purges their client record + data
 * in every tenant where they're a client, drops their coaching assignments and
 * memberships, then removes their identity if no membership remains. Refuses an
 * owner (they must close the studio instead) — the caller checks `isOwnerAnywhere`.
 */
export async function isOwnerAnywhere(db: D1Database, userId: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 AS x FROM "member" WHERE userId = ? AND role = \'owner\' LIMIT 1').bind(userId).first().catch(() => null);
  return !!row;
}

/**
 * PLATFORM NUCLEAR RESET — erase EVERY tenant + all identity + the whole media
 * bucket, back to an empty install. Platform-config tables (plans, credit packs,
 * app_config incl. Stripe/AI keys, ai_models) are PRESERVED so the operator can
 * sign back in and start fresh. Irreversible; guarded by OTP + a typed phrase.
 */
export async function purgeEverything(env: Env): Promise<{ tenants: number }> {
  const orgs = (await env.DB.prepare('SELECT id FROM "organization"').all<{ id: string }>().catch(() => ({ results: [] as { id: string }[] }))).results ?? [];
  for (const o of orgs) await purgeTenant(env, o.id).catch(() => undefined);

  // Sweep the ENTIRE media bucket (empty prefix) so any orphan escapes nothing.
  await purgePrefix(env, "");

  // Wipe every remaining tenant-data + identity row (a user with no org, a
  // dangling child row). Platform config tables are intentionally NOT listed.
  const wipe = [
    ...TENANT_TABLES.map((t) => `DELETE FROM ${t}`),
    "DELETE FROM redemption_uses",
    'DELETE FROM "member"', 'DELETE FROM "invitation"', 'DELETE FROM "organization"',
    'DELETE FROM "user"', 'DELETE FROM "session"', 'DELETE FROM "account"', 'DELETE FROM "passkey"',
    "DELETE FROM user_prefs", "DELETE FROM digest_sent", "DELETE FROM action_otps",
    "DELETE FROM auth_logs", "DELETE FROM verification", "DELETE FROM stripe_events", "DELETE FROM ai_cache",
  ];
  for (const sql of wipe) await run(env.DB, sql);
  return { tenants: orgs.length };
}

export async function purgeUser(env: Env, userId: string): Promise<void> {
  const memberships = (await env.DB.prepare('SELECT organizationId FROM "member" WHERE userId = ?').bind(userId).all<{ organizationId: string }>().catch(() => ({ results: [] as { organizationId: string }[] }))).results ?? [];
  for (const m of memberships) {
    const cl = await env.DB.prepare("SELECT id FROM clients WHERE tenant_id = ? AND user_id = ?").bind(m.organizationId, userId).first<{ id: string }>().catch(() => null);
    if (cl?.id) await purgeClient(env, m.organizationId, cl.id);
  }
  // Their coaching assignments + memberships.
  await run(env.DB, "DELETE FROM client_trainers WHERE trainer_user_id = ?", userId);
  await run(env.DB, 'DELETE FROM "member" WHERE userId = ?', userId);
  // No membership can remain (we just removed them all) → erase identity.
  await purgeUserIdentity(env, userId);
  await notifyUser(env, userId).catch(() => undefined);
}
