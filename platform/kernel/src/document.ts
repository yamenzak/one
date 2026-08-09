/**
 * THE DOCUMENT LIFECYCLE — for collections that ASSERT something happened.
 *
 * Layer 3. Imports collection and primitives.
 *
 * A sterilisation cycle, an invoice, a signed training plan: records whose value
 * is that they cannot quietly change after the fact. Everything here is opt-in
 * per collection, because it is exactly right for those and exactly wrong for a
 * customer profile — and a framework that imposed it everywhere would be the
 * first thing anybody had to work around.
 */

import type { CollectionSpec } from "./collection.js";
import type { Instant, PlainDate } from "./primitives.js";

/* ------------------------------------------------------------- docstatus --- */

/** Stored as an integer, so the meaning is here rather than in every query. */
export const DOCSTATUS = { draft: 0, submitted: 1, cancelled: 2 } as const;
export type DocState = keyof typeof DOCSTATUS;

export type Transition = "submit" | "cancel" | "amend";

export type TransitionResult =
  | { readonly ok: true; readonly to: DocState; readonly newDocument: boolean }
  | { readonly ok: false; readonly why: string };

/**
 * ⚠️ AN AMENDMENT IS A NEW DOCUMENT, NEVER AN EDIT.
 *
 * That is the whole reason this machine exists. A cancelled record that could be
 * corrected in place would let the correction and the original occupy the same
 * identity — so a reference to it means one thing before the edit and another
 * after, and any audit trail pointing at it is describing something that no
 * longer exists.
 *
 * The amendment carries `amended_from`, so the chain is walkable in both
 * directions and nothing is lost. `newDocument` is how the caller knows to
 * insert rather than update.
 */
export function transition(from: DocState, t: Transition, spec: CollectionSpec): TransitionResult {
  if (!spec.docStatus) return { ok: false, why: `${spec.id} does not carry a document lifecycle` };
  switch (t) {
    case "submit":
      return from === "draft" ? { ok: true, to: "submitted", newDocument: false } : { ok: false, why: `cannot submit from ${from}` };
    case "cancel":
      return from === "submitted" ? { ok: true, to: "cancelled", newDocument: false } : { ok: false, why: `cannot cancel from ${from}` };
    case "amend":
      if (!spec.docStatus.amendable) return { ok: false, why: `${spec.id} is not amendable` };
      // Only a cancelled document may be amended: amending a live one would be
      // an edit wearing a different word.
      return from === "cancelled" ? { ok: true, to: "draft", newDocument: true } : { ok: false, why: `cannot amend from ${from}` };
  }
}

/**
 * Which fields a change is not allowed to touch.
 *
 * ⚠️ A DRAFT IS FULLY EDITABLE AND A SUBMITTED DOCUMENT IS NOT. Freezing the
 * declared fields at submission is what makes the record worth trusting — if the
 * quantity on a submitted cycle could still move, the signature on it means
 * nothing. Everything else stays editable, because a typo in a note is not a
 * reason to force an amendment.
 */
export function frozenFields(state: DocState, spec: CollectionSpec): readonly string[] {
  if (!spec.docStatus || state === "draft") return [];
  return spec.docStatus.immutableAfterSubmit;
}

export function refusesChange(state: DocState, spec: CollectionSpec, changed: readonly string[]): readonly string[] {
  const frozen = new Set(frozenFields(state, spec));
  return changed.filter((f) => frozen.has(f));
}

/* ---------------------------------------------------------------- naming --- */

/**
 * `CL-.YYYY.-.####` → `CL-2026-0001`.
 *
 * A human-quotable identifier, which an opaque id is not: somebody reads it down
 * a telephone, writes it on a label, or searches for it a year later.
 *
 * ⚠️ A NAME IS ALLOCATED ONCE AND NEVER REUSED, even when the document it
 * belonged to is deleted. Reuse would let two records share an identifier across
 * time, which destroys the one property a quotable name has — that saying it
 * identifies exactly one thing. The counter therefore counts allocations, not
 * live rows, and never counts down.
 */
export function formatName(series: string, counter: number, on: PlainDate): string {
  const [year = "", month = ""] = [on.slice(0, 4), on.slice(5, 7)];
  return series
    .replace(/\.YYYY\./g, year)
    .replace(/\.MM\./g, month)
    /*
      ⚠️ The trailing dot is OPTIONAL, and requiring it was the first bug here.
      `.YYYY.` is delimited on both sides because something follows it, but the
      counter is written `.####` at the END of a series — `INV-.YYYY.-.####` —
      where there is nothing to delimit against. Demanding the closing dot left
      the placeholder in the output verbatim, so every document would have been
      named `INV-2026-.####`.
    */
    .replace(/\.(#+)\.?/g, (_, hashes: string) => String(counter).padStart(hashes.length, "0"));
}

/** The counter key a series allocates from — per period, so `####` restarts. */
export function seriesKey(series: string, on: PlainDate): string {
  return series.replace(/\.YYYY\./g, on.slice(0, 4)).replace(/\.MM\./g, on.slice(5, 7)).replace(/\.(#+)\.?/g, "");
}

/* ----------------------------------------------------------- soft delete --- */

export type Deletion = { readonly kind: "archive"; readonly at: Instant } | { readonly kind: "purge" };

/**
 * What deleting means for this collection.
 *
 * ⚠️ Archiving keeps the row and the audit trail; purging does not. The choice
 * belongs to the collection because it is a RETENTION decision — a record a
 * regulation requires kept cannot be purged on a whim, and a record a person
 * asked to be forgotten cannot be archived instead.
 */
export function deletionFor(spec: CollectionSpec, at: Instant): Deletion {
  return spec.onDelete.on === "archive" ? { kind: "archive", at } : { kind: "purge" };
}

/** Whether an archived row is visible to an ordinary read. It is not. */
export const isArchived = (row: { readonly deleted_at?: string | null }): boolean => Boolean(row.deleted_at);

/* --------------------------------------------------------------- version --- */

export type WriteResult<T> = { readonly ok: true; readonly next: T } | { readonly ok: false; readonly why: "conflict" };

/**
 * ⚠️ OPTIMISTIC CONCURRENCY, AND IT IS NOT ONLY ABOUT TWO PEOPLE.
 *
 * Two humans editing one record is the case everybody pictures. The case that
 * actually bites is a tool call racing a person: same defect, worse timing, and
 * nobody watching — the assistant reads, the person saves, the assistant writes
 * back what it read, and the person's change is gone with no error anywhere.
 *
 * The expected version has to come from the READ the writer based its change on,
 * which is why it is a parameter rather than something this function could look
 * up for itself.
 */
export function applyWrite<T extends { readonly version: number }>(current: T, expectedVersion: number, next: Omit<T, "version">): WriteResult<T> {
  if (current.version !== expectedVersion) return { ok: false, why: "conflict" };
  return { ok: true, next: { ...next, version: current.version + 1 } as T };
}
