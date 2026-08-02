/**
 * WHICH SECTION IS OPEN, IN THE URL — without importing a router.
 *
 * `AdminConsole` takes `openKey`/`onOpen` as props precisely so a shared package
 * never picks a router for its consumers. But "it takes props" is not a binding,
 * and the obvious binding is the wrong one:
 *
 *   const [open, setOpen] = useState<string | null>(null)
 *
 * That is what Tessa's console did. It compiles, it looks right, and it means
 * every section lives at the same address: Back leaves the console from three
 * levels deep, a section cannot be linked to or bookmarked, and a reload always
 * lands on the index. Kova bound the same shell to a query param and got all
 * three for free — so the difference between the two consoles was four lines
 * nobody wrote, which is exactly the kind of gap a shared package should close
 * by shipping the default rather than documenting it.
 *
 * ── Why the History API and not a router hook ───────────────────────────────
 *
 * A router hook would make this package depend on a router. The History API is
 * the platform, is present wherever React DOM is, and is what every router is
 * built on — so this works in an app with no router, and alongside any router.
 *
 * ⚠️ The `popstate` dispatch after `pushState` is load-bearing when a router IS
 * present. Routers subscribe to `popstate`, not to `pushState` (which fires no
 * event at all), so without it a router's `location` silently goes stale the
 * moment a section opens — the URL says one thing and `useLocation()` says
 * another. Dispatching it is how the two stay in step. Our own listener sees it
 * too and reads back the value it just wrote, so there is no loop.
 *
 * ── Open pushes, close replaces ─────────────────────────────────────────────
 *
 * Opening adds a history entry, so Back closes it. Closing REPLACES, so Back
 * does not bounce the operator straight back into what they just left. Same rule
 * Kova arrived at with react-router.
 */

import { useCallback, useEffect, useState } from "react";

/** Read the param out of the current URL. `""` and a missing key are both null. */
function read(param: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(param) || null;
}

/**
 * One query param, as state. The mechanism behind both the console's open
 * section and a panel's open sub-page — they differ only in which param.
 */
export function useUrlKey(param: string): [string | null, (key: string | null) => void] {
  const [value, setValue] = useState<string | null>(() => read(param));

  // Back and Forward. Without this the URL changes and the UI does not.
  useEffect(() => {
    const sync = () => setValue(read(param));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [param]);

  const set = useCallback(
    (key: string | null) => {
      const url = new URL(window.location.href);
      if (key) url.searchParams.set(param, key);
      else url.searchParams.delete(param);

      // Opening deepens the stack; closing rewrites the top of it.
      window.history[key ? "pushState" : "replaceState"]({}, "", url);
      // Keep any mounted router's idea of the location in step — see the header.
      window.dispatchEvent(new PopStateEvent("popstate"));
      setValue(key);
    },
    [param],
  );

  return [value, set];
}

/**
 * Bind a console's open section to `?<param>=<key>`.
 *
 * Returns exactly what `AdminConsole` wants:
 *
 *   const { openKey, onOpen } = useConsoleSection()
 *   <AdminConsole sections={SECTIONS} openKey={openKey} onOpen={onOpen} … />
 */
export function useConsoleSection(param = "s"): {
  openKey: string | null;
  onOpen: (key: string | null) => void;
} {
  const [openKey, onOpen] = useUrlKey(param);
  return { openKey, onOpen };
}
