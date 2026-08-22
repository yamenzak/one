/**
 * WHERE IN A WORKSPACE SOMEBODY IS — a pure read of the path.
 *
 * ⚠️ A WORKSPACE'S OWN ADDRESS IS THE PRODUCT, AND NOTHING ELSE. It used to be
 * five fixed areas in a permanent bottom bar — people, money, settings, trust —
 * with the products filed underneath them, so the thing somebody came here to
 * use was one level down from four things they visit twice a year. Those four
 * are OneSpace's now (`OneSpace/where.ts`), reached from anywhere, over anything.
 *
 * ⚠️ EVERY PATH RESOLVES TO SOMETHING. A path that resolves to nothing renders
 * a blank page, which is the same picture as a page that failed to load — so an
 * address nobody recognises lands where the person can see where they are.
 *
 * ⚠️ AND `/space` IS NOT PARSED HERE. It is reserved on every door, decided one
 * level up, so a product can never discover that one of its screens is
 * unreachable because the platform took the name.
 */

import { inSpace } from "../space/where.js";

export type Stop =
  /** No product open: the choice of which, or the reason there is none. */
  | { readonly kind: "choose" }
  | { readonly kind: "app"; readonly app: string; readonly route: string };

/**
 * ⚠️ ONE PRODUCT IS NOT A CHOICE. A workspace with a single app opens it — a
 * chooser with one card is a screen whose only content is a button.
 */
export function parseStop(path: string, apps: readonly string[]): Stop {
  const clean = path.replace(/\/+$/, "") || "/";
  const [, head, ...rest] = clean.split("/");

  /* ⚠️ Refused here as well as decided one level up. An app id that collided
     with OneSpace's prefix would make one of its screens unreachable, and its
     author would find out from somebody who could not open it. */
  if (head && !inSpace(clean) && apps.includes(head)) {
    return { kind: "app", app: head, route: `/${rest.join("/")}` };
  }
  if (clean === "/" && apps.length === 1 && apps[0]) {
    return { kind: "app", app: apps[0], route: "/" };
  }
  /* ⚠️ Never nothing — see the header. */
  return { kind: "choose" };
}

export const pathFor = (stop: Stop): string =>
  stop.kind === "choose" ? "/" : routeIn(stop.app, stop.route);

/**
 * A PRODUCT'S OWN ROUTE, AS AN ADDRESS IN THE WORKSPACE.
 *
 * ⚠️ THE PREFIX IS THE PLATFORM'S AND AN APP MUST NEVER WRITE IT. A screen that
 * says `/inventory/thing` has learned where the centre mounted it, and the day
 * products are addressed differently every list in every app opens a page that
 * does not exist. `AppScreen.go` takes the app's own route and this adds the
 * rest.
 *
 * ⚠️ AND THE ROOT IS THE APP ITSELF, NEVER `/<app>/`. A trailing slash is a
 * different string to `parseStop` and to every router — so the one route every
 * app has is the one most likely to be got wrong, which is why this expression
 * is a function rather than three copies. It was already two: the nav built its
 * destinations with it and the surface built `go` with it, character for
 * character, on either side of a file boundary.
 */
export const routeIn = (appId: string, route: string): string =>
  `/${appId}${route === "/" ? "" : route}`;

/**
 * WHAT THE SHELL NEEDS TO FIND THE SCREEN IT IS DRAWING — both halves, from one
 * call.
 *
 * ⚠️ THE SCREENS AND THE ADDRESS ARE ONE ANSWER, AND ASSEMBLED SEPARATELY THEY
 * CAME APART. A product's screens are rewritten into the workspace's addressing
 * — home becomes `/<app>` — and the shell was handed the browser's own path,
 * which at the single-product root is `/`. Nothing matched: `screenFor` answered
 * undefined, so the screen the page was DRAWING had no title, no nav row, no
 * foot and no sky, and the world fell through to the product's default ground.
 *
 * ⚠️ IT ONLY BROKE AT THE ROOT, WHICH IS THE ADDRESS EVERY PERSON WITH ONE
 * PRODUCT LANDS ON. Every other path is its own answer — `/beacon/plans` parses
 * and writes back identically — so the product looked correct the moment anybody
 * navigated anywhere, and the one screen nobody navigates TO was the one that
 * was wrong.
 *
 * ⚠️ SO IT IS A SHAPE RATHER THAN A RULE TO REMEMBER. Two expressions that have
 * to agree, written at one call site, agree until somebody edits one of them;
 * returning the pair from the function that owns the addressing means a caller
 * cannot hand the shell a `here` its own screens are not in.
 */
export const shellAt = <T extends { readonly route: string }>(
  stop: Extract<Stop, { kind: "app" }>, screens: readonly T[],
): { readonly screens: readonly T[]; readonly here: string } => ({
  screens: screens.map((s) => ({ ...s, route: routeIn(stop.app, s.route) })),
  here: pathFor(stop),
});
