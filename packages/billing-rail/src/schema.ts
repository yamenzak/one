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
  version: "2",
  ddl: [
    "CREATE TABLE IF NOT EXISTS rail_parked_events (id TEXT PRIMARY KEY, event_id TEXT, event_type TEXT, reason TEXT, candidates TEXT, payload TEXT, created_at TEXT, resolved_at TEXT);",
    "CREATE INDEX IF NOT EXISTS idx_rail_parked_open ON rail_parked_events(resolved_at, created_at);",
  ],
  /**
   * WHO closed a parked event and WHAT they did about it.
   *
   * Added with the operator surface, because "resolved" on its own is the least
   * useful state this table could hold: the whole point of parking an event is
   * that money moved and nothing was granted, so a row that says only "somebody
   * dealt with it" leaves the next person to re-derive whether the customer was
   * ever given what they paid for. The note is what makes closing it an audit
   * entry rather than a dismissal.
   */
  alters: [
    "ALTER TABLE rail_parked_events ADD COLUMN resolved_by TEXT;",
    "ALTER TABLE rail_parked_events ADD COLUMN resolution_note TEXT;",
  ],
  scoped: {},
};
