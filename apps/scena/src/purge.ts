/**
 * Workspace erasure, DERIVED from the schema.
 *
 * ── What this replaces, and why it was a real hole ──────────────────────────
 *
 * `deleteTenantData` named SEVEN tables by hand — `screens`, `channels`,
 * `boards`, `feeds`, `alert_rules`, `alerts`, `playout_events` — plus three
 * parent-keyed joins, while `SCENA_SCHEMA.scoped` declared TWENTY-FIVE. Nothing
 * connected the two, so a workspace deleted at the end of the dunning ladder
 * kept:
 *
 *   its media library, its slide and music playlists, its widget profiles, its
 *   ad rotations and ads, its tracks, its manifest version history, its weather
 *   sources, its board users, its device→channel assignments, its promo
 *   redemptions and its AI generation history
 *
 * — indefinitely. The sweep reported success and emailed the owner to say their
 * content had been deleted. That is the failure `@4dl/purge` exists for, and it
 * is invisible by construction: a purge swallows every delete error, because an
 * older database may legitimately be missing a table.
 *
 * `tenantCascade(SCHEMA_MODULES)` computes the list from the `scoped`
 * declaration that sits beside each module's DDL, so a table is swept because
 * the module that creates it says who owns its rows. `media_assets` — which
 * arrived with `@4dl/storage` in Stage 5 — is swept from the day it exists,
 * with nobody having to remember. `apps/scena/test/purge-cascade.test.ts` fails
 * on a table that carries a scope column and declares none.
 *
 * ── What the package does NOT do ───────────────────────────────────────────
 *
 * Everything with a side effect outside D1 is the app's, and Scena has four:
 * the R2 objects behind the media ledger, the credit Durable Object, the KV
 * entries keyed by tenant or by a row about to be deleted, and the Stripe
 * subscription. This module owns those.
 */

import { nowIso } from "@4dl/core";
import { applyCascade, tenantCascade } from "@4dl/purge";
import { SCHEMA_MODULES } from "./db.js";
import type { Env } from "./env.js";

/**
 * The cascade, derived once at module load.
 *
 * Every step carries its OWN column. Scena's tables and all four packages' key
 * a workspace as `tenant_id`, except auth's `member`/`invitation`, which use
 * `organizationId` — the exact case a hand-written loop gets wrong, because it
 * interpolates the table and hard-codes the column.
 */
const TENANT_CASCADE = tenantCascade(SCHEMA_MODULES);

/** Swallow — a purge must not stop at the first table an old database lacks. */
async function run(db: D1Database, sql: string, ...binds: unknown[]): Promise<void> {
  await db.prepare(sql).bind(...binds).run().catch(() => undefined);
}

/** What an erasure actually reclaimed, so the caller can report it. */
export interface PurgeResult {
  /** D1 tables the cascade touched. */
  tables: number;
  /** R2 objects removed (excludes bytes another workspace still references). */
  objects: number;
  /** Live ledger bytes released — what the storage meter drops by. */
  bytesFreed: number;
  /** KV entries removed. */
  kvKeys: number;
}

/**
 * The content hash is the last 64 characters of a ledger key.
 *
 * `substr(r2_key, -64)` rather than a `LIKE '%:<hash>'` pattern, twice over:
 * D1 caps a LIKE pattern at 50 characters and a SHA-256 is 64, so the pattern
 * form raises "LIKE or GLOB pattern too complex" the moment a row exists to
 * test it — and it only raises then, so an empty table passes.
 */
const HASH_OF_KEY = "substr(r2_key, -64)";

/**
 * Release every object this workspace referenced.
 *
 * Driven off the LEDGER, not off a bucket listing, because the key is a content
 * hash: there is nothing in an R2 key that says which workspace it belongs to.
 * That is also why the shared set is computed first — two workspaces that
 * uploaded the same file share one object, and erasing one must not blank the
 * other's slide.
 *
 * ⚠️ This is the ONE place outside `storage.ts` that touches `MEDIA` directly,
 * and `scripts/storage-chokepoint.test.mjs` names it. Going through
 * `releaseAsset` per row would be one R2 call and one D1 statement EACH, which
 * for a workspace holding thousands of assets is thousands of subrequests
 * against a Worker's budget — a purge that dies half-way is worse than one that
 * batches. R2 deletes 1,000 keys per call; the ledger is tombstoned in one
 * UPDATE, which the cascade then deletes outright.
 */
async function releaseMedia(env: Env, tenantId: string): Promise<{ objects: number; bytesFreed: number }> {
  const mine = await env.DB
    .prepare(`SELECT ${HASH_OF_KEY} AS hash, size_bytes FROM media_assets WHERE tenant_id = ? AND deleted_at IS NULL`)
    .bind(tenantId)
    .all<{ hash: string; size_bytes: number }>()
    .catch(() => null);
  const rows = mine?.results ?? [];
  if (!rows.length) return { objects: 0, bytesFreed: 0 };

  // One query for the whole shared set, not one per asset.
  const shared = await env.DB
    .prepare(
      `SELECT DISTINCT ${HASH_OF_KEY} AS hash FROM media_assets
       WHERE tenant_id <> ? AND deleted_at IS NULL
         AND ${HASH_OF_KEY} IN (SELECT ${HASH_OF_KEY} FROM media_assets WHERE tenant_id = ? AND deleted_at IS NULL)`,
    )
    .bind(tenantId, tenantId)
    .all<{ hash: string }>()
    .catch(() => null);
  const stillUsed = new Set((shared?.results ?? []).map((r) => r.hash));

  const bytesFreed = rows.reduce((n, r) => n + (r.size_bytes ?? 0), 0);
  const doomed = [...new Set(rows.map((r) => r.hash).filter((h) => !stillUsed.has(h)))];
  for (let i = 0; i < doomed.length; i += 1000) {
    await env.MEDIA.delete(doomed.slice(i, i + 1000)).catch(() => undefined);
  }
  return { objects: doomed.length, bytesFreed };
}

/**
 * KV entries that belong to this workspace, removed before the rows that name
 * them are gone.
 *
 * ⚠️ ORDER MATTERS, and it is the reason this runs first. A screen's pairing
 * code and a channel's manifest pointer are keyed by the ROW's id, not the
 * tenant's — so once the cascade has deleted `screens` and `channels` there is
 * no way left to find them, and they sit in KV until their TTL (a day for a
 * pairing code; never, for a manifest pointer).
 */
async function purgeKv(env: Env, tenantId: string): Promise<number> {
  let removed = 0;
  const drop = async (key: string) => {
    await env.PAIRING.delete(key).catch(() => undefined);
    removed++;
  };

  // Keyed by the tenant directly.
  await drop(`emergency:active:${tenantId}`);

  // Keyed by a row this purge is about to delete. `manifest:cur:<channel>` has
  // NO expiry — left behind it is a permanent pointer to a version history that
  // no longer exists.
  const channels = await env.DB.prepare("SELECT id FROM channels WHERE tenant_id = ?").bind(tenantId).all<{ id: string }>().catch(() => null);
  for (const c of channels?.results ?? []) await drop(`manifest:cur:${c.id}`);

  /*
    Pairing codes (`pair:<code>`) are deliberately NOT swept.

    A code is minted before any row exists — `POST /api/screen/new` reserves a
    ScreenDO and writes the KV entry, and the `screens` row appears only when a
    device claims it — so nothing in D1 maps a workspace to its outstanding
    codes. It also does not matter: the entry is single-use and carries a 24-hour
    TTL, and what it resolves to is a Durable Object id whose storage this purge
    does not reach either. Sweeping the ones we could find would leave the
    unclaimed ones behind and read as complete.
  */

  return removed;
}

/* ================================ LEAVING ================================= */

/**
 * How long a closed workspace can change its mind.
 *
 * A close is irreversible the moment the sweep reaches it, and the one thing
 * people get wrong about closing an account is which account they were signed
 * into. The window is the difference between a mistake and a loss; the screens
 * go dark immediately either way, which is the signal that it worked.
 */
const CLOSE_GRACE_DAYS = 7;

/**
 * Schedule a workspace's own closure.
 *
 * `closing` is a rung of its own rather than a reuse of `suspended`, and the
 * distinction is not cosmetic: suspension is something Scena did to a workspace
 * over an unpaid invoice, and it is escapable by paying. This is something the
 * owner did, deliberately, and paying is not the way back — cancelling is. The
 * sweep treats them differently for exactly that reason.
 */
export async function scheduleTenantClose(env: Env, tenantId: string): Promise<{ deleteAt: string }> {
  const at = Date.now() + CLOSE_GRACE_DAYS * 86_400_000;
  // Epoch milliseconds, because that is what this app's `subscriptions` columns
  // hold — Tessa's are ISO strings and the shared route only ever echoes what it
  // is handed, so the two apps disagree here on purpose rather than by accident.
  await run(env.DB, "UPDATE subscriptions SET status = 'closing', suspend_at = ?, delete_at = ? WHERE tenant_id = ?", nowIso(), new Date(at).toISOString(), tenantId);
  return { deleteAt: new Date(at).toISOString() };
}

/** Undo a pending close inside the window. The workspace stays; billing has to
 *  be re-established separately, because the subscription was already ended. */
export async function cancelTenantClose(env: Env, tenantId: string): Promise<void> {
  await run(env.DB, "UPDATE subscriptions SET status = 'active', suspend_at = NULL, delete_at = NULL WHERE tenant_id = ? AND status = 'closing'", tenantId);
}

/** True when this user runs any workspace. An owner cannot self-delete out from
 *  under one — they close it, which stops the billing and wipes the tenant. */
export async function isOwnerAnywhere(db: D1Database, userId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS x FROM "member" WHERE userId = ? AND role = ? LIMIT 1')
    .bind(userId, "owner")
    .first<{ x: number }>()
    .catch(() => null);
  return !!row;
}

/**
 * Erase a USER — the person, not the workspace.
 *
 * Guarded by the caller: never reached while this user still owns a workspace,
 * because deleting an owner would leave a workspace nobody can administer, still
 * billing, with screens still playing.
 *
 * ⚠️ `board_users.user_id` IS NULLED, NOT DELETED, and that is the one judgement
 * in here. A station is a LOGIN THAT BELONGS TO A BOARD, provisioned on the Live
 * Boards screen and shared by whoever is at the counter — it is not the person
 * asking to be forgotten, even though the row points at a `user` row this purge
 * removes. Deleting the `board_users` row would take a working counter offline
 * because somebody who once provisioned it left; leaving the pointer dangling
 * would make the station un-re-provisionable. Nulling it detaches the identity
 * and leaves the station to be re-issued a credential, which is what the screen
 * already does.
 */
export async function purgeUser(env: Env, userId: string): Promise<void> {
  await run(env.DB, "UPDATE board_users SET user_id = NULL WHERE user_id = ?", userId);
  for (const sql of [
    'DELETE FROM "member" WHERE userId = ?',
    'DELETE FROM "user" WHERE id = ?',
    'DELETE FROM "session" WHERE userId = ?',
    'DELETE FROM "account" WHERE userId = ?',
    'DELETE FROM "passkey" WHERE userId = ?',
    "DELETE FROM user_prefs WHERE user_id = ?",
    "DELETE FROM digest_sent WHERE user_id = ?",
    "DELETE FROM notifications WHERE recipient_user_id = ?",
    "DELETE FROM action_otps WHERE subject = ?",
  ]) await run(env.DB, sql, userId);
  // The inbox is a Durable Object, which no D1 delete reaches — and a DO cannot
  // be enumerated, so if it is not wiped here it is never wiped at all.
  await env.INBOX.get(env.INBOX.idFromName(userId)).wipe().catch(() => undefined);
}

/**
 * The workspace's rows in `app_config`, which the derived cascade cannot see.
 *
 * `app_config` is a global key-value table: a per-workspace setting lives there
 * as `<setting>:<tenantId>`, with the tenancy glued onto the KEY rather than
 * held in a column. `tenantCascade` works from a `scoped` declaration naming a
 * column, so there is nothing for it to match on and the rows survive an
 * erasure that reports success — the same shape of hole the hand-written table
 * list was.
 *
 * A suffix match is the only handle there is, and it is exact: `LIKE '%:' || ?`
 * with no wildcard after the id, so `tenant_a` cannot take `tenant_ab`'s rows
 * with it. Today that is the playback preference, the per-task AI model pin and
 * a pre-platform brand kit that has not been re-saved yet; tomorrow it is
 * whatever else gets keyed this way, which is the point of sweeping the shape
 * rather than a list.
 */
async function purgeConfigRows(env: Env, tenantId: string): Promise<void> {
  await run(env.DB, "DELETE FROM app_config WHERE key LIKE '%:' || ?", tenantId);
}

/**
 * Erase a workspace's data. Destructive and irreversible.
 *
 * Billing rows are DELIBERATELY not exempt any more, and that is a change worth
 * being explicit about: the old note said "billing rows (subscription, ledger)
 * are retained for the record", but `subscriptions` and `credit_ledger` are both
 * in `scoped.tenantTables`, so the declaration and the code disagreed about
 * whether a deleted workspace keeps its billing history. The declaration wins —
 * it is what the GDPR story is written against — and the caller re-opens a
 * `subscriptions` row afterwards where the lifecycle needs one, which is an
 * explicit act rather than a survival.
 */
export async function purgeTenant(env: Env, tenantId: string): Promise<PurgeResult> {
  const kvKeys = await purgeKv(env, tenantId);
  const { objects, bytesFreed } = await releaseMedia(env, tenantId);

  await applyCascade(TENANT_CASCADE, tenantId, (sql, id) => run(env.DB, sql, id));
  await purgeConfigRows(env, tenantId);

  // The credit balance lives in a Durable Object, which no D1 delete reaches —
  // and a DO cannot be enumerated, so if this is not called here it is never
  // called at all. A workspace re-created under the same id would otherwise
  // inherit the deleted one's balance.
  await env.BILLING.get(env.BILLING.idFromName(tenantId))
    .wipe()
    .catch(() => undefined);

  return { tables: TENANT_CASCADE.length, objects, bytesFreed, kvKeys };
}
