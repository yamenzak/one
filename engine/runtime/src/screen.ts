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

import type { AppSpec, Fields, Reach, ScreenSpec } from "@engine/kernel";
import {
  SCREEN_PATH, actsIn, columnsIn, fieldsIn, permissionFor, reachFor, viewsIn,
} from "@engine/kernel";
import { joinRows } from "./joined.js";
import { readOne } from "./records.js";
import { runViews, type Viewed } from "./views.js";
import { type Db } from "./sql.js";

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
}

export interface Act {
  readonly summary: string;
  readonly input: Fields;
}

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
 * ⚠️ EVERY COLLECTION THE SCREEN TOUCHES, WHICH IS ITS OWN, ITS VIEWS' AND
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
  const here = { record: record ?? undefined, me: me ?? undefined };

  const of = (app.collections ?? []).find((c) => c.id === screen.of);
  const { subject: mine, byView: reaching } = reachesFor(app, screen);

  /* ⚠️ THE RECORD AND THE VIEWS TOGETHER. Neither is an input to the other —
     `here` is the id, which the caller already had — and taken in sequence this
     charges every detail screen an extra hop in front of its own blocks. The
     subject's own hop is INSIDE this arm rather than after it, so a detail
     screen still waits once rather than twice. */
  const [held, views] = await Promise.all([
    (async () => {
      if (!of || !record) return null;
      const one = await readOne(db, of, scope, record);
      if (!one || !mine.length) return one;
      const [joined] = await joinRows(db, [one], mine, app.collections ?? [], scope);
      return joined ?? one;
    })(),
    runViews(db, app, reads, scope, here, reaching),
  ]);

  /* ⚠️ ONLY WHAT THE BODY NAMES, and an id the app does not declare is dropped
     rather than sent as a stub — `refuseSurface` refuses one at composition, so
     an unknown here is a manifest that never composed. */
  const acts: Record<string, Act> = {};
  for (const id of screen.body ? actsIn(screen.body) : []) {
    const spec = (app.operations ?? []).find((o) => o.id === id);
    if (spec) acts[id] = { summary: spec.summary, input: spec.input };
  }

  return { record: held ?? null, views, acts };
}
