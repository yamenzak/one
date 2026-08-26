/**
 * A DECLARED VIEW, RUN.
 *
 * ⚠️ `AppSpec.views` WAS DECLARED, REFUSED WHEN WRONG, AND SERVED BY NOTHING.
 * Stage 89 added the shape, stage 96's renderer takes a view's ROWS as input,
 * and between the two there was no code that produced any — which is the exact
 * "built and reached from nowhere" shape `capability.test.mjs` has been naming
 * since, and the reason a declared screen could not be drawn against a real
 * workspace no matter how complete the surface was.
 *
 * ⚠️ A VIEW SORTS AND IS BOUNDED; IT DOES NOT PAGE, and that falls out of how
 * paging works rather than from taste. `list`'s cursor is `(at, id)` because
 * rows are newest-first and new ones arrive at the top — an offset would let the
 * second page step over a row nobody has seen. A view that sorts by a field of
 * its own has no such cursor to hand out, so it answers a bounded set and says
 * how many there are. A screen wanting the four-hundredth row wants `list`.
 *
 * ⚠️ AND `here` IS WHAT MAKES ONE DECLARATION SERVE EVERY RECORD. "The shelves
 * inside this one" is one view read from every location; without a value that
 * means "the record this screen is about", a manifest would need a view per row,
 * which is not a declaration.
 */

import type { AppSpec, CollectionSpec, Reach, Viewed, ViewSpec } from "@engine/kernel";
import { eraseBy } from "@engine/kernel";
import { joinRows, tallyRows } from "./joined.js";
import { narrow, type Here } from "./records.js";
import { column, table, type Db } from "./sql.js";

/** ⚠️ The same ceiling a list has. A view is a screen's block, not an export. */
const MOST = 200;

/* ⚠️ `Viewed` IS THE KERNEL'S — see its header. The renderer reads it, so the
   shape has one home rather than one at each end of the wire. */
export type { Viewed };

/**
 * ⚠️ NOT EXPORTED: it is read once, in the function below. A helper published
 * out of a module nothing else reads it from is a seam somebody will one day
 * bind to, and this one is an implementation detail of running a view.
 *
 * ⚠️ THE COLLECTION IS RESOLVED HERE RATHER THAN TRUSTED, even though
 * `refuseView` has already refused a view over a collection nobody declares. A
 * runtime that indexes on a name from a manifest it did not itself validate is
 * one line from a table name it built out of a string.
 */
const collectionFor = (
  app: AppSpec, view: ViewSpec,
): CollectionSpec | undefined => app.collections?.find((c) => c.id === view.of);

export async function runView(
  db: Db, app: AppSpec, view: ViewSpec, scope: string, here: Here = {},
  /* ⚠️ THE PATHS THE BODY ASKED FOR, PASSED IN RATHER THAN DERIVED. A view does
     not know which screen is reading it — two screens can name the same view and
     want different joins — so what to fetch alongside is the CALLER's question.
     Deriving it here would join every reference on every read, for every screen,
     including the ones drawing nothing but a count. */
  reaches: readonly Reach[] = [],
): Promise<Viewed> {
  const spec = collectionFor(app, view);
  if (!spec) return { items: [], count: 0 };

  const erase = eraseBy(spec);
  const filter = narrow(spec, undefined, view.where, here);
  const scoped = erase ? `${column(erase.column)} = ?` : "1 = 1";
  const where = `${scoped}${filter.sql}`;
  const bound = [...(erase ? [scope] : []), ...filter.bound];

  /* ⚠️ THE DECLARED FIELD OR NOTHING. A sort naming a column that is not on the
     collection is refused at composition; this is the belt, and it falls back to
     the same order every list uses rather than to no order at all — an unordered
     answer is one that comes back differently on two reads of the same data. */
  const by = view.sort && (view.sort.by === "id" || view.sort.by in spec.fields)
    ? `${column(view.sort.by)} ${view.sort.dir === "down" ? "DESC" : "ASC"}, id DESC`
    : "at DESC, id DESC";
  const want = Math.min(MOST, Math.max(1, Math.trunc(view.limit ?? 50)));

  /* ⚠️ THE COUNT AND THE ROWS TOGETHER, because neither needs the other and a
     round trip taken in sequence is a hop added to the chain (D36). */
  const [counted, rows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM ${table(spec.id)} WHERE ${where}`)
      .bind(...bound).first<{ n: number }>(),
    db.prepare(`SELECT * FROM ${table(spec.id)} WHERE ${where} ORDER BY ${by} LIMIT ?`)
      .bind(...bound, want).all(),
  ]);

  /* ⚠️ THE JOIN THEN THE TALLY, ON THE ROWS RATHER THAN IN SEQUENCE WITH THE
     FETCH. Both read the same rows and neither needs the other, so they are two
     statements each over the ids already in hand. */
  const [held, counts] = await Promise.all([
    joinRows(db, rows.results, reaches, app.collections ?? [], scope),
    tallyRows(db, rows.results, view.tally ?? [], app.collections ?? [], scope),
  ]);
  /* ⚠️ MERGED BY POSITION, WHICH IS SAFE BECAUSE BOTH MAP THE SAME ARRAY IN
     ORDER. Merging by id would be a second index over rows already aligned. */
  const items = held.map((row, i) => ({ ...row, ...counts[i] }));
  return { items, count: counted?.n ?? rows.results.length };
}

/**
 * Every view a screen's body reads, run together.
 *
 * ⚠️ IN ONE ROUND TRIP, WHICH IS WHY IT IS A FUNCTION RATHER THAN N CALLS. A
 * screen's regions each wait on their own outcome in the browser; the fetching
 * does not get to be N sequential queries behind one door.
 */
export async function runViews(
  db: Db, app: AppSpec, ids: readonly string[], scope: string, here: Here = {},
  /** ⚠️ By view id, because a body's paths are per block and a block reads one view. */
  reaches: Readonly<Record<string, readonly Reach[]>> = {},
): Promise<Readonly<Record<string, Viewed>>> {
  const wanted = (app.views ?? []).filter((v) => ids.includes(v.id));
  const done = await Promise.all(
    wanted.map((v) => runView(db, app, v, scope, here, reaches[v.id] ?? [])));
  return Object.fromEntries(wanted.map((v, i) => [v.id, done[i]!]));
}
