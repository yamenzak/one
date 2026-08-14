/**
 * THE SCHEMA IS DERIVED FROM THE DECLARATIONS, AND RECONCILED AGAINST WHAT IS
 * ACTUALLY THERE.
 *
 * ⚠️ NOBODY BUMPS A VERSION. The previous platform stamped a number per schema
 * module and short-circuited on it, so a new `CREATE TABLE` without a bump was
 * invisible on a fresh database and fatal on every existing one — the table was
 * never created and every route touching it answered 500. The number was the
 * only thing standing between a correct declaration and an outage, and it was
 * kept in a human's head. Here the stamp is a HASH of the statements themselves:
 * change the declaration and it re-runs, change nothing and it does not.
 *
 * ⚠️ AND A NEW COLUMN IS FOUND BY ASKING THE TABLE. Declaring historical
 * `ALTER`s fails in both directions — a fresh database alters columns that were
 * never missing, an old one alters nothing if the list is incomplete — and both
 * failures are silent. `pragma_table_info` is the only source that is correct on
 * a database whose history nobody knows.
 *
 * ⚠️ WHAT IS DELIBERATELY NOT HERE: dropping a column, renaming one, or changing
 * a type. Each is a destructive migration that a hash comparison would trigger
 * automatically at 3am on a live shard, which is how a schema runner becomes an
 * incident. Removing something is a deliberate act with its own path.
 */

import type { AppSpec, CollectionSpec } from "@quad/kernel";
import { eraseBy } from "@quad/kernel";
import { column, liveTable, storeFor, table, type Db } from "./sql.js";

/* ---------------------------------------------------------------- modules --- */

export interface SchemaModule {
  readonly id: string;
  /** ⚠️ Every statement ends with `;` and carries no comment — see `refuseSql`. */
  readonly statements: readonly string[];
  /** Columns this module expects on a table, reconciled rather than altered. */
  readonly columns?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/**
 * ⚠️ THE ORDER OF MODULES IS DEPENDENCY ORDER, AND GETTING IT WRONG DOES NOT
 * FAIL. A module that alters a table another module creates simply finds nothing
 * there; the runner swallows it, everything reports success, and a column that
 * was supposed to exist silently never does. So the list is a list, and the one
 * property it must have is that a module comes after whatever it builds on.
 */
export type SchemaModules = readonly SchemaModule[];

/* ---------------------------------------------------------------- derived --- */

/**
 * The tables one collection implies.
 *
 * ⚠️ THE SCOPE COLUMN IS NOT OPTIONAL AND IS NOT A CONVENTION. Erasure follows
 * it (`eraseBy`), so a table without it is one a deletion request cannot reach —
 * and that failure is silent: the sweep runs, reports success, and leaves the
 * rows exactly where they were.
 */
export function statementsFor(spec: CollectionSpec): readonly string[] {
  const name = table(spec.id);
  const scope = eraseBy(spec);

  const cols = [
    `id TEXT PRIMARY KEY`,
    ...(scope ? [`${column(scope.column)} TEXT NOT NULL`] : []),
    ...Object.entries(spec.fields)
      .filter(([field]) => field !== scope?.column)
      .map(([field, f]) => `${column(field)} ${storeFor(f.kind)}${f.required ? " NOT NULL" : ""}`),
    /* ⚠️ ISO text, always — see `sql.ts`. A sweep compares these. */
    `at TEXT NOT NULL`,
    `by TEXT`,
  ];

  const out = [`CREATE TABLE IF NOT EXISTS ${name} (${cols.join(", ")});`];
  if (scope) {
    out.push(`CREATE INDEX IF NOT EXISTS ix_${name}_scope ON ${name} (${column(scope.column)}, at);`);
  }
  return out;
}

/** Every column a collection declares, as the reconciler expects them. */
export const columnsFor = (spec: CollectionSpec): Readonly<Record<string, string>> => {
  const scope = eraseBy(spec);
  const out: Record<string, string> = { id: "TEXT", at: "TEXT", by: "TEXT" };
  if (scope) out[column(scope.column)] = "TEXT";
  for (const [field, f] of Object.entries(spec.fields)) out[column(field)] = storeFor(f.kind);
  return out;
};

/**
 * ⚠️ AN APP'S SHARD SCHEMA IS ONE MODULE, IDENTIFIED BY THE APP. That is what
 * makes `shard_app` meaningful: applying an app to a shard is applying exactly
 * this, and asking whether a shard can hold a tenant is asking whether this has
 * been applied there.
 */
export const schemaFor = (app: AppSpec): SchemaModule => ({
  id: `app:${app.id}`,
  statements: app.collections.flatMap(statementsFor),
  columns: Object.fromEntries(app.collections.map((c) => [table(c.id), columnsFor(c)])),
});

/* ------------------------------------------------------------------ apply --- */

const MARKER = `CREATE TABLE IF NOT EXISTS _schema (id TEXT PRIMARY KEY, stamp TEXT NOT NULL, at TEXT NOT NULL);`;

/**
 * ⚠️ THE STAMP IS THE CONTENT, NOT A NUMBER. FNV-1a over the statements: cheap,
 * stable across runtimes, and — the property that matters — impossible to forget
 * to change, because it is not something anybody writes.
 */
export function stampOf(module: SchemaModule): string {
  const text = [...module.statements, JSON.stringify(module.columns ?? {})].join("\n");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export interface Applied {
  readonly module: string;
  readonly ran: boolean;
  readonly added: readonly string[];
}

/**
 * Bring a database up to what the declarations say.
 *
 * ⚠️ RECONCILIATION RUNS EVEN WHEN THE STAMP MATCHES IS **NOT** THE RULE — and
 * the reason is cost. A matching stamp means these exact statements have already
 * been applied to this database, so there is nothing to add; asking
 * `pragma_table_info` for every table on every cold start would put a dozen
 * queries in front of every first request for no possible finding.
 */
export async function applySchema(db: Db, modules: SchemaModules): Promise<readonly Applied[]> {
  await db.exec(MARKER.replace(/\n/g, " "));
  const out: Applied[] = [];

  for (const module of modules) {
    const stamp = stampOf(module);
    const seen = await db.prepare(`SELECT stamp FROM _schema WHERE id = ?`)
      .bind(module.id).first<{ stamp: string }>();
    if (seen?.stamp === stamp) { out.push({ module: module.id, ran: false, added: [] }); continue; }

    for (const statement of module.statements) await db.exec(oneLine(statement));

    /* ⚠️ AND THEN THE COLUMNS THE TABLE DOES NOT HAVE YET. This is the whole
       migration story for a field added to a collection: declare it, and the
       next boot on every database finds it missing and adds it. */
    const added: string[] = [];
    for (const [name, columns] of Object.entries(module.columns ?? {})) {
      const live = await liveTable(db, name);
      if (!live) continue;
      for (const [col, type] of Object.entries(columns)) {
        if (live.columns.includes(col)) continue;
        /* ⚠️ NEVER `NOT NULL` ON AN ADDED COLUMN. Existing rows have no value
           for it, so SQLite refuses the ALTER outright — and the whole batch
           with it. A column added later is nullable, always. */
        await db.exec(`ALTER TABLE ${table(name)} ADD COLUMN ${column(col)} ${type};`);
        added.push(`${name}.${col}`);
      }
    }

    await db.prepare(`INSERT INTO _schema (id, stamp, at) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET stamp = excluded.stamp, at = excluded.at`)
      .bind(module.id, stamp, new Date().toISOString()).run();
    out.push({ module: module.id, ran: true, added });
  }
  return out;
}

/* ⚠️ `exec` TAKES ONE STATEMENT PER LINE, so a statement wrapped for reading is
   several statements as far as D1 is concerned — and the error names a syntax
   problem rather than a formatting one. */
const oneLine = (s: string): string => s.replace(/\s*\n\s*/g, " ").trim();

/* ------------------------------------------------------------------ rules --- */

export type SqlRefusal = "no_semicolon" | "has_comment" | "destructive" | "multiple";

export interface SqlProblem { readonly module: string; readonly statement: string; readonly why: SqlRefusal }

/**
 * What a schema module's statements may not be.
 *
 * ⚠️ EVERY ONE OF THESE FAILS SILENTLY RATHER THAN LOUDLY. A missing semicolon
 * merges two statements into one syntax error attributed to neither; a `--`
 * comment survives the newline-flattening above and comments out the rest of the
 * batch; and a `DROP` in a module whose stamp changed is a destructive migration
 * that runs itself on every shard the moment somebody edits a declaration.
 */
export function refuseSql(module: SchemaModule): readonly SqlProblem[] {
  const out: SqlProblem[] = [];
  for (const statement of module.statements) {
    const at = (why: SqlRefusal) => out.push({ module: module.id, statement, why });
    if (!statement.trim().endsWith(";")) at("no_semicolon");
    if (statement.includes("--")) at("has_comment");
    if (/\b(DROP|TRUNCATE)\b/i.test(statement)) at("destructive");
    if (statement.trim().slice(0, -1).includes(";")) at("multiple");
  }
  return out;
}
