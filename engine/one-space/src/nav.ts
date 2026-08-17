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
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { inSpace } from "./space/where.js";

export interface Travel {
  readonly path: string;
  /** Where the page under OneSpace is — never a OneSpace address. */
  readonly beneath: string;
  readonly go: (path: string) => void;
}

export function useTravel(): Travel {
  const [path, setPath] = useState(() => location.pathname);
  const kept = useRef(inSpace(path) ? "/" : path);
  if (!inSpace(path)) kept.current = path;

  useEffect(() => {
    const read = () => setPath(location.pathname);
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  /* ⚠️ Pushed rather than replaced, so back goes up one level rather than out
     of the surface — OneSpace's own depth IS browser history. */
  const go = useCallback((next: string) => {
    if (next === location.pathname) return;
    history.pushState(null, "", next);
    setPath(next);
  }, []);

  return { path, beneath: kept.current, go };
}
