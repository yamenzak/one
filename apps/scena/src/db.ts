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

/** Single-tenant demo: everything hangs off one owner account for now (§4). */
export const DEMO_TENANT = "tenant_demo";

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

let schemaReady: Promise<void> | null = null;

export function ensureSchema(db: D1Database): Promise<void> {
  if (!schemaReady) {
    schemaReady = db
      .exec(
        [
          "CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, email TEXT, name TEXT, created_at INTEGER);",
          // Devices (screens). channel_id is the active/default channel; a device
          // may carry several via device_channels. width/height/orientation are the
          // device's detected resolution — the design space children scale from.
          "CREATE TABLE IF NOT EXISTS screens (id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, channel_id TEXT, status TEXT, paired_at INTEGER, last_seen INTEGER, width INTEGER, height INTEGER, orientation TEXT, tags TEXT);",
          "CREATE TABLE IF NOT EXISTS boards (id TEXT PRIMARY KEY, tenant_id TEXT, kind TEXT, name TEXT, config_json TEXT, created_at INTEGER);",
          // Board-scoped users (§boards): auto-provisioned coordinator + per-option
          // station accounts that control one board. `station_id` NULL = coordinator.
          // `password` is the plaintext 6-char code (these are low-privilege, board-
          // only creds the admin must hand to staff); the hash lives in `account`.
          // Deleted (with their user/account/member rows) when the board is deleted.
          "CREATE TABLE IF NOT EXISTS board_users (id TEXT PRIMARY KEY, tenant_id TEXT, board_id TEXT, station_id TEXT, kind TEXT, label TEXT, user_id TEXT, username TEXT, password TEXT, created_at INTEGER);",
          // Proof-of-play (§22). event_id is the PK so replays dedupe on insert.
          "CREATE TABLE IF NOT EXISTS playout_events (event_id TEXT PRIMARY KEY, tenant_id TEXT, screen_id TEXT, channel_id TEXT, content_id TEXT, kind TEXT, ts INTEGER, duration_ms INTEGER);",
          // Content authoring (§4, §5). A channel now COMPOSES reusable entities
          // by reference: a slide playlist + a music playlist + a widget profile.
          // Each is a first-class tenant-owned entity, so updating one reflects on
          // every channel that references it. Legacy channel-owned slides/tracks/
          // widgets still resolve when the reference columns are null (back-compat).
          "CREATE TABLE IF NOT EXISTS channels (id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, default_duration_ms INTEGER, transition TEXT, created_at INTEGER, slide_playlist_id TEXT, music_playlist_id TEXT, widget_profile_id TEXT, tags TEXT);",
          // Reusable slide playlists (image · video · html · ai). Shared across channels.
          "CREATE TABLE IF NOT EXISTS slide_playlists (id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, default_duration_ms INTEGER, transition TEXT, created_at INTEGER, tags TEXT);",
          // Media Library (§4b): a tenant-owned catalog of every uploaded/generated
          // asset (image/gif/video) + HTML sandbox. Slides copy the hash/body they
          // need, so deleting a playlist never removes library content.
          "CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, tenant_id TEXT, kind TEXT, name TEXT, asset_hash TEXT, asset_url TEXT, html_body TEXT, mime TEXT, bytes INTEGER, width INTEGER, height INTEGER, duration_ms INTEGER, created_at INTEGER, tags TEXT);",
          // Reusable music playlists.
          "CREATE TABLE IF NOT EXISTS music_playlists (id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, shuffle INTEGER, created_at INTEGER);",
          // Reusable widget profiles (a scene graph authored at a design resolution,
          // scaled to each device). widgets_json holds the layer.
          "CREATE TABLE IF NOT EXISTS widget_profiles (id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, design_w INTEGER, design_h INTEGER, widgets_json TEXT, created_at INTEGER);",
          // Multi-channel devices: a device can carry several channels (the active
          // one chosen by dayparting or a manual switch). ord is the display order.
          "CREATE TABLE IF NOT EXISTS device_channels (device_id TEXT, channel_id TEXT, ord INTEGER, PRIMARY KEY (device_id, channel_id));",
          // Versioning & rollback (§10): every publish appends an immutable,
          // content-hashed manifest snapshot; a KV pointer marks the live one.
          "CREATE TABLE IF NOT EXISTS manifest_versions (id TEXT PRIMARY KEY, channel_id TEXT, version INTEGER, hash TEXT, note TEXT, published_by TEXT, created_at INTEGER, manifest_json TEXT);",
          // Slides belong to a slide_playlist (playlist_id); channel_id is the
          // legacy owner kept for back-compat. type adds 'video' (uploaded).
          "CREATE TABLE IF NOT EXISTS slides (id TEXT PRIMARY KEY, channel_id TEXT, playlist_id TEXT, ord INTEGER, type TEXT, asset_hash TEXT, asset_url TEXT, html_body TEXT, duration_ms INTEGER, fit TEXT, clip_start_ms INTEGER, loop INTEGER);",
          // Per-device scheduling (§13): each screen is scheduled independently.
          // A rule's `kind` selects the track: channel (daypart → channel_id),
          // mute (window ⇒ audio muted), or saver (window ⇒ screensaver/sleep).
          // The device's timezone lives on the screens row (screens.tz).
          "CREATE TABLE IF NOT EXISTS device_schedule_rules (id TEXT PRIMARY KEY, screen_id TEXT, kind TEXT, priority INTEGER, days_csv TEXT, start_min INTEGER, end_min INTEGER, channel_id TEXT, created_at INTEGER);",
          // Feeds (§19): a source + its items, bound to ticker/text widgets.
          "CREATE TABLE IF NOT EXISTS feeds (id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, provider TEXT, config_json TEXT, refresh_sec INTEGER, updated_at INTEGER);",
          // Weather (§17): a location source (server-fetched from OpenWeather One
          // Call on a cron) + its cached normalized conditions. The API key lives
          // in app_config, never on screens.
          "CREATE TABLE IF NOT EXISTS weather_sources (id TEXT PRIMARY KEY, tenant_id TEXT, label TEXT, lat REAL, lon REAL, refresh_sec INTEGER, created_at INTEGER);",
          "CREATE TABLE IF NOT EXISTS weather_cache (source_id TEXT PRIMARY KEY, data_json TEXT, updated_at INTEGER);",
          "CREATE TABLE IF NOT EXISTS feed_items (id TEXT PRIMARY KEY, feed_id TEXT, ord INTEGER, title TEXT, link TEXT, updated_at INTEGER);",
          // Health alerting (§23): rules + an append-only alert log.
          "CREATE TABLE IF NOT EXISTS alert_rules (id TEXT PRIMARY KEY, tenant_id TEXT, type TEXT, threshold_sec INTEGER, channel TEXT, target TEXT, enabled INTEGER);",
          "CREATE TABLE IF NOT EXISTS alerts (id TEXT PRIMARY KEY, tenant_id TEXT, screen_id TEXT, type TEXT, message TEXT, at INTEGER, resolved_at INTEGER);",
          // Monetization (§25): plans + entitlements, per-tenant subscription,
          // one-time credit packs, and the append-only credit ledger (mirror of
          // the TenantBillingDO ledger, for invoices).
          "CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, name TEXT, price_cents INTEGER, currency TEXT, interval TEXT, entitlements_json TEXT, stripe_product_id TEXT, stripe_price_id TEXT, sort INTEGER, active INTEGER, created_at INTEGER);",
          "CREATE TABLE IF NOT EXISTS subscriptions (tenant_id TEXT PRIMARY KEY, plan_id TEXT, status TEXT, comp INTEGER, stripe_customer_id TEXT, stripe_sub_id TEXT, pending_plan_id TEXT, current_period_end INTEGER, past_due_at INTEGER, suspend_at INTEGER, delete_at INTEGER, updated_at INTEGER, overrides_json TEXT);",
          "CREATE TABLE IF NOT EXISTS credit_packs (id TEXT PRIMARY KEY, name TEXT, credits INTEGER, price_cents INTEGER, currency TEXT, stripe_product_id TEXT, stripe_price_id TEXT, sort INTEGER, active INTEGER);",
          "CREATE TABLE IF NOT EXISTS credit_ledger (id TEXT PRIMARY KEY, tenant_id TEXT, delta INTEGER, balance INTEGER, reason TEXT, ref TEXT, created_at INTEGER);",
          // Promo codes (§25 gifting/demo): redeemable for credits or a comped plan.
          "CREATE TABLE IF NOT EXISTS promo_codes (code TEXT PRIMARY KEY, kind TEXT, credits INTEGER, plan_id TEXT, plan_months INTEGER, max_redemptions INTEGER, redeemed_count INTEGER, per_tenant_limit INTEGER, expires_at INTEGER, note TEXT, active INTEGER, created_at INTEGER);",
          "CREATE TABLE IF NOT EXISTS promo_redemptions (id TEXT PRIMARY KEY, code TEXT, tenant_id TEXT, kind TEXT, credits INTEGER, plan_id TEXT, redeemed_at INTEGER);",
          // Workers AI catalog + markup (§24), admin-editable neuron rate table.
          "CREATE TABLE IF NOT EXISTS ai_models (id TEXT PRIMARY KEY, label TEXT, task TEXT, cf_model TEXT, input_rate REAL, output_rate REAL, unit_rate REAL, unit_kind TEXT, markup REAL, enabled INTEGER, sort INTEGER);",
          // AI generation cache (by prompt hash) + audit log.
          "CREATE TABLE IF NOT EXISTS ai_cache (hash TEXT PRIMARY KEY, task TEXT, model TEXT, output TEXT, asset_hash TEXT, neurons REAL, created_at INTEGER);",
          "CREATE TABLE IF NOT EXISTS ai_generations (id TEXT PRIMARY KEY, tenant_id TEXT, task TEXT, model TEXT, prompt TEXT, neurons REAL, credits INTEGER, output_ref TEXT, created_at INTEGER);",
          // Admin-editable key/value config (Stripe keys, dunning windows, markup).
          "CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER);",
          // Ads & interrupts (§21): scheduled interrupts (audio / video / command),
          // fired epoch-stamped via the ChannelDO alarm. Ads belong to a reusable
          // ad_profile (profile_id); a channel binds a profile (channels.ad_profile_id)
          // so many channels share one rotation.
          "CREATE TABLE IF NOT EXISTS ads (id TEXT PRIMARY KEY, tenant_id TEXT, profile_id TEXT, name TEXT, kind TEXT, audio_url TEXT, video_url TEXT, html TEXT, duration_ms INTEGER, every_min INTEGER, mode TEXT, enabled INTEGER, created_at INTEGER, hide_badge INTEGER);",
          // Reusable ad profiles: a named rotation of ads, shared across channels.
          "CREATE TABLE IF NOT EXISTS ad_profiles (id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, created_at INTEGER, tags TEXT);",
          // Music subsystem (§16): a channel's ordered tracks, concatenated into
          // the clock-synced music timeline. Audio lives in R2 by content hash.
          // library_id ties a track to a shared-library entry (for usage limits).
          // Tracks belong to a music_playlist (playlist_id); channel_id is legacy.
          "CREATE TABLE IF NOT EXISTS tracks (id TEXT PRIMARY KEY, tenant_id TEXT, channel_id TEXT, playlist_id TEXT, ord INTEGER, title TEXT, asset_hash TEXT, asset_url TEXT, duration_ms INTEGER, created_at INTEGER, library_id TEXT, artist TEXT, art_hash TEXT, art_url TEXT);",
          // Admin-curated licensed music library (global, not tenant-scoped):
          // upload once, browse by genre, add into a channel playlist by reference.
          "CREATE TABLE IF NOT EXISTS library_tracks (id TEXT PRIMARY KEY, genre TEXT, title TEXT, artist TEXT, asset_hash TEXT, asset_url TEXT, duration_ms INTEGER, created_at INTEGER, art_hash TEXT, art_url TEXT);",
          // Auth & multi-tenancy (Better Auth). Column names/types mirror Better
          // Auth's own SQLite schema (string→TEXT, boolean→INTEGER, date→DATE) so
          // its adapter reads/writes them 1:1. An `organization` IS a Scena tenant;
          // `session.activeOrganizationId` (organization plugin) is the tenant id.
          'CREATE TABLE IF NOT EXISTS "user" (id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, emailVerified INTEGER, image TEXT, createdAt DATE, updatedAt DATE);',
          'CREATE TABLE IF NOT EXISTS "session" (id TEXT PRIMARY KEY, expiresAt DATE, token TEXT UNIQUE, createdAt DATE, updatedAt DATE, ipAddress TEXT, userAgent TEXT, userId TEXT, activeOrganizationId TEXT);',
          'CREATE TABLE IF NOT EXISTS "account" (id TEXT PRIMARY KEY, accountId TEXT, providerId TEXT, userId TEXT, accessToken TEXT, refreshToken TEXT, idToken TEXT, accessTokenExpiresAt DATE, refreshTokenExpiresAt DATE, scope TEXT, password TEXT, createdAt DATE, updatedAt DATE);',
          'CREATE TABLE IF NOT EXISTS "verification" (id TEXT PRIMARY KEY, identifier TEXT, value TEXT, expiresAt DATE, createdAt DATE, updatedAt DATE);',
          'CREATE TABLE IF NOT EXISTS "organization" (id TEXT PRIMARY KEY, name TEXT, slug TEXT UNIQUE, logo TEXT, createdAt DATE, metadata TEXT);',
          'CREATE TABLE IF NOT EXISTS "member" (id TEXT PRIMARY KEY, organizationId TEXT, userId TEXT, role TEXT, permissions_json TEXT, createdAt DATE);',
          'CREATE TABLE IF NOT EXISTS "invitation" (id TEXT PRIMARY KEY, organizationId TEXT, email TEXT, role TEXT, status TEXT, expiresAt DATE, inviterId TEXT, createdAt DATE);',
        ].join(" "),
      )
      .then(async () => {
        // Best-effort migrations for columns added after a table first shipped;
        // each is harmless (and ignored) once the column is present.
        await db.exec("ALTER TABLE tracks ADD COLUMN library_id TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE ads ADD COLUMN hide_badge INTEGER").catch(() => undefined);
        await db.exec("ALTER TABLE ads ADD COLUMN companion_url TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE tracks ADD COLUMN artist TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE tracks ADD COLUMN art_hash TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE tracks ADD COLUMN art_url TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE library_tracks ADD COLUMN art_hash TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE library_tracks ADD COLUMN art_url TEXT").catch(() => undefined);
        // Per-tenant entitlement overrides (admin gifts on top of the plan, §25).
        await db.exec("ALTER TABLE subscriptions ADD COLUMN overrides_json TEXT").catch(() => undefined);
        await db.exec('ALTER TABLE "member" ADD COLUMN permissions_json TEXT').catch(() => undefined);
        // Reusable-entities restructure: channels reference playlists + a profile;
        // slides/tracks gain playlist_id; devices gain a detected resolution.
        await db.exec("ALTER TABLE channels ADD COLUMN slide_playlist_id TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE channels ADD COLUMN music_playlist_id TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE channels ADD COLUMN widget_profile_id TEXT").catch(() => undefined);
        // Ad profiles: a channel binds a reusable ad rotation; ads gain a profile_id.
        await db.exec("ALTER TABLE channels ADD COLUMN ad_profile_id TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE ads ADD COLUMN profile_id TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE slides ADD COLUMN playlist_id TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE tracks ADD COLUMN playlist_id TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE screens ADD COLUMN width INTEGER").catch(() => undefined);
        await db.exec("ALTER TABLE screens ADD COLUMN height INTEGER").catch(() => undefined);
        await db.exec("ALTER TABLE screens ADD COLUMN orientation TEXT").catch(() => undefined);
        // Per-device schedule timezone (dayparting/mute/saver windows, §13).
        await db.exec("ALTER TABLE screens ADD COLUMN tz TEXT").catch(() => undefined);
        // Freeform tags (JSON array) for organizing + filtering channels/devices.
        await db.exec("ALTER TABLE channels ADD COLUMN tags TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE screens ADD COLUMN tags TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE slide_playlists ADD COLUMN tags TEXT").catch(() => undefined);
        // Per-slide presentation: how media fills the 16:9 frame (contain/cover/fill).
        await db.exec("ALTER TABLE slides ADD COLUMN fit TEXT").catch(() => undefined);
        // Video/gif playback: seek offset (trim start) + loop flag (loop vs play-once).
        await db.exec("ALTER TABLE slides ADD COLUMN clip_start_ms INTEGER").catch(() => undefined);
        await db.exec("ALTER TABLE slides ADD COLUMN loop INTEGER").catch(() => undefined);
        // Music-in-media-library (§4b/§16): audio is a first-class media kind, so
        // uploads/generations land in the durable catalog alongside images/video.
        // Rich audio meta lives on the media row (the source of truth); playlists
        // copy a snapshot. `source` badges provenance for licensing (upload/ai/public).
        await db.exec("ALTER TABLE media ADD COLUMN artist TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE media ADD COLUMN album TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE media ADD COLUMN genres TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE media ADD COLUMN vocal TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE media ADD COLUMN art_hash TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE media ADD COLUMN art_url TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE media ADD COLUMN source TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE media ADD COLUMN library_id TEXT").catch(() => undefined);
        // Track meta snapshot (§16): genres/vocal/album + a link back to the media row.
        await db.exec("ALTER TABLE tracks ADD COLUMN genres TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE tracks ADD COLUMN vocal TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE tracks ADD COLUMN album TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE tracks ADD COLUMN media_id TEXT").catch(() => undefined);
        // Music playlists gain freeform tags (parity with slide playlists).
        await db.exec("ALTER TABLE music_playlists ADD COLUMN tags TEXT").catch(() => undefined);
        // Public library tracks can be tagged vocal/instrumental.
        await db.exec("ALTER TABLE library_tracks ADD COLUMN vocal TEXT").catch(() => undefined);
        // Dynamic sources (§sources): feeds gain a cached normalized dataset
        // ({columns,rows} JSON) + its fetch time, so api/gsheet providers cache
        // like weather. `data_at` drives per-source refresh_sec staleness.
        await db.exec("ALTER TABLE feeds ADD COLUMN data_json TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE feeds ADD COLUMN data_at INTEGER").catch(() => undefined);
        // Weather-as-a-source (§17): company-provided, metered per real fetch.
        // Each location polls once/hour only within its opening-hours window
        // [open_hour, close_hour) in tz, so a shop isn't billed overnight. units
        // is per-location now (was a global setting).
        await db.exec("ALTER TABLE weather_sources ADD COLUMN open_hour INTEGER").catch(() => undefined);
        await db.exec("ALTER TABLE weather_sources ADD COLUMN close_hour INTEGER").catch(() => undefined);
        await db.exec("ALTER TABLE weather_sources ADD COLUMN tz TEXT").catch(() => undefined);
        await db.exec("ALTER TABLE weather_sources ADD COLUMN units TEXT").catch(() => undefined);
        // Global usernames (§auth): a user's login handle, unique across ALL
        // tenants so sign-in is just username+password (no workspace to type).
        // NULLs are allowed for legacy/real-email accounts (SQLite unique indexes
        // treat NULLs as distinct). Board-scoped users (§boards) also live here.
        await db.exec('ALTER TABLE "user" ADD COLUMN username TEXT').catch(() => undefined);
        await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS user_username_unique ON "user"(username)').catch(() => undefined);
        // Secondary indexes on the hot foreign keys every list/compile/poll path
        // filters by — without these each query is a full-table scan that degrades
        // as tenants accrue channels/slides/feeds/ads. IF NOT EXISTS = idempotent.
        await db.exec("CREATE INDEX IF NOT EXISTS idx_screens_tenant ON screens(tenant_id)").catch(() => undefined);
        await db.exec("CREATE INDEX IF NOT EXISTS idx_channels_tenant ON channels(tenant_id)").catch(() => undefined);
        await db.exec("CREATE INDEX IF NOT EXISTS idx_slides_channel ON slides(channel_id, ord)").catch(() => undefined);
        await db.exec("CREATE INDEX IF NOT EXISTS idx_slides_playlist ON slides(playlist_id, ord)").catch(() => undefined);
        await db.exec("CREATE INDEX IF NOT EXISTS idx_tracks_channel ON tracks(channel_id, ord)").catch(() => undefined);
        await db.exec("CREATE INDEX IF NOT EXISTS idx_feeds_tenant ON feeds(tenant_id)").catch(() => undefined);
        await db.exec("CREATE INDEX IF NOT EXISTS idx_feed_items_feed ON feed_items(feed_id, ord)").catch(() => undefined);
        await db.exec("CREATE INDEX IF NOT EXISTS idx_ads_profile ON ads(profile_id)").catch(() => undefined);
        await db.exec("CREATE INDEX IF NOT EXISTS idx_board_users_board ON board_users(board_id)").catch(() => undefined);
        await db.exec("CREATE INDEX IF NOT EXISTS idx_playout_events_tenant ON playout_events(tenant_id, ts)").catch(() => undefined);
      })
      .catch((err) => {
        schemaReady = null; // let a later request retry
        throw err;
      });
  }
  return schemaReady;
}

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
