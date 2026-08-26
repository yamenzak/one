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

import type { CollectionSpec, Match, Sort, Value } from "@engine/kernel";
import { checkAll, checkSome, eraseBy, newId, vaultKeyFor } from "@engine/kernel";
import { noteScopeGone } from "./search.js";
import { column, table, type Db } from "./sql.js";
import type { Reaching } from "./reach.js";

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
  | { readonly why: "vault_only"; readonly detail: string }
  /**
   * ⚠️ ITS OWN REFUSAL, BECAUSE IT IS ITS OWN THING TO DO NEXT. "Not found" is
   * what a caller gets for a record outside their scope, and it is right there —
   * the id belongs to another workspace and saying so tells them it exists. This
   * is different: the record is their workspace's and the PLACE is not theirs,
   * so the person can be told which sites they work in and ask for another.
   */
  | { readonly why: "out_of_reach"; readonly detail: string }
  /**
   * ⚠️ A FIELD THAT MAY BE SET AND NOT CHANGED — see `FieldSpec.settled`. It is
   * its own refusal because the answer is neither "no such field" nor "you may
   * not": the field is real and the caller may edit this record. What is wrong is
   * that changing THIS one reinterprets every number already recorded against it,
   * and the way to do it deliberately is an operation that knows what else has to
   * be true first.
   */
  | { readonly why: "settled"; readonly detail: string; readonly names: readonly string[] };

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
  reaching: Reaching | null = null,
): Promise<Written | WriteRefusal> {
  const checked = checkAll(spec.fields, values);
  if (!checked.ok) return { why: "invalid", detail: checked.why };

  /* ⚠️ A RECORD IS PUT SOMEWHERE, AND SOMEWHERE HAS TO BE INSIDE THE REACH. A
     narrowed member creating a row at another site is the same leak as reading
     one, arriving from the other direction — and it is the direction a filter on
     the read alone does not touch. */
  const away = outOfReach(reaching, checked.values);
  if (away) return away;

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
  reaching: Reaching | null = null,
): Promise<Written | WriteRefusal> {
  const erase = eraseBy(spec);
  const { id: _ignored, ...rest } = values;
  const offered = erase ? { ...rest, [erase.column]: undefined } : rest;
  const wanted = Object.fromEntries(
    Object.entries(offered).filter(([, value]) => value !== undefined));

  /*
    ⚠️ BEFORE THE SHAPE CHECK, BECAUSE A SETTLED FIELD IS NOT A SHAPE PROBLEM. It
    is a perfectly valid value for a field that may only be set once — see
    `FieldSpec.settled`. Refused here rather than dropped: ignoring the key would
    answer 200 over a change that did not happen.

    ⚠️ AND IT NEEDS NO READ OF THE CURRENT ROW. "Present in a patch" is the whole
    test — resending an unchanged value is still a caller asking to set it, and a
    compare-against-stored would put a read before the write and a race between
    them. The generated update stops advertising these fields, so nothing sends
    one by accident.
  */
  const settled = Object.keys(wanted).filter((name) => spec.fields[name]?.settled);
  if (settled.length) {
    return {
      why: "settled",
      detail: `${settled.join(", ")} is set when the record is made and cannot be changed here`,
      names: settled,
    };
  }

  const checked = checkSome(spec.fields, wanted);
  if (!checked.ok) return { why: "invalid", detail: checked.why };

  /* ⚠️ AND MOVING A RECORD OUT OF YOUR REACH IS REFUSED TOO. The `WHERE` below
     asks whether the row is theirs NOW; this asks where they are putting it, and
     without it a narrowed member can push a record to a site they cannot see —
     which loses it, from their side, permanently. */
  const away = outOfReach(reaching, checked.values);
  if (away) return away;

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
  /* ⚠️ IN THE `WHERE`, LIKE THE SCOPE, AND FOR THE SAME REASON. A read to check
     the place followed by a write leaves a window between them; in the statement
     the row is either inside the caller's reach or not updated. */
  const near = within(reaching);
  const bound = [
    ...names.map((n) => normalise(checked.values[n])),
    now.toISOString(), by, id, ...(erase ? [scope] : []), ...near.bound,
  ];

  const done = await db.prepare(
    `UPDATE ${table(spec.id)} SET ${sets.join(", ")}
     WHERE id = ?${erase ? ` AND ${column(erase.column)} = ?` : ""}${near.sql}`)
    .bind(...bound).run();

  /* ⚠️ Reported, not assumed. A statement that matched no row is a record that
     is not the caller's, and answering 200 to it says an edit landed on
     somebody else's data. */
  if (!done.meta?.changes) return { why: "not_found" };
  return { id };
}

/**
 * THE PART OF EVERY STATEMENT THAT SAYS "AND ONLY WHERE THEY WORK".
 *
 * ⚠️ ONE BUILDER, USED BY THE READ AND THE WRITE ALIKE, because a filter written
 * twice is a filter that narrows a list and lets an update through. `null` is
 * the whole workspace and contributes nothing to the statement, which is what
 * makes this cost nothing in every product that never declared a reach.
 *
 * ⚠️ AND AN EMPTY SET IS `1 = 0` RATHER THAN NOTHING. Somebody narrowed to no
 * places reaches nothing; an empty `IN ()` is a syntax error in SQLite, and
 * omitting the clause would turn "nowhere" into "everywhere" — the one direction
 * a mistake here must never go.
 */
/**
 * WHETHER A WRITE IS PUTTING A RECORD SOMEWHERE THE CALLER DOES NOT WORK.
 *
 * ⚠️ A VALUE THE WRITE DOES NOT MENTION IS NOT CHECKED, and that is right for
 * both verbs. A create leaves the column null — a record that is nowhere is in
 * nobody's way — and an update that does not touch the place is asking about a
 * row whose place the `WHERE` already tested.
 */
const outOfReach = (
  reaching: Reaching | null, values: Record<string, unknown>,
): WriteRefusal | null => {
  if (!reaching) return null;
  const to = values[reaching.column];
  if (to === undefined || to === null) return null;
  if (reaching.values.includes(String(to))) return null;
  return { why: "out_of_reach", detail: String(to) };
};

const within = (
  reaching: Reaching | null,
): { readonly sql: string; readonly bound: readonly unknown[] } => {
  if (!reaching) return { sql: "", bound: [] };
  if (!reaching.values.length) return { sql: " AND 1 = 0", bound: [] };
  return {
    sql: ` AND ${column(reaching.column)} IN (${reaching.values.map(() => "?").join(", ")})`,
    bound: reaching.values,
  };
};

/** ⚠️ Booleans are integers in SQLite and JSON is text. Everything else is itself. */
const normalise = (value: unknown): unknown => {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return value;
};

export async function readOne(
  db: Db, spec: CollectionSpec, scope: string, id: string,
  reaching: Reaching | null = null,
): Promise<Record<string, unknown> | null> {
  const erase = eraseBy(spec);
  const near = within(reaching);
  const sql = erase
    ? `SELECT * FROM ${table(spec.id)} WHERE id = ? AND ${column(erase.column)} = ?${near.sql}`
    : `SELECT * FROM ${table(spec.id)} WHERE id = ?${near.sql}`;
  const row = await db.prepare(sql)
    .bind(...(erase ? [id, scope] : [id]), ...near.bound).first();
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
  /**
   * ⚠️ WHAT A DECLARED VIEW NARROWS BY, WHICH IS FOUR TESTS AND NOT ONE. `where`
   * is equality and came first because that is all an operation's caller could
   * ask for; a `ViewSpec` also says `isnt`, `set` and `unset` — and "the ones
   * nobody has filed yet" is a view every product in this repository wants and
   * equality cannot express. There is still no comparison here, deliberately:
   * the day `gt` arrives the manifest has become a query language (D92).
   */
  readonly match?: readonly Match[];
  /** ⚠️ A DECLARED field, ascending or descending. Never an expression. */
  readonly sort?: Sort;
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
/**
 * WHAT THE SCREEN ALREADY KNOWS — the record it is about, who is reading, and
 * what day it is where they are standing.
 *
 * ⚠️ `today` IS THE DEVICE'S AND IT ARRIVES WITH THE REQUEST — see `Fill`. A
 * shelf life is counted where the shelf is: the worker has no way to know what
 * day it is where somebody is, and its own calendar would call a box expired the
 * evening before it is, or current for hours after it is not. Nothing narrows on
 * it; it is here because an asked view FILLS it, and `Fill`'s two values are
 * exactly these two.
 */
export interface Here {
  readonly record?: string | undefined;
  readonly me?: string | undefined;
  readonly today?: string | undefined;
}

export const narrow = (
  spec: CollectionSpec, where: Readonly<Record<string, unknown>> | undefined,
  matches?: readonly Match[], here: Here = {},
): { readonly sql: string; readonly bound: readonly unknown[] } => {
  const parts: string[] = [];
  const bound: unknown[] = [];
  for (const [name, value] of Object.entries(where ?? {})) {
    if (name !== "id" && !(name in spec.fields)) continue;
    if (value === undefined) continue;
    parts.push(`${column(name)} = ?`);
    bound.push(normalise(value));
  }
  /*
    ⚠️ AND `unset` IS BOTH NULL AND EMPTY, WHICH IS NOT FUSSINESS. A text column
    a person cleared holds `''` and one nothing ever wrote holds NULL; SQL says
    those are different and a person looking at the screen says they are the
    same thing — "no supplier". A view that tested only NULL would answer half
    the rows it is about, and the half it missed would be the ones somebody had
    actually touched.
  */
  for (const one of matches ?? []) {
    const at = "field" in one ? one.field : "";
    if (at !== "id" && !(at in spec.fields)) continue;
    if ("is" in one) { parts.push(`${column(at)} = ?`); bound.push(normalise(said(one.is, here))); }
    else if ("isnt" in one) { parts.push(`${column(at)} <> ?`); bound.push(normalise(said(one.isnt, here))); }
    else if ("set" in one) parts.push(`(${column(at)} IS NOT NULL AND ${column(at)} <> '')`);
    else parts.push(`(${column(at)} IS NULL OR ${column(at)} = '')`);
  }
  return { sql: parts.map((p) => ` AND ${p}`).join(""), bound };
};

/**
 * WHAT A `Value` IS, HERE.
 *
 * ⚠️ `here` IS WHAT MAKES A VIEW REUSABLE RATHER THAN ONE PER RECORD. "The
 * shelves inside this one" is one declaration read from every location; without
 * it the manifest would carry a view per row, which is not a declaration at all.
 */
const said = (v: Value, here: Here): unknown => {
  if ("literal" in v) return v.literal;
  /*
    ⚠️ `null` RATHER THAN `undefined`, AND IT IS NOT TIDINESS. A detail view runs
    on a screen whose record has not resolved yet — a fresh address, a back
    button mid-flight — and D1 refuses to bind `undefined` at all, so the whole
    screen answers a type error instead of a page. Bound as null the comparison
    matches nothing, which is the true answer: nothing is inside a shelf nobody
    has named yet.
  */
  return here[v.here] ?? null;
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
  reaching: Reaching | null = null, here: Here = {},
): Promise<Listed> {
  const erase = eraseBy(spec);
  const want = Math.min(MOST_ROWS, Math.max(1, Math.trunc(asking.limit ?? 50)));
  const filter = narrow(spec, asking.where, asking.match, here);
  /* ⚠️ THE COUNT CARRIES IT TOO, which is the half a filter applied to the page
     alone would miss — "12 of 400" over a shelf holding twelve is a number that
     makes somebody go looking for records they will never be shown. */
  const near = within(reaching);

  const scoped = erase ? `${column(erase.column)} = ?` : "1 = 1";
  const where = `${scoped}${filter.sql}${near.sql}`;
  const bound = [...(erase ? [scope] : []), ...filter.bound, ...near.bound];

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

/**
 * HOW MANY OF EACH, IN ONE ASK.
 *
 * ⚠️ A SCREEN THAT LEADS WITH THREE NUMBERS MADE THREE REQUESTS FOR THEM, and
 * every one carried the platform's own preamble — identity, workspace,
 * membership — to answer `SELECT COUNT(*)`. Measured on OneInventory's home
 * screen that is three round trips and about nine queries for three integers,
 * which is what "opening it is slow" is made of. The counts go together now,
 * behind one request.
 *
 * ⚠️ IT IS `list`'s OWN `where`, DELIBERATELY SHARED. A count that scopes
 * differently from the list it is a count OF is the worst kind of wrong: the
 * hero says four hundred, the screen behind it shows twelve, and both are
 * confident. Erasure scope and reach are the two that decide it, and they are
 * read here exactly as they are there.
 *
 * ⚠️ AND A COLLECTION THE ASKER MAY NOT READ IS ABSENT, NEVER ZERO (D57). "You have
 * none" and "this is not yours to see" are different answers, and a screen given
 * the first cannot tell. Which is why the filtering is the CALLER's — this
 * counts what it is handed.
 *
 * ⚠️ `scope` IS PER COLLECTION AND NOT ONE STRING, because the two scopes are
 * two different values. A tenant's records answer to the workspace and a
 * person's answer to the account, so a single id counted against a mixed list is
 * a number that is right for some rows and zero for the rest — and zero is
 * exactly what an empty collection looks like.
 */
export async function countAll(
  db: Db, specs: readonly CollectionSpec[],
  scope: (spec: CollectionSpec) => string,
  reaching: (spec: CollectionSpec) => Reaching | null = () => null,
): Promise<Readonly<Record<string, number>>> {
  if (!specs.length) return {};
  /* ⚠️ TOGETHER, NOT ONE AFTER THE OTHER — the same reason `list` races its own
     count against its page. Awaited in order these are N round trips in a chain,
     which is the number a warehouse phone feels (D36). `Db` has no `batch`, and
     widening the contract for this would be a second way to ask a question every
     other caller asks this way. */
  const counted = await Promise.all(specs.map((spec) => {
    const erase = eraseBy(spec);
    const near = within(reaching(spec));
    const where = `${erase ? `${column(erase.column)} = ?` : "1 = 1"}${near.sql}`;
    return db.prepare(`SELECT COUNT(*) AS n FROM ${table(spec.id)} WHERE ${where}`)
      .bind(...(erase ? [scope(spec)] : []), ...near.bound).first<{ n: number }>();
  }));
  return Object.fromEntries(specs.map((spec, i) => (
    [spec.id, Number(counted[i]?.n ?? 0)])));
}

/**
 * REMOVE A RECORD, IN THE CALLER'S OWN SCOPE AND INSIDE THEIR REACH.
 *
 * ⚠️ IT LIVES HERE BECAUSE THE OTHER FOUR STATEMENTS DO. Written at the call
 * site it was the one of the five that carried the scope and not the reach — a
 * narrowed member could not read a row at another site and could delete it, on a
 * guessed id, which is the worst of the five to get wrong.
 *
 * ⚠️ AND IT REPORTS WHETHER IT MATCHED. A delete that matched nothing answering
 * 200 says a record was removed when it was somebody else's and is still there.
 */
export async function drop(
  db: Db, spec: CollectionSpec, scope: string, id: string,
  reaching: Reaching | null = null,
): Promise<boolean> {
  const erase = eraseBy(spec);
  const near = within(reaching);
  const done = await db.prepare(
    `DELETE FROM ${table(spec.id)} WHERE id = ?${
      erase ? ` AND ${column(erase.column)} = ?` : ""}${near.sql}`)
    .bind(id, ...(erase ? [scope] : []), ...near.bound).run();
  return !!done.meta?.changes;
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
