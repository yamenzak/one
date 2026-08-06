/**
 * SCENA'S SCHEMA, as a `SchemaModule` on `@4dl/core`'s composed runner.
 *
 * This was one `db.exec([...])` re-run on every isolate, followed by 46
 * `ALTER … .catch(() => undefined)` lines. Both halves were doing real work and
 * both had a failure mode worth removing:
 *
 *   THE FULL RE-RUN — 44 `CREATE … IF NOT EXISTS` statements executed on the
 *   first request of every isolate, forever. Harmless and not free. The runner's
 *   marker row short-circuits the module once it is at version.
 *
 *   `.catch(() => undefined)` — the intent is "ignore a column that is already
 *   there", and it does that. It ALSO swallows a typo'd ALTER, an ALTER against
 *   a table that does not exist, and a genuine migration failure, reporting
 *   nothing in any of those cases. `@4dl/core` matches "duplicate column"
 *   specifically and raises `SchemaMigrationError` for anything else, so a
 *   broken migration is loud instead of invisible.
 *
 * ⚠️ Rules the runner's statements must satisfy, each asserted by
 * `schema-module.test.ts` because every one of them fails SILENTLY:
 *   - every `ddl` statement ends with `;` (they are joined with a SPACE — ten of
 *     Scena's `CREATE INDEX` lines had no terminator and would have concatenated
 *     into one malformed statement)
 *   - no `--` line comment (it swallows the rest of the batch)
 *   - no embedded newline
 *   - ALTERs live in `alters`, never in `ddl` — the runner applies them one at a
 *     time so it can tell "already there" from a real failure
 *   - **bump `version` whenever any of the three change**, or the marker
 *     short-circuits the module and the new statement never runs
 *
 * ── `scoped` is what makes erasure derivable ────────────────────────────────
 *
 * `@4dl/purge` derives a tenant cascade from this declaration, so a table listed
 * wrongly is a GDPR bug and a table left out is an orphan that outlives its
 * tenant forever. Two groups are deliberately absent from `tenantTables`:
 *
 *   THE PLATFORM CATALOG — `plans`, `credit_packs`, `promo_codes`, `ai_models`,
 *   `library_tracks`, `app_config`. Shared across every tenant; deleting one
 *   tenant must not touch them.
 *
 *   CACHES keyed by something other than a tenant — `ai_cache` (prompt hash),
 *   `weather_cache` (source id). They expire on their own.
 *
 * `tenants` is absent too: the row IS the tenant, and the runner's caller
 * deletes it last, after the cascade.
 */

import type { SchemaModule } from "@4dl/core";

/** Single-tenant demo: everything hangs off one owner account for now. */
export const DEMO_TENANT = "tenant_demo";

export const SCENA_SCHEMA: SchemaModule = {
  id: "scena",
  version: "2026-08-06b",
  ddl: [
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
    // Secondary indexes on the hot foreign keys every list/compile/poll path
    // filters by — without these each query is a full-table scan that degrades
    // as tenants accrue channels/slides/feeds/ads. IF NOT EXISTS = idempotent.
    "CREATE INDEX IF NOT EXISTS idx_screens_tenant ON screens(tenant_id);",
    "CREATE INDEX IF NOT EXISTS idx_channels_tenant ON channels(tenant_id);",
    "CREATE INDEX IF NOT EXISTS idx_slides_channel ON slides(channel_id, ord);",
    "CREATE INDEX IF NOT EXISTS idx_slides_playlist ON slides(playlist_id, ord);",
    "CREATE INDEX IF NOT EXISTS idx_tracks_channel ON tracks(channel_id, ord);",
    "CREATE INDEX IF NOT EXISTS idx_feeds_tenant ON feeds(tenant_id);",
    "CREATE INDEX IF NOT EXISTS idx_feed_items_feed ON feed_items(feed_id, ord);",
    "CREATE INDEX IF NOT EXISTS idx_ads_profile ON ads(profile_id);",
    "CREATE INDEX IF NOT EXISTS idx_board_users_board ON board_users(board_id);",
    "CREATE INDEX IF NOT EXISTS idx_playout_events_tenant ON playout_events(tenant_id, ts);",
    /*
      BETTER AUTH'S SEVEN TABLES, and the quoting is load-bearing.

      Every one is a RESERVED-ish identifier ("user", "session", "account",
      "member"…) so the SQL quotes them — which is why they arrived last in the
      port and nearly did not arrive at all: the first pass matched statements
      with a quote class that truncated at the `"` inside `"user"`, silently
      dropping all ten quoted statements. The pinned count is what noticed.

      ⚠️ These LEAVE in Stage 2, when `@4dl/auth`'s AUTH_SCHEMA takes over. The
      commit that removes them from here is the one that adds AUTH_SCHEMA to
      `SCHEMA_MODULES` — never one without the other, or sign-in loses its
      tables on the next fresh database.
    */
    'CREATE TABLE IF NOT EXISTS "user" (id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, emailVerified INTEGER, image TEXT, createdAt DATE, updatedAt DATE);',
    'CREATE TABLE IF NOT EXISTS "session" (id TEXT PRIMARY KEY, expiresAt DATE, token TEXT UNIQUE, createdAt DATE, updatedAt DATE, ipAddress TEXT, userAgent TEXT, userId TEXT, activeOrganizationId TEXT);',
    'CREATE TABLE IF NOT EXISTS "account" (id TEXT PRIMARY KEY, accountId TEXT, providerId TEXT, userId TEXT, accessToken TEXT, refreshToken TEXT, idToken TEXT, accessTokenExpiresAt DATE, refreshTokenExpiresAt DATE, scope TEXT, password TEXT, createdAt DATE, updatedAt DATE);',
    'CREATE TABLE IF NOT EXISTS "verification" (id TEXT PRIMARY KEY, identifier TEXT, value TEXT, expiresAt DATE, createdAt DATE, updatedAt DATE);',
    'CREATE TABLE IF NOT EXISTS "organization" (id TEXT PRIMARY KEY, name TEXT, slug TEXT UNIQUE, logo TEXT, createdAt DATE, metadata TEXT);',
    'CREATE TABLE IF NOT EXISTS "member" (id TEXT PRIMARY KEY, organizationId TEXT, userId TEXT, role TEXT, permissions_json TEXT, createdAt DATE);',
    'CREATE TABLE IF NOT EXISTS "invitation" (id TEXT PRIMARY KEY, organizationId TEXT, email TEXT, role TEXT, status TEXT, expiresAt DATE, inviterId TEXT, createdAt DATE);',
    'CREATE UNIQUE INDEX IF NOT EXISTS user_username_unique ON "user"(username);',
  ],
  alters: [
    // Best-effort migrations for columns added after a table first shipped;
    // each is harmless (and ignored) once the column is present.
    "ALTER TABLE tracks ADD COLUMN library_id TEXT",
    "ALTER TABLE ads ADD COLUMN hide_badge INTEGER",
    "ALTER TABLE ads ADD COLUMN companion_url TEXT",
    "ALTER TABLE tracks ADD COLUMN artist TEXT",
    "ALTER TABLE tracks ADD COLUMN art_hash TEXT",
    "ALTER TABLE tracks ADD COLUMN art_url TEXT",
    "ALTER TABLE library_tracks ADD COLUMN art_hash TEXT",
    "ALTER TABLE library_tracks ADD COLUMN art_url TEXT",
    // Per-tenant entitlement overrides (admin gifts on top of the plan, §25).
    "ALTER TABLE subscriptions ADD COLUMN overrides_json TEXT",
    // Reusable-entities restructure: channels reference playlists + a profile;
    // slides/tracks gain playlist_id; devices gain a detected resolution.
    "ALTER TABLE channels ADD COLUMN slide_playlist_id TEXT",
    "ALTER TABLE channels ADD COLUMN music_playlist_id TEXT",
    "ALTER TABLE channels ADD COLUMN widget_profile_id TEXT",
    // Ad profiles: a channel binds a reusable ad rotation; ads gain a profile_id.
    "ALTER TABLE channels ADD COLUMN ad_profile_id TEXT",
    "ALTER TABLE ads ADD COLUMN profile_id TEXT",
    "ALTER TABLE slides ADD COLUMN playlist_id TEXT",
    "ALTER TABLE tracks ADD COLUMN playlist_id TEXT",
    "ALTER TABLE screens ADD COLUMN width INTEGER",
    "ALTER TABLE screens ADD COLUMN height INTEGER",
    "ALTER TABLE screens ADD COLUMN orientation TEXT",
    // Per-device schedule timezone (dayparting/mute/saver windows, §13).
    "ALTER TABLE screens ADD COLUMN tz TEXT",
    // Freeform tags (JSON array) for organizing + filtering channels/devices.
    "ALTER TABLE channels ADD COLUMN tags TEXT",
    "ALTER TABLE screens ADD COLUMN tags TEXT",
    "ALTER TABLE slide_playlists ADD COLUMN tags TEXT",
    // Per-slide presentation: how media fills the 16:9 frame (contain/cover/fill).
    "ALTER TABLE slides ADD COLUMN fit TEXT",
    // Video/gif playback: seek offset (trim start) + loop flag (loop vs play-once).
    "ALTER TABLE slides ADD COLUMN clip_start_ms INTEGER",
    "ALTER TABLE slides ADD COLUMN loop INTEGER",
    // Music-in-media-library (§4b/§16): audio is a first-class media kind, so
    // uploads/generations land in the durable catalog alongside images/video.
    // Rich audio meta lives on the media row (the source of truth); playlists
    // copy a snapshot. `source` badges provenance for licensing (upload/ai/public).
    "ALTER TABLE media ADD COLUMN artist TEXT",
    "ALTER TABLE media ADD COLUMN album TEXT",
    "ALTER TABLE media ADD COLUMN genres TEXT",
    "ALTER TABLE media ADD COLUMN vocal TEXT",
    "ALTER TABLE media ADD COLUMN art_hash TEXT",
    "ALTER TABLE media ADD COLUMN art_url TEXT",
    "ALTER TABLE media ADD COLUMN source TEXT",
    "ALTER TABLE media ADD COLUMN library_id TEXT",
    // Track meta snapshot (§16): genres/vocal/album + a link back to the media row.
    "ALTER TABLE tracks ADD COLUMN genres TEXT",
    "ALTER TABLE tracks ADD COLUMN vocal TEXT",
    "ALTER TABLE tracks ADD COLUMN album TEXT",
    "ALTER TABLE tracks ADD COLUMN media_id TEXT",
    // Music playlists gain freeform tags (parity with slide playlists).
    "ALTER TABLE music_playlists ADD COLUMN tags TEXT",
    // Public library tracks can be tagged vocal/instrumental.
    "ALTER TABLE library_tracks ADD COLUMN vocal TEXT",
    // Dynamic sources (§sources): feeds gain a cached normalized dataset
    // ({columns,rows} JSON) + its fetch time, so api/gsheet providers cache
    // like weather. `data_at` drives per-source refresh_sec staleness.
    "ALTER TABLE feeds ADD COLUMN data_json TEXT",
    "ALTER TABLE feeds ADD COLUMN data_at INTEGER",
    // Weather-as-a-source (§17): company-provided, metered per real fetch.
    // Each location polls once/hour only within its opening-hours window
    // [open_hour, close_hour) in tz, so a shop isn't billed overnight. units
    // is per-location now (was a global setting).
    "ALTER TABLE weather_sources ADD COLUMN open_hour INTEGER",
    "ALTER TABLE weather_sources ADD COLUMN close_hour INTEGER",
    "ALTER TABLE weather_sources ADD COLUMN tz TEXT",
    "ALTER TABLE weather_sources ADD COLUMN units TEXT",
    /*
      FIVE TABLES HELD TENANT DATA AND COULD NOT SAY WHOSE.

      `slides` (via a playlist), `device_channels` and `device_schedule_rules`
      (via a screen), `manifest_versions` (via a channel) and `feed_items` (via
      a feed) were all reachable only by joining upward. That is fine for a
      query and fatal for ERASURE: `@4dl/purge` derives its cascade from
      `tenantColumn`, so a table without one is a table a tenant deletion
      silently steps over, leaving rows that outlive the tenant with no owner
      and no way to find them again.

      Denormalising the tenant onto every row is also defence in depth for row
      scoping — a query that forgets a join can still be caught by a tenant
      predicate — and it costs one indexed TEXT column.
    */
    "ALTER TABLE slides ADD COLUMN tenant_id TEXT",
    "ALTER TABLE device_channels ADD COLUMN tenant_id TEXT",
    "ALTER TABLE device_schedule_rules ADD COLUMN tenant_id TEXT",
    "ALTER TABLE manifest_versions ADD COLUMN tenant_id TEXT",
    "ALTER TABLE feed_items ADD COLUMN tenant_id TEXT",
    'ALTER TABLE "member" ADD COLUMN permissions_json TEXT',
    'ALTER TABLE "user" ADD COLUMN username TEXT',
  ],
  backfills: [
    /*
      Fill the five new columns from the parent that already knows.

      Backfills are best-effort and only ever surface in a log line, so each is
      NAMED — an unnamed one is unattributable when it fails. They are also
      idempotent: the `WHERE tenant_id IS NULL` guard means a re-run after a
      partial failure finishes the job rather than rewriting rows that are done.
    */
    {
      /*
        A STATION'S CODE IS NOT A THING WE KEEP.

        `board_users.password` held the credential in plaintext so an admin could
        re-read it. Creation and regeneration both return it now, so nothing
        needs the column — and a plaintext credential column means one D1 read
        yields working logins for every station in every tenant. The column
        stays (SQLite drops are awkward and it is harmless empty); its contents
        do not.
      */
      name: "board_users.password — clear every stored plaintext credential",
      sql: "UPDATE board_users SET password = NULL WHERE password IS NOT NULL",
    },
    {
      name: "slides.tenant_id from its playlist",
      sql: "UPDATE slides SET tenant_id = (SELECT p.tenant_id FROM slide_playlists p WHERE p.id = slides.playlist_id) WHERE tenant_id IS NULL AND playlist_id IS NOT NULL",
    },
    {
      name: "slides.tenant_id from its channel (playlist-less legacy rows)",
      sql: "UPDATE slides SET tenant_id = (SELECT c.tenant_id FROM channels c WHERE c.id = slides.channel_id) WHERE tenant_id IS NULL AND channel_id IS NOT NULL",
    },
    {
      name: "device_channels.tenant_id from its screen",
      sql: "UPDATE device_channels SET tenant_id = (SELECT s.tenant_id FROM screens s WHERE s.id = device_channels.device_id) WHERE tenant_id IS NULL",
    },
    {
      name: "device_schedule_rules.tenant_id from its screen",
      sql: "UPDATE device_schedule_rules SET tenant_id = (SELECT s.tenant_id FROM screens s WHERE s.id = device_schedule_rules.screen_id) WHERE tenant_id IS NULL",
    },
    {
      name: "manifest_versions.tenant_id from its channel",
      sql: "UPDATE manifest_versions SET tenant_id = (SELECT c.tenant_id FROM channels c WHERE c.id = manifest_versions.channel_id) WHERE tenant_id IS NULL",
    },
    {
      name: "feed_items.tenant_id from its feed",
      sql: "UPDATE feed_items SET tenant_id = (SELECT f.tenant_id FROM feeds f WHERE f.id = feed_items.feed_id) WHERE tenant_id IS NULL",
    },
  ],
  scoped: {
    tenantColumn: "tenant_id",
    tenantTables: [
      "screens", "boards", "board_users", "playout_events", "channels",
      "slide_playlists", "media", "music_playlists", "widget_profiles",
      "slides", "device_channels", "device_schedule_rules", "manifest_versions",
      "feeds", "feed_items", "weather_sources", "alert_rules", "alerts",
      "subscriptions", "credit_ledger", "promo_redemptions", "ai_generations",
      "ads", "ad_profiles", "tracks",
    ],
  },
};
