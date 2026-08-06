import * as React from "react";

/** A breadcrumb hop. `to` makes it a link (navigated via the shell handler). */
export type Crumb = { label: string; to?: string };

/** A sub-item of a dropdown-style page action. */
export type PageActionItem = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "destructive";
};

/** A page-level action injected into the shell top bar. Renders inline on wide
 *  screens and collapses to a ⋮ menu on narrow ones. `items` makes it a
 *  dropdown; `overflow: "always"` keeps it in the ⋮ menu even when there's room
 *  (e.g. destructive actions like Delete). */
export type PageAction = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "outline" | "ghost" | "secondary" | "destructive";
  disabled?: boolean;
  items?: PageActionItem[];
  overflow?: "auto" | "always";
};

export type Chrome = { crumbs: Crumb[]; actions: PageAction[] };

const ChromeCtx = React.createContext<{
  chrome: Chrome;
  setChrome: React.Dispatch<React.SetStateAction<Chrome>>;
} | null>(null);

export function PageChromeProvider({ children }: { children: React.ReactNode }) {
  const [chrome, setChrome] = React.useState<Chrome>({ crumbs: [], actions: [] });
  const value = React.useMemo(() => ({ chrome, setChrome }), [chrome]);
  return <ChromeCtx.Provider value={value}>{children}</ChromeCtx.Provider>;
}

export function useChrome(): Chrome {
  return React.useContext(ChromeCtx)?.chrome ?? { crumbs: [], actions: [] };
}

/**
 * Pages call this to publish their breadcrumbs + top-bar actions. Pass the deps
 * that should re-publish it (e.g. `[]` for static, `[name]` for a dynamic
 * crumb). Cleared automatically on unmount / route change.
 */
export function usePageChrome(chrome: { crumbs?: Crumb[]; actions?: PageAction[] }, deps: React.DependencyList): void {
  const ctx = React.useContext(ChromeCtx);
  const set = ctx?.setChrome;
  React.useEffect(() => {
    if (!set) return;
    set({ crumbs: chrome.crumbs ?? [], actions: chrome.actions ?? [] });
    return () => set({ crumbs: [], actions: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
