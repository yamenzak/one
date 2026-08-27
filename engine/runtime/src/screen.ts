/**
 * WHAT A DECLARED SCREEN NEEDS TO BE DRAWN — its record, and its views.
 *
 * ⚠️ ONE REQUEST PER SCREEN, NOT ONE PER BLOCK. A body reads several views and a
 * browser fetching each one separately pays a round trip per block on a
 * warehouse phone (D36) — and worse, the blocks then arrive at different times,
 * so a screen assembles itself in front of somebody rather than appearing. The
 * screen is the unit because the screen is what a person opened.
 *
 * ⚠️ AND THE PERMISSION IS THE COLLECTIONS', NOT THE SCREEN'S. A screen carries
 * a `permission` for whether it is offered; what this door hands back is ROWS,
 * and the permission that governs a row is the one its collection declares.
 * Checking only the screen's would let a screen that asks for `stock:read`
 * return supplier rows to somebody who may not read suppliers — which is not a
 * bug in this file, it is a bug in the manifest that this file would carry out.
 * Every collection a view reads is asked for, separately.
 *
 * ⚠️ THE RECORD IS OPTIONAL AND ITS ABSENCE IS NOT AN ERROR. A `list` screen is
 * about a collection rather than a row; a `detail` screen with no id yet is a
 * screen whose address has not finished resolving. Both answer views and no
 * record, and the renderer already draws a body whose `field` reads resolve to
 * nothing — it is the same answer as a record with empty columns.
 */

import type { AppSpec, FieldSpec, Fields, Fill, Reach, ScreenSpec } from "@engine/kernel";
import {
  SCREEN_PATH, actsIn, columnsIn, editsIn, eraseBy, fieldsIn, fillsIn, namesIn, operationsFor,
  permissionFor, reachFor, verbId, viewsIn,
} from "@engine/kernel";
import { joinRows } from "./joined.js";
import { readOne } from "./records.js";
import { runViews, type Ask, type Viewed } from "./views.js";
import { column, table, type Db } from "./sql.js";

/* ⚠️ `SCREEN_PATH` IS THE KERNEL'S — see its header. The browser speaks it too,
   and a constant each end declares is two strings kept in step by nothing. */
export { SCREEN_PATH };

export interface Drawn {
  readonly record: Record<string, unknown> | null;
  readonly views: Readonly<Record<string, Viewed>>;
  /**
   * WHAT THE BODY'S `does` NAMES, WITH THE INPUT EACH ONE TAKES.
   *
   * ⚠️ SENT WITH THE SCREEN RATHER THAN LOOKED UP IN THE BROWSER, and that is
   * what lets the app's own chunk be deleted. A form drawn from an operation's
   * declaration needs the declaration; the alternative is the product shipping
   * its manifest to every browser, which is the weight D17 exists about and the
   * dependency stage 98 exists to remove.
   *
   * ⚠️ ONLY WHAT THIS SCREEN OFFERS. Sending the whole catalogue would put every
   * operation in the product on the wire for a screen with one button on it.
   */
  readonly acts: Readonly<Record<string, Act>>;
  /**
   * WHAT EACH NARROWING OFFERS, BY PICK ID — see `PickSpec`.
   *
   * ⚠️ ONLY THE ONES BACKED BY A COLLECTION. A pick with a written set of options
   * already has them in the body the browser is holding; sending those back would
   * be the manifest arriving twice, and the two could disagree.
   */
  readonly picks: Readonly<Record<string, readonly Choice[]>>;
  /**
   * WHICH OF THE SUBJECT'S FIELDS THIS SCREEN OFFERS TO CHANGE, WITH THE
   * DECLARATION EACH ONE IS — see `BlockSpec.edits`.
   *
   * ⚠️ THE SPEC AND NOT A FLAG, because the sheet that opens is drawn FROM the
   * declaration: the control, the help under it, the option names, the bounds.
   * A boolean here would leave the browser holding a pencil and no way to draw
   * what it opens, which is the manifest-in-every-browser weight D17 refuses.
   *
   * ⚠️ AND IT IS EMPTY WHERE THE CALLER MAY NOT WRITE, so the pencil is not
   * drawn at all. A disabled one invites somebody to go looking for how to
   * enable it — `FieldRow.onEdit` has said so since it was written — and one
   * that opens onto a Save the door refuses is worse: they type the correction
   * first.
   */
  readonly edits: Fields;
  /**
   * WHAT THIS RECORD IS CALLED — the one name, for whoever draws the screen.
   *
   * ⚠️ A SCREEN ABOUT ONE THING IS NAMED BY THAT THING, AND THE MANIFEST CANNOT
   * SAY SO. `ScreenSpec.label` is the word for the KIND — "Product" — because it
   * is written once and read by a nav item, a shortcut tile and a permission
   * refusal, none of which is about a particular row. A page titled "Product"
   * over a page about the clear casting resin is a heading that answers a
   * question nobody asked.
   *
   * ⚠️ AND IT USED TO TRAVEL INSIDE `aside`, WHICH IS THE PAYLOAD FOR DELETING
   * ONE. Same string, resolved by the same `namesIn`, sent only where the caller
   * `holds` the update grant — so a member who may read a product and not change
   * it opened a page with no name on it, and the fix would have been to widen a
   * delete sheet's gate. A fact about the record belongs on the record's answer.
   *
   * ⚠️ `null` WHERE THERE IS NO RECORD OR NOTHING NAMES IT — a list screen, an
   * address still resolving, a collection of rows with no text field on them.
   * The caller falls back to the screen's own label, which is the honest answer
   * to "one of these, unnamed".
   */
  readonly name: string | null;
  /**
   * WHETHER THIS RECORD CAN BE PUT ASIDE, AND WHAT TO CALL IT WHEN ASKING — see
   * `Aside`.
   *
   * ⚠️ DERIVED RATHER THAN DECLARED, WHICH IS WHY IT IS HERE AT ALL. Every
   * detail screen in every product has the same two ways a record leaves, and a
   * manifest that had to say so per screen would be a manifest with the same
   * three lines on forty of them — and thirty-nine right, one forgotten.
   *
   * ⚠️ AND THE WORDS TRAVEL WITH IT. The sheet asks "Delete Casting resin,
   * clear?" using the COLLECTION'S own word for one of them; a browser that had
   * to work either out would need the manifest, which is the weight D17 refuses.
   *
   * ⚠️ `null` IS THE WHOLE ANSWER TO "NO". This screen is about no record, or
   * the record has not arrived, or this person may not write — three true
   * things, one outcome: nothing to press.
   */
  readonly aside: Aside | null;
}

/** ⚠️ What the sheet needs to ask its question — see `Drawn.aside`. */
export interface Aside {
  /** The collection's own word for one of them — "Product", "Shelf". */
  readonly of: string;
  /** What this one is called, from the field the collection says names it. */
  readonly name: string;
  /**
   * ⚠️ FALSE WHERE THE COLLECTION HAS NO `delete` VERB — see
   * `CollectionSpec.without`. A membership is claimed rather than created and
   * removed rather than deleted; offering to bin one would be a control with no
   * operation behind it.
   */
  readonly bin: boolean;
  /** Whether it is already aside, and which way — so the screen can say so. */
  readonly already: "frozen" | "binned" | null;
}

export interface Act {
  readonly summary: string;
  readonly input: Fields;
  /**
   * ⚠️ WHAT THE SCREEN SUPPLIES RATHER THAN ASKS FOR — see `Fill`. Without it the
   * first form a declared screen draws asks somebody to type the id of the thing
   * they are standing on.
   */
  readonly fills: Readonly<Record<string, Fill>>;
  /**
   * WHAT A `ref` INPUT MAY BE, BY FIELD NAME — the rows, named.
   *
   * ⚠️ WITHOUT THIS EVERY DECLARED FORM ASKS FOR AN IDENTIFIER. An operation
   * taking a `ref` is asking "which one", and the declared form drew a text box:
   * `stock.move`'s "To" meant typing a location id somebody would have to find
   * first. The rows are what turns it into a question a person can answer.
   *
   * ⚠️ SENT WITH THE SCREEN RATHER THAN FETCHED WHEN THE SHEET OPENS, and the
   * reason is where these forms are used. A press on a warehouse phone must open
   * a filled form, not a spinner — and this is one more statement in a batch the
   * screen is already running, rather than a round trip on the gesture.
   *
   * ⚠️ AND IT IS BOUNDED, DELIBERATELY — see `CHOICES_MOST`. A picker is a
   * question with an answer somebody can find by looking; past that ceiling the
   * right control is a search, and shipping ten thousand rows to a phone to
   * populate a dropdown is the failure this whole layer exists to avoid.
   */
  readonly choices: Readonly<Record<string, readonly Choice[]>>;
}

export interface Choice { readonly id: string; readonly label: string }

/**
 * ⚠️ WHAT A PICKER MAY HOLD, AND IT IS A CEILING ON THE WIRE RATHER THAN ON THE
 * TRUTH. A workspace with more locations than this has a form whose control is
 * the wrong one — and the honest failure is a list that stops, not a screen that
 * takes four seconds to open. The collection's own list operation is where the
 * whole set is answered.
 */
export const CHOICES_MOST = 200;

/** ⚠️ Refused rather than empty — see `Refused`. */
export interface Refused { readonly needs: string }

/**
 * EVERY PATH THIS BODY NAMES, RESOLVED ONCE — the subject's own and each view's.
 *
 * ⚠️ RESOLVED HERE RATHER THAN GUESSED BY THE RUNNER, AND ONCE RATHER THAN
 * TWICE. `refuseSurface` has already refused a path that does not resolve, so a
 * `string` back from `reachFor` is a manifest that never composed — it is
 * dropped rather than thrown, because re-raising would be a second answer to a
 * question already asked. What matters more is that `collectionsFor` and
 * `drawnFor` read the SAME resolution: the permission check and the fetch
 * disagreeing about which collections a screen touches is how a joined column
 * comes to be served past the grant that governs it.
 */
/* ⚠️ ONLY THE HOPS. A `self` reach is a plain column already on the row, so
   keeping it would put the row's own collection in the touched list twice and
   ask `joinRows` for a query with nothing to fetch. */
type Hop = Extract<Reach, { readonly on: "ref" }>;

const reachesFor = (app: AppSpec, screen: ScreenSpec) => {
  const collections = app.collections ?? [];
  const resolve = (held: Fields | undefined, paths: readonly string[]): readonly Hop[] => (held
    ? paths.map((path) => reachFor(path, held, collections))
      .filter((r): r is Hop => typeof r !== "string" && r.on === "ref")
    : []);

  const byView: Record<string, readonly Hop[]> = {};
  for (const [view, cols] of Object.entries(screen.body ? columnsIn(screen.body) : {})) {
    const of = (app.views ?? []).find((v) => v.id === view);
    byView[view] = resolve(collections.find((c) => c.id === of?.of)?.fields, cols);
  }

  /*
    ⚠️ AND THE SUBJECT REACHES TOO, WHICH IS THE HALF THAT WAS MISSING. The
    kernel has always accepted `product.name` as a `field` read on a detail
    screen — `refuseSurface` resolves it through `reachFor` and refuses a path
    that does not — and nothing on this side ever fetched the far end, so the
    binding composed, typechecked and drew a blank. A screen about a stock line
    that cannot say which product it is about is a screen about an id.
  */
  const subject = resolve(
    collections.find((c) => c.id === screen.of)?.fields,
    screen.body ? fieldsIn(screen.body) : [],
  );

  return { subject, byView };
};

/**
 * ⚠️ EVERY COLLECTION THE SCREEN TOUCHES (D93), WHICH IS ITS OWN, ITS VIEWS' AND
 * EVERYTHING THEY REACH INTO. The subject's collection is in the list because a
 * `detail` screen hands back the record itself, and a record is rows too.
 *
 * ⚠️ THE REACHED ONES ARE THE SHARP HALF, AND THEY WERE MISSING. A joined column
 * is a field of ANOTHER collection's row — `product.name` on a stock listing is
 * the product's name — so a screen listing `location:read` and showing
 * `product.name` handed out catalogue rows to somebody with no `product:read`.
 * The screen composes, the header of this file warns about exactly this shape
 * one collection over, and the only thing between the two was that a hop was not
 * counted as a touch.
 */
/**
 * EVERY `ref` INPUT OF EVERY ACT THIS BODY OFFERS — see `Act.choices`.
 *
 * ⚠️ READ ONCE AND USED BY BOTH ENDS, for the reason `reachesFor` is. The
 * permission check and the fetch have to agree about which collections a screen
 * touches; two walks of one question is how a picker comes to be served past the
 * grant that governs the rows in it.
 */
/**
 * EVERY OPERATION A SCREEN OFFERS, WHATEVER KIND OF SCREEN IT IS.
 *
 * ⚠️ THE BODY WAS THE ONLY ANSWER AND A STORY HAS NONE, so a declared flow
 * reached a browser with an empty `acts` map — and the flow's controls come from
 * the write's own `input`, so every step drew its question over nothing. The
 * declaration composed, the door answered 200, and the screen was blank.
 *
 * ⚠️ AND A FLOW OFFERS TWO, NOT ONE. The write is what it walks toward; the fill
 * is what runs before anybody is asked, and it is an operation like any other —
 * the browser needs its input to send the pictures, and its `ref` choices for the
 * same reason a form does.
 */
const opsOf = (screen: ScreenSpec): readonly string[] => [
  ...(screen.body ? actsIn(screen.body) : []),
  ...(screen.story ? [screen.story.writes] : []),
  ...(screen.story?.fills ? [screen.story.fills.by] : []),
];

const choosesIn = (
  app: AppSpec, screen: ScreenSpec,
): readonly { readonly op: string; readonly field: string; readonly to: string }[] => {
  const out: { op: string; field: string; to: string }[] = [];
  for (const id of opsOf(screen)) {
    const spec = (app.operations ?? []).find((o) => o.id === id);
    for (const [field, f] of Object.entries(spec?.input ?? {})) {
      if (f.kind === "ref" && f.to) out.push({ op: id, field, to: f.to });
    }
  }
  return out;
};

export const collectionsFor = (app: AppSpec, screen: ScreenSpec): readonly string[] => {
  const ids = new Set<string>();
  if (screen.of) ids.add(screen.of);
  const reads = screen.body ? viewsIn(screen.body) : [];
  for (const id of reads) {
    const view = (app.views ?? []).find((v) => v.id === id);
    if (!view) continue;
    ids.add(view.of);
    /* ⚠️ AND WHAT THE VIEW COUNTS UP. A `tally` reads another collection's rows
       to answer "how many point at this" — a number is less than a name and it
       is still an answer about rows somebody may not be allowed to see. */
    for (const t of view.tally ?? []) ids.add(t.of);
  }
  const { subject, byView } = reachesFor(app, screen);
  for (const reach of [...subject, ...Object.values(byView).flat()]) ids.add(reach.to);
  /* ⚠️ AND WHAT A PICKER OFFERS, WHICH IS ROWS LIKE ANY OTHER — see
     `Act.choices`. A form listing every location by name is a read of the
     location collection, whatever it is drawn as; leaving it out would hand a
     caller with no `location:read` the whole map of the building through a
     dropdown. Same leak as an uncounted hop, one control over. */
  for (const one of choosesIn(app, screen)) ids.add(one.to);
  /* ⚠️ AND WHAT A NARROWING OFFERS, for the same reason — see `PickSpec`. A
     control listing every location by name is a read of the location collection
     whether it is a filter or a form field. */
  for (const one of screen.body?.picks ?? []) if (one.of) ids.add(one.of);
  return [...ids];
};

/**
 * WHAT THIS SCREEN'S BODY IS DRAWN AGAINST, OR WHAT IT NEEDS AND THE CALLER
 * DOES NOT HOLD.
 *
 * ⚠️ THE FIRST MISSING PERMISSION IS THE ONE REPORTED, and the answer is a
 * refusal rather than a shorter list of views. Serving the views a caller MAY
 * read and silently dropping the rest draws a screen with a region missing —
 * which reads as a workspace with no suppliers rather than as an account that
 * cannot see them, and is the worse of the two by a distance.
 */
export async function drawnFor(
  db: Db, app: AppSpec, screen: ScreenSpec, scope: string,
  holds: (permission: string) => boolean,
  record: string | null = null,
  me: string | null = null,
  /**
   * ⚠️ THE DEVICE'S CALENDAR DAY, SENT RATHER THAN TAKEN — see `Here`. Absent, an
   * asked view that fills it simply does not send it, and the operation refuses
   * for want of a required input. That is the right failure: a worker guessing
   * the day would answer confidently and wrongly for half the planet.
   */
  today: string | null = null,
  /** ⚠️ How an asked view is answered, supplied by the door — see `Ask`. */
  ask?: Ask,
  /** ⚠️ What somebody narrowed the screen to, by pick id — see `PickSpec`. */
  picked: Readonly<Record<string, string>> = {},
): Promise<Drawn | Refused> {
  /*
    ⚠️ `permissionFor`, NOT `spec.permission`. A collection declares a PREFIX —
    `note` — and the grant a reader actually holds is `note:read`, which the
    kernel derives for every generated verb. Comparing the prefix asks for a
    permission nobody is ever granted, so the door refuses everyone; spelling
    `${spec.permission}:read` here instead would be a second copy of a rule the
    kernel already owns, and the two drift the day a verb is added.
  */
  for (const id of collectionsFor(app, screen)) {
    const spec = (app.collections ?? []).find((c) => c.id === id);
    if (!spec) continue;
    const needs = permissionFor(spec, "read");
    if (!holds(needs)) return { needs };
  }

  const reads = screen.body ? viewsIn(screen.body) : [];
  const here = {
    record: record ?? undefined, me: me ?? undefined, today: today ?? undefined, picked,
  };

  const of = (app.collections ?? []).find((c) => c.id === screen.of);
  const { subject: mine, byView: reaching } = reachesFor(app, screen);

  /* ⚠️ THE RECORD AND THE VIEWS TOGETHER. Neither is an input to the other —
     `here` is the id, which the caller already had — and taken in sequence this
     charges every detail screen an extra hop in front of its own blocks. The
     subject's own hop is INSIDE this arm rather than after it, so a detail
     screen still waits once rather than twice. */
  /* ⚠️ ONE STATEMENT PER COLLECTION, NOT PER FIELD. Two `ref` inputs pointing at
     the same collection are one dropdown's worth of rows asked for twice — and
     `stock.move` has exactly that shape, taking a shelf to leave and a shelf to
     arrive at. */
  const chooses = choosesIn(app, screen);
  /* ⚠️ A NARROWING OVER ROWS IS THE SAME QUERY AN ACT'S PICKER RUNS, so it joins
     the same deduplicated list — a screen offering "which shelf" as a filter and
     as an input to a write asks for the shelves once. */
  const narrowing = (screen.body?.picks ?? []).flatMap((p) => (p.of ? [p] : []));
  const wanted = [...new Set([...chooses.map((one) => one.to), ...narrowing.map((p) => p.of!)])];

  const [held, views, fetched] = await Promise.all([
    (async () => {
      if (!of || !record) return null;
      const one = await readOne(db, of, scope, record);
      if (!one || !mine.length) return one;
      const [joined] = await joinRows(db, [one], mine, app.collections ?? [], scope);
      return joined ?? one;
    })(),
    runViews(db, app, reads, scope, here, reaching, ask),
    Promise.all(wanted.map(async (id) => [id, await choicesOf(db, app, id, scope)] as const)),
  ]);
  const byCollection = new Map(fetched);

  /* ⚠️ ONLY WHAT THE BODY NAMES, and an id the app does not declare is dropped
     rather than sent as a stub — `refuseSurface` refuses one at composition, so
     an unknown here is a manifest that never composed. */
  const acts: Record<string, Act> = {};
  const fills = screen.body ? fillsIn(screen.body) : {};
  for (const id of opsOf(screen)) {
    const spec = (app.operations ?? []).find((o) => o.id === id);
    if (!spec) continue;
    const choices: Record<string, readonly Choice[]> = {};
    for (const one of chooses) {
      if (one.op !== id) continue;
      /* ⚠️ AN EMPTY LIST IS LEFT OUT RATHER THAN SENT, so the form draws a plain
         field for a collection with nothing in it yet — a dropdown with no
         options is a control that looks broken, and the honest state of "there
         are no shelves" is a question the person cannot answer here. */
      const rows = byCollection.get(one.to);
      if (rows?.length) choices[one.field] = rows;
    }
    acts[id] = { summary: spec.summary, input: spec.input, fills: fills[id] ?? {}, choices };
  }

  const picks: Record<string, readonly Choice[]> = {};
  for (const one of narrowing) {
    const rows = byCollection.get(one.of!);
    if (rows?.length) picks[one.id] = rows;
  }

  /*
    ⚠️ THE FIELDS THE BODY OFFERS TO CHANGE, AND ONLY IF THEY MAY — see
    `Drawn.edits`. The write behind every one of them is the generated
    `<collection>.update`, so the grant asked for here is the one the door will
    ask for when the sheet saves: a screen drawing a pencil somebody's role
    cannot follow through is a promise broken a whole sheet after it is made.

    ⚠️ AND A FIELD THE COLLECTION HAS NOT GOT IS DROPPED RATHER THAN SENT AS A
    STUB. `refuseSurface` refuses one at composition, so an unknown here is a
    manifest that never composed.
  */
  const edits: Record<string, FieldSpec> = {};
  if (of && screen.body && holds(permissionFor(of, "update"))) {
    for (const name of editsIn(screen.body)) {
      const one = of.fields[name];
      if (one) edits[name] = one;
    }
  }

  /*
    ⚠️ THE ONE RESOLVER, ASKED ONCE — see `namesIn` and `Drawn.name`. The trash
    listed a note by its title while the sheet asking to delete it printed an
    identifier, because one guessed and the other read the declaration; asking
    here and handing the answer to both is what stops a third caller re-deriving
    it slightly differently.
  */
  const names = of && held ? namesIn(of) : null;
  const name = names && held
    ? String(held[names] ?? "") || String(held["id"] ?? "") || null
    : held
      ? String(held["id"] ?? "") || null
      : null;

  /*
    ⚠️ THE TWO WAYS A RECORD LEAVES, ANSWERED ONCE PER SCREEN — see
    `Drawn.aside`. Both go through `<collection>:write`, which is the same grant
    the generated update asks for: putting a record out of the way is a change to
    it, not a fifth kind of thing to be granted.
  */
  const aside: Aside | null = of && held && holds(permissionFor(of, "update"))
    ? {
      of: of.label.one,
      name: name ?? String(held["id"] ?? ""),
      bin: operationsFor(of).includes(verbId(of.id, "delete")),
      already: held["aside"] === "frozen" || held["aside"] === "binned"
        ? held["aside"]
        : null,
    }
    : null;

  return { record: held ?? null, views, acts, picks, edits, name, aside };
}

/**
 * ⚠️ THE ROWS A PICKER OFFERS — id and the field the collection says names one.
 *
 * ⚠️ TWO COLUMNS, NOT `SELECT *`. A form needs a label and a value; sending the
 * whole row would put every column of every option on the wire, and on a
 * collection carrying prose or a vault-backed field it would put them in front
 * of somebody who only opened a dropdown.
 *
 * ⚠️ AND A COLLECTION THAT NAMES NO FIELD FALLS BACK TO ITS IDENTIFIER — see
 * `CollectionSpec.names`. That is the honest thing to show for a row with no
 * name, and it is visibly wrong in a way a guess assembled out of columns is
 * not, so it gets fixed rather than lived with.
 */
const choicesOf = async (
  db: Db, app: AppSpec, id: string, scope: string,
): Promise<readonly Choice[]> => {
  const spec = (app.collections ?? []).find((c) => c.id === id);
  if (!spec) return [];
  const erase = eraseBy(spec);
  /* ⚠️ THE DECLARATION ONLY, AND `namesIn`'s GUESS IS DELIBERATELY NOT TAKEN —
     see its header. These rows are a CHOICE BETWEEN similar things, so a guessed
     field that is not unique draws two options reading identically. */
  const named = spec.names && spec.names in spec.fields ? spec.names : null;
  const rows = await db.prepare(
    `SELECT id${named ? `, ${column(named)} AS said` : ""} FROM ${table(spec.id)}`
    + `${erase ? ` WHERE ${column(erase.column)} = ?` : ""}`
    + ` ORDER BY ${named ? `${column(named)} ASC, ` : ""}id ASC LIMIT ?`)
    .bind(...(erase ? [scope] : []), CHOICES_MOST)
    .all<{ id: string; said?: string | null }>();
  return rows.results.map((row) => ({
    id: String(row.id), label: String(row.said ?? row.id),
  }));
};
