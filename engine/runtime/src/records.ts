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
import { noteScopeGone } from "./search.js";
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

/**
 * WHAT A LIST WAS ASKED FOR.
 *
 * ⚠️ EVERY FIELD OF IT IS OPTIONAL AND THE DEFAULT IS WHAT THIS ALWAYS DID —
 * fifty rows, newest first, the whole collection. A widening that changed the
 * default would change every screen in every product at once.
 */
export interface Asking {
  /** Bounded by `MOST_ROWS`, because a caller can ask for anything. */
  readonly limit?: number;
  /** ⚠️ Equality over DECLARED fields only — see `narrow`. */
  readonly where?: Readonly<Record<string, unknown>>;
  /** The `next` of the previous page, opaque to the caller. */
  readonly after?: string;
}

export interface Listed {
  readonly items: readonly Record<string, unknown>[];
  /**
   * ⚠️ HOW MANY THERE ARE, WHICH IS THE HALF THAT WAS MISSING. A page of fifty
   * out of two hundred is indistinguishable from a collection of fifty, and the
   * screen drawing it says "fifty products" with total confidence. Counting is a
   * second statement and it is worth it: a list that cannot say what it is a
   * list OF is a list that lies by omission.
   */
  readonly total: number;
  /** ⚠️ `null` at the end, so "is there more" is an answer rather than a guess. */
  readonly next: string | null;
}

/**
 * ⚠️ FIFTY BY DEFAULT AND TWO HUNDRED AT MOST. The ceiling is not tidiness: a
 * caller asking for everything is a worker holding a whole collection in memory
 * to serialise it, and the one that does it is always the biggest workspace.
 */
export const MOST_ROWS = 200;

/**
 * ⚠️ THE FILTER IS EQUALITY OVER DECLARED FIELDS, AND NOTHING ELSE. A comparison
 * language would be a query language arriving over the wire; equality answers
 * "this shelf's lines" and "this product's deliveries", which is what a screen
 * asks. Anything undeclared is DROPPED rather than refused — a client sending a
 * field this build removed should get the list, not an error about a name.
 *
 * ⚠️ AND `id` IS ALLOWED THOUGH NO COLLECTION DECLARES IT, because the platform
 * writes that column into every table and a caller narrowing to one row is
 * asking a legitimate question.
 */
const narrow = (
  spec: CollectionSpec, where: Readonly<Record<string, unknown>> | undefined,
): { readonly sql: string; readonly bound: readonly unknown[] } => {
  const parts: string[] = [];
  const bound: unknown[] = [];
  for (const [name, value] of Object.entries(where ?? {})) {
    if (name !== "id" && !(name in spec.fields)) continue;
    if (value === undefined) continue;
    parts.push(`${column(name)} = ?`);
    bound.push(normalise(value));
  }
  return { sql: parts.map((p) => ` AND ${p}`).join(""), bound };
};

/**
 * A PAGE OF A COLLECTION, AND HOW MANY THERE ARE.
 *
 * ⚠️ THE CURSOR IS `(at, id)` RATHER THAN AN OFFSET, and the difference is
 * whether the second page can miss a row. Rows are newest-first and new rows
 * arrive at the top, so an offset of fifty on a collection that gained three
 * records since the first page skips three the reader has never seen — silently,
 * in a product whose whole job is saying what is there.
 *
 * ⚠️ AND IT IS `at` PLUS `id` BECAUSE `at` IS NOT UNIQUE. An import writes eight
 * hundred rows inside one millisecond; keyed on the instant alone the page
 * boundary either repeats them or steps over them.
 */
export async function list(
  db: Db, spec: CollectionSpec, scope: string, asking: Asking = {},
): Promise<Listed> {
  const erase = eraseBy(spec);
  const want = Math.min(MOST_ROWS, Math.max(1, Math.trunc(asking.limit ?? 50)));
  const filter = narrow(spec, asking.where);

  const scoped = erase ? `${column(erase.column)} = ?` : "1 = 1";
  const where = `${scoped}${filter.sql}`;
  const bound = [...(erase ? [scope] : []), ...filter.bound];

  /* ⚠️ A PIPE, BECAUSE NEITHER HALF CAN CONTAIN ONE. An instant is ISO text and
     an id is a prefix and alphanumerics; a separator either of them could hold
     would split the cursor in the wrong place on exactly one row in a million. */
  const [cutAt, cutId] = (asking.after ?? "").split("|");
  const past = asking.after ? ` AND (at < ? OR (at = ? AND id < ?))` : "";

  /*
    ⚠️ THE COUNT AND THE PAGE GO TOGETHER, NOT ONE AFTER THE OTHER. Neither needs
    the other's answer, and a database round trip taken in SEQUENCE is a round
    trip added to the chain — which is the number the latency budget measures and
    the one somebody on a warehouse phone feels (D36). Awaited in order, this
    charged every list in every product an extra hop for a number.

    ⚠️ AND THE COUNT IGNORES THE CURSOR, deliberately. A total narrowed by the
    page boundary would fall as somebody read, which is worse than no total.
  */
  const [counted, rows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM ${table(spec.id)} WHERE ${where}`)
      .bind(...bound).first<{ n: number }>(),
    db.prepare(
      `SELECT * FROM ${table(spec.id)} WHERE ${where}${past}
        ORDER BY at DESC, id DESC LIMIT ?`)
      .bind(...bound, ...(asking.after ? [cutAt, cutAt, cutId] : []), want + 1).all(),
  ]);

  /* ⚠️ ONE MORE THAN ASKED FOR IS HOW "IS THERE ANOTHER PAGE" IS ANSWERED
     WITHOUT A SECOND QUERY — and a `next` handed back on the last page is a
     screen with a button that fetches nothing. */
  const more = rows.results.length > want;
  const items = more ? rows.results.slice(0, want) : rows.results;
  const last = items.at(-1);
  return {
    items,
    total: Number(counted?.n ?? items.length),
    next: more && last ? `${String(last.at)}|${String(last.id)}` : null,
  };
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
  /*
    ⚠️ THE INDEX IS MARKED BY THE SAME CALL THAT DELETES THE ROWS, and that is
    the whole reason it is here rather than at the four call sites. A searchable
    record erased from the database and left in the index is a deletion request
    answered with the text still findable, by meaning, for ever — and every
    caller that forgot the second step would report a clean erasure.

    ⚠️ AND IT MARKS RATHER THAN DELETING, because the ledger row is the only
    handle on the remote item. The job removes it and forgets the row then.
  */
  try {
    await noteScopeGone(db, of, scope);
  } catch {
    /* ⚠️ An older database legitimately has no ledger, and an erasure must not
       stop half way through somebody's records over a table that predates the
       feature. Same rule the per-collection delete below follows. */
  }
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
