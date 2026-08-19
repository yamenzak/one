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

export interface Travel {
  readonly path: string;
  /** Where the page under OneSpace is — never a OneSpace address. */
  readonly beneath: string;
  readonly go: (path: string) => void;
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
 * ⚠️ AND A SIBLING TRAVELS FORWARD. Moving between two screens at the same depth
 * is somebody choosing to go somewhere, not somebody retreating; the only thing
 * that reads as backward is leaving a level, which the first two tests already
 * caught. Shallower-but-unrelated is the one genuinely ambiguous case and it is
 * answered as back, because in this product it is always a jump out of an area.
 */
export const wayTo = (from: string, to: string): Way => {
  const a = tidy(from);
  const b = tidy(to);
  if (a === b) return "forward";
  if (a.startsWith(`${b}/`)) return "back";
  if (b.startsWith(`${a}/`)) return "forward";
  const depth = (p: string) => p.split("/").filter(Boolean).length;
  return depth(b) < depth(a) ? "back" : "forward";
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

  useEffect(() => {
    const read = () => {
      const to = stepOf();
      const way: Way = to < at.current ? "back" : "forward";
      at.current = to;
      travel(way, () => setPath(location.pathname));
    };
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  /* ⚠️ Pushed rather than replaced, so back goes up one level rather than out
     of the surface — OneSpace's own depth IS browser history. */
  const go = useCallback((next: string) => {
    if (next === location.pathname) return;
    const way = wayTo(location.pathname, next);
    at.current += 1;
    history.pushState({ n: at.current } satisfies Step, "", next);
    travel(way, () => setPath(next));
  }, []);

  return { path, beneath: kept.current, go };
}
