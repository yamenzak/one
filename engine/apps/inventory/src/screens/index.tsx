/**
 * THE BOARD — every screen this app draws itself, over a sample world.
 *
 * ⚠️ EMPTY, BECAUSE THE SURFACE IS BEING REWRITTEN. See `live.tsx`'s header for
 * the argument; this file is the same screens with a sample world behind them
 * instead of a workspace's records, so it empties and refills with that one.
 *
 * ⚠️ AND IT PHOTOGRAPHED THE WRONG THING, WHICH IS WHY THE ROUTE LIST IS GONE
 * RATHER THAN EMPTIED. `INVENTORY_ROUTES` came from the manifest and every
 * measured suite walked it — so the moment a screen was ported to a declared
 * body, the suites went on rendering the hand-written file of the same name
 * while the product drew the declaration. Eighty-four photographs were taken of
 * screens no customer could open, filed under the ids of the ones they could,
 * and every suite reported green. A screenshot of the previous design under the
 * current name is worse than no screenshot: one is a gap somebody fills and the
 * other is evidence somebody trusts.
 *
 * ⚠️ SO WHAT A SUITE WALKS IS WHAT THE PRODUCT DRAWS. A body and a story are
 * drawn by the engine and are photographed THERE, through the renderer, from the
 * declaration — which is the only way the image is of the screen rather than of
 * a file that shares its name. What belongs on this board is the sessions, and
 * only the sessions, because a session is the one kind that genuinely draws
 * itself. The list below is empty and will refill with those.
 */

import { inventory } from "../index.js";

/**
 * EVERY ROUTE THIS PRODUCT DECLARES, FOR THE SUITES THAT SWEEP THEM.
 *
 * ⚠️ READ OFF THE MANIFEST, NEVER WRITTEN OUT. A hand-kept list is one a screen
 * can be added without joining — measured by nothing and photographed by nothing
 * — and the omission looks exactly like a screen that has not been built.
 *
 * ⚠️ AND IT IS HONEST AGAIN ONLY BECAUSE THE BOARD DRAWS DECLARATIONS. It was
 * deleted rather than emptied when the surface was, because every measured suite
 * walked it while the board handed each route to a hand-written file of the same
 * name — so the sweep reported on components the product no longer ran. The
 * ground renders the declared body through the renderer now, which is what makes
 * walking these routes a measurement of the screen.
 */
export const INVENTORY_ROUTES: readonly string[] =
  (inventory().screens ?? []).map((s) => s.route);

/**
 * THE SCREENS THIS APP DRAWS ITSELF, KEYED BY DECLARED ROUTE.
 *
 * ⚠️ SESSIONS ONLY — never a body, never a story. Anything the engine draws is
 * photographed through the engine; a second copy here is a second answer to what
 * that screen looks like, and the copy is the one that will be out of date.
 */
export const INVENTORY_SESSIONS: Readonly<Record<string, never>> = {};

/**
 * THE SURFACES THAT ARE NOT ROUTES, AND WHY THEY NEED A LIST OF THEIR OWN.
 *
 * ⚠️ A DRAWER IS NOT LESS OF A SURFACE FOR BEING REACHED FROM A ROW. Every
 * measured suite walks routes, so a tray is drawn by nothing, measured by
 * nothing and photographed by nothing — it renders correctly on the machine of
 * whoever wrote it and its first contact with a real viewport is a customer's.
 *
 * ⚠️ AND IT IS A LIST RATHER THAN A CASE PER SUITE, so adding the next one is
 * one entry and the suites need no edit.
 */
export const INVENTORY_SURFACES: readonly string[] = [];
