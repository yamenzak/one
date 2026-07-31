/**
 * A tenant's white-label overrides for the messages it sends.
 *
 * The DEFAULT body of every message type lives in the app's registry, in code —
 * this table holds only the overrides an operator typed, so a tenant that never
 * customises anything has no rows and always gets the current default.
 */

import type { SchemaModule } from "@4dl/core";

export const EMAIL_SCHEMA: SchemaModule = {
  id: "email",
  version: "1",
  ddl: [
    // Per-tenant email template overrides (white-label): a tenant rewrites a
    // notification type's subject/body ({{variables}}); enabled=0 mutes the
    // email for that type. Absent row = the registry default template.
    "CREATE TABLE IF NOT EXISTS email_templates (tenant_id TEXT, type TEXT, subject TEXT, body TEXT, enabled INTEGER DEFAULT 1, updated_at TEXT, PRIMARY KEY (tenant_id, type));",
  ],
  alters: [
    // Which lane a tenant sends on, and its Brevo key when it brings its own.
    // A column on `tenant_settings`, which `@4dl/tenancy` owns: modules compose
    // onto one table rather than each inventing a settings table of its own, so
    // this module must run AFTER tenancy in the runner's list.
    "ALTER TABLE tenant_settings ADD COLUMN email_config_json TEXT",
  ],
  scoped: {
    tenantColumn: "tenant_id",
    tenantTables: ["email_templates"],
  },
};
