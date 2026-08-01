/**
 * TESSA'S SCHEMA — the model in TESSA.md Part III, as tables.
 *
 * ⚠️ Adding DDL means bumping `version`. Every statement must be
 * `IF NOT EXISTS`, terminate with `;`, contain no `--` and no newline, and every
 * ALTER must be `ADD COLUMN` only. All of those fail SILENTLY; the app's
 * conformance test asserts them.
 *
 * ── Two decisions that shape everything below ───────────────────────────────
 *
 * **1. EVERY table carries `tenant_id`, including join tables.**
 *
 * `pack_members` and `pack_recipe_items` could reach their tenant through a
 * parent, and normalising them that way is the tidier schema. They carry the
 * column anyway, because `SchemaScope` has no cascade: a table with no tenant
 * column cannot be declared in `scoped`, so `@4dl/purge` never touches it and
 * its rows survive an erasure that reported success. In a GDPR-first market that
 * is the wrong thing to be elegant about. Erasure completeness beats
 * normalisation, and the cost is one redundant column.
 *
 * **2. THE LEDGER IS THE TRUTH; the rest is a projection.**
 *
 * `lots.quantity`, `units.status`, `packs.status` are all *caches* of what the
 * ledger already says. They exist because reading a stock level cannot mean
 * replaying history, and they are rebuildable from `ledger` alone. Same
 * arrangement as `@4dl/billing`'s credit ledger against the DO balance, for the
 * same reason: the questions this product answers are temporal, and a row that
 * has been overwritten cannot answer them.
 *
 * A consequence worth stating: **no route may write a state column without
 * writing the ledger row that justifies it.** That is the invariant the whole
 * traceability story rests on.
 */

import type { SchemaModule } from "@4dl/core";

export const TESSA_SCHEMA: SchemaModule = {
  id: "tessa",
  version: "1",
  ddl: [
    // ── Catalog: the TYPE of a thing ────────────────────────────────────────
    //
    // `tracking` is the fork in TESSA.md §3.1 and decides which instance table a
    // physical thing lands in: `lot` (a batch with a quantity), `unit` (one
    // object tracked for life), `none` (general-purpose, counted loosely).
    //
    // `reprocessing_class` is the RKI/BfArM classification (unkritisch,
    // semikritisch_a/b, kritisch_a/b/c). It is a FIELD rather than a label
    // because in German practice it determines which reprocessing steps are
    // required — the workflow reads it.
    //
    // `consumption` distinguishes a bottle (divisible, remainder still valid)
    // from a counted item (discrete) from a sterile pack (opening commits the
    // whole thing).
    "CREATE TABLE IF NOT EXISTS catalog_items (id TEXT PRIMARY KEY, tenant_id TEXT, kind TEXT DEFAULT 'consumable', tracking TEXT DEFAULT 'lot', name TEXT, code TEXT, gtin TEXT, manufacturer TEXT, consumption TEXT DEFAULT 'discrete', unit_of_measure TEXT, post_opening_days INTEGER, sterile_shelf_days INTEGER, reprocessing_class TEXT, storage_notes TEXT, handling_notes TEXT, warnings_json TEXT, image_key TEXT, par_level INTEGER, active INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT);",
    "CREATE INDEX IF NOT EXISTS idx_catalog_tenant ON catalog_items(tenant_id, active, name);",
    "CREATE INDEX IF NOT EXISTS idx_catalog_gtin ON catalog_items(tenant_id, gtin);",

    // ── Locations: Site → Room → Bin, self-nesting ──────────────────────────
    //
    // A dimension, not a field (TESSA.md §3.3): stock is per-location, movement
    // is an event, and every level gets its own QR so receiving is two scans.
    "CREATE TABLE IF NOT EXISTS locations (id TEXT PRIMARY KEY, tenant_id TEXT, parent_id TEXT, kind TEXT DEFAULT 'room', name TEXT, code TEXT, active INTEGER DEFAULT 1, created_at TEXT);",
    "CREATE INDEX IF NOT EXISTS idx_locations_tenant ON locations(tenant_id, active, kind);",
    "CREATE INDEX IF NOT EXISTS idx_locations_parent ON locations(tenant_id, parent_id);",

    // ── Lots: a batch, with a quantity and an expiry ────────────────────────
    //
    // `printed_expiry` is the manufacturer's; `opened_at` starts the second
    // clock. The EFFECTIVE expiry is computed (`@tessa/domain` expiry.ts) and
    // deliberately NOT stored: it is derived from three inputs, one of which is
    // a catalog default that can change, so a stored copy would go stale
    // silently. `printed_expiry` is indexed because that is what a sweep scans.
    "CREATE TABLE IF NOT EXISTS lots (id TEXT PRIMARY KEY, tenant_id TEXT, catalog_item_id TEXT, location_id TEXT, lot_code TEXT, gtin TEXT, printed_expiry TEXT, opened_at TEXT, opened_by TEXT, quantity REAL DEFAULT 0, received_at TEXT, received_by TEXT, supplier TEXT, status TEXT DEFAULT 'active', quarantine_reason TEXT, created_at TEXT, updated_at TEXT);",
    "CREATE INDEX IF NOT EXISTS idx_lots_stock ON lots(tenant_id, catalog_item_id, location_id, status);",
    "CREATE INDEX IF NOT EXISTS idx_lots_expiry ON lots(tenant_id, status, printed_expiry);",
    "CREATE INDEX IF NOT EXISTS idx_lots_code ON lots(tenant_id, lot_code);",

    // ── Units: one instrument, tracked for life ─────────────────────────────
    //
    // `cycle_count` is what makes a unit different from a lot: instruments have
    // a service life measured in reprocessing cycles, and MPBetreibV expects the
    // acquisition and service history to be recorded.
    "CREATE TABLE IF NOT EXISTS units (id TEXT PRIMARY KEY, tenant_id TEXT, catalog_item_id TEXT, location_id TEXT, serial TEXT, label_code TEXT, acquired_at TEXT, cycle_count INTEGER DEFAULT 0, status TEXT DEFAULT 'clean', retired_at TEXT, retired_reason TEXT, notes TEXT, created_at TEXT, updated_at TEXT);",
    "CREATE INDEX IF NOT EXISTS idx_units_tenant ON units(tenant_id, status, catalog_item_id);",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_units_label ON units(tenant_id, label_code);",

    // ── Pack recipes: what a tray is supposed to contain ────────────────────
    "CREATE TABLE IF NOT EXISTS pack_recipes (id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, code TEXT, sterile_shelf_days INTEGER, notes TEXT, active INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT);",
    "CREATE INDEX IF NOT EXISTS idx_recipes_tenant ON pack_recipes(tenant_id, active);",
    "CREATE TABLE IF NOT EXISTS pack_recipe_items (id TEXT PRIMARY KEY, tenant_id TEXT, recipe_id TEXT, catalog_item_id TEXT, quantity INTEGER DEFAULT 1);",
    "CREATE INDEX IF NOT EXISTS idx_recipe_items ON pack_recipe_items(tenant_id, recipe_id);",

    // ── Packs: a composed set with its OWN lifecycle ────────────────────────
    //
    // The interesting granularity (TESSA.md §3.1): built from units, sterilised
    // as a whole, opened as a whole. Opening returns its members to the dirty
    // pool — that transition is the CSSD loop.
    //
    // `released_by` and `released_at` are the German **Freigabe**: release after
    // reprocessing is a named act by a qualified person, and TESSA.md Rule 2
    // says the app records that act rather than performing it. There is
    // deliberately no default and no system actor.
    //
    // `cycle_id` is indexed on its own because it is the RECALL query — the one
    // the product exists for.
    "CREATE TABLE IF NOT EXISTS packs (id TEXT PRIMARY KEY, tenant_id TEXT, recipe_id TEXT, location_id TEXT, label_code TEXT, status TEXT DEFAULT 'packed', packed_at TEXT, packed_by TEXT, cycle_id TEXT, sterilised_at TEXT, released_at TEXT, released_by TEXT, expiry TEXT, opened_at TEXT, opened_by TEXT, case_id TEXT, quarantine_reason TEXT, created_at TEXT, updated_at TEXT);",
    "CREATE INDEX IF NOT EXISTS idx_packs_cycle ON packs(tenant_id, cycle_id);",
    "CREATE INDEX IF NOT EXISTS idx_packs_status ON packs(tenant_id, status, expiry);",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_packs_label ON packs(tenant_id, label_code);",
    "CREATE TABLE IF NOT EXISTS pack_members (id TEXT PRIMARY KEY, tenant_id TEXT, pack_id TEXT, unit_id TEXT, added_at TEXT);",
    "CREATE INDEX IF NOT EXISTS idx_pack_members ON pack_members(tenant_id, pack_id);",
    "CREATE INDEX IF NOT EXISTS idx_pack_members_unit ON pack_members(tenant_id, unit_id);",

    // ── Sterilisation cycles ────────────────────────────────────────────────
    //
    // The three indicator results are SEPARATE and all nullable, because they
    // arrive at different times and that lag is the entire reason recall exists:
    // physical and chemical are read at the end of the run, but the BIOLOGICAL
    // indicator is incubated and comes back a day or two later — by which point
    // the packs are on shelves and some are already used.
    //
    // A single `passed` boolean would erase that, and with it the ability to say
    // "released on Tuesday's evidence, failed on Thursday's".
    "CREATE TABLE IF NOT EXISTS sterilisation_cycles (id TEXT PRIMARY KEY, tenant_id TEXT, machine TEXT, program TEXT, cycle_number TEXT, started_at TEXT, ended_at TEXT, operator TEXT, status TEXT DEFAULT 'running', physical_ok INTEGER, chemical_ok INTEGER, biological_ok INTEGER, biological_read_at TEXT, biological_read_by TEXT, released_at TEXT, released_by TEXT, failed_at TEXT, failure_reason TEXT, evidence_key TEXT, notes TEXT, created_at TEXT, updated_at TEXT);",
    "CREATE INDEX IF NOT EXISTS idx_cycles_tenant ON sterilisation_cycles(tenant_id, started_at);",
    "CREATE INDEX IF NOT EXISTS idx_cycles_status ON sterilisation_cycles(tenant_id, status);",

    // ── Cases: the header a case reference hangs off ────────────────────────
    //
    // ⚠️ TESSA.md Rule 1. `case_ref` is an OPAQUE STRING typed by staff and
    // nothing else about a person is stored here — no name, no date of birth, no
    // diagnosis. `procedure_code` is the centre's own code, not a description.
    // The app's conformance test enforces the absence of the rest.
    "CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY, tenant_id TEXT, case_ref TEXT, procedure_code TEXT, location_id TEXT, status TEXT DEFAULT 'open', opened_at TEXT, opened_by TEXT, closed_at TEXT, closed_by TEXT, notes TEXT, created_at TEXT);",
    "CREATE INDEX IF NOT EXISTS idx_cases_ref ON cases(tenant_id, case_ref);",
    "CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(tenant_id, status, opened_at);",

    // ── The ledger ──────────────────────────────────────────────────────────
    //
    // Append-only. Every state change in the tables above is justified by a row
    // here, and every row names WHO and WHEN — which is what turns a stock system
    // into an audit trail.
    //
    // `tracked_kind` + `tracked_id` is a deliberate polymorphic reference rather
    // than three nullable foreign keys: a lot, a unit and a pack all have
    // histories of the same shape, and splitting them would triple every history
    // query for no gain.
    //
    // `at` is stored as text ISO for sortability alongside every other date in
    // this schema, and indexed with the tracked thing so one item's history is a range
    // scan rather than a filter.
    "CREATE TABLE IF NOT EXISTS ledger (id TEXT PRIMARY KEY, tenant_id TEXT, at TEXT, actor_user_id TEXT, event TEXT, tracked_kind TEXT, tracked_id TEXT, catalog_item_id TEXT, quantity_delta REAL, from_location_id TEXT, to_location_id TEXT, case_id TEXT, cycle_id TEXT, note TEXT, meta_json TEXT);",
    "CREATE INDEX IF NOT EXISTS idx_ledger_tracked ON ledger(tenant_id, tracked_kind, tracked_id, at);",
    "CREATE INDEX IF NOT EXISTS idx_ledger_case ON ledger(tenant_id, case_id, at);",
    "CREATE INDEX IF NOT EXISTS idx_ledger_cycle ON ledger(tenant_id, cycle_id, at);",
    "CREATE INDEX IF NOT EXISTS idx_ledger_at ON ledger(tenant_id, at);",
  ],
  scoped: {
    tenantColumn: "tenant_id",
    // Every table, including the join tables — see the header. A missing entry
    // here is a table that survives an erasure which reported success.
    tenantTables: [
      "catalog_items",
      "locations",
      "lots",
      "units",
      "pack_recipes",
      "pack_recipe_items",
      "packs",
      "pack_members",
      "sterilisation_cycles",
      "cases",
      "ledger",
    ],
    /**
     * NO `subjectColumn`.
     *
     * The template ships one and Kova uses `client_id`, because both have an
     * individual inside the tenant whose data can be erased on request. Tessa
     * deliberately does not: the only thing it holds about a person is an opaque
     * `case_ref` it cannot resolve, so there is no subject to scope to and
     * nothing person-shaped to cascade. Declaring one anyway would invite a
     * future table to key on it — which is exactly how Rule 1 would erode.
     */
  },
};
