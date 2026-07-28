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
import { purgePrefix, deleteMedia } from "./storage.js";
import { nowIso } from "./ids.js";
import { stripeConfig, stripeEnabled, stripeCall } from "./stripe.js";
import { notifyUser } from "./inbox-do.js";
import { saasConfig, deleteCustomHostname } from "./cloudflare.js";
import { invalidateHostCache } from "./host-context.js";
import { DEFAULT_PLANS } from "./billing-store.js";

/** Tables that carry a `client_id` — everything a single client's record owns.
 *
 *  Verified against db.ts: this is EVERY table with a literal `client_id` column.
 *  Deliberately absent (they reference a client by a *different* column and are
 *  tenant-owned assets, so deleting the row would destroy the studio's property):
 *  `packages.restricted_client_id`, `redemption_codes.restricted_client_id` +
 *  `used_by_json`, `promo_codes.restricted_client_id`, `resources.assigned_json`,
 *  and `notifications.link` (`/clients/<id>` deep-links). Those keep a dangling
 *  reference after a purge; each one reads as "no longer applies" rather than
 *  leaking data (an offer restricted to a deleted client is unreachable), so they
 *  are left in place on purpose. */
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

/** What a client purge reclaimed — reported back so the caller can say what was
 *  freed. `bytesFreed` is measured off LIVE ledger rows (the same
 *  `SUM(size_bytes) WHERE deleted_at IS NULL` the storage meter reads), so it is
 *  exactly the amount `/api/storage-usage` drops by. */
export interface ClientPurgeResult {
  /** R2 objects removed (prefix sweep + the strays below). */
  objects: number;
  /** Live ledger bytes reclaimed. */
  bytesFreed: number;
}

/**
 * Prefix-match a `r2_key` WITHOUT `LIKE`. Measured against D1: its
 * `SQLITE_LIMIT_LIKE_PATTERN_LENGTH` is **50 characters** — a 51-char pattern
 * raises `D1_ERROR: LIKE or GLOB pattern too complex`, and only once a row is
 * actually tested (an empty table never invokes the function, which is why this
 * hid for so long). A per-client prefix is
 * `t/<32-char tenant>/c/<20-char client>/%` = 59 chars, so it ALWAYS trips.
 *
 * `substr(col,1,?) = ?` has no length ceiling and no wildcard semantics, so it
 * also stops a `_` in an id (every id has one) silently matching as a wildcard.
 */
const PREFIX_MATCH = "substr(r2_key, 1, ?) = ?";

/** The R2 key behind a stored media URL (`/api/media/t/<tenant>/…`), or null if
 *  the URL isn't one of ours (a DiceBear avatar, an external image). */
function mediaKeyFromUrl(url: string | null | undefined, tenantId: string): string | null {
  if (!url) return null;
  const marker = "/api/media/";
  const i = url.indexOf(marker);
  const key = (i >= 0 ? url.slice(i + marker.length) : url).split("?")[0] ?? "";
  return key.startsWith(`t/${tenantId}/`) ? key : null;
}

/**
 * Hard-delete ONE client: their R2 objects and every client-scoped row. Does NOT
 * touch the linked user identity (a user may still be a member elsewhere) — call
 * `purgeUser` for account-level erasure.
 *
 * The R2 sweep is deliberately NOT just the `t/<tenant>/c/<client>/` prefix.
 * Two classes of the client's objects land outside it and survived erasure:
 *
 *   • **their avatar** — uploaded as `purpose=avatar` with NO clientId, so it
 *     stores at `t/<tenant>/avatar/…` and its ledger row carries
 *     `client_id = NULL`. Both the prefix sweep AND the
 *     `DELETE … WHERE client_id = ?` missed it, so the object *and* its billed
 *     bytes outlived the client. Resolved from `clients.avatar_url` below.
 *   • **AI images generated for them** — `ai.ts` stores at `t/<tenant>/ai/…`
 *     while stamping `media_assets.client_id`. The row was hard-deleted (so the
 *     meter dropped) but the R2 object was orphaned with nothing left pointing
 *     at it. Now swept via the ledger, by key, wherever it lives.
 */
export async function purgeClient(env: Env, tenantId: string, clientId: string): Promise<ClientPurgeResult> {
  // Stop their card first. `client_subscriptions` rows are about to be deleted, so
  // after this point there is nothing left that names the Stripe subscription and
  // it would bill on forever, unreachable from any surface we own.
  await cancelClientStripe(env, tenantId, clientId);
  const prefix = `t/${tenantId}/c/${clientId}/`;
  const row = await env.DB
    .prepare("SELECT user_id, avatar_url FROM clients WHERE id = ? AND tenant_id = ?")
    .bind(clientId, tenantId)
    .first<{ user_id: string | null; avatar_url: string | null }>()
    .catch(() => null);
  const avatarKey = mediaKeyFromUrl(row?.avatar_url, tenantId);

  // Measure BEFORE deleting — afterwards there is nothing left to sum.
  const live = (
    await env.DB
      .prepare(
        `SELECT r2_key, size_bytes FROM media_assets WHERE deleted_at IS NULL AND (client_id = ? OR ${PREFIX_MATCH} OR r2_key = ?)`,
      )
      .bind(clientId, prefix.length, prefix, avatarKey ?? "")
      .all<{ r2_key: string; size_bytes: number | null }>()
      .catch(() => ({ results: [] as { r2_key: string; size_bytes: number | null }[] }))
  ).results ?? [];
  const bytesFreed = live.reduce((n, r) => n + (r.size_bytes ?? 0), 0);

  let objects = await purgePrefix(env, prefix);
  // `purgePrefix` deletes the R2 objects (a bucket listing, so unaffected) but
  // its own ledger tombstone is a `LIKE` on this same over-long prefix, so it
  // throws and is swallowed — see PREFIX_MATCH. Tombstone the prefix rows here
  // instead, which covers any whose `client_id` is NULL and would otherwise keep
  // billing the tenant for bytes that no longer exist.
  await run(
    env.DB,
    `UPDATE media_assets SET deleted_at = ? WHERE deleted_at IS NULL AND ${PREFIX_MATCH}`,
    nowIso(),
    prefix.length,
    prefix,
  );
  // Everything of theirs that lives outside their own prefix.
  const strays = new Set(live.map((r) => r.r2_key).filter((k) => !k.startsWith(prefix)));
  if (avatarKey && !avatarKey.startsWith(prefix)) strays.add(avatarKey);
  for (const key of strays) await deleteMedia(env, key);
  objects += strays.size;

  for (const table of CLIENT_TABLES) await run(env.DB, `DELETE FROM ${table} WHERE client_id = ?`, clientId);
  await run(env.DB, "DELETE FROM clients WHERE id = ?", clientId);

  // A deleted client must also lose their way in: without this the `member` row
  // survives and they still sign in to the studio as a client with no record.
  // Scoped to `role = 'client'` so deleting a coach's OWN training record
  // (POST /clients/self) never strips their staff seat.
  if (row?.user_id) {
    await run(env.DB, 'DELETE FROM "member" WHERE organizationId = ? AND userId = ? AND role = \'client\'', tenantId, row.user_id);
  }

  return { objects, bytesFreed };
}

/** Deregister a tenant's custom domains (Cloudflare for SaaS) and drop their
 *  host→tenant KV cache entries — otherwise a purged tenant's hostname keeps a
 *  live CF custom hostname and a stale cache row pointing at a deleted tenant.
 *  Best-effort; teardown proceeds even if Cloudflare is unreachable. */
async function purgeTenantDomains(env: Env, tenantId: string): Promise<void> {
  const rows = (await env.DB.prepare("SELECT hostname, cf_hostname_id FROM tenant_domains WHERE tenant_id = ?").bind(tenantId).all<{ hostname: string; cf_hostname_id: string | null }>().catch(() => ({ results: [] as { hostname: string; cf_hostname_id: string | null }[] }))).results ?? [];
  if (!rows.length) return;
  const cfg = await saasConfig(env.DB).catch(() => null);
  for (const r of rows) {
    if (cfg && r.cf_hostname_id) await deleteCustomHostname(cfg, r.cf_hostname_id).catch(() => undefined);
    await invalidateHostCache(env, r.hostname);
  }
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

/**
 * Cancel a tenant's CLIENTS' auto-renewing subscriptions — the Connect rail.
 *
 * These are separate Stripe objects on a separate account: the tenant's platform
 * subscription bills the studio on OUR account, while each client's recurring
 * package bills the client on the STUDIO's connected account. Cancelling the first
 * does nothing to the second.
 *
 * Without this, deleting a tenant left every one of its clients' cards being
 * charged on a schedule, for a studio that no longer existed, with no record on our
 * side to reconcile against and no UI anywhere that could stop it — the client's
 * only recourse would have been their bank. That made the nuclear reset an
 * instrument for charging strangers money indefinitely.
 *
 * Returns a count of what it cancelled and what it could not, so the caller can
 * report it rather than claiming a clean teardown it did not achieve.
 */
async function cancelClientStripe(env: Env, tenantId: string, clientId?: string): Promise<{ canceled: number; failed: number }> {
  let canceled = 0;
  let failed = 0;
  try {
    const acct = await env.DB
      .prepare("SELECT stripe_account_id FROM tenant_settings WHERE tenant_id = ?")
      .bind(tenantId)
      .first<{ stripe_account_id: string | null }>()
      .catch(() => null);
    // No connected account means no Connect-rail subscription can exist.
    if (!acct?.stripe_account_id) return { canceled, failed };
    const cfg = await stripeConfig(env.DB);
    if (!stripeEnabled(cfg)) return { canceled, failed };

    const rows = (await env.DB
      .prepare(
        "SELECT id, stripe_sub_id FROM client_subscriptions WHERE tenant_id = ? AND stripe_sub_id IS NOT NULL" +
          (clientId ? " AND client_id = ?" : ""),
      )
      .bind(...(clientId ? [tenantId, clientId] : [tenantId]))
      .all<{ id: string; stripe_sub_id: string }>()
      .catch(() => ({ results: [] as { id: string; stripe_sub_id: string }[] }))).results ?? [];

    for (const r of rows) {
      try {
        await stripeCall(cfg.secretKey, `subscriptions/${r.stripe_sub_id}`, undefined, {
          connectedAccount: acct.stripe_account_id,
          method: "DELETE",
        });
        canceled++;
      } catch (e) {
        // Loud, and counted. A subscription we failed to cancel is a card that
        // keeps getting charged, so this is the one failure in a purge that an
        // operator genuinely has to know about and go fix by hand in Stripe.
        failed++;
        console.error(`[purge] could not cancel client subscription ${r.stripe_sub_id} on ${acct.stripe_account_id}:`, e);
      }
    }
  } catch (e) {
    console.error(`[purge] client-subscription teardown failed for tenant ${tenantId}:`, e);
  }
  return { canceled, failed };
}

export const TENANT_CLOSE_GRACE_DAYS = 7;

/** Owner-initiated studio close: cancel billing NOW (charging stops immediately),
 *  then mark the subscription `closing` with a delete_at 7 days out — the daily
 *  cron hard-purges it once the hold lapses. Returns the scheduled purge date. */
export async function scheduleTenantClose(env: Env, tenantId: string): Promise<{ deleteAt: string }> {
  await cancelTenantStripe(env, tenantId);
  // The studio is closing, so its clients must stop being charged for it NOW
  // rather than at the end of the 7-day data hold. Billing someone for coaching
  // that has already stopped is not something a grace window should cover.
  await cancelClientStripe(env, tenantId);
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
export async function purgeTenant(env: Env, tenantId: string): Promise<{ clientSubs: { canceled: number; failed: number } }> {
  // Both rails, in this order. The studio stops being billed by us, and its
  // clients stop being billed by it — the second is the one that used to be
  // missed, and it is the one that charges real people for a deleted studio.
  await cancelTenantStripe(env, tenantId);
  const clientSubs = await cancelClientStripe(env, tenantId);
  // Deregister CF custom hostnames + drop their host-cache KV entries BEFORE the
  // tenant_domains rows go, so nothing keeps routing to a deleted tenant.
  await purgeTenantDomains(env, tenantId);

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
  return { clientSubs };
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
export async function purgeEverything(env: Env): Promise<{ tenants: number; subsCanceled: number; subsFailed: number }> {
  const orgs = (await env.DB.prepare('SELECT id FROM "organization"').all<{ id: string }>().catch(() => ({ results: [] as { id: string }[] }))).results ?? [];
  // Tally the Connect-rail cancellations so the reset can REPORT them. A reset
  // that silently failed to cancel a client's card is the one outcome an operator
  // must not learn about from a chargeback, so the number is surfaced rather than
  // swallowed — see `cancelClientStripe`.
  let subsCanceled = 0;
  let subsFailed = 0;
  for (const o of orgs) {
    const r = await purgeTenant(env, o.id).catch(() => null);
    subsCanceled += r?.clientSubs.canceled ?? 0;
    subsFailed += r?.clientSubs.failed ?? 0;
  }

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

  // Retired plan tiers (free / studio / team) exist for ONE reason: a tenant that
  // bought them keeps exactly what it was sold. A nuclear reset leaves no tenants,
  // so there is nobody left to grandfather and they are pure clutter in the admin
  // catalog. Drop anything not in the shipped ladder; the live tiers keep their
  // rows AND their Stripe product/price ids, which are expensive to re-create.
  const live = DEFAULT_PLANS.map((p) => p.id);
  await run(env.DB, `DELETE FROM plans WHERE id NOT IN (${live.map(() => "?").join(",")})`, ...live);

  // The starter exercise library is platform content, not tenant data, so the
  // blanket `DELETE FROM exercises` above already took it. It only returns if an
  // admin installs it again — see `seedExercises`, which is no longer automatic.
  return { tenants: orgs.length, subsCanceled, subsFailed };
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
