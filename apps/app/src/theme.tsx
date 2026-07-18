/**
 * ThemeProvider — applies the active tenant's branding + the user's mode to the
 * document root, and re-applies whenever the tenant/branding changes. Exposes a
 * hook to toggle mode + preview a brand preset (used by the branding editor).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  /** Wash each page's hero area in its section's domain token (persisted). */
  ambient: boolean;
  setAmbient: (v: boolean) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

const TINTED_NAV_KEY = "mossa:tintedNav";
const AMBIENT_KEY = "mossa:ambient";
const readBool = (key: string, dflt: boolean): boolean => {
  if (typeof localStorage === "undefined") return dflt;
  const v = localStorage.getItem(key);
  return v === null ? dflt : v !== "0";
};
const writeBool = (key: string, v: boolean) => { try { localStorage.setItem(key, v ? "1" : "0"); } catch { /* private mode */ } };

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { ctx, host } = useSession();
  // Signed-in tenant branding wins; before sign-in on a custom domain, fall
  // back to that domain's tenant so the login screen is already branded.
  const branding = ((ctx?.branding ?? host?.tenant?.branding) ?? null) as Branding | null;
  const [mode, setMode] = useState<ThemeMode>(() => resolveMode(branding?.defaultMode));
  // Track whether the user has explicitly picked a mode this session — a manual
  // toggle must win over the tenant's default even after branding resolves.
  const userChoseMode = useRef(false);

  // Apply the tenant branding whenever it changes.
  useEffect(() => {
    applyBranding(branding);
  }, [branding]);

  // Branding often lands after first paint (it flows through /api/context). Once
  // the tenant's defaultMode is available, sync to it — unless the user has
  // already toggled the mode themselves, in which case their choice stands.
  useEffect(() => {
    if (userChoseMode.current || !branding?.defaultMode) return;
    setMode(resolveMode(branding.defaultMode));
  }, [branding?.defaultMode]);

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

  const [tintedNav, setTintedNavState] = useState<boolean>(() => readBool(TINTED_NAV_KEY, true));
  const setTintedNav = useCallback((v: boolean) => { setTintedNavState(v); writeBool(TINTED_NAV_KEY, v); }, []);
  const [ambient, setAmbientState] = useState<boolean>(() => readBool(AMBIENT_KEY, true));
  const setAmbient = useCallback((v: boolean) => { setAmbientState(v); writeBool(AMBIENT_KEY, v); }, []);

  const toggleMode = useCallback(() => { userChoseMode.current = true; setMode((m) => (m === "dark" ? "light" : "dark")); }, []);
  const preview = useCallback((b: Branding | null) => applyBranding(b ?? branding), [branding]);

  const value = useMemo(() => ({ mode, toggleMode, preview, tintedNav, setTintedNav, ambient, setAmbient }), [mode, toggleMode, preview, tintedNav, setTintedNav, ambient, setAmbient]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme outside provider");
  return c;
}
