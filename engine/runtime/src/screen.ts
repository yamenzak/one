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

import type { AppSpec, ScreenSpec } from "@engine/kernel";
import { SCREEN_PATH, permissionFor, viewsIn } from "@engine/kernel";
import { readOne } from "./records.js";
import { runViews, type Viewed } from "./views.js";
import { type Db } from "./sql.js";

/* ⚠️ `SCREEN_PATH` IS THE KERNEL'S — see its header. The browser speaks it too,
   and a constant each end declares is two strings kept in step by nothing. */
export { SCREEN_PATH };

export interface Drawn {
  readonly record: Record<string, unknown> | null;
  readonly views: Readonly<Record<string, Viewed>>;
}

/** ⚠️ Refused rather than empty — see `Refused`. */
export interface Refused { readonly needs: string }

/**
 * ⚠️ EVERY COLLECTION THE SCREEN TOUCHES, WHICH IS ITS OWN AND ITS VIEWS'. The
 * subject's collection is in the list because a `detail` screen hands back the
 * record itself, and a record is rows too.
 */
export const collectionsFor = (app: AppSpec, screen: ScreenSpec): readonly string[] => {
  const ids = new Set<string>();
  if (screen.of) ids.add(screen.of);
  const reads = screen.body ? viewsIn(screen.body) : [];
  for (const id of reads) {
    const view = (app.views ?? []).find((v) => v.id === id);
    if (view) ids.add(view.of);
  }
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

  /* ⚠️ THE RECORD AND THE VIEWS TOGETHER. Neither is an input to the other —
     `here` is the id, which the caller already had — and taken in sequence this
     charges every detail screen an extra hop in front of its own blocks. */
  const [held, views] = await Promise.all([
    screen.of && record
      ? readOne(db, (app.collections ?? []).find((c) => c.id === screen.of)!, scope, record)
      : Promise.resolve(null),
    runViews(db, app, reads, scope, here),
  ]);

  return { record: held ?? null, views };
}
