/**
 * ThemeProvider — applies the active tenant's branding + the user's mode to the
 * document root, and re-applies whenever the tenant/branding changes. Exposes a
 * hook to toggle mode + preview a brand preset (used by the branding editor).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { applyBranding, applyMode, resolveMode, type Branding, type ThemeMode } from "@mossa/ui";
import { useSession } from "./session.js";

interface ThemeCtx {
  mode: ThemeMode;
  toggleMode: () => void;
  /** Live-preview a branding (no persistence) — for the editor. */
  preview: (b: Branding | null) => void;
  /** Tint the active nav tab by its section's domain token (persisted). */
  tintedNav: boolean;
  setTintedNav: (v: boolean) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

const TINTED_NAV_KEY = "mossa:tintedNav";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { ctx, host } = useSession();
  // Signed-in tenant branding wins; before sign-in on a custom domain, fall
  // back to that domain's tenant so the login screen is already branded.
  const branding = ((ctx?.branding ?? host?.tenant?.branding) ?? null) as Branding | null;
  const [mode, setMode] = useState<ThemeMode>(() => resolveMode(branding?.defaultMode));

  // Apply the tenant branding whenever it changes.
  useEffect(() => {
    applyBranding(branding);
  }, [branding]);

  // Point the browser-tab favicon at the tenant's app icon.
  useEffect(() => {
    if (typeof document === "undefined" || !branding?.iconUrl) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
    const prev = link.href;
    link.href = branding.iconUrl;
    return () => { if (link) link.href = prev; };
  }, [branding?.iconUrl]);

  // Apply mode.
  useEffect(() => {
    applyMode(mode);
  }, [mode]);

  const [tintedNav, setTintedNavState] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return true;
    return localStorage.getItem(TINTED_NAV_KEY) !== "0";
  });
  const setTintedNav = useCallback((v: boolean) => {
    setTintedNavState(v);
    try { localStorage.setItem(TINTED_NAV_KEY, v ? "1" : "0"); } catch { /* private mode */ }
  }, []);

  const toggleMode = useCallback(() => setMode((m) => (m === "dark" ? "light" : "dark")), []);
  const preview = useCallback((b: Branding | null) => applyBranding(b ?? branding), [branding]);

  const value = useMemo(() => ({ mode, toggleMode, preview, tintedNav, setTintedNav }), [mode, toggleMode, preview, tintedNav, setTintedNav]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme outside provider");
  return c;
}
