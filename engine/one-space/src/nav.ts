/**
 * THE ONE ROUTER ON THE PAGE.
 *
 * ⚠️ THE SPACE IS A ROUTE OVER A PRODUCT, SO THEY CANNOT EACH OWN HISTORY. Both
 * used to: the product listened for `popstate` and OneSpace pushed — and a push
 * fires no `popstate`, so opening OneSpace moved the address bar under a product
 * that never heard about it, while going back moved both at once. One hook
 * holds the location and hands it to both, which is the only arrangement where
 * the phone's back gesture means one thing.
 *
 * ⚠️ AND WHAT IS UNDERNEATH DOES NOT MOVE WHILE THE SPACE IS OPEN. `beneath`
 * remembers the last address that was not OneSpace's, so dismissing returns
 * somebody to the screen they were on rather than to a product's front page.
 *
 * ⚠️ IT IS ALSO WHERE A TRANSITION'S DIRECTION COMES FROM, AND IT HAS TO BE.
 * Which way somebody is travelling is a fact about the two addresses and about
 * the browser's own history — neither of which a screen can see — so a screen
 * that declared its own would be a screen that could declare the wrong one, and
 * twenty of them would eventually disagree. `travel()` takes the way and reads
 * the rest off the DOM; between them no surface in the product has to know that
 * transitions exist. See `@engine/design`'s `travel.ts`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { travel, type Way } from "@engine/design";
import { inSpace } from "./space/where.js";

/**
 * TAKE A ONE-TIME SECRET OUT OF THE ADDRESS, ONCE.
 *
 * ⚠️ IT IS HERE BECAUSE THE ADDRESS IS THIS MODULE'S, and that is the guard's
 * own argument rather than a rule being satisfied. A screen that rewrites the
 * location is a screen the router does not know has moved — and this one has to
 * rewrite it, because the alternative is a single-use token for somebody's whole
 * record left sitting in history, in a bookmark and in the next screenshot.
 *
 * ⚠️ AND IT IS `replaceState`, NEVER A TRAVEL. Nothing is being navigated to:
 * the same screen stays on the same address with one parameter gone, so a
 * transition would animate a move that did not happen and a new entry would put
 * the secret back on the next press of Back.
 */
export function claimFromUrl(name: string): string | null {
  const here = new URL(location.href);
  const value = here.searchParams.get(name);
  if (!value) return null;
  here.searchParams.delete(name);
  history.replaceState(history.state, "", here.toString());
  return value;
}

export interface Travel {
  readonly path: string;
  /** Where the page under OneSpace is — never a OneSpace address. */
  readonly beneath: string;
  readonly go: (path: string, way?: Way) => void;
}

/** ⚠️ Trailing slashes removed, or `/space/` and `/space` are two places. */
const tidy = (path: string): string => path.replace(/\/+$/, "") || "/";

/**
 * WHICH WAY THIS IS, FROM THE TWO ADDRESSES.
 *
 * ⚠️ ANCESTRY FIRST, DEPTH SECOND, AND NEITHER IS A GUESS. Going to something
 * the current address is inside of is going UP — which is exactly what the
 * crown's back arrow does, and it is a `pushState` like any other, so nothing
 * about the history stack distinguishes it. Going to something inside the
 * current address is going DOWN.
 *
 * ⚠️ AND A SIBLING IS LATERAL, WHICH IS THE MOVE THIS PRODUCT IS MADE OF. Two
 * addresses under one parent are the five destinations in the bar, or two
 * records in one collection — somewhere somebody goes and comes back from all
 * day. It answered "forward", so every tap on the bar ran a view transition
 * paced for a hierarchical push: `DURATION.page`, during which the tree is
 * already the new screen while the browser shows a picture of the old one. See
 * `Way`.
 *
 * ⚠️ SHALLOWER-BUT-UNRELATED IS THE ONE GENUINELY AMBIGUOUS CASE and it is
 * answered as back, because in this product it is always a jump out of an area.
 */
export const wayTo = (from: string, to: string): Way => {
  const a = tidy(from);
  const b = tidy(to);
  if (a === b) return "lateral";
  if (a.startsWith(`${b}/`)) return "back";
  if (b.startsWith(`${a}/`)) return "forward";

  /* ⚠️ THE SAME PARENT, NOT MERELY THE SAME DEPTH. `/inventory/stock` and
     `/settings/plan` are both two deep and are not siblings — that is a jump
     between areas, and giving it a tab switch's silence would lose the one
     move in the product that genuinely changes place. */
  const up = (p: string) => p.slice(0, p.lastIndexOf("/"));
  const parts = (p: string) => p.split("/").filter(Boolean).length;
  if (parts(a) === parts(b) && up(a) === up(b)) return "lateral";

  return parts(b) < parts(a) ? "back" : "forward";
};

/**
 * ⚠️ THE HISTORY POSITION, KEPT IN THE ENTRY ITSELF. A `popstate` says the
 * address changed and never says which way — so without a number in the entry,
 * the phone's back gesture and the browser's forward button are the same event,
 * and one of the two would always animate backwards. `history.state` is the only
 * place a value survives a reload and a restored tab, which is what makes this a
 * fact rather than a counter that resets under somebody.
 */
interface Step { readonly n: number }
const stepOf = (): number => {
  const held = history.state as Step | null;
  return typeof held?.n === "number" ? held.n : 0;
};

export function useTravel(): Travel {
  const [path, setPath] = useState(() => location.pathname);
  const kept = useRef(inSpace(path) ? "/" : path);
  if (!inSpace(path)) kept.current = path;
  /* ⚠️ Stamped on the entry the tab OPENED on, too — otherwise the first push
     is step 1 above an entry with no number, and going back to it reads as a
     forward move. `replaceState` because there is nothing to add. */
  const at = useRef(0);
  if (at.current === 0) {
    at.current = stepOf();
    if (!(history.state as Step | null)?.n) {
      history.replaceState({ n: at.current } satisfies Step, "");
    }
  }

  /* ⚠️ WHERE THE TAB IS, READABLE FROM A LISTENER REGISTERED ONCE. `read` is
     installed on mount and must not be re-installed per address — a listener
     that is removed and added on every navigation misses the event that arrives
     between the two. */
  const now = useRef(path);
  now.current = path;

  useEffect(() => {
    const read = () => {
      const to = stepOf();
      /* ⚠️ THE ADDRESSES DECIDE LATERALITY; THE STEP NUMBER DECIDES DIRECTION.
         Only the history entry knows whether this was back or forward, and only
         the two paths know whether there is a level between them — so a back
         gesture between two siblings is as instant as pressing the bar, and
         leaving a record still travels. Answered from the step alone, the same
         move was silent one way and animated the other. */
      const way: Way = wayTo(now.current, location.pathname) === "lateral"
        ? "lateral"
        : to < at.current ? "back" : "forward";
      at.current = to;
      travel(way, () => setPath(location.pathname));
    };
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  /* ⚠️ Pushed rather than replaced, so back goes up one level rather than out
     of the surface — OneSpace's own depth IS browser history. */
  /* ⚠️ A CALLER MAY SAY WHICH WAY, AND ONE DOES. Whether a move is between
     DESTINATIONS is a fact about the manifest — `nav: "primary"` — not about the
     two addresses, and the bar is the only thing holding both. Everything else
     leaves it out and gets the answer the paths give. */
  const go = useCallback((next: string, said?: Way) => {
    if (next === location.pathname) return;
    const way = said ?? wayTo(location.pathname, next);
    at.current += 1;
    history.pushState({ n: at.current } satisfies Step, "", next);
    travel(way, () => setPath(next));
  }, []);

  return { path, beneath: kept.current, go };
}
