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
import { BILLING_RAIL_SCHEMA } from "@4dl/billing-rail";
import { COMMERCE_SCHEMA } from "@4dl/commerce";
import { EMAIL_SCHEMA } from "@4dl/email";
import { NOTIFY_SCHEMA } from "@4dl/notify/schema";
import { STORAGE_SCHEMA } from "@4dl/storage";
import { TENANCY_SCHEMA } from "@4dl/tenancy";
// The app's own tables. Kept in its own file because it is the part that grows.
import { TESSA_SCHEMA } from "./schema.js";

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
  AUTH_SCHEMA, TENANCY_SCHEMA, BILLING_SCHEMA, BILLING_RAIL_SCHEMA, COMMERCE_SCHEMA,
  STORAGE_SCHEMA, AI_SCHEMA, EMAIL_SCHEMA, NOTIFY_SCHEMA, TESSA_SCHEMA,
];

const gate = schemaGate(SCHEMA_MODULES);

/** Apply the schema once per isolate, retrying on failure. */
export const ensureSchema = (db: D1Database): Promise<void> => gate({ DB: db });

export { j, parseJson } from "@4dl/core";
