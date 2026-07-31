/**
 * The inbox, the per-user preferences, and the digest ledger.
 *
 * `digest_sent` is an idempotency record, not history: a scheduled send that runs
 * twice must not mail the same summary twice, and the only reliable way to know
 * is to have written down that it went.
 */

import type { SchemaModule } from "@4dl/core";

export const NOTIFY_SCHEMA: SchemaModule = {
  id: "notify",
  version: "1",
  ddl: [
    // Personal preferences, per user (cross-tenant): units, dashboard widgets,
    // and the per-channel notification switches.
    "CREATE TABLE IF NOT EXISTS user_prefs (user_id TEXT PRIMARY KEY, units_json TEXT, updated_at TEXT);",
    "CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, tenant_id TEXT, recipient_user_id TEXT, type TEXT, title TEXT, message TEXT, link TEXT, read INTEGER DEFAULT 0, created_at TEXT);",
    "CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notifications(recipient_user_id, read);",
    // The bell lists a recipient's notifications ORDER BY created_at DESC.
    "CREATE INDEX IF NOT EXISTS idx_notif_recipient_time ON notifications(recipient_user_id, created_at);",
    // Digest idempotency: one row per (user, period, kind) gates the send, so
    // an at-least-once cron redelivery can't re-email — and a run that timed
    // out mid-sweep resumes on the next fire (already-sent users are skipped)
    // instead of starting over.
    "CREATE TABLE IF NOT EXISTS digest_sent (user_id TEXT, period TEXT, kind TEXT, at TEXT, PRIMARY KEY (user_id, period, kind));",
  ],
  alters: [
    // Per-user home-screen widget layout.
    "ALTER TABLE user_prefs ADD COLUMN widgets_json TEXT",
    // Notification category → channel preferences (per user).
    "ALTER TABLE user_prefs ADD COLUMN notif_json TEXT",
    // Notification category (the app's registry names them).
    "ALTER TABLE notifications ADD COLUMN category TEXT",
    // Owner-set tenant policy: which categories members may be EMAILED. A column
    // on `tenant_settings`, owned by `@4dl/tenancy` — so this module runs after
    // it, the same composition `@4dl/email` relies on.
    "ALTER TABLE tenant_settings ADD COLUMN notif_policy_json TEXT",
  ],
  scoped: {
    tenantColumn: "tenant_id",
    tenantTables: ["notifications"],
    // `user_prefs` and `digest_sent` are keyed on a USER, who is cross-tenant —
    // deliberately absent, for the same reason auth keeps identity out of the
    // tenant cascade. Neither carries a `tenant_id` to cascade on.
  },
};
