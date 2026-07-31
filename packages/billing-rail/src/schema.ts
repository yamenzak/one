/**
 * The rail's own table: events that arrived and could not be attributed.
 *
 * A dead-letter queue, and the reason it is a TABLE rather than a log line is
 * that a log nobody reads is the same as the silent 200 this package exists to
 * replace. A row can be counted, surfaced in the operator console, and — once
 * the misattribution is fixed — replayed.
 *
 * Deliberately NOT `scoped`: an unroutable event has no tenant by definition
 * (that is what makes it unroutable), so there is nothing for `@4dl/purge` to
 * cascade. Declaring a scope column that does not exist would make every erasure
 * issue `WHERE tenant_id = ?` against a table without one — an error a purge
 * swallows, which is the exact class `@4dl/purge`'s conformance checks exist to
 * catch. See packages/purge/README.md.
 */

import type { SchemaModule } from "@4dl/core";

export const BILLING_RAIL_SCHEMA: SchemaModule = {
  id: "billing-rail",
  version: "1",
  ddl: [
    "CREATE TABLE IF NOT EXISTS rail_parked_events (id TEXT PRIMARY KEY, event_id TEXT, event_type TEXT, reason TEXT, candidates TEXT, payload TEXT, created_at TEXT, resolved_at TEXT);",
    "CREATE INDEX IF NOT EXISTS idx_rail_parked_open ON rail_parked_events(resolved_at, created_at);",
  ],
  scoped: {},
};
