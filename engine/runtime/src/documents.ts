/**
 * COMMITTING TO A DOCUMENT, WITHDRAWING ONE, AND CORRECTING ONE.
 *
 * ⚠️ THE LADDER AND THE GRAMMAR ARE THE KERNEL'S; WHAT IS HERE IS THE THREE
 * STATEMENTS THAT MOVE A ROW. That split is the point — whether an amendment may
 * follow a submission is a rule, provable with no database in the room, and it
 * is proved there. What cannot be proved there is that the number came from a
 * counter nobody else could take at the same instant.
 *
 * ⚠️ AND THE NUMBER IS TAKEN IN THE SAME STATEMENT THAT ADVANCES THE COUNTER.
 * Read-then-write is the shape every numbering bug has: two requests read 41,
 * both write 42, and one workspace has two invoices called INV-2026-00042 —
 * which is a legal problem, is invisible until an auditor sorts by number, and
 * cannot be repaired afterwards because both documents have been sent.
 *
 * Layer 3. Imports the kernel and the record layer.
 */

import type { CollectionSpec, DocumentMove, DocumentStanding } from "@engine/kernel";
import {
  DOCUMENT_STANDINGS, counterKey, documentEditable, eraseBy, mayMoveDocument, newId,
  readSeries, renderSeries, standingAfter,
} from "@engine/kernel";
import type { SeriesRefusal } from "@engine/kernel";
import { column, table, type Db } from "./sql.js";
import type { SchemaModule } from "./schema.js";

/* ---------------------------------------------------------------- tables --- */

/**
 * WHERE A SERIES KEEPS ITS PLACE.
 *
 * ⚠️ ONE TABLE FOR EVERY DOCUMENT IN EVERY APP ON THE SHARD, KEYED BY WORKSPACE.
 * A counter per collection would be a table per collection to migrate; a counter
 * derived from the collection's own rows would be `MAX(number) + 1`, which reads
 * a number back out of a string whose shape a workspace's pattern chose, and
 * hands out a duplicate the moment the newest document is cancelled and binned.
 *
 * ⚠️ AND THE PATTERN ON THIS ROW IS A RECORD OF WHAT THE COUNTER COUNTED, NEVER
 * THE WORKSPACE'S CHOICE. Those are two facts and conflating them made the
 * second unreadable — see the `series` table below. What this column is for is
 * telling somebody looking at a counter which format the numbers it issued were
 * in, which is the question asked of an old count and of no current one.
 */
export const NUMBERING_SCHEMA: SchemaModule = {
  id: "numbering",
  statements: [
    `CREATE TABLE IF NOT EXISTS numbering (`
    + `tenant_id TEXT NOT NULL, series_key TEXT NOT NULL, pattern TEXT NOT NULL, `
    + `next INTEGER NOT NULL, at TEXT NOT NULL, `
    + `PRIMARY KEY (tenant_id, series_key));`,
    /*
      ⚠️ WHAT THE WORKSPACE CHOSE IS A DIFFERENT FACT FROM WHAT A COUNTER
      COUNTED, AND KEEPING BOTH ON THE COUNTER ROW MADE THE FIRST UNREADABLE.
      A counter is keyed by its PERIOD — `invoice:2026` — which is derived from
      the pattern; so a read that starts by asking "what is this workspace's
      pattern" cannot use that key, because it does not have the pattern yet.
      Two tables because they answer at two different moments: this one before a
      number is issued, `numbering` as it is issued.
    */
    `CREATE TABLE IF NOT EXISTS series (`
    + `tenant_id TEXT NOT NULL, collection TEXT NOT NULL, pattern TEXT NOT NULL, `
    + `at TEXT NOT NULL, by TEXT, `
    + `PRIMARY KEY (tenant_id, collection));`,
  ],
};

/* ----------------------------------------------------------- the pattern --- */

/**
 * THE PATTERN THIS WORKSPACE NUMBERS BY, OR NULL FOR THE DECLARED ONE.
 *
 * ⚠️ ABSENT IS THE COMMON ANSWER AND IT MUST NOT COST A WRITE. Seeding every
 * workspace's row at founding would mean a deployment that edits a declared
 * default reaches new workspaces and no existing one — the same failure a
 * version-stamped catalogue exists to avoid. A missing row means "whatever the
 * app declares", for ever, including after the app changes its mind.
 */
export async function seriesFor(
  db: Db, tenantId: string, collection: string,
): Promise<string | null> {
  const row = await db.prepare(
    `SELECT pattern FROM series WHERE tenant_id = ? AND collection = ?`)
    .bind(tenantId, collection).first<{ pattern: string }>();
  return row?.pattern ?? null;
}

export type SeriesSet = { readonly ok: true } | { readonly why: SeriesRefusal };

/**
 * SET IT, OR SAY WHY THE PATTERN CANNOT BE USED.
 *
 * ⚠️ CHECKED HERE AND NOT ONLY ON THE SCREEN. The screen is one caller; an agent
 * and the API are two more, and a pattern with no counter in it numbers every
 * document a workspace ever raises the same — which does not throw, does not
 * fail a test, and is found by whoever tries to work out which of forty
 * identical invoices was paid.
 *
 * ⚠️ AND IT DOES NOT TOUCH THE COUNTER. Changing the format is not restarting
 * the count — a workspace that switched from `INV-` to `2026/` mid-year still
 * has fourteen documents behind it. Where the new pattern implies a different
 * PERIOD the restart happens by itself, because the period is part of the
 * counter's key.
 */
export async function setSeries(
  db: Db, tenantId: string, collection: string, pattern: string,
  now: string, by: string | null,
): Promise<SeriesSet> {
  const read = readSeries(pattern);
  if (typeof read === "string") return { why: read };
  await db.prepare(
    `INSERT INTO series (tenant_id, collection, pattern, at, by) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (tenant_id, collection)
     DO UPDATE SET pattern = excluded.pattern, at = excluded.at, by = excluded.by`)
    .bind(tenantId, collection, pattern, now, by).run();
  return { ok: true };
}

/** ⚠️ Back to what the app declares — deleting the row, never writing the default
    into it, so a later change to the declaration still reaches this workspace. */
export async function clearSeries(
  db: Db, tenantId: string, collection: string,
): Promise<void> {
  await db.prepare(`DELETE FROM series WHERE tenant_id = ? AND collection = ?`)
    .bind(tenantId, collection).run();
}

/** What one document collection's numbering looks like right now. */
export interface Numbering {
  readonly collection: string;
  /** ⚠️ The collection's own word for one of them — "Invoice", never "invoice". */
  readonly of: string;
  readonly pattern: string;
  /** ⚠️ Whether the workspace set it, or it is still what the app declares. */
  readonly theirs: boolean;
  /** What the next document would be called, worked out rather than guessed. */
  readonly next: string;
}

/* ------------------------------------------------------------------ read --- */

export interface Document {
  readonly id: string;
  readonly stands: DocumentStanding;
  readonly number: string | null;
  readonly amends: string | null;
  /**
   * ⚠️ DERIVED HERE SO A SCREEN NEVER WORKS IT OUT. Two readings of "may this be
   * edited" is how a form comes to offer a Save the door refuses — and the
   * screen's copy is the one that would go stale the day a fourth standing
   * existed. The database enforces it either way (see `patch`); this is what
   * stops somebody being shown a control that cannot work.
   */
  readonly editable: boolean;
}

export type MoveRefusal =
  | { readonly why: "not_found" }
  | { readonly why: "refused"; readonly because: string; readonly standing: DocumentStanding }
  | { readonly why: "unnumbered"; readonly because: string };

export interface Moved {
  readonly id: string;
  readonly stands: DocumentStanding;
  readonly number: string | null;
  /** ⚠️ Present only for an amendment: the NEW draft somebody now edits. */
  readonly draft?: string;
}

const where = (spec: CollectionSpec): string => {
  const erase = eraseBy(spec);
  return `id = ?${erase ? ` AND ${column(erase.column)} = ?` : ""}`;
};

const bind = (spec: CollectionSpec, id: string, scope: string): unknown[] =>
  eraseBy(spec) ? [id, scope] : [id];

export async function documentAt(
  db: Db, spec: CollectionSpec, scope: string, id: string,
): Promise<Document | null> {
  const row = await db.prepare(
    `SELECT id, stands, number, amends FROM ${table(spec.id)} WHERE ${where(spec)}`)
    .bind(...bind(spec, id, scope))
    .first<{ id: string; stands: string | null; number: string | null; amends: string | null }>();
  if (!row) return null;
  /*
    ⚠️ NULL IS `draft` — a row written before the rail existed was one. And a
    value that is neither null nor one of the three is read as a draft too:
    the alternative is trusting a string in a column to be a standing, which
    would let a hand-edited row through the ladder as something it is not.
  */
  const said = row.stands ?? "draft";
  const stands = (DOCUMENT_STANDINGS as readonly string[]).includes(said)
    ? said as DocumentStanding
    : "draft";
  return {
    id: row.id, stands, number: row.number, amends: row.amends,
    editable: documentEditable(stands),
  };
}

/* --------------------------------------------------------------- numbers --- */

/**
 * TAKE THE NEXT NUMBER, AND LEAVE THE COUNTER ONE HIGHER.
 *
 * ⚠️ ONE STATEMENT, AND THE `RETURNING` IS WHAT MAKES IT ONE. An upsert that
 * increments and a select that reads are two statements with a gap, and the gap
 * is where two documents get the same number. SQLite has done `RETURNING` since
 * 3.35 and D1 is well past it.
 *
 * ⚠️ THE PATTERN IS WRITTEN ON EVERY TAKE, DELIBERATELY. A workspace that edits
 * its series wants the NEXT document numbered the new way; storing the pattern
 * only on the first take would leave the row claiming a format the workspace
 * stopped using, and the operator screen showing it would be lying.
 */
export async function takeNumber(
  db: Db, tenantId: string, key: string, pattern: string, now: string,
): Promise<number> {
  const got = await db.prepare(
    `INSERT INTO numbering (tenant_id, series_key, pattern, next, at)
     VALUES (?, ?, ?, 2, ?)
     ON CONFLICT (tenant_id, series_key)
     DO UPDATE SET next = numbering.next + 1, pattern = excluded.pattern, at = excluded.at
     RETURNING next`)
    .bind(tenantId, key, pattern, now)
    .first<{ next: number }>();
  /* ⚠️ THE INSERT RETURNS THE ROW IT WROTE (2) AND THE UPDATE RETURNS THE NEW
     VALUE, so the number just taken is one below what came back either way. */
  return (got?.next ?? 2) - 1;
}

/* ----------------------------------------------------------------- moves --- */

export interface MoveAt {
  readonly now: string;
  readonly by: string | null;
  /** ⚠️ The workspace, always — a series counts within one (see `refuseCollection`). */
  readonly tenantId: string;
  /** The workspace's own pattern, where it has edited the declared one. */
  readonly series?: string;
}

/**
 * MOVE A DOCUMENT, OR SAY WHY IT WILL NOT MOVE.
 *
 * ⚠️ THE LADDER IS ASKED BEFORE ANYTHING IS WRITTEN AND THE STANDING IS PINNED
 * IN THE `WHERE` AS WELL. Asking and then writing is two steps a concurrent
 * submit fits between; the clause makes the second one refuse rather than
 * double-number a document that was already committed to a moment ago.
 */
export async function move(
  db: Db, spec: CollectionSpec, scope: string, id: string,
  what: DocumentMove, at: MoveAt,
): Promise<Moved | MoveRefusal> {
  const doc = spec.document;
  if (!doc) return { why: "not_found" };

  const held = await documentAt(db, spec, scope, id);
  if (!held) return { why: "not_found" };

  const allowed = mayMoveDocument(held.stands, what, doc);
  if (allowed !== true) return { why: "refused", because: allowed, standing: held.stands };

  if (what === "amend") return amend(db, spec, scope, held, at);

  if (what === "cancel") {
    const done = await db.prepare(
      `UPDATE ${table(spec.id)} SET stands = 'cancelled', stands_at = ?, edited_at = ?, edited_by = ?
       WHERE ${where(spec)} AND stands = 'submitted'`)
      .bind(at.now, at.now, at.by, ...bind(spec, id, scope)).run();
    if (!done.meta?.changes) {
      return { why: "refused", because: "already_cancelled", standing: "cancelled" };
    }
    return { id, stands: standingAfter(held.stands, "cancel"), number: held.number };
  }

  /*
    ⚠️ THE NUMBER IS TAKEN BEFORE THE UPDATE AND THE UPDATE CAN STILL REFUSE,
    which spends a number on a document that did not move. That is the right way
    round: a series with a gap in it is a question an accountant can answer
    ("that one was never issued"), and two documents sharing a number is one
    nobody can. Gaps are survivable; collisions are not.
  */
  const pattern = at.series?.trim() || doc.series;
  const parts = readSeries(pattern);
  if (typeof parts === "string") {
    /* ⚠️ COMPOSITION REFUSES A BAD DECLARED PATTERN, so reaching this means a
       WORKSPACE edited its series into something unreadable — which is a
       settings problem with a person attached, not a deployment fault. */
    return { why: "unnumbered", because: parts };
  }
  const counter = await takeNumber(
    db, at.tenantId, counterKey(spec.id, parts, at), pattern, at.now);
  const number = renderSeries(parts, { now: at.now, counter, fields: {} });

  const done = await db.prepare(
    `UPDATE ${table(spec.id)} SET stands = 'submitted', stands_at = ?, number = ?,
       edited_at = ?, edited_by = ?
     WHERE ${where(spec)} AND (stands IS NULL OR stands = 'draft')`)
    .bind(at.now, number, at.now, at.by, ...bind(spec, id, scope)).run();
  if (!done.meta?.changes) {
    return { why: "refused", because: "already_submitted", standing: "submitted" };
  }
  return { id, stands: standingAfter(held.stands, "submit"), number };
}

/**
 * COPY A CANCELLED DOCUMENT INTO A NEW DRAFT THAT POINTS BACK AT IT.
 *
 * ⚠️ THE COPY IS OF THE DECLARED FIELDS AND NOTHING ELSE. Carrying `number`
 * across would give the amendment the withdrawn document's number; carrying
 * `stands` would make it submitted the moment it existed; carrying `at`/`by`
 * would say somebody raised it who did not. What an amendment inherits is the
 * content, which is the only part anybody wanted to keep.
 *
 * ⚠️ AND THE ORIGINAL IS NOT TOUCHED. "Amended" is a fact about a cancelled
 * document that another one points at — a standing of its own would be a second
 * place that truth lived (see the kernel's header).
 */
async function amend(
  db: Db, spec: CollectionSpec, scope: string, held: Document, at: MoveAt,
): Promise<Moved | MoveRefusal> {
  const erase = eraseBy(spec);
  const own = Object.keys(spec.fields).filter((f) => f !== erase?.column);
  const cols = own.map(column);

  const row = await db.prepare(
    `SELECT ${cols.join(", ")} FROM ${table(spec.id)} WHERE ${where(spec)}`)
    .bind(...bind(spec, held.id, scope))
    .first<Record<string, unknown>>();
  if (!row) return { why: "not_found" };

  /* ⚠️ THE SAME PREFIX ITS ORIGINAL HAS — an amendment is another one of these,
     and an id that read differently would make the correction look like a
     different kind of record everywhere an id is shown. */
  const draft = newId(spec.id.replace(/-/g, "_"), new Date(at.now));
  const into = [
    "id", ...(erase ? [column(erase.column)] : []), ...cols,
    "at", "by", "stands", "amends",
  ];
  const values = [
    draft, ...(erase ? [scope] : []), ...cols.map((c) => row[c] ?? null),
    at.now, at.by, "draft", held.id,
  ];

  await db.prepare(
    `INSERT INTO ${table(spec.id)} (${into.join(", ")}) `
    + `VALUES (${into.map(() => "?").join(", ")})`)
    .bind(...values).run();

  return { id: held.id, stands: held.stands, number: held.number, draft };
}

/**
 * WHAT THE NEXT ONE WOULD BE CALLED — worked out, never a sentence describing it.
 *
 * ⚠️ A SETTINGS SCREEN THAT SHOWED THE PATTERN AND NOT THE RESULT WOULD BE
 * ASKING SOMEBODY TO RUN THE GRAMMAR IN THEIR HEAD. `INV-{YYYY}-{#####}` is not
 * what an accountant recognises; `INV-2026-00042` is, and it is the only form in
 * which a wrong answer is obvious before it is issued.
 *
 * ⚠️ AND IT DOES NOT TAKE A NUMBER. Reading the counter to preview a number is a
 * read that races the write that would take it — so the preview shows where the
 * count stands, and the document that is actually raised takes the next one.
 */
export async function numberingIn(
  db: Db, tenantId: string, specs: readonly CollectionSpec[], now: string,
): Promise<readonly Numbering[]> {
  const documents = specs.filter((c) => c.document);
  const found = await Promise.all(documents.map(async (spec) => {
    const theirs = await seriesFor(db, tenantId, spec.id);
    const pattern = theirs ?? spec.document!.series;
    const parts = readSeries(pattern);
    if (typeof parts === "string") {
      /* ⚠️ A WORKSPACE'S OWN PATTERN CAN BE UNREADABLE ONLY IF IT WAS WRITTEN
         BEFORE `setSeries` CHECKED — the declared one is refused at composition.
         Reported as itself rather than swallowed, so the screen can say which
         setting is wrong instead of drawing a blank where a number goes. */
      return { collection: spec.id, of: spec.label.one, pattern, theirs: !!theirs, next: "" };
    }
    const seen = await db.prepare(
      `SELECT next FROM numbering WHERE tenant_id = ? AND series_key = ?`)
      .bind(tenantId, counterKey(spec.id, parts, { now }))
      .first<{ next: number }>();
    return {
      collection: spec.id,
      of: spec.label.one,
      pattern,
      theirs: !!theirs,
      next: renderSeries(parts, { now, counter: seen?.next ?? 1, fields: {} }),
    };
  }));
  return found;
}
