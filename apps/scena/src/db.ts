import { schemaGate, type SchemaModule } from "@4dl/core";
import { AI_SCHEMA } from "@4dl/ai";
import { AUTH_SCHEMA } from "@4dl/auth";
import { TENANCY_SCHEMA } from "@4dl/tenancy";
import { BILLING_RAIL_SCHEMA } from "@4dl/billing-rail/schema";
import { NOTIFY_SCHEMA } from "@4dl/notify";
import { STORAGE_SCHEMA } from "@4dl/storage";
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


/**
 * Clear the three PRE-MIGRATION AI tables out of the way, once.
 *
 * See the entry for it in `SCHEMA_MODULES` below for the whole argument — what
 * is lost, why that is acceptable here, and why the version must never move.
 *
 * They are `backfills` rather than `ddl` on purpose: the runner applies a
 * backfill on its own and swallows a failure with a named log line, which is
 * exactly right for a statement that is a no-op on every database created after
 * the migration. `ddl` is asserted to be `CREATE … IF NOT EXISTS` by
 * `schema-module.test.ts`, and widening that assertion to admit `DROP TABLE`
 * would open the door to a destructive statement in any module.
 */
const AI_LEGACY_RESET: SchemaModule = {
  id: "scena_ai_legacy_reset",
  version: "1",
  backfills: [
    { name: "drop pre-migration ai_models", sql: "DROP TABLE IF EXISTS ai_models" },
    { name: "drop pre-migration ai_cache", sql: "DROP TABLE IF EXISTS ai_cache" },
    { name: "drop pre-migration ai_generations", sql: "DROP TABLE IF EXISTS ai_generations" },
  ],
};

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
 * This list is the migration's progress bar. Scena's module still carries the
 * billing/AI/media catalogs because it owns them today — each moves OUT to its
 * package as that stage lands (`BILLING_SCHEMA` in Stage 4, and so on), and the
 * diff that removes a table from `SCENA_SCHEMA` is the same diff that adds its
 * package here. `docs/SCENA-REWRITE.md` has the order.
 *
 * ⚠️ ORDER IS DEPENDENCY ORDER, and auth is first for a reason: the app's
 * backfills may read `"member"` and `"organization"`, and nothing in auth reads
 * a Scena table. SQLite does not enforce foreign keys here, so a wrong order
 * does not fail — it produces a backfill that quietly updates nothing.
 *
 * `AUTH_SCHEMA` also brings THREE tables Scena never had: `"passkey"`,
 * `auth_logs` (the audit trail and the rate limiter's backing store) and
 * `action_otps` (step-up confirmation). They arrive with the module rather than
 * needing to be remembered.
 *
 * `schemaGate` supplies the per-isolate memo and the retry-on-failure that this
 * file used to hand-roll, and short-circuits on a marker row PER MODULE — so a
 * change to Scena's DDL does not re-run auth's.
 */
export const SCHEMA_MODULES: readonly SchemaModule[] = [
  AUTH_SCHEMA,
  TENANCY_SCHEMA,
  /*
    ⚠️ `BILLING_SCHEMA` IS DELIBERATELY ABSENT, and it is not an oversight.

    Its `plans`, `subscriptions`, `credit_packs` and `credit_ledger` have
    different COLUMNS from Scena's — `price_usd_month REAL` against
    `price_cents INTEGER` + `currency` + `interval`, `at` against `created_at`,
    TEXT timestamps against INTEGER. A `CREATE TABLE IF NOT EXISTS` is won by
    whichever module runs first, and the loser's columns silently never exist:
    the exact shape of the `app_config.updated_at` regression that made a fresh
    Stage 1 deployment unable to save any setting.

    The rail is additive (`rail_parked_events` only), so it comes in now. The
    STORE moves when its 1,000 lines of queries do.
  */
  BILLING_RAIL_SCHEMA,
  /*
    `media_assets` — the ledger behind every stored object.

    Purely ADDITIVE: Scena had no storage table at all, so there is nothing to
    collide with. It arrives with its `scoped` declaration, which is what lets
    `@4dl/purge` find a workspace's files in Stage 6 without walking the bucket.
  */
  STORAGE_SCHEMA,
  /*
    `notifications`, `user_prefs`, `digest_sent` — and one ALTER that is the
    reason this entry sits AFTER tenancy rather than anywhere convenient:
    `NOTIFY_SCHEMA` adds `notif_policy_json` to `tenant_settings`, which
    `@4dl/tenancy` creates. Run first, the ALTER hits a table that does not
    exist, the runner swallows it, and an owner's email veto silently never
    persists. Ordering in this list IS dependency order.
  */
  NOTIFY_SCHEMA,
  /*
    `ai_models`, `ai_cache`, `ai_generations`, `insight_feedback`.

    ⚠️ IT MUST RUN BEFORE `SCENA_SCHEMA`, and the reason is the one this list has
    a scar from. Scena declared the first three itself with different columns, and
    a `CREATE TABLE IF NOT EXISTS` is won by whichever module runs first — so on a
    database created before this migration the OLD shape is already there and the
    shared statements do nothing, including nothing about the columns the shared
    queries name. Scena's declarations are gone (see `schema.ts`), which is what
    makes the order safe rather than merely conventional; the position keeps it
    true if anybody ever adds an AI table back to the app's module by mistake.

    `insight_feedback` arrives unused — Scena collects no thumbs on generated
    output today. It is four columns and it comes with the module rather than
    needing to be remembered when the feature lands.
  */
  /*
    ⚠️ AND THIS IS WHAT MAKES THAT ORDERING ACTUALLY WORK ON AN EXISTING
    DATABASE. Read this before touching `AI_LEGACY_RESET`.

    The comment above says the shared statements "do nothing" against the old
    shape. That was optimistic. `CREATE TABLE IF NOT EXISTS` does nothing, but
    `AI_SCHEMA` also declares `CREATE INDEX IF NOT EXISTS idx_aigen_tenant ON
    ai_generations(tenant_id, at)` — and Scena's `ai_generations` had
    `created_at`, not `at`. The index therefore fails with
    `no such column: at`, `applySchema` throws, and `ensureSchema` throws with
    it. Every route that touches D1 500s, including `/api/billing`, the plan
    picker and the whole dashboard. It is a total outage on any database created
    before the catalog migration, and it is not hypothetical: the E2E suite's
    own `.wrangler` state reproduced it exactly.

    A `CREATE TABLE IF NOT EXISTS` cannot rename a column, so the three tables
    have to go before the shared module builds them. DROPPING them is a
    deliberate, destructive choice and it is the right one HERE, for reasons
    specific to what they hold:

      ai_models        a CATALOG, reseeded from `SCENA_MODEL_FLOOR` and the
                       shared published rates on the next admin read. The only
                       loss is per-row `enabled`/`is_default`/`markup` edits.
      ai_cache         a CACHE. Losing it costs one regeneration.
      ai_generations   an audit trail of AI spend. This is the real loss, and it
                       is accepted: Scena has no live workspaces, and the
                       alternative is a product that does not boot.

    ⚠️ NEVER BUMP THIS VERSION. The marker row is what stops it running twice,
    and a bump would drop a live catalog to fix nothing — the tables are already
    the shared shape after the first run. If a future migration needs the same
    treatment, add a NEW module with a new id.
  */
  AI_LEGACY_RESET,
  AI_SCHEMA,
  SCENA_SCHEMA,
];

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
