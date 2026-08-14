/**
 * READING AND WRITING A DECLARED THING.
 *
 * ⚠️ THE STATEMENT IS BUILT FROM THE DECLARATION AND THE VALUES ARE BOUND. Not
 * one column name here comes from a request — they come from the collection,
 * through `sql.ts`, which throws on anything that is not a name. That is the
 * whole of the injection story, and it is a property of the shape rather than of
 * anybody remembering to be careful.
 *
 * ⚠️ AND THE SCOPE IS WRITTEN BY THE PLATFORM, NEVER BY THE CALLER. A tenant id
 * taken from the request body is a tenant id somebody can change; it comes from
 * the resolved request and nowhere else. Every read is filtered by it for the
 * same reason — a row-level scope that a handler has to remember to apply is one
 * a handler will one day forget, and the failure is somebody else's records.
 */

import type { CollectionSpec } from "@quad/kernel";
import { checkAll, eraseBy, newId } from "@quad/kernel";
import { column, table, type Db } from "./sql.js";

export interface Written {
  readonly id: string;
}

export type WriteRefusal = { readonly why: "invalid"; readonly detail: string };

/**
 * ⚠️ VALIDATED AT THE ONE PLACE THAT VALIDATES. The declaration is a literal a
 * script can walk (D8) and the checker is derived from it here (D9), so a field
 * added to a collection is checked on the next write with nothing else edited.
 */
export async function put(
  db: Db,
  spec: CollectionSpec,
  scope: string,
  values: Record<string, unknown>,
  by: string | null = null,
  now = new Date(),
): Promise<Written | WriteRefusal> {
  const checked = checkAll(spec.fields, values);
  if (!checked.ok) return { why: "invalid", detail: checked.why };

  const erase = eraseBy(spec);
  const id = newId(spec.id.replace(/-/g, "_"), now);
  const columns = ["id", ...(erase ? [erase.column] : []), "at", "by"];
  const bound: unknown[] = [id, ...(erase ? [scope] : []), now.toISOString(), by];

  for (const [name, value] of Object.entries(checked.values)) {
    if (name === erase?.column) continue;
    columns.push(name);
    bound.push(normalise(value));
  }

  await db.prepare(
    `INSERT INTO ${table(spec.id)} (${columns.map(column).join(", ")})
     VALUES (${columns.map(() => "?").join(", ")})`).bind(...bound).run();
  return { id };
}

/** ⚠️ Booleans are integers in SQLite and JSON is text. Everything else is itself. */
const normalise = (value: unknown): unknown => {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return value;
};

export async function readOne(
  db: Db, spec: CollectionSpec, scope: string, id: string,
): Promise<Record<string, unknown> | null> {
  const erase = eraseBy(spec);
  const sql = erase
    ? `SELECT * FROM ${table(spec.id)} WHERE id = ? AND ${column(erase.column)} = ?`
    : `SELECT * FROM ${table(spec.id)} WHERE id = ?`;
  const row = await db.prepare(sql).bind(...(erase ? [id, scope] : [id])).first();
  return row ?? null;
}

export async function list(
  db: Db, spec: CollectionSpec, scope: string, limit = 50,
): Promise<readonly Record<string, unknown>[]> {
  const erase = eraseBy(spec);
  const sql = erase
    ? `SELECT * FROM ${table(spec.id)} WHERE ${column(erase.column)} = ? ORDER BY at DESC LIMIT ?`
    : `SELECT * FROM ${table(spec.id)} ORDER BY at DESC LIMIT ?`;
  const rows = await db.prepare(sql).bind(...(erase ? [scope, limit] : [limit])).all();
  return rows.results;
}

/* ----------------------------------------------------------------- erase --- */

export interface Erased {
  readonly table: string;
  readonly rows: number;
}

/**
 * Erasure, derived.
 *
 * ⚠️ A HAND-WRITTEN CASCADE IS THE ONE THAT MISSES A TABLE, and missing one is
 * silent by construction: the sweep runs, reports success, and emails the person
 * to say they have been forgotten. A previous platform's list named seven tables
 * against a declaration of twenty-five. This walks the declarations, so a
 * collection added today is erased today.
 *
 * ⚠️ AND `keep` IS HONOURED RATHER THAN OVERRIDDEN. The small number of records
 * that outlive a business — an invoice, a legal acceptance — said why in their
 * declaration, and a sweep that ignored that would be deleting the evidence that
 * the deletion was lawful.
 */
export async function erase(
  db: Db, specs: readonly CollectionSpec[], of: "tenant" | "subject", scope: string,
): Promise<readonly Erased[]> {
  const out: Erased[] = [];
  for (const spec of specs) {
    const eraseAt = eraseBy(spec);
    if (!eraseAt || eraseAt.of !== of) continue;
    if (spec.onClose.then === "keep" && of === "tenant") continue;
    /* ⚠️ A missing table is not a failure here. An older database legitimately
       lacks one, and a purge that threw would stop half way through somebody's
       erasure — which is worse than a table that was never there. */
    try {
      const done = await db.prepare(
        `DELETE FROM ${table(spec.id)} WHERE ${column(eraseAt.column)} = ?`).bind(scope).run() as
        { meta?: { changes?: number } };
      out.push({ table: table(spec.id), rows: done?.meta?.changes ?? 0 });
    } catch {
      out.push({ table: table(spec.id), rows: 0 });
    }
  }
  return out;
}

/**
 * ⚠️ WHAT ERASURE CANNOT REACH, NAMED. A collection whose scope has no column is
 * one no deletion request will ever touch — and the sweep above will not
 * complain about it, because it simply has nothing to do. This is what a guard
 * asks, and it is the reason `Scope` carries the column instead of a convention
 * carrying it.
 */
export const unreachableByErasure = (specs: readonly CollectionSpec[]): readonly string[] =>
  specs.filter((s) => eraseBy(s) === null && s.scope.of !== "global").map((s) => s.id);
