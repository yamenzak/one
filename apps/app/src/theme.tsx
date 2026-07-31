/**
 * ThemeProvider — applies the active tenant's branding + the user's mode to the
 * document root, and re-applies whenever the tenant/branding changes. Exposes a
 * hook to toggle mode + preview a brand preset (used by the branding editor).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { applyBranding, applyMode, configureTheme, resolveMode, oklchStringToHex, type Branding, type ThemeMode } from "@4dl/ui";
import { useSession } from "./session.js";

/**
 * The two names `@4dl/ui` writes into the document and local storage.
 *
 * Bound at module load, BEFORE anything calls `resolveMode` — the provider
 * reads the stored mode in its initial state, so a `configureTheme` inside a
 * component would run too late and every user would see the default once.
 *
 * `kova-theme` is load-bearing: it is the key a user's light/dark choice
 * survives sign-out in (`KEEP_ON_SIGN_OUT` in session.tsx names it too), so
 * changing it would silently reset the preference for everyone.
 */
configureTheme({ storageKey: "kova-theme", styleId: "kova-branding" });

interface ThemeCtx {
  mode: ThemeMode;
  toggleMode: () => void;
  /** Live-preview a branding (no persistence) — for the editor. */
  preview: (b: Branding | null) => void;
  /** Tint the active nav tab by its section's domain token. From the STUDIO's
   *  branding — read-only here; the owner sets it in Studio → Branding. */
  tintedNav: boolean;
  /** Wash each page's hero area in its section's domain token. Studio branding. */
  ambient: boolean;
}

const Ctx = createContext<ThemeCtx | null>(null);

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

  // White-label the browser chrome from branding: favicon + apple-touch-icon
  // (the square app icon, falling back to the wordmark). The PWA manifest is
  // themed server-side per host; this covers the live tab + any origin (incl.
  // the platform host and /t/<slug>).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const undo: (() => void)[] = [];
    const icon = branding?.iconUrl || branding?.logoUrl;
    if (icon) {
      for (const rel of ["icon", "apple-touch-icon"]) {
        let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
        if (!link) { link = document.createElement("link"); link.rel = rel; document.head.appendChild(link); }
        const prev = link.getAttribute("href");
        const el = link;
        el.href = icon;
        undo.push(() => (prev ? el.setAttribute("href", prev) : el.remove()));
      }
    }
    return () => undo.forEach((f) => f());
  }, [branding]);

  // The theme-color meta (the brand primary) tints the mobile toolbar / installed
  // title bar — it must track the active MODE, since a brand's primary token can
  // differ between light and dark, so re-apply it whenever branding or mode change.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const rawPrimary = branding?.primary || branding?.tokens?.[mode]?.["--primary"] || branding?.tokens?.dark?.["--primary"];
    const hex = rawPrimary ? (rawPrimary.startsWith("#") ? rawPrimary : oklchStringToHex(rawPrimary)) : null;
    if (!hex) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) return;
    const prev = meta.getAttribute("content");
    meta.setAttribute("content", hex);
    return () => { if (prev) meta.setAttribute("content", prev); };
  }, [branding, mode]);

  // Apply mode.
  useEffect(() => {
    applyMode(mode);
  }, [mode]);

  // Studio-wide, straight off the tenant's branding. Both default ON, so a studio
  // that has never touched them looks exactly as it did when these were device
  // preferences — only now every member sees the same thing.
  const tintedNav = branding?.tintedNav ?? true;
  const ambient = branding?.ambient ?? true;

  const toggleMode = useCallback(() => { userChoseMode.current = true; setMode((m) => (m === "dark" ? "light" : "dark")); }, []);
  const preview = useCallback((b: Branding | null) => applyBranding(b ?? branding), [branding]);

  const value = useMemo(() => ({ mode, toggleMode, preview, tintedNav, ambient }), [mode, toggleMode, preview, tintedNav, ambient]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme outside provider");
  return c;
}
