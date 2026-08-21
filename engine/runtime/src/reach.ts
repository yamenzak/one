/**
 * HOW FAR THIS CALLER REACHES, RESOLVED ONCE PER REQUEST.
 *
 * ⚠️ THE GRANT NAMES A PLACE AND THE FILTER NEEDS EVERY PLACE UNDER IT. A
 * warehouse holds aisles and an aisle holds bins, so "you keep the stock at
 * Northgate" has to reach four hundred rows nobody listed — and a grant stored
 * as a flat set would make every bin added afterwards invisible to the person
 * who works there, silently, on the day it was created.
 *
 * ⚠️ AND THE WALK IS PAID FOR ONLY BY SOMEBODY WHO IS NARROWED. A member who
 * reaches the whole workspace resolves to `null` before any query is made, which
 * is every member of every product that never declared a reach and every member
 * of one that did until somebody is narrowed. The cost of this feature is on the
 * accounts that bought it.
 *
 * ⚠️ THE PLACES ARE READ AS `(id, parent)` AND NOTHING ELSE. A workspace can
 * hold thousands of them; pulling whole rows to compute a set of ids is a
 * request that gets slower the more shelves a business has.
 */

import type { AppSpec, ReachBook } from "@engine/kernel";
import { reachOf, spread } from "@engine/kernel";
import { column, table, type Db } from "./sql.js";

/**
 * ⚠️ `null` IS THE WHOLE WORKSPACE AND IT IS THE ANSWER TO THREE DIFFERENT
 * QUESTIONS: this product declares no reach, this person was never narrowed, or
 * there is nobody signed in for a narrowing to be about. All three mean the
 * filter stands down, and none of them is a state a screen has to explain.
 */
export async function reachIn(
  db: Db, app: AppSpec, book: ReachBook | undefined,
): Promise<readonly string[] | null> {
  if (!app.reach) return null;
  const granted = reachOf(book, app.id);
  if (granted === null) return null;
  /* ⚠️ NOWHERE IS AN ANSWER, and it short-circuits rather than walking a tree
     for a set that cannot grow. Somebody narrowed to no places reads nothing,
     deliberately — the other reading of an empty list is that a typo widens
     access to everything. */
  if (granted.length === 0) return [];
  if (!app.reach.nests) return granted;

  const places = app.collections.find((c) => c.id === app.reach!.of);
  if (!places) return granted;
  /* ⚠️ THROUGH `column`/`table`, WHICH VALIDATE. SQL has no parameter for an
     identifier, so a generated statement writes the name in — and the name here
     came out of a manifest rather than out of a request. */
  const rows = await db.prepare(
    `SELECT id, ${column(app.reach.nests)} AS parent FROM ${table(places.id)}`)
    .all<{ id: string; parent: string | null }>();
  return spread(granted, Object.fromEntries(
    (rows.results ?? []).map((r) => [r.id, r.parent ?? null])));
}

/**
 * THE FILTER ONE COLLECTION'S READS AND WRITES CARRY.
 *
 * ⚠️ A COLLECTION THAT NAMES NO PLACE IS NEVER NARROWED, which is what makes a
 * product's own catalogue readable from every site. What must not happen is a
 * collection that HAS a place and does not declare it — `refuseReach` is where
 * that is caught, at composition, because at runtime it looks like working.
 */
export interface Reaching {
  readonly column: string;
  readonly values: readonly string[];
}

export const reachingBy = (
  reachBy: string | undefined, reach: readonly string[] | null,
): Reaching | null =>
  reachBy === undefined || reach === null ? null : { column: reachBy, values: reach };
