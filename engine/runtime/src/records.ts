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

import type { CollectionSpec } from "@engine/kernel";
import { checkAll, checkSome, eraseBy, newId, vaultKeyFor } from "@engine/kernel";
import { column, table, type Db } from "./sql.js";

export interface Written {
  readonly id: string;
}

/**
 * ⚠️ `not_found` IS A REFUSAL, NOT AN ABSENCE OF ONE. An update whose statement
 * matched no row did not find the caller's record — either it does not exist or
 * it is not theirs, and both must answer the same way, because distinguishing
 * them tells somebody which ids belong to other people.
 */
export type WriteRefusal =
  | { readonly why: "invalid"; readonly detail: string }
  | { readonly why: "not_found"; readonly detail?: string }
  | { readonly why: "vault_only"; readonly detail: string };

/**
 * ⚠️ A VAULT-BACKED VALUE NEVER REACHES A PRODUCT COLUMN, AND THIS IS THE ONLY
 * THING THAT SAYS SO. The kernel refuses a manifest that keeps a special
 * category outside the vault, so the DECLARATION is safe — and the declaration
 * was the whole of the protection: the generated write bound every checked value
 * to a column of the same name, `vault: true` included. A field marked as the
 * one thing an app may not keep would have been kept, in plaintext, outside
 * consent, outside the record of who looked, and outside crypto-shredding, with
 * every guard and every test green.
 *
 * ⚠️ IT GOES TO THE VAULT INSTEAD, AND THE SUBJECT IS THE ROW'S OWN SCOPE. A
 * vault fact is about a person, so a collection carrying one is refused at
 * composition unless it is scoped by subject — which means the row already says
 * whose it is, and the write never has to guess.
 */
const vaultBacked = (spec: CollectionSpec, values: Record<string, unknown>): readonly string[] =>
  Object.keys(values).filter((name) => spec.fields[name]?.vault);

/**
 * ⚠️ NO VAULT WIRED IS A REFUSAL, NOT A PASS-THROUGH. A deployment that has not
 * bound `VAULT_SECRET` cannot keep a special category anywhere — and the wrong
 * answer is to write it to the column that exists, which is exactly the failure
 * the whole declaration exists to prevent.
 */
export interface VaultSeam {
  readonly keep: (subject: string, field: string, value: string) => Promise<void>;
  /** ⚠️ For the reads that decrypt — the export, and a granted look. */
  readonly secret: string;
}

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
  vault?: VaultSeam,
): Promise<Written | WriteRefusal> {
  const checked = checkAll(spec.fields, values);
  if (!checked.ok) return { why: "invalid", detail: checked.why };

  const erase = eraseBy(spec);
  const held = vaultBacked(spec, checked.values);
  if (held.length && !vault) {
    return { why: "vault_only",
      detail: `${held.join(", ")} belongs in the vault and this deployment has none wired` };
  }

  const id = newId(spec.id.replace(/-/g, "_"), now);
  const columns = ["id", ...(erase ? [erase.column] : []), "at", "by"];
  const bound: unknown[] = [id, ...(erase ? [scope] : []), now.toISOString(), by];

  for (const [name, value] of Object.entries(checked.values)) {
    if (name === erase?.column) continue;
    /* ⚠️ THE COLUMN IS NEVER WRITTEN for a vault-backed field — see below. */
    if (spec.fields[name]?.vault) continue;
    columns.push(name);
    bound.push(normalise(value));
  }

  await db.prepare(
    `INSERT INTO ${table(spec.id)} (${columns.map(column).join(", ")})
     VALUES (${columns.map(() => "?").join(", ")})`).bind(...bound).run();

  /*
    ⚠️ THE FACT GOES TO THE VAULT AFTER THE ROW EXISTS, and the subject is the
    row's own scope — which a collection carrying a vault field is guaranteed to
    have, because composition refuses one that is not scoped by subject.
  */
  for (const name of held) {
    /* ⚠️ `vaultKeyFor`, NEVER THE BARE FIELD NAME. The vault book is keyed
       `collection.field` because two collections may both have a `notes`, and a
       write that stored the short name put the fact somewhere the declaration
       does not describe — so the export skipped it and every look answered
       "nothing kept" about a fact that was right there. */
    await vault!.keep(scope, vaultKeyFor(spec.id, name), String(checked.values[name] ?? ""));
  }
  return { id };
}

/**
 * CHANGE A RECORD, IN THE CALLER'S OWN SCOPE.
 *
 * ⚠️ THIS EXISTED AS A READ AND A `return { id }`. The generated `update`
 * operation passed the gate, wrote an audit entry saying the change had
 * happened, answered 200 with the id — and changed nothing. Every collection in
 * every app, and every suite green, because the tests asserted the route
 * existed. That is the exact shape this framework is a catalogue of.
 *
 * ⚠️ SCOPED IN THE `WHERE`, NOT CHECKED BEFOREHAND. A read-then-write leaves a
 * window where the scope was true when it was checked and false when it was
 * used; putting it in the statement means the row is either theirs or not
 * updated.
 *
 * ⚠️ AND THE SCOPE COLUMN ITSELF IS NEVER WRITABLE. Letting an edit set it is
 * letting somebody move their record into another workspace, which is both a
 * leak and a row erasure can no longer reach.
 */
export async function patch(
  db: Db,
  spec: CollectionSpec,
  scope: string,
  id: string,
  values: Record<string, unknown>,
  by: string | null = null,
  now = new Date(),
  vault?: VaultSeam,
): Promise<Written | WriteRefusal> {
  const erase = eraseBy(spec);
  const { id: _ignored, ...rest } = values;
  const offered = erase ? { ...rest, [erase.column]: undefined } : rest;
  const wanted = Object.fromEntries(
    Object.entries(offered).filter(([, value]) => value !== undefined));

  const checked = checkSome(spec.fields, wanted);
  if (!checked.ok) return { why: "invalid", detail: checked.why };

  const held = vaultBacked(spec, checked.values);
  if (held.length && !vault) {
    return { why: "vault_only",
      detail: `${held.join(", ")} belongs in the vault and this deployment has none wired` };
  }
  for (const name of held) {
    /* ⚠️ `vaultKeyFor`, NEVER THE BARE FIELD NAME. The vault book is keyed
       `collection.field` because two collections may both have a `notes`, and a
       write that stored the short name put the fact somewhere the declaration
       does not describe — so the export skipped it and every look answered
       "nothing kept" about a fact that was right there. */
    await vault!.keep(scope, vaultKeyFor(spec.id, name), String(checked.values[name] ?? ""));
  }

  /* ⚠️ A vault-backed value is kept above and never becomes a column here. */
  const names = Object.keys(checked.values).filter((n) => !spec.fields[n]?.vault);
  /* ⚠️ An edit that changes nothing still stamps the provenance: somebody
     reviewed this record and left it as it was, which is a fact worth keeping —
     and answering "nothing to do" would make a no-op indistinguishable from a
     refusal. */
  const sets = [...names.map((n) => `${column(n)} = ?`), `edited_at = ?`, `edited_by = ?`];
  const bound = [
    ...names.map((n) => normalise(checked.values[n])),
    now.toISOString(), by, id, ...(erase ? [scope] : []),
  ];

  const done = await db.prepare(
    `UPDATE ${table(spec.id)} SET ${sets.join(", ")}
     WHERE id = ?${erase ? ` AND ${column(erase.column)} = ?` : ""}`).bind(...bound).run();

  /* ⚠️ Reported, not assumed. A statement that matched no row is a record that
     is not the caller's, and answering 200 to it says an edit landed on
     somebody else's data. */
  if (!done.meta?.changes) return { why: "not_found" };
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
