/**
 * The ledger behind every stored object.
 *
 * R2 has no queryable metadata, so `media_assets` IS the index: what exists, who
 * owns it, how many bytes it costs, and whether it has been deleted. Usage is
 * summed from LIVE rows (`deleted_at IS NULL`), which is why a delete must go
 * through `deleteMedia` and not straight to the bucket — an object removed
 * behind the ledger's back keeps counting against the tenant's quota forever.
 */

import type { SchemaModule } from "@4dl/core";

export const STORAGE_SCHEMA: SchemaModule = {
  id: "storage",
  version: "1",
  ddl: [
    "CREATE TABLE IF NOT EXISTS media_assets (id TEXT PRIMARY KEY, tenant_id TEXT, subject_id TEXT, owner_user_id TEXT, r2_key TEXT UNIQUE, purpose TEXT, content_type TEXT, size_bytes INTEGER DEFAULT 0, created_at TEXT, deleted_at TEXT, deleted_by TEXT);",
    "CREATE INDEX IF NOT EXISTS idx_media_tenant ON media_assets(tenant_id, deleted_at);",
    "CREATE INDEX IF NOT EXISTS idx_media_subject ON media_assets(subject_id, deleted_at);",
    "CREATE INDEX IF NOT EXISTS idx_media_owner ON media_assets(owner_user_id, deleted_at);",
  ],
  scoped: {
    tenantColumn: "tenant_id",
    tenantTables: ["media_assets"],
    // Every stored object also carries the subject it belongs to, so one
    // person's erasure can find their files without walking the bucket.
    subjectColumn: "subject_id",
    subjectTables: ["media_assets"],
  },
};
