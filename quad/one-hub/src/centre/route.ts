/**
 * WHERE IN A WORKSPACE SOMEBODY IS — a pure read of the path.
 *
 * ⚠️ A WORKSPACE'S OWN ADDRESS IS THE PRODUCT, AND NOTHING ELSE. It used to be
 * five fixed areas in a permanent bottom bar — people, money, settings, trust —
 * with the products filed underneath them, so the thing somebody came here to
 * use was one level down from four things they visit twice a year. Those four
 * are the hub's now (`hub/where.ts`), reached from anywhere, over anything.
 *
 * ⚠️ EVERY PATH RESOLVES TO SOMETHING. A path that resolves to nothing renders
 * a blank page, which is the same picture as a page that failed to load — so an
 * address nobody recognises lands where the person can see where they are.
 *
 * ⚠️ AND `/hub` IS NOT PARSED HERE. It is reserved on every door, decided one
 * level up, so a product can never discover that one of its screens is
 * unreachable because the platform took the name.
 */

import { inHub } from "../hub/where.js";

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
     with the hub's prefix would make one of its screens unreachable, and its
     author would find out from somebody who could not open it. */
  if (head && !inHub(clean) && apps.includes(head)) {
    return { kind: "app", app: head, route: `/${rest.join("/")}` };
  }
  if (clean === "/" && apps.length === 1 && apps[0]) {
    return { kind: "app", app: apps[0], route: "/" };
  }
  /* ⚠️ Never nothing — see the header. */
  return { kind: "choose" };
}

export const pathFor = (stop: Stop): string =>
  stop.kind === "choose" ? "/" : `/${stop.app}${stop.route === "/" ? "" : stop.route}`;
