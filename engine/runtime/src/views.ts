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
import { eraseBy, fillOf } from "@engine/kernel";
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

/**
 * RUNNING ONE OF THE APP'S OWN READ OPERATIONS, HANDED IN — see `AskedSpec`.
 *
 * ⚠️ A SEAM RATHER THAN A CALL, AND THE REASON IS D12. `performOperation` needs
 * the wiring, the tenancy, the identity and the composed app — everything the
 * HTTP door assembled before it got here — so importing it would put this module
 * on the far side of the runtime and hand a view runner the power to run
 * anything. The door supplies a closure over the request it is already inside,
 * so the permission, the entitlement, the flag and the audit row are the ones
 * every other caller gets.
 *
 * ⚠️ AND `null` IS A REFUSAL, NOT AN OUTAGE. The operation may be gated, and a
 * caller who may not run it sees the view's own empty state — which is what a
 * region withheld already looks like everywhere else on the surface.
 */
export type Ask =
  (operation: string, input: Record<string, unknown>) => Promise<Record<string, unknown> | null>;

export async function runView(
  db: Db, app: AppSpec, view: ViewSpec, scope: string, here: Here = {},
  /* ⚠️ THE PATHS THE BODY ASKED FOR, PASSED IN RATHER THAN DERIVED. A view does
     not know which screen is reading it — two screens can name the same view and
     want different joins — so what to fetch alongside is the CALLER's question.
     Deriving it here would join every reference on every read, for every screen,
     including the ones drawing nothing but a count. */
  reaches: readonly Reach[] = [],
  ask?: Ask,
): Promise<Viewed> {
  const spec = collectionFor(app, view);
  if (!spec) return { items: [], count: 0 };

  /*
    ⚠️ AN ASKED VIEW STOPS HERE, BEFORE A SINGLE CLAUSE IS BUILT. `refuseView`
    refuses one that also declares `where`, `sort`, `limit` or `tally`, so there
    is nothing below this line that could apply to it — and reaching the query
    builder with a view that has no query is how a handler's answer would come
    back silently replaced by a table scan.
  */
  if (view.asked) {
    if (!ask) return { items: [], count: 0 };
    const input: Record<string, unknown> = {};
    for (const [name, from] of Object.entries(view.asked.fills ?? {})) {
      /* ⚠️ A FILL WITH NOTHING BEHIND IT IS LEFT OUT RATHER THAN SENT EMPTY — the
         same rule the browser follows for an act. An empty string in a required
         field is a refusal that says the field is missing when the truth is that
         the screen has not resolved. */
      const source = fillOf(from);
      const value = source.of === "record" ? here.record
        : source.of === "today" ? here.today
          /* ⚠️ THE SAME DAY'S YEAR, DERIVED — see `Fill`. Reading a clock here
             would be a second device fact that can disagree with the first. */
          : source.of === "year" ? here.today?.slice(0, 4)
          /* ⚠️ A PICK IS THE ONLY PLACE A NARROWING REACHES — see `PickSpec`.
             `refuseSurface` refuses a pick no view fills from and a fill naming
             no pick, so an id absent here is a screen nobody has narrowed yet. */
          : source.of === "picked" ? here.picked?.[source.picked]
            : source.of === "says" ? String(source.says)
              /* ⚠️ A COLUMN OF THE RECORD IS THE SCREEN'S AND NOT A VIEW'S. An
                 asked view runs before any record is joined, so this source has
                 nothing to read and is left out rather than guessed at. */
              : undefined;
      /* ⚠️ AND THE ARITY IS THE SAME READING AS THE BROWSER'S — see `Fill`. Two
         resolvers of one contract is how a source comes to mean different things
         at the two ends of one wire, so `every` is applied here in the same
         place and on the same condition `fillWith` applies it. */
      if (value !== undefined && value !== "") input[name] = source.every ? [value] : value;
    }
    const said = await ask(view.asked.operation, input);
    const rows = said?.[view.asked.take];
    /* ⚠️ NOT A LIST IS NOT AN ERROR HERE, IT IS AN EMPTY VIEW. The row shape is
       the operation's and nothing checks it (see `AskedSpec`), so this is the one
       place a mismatch surfaces — and a region drawing its empty state is a far
       better answer than a renderer handed a number where it expects rows. */
    if (!Array.isArray(rows)) return { items: [], count: 0 };
    /* ⚠️ HOW MANY THERE ARE, WHERE THE HANDLER SAID — see `AskedSpec.total`. A
       bounded answer with no count reads as the whole answer, which is the one
       thing a list in an inventory product must never say. */
    const said_total = view.asked.total === undefined ? undefined : said?.[view.asked.total];
    const total = typeof said_total === "number" ? said_total : rows.length;
    return { items: rows as readonly Record<string, unknown>[], count: total };
  }

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
 * ONE ANSWER PER QUESTION, FOR THE LENGTH OF ONE SCREEN READ.
 *
 * ⚠️ A REPORT IS SEVERAL READINGS OF THE SAME MOVEMENTS, AND EACH ONE IS A VIEW.
 * An operation answers a RECORD and a view is a list, so a handler working out
 * five things at once reaches the screen as five views naming five of its output
 * fields — and every one of them was a separate call, so a screen showing the
 * recorded share beside what to buy ran the whole report five times over the same
 * period. That is the exact fault `stock.report`'s own header argues against, one
 * layer down: not four operations reading the ledger four times, but one
 * operation read four times.
 *
 * ⚠️ THE PROMISE IS CACHED, NOT THE ANSWER, because the views run together. A
 * result cache would be filled by the first call to RETURN, by which time the
 * other four have already gone out.
 *
 * ⚠️ AND IT LIVES EXACTLY AS LONG AS THE READ. There is no staleness to reason
 * about and nothing to invalidate: two views asking one question inside one
 * request are asking about one moment, and an answer that differed between them
 * would be a screen disagreeing with itself.
 *
 * ⚠️ SAFE BECAUSE AN ASKED VIEW MUST NAME A `read` — `refuseApp` refuses anything
 * else, so there is no write here whose second call was the point.
 */
const askedOnce = (ask: Ask): Ask => {
  const held = new Map<string, Promise<Record<string, unknown> | null>>();
  return (operation, input) => {
    /* ⚠️ THE FIELDS IN A FIXED ORDER, because two fills assembled in different
       orders are the same question asked twice. */
    const key = `${operation} ${JSON.stringify(Object.fromEntries(
      Object.entries(input).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))))}`;
    const already = held.get(key);
    if (already) return already;
    const run = ask(operation, input);
    held.set(key, run);
    return run;
  };
};

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
  ask?: Ask,
): Promise<Readonly<Record<string, Viewed>>> {
  const wanted = (app.views ?? []).filter((v) => ids.includes(v.id));
  const once = ask ? askedOnce(ask) : undefined;
  const done = await Promise.all(
    wanted.map((v) => runView(db, app, v, scope, here, reaches[v.id] ?? [], once)));
  return Object.fromEntries(wanted.map((v, i) => [v.id, done[i]!]));
}
