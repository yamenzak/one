/**
 * THIS APP'S SCHEMA, and the composition of everyone else's.
 *
 * ⚠️ **Adding DDL means bumping `version`.** The marker row short-circuits the
 * whole module, so a new `CREATE TABLE IF NOT EXISTS` without a bump is
 * invisible on a fresh database and fatal on every existing one — the table is
 * never created and every route touching it 500s. That has shipped for real.
 *
 * Every statement must also: be `IF NOT EXISTS`, terminate with `;`, contain no
 * `--` and no newline (the runner joins DDL with a space), and every ALTER must
 * be `ADD COLUMN` only. All five fail SILENTLY, which is why
 * `test/conformance.test.ts` asserts them.
 *
 * Read `packages/core/README.md` before editing.
 */

import { schemaGate, type SchemaModule } from "@4dl/core";
// ⚠️ Billing and notify are imported at `/schema`, not at their roots. Both roots
// export a Durable Object, which pulls in `cloudflare:workers` — and that makes
// the conformance tests in `test/` unloadable outside the Workers pool. Reaching
// only for the schema keeps those checks runnable in plain Node, which is what
// lets them run on the very first commit, before there is a database to point at.
import { AI_SCHEMA } from "@4dl/ai";
import { AUTH_SCHEMA } from "@4dl/auth";
import { BILLING_SCHEMA } from "@4dl/billing/schema";
import { COMMERCE_SCHEMA } from "@4dl/commerce";
import { EMAIL_SCHEMA } from "@4dl/email";
import { NOTIFY_SCHEMA } from "@4dl/notify/schema";
import { STORAGE_SCHEMA } from "@4dl/storage";
import { TENANCY_SCHEMA } from "@4dl/tenancy";

/**
 * One demo table, kept only to show the shape. Delete it and put the app's own
 * tables here — but keep `scoped`, which is not decoration: `@4dl/purge` derives
 * the erasure cascade from it, and the conformance test refuses a table that
 * carries a scope column without one.
 */
export const APP_SCHEMA: SchemaModule = {
  id: "app",
  version: "1",
  ddl: [
    "CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, tenant_id TEXT, subject_id TEXT, title TEXT, body_json TEXT, created_by TEXT, created_at TEXT);",
    "CREATE INDEX IF NOT EXISTS idx_records_tenant ON records(tenant_id, created_at);",
  ],
  scoped: {
    tenantColumn: "tenant_id",
    tenantTables: ["records"],
    // The app's word for the individual inside a tenant. Kova says `client_id`;
    // a clinic would say `patient_id`. `@4dl/purge` derives the columns it
    // checks from whatever is declared here, so it follows a rename.
    subjectColumn: "subject_id",
    subjectTables: ["records"],
  },
};

/**
 * DEPENDENCY ORDER, and the app last.
 *
 * `tenant_settings` is created by TENANCY and then composed onto: email adds
 * `email_config_json`, notify adds `notif_policy_json`. That is why both follow
 * tenancy. An ADD COLUMN ahead of its CREATE TABLE raises "no such table",
 * which the runner does NOT tolerate — it swallows only "duplicate column".
 *
 * Exported because `purge.ts` derives the erasure cascade from the same list.
 * Two lists would drift, and the drift is invisible: a purge swallows every
 * delete error.
 */
export const SCHEMA_MODULES: readonly SchemaModule[] = [
  AUTH_SCHEMA, TENANCY_SCHEMA, BILLING_SCHEMA, COMMERCE_SCHEMA,
  STORAGE_SCHEMA, AI_SCHEMA, EMAIL_SCHEMA, NOTIFY_SCHEMA, APP_SCHEMA,
];

const gate = schemaGate(SCHEMA_MODULES);

/** Apply the schema once per isolate, retrying on failure. */
export const ensureSchema = (db: D1Database): Promise<void> => gate({ DB: db });

export { j, parseJson } from "@4dl/core";
