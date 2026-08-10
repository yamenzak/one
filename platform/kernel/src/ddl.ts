/**
 * A COLLECTION BECOMES A TABLE.
 *
 * Layer 3. Imports collection and schema.
 *
 * This is where the manifest stops describing and starts generating: one
 * `collection()` produces the DDL, the columns, the indexes and — because it
 * carries its own scope — the erasure cascade. Nothing is written by hand, so
 * nothing can disagree with anything else.
 *
 * ⚠️ THE DERIVED MODULE MUST SATISFY `validateModule`. That is the point at
 * which the two halves meet: the generator cannot emit a statement the runner
 * would swallow, because the runner's rules are asserted against its output.
 */

import type { CollectionSpec, Field } from "./collection.js";
import type { SchemaModule } from "./schema.js";

/* --------------------------------------------------------------- columns --- */

export interface Column {
  readonly name: string;
  readonly sql: string;
  /** Which declared field produced it. Null for a column every collection gets. */
  readonly from: string | null;
}

/** `playlistId` → `playlist_id`. Idiomatic on both sides of the boundary. */
export function columnName(field: string): string {
  return field.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/**
 * The columns one field becomes.
 *
 * ⚠️ MONEY BECOMES TWO, and that is the whole of `Money` being real rather than
 * aspirational. An amount without its currency is a number somebody will
 * eventually add to a different currency's number; storing them apart makes that
 * a join error rather than a silent one. A single `REAL` column would also
 * reintroduce the floating-point total the type exists to prevent.
 */
export function columnsFor(name: string, field: Field): readonly Column[] {
  const col = columnName(name);
  const one = (sql: string): readonly Column[] => [{ name: col, sql: `${col} ${sql}`, from: name }];
  switch (field.kind) {
    case "money":
      return [
        { name: `${col}_minor`, sql: `${col}_minor INTEGER`, from: name },
        { name: `${col}_currency`, sql: `${col}_currency TEXT`, from: name },
      ];
    case "number":
      return one(field.integer ? "INTEGER" : "REAL");
    case "quantity":
      // Canonical unit. What it MEANS is the declaration's job, not the column's.
      return one("REAL");
    case "bool":
      // SQLite has no boolean. An INTEGER that is 0 or 1, like everything else here.
      return one("INTEGER");
    case "instant":
    case "plainDate":
    case "text":
    case "enum":
    case "ref":
    case "json":
    case "media":
      return one("TEXT");
  }
}

/**
 * Columns every collection gets, whatever it holds.
 *
 * ⚠️ `version` is here rather than optional, because optimistic concurrency
 * added later is one column on every table in the platform — and the collections
 * most likely to opt out are the busy ones that need it most.
 */
export function systemColumns(spec: CollectionSpec): readonly Column[] {
  const out: Column[] = [
    { name: "id", sql: "id TEXT PRIMARY KEY", from: null },
    { name: "version", sql: "version INTEGER NOT NULL DEFAULT 1", from: null },
    { name: "created_at", sql: "created_at TEXT NOT NULL", from: null },
    { name: "updated_at", sql: "updated_at TEXT NOT NULL", from: null },
  ];
  if (spec.scope.of === "tenant") out.push({ name: "tenant_id", sql: "tenant_id TEXT NOT NULL", from: null });
  if (spec.scope.of === "subject") {
    out.push({ name: "tenant_id", sql: "tenant_id TEXT NOT NULL", from: null });
    out.push({ name: `${columnName(spec.scope.subject)}_id`, sql: `${columnName(spec.scope.subject)}_id TEXT NOT NULL`, from: null });
  }
  // Archiving keeps the row; purging does not, so only one of them needs a column.
  if (spec.onDelete.on === "archive") out.push({ name: "deleted_at", sql: "deleted_at TEXT", from: null });
  if (spec.naming) out.push({ name: "name", sql: "name TEXT", from: null });
  if (spec.docStatus) {
    out.push({ name: "docstatus", sql: "docstatus INTEGER NOT NULL DEFAULT 0", from: null });
    if (spec.docStatus.amendable) out.push({ name: "amended_from", sql: "amended_from TEXT", from: null });
  }
  return out;
}

/* ------------------------------------------------------------------ table --- */

export const tableNameFor = (spec: CollectionSpec): string => `${columnName(spec.id)}s`;

/**
 * ⚠️ AN ARCHIVED ROW IS NOT A ROW, AND EVERY COUNT HAS TO AGREE ABOUT THAT.
 *
 * A collection that archives keeps the row and stamps it, so any query that
 * forgets the predicate sees deleted records. The list got it right and the
 * checklist did not — which showed up as a step that stayed ticked after
 * somebody deleted the only thing it counted, telling them their workspace
 * contained something it did not.
 *
 * One expression, one home, so the next reader of a row count inherits it.
 */
export const liveClause = (spec: CollectionSpec): string =>
  spec.onDelete.on === "archive" ? " AND deleted_at IS NULL" : "";

/**
 * ⚠️ SQL KEYWORDS A COLUMN OR TABLE NAME MAY NOT BE, and this list is here
 * because the first real app on the platform hit it within a minute.
 *
 * A field called `on` — the day something happened, which is exactly what a
 * coaching product wants to call it — derives `on TEXT NOT NULL` and SQLite
 * answers `near "on": syntax error`. That throws out of `applySchema`, which
 * runs at boot, so EVERY route answers 503 with a reference number and no
 * mention of a column. The DDL is generated, so no human ever reads it.
 *
 * Quoting the identifiers instead would work and is worse: it makes every hand-
 * written query in an app carry quotes forever, and the one that forgets fails
 * the same way. Refusing the name costs one rename, once, at declaration time.
 */
const RESERVED = new Set([
  "abort", "action", "add", "after", "all", "alter", "analyze", "and", "as", "asc", "attach", "autoincrement",
  "before", "begin", "between", "by", "cascade", "case", "cast", "check", "collate", "column", "commit",
  "conflict", "constraint", "create", "cross", "current", "current_date", "current_time", "current_timestamp",
  "database", "default", "deferrable", "deferred", "delete", "desc", "detach", "distinct", "do", "drop",
  "each", "else", "end", "escape", "except", "exclusive", "exists", "explain", "fail", "filter", "first",
  "following", "for", "foreign", "from", "full", "glob", "group", "having", "if", "ignore", "immediate",
  "in", "index", "indexed", "initially", "inner", "insert", "instead", "intersect", "into", "is", "isnull",
  "join", "key", "last", "left", "like", "limit", "match", "natural", "no", "not", "notnull", "null", "nulls",
  "of", "offset", "on", "or", "order", "outer", "over", "partition", "plan", "pragma", "preceding", "primary",
  "query", "raise", "range", "recursive", "references", "regexp", "reindex", "release", "rename", "replace",
  "restrict", "returning", "right", "rollback", "row", "rows", "savepoint", "select", "set", "table", "temp",
  "temporary", "then", "to", "transaction", "trigger", "unbounded", "union", "unique", "update", "using",
  "vacuum", "values", "view", "virtual", "when", "where", "window", "with", "without",
]);

export interface DerivationProblem {
  readonly collectionId: string;
  readonly rule: string;
  readonly detail: string;
}

/**
 * Derive a schema module from one or more collections.
 *
 * Returns the module AND anything that made it impossible, because a generator
 * that throws on the first problem reports one of five.
 */
export function deriveSchema(moduleId: string, collections: readonly CollectionSpec[], after?: readonly string[]): {
  readonly module: SchemaModule;
  readonly problems: readonly DerivationProblem[];
} {
  const problems: DerivationProblem[] = [];
  const ddl: string[] = [];
  const tenantTables: string[] = [];
  const subjectTables: string[] = [];
  let subjectColumn: string | undefined;

  for (const spec of collections) {
    const table = tableNameFor(spec);
    const cols = [...systemColumns(spec), ...Object.entries(spec.fields).flatMap(([n, f]) => columnsFor(n, f))];

    /*
      ⚠️ A COLLISION IS SILENT WITHOUT THIS CHECK. `lastSeen` and `last_seen` both
      become `last_seen`, and SQLite would reject the CREATE with a message naming
      the column but not the two declarations that produced it. Worse, a field
      colliding with a system column — a declared `version`, `id` or `tenant_id` —
      would shadow machinery the platform depends on.
    */
    /*
      ⚠️ THE TABLE NAME TOO. A collection called `value` derives `values`, and a
      collection called `row` derives `rows` — both keywords, both a 503 on every
      route from the first boot.
    */
    if (RESERVED.has(table)) {
      problems.push({
        collectionId: spec.id, rule: "reserved",
        detail: `derives the table "${table}", which is a SQL keyword — every statement naming it is a syntax error`,
      });
    }

    const seen = new Map<string, string | null>();
    for (const c of cols) {
      if (RESERVED.has(c.name)) {
        problems.push({
          collectionId: spec.id, rule: "reserved",
          detail: `"${c.name}"${c.from ? ` (from ${c.from})` : ""} is a SQL keyword — the generated DDL is a syntax error, and it throws at boot rather than at declaration`,
        });
      }
      if (seen.has(c.name)) {
        const first = seen.get(c.name);
        problems.push({
          collectionId: spec.id, rule: "column",
          detail: `"${c.name}" comes from both ${first ?? "a system column"} and ${c.from ?? "a system column"}`,
        });
      }
      seen.set(c.name, c.from);
    }

    ddl.push(`CREATE TABLE IF NOT EXISTS ${table} (${cols.map((c) => c.sql).join(", ")});`);

    if (spec.scope.of === "tenant") {
      tenantTables.push(table);
      ddl.push(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table}(tenant_id);`);
    }
    if (spec.scope.of === "subject") {
      tenantTables.push(table);
      subjectTables.push(table);
      subjectColumn = `${columnName(spec.scope.subject)}_id`;
      ddl.push(`CREATE INDEX IF NOT EXISTS idx_${table}_subject ON ${table}(${subjectColumn});`);
    }
    // A platform-scoped collection is indexed by nothing here on purpose: it has
    // no tenant, and inventing an index for it would be guessing at a query.
  }

  const module: SchemaModule = {
    id: moduleId,
    ...(after ? { after } : {}),
    ddl,
    ...(tenantTables.length ? { scoped: { tenantColumn: "tenant_id", tenantTables, ...(subjectColumn ? { subjectColumn, subjectTables } : {}) } } : {}),
  };
  return { module, problems };
}

/* ------------------------------------------------------------- relocation --- */

export interface RelocationPlan {
  /** Rows to copy, by the same declaration that drives erasure. */
  readonly tables: readonly { readonly table: string; readonly column: string }[];
  /** ⚠️ Objects to COPY. See below. */
  readonly objects: readonly { readonly collectionId: string; readonly field: string; readonly copyOnly: boolean }[];
}

/**
 * What moving one tenant touches.
 *
 * ⚠️ THE SAME DECLARATION THAT DERIVES ERASURE. A relocation is the purge with
 * `SELECT` instead of `DELETE`, so a table that cannot be forgotten by one
 * cannot be forgotten by the other — and the guard that proves it for erasure
 * proves it here too.
 *
 * ⚠️ MEDIA IS COPIED, NEVER MOVED, and the reason is not caution. A
 * content-addressed object is referenced by every tenant whose content hashed
 * the same; moving it breaks all of them, and the breakage surfaces weeks later
 * on a device replaying a cached manifest offline. The bucket deduplicates; the
 * accounting does not.
 */
export function relocationPlan(collections: readonly CollectionSpec[]): RelocationPlan {
  const tables: { table: string; column: string }[] = [];
  const objects: { collectionId: string; field: string; copyOnly: boolean }[] = [];
  for (const spec of collections) {
    if (spec.scope.of !== "platform") tables.push({ table: tableNameFor(spec), column: "tenant_id" });
    for (const [name, field] of Object.entries(spec.fields)) {
      if (field.kind === "media") objects.push({ collectionId: spec.id, field: name, copyOnly: true });
    }
  }
  return { tables, objects };
}
