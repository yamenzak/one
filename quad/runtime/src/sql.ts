/**
 * THE ONLY PLACE A NAME IS INTERPOLATED INTO SQL.
 *
 * ⚠️ VALUES ARE BOUND AND IDENTIFIERS CANNOT BE. SQL has no parameter for a table
 * or a column name, so a generated schema has to write them into the statement —
 * and the safety therefore has to be that a name which is not a name never
 * reaches a statement at all. `ident` is that gate, it throws rather than
 * escaping, and every builder here goes through it.
 *
 * ⚠️ THROWS, NEVER SANITISES. Escaping a hostile identifier would produce a
 * table with a strange name and carry on; throwing at composition means the app
 * does not boot. The kernel already refuses these at `refuseCollection`, so
 * reaching this is a bug in the framework rather than in an app — and a bug in
 * the framework is exactly the thing that must not degrade quietly.
 */

import { FIELD_NAME, NAME } from "@quad/kernel";

/** A table name. Derived from a collection id, so hyphens become underscores. */
export function table(id: string): string {
  if (!NAME.test(id)) throw new Error(`"${id}" is not a name, so it cannot be a table`);
  return id.replace(/-/g, "_");
}

export function column(name: string): string {
  if (!FIELD_NAME.test(name)) throw new Error(`"${name}" is not a name, so it cannot be a column`);
  return name;
}

/* ------------------------------------------------------------------ types --- */

/**
 * ⚠️ SQLITE TYPES ARE PER-VALUE, NOT PER-COLUMN, so a declared type is
 * documentation and an ordering rule rather than a constraint. That is why the
 * choice below matters more than it looks: a millisecond integer sits happily in
 * a TEXT column, and then a comparison against an ISO string is lexicographic
 * and silently always false. Every instant here is ISO text, everywhere, so the
 * comparison a sweep does is the comparison it looks like.
 */
export type Store = "TEXT" | "INTEGER" | "REAL";

export const storeFor = (kind: string): Store => {
  switch (kind) {
    case "number": case "money": case "bool": return kind === "number" ? "REAL" : "INTEGER";
    default: return "TEXT";
  }
};

/* ----------------------------------------------------------------- shapes --- */

/** What a live table actually has. Read from the database, never assumed. */
export interface Live {
  readonly columns: readonly string[];
}

/**
 * ⚠️ `run()` REPORTS HOW MANY ROWS IT TOUCHED, AND THAT IS NOT A DETAIL. An
 * UPDATE scoped in its own `WHERE` is the only safe way to write somebody's row
 * — but it is also silent when the row was not theirs, so the count is the
 * difference between "changed" and "matched nothing and said 200". It is
 * optional because a driver may not report it; a caller that needs it must treat
 * an absent count as "did not happen".
 */
export interface Ran {
  readonly meta?: { readonly changes?: number };
}

export interface Db {
  prepare(query: string): {
    bind(...values: unknown[]): {
      all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
      first<T = Record<string, unknown>>(): Promise<T | null>;
      run(): Promise<Ran>;
    };
    all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
    first<T = Record<string, unknown>>(): Promise<T | null>;
    run(): Promise<Ran>;
  };
  exec(query: string): Promise<unknown>;
}

/**
 * ⚠️ READ WHAT IS THERE BEFORE CHANGING IT. The alternative — declaring every
 * historical `ALTER` and trusting a version number — fails in both directions: a
 * fresh database runs alters against columns that were never missing, and an old
 * one runs none at all if somebody forgets to bump. Asking the table is the only
 * answer that is correct on a database whose history nobody knows.
 */
export async function liveTable(db: Db, name: string): Promise<Live | null> {
  const rows = await db.prepare(`SELECT name FROM pragma_table_info(?)`).bind(name).all<{ name: string }>();
  return rows.results.length ? { columns: rows.results.map((r) => r.name) } : null;
}
