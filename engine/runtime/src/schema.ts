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

import type { AppSpec, CollectionSpec } from "@engine/kernel";
import { eraseBy } from "@engine/kernel";
import { asTable, column, liveTable, storeFor, table, type Db } from "./sql.js";

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
    /*
      ⚠️ THE FOUR PROVENANCE COLUMNS, ON EVERY COLLECTION, WITHOUT ANY APP
      DECLARING THEM. When it was made and by whom, when it was last changed and
      by whom. An app that had to declare these is an app that could ship without
      them — and the first time anybody wants to know is after something went
      wrong, which is exactly when it is too late to start recording.

      ⚠️ `edited_at` IS NULL UNTIL SOMETHING IS EDITED, deliberately. Defaulting
      it to the creation time makes "never touched since it was made" and "edited
      the instant it was made" the same row, and the first question anybody asks
      of a suspicious record is which of those it is.

      ⚠️ ISO text, always — see `sql.ts`. A sweep compares these as strings.
    */
    `at TEXT NOT NULL`,
    `by TEXT`,
    `edited_at TEXT`,
    `edited_by TEXT`,
    /*
      ⚠️ AND WHETHER IT IS PUT ASIDE — see `Aside`. `NULL` is live, which is what
      every row that predates this column already says, so nothing is migrated
      and nothing has to be: the reconciler adds it by asking the table, and a
      database from last month boots with every record correctly live.

      ⚠️ TWO COLUMNS, BECAUSE "WHICH" AND "WHEN" ARE BOTH ANSWERS SOMEBODY NEEDS.
      The bin sweep reads the date; the screen reads the reason; a single column
      holding `"binned:2026-08-27T…"` would be a string two readers have to
      agree how to split.
    */
    `aside TEXT`,
    `aside_at TEXT`,
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
  /* ⚠️ The reconciler adds what a live table is missing, by asking
     `pragma_table_info` — so the two provenance columns appear on a database
     that predates them, on its next boot, with nothing migrated by hand. */
  const out: Record<string, string> = {
    id: "TEXT", at: "TEXT", by: "TEXT", edited_at: "TEXT", edited_by: "TEXT",
    aside: "TEXT", aside_at: "TEXT",
  };
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
/**
 * WHAT A MODULE'S OWN `CREATE TABLE` SAYS ITS TABLES HAVE.
 *
 * ⚠️ DERIVED, BECAUSE THE HAND-MAINTAINED MAP WAS EMPTY AND THE CONSEQUENCE WAS
 * A DEAD DEPLOYMENT. `columns` is the list of columns to ADD to a table that
 * already exists, and not one platform module declared it — so every column ever
 * added to a hand-written `CREATE TABLE IF NOT EXISTS` reached fresh databases
 * and no existing one. The create is a no-op where the table is there; there was
 * no alter; and the first INSERT naming the new column threw
 * `no such column`, out of `boot`, which answers every route 503.
 *
 * ⚠️ IT IS NOT "WHAT CHANGED", IT IS "WHAT THE TABLE HAS". An incremental list
 * is one somebody has to remember to append to, and forgetting is silent until
 * a database that predates the column meets a statement that names it. Reading
 * the declaration means the two can never disagree.
 *
 * ⚠️ NOT-NULL AND PRIMARY-KEY COLUMNS ARE SKIPPED. SQLite refuses to ALTER one
 * in without a default — existing rows have no value for it — and the refusal
 * takes the whole batch with it. A column added later is nullable, always.
 */
export function columnsIn(module: SchemaModule): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const statement of module.statements) {
    const made = /CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*)\)\s*;?\s*$/i.exec(statement.trim());
    if (!made) continue;
    const [, name, body] = made;

    /* ⚠️ Split on top-level commas only: `PRIMARY KEY (a, b)` is one clause. */
    const parts: string[] = [];
    let depth = 0, at = 0;
    for (let i = 0; i < body!.length; i++) {
      const c = body![i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === "," && depth === 0) { parts.push(body!.slice(at, i)); at = i + 1; }
    }
    parts.push(body!.slice(at));

    const cols: Record<string, string> = {};
    for (const raw of parts) {
      const part = raw.trim();
      if (!part || /^(PRIMARY|UNIQUE|FOREIGN|CHECK|CONSTRAINT)\b/i.test(part)) continue;
      const col = /^(\w+)\s+(TEXT|INTEGER|REAL|BLOB|NUMERIC)\b/i.exec(part);
      if (!col) continue;
      if (/\bNOT NULL\b/i.test(part) || /\bPRIMARY KEY\b/i.test(part)) continue;
      cols[col[1]!] = col[2]!.toUpperCase();
    }
    if (Object.keys(cols).length) out[name!] = { ...out[name!], ...cols };
  }
  return out;
}

export async function applySchema(db: Db, modules: SchemaModules): Promise<readonly Applied[]> {
  const out: Applied[] = [];

  /*
    ⚠️ EVERY STAMP IN ONE READ, AND THE ALTERNATIVE WAS THE SLOWEST THING THIS
    DEPLOYMENT DID. Asked per module this is a SELECT per module — seventeen on
    the directory and eleven more on each shard, in series, on the way to
    answering the FIRST request an isolate ever serves. Nothing is wrong with any
    one of them; it is thirty round trips to learn that nothing has changed, and
    at a hundred milliseconds each that is the whole of "why does opening the app
    take seven seconds".

    ⚠️ AND IT IS THE SAME ANSWER. `_schema` holds one row per module and the
    table is small by construction — one row per module this deployment has ever
    applied — so reading all of it costs what reading one of them did.
  */
  /*
    ⚠️ THE READ COMES FIRST AND THE TABLE IS MADE ONLY IF IT IS NOT THERE. This
    began with `CREATE TABLE IF NOT EXISTS _schema` in front of it, which on a
    settled database is a whole round trip that does nothing — and a settled
    database is what every cold isolate meets for the rest of a version's life.
    The read already had to tolerate the table being absent, so asking first
    costs the never-booted database one extra trip, once, and costs every other
    boot nothing at all.
  */
  const seenAll = new Map<string, string>();
  try {
    const rows = await db.prepare(`SELECT id, stamp FROM _schema`)
      .all<{ id: string; stamp: string }>();
    for (const row of rows.results) seenAll.set(row.id, row.stamp);
  } catch {
    /* A database that has never booted — every module is new, and the table
       every stamp below is written to has to exist before the first one is. */
    await db.exec(MARKER.replace(/\n/g, " "));
  }

  for (const module of modules) {
    const stamp = stampOf(module);
    if (seenAll.get(module.id) === stamp) {
      out.push({ module: module.id, ran: false, added: [] });
      continue;
    }

    /*
      ⚠️ REFUSED BEFORE ANY OF IT RUNS, AND THROWN RATHER THAN REPORTED. Every
      fault `refuseSql` names is one that half-applies: the batch stops at the
      bad statement with the earlier ones already committed and the stamp not
      written, so the next boot starts again from a database that is neither the
      old shape nor the new one. A `DROP` is worse — it succeeds.
    */
    const wrong = refuseSql(module);
    if (wrong.length) {
      throw new Error(`schema module "${module.id}" is malformed: `
        + wrong.map((w) => `${w.why} in ${JSON.stringify(w.statement.slice(0, 60))}`).join("; "));
    }

    for (const statement of module.statements) await db.exec(oneLine(statement));

    /* ⚠️ AND THEN THE COLUMNS THE TABLE DOES NOT HAVE YET. This is the whole
       migration story for a field added to a collection: declare it, and the
       next boot on every database finds it missing and adds it. */
    const added: string[] = [];
    for (const [name, columns] of Object.entries({ ...columnsIn(module), ...(module.columns ?? {}) })) {
      const live = await liveTable(db, name);
      if (!live) continue;
      for (const [col, type] of Object.entries(columns)) {
        if (live.columns.includes(col)) continue;
        /* ⚠️ NEVER `NOT NULL` ON AN ADDED COLUMN. Existing rows have no value
           for it, so SQLite refuses the ALTER outright — and the whole batch
           with it. A column added later is nullable, always. */
        /* ⚠️ `asTable`, NOT `table` — the key here is ALREADY a table name, from
           `columnsIn`'s parse of the CREATE or from `schemaFor`'s own
           conversion. Put back through `table` it is validated against the
           COLLECTION-ID rule, which forbids the underscores that function
           exists to produce: every platform table with one in its name threw
           here, out of `boot`, on the first deployment that had already booted.
           See `asTable`. */
        await db.exec(`ALTER TABLE ${asTable(name)} ADD COLUMN ${column(col)} ${type};`);
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

export type SqlRefusal = "no_semicolon" | "has_comment" | "destructive" | "multiple" | "altered";

export interface SqlProblem { readonly module: string; readonly statement: string; readonly why: SqlRefusal }

/**
 * What a schema module's statements may not be.
 *
 * ⚠️ EVERY ONE OF THESE FAILS SILENTLY RATHER THAN LOUDLY. A missing semicolon
 * merges two statements into one syntax error attributed to neither; a `--`
 * comment survives the newline-flattening above and comments out the rest of the
 * batch; and a `DROP` in a module whose stamp changed is a destructive migration
 * that runs itself on every shard the moment somebody edits a declaration.
 *
 * ⚠️ AND AN `ALTER` HERE IS A 503 ON EVERY DOOR, WHICH IS THE ONE THAT SHIPPED.
 * A statement is re-run whenever the module's stamp changes, and the stamp is a
 * HASH of the statements — so any later edit to the module replays the `ALTER`
 * against a table that already has the column, SQLite answers "duplicate column
 * name", and the throw comes out of `boot`, which answers 503 on every door of
 * the deployment. It is invisible until then: on a fresh database, and therefore
 * in every test, the column is genuinely missing and the statement is correct.
 *
 * ⚠️ `columns` IS THE ONE THAT WORKS, and it is not a style preference. It is
 * reconciled against `liveTable` before anything is written, so it is idempotent
 * by construction and a re-run costs a read. Three modules carried the raw form.
 */
export function refuseSql(module: SchemaModule): readonly SqlProblem[] {
  const out: SqlProblem[] = [];
  for (const statement of module.statements) {
    const at = (why: SqlRefusal) => out.push({ module: module.id, statement, why });
    if (!statement.trim().endsWith(";")) at("no_semicolon");
    if (statement.includes("--")) at("has_comment");
    if (/\b(DROP|TRUNCATE)\b/i.test(statement)) at("destructive");
    if (/\bALTER\b/i.test(statement)) at("altered");
    if (statement.trim().slice(0, -1).includes(";")) at("multiple");
  }
  return out;
}
